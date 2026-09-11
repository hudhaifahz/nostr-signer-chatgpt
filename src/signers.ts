import { randomBytes } from "node:crypto";
import { BunkerSigner, createNostrConnectURI, parseBunkerInput } from "nostr-tools/nip46";
import { decrypt as nip04Decrypt, encrypt as nip04Encrypt } from "nostr-tools/nip04";
import { decrypt, encrypt, getConversationKey } from "nostr-tools/nip44";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { assertEventTemplate, assertHexPubkey, assertSignedEvent } from "./events.js";
import { normalizeRelayUrls } from "./relays.js";
import { assertNoNsec, type SafeLogger } from "./security.js";
import type { EventTemplate, RemoteSigner, SignedEvent } from "./types.js";

export type PairingStart = {
  uri: string;
  connected: Promise<RemoteSigner>;
};

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    operation,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export class NostrToolsRemoteSigner implements RemoteSigner {
  readonly kind = "nip46" as const;
  constructor(
    private readonly signer: BunkerSigner,
    private readonly timeoutMs: number,
  ) {}

  async getPublicKey(): Promise<string> {
    try {
      return await withTimeout(this.signer.getPublicKey(), this.timeoutMs, "get_public_key");
    } catch {
      throw new Error("The remote signer rejected or could not complete get_public_key.");
    }
  }

  async signEvent(event: EventTemplate): Promise<SignedEvent> {
    assertEventTemplate(event);
    try {
      const signed = await withTimeout(this.signer.signEvent(event), this.timeoutMs, "sign_event");
      assertSignedEvent(signed);
      return signed;
    } catch {
      throw new Error("The remote signer rejected or returned an invalid signature.");
    }
  }

  async nip44Encrypt(pubkey: string, plaintext: string): Promise<string> {
    assertHexPubkey(pubkey);
    assertNoNsec(plaintext);
    try {
      return await withTimeout(
        this.signer.nip44Encrypt(pubkey, plaintext),
        this.timeoutMs,
        "nip44_encrypt",
      );
    } catch {
      throw new Error("The remote signer rejected or could not complete nip44_encrypt.");
    }
  }

  async nip04Encrypt(pubkey: string, plaintext: string): Promise<string> {
    assertHexPubkey(pubkey);
    assertNoNsec(plaintext);
    try {
      return await withTimeout(
        this.signer.nip04Encrypt(pubkey, plaintext),
        this.timeoutMs,
        "nip04_encrypt",
      );
    } catch {
      throw new Error("The remote signer rejected or could not complete nip04_encrypt.");
    }
  }

  async nip04Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    assertHexPubkey(pubkey);
    try {
      return await withTimeout(
        this.signer.nip04Decrypt(pubkey, ciphertext),
        this.timeoutMs,
        "nip04_decrypt",
      );
    } catch {
      throw new Error("The remote signer rejected or could not complete nip04_decrypt.");
    }
  }

  async nip44Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    assertHexPubkey(pubkey);
    try {
      return await withTimeout(
        this.signer.nip44Decrypt(pubkey, ciphertext),
        this.timeoutMs,
        "nip44_decrypt",
      );
    } catch {
      throw new Error("The remote signer rejected or could not complete nip44_decrypt.");
    }
  }

  close(): Promise<void> {
    return this.signer.close();
  }
}

export class Nip46SignerFactory {
  constructor(
    private readonly logger: SafeLogger,
    private readonly requestTimeoutMs = 120_000,
  ) {}

  async connectBunker(connectionUri: string): Promise<RemoteSigner> {
    assertNoNsec(connectionUri);
    if (!connectionUri.startsWith("bunker://"))
      throw new Error("Expected a bunker:// connection URI.");
    const pointer = await parseBunkerInput(connectionUri);
    if (!pointer) throw new Error("The bunker connection URI is invalid.");
    pointer.relays = normalizeRelayUrls(pointer.relays);
    const signer = BunkerSigner.fromBunker(generateSecretKey(), pointer, {
      skipSwitchRelays: true,
      onauth: () => this.logger.info("Remote signer requested out-of-band authorization."),
    });
    const remote = new NostrToolsRemoteSigner(signer, this.requestTimeoutMs);
    try {
      await withTimeout(
        signer.connect({ name: "Nostr Signer for ChatGPT" }),
        this.requestTimeoutMs,
        "connect",
      );
      return remote;
    } catch (error) {
      await signer.close();
      throw error;
    }
  }

  beginNostrConnect(relays: string[], waitMs = 300_000): PairingStart {
    const normalized = normalizeRelayUrls(relays);
    const clientSecretKey = generateSecretKey();
    const secret = randomBytes(24).toString("hex");
    const uri = createNostrConnectURI({
      clientPubkey: getPublicKey(clientSecretKey),
      relays: normalized,
      secret,
      perms: ["get_public_key", "sign_event", "nip44_encrypt", "nip44_decrypt"],
      name: "Nostr Signer for ChatGPT",
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), waitMs);
    const connected = BunkerSigner.fromURI(
      clientSecretKey,
      uri,
      {
        skipSwitchRelays: true,
        onauth: () => this.logger.info("Remote signer requested out-of-band authorization."),
      },
      controller.signal,
    )
      .then((signer) => new NostrToolsRemoteSigner(signer, this.requestTimeoutMs))
      .finally(() => clearTimeout(timer));
    return { uri, connected };
  }
}

export class SimulatedSigner implements RemoteSigner {
  readonly kind = "simulated" as const;
  private readonly secretKey = generateSecretKey();

  async getPublicKey(): Promise<string> {
    return getPublicKey(this.secretKey);
  }

  async signEvent(event: EventTemplate): Promise<SignedEvent> {
    assertEventTemplate(event);
    return finalizeEvent({ ...event, tags: event.tags.map((tag) => [...tag]) }, this.secretKey);
  }

  async nip44Encrypt(pubkey: string, plaintext: string): Promise<string> {
    assertHexPubkey(pubkey);
    assertNoNsec(plaintext);
    return encrypt(plaintext, getConversationKey(this.secretKey, pubkey));
  }

  async nip04Encrypt(pubkey: string, plaintext: string): Promise<string> {
    assertHexPubkey(pubkey);
    assertNoNsec(plaintext);
    return nip04Encrypt(this.secretKey, pubkey, plaintext);
  }

  async nip04Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    assertHexPubkey(pubkey);
    return nip04Decrypt(this.secretKey, pubkey, ciphertext);
  }

  async nip44Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    assertHexPubkey(pubkey);
    return decrypt(ciphertext, getConversationKey(this.secretKey, pubkey));
  }

  async close(): Promise<void> {}
}
