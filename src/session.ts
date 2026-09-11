import { randomUUID } from "node:crypto";
import {
  assertEventTemplate,
  assertHexPubkey,
  bindSignedEvent,
  eventFingerprint,
} from "./events.js";
import { assertNoNsec, publicError, type SafeLogger } from "./security.js";
import type {
  EventTemplate,
  RemoteSigner,
  SessionState,
  SessionView,
  SignIntentView,
  SignedEvent,
} from "./types.js";

type IntentRecord = {
  intentId: string;
  state: SignIntentView["state"];
  event: EventTemplate;
  fingerprint: string;
  expiresAtMs: number;
  signedEvent?: SignedEvent;
};

export class SignerSession {
  private state: SessionState = "disconnected";
  private signer: RemoteSigner | undefined;
  private pubkey: string | undefined;
  private signerType: RemoteSigner["kind"] | undefined;
  private expiresAtMs: number | undefined;
  private detail: string | undefined;
  private generation = 0;
  private readonly intents = new Map<string, IntentRecord>();

  constructor(
    private readonly logger: SafeLogger,
    private readonly now: () => number = () => Date.now(),
    private readonly sessionTtlMs = 1_800_000,
    private readonly intentTtlMs = 120_000,
  ) {}

  async attach(signer: RemoteSigner): Promise<void> {
    const generation = ++this.generation;
    let pubkey: string;
    try {
      pubkey = await signer.getPublicKey();
      assertHexPubkey(pubkey);
    } catch (error) {
      await signer.close();
      throw error;
    }
    if (generation !== this.generation) {
      await signer.close();
      throw new Error("A newer signer session replaced this connection.");
    }
    const previous = this.signer;
    this.signer = signer;
    this.pubkey = pubkey;
    this.signerType = signer.kind;
    this.expiresAtMs = this.now() + this.sessionTtlMs;
    this.state = "connected";
    this.detail = undefined;
    this.intents.clear();
    if (previous) await previous.close();
    this.logger.info("Signer session connected.", { pubkey });
  }

  beginPairing(connected: Promise<RemoteSigner>): void {
    const generation = ++this.generation;
    const previous = this.signer;
    this.signer = undefined;
    this.state = "pairing";
    this.pubkey = undefined;
    this.signerType = undefined;
    this.expiresAtMs = this.now() + 300_000;
    this.detail = "Waiting for approval in the remote signer.";
    this.intents.clear();
    if (previous) void previous.close();
    void connected
      .then(async (signer) => {
        if (generation !== this.generation) {
          await signer.close();
          return;
        }
        const pubkey = await signer.getPublicKey();
        assertHexPubkey(pubkey);
        this.signer = signer;
        this.pubkey = pubkey;
        this.signerType = signer.kind;
        this.expiresAtMs = this.now() + this.sessionTtlMs;
        this.state = "connected";
        this.detail = undefined;
        this.logger.info("Signer pairing completed.", { pubkey });
      })
      .catch((error) => {
        if (generation !== this.generation) return;
        this.state = "error";
        this.detail = publicError(error).message;
        this.logger.error("Signer pairing failed.", error);
      });
  }

  status(): SessionView {
    this.expireIfNeeded();
    return {
      state: this.state,
      ...(this.pubkey ? { pubkey: this.pubkey } : {}),
      ...(this.signerType ? { signerType: this.signerType } : {}),
      ...(this.expiresAtMs ? { expiresAt: new Date(this.expiresAtMs).toISOString() } : {}),
      ...(this.detail ? { detail: this.detail } : {}),
    };
  }

  getPublicKey(): string {
    this.requireConnected();
    return this.pubkey as string;
  }

  prepare(event: EventTemplate): SignIntentView {
    this.requireConnected();
    assertEventTemplate(event, Math.floor(this.now() / 1000));
    const record: IntentRecord = {
      intentId: randomUUID(),
      state: "prepared",
      event: structuredClone(event),
      fingerprint: eventFingerprint(event),
      expiresAtMs: this.now() + this.intentTtlMs,
    };
    this.intents.set(record.intentId, record);
    return this.toView(record);
  }

