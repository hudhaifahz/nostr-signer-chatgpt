import { randomBytes, randomUUID } from "node:crypto";
import { decrypt as nip04Decrypt, encrypt as nip04Encrypt } from "nostr-tools/nip04";
import {
  decrypt as nip44Decrypt,
  encrypt as nip44Encrypt,
  getConversationKey,
} from "nostr-tools/nip44";
import { SimplePool } from "nostr-tools/pool";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { assertEventTemplate, assertSignedEvent } from "./events.js";
import { normalizeRelayUrls } from "./relays.js";
import type { SignerSession } from "./session.js";
import type { EventTemplate, SignedEvent } from "./types.js";

const NIP46_KIND = 24_133;
const MAX_RPC_BYTES = 100_000;

type RpcRequest = { id: string; method: string; params: string[] };
type RpcResponse = { id: string; result?: string; error?: string };

export type Nip46ClientRequestView = {
  requestId: string;
  clientPubkey: string;
  clientName: string | null;
  method:
    | "connect"
    | "sign_event"
    | "nip04_encrypt"
    | "nip04_decrypt"
    | "nip44_encrypt"
    | "nip44_decrypt";
  requestedPermissions: string[];
  event?: EventTemplate;
  thirdPartyPubkey?: string;
  plaintextBytes?: number;
  ciphertextBytes?: number;
};

export type Nip46ClientBridgeView = {
  state:
    | "idle"
    | "waiting_for_client"
    | "pairing_approval"
    | "connected"
    | "request_approval"
    | "expired"
    | "error";
  bunkerUrl?: string;
  remoteSignerPubkey?: string;
  clientPubkey?: string;
  clientName?: string | null;
  relays?: string[];
  expiresAt?: string;
  detail?: string;
};

export interface Nip46ServerTransport {
  subscribe(
    relays: string[],
    remoteSignerPubkey: string,
    onEvent: (event: SignedEvent) => void,
  ): { close(): void };
  publish(relays: string[], event: SignedEvent): Promise<void>;
  close(): void;
}

export class RelayNip46ServerTransport implements Nip46ServerTransport {
  constructor(
    private readonly pool = new SimplePool({ enablePing: true, enableReconnect: false }),
  ) {}

  subscribe(relays: string[], remoteSignerPubkey: string, onEvent: (event: SignedEvent) => void) {
    return this.pool.subscribe(
      relays,
      {
        kinds: [NIP46_KIND],
        "#p": [remoteSignerPubkey],
        since: Math.floor(Date.now() / 1_000) - 30,
        limit: 0,
      },
      {
        onevent: (event) => {
          try {
            assertSignedEvent(event);
            onEvent(event);
          } catch {
            // Ignore malformed or unverifiable relay traffic.
          }
        },
      },
    );
  }

  async publish(relays: string[], event: SignedEvent): Promise<void> {
    try {
      await Promise.any(this.pool.publish(relays, event, { maxWait: 10_000 }));
    } catch {
      throw new Error("Every NIP-46 relay rejected or timed out.");
    }
  }

  close(): void {
    this.pool.destroy();
  }
}

type RpcEncryption = "nip04" | "nip44";

type PendingRequest = {
  view: Nip46ClientRequestView;
  rpc: RpcRequest;
  clientPubkey: string;
  conversationKey: Uint8Array;
  encryption: RpcEncryption;
};

export class Nip46ClientBridge {
  private state: Nip46ClientBridgeView["state"] = "idle";
  private remoteSecretKey: Uint8Array | undefined;
  private remoteSignerPubkey: string | undefined;
  private secret: string | undefined;
  private relays: string[] = [];
  private expiresAtMs: number | undefined;
  private subscription: { close(): void } | undefined;
  private clientPubkey: string | undefined;
  private clientName: string | null = null;
  private permissions = new Set<string>();
  private pending: PendingRequest | undefined;
  private detail: string | undefined;
  private readonly seen = new Set<string>();

  constructor(
    private readonly session: SignerSession,
    private readonly transport: Nip46ServerTransport,
    private readonly now: () => number = () => Date.now(),
    private readonly ttlMs = 30 * 60_000,
  ) {}

