import { randomUUID } from "node:crypto";
import { assertEventTemplate, assertHexPubkey } from "./events.js";
import { assertNoNsec } from "./security.js";
import type { EventTemplate, RemoteSigner, SignedEvent } from "./types.js";

export type Nip07Operation =
  | { requestId: string; method: "sign_event"; event: EventTemplate }
  | { requestId: string; method: "nip04_encrypt"; pubkey: string; plaintext: string }
  | { requestId: string; method: "nip04_decrypt"; pubkey: string; ciphertext: string }
  | { requestId: string; method: "nip44_encrypt"; pubkey: string; plaintext: string }
  | { requestId: string; method: "nip44_decrypt"; pubkey: string; ciphertext: string };

type Nip07OperationInput =
  | { method: "sign_event"; event: EventTemplate }
  | { method: "nip04_encrypt"; pubkey: string; plaintext: string }
  | { method: "nip04_decrypt"; pubkey: string; ciphertext: string }
  | { method: "nip44_encrypt"; pubkey: string; plaintext: string }
  | { method: "nip44_decrypt"; pubkey: string; ciphertext: string };

type PendingRequest = {
  operation: Nip07Operation;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export class Nip07Bridge {
  private generation = 0;
  private pubkey: string | undefined;
  private pending: PendingRequest | undefined;

  constructor(private readonly timeoutMs = 120_000) {}

  register(pubkey: string): RemoteSigner {
    assertHexPubkey(pubkey);
    this.rejectPending("A newer browser-extension session replaced this request.");
    const generation = ++this.generation;
    this.pubkey = pubkey;
    return new Nip07RemoteSigner(this, generation, pubkey);
  }

  next(): Nip07Operation | null {
    return this.pending ? structuredClone(this.pending.operation) : null;
  }

  respond(requestId: string, result: unknown, rejected = false): void {
    const pending = this.pending;
    if (!pending || pending.operation.requestId !== requestId) {
      throw new Error("The browser-extension request is unknown or already completed.");
    }
    this.pending = undefined;
    clearTimeout(pending.timer);
    if (rejected) {
      pending.reject(new Error("The browser extension rejected the request."));
      return;
    }
    pending.resolve(result);
  }

  request(generation: number, operation: Nip07OperationInput): Promise<unknown> {
    if (generation !== this.generation || !this.pubkey)
      return Promise.reject(new Error("The browser-extension signer is disconnected."));
    if (this.pending)
      return Promise.reject(new Error("Another browser-extension request is awaiting approval."));
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending?.operation.requestId === requestId) this.pending = undefined;
        reject(new Error("The browser-extension approval timed out."));
      }, this.timeoutMs);
      this.pending = {
        operation: { ...structuredClone(operation), requestId } as Nip07Operation,
        resolve,
        reject,
        timer,
      };
    });
  }

  close(generation?: number): void {
    if (generation !== undefined && generation !== this.generation) return;
    ++this.generation;
    this.pubkey = undefined;
    this.rejectPending("The browser-extension signer disconnected.");
  }

  private rejectPending(message: string): void {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    this.pending.reject(new Error(message));
    this.pending = undefined;
  }
}

class Nip07RemoteSigner implements RemoteSigner {
  readonly kind = "nip07" as const;

  constructor(
    private readonly bridge: Nip07Bridge,
    private readonly generation: number,
    private readonly pubkey: string,
  ) {}

  async getPublicKey(): Promise<string> {
    return this.pubkey;
  }

  async signEvent(event: EventTemplate): Promise<SignedEvent> {
    assertEventTemplate(event);
    return (await this.bridge.request(this.generation, {
      method: "sign_event",
      event,
    })) as SignedEvent;
  }

  async nip44Encrypt(pubkey: string, plaintext: string): Promise<string> {
    assertHexPubkey(pubkey);
    assertNoNsec(plaintext);
    const result = await this.bridge.request(this.generation, {
      method: "nip44_encrypt",
      pubkey,
      plaintext,
    });
    if (typeof result !== "string" || result.length > 100_000)
      throw new Error("The browser extension returned an invalid NIP-44 ciphertext.");
    return result;
  }

  async nip04Encrypt(pubkey: string, plaintext: string): Promise<string> {
    assertHexPubkey(pubkey);
    assertNoNsec(plaintext);
    const result = await this.bridge.request(this.generation, {
      method: "nip04_encrypt",
      pubkey,
      plaintext,
    });
    if (typeof result !== "string" || result.length > 100_000)
      throw new Error("The browser extension returned an invalid NIP-04 ciphertext.");
    return result;
  }

  async nip04Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    assertHexPubkey(pubkey);
    const result = await this.bridge.request(this.generation, {
      method: "nip04_decrypt",
      pubkey,
      ciphertext,
    });
    if (typeof result !== "string" || Buffer.byteLength(result, "utf8") > 65_536)
      throw new Error("The browser extension returned invalid NIP-04 plaintext.");
    return result;
  }

  async nip44Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    assertHexPubkey(pubkey);
    const result = await this.bridge.request(this.generation, {
      method: "nip44_decrypt",
      pubkey,
      ciphertext,
    });
    if (typeof result !== "string" || Buffer.byteLength(result, "utf8") > 65_536)
      throw new Error("The browser extension returned invalid NIP-44 plaintext.");
    return result;
  }

  async close(): Promise<void> {
    this.bridge.close(this.generation);
  }
}