  async sign(intentId: string, confirmed: boolean): Promise<SignIntentView> {
    const signer = this.requireConnected();
    if (!confirmed) throw new Error("Explicit signature confirmation is required.");
    const record = this.requireIntent(intentId);
    if (record.state !== "prepared")
      throw new Error("This signing intent was already used or is unavailable.");
    if (record.fingerprint !== eventFingerprint(record.event))
      throw new Error("Prepared event binding failed.");
    record.state = "signing";
    try {
      const signed = await signer.signEvent(structuredClone(record.event));
      bindSignedEvent(record.event, signed, this.pubkey as string);
      record.signedEvent = signed;
      record.state = "signed";
      return this.toView(record);
    } catch (error) {
      record.state = "failed";
      this.logger.error("Signer rejected or failed a signing intent.", error, { intentId });
      throw publicError(error);
    }
  }

  getSigned(intentId: string): { event: SignedEvent; state: SignIntentView["state"] } {
    this.requireConnected();
    const record = this.requireIntent(intentId, false);
    if (!record.signedEvent || (record.state !== "signed" && record.state !== "published")) {
      throw new Error("The intent does not contain a verified signed event.");
    }
    return { event: record.signedEvent, state: record.state };
  }

  beginPublish(intentId: string): SignedEvent {
    this.requireConnected();
    const record = this.requireIntent(intentId, false);
    if (record.state === "published")
      throw new Error("This event was already published by this session.");
    if (record.state === "publishing") throw new Error("This event is already being published.");
    if (record.state !== "signed" || !record.signedEvent)
      throw new Error("Only a verified signed event can be published.");
    record.state = "publishing";
    return structuredClone(record.signedEvent);
  }

  finishPublish(intentId: string, accepted: boolean): void {
    const record = this.requireIntent(intentId, false);
    if (record.state !== "publishing")
      throw new Error("This event has no active publication attempt.");
    record.state = accepted ? "published" : "signed";
  }

  async encrypt(pubkey: string, plaintext: string, confirmed: boolean): Promise<string> {
    if (!confirmed) throw new Error("Explicit encryption confirmation is required.");
    return this.requireConnected().nip44Encrypt(pubkey, plaintext);
  }

  async nip04Encrypt(pubkey: string, plaintext: string, confirmed: boolean): Promise<string> {
    if (!confirmed) throw new Error("Explicit encryption confirmation is required.");
    return this.requireConnected().nip04Encrypt(pubkey, plaintext);
  }

  async nip04Decrypt(pubkey: string, ciphertext: string, confirmed: boolean): Promise<string> {
    if (!confirmed) throw new Error("Explicit decryption confirmation is required.");
    const plaintext = await this.requireConnected().nip04Decrypt(pubkey, ciphertext);
    assertNoNsec(plaintext);
    return plaintext;
  }

  async decrypt(pubkey: string, ciphertext: string, confirmed: boolean): Promise<string> {
    if (!confirmed) throw new Error("Explicit decryption confirmation is required.");
    const plaintext = await this.requireConnected().nip44Decrypt(pubkey, ciphertext);
    assertNoNsec(plaintext);
    return plaintext;
  }

  async disconnect(): Promise<void> {
    ++this.generation;
    const signer = this.signer;
    this.signer = undefined;
    this.pubkey = undefined;
    this.signerType = undefined;
    this.expiresAtMs = undefined;
    this.state = "disconnected";
    this.detail = undefined;
    this.intents.clear();
    if (signer) await signer.close();
  }

  private requireConnected(): RemoteSigner {
    this.expireIfNeeded();
    if (this.state !== "connected" || !this.signer || !this.pubkey)
      throw new Error("No active signer session is connected.");
    return this.signer;
  }

  private expireIfNeeded(): void {
    if (
      this.expiresAtMs &&
      this.now() >= this.expiresAtMs &&
      (this.state === "connected" || this.state === "pairing")
    ) {
      const signer = this.signer;
      this.signer = undefined;
      this.pubkey = undefined;
      this.signerType = undefined;
      ++this.generation;
      this.state = "expired";
      this.detail = "The in-memory signer session expired. Pair again.";
      this.intents.clear();
      if (signer) void signer.close();
    }
  }

  private requireIntent(intentId: string, enforceExpiry = true): IntentRecord {
    const record = this.intents.get(intentId);
    if (!record) throw new Error("Unknown signing intent.");
    if (enforceExpiry && this.now() >= record.expiresAtMs) {
      record.state = "failed";
      throw new Error("The signing intent expired. Prepare a new event.");
    }
    return record;
  }

  private toView(record: IntentRecord): SignIntentView {
    return {
      intentId: record.intentId,
      state: record.state,
      event: structuredClone(record.event),
      expiresAt: new Date(record.expiresAtMs).toISOString(),
      ...(record.signedEvent ? { signedEvent: structuredClone(record.signedEvent) } : {}),
    };
  }
}