  start(relayInputs: string[]): Nip46ClientBridgeView {
    this.session.getPublicKey();
    this.reset();
    this.relays = normalizeRelayUrls(relayInputs);
    this.remoteSecretKey = generateSecretKey();
    this.remoteSignerPubkey = getPublicKey(this.remoteSecretKey);
    this.secret = randomBytes(24).toString("base64url");
    this.expiresAtMs = this.now() + this.ttlMs;
    this.state = "waiting_for_client";
    this.subscription = this.transport.subscribe(
      this.relays,
      this.remoteSignerPubkey,
      (event) => void this.receive(event),
    );
    const query = new URLSearchParams();
    for (const relay of this.relays) query.append("relay", relay);
    query.set("secret", this.secret);
    return { ...this.view(), bunkerUrl: `bunker://${this.remoteSignerPubkey}?${query.toString()}` };
  }

  view(): Nip46ClientBridgeView {
    this.expireIfNeeded();
    return {
      state: this.state,
      ...(this.remoteSignerPubkey ? { remoteSignerPubkey: this.remoteSignerPubkey } : {}),
      ...(this.clientPubkey
        ? { clientPubkey: this.clientPubkey, clientName: this.clientName }
        : {}),
      ...(this.relays.length ? { relays: [...this.relays] } : {}),
      ...(this.expiresAtMs ? { expiresAt: new Date(this.expiresAtMs).toISOString() } : {}),
      ...(this.detail ? { detail: this.detail } : {}),
    };
  }

  next(): Nip46ClientRequestView | null {
    this.expireIfNeeded();
    return this.pending ? structuredClone(this.pending.view) : null;
  }

  async approve(requestId: string, confirmed: boolean): Promise<Nip46ClientBridgeView> {
    if (!confirmed) throw new Error("Explicit client-request approval is required.");
    const pending = this.pending;
    if (!pending || pending.view.requestId !== requestId)
      throw new Error("The client request is unknown or already completed.");
    this.pending = undefined;
    try {
      if (pending.rpc.method === "connect") {
        this.clientPubkey = pending.clientPubkey;
        this.clientName = pending.view.clientName;
        this.permissions = new Set(pending.view.requestedPermissions);
        await this.respond(
          pending.rpc.id,
          pending.conversationKey,
          pending.clientPubkey,
          this.secret as string,
          undefined,
          pending.encryption,
        );
        this.secret = undefined;
        this.state = "connected";
        return this.view();
      }
      let result: string;
      if (pending.rpc.method === "sign_event") {
        const event = pending.view.event as EventTemplate;
        const intent = this.session.prepare(event);
        const signed = await this.session.sign(intent.intentId, true);
        if (!signed.signedEvent) throw new Error("The signer did not return a verified event.");
        result = JSON.stringify(signed.signedEvent);
      } else if (pending.rpc.method === "nip04_encrypt") {
        result = await this.session.nip04Encrypt(
          pending.view.thirdPartyPubkey as string,
          pending.rpc.params[1] as string,
          true,
        );
      } else if (pending.rpc.method === "nip04_decrypt") {
        result = await this.session.nip04Decrypt(
          pending.view.thirdPartyPubkey as string,
          pending.rpc.params[1] as string,
          true,
        );
      } else if (pending.rpc.method === "nip44_encrypt") {
        result = await this.session.encrypt(
          pending.view.thirdPartyPubkey as string,
          pending.rpc.params[1] as string,
          true,
        );
      } else if (pending.rpc.method === "nip44_decrypt") {
        result = await this.session.decrypt(
          pending.view.thirdPartyPubkey as string,
          pending.rpc.params[1] as string,
          true,
        );
      } else {
        throw new Error("Unsupported NIP-46 request.");
      }
      await this.respond(
        pending.rpc.id,
        pending.conversationKey,
        pending.clientPubkey,
        result,
        undefined,
        pending.encryption,
      );
      this.state = "connected";
      return this.view();
    } catch (error) {
      await this.respond(
        pending.rpc.id,
        pending.conversationKey,
        pending.clientPubkey,
        undefined,
        "The signer rejected or could not complete this request.",
        pending.encryption,
      );
      this.state = "connected";
      throw error;
    }
  }

  async reject(requestId: string): Promise<Nip46ClientBridgeView> {
    const pending = this.pending;
    if (!pending || pending.view.requestId !== requestId)
      throw new Error("The client request is unknown or already completed.");
    this.pending = undefined;
    await this.respond(
      pending.rpc.id,
      pending.conversationKey,
      pending.clientPubkey,
      undefined,
      "Rejected by the user.",
      pending.encryption,
    );
    this.state = this.clientPubkey ? "connected" : "waiting_for_client";
    return this.view();
  }

