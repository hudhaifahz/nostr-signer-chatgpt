import { decrypt, encrypt, getConversationKey } from "nostr-tools/nip44";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { verifyEvent } from "nostr-tools";
import { decrypt as nip04Decrypt, encrypt as nip04Encrypt } from "nostr-tools/nip04";
import { describe, expect, it } from "vitest";
import { Nip46ClientBridge, type Nip46ServerTransport } from "../src/nip46-server.js";
import { SafeLogger } from "../src/security.js";
import { SignerSession } from "../src/session.js";
import { SimulatedSigner } from "../src/signers.js";
import type { SignedEvent } from "../src/types.js";

class MemoryTransport implements Nip46ServerTransport {
  published: SignedEvent[] = [];
  private listener: ((event: SignedEvent) => void) | undefined;

  subscribe(_relays: string[], _remoteSignerPubkey: string, onEvent: (event: SignedEvent) => void) {
    this.listener = onEvent;
    return {
      close: () => {
        this.listener = undefined;
      },
    };
  }

  async publish(_relays: string[], event: SignedEvent): Promise<void> {
    this.published.push(event);
  }

  emit(event: SignedEvent): void {
    this.listener?.(event);
  }

  close(): void {
    this.listener = undefined;
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("NIP-46 client bridge", () => {
  it("accepts the legacy NIP-04 encrypted handshake used by Noornote", async () => {
    const session = new SignerSession(new SafeLogger(() => {}));
    const signer = new SimulatedSigner();
    await session.attach(signer);
    const transport = new MemoryTransport();
    const bridge = new Nip46ClientBridge(session, transport);
    const started = bridge.start(["wss://relay.example"]);
    const bunker = new URL(started.bunkerUrl as string);
    const remotePubkey = bunker.hostname;
    const secret = bunker.searchParams.get("secret") as string;
    const clientSecretKey = generateSecretKey();
    const make = (id: string, method: string, params: string[]) =>
      finalizeEvent(
        {
          kind: 24_133,
          created_at: Math.floor(Date.now() / 1_000),
          tags: [["p", remotePubkey]],
          content: nip04Encrypt(
            clientSecretKey,
            remotePubkey,
            JSON.stringify({ id, method, params }),
          ),
        },
        clientSecretKey,
      );

    transport.emit(
      make("connect-nip04", "connect", [
        remotePubkey,
        secret,
        "",
        JSON.stringify({ name: "Noornote-compatible client" }),
      ]),
    );
    await settle();
    expect(bridge.next()).toMatchObject({ method: "connect" });
    await bridge.approve(bridge.next()?.requestId as string, true);
    const connected = JSON.parse(
      nip04Decrypt(clientSecretKey, remotePubkey, transport.published[0]?.content as string),
    ) as { id: string; result: string };
    expect(connected).toEqual({ id: "connect-nip04", result: secret });

    transport.emit(make("pubkey-nip04", "get_public_key", []));
    await settle();
    const pubkey = JSON.parse(
      nip04Decrypt(clientSecretKey, remotePubkey, transport.published[1]?.content as string),
    ) as { id: string; result: string };
    expect(pubkey).toEqual({ id: "pubkey-nip04", result: await signer.getPublicKey() });
  });

  it("pairs a standard bunker client and signs only after exact approval", async () => {
    const session = new SignerSession(new SafeLogger(() => {}));
    const signer = new SimulatedSigner();
    await session.attach(signer);
    const transport = new MemoryTransport();
    const bridge = new Nip46ClientBridge(session, transport);
    const started = bridge.start(["wss://relay.example"]);
    const bunker = new URL(started.bunkerUrl as string);
    const remotePubkey = bunker.hostname;
    const secret = bunker.searchParams.get("secret");
    if (!secret) throw new Error("Missing bridge secret.");

    const clientSecretKey = generateSecretKey();
    const clientPubkey = getPublicKey(clientSecretKey);
    const conversationKey = getConversationKey(clientSecretKey, remotePubkey);
    const request = (id: string, method: string, params: string[]) =>
      finalizeEvent(
        {
          kind: 24_133,
          created_at: Math.floor(Date.now() / 1_000),
          tags: [["p", remotePubkey]],
          content: encrypt(JSON.stringify({ id, method, params }), conversationKey),
        },
        clientSecretKey,
      );
    const response = (index: number) =>
      JSON.parse(decrypt(transport.published[index]?.content as string, conversationKey)) as {
        id: string;
        result?: string;
        error?: string;
      };

    transport.emit(
      request("connect-1", "connect", [
        remotePubkey,
        secret,
        "sign_event:1,nip44_encrypt,nip44_decrypt",
        JSON.stringify({ name: "Test Nostr client" }),
      ]),
    );
    await settle();
    const pairing = bridge.next();
    expect(pairing).toMatchObject({
      method: "connect",
      clientPubkey,
      clientName: "Test Nostr client",
    });
    expect(transport.published).toHaveLength(0);
    await bridge.approve(pairing?.requestId as string, true);
    expect(response(0)).toEqual({ id: "connect-1", result: secret });

    transport.emit(request("pubkey-1", "get_public_key", []));
    await settle();
    expect(response(1)).toEqual({ id: "pubkey-1", result: await signer.getPublicKey() });

    const template = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1_000),
      tags: [] as string[][],
      content: "approved bridge note",
    };
    transport.emit(request("sign-1", "sign_event", [JSON.stringify(template)]));
    await settle();
    const signing = bridge.next();
    expect(signing).toMatchObject({ method: "sign_event", event: template });
    expect(transport.published).toHaveLength(2);
    await bridge.approve(signing?.requestId as string, true);
    const signed = JSON.parse(response(2).result as string) as SignedEvent;
    expect(verifyEvent(signed)).toBe(true);
    expect(signed).toMatchObject(template);
    expect(bridge.view()).toMatchObject({ state: "connected", clientPubkey });
  });

  it("rejects a request without invoking the signer", async () => {
    const session = new SignerSession(new SafeLogger(() => {}));
    await session.attach(new SimulatedSigner());
    const transport = new MemoryTransport();
    const bridge = new Nip46ClientBridge(session, transport);
    const started = bridge.start(["wss://relay.example"]);
    const bunker = new URL(started.bunkerUrl as string);
    const remotePubkey = bunker.hostname;
    const secret = bunker.searchParams.get("secret") as string;
    const clientSecretKey = generateSecretKey();
    const clientPubkey = getPublicKey(clientSecretKey);
    const conversationKey = getConversationKey(clientSecretKey, remotePubkey);
    const make = (id: string, method: string, params: string[]) =>
      finalizeEvent(
        {
          kind: 24_133,
          created_at: Math.floor(Date.now() / 1_000),
          tags: [["p", remotePubkey]],
          content: encrypt(JSON.stringify({ id, method, params }), conversationKey),
        },
        clientSecretKey,
      );

    transport.emit(make("connect", "connect", [remotePubkey, secret]));
    await settle();
    await bridge.approve(bridge.next()?.requestId as string, true);
    const template = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1_000),
      tags: [],
      content: "no",
    };
    transport.emit(make("sign", "sign_event", [JSON.stringify(template)]));
    await settle();
    await bridge.reject(bridge.next()?.requestId as string);
    const rejected = JSON.parse(
      decrypt(transport.published[1]?.content as string, conversationKey),
    ) as { error: string };
    expect(rejected.error).toBe("Rejected by the user.");
    expect(bridge.view()).toMatchObject({ state: "connected", clientPubkey });
  });
});