  close(): void {
    this.reset();
    this.state = "idle";
  }

  destroy(): void {
    this.close();
    this.transport.close();
  }

  private async receive(event: SignedEvent): Promise<void> {
    const priorState = this.state;
    try {
      this.expireIfNeeded();
      if (!this.remoteSecretKey || !this.remoteSignerPubkey || this.state === "expired") return;
      if (this.seen.has(event.id)) return;
      this.seen.add(event.id);
      if (this.seen.size > 1_000) this.seen.delete(this.seen.values().next().value as string);
      if (Math.abs(Math.floor(this.now() / 1_000) - event.created_at) > 120) return;
      if (!event.tags.some((tag) => tag[0] === "p" && tag[1] === this.remoteSignerPubkey)) return;
      if (this.clientPubkey && event.pubkey !== this.clientPubkey) return;
      const conversationKey = getConversationKey(this.remoteSecretKey, event.pubkey);
      const decoded = this.decodeRpc(event.content, event.pubkey, conversationKey);
      const rpc = decoded.rpc;
      if (!this.clientPubkey) {
        if (
          rpc.method !== "connect" ||
          rpc.params[0] !== this.remoteSignerPubkey ||
          rpc.params[1] !== this.secret
        )
          return;
        const permissions = (rpc.params[2] ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 64);
        const metadata = this.parseMetadata(rpc.params[3]);
        this.pending = {
          rpc,
          clientPubkey: event.pubkey,
          conversationKey,
          encryption: decoded.encryption,
          view: {
            requestId: randomUUID(),
            clientPubkey: event.pubkey,
            clientName: metadata.name,
            method: "connect",
            requestedPermissions: permissions,
          },
        };
        this.state = "pairing_approval";
        return;
      }
      if (rpc.method === "ping")
        return void (await this.respond(
          rpc.id,
          conversationKey,
          event.pubkey,
          "pong",
          undefined,
          decoded.encryption,
        ));
      if (rpc.method === "get_public_key")
        return void (await this.respond(
          rpc.id,
          conversationKey,
          event.pubkey,
          this.session.getPublicKey(),
          undefined,
          decoded.encryption,
        ));
      if (rpc.method === "switch_relays")
        return void (await this.respond(
          rpc.id,
          conversationKey,
          event.pubkey,
          "null",
          undefined,
          decoded.encryption,
        ));
      if (rpc.method === "logout") {
        await this.respond(
          rpc.id,
          conversationKey,
          event.pubkey,
          "ack",
          undefined,
          decoded.encryption,
        );
        this.close();
        return;
      }
      if (this.pending)
        return void (await this.respond(
          rpc.id,
          conversationKey,
          event.pubkey,
          undefined,
          "Another request is awaiting approval.",
          decoded.encryption,
        ));
      const view = this.requestView(rpc, event.pubkey);
      this.pending = {
        rpc,
        clientPubkey: event.pubkey,
        conversationKey,
        encryption: decoded.encryption,
        view,
      };
      this.state = "request_approval";
    } catch {
      // Untrusted relays may deliver malformed, unsupported, or undecryptable traffic.
      // Ignore it without changing the visible state of a healthy connection.
      this.state = priorState;
    }
  }

  private requestView(rpc: RpcRequest, clientPubkey: string): Nip46ClientRequestView {
    if (rpc.method === "sign_event") {
      const event = JSON.parse(rpc.params[0] ?? "null") as unknown;
      assertEventTemplate(event);
      this.requirePermission("sign_event", event.kind);
      return {
        requestId: randomUUID(),
        clientPubkey,
        clientName: this.clientName,
        method: "sign_event",
        requestedPermissions: [...this.permissions],
        event,
      };
    }
    if (
      rpc.method === "nip04_encrypt" ||
      rpc.method === "nip04_decrypt" ||
      rpc.method === "nip44_encrypt" ||
      rpc.method === "nip44_decrypt"
    ) {
      this.requirePermission(rpc.method);
      const pubkey = rpc.params[0] ?? "";
      if (!/^[0-9a-f]{64}$/u.test(pubkey) || typeof rpc.params[1] !== "string")
        throw new Error("Malformed NIP encryption request.");
      const bytes = Buffer.byteLength(rpc.params[1], "utf8");
      if (bytes > 65_536) throw new Error("NIP encryption request exceeds the size limit.");
      return {
        requestId: randomUUID(),
        clientPubkey,
        clientName: this.clientName,
        method: rpc.method,
        requestedPermissions: [...this.permissions],
        thirdPartyPubkey: pubkey,
        ...(rpc.method.endsWith("_encrypt")
          ? { plaintextBytes: bytes }
          : { ciphertextBytes: bytes }),
      };
    }
    throw new Error("Unsupported or unapproved NIP-46 method.");
  }

  private requirePermission(method: string, kind?: number): void {
    if (this.permissions.size === 0) return;
    if (this.permissions.has(method)) return;
    if (method === "sign_event" && kind !== undefined && this.permissions.has(`sign_event:${kind}`))
      return;
    throw new Error("The client did not request this permission when it connected.");
  }

  private parseRpc(plaintext: string): RpcRequest {
    if (Buffer.byteLength(plaintext, "utf8") > MAX_RPC_BYTES)
      throw new Error("NIP-46 request exceeds the size limit.");
    const value = JSON.parse(plaintext) as Record<string, unknown>;
    if (
      typeof value.id !== "string" ||
      value.id.length < 1 ||
      value.id.length > 200 ||
      typeof value.method !== "string" ||
      value.method.length > 80 ||
      !Array.isArray(value.params) ||
      value.params.length > 8 ||
      value.params.some((item) => typeof item !== "string")
    )
      throw new Error("Malformed NIP-46 request.");
    return { id: value.id, method: value.method, params: value.params as string[] };
  }

  private decodeRpc(
    content: string,
    clientPubkey: string,
    conversationKey: Uint8Array,
  ): { rpc: RpcRequest; encryption: RpcEncryption } {
    try {
      return {
        rpc: this.parseRpc(nip44Decrypt(content, conversationKey)),
        encryption: "nip44",
      };
    } catch {
      if (!this.remoteSecretKey) throw new Error("The client bridge is not active.");
      try {
        return {
          rpc: this.parseRpc(nip04Decrypt(this.remoteSecretKey, clientPubkey, content)),
          encryption: "nip04",
        };
      } catch {
        throw new Error("The client request could not be decrypted or parsed.");
      }
    }
  }

  private parseMetadata(raw?: string): { name: string | null } {
    if (!raw) return { name: null };
    try {
      const value = JSON.parse(raw) as Record<string, unknown>;
      return { name: typeof value.name === "string" ? value.name.slice(0, 100) : null };
    } catch {
      return { name: null };
    }
  }

  private async respond(
    id: string,
    conversationKey: Uint8Array,
    clientPubkey: string,
    result?: string,
    error?: string,
    encryption: RpcEncryption = "nip44",
  ): Promise<void> {
    if (!this.remoteSecretKey) throw new Error("The client bridge is not active.");
    const payload: RpcResponse = { id, ...(error ? { error } : { result: result ?? "" }) };
    const plaintext = JSON.stringify(payload);
    const content =
      encryption === "nip04"
        ? nip04Encrypt(this.remoteSecretKey, clientPubkey, plaintext)
        : nip44Encrypt(plaintext, conversationKey);
    const event = finalizeEvent(
      {
        kind: NIP46_KIND,
        created_at: Math.floor(this.now() / 1_000),
        tags: [["p", clientPubkey]],
        content,
      },
      this.remoteSecretKey,
    );
    await this.transport.publish(this.relays, event);
  }

  private expireIfNeeded(): void {
    if (
      this.expiresAtMs &&
      this.now() >= this.expiresAtMs &&
      !["idle", "expired"].includes(this.state)
    ) {
      this.reset();
      this.state = "expired";
      this.detail = "The client bridge expired. Start a fresh connection.";
    }
  }

  private reset(): void {
    this.subscription?.close();
    this.subscription = undefined;
    this.remoteSecretKey?.fill(0);
    this.remoteSecretKey = undefined;
    this.remoteSignerPubkey = undefined;
    this.secret = undefined;
    this.relays = [];
    this.expiresAtMs = undefined;
    this.clientPubkey = undefined;
    this.clientName = null;
    this.permissions.clear();
    this.pending = undefined;
    this.detail = undefined;
    this.seen.clear();
  }
}
