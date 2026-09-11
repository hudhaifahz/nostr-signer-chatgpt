import type { Filter } from "nostr-tools/filter";

export type EventTemplate = {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
};

export type SignedEvent = EventTemplate & {
  id: string;
  pubkey: string;
  sig: string;
};

export type RelayAck = {
  relay: string;
  ok: boolean;
  message: string;
};

export interface RemoteSigner {
  readonly kind: "nip07" | "nip46" | "simulated";
  getPublicKey(): Promise<string>;
  signEvent(event: EventTemplate): Promise<SignedEvent>;
  nip04Encrypt(pubkey: string, plaintext: string): Promise<string>;
  nip04Decrypt(pubkey: string, ciphertext: string): Promise<string>;
  nip44Encrypt(pubkey: string, plaintext: string): Promise<string>;
  nip44Decrypt(pubkey: string, ciphertext: string): Promise<string>;
  close(): Promise<void>;
}

export interface RelayGateway {
  publish(event: SignedEvent, relays: string[]): Promise<RelayAck[]>;
  query(relays: string[], filter: Filter): Promise<SignedEvent[]>;
  close(): void;
}

export type SessionState = "disconnected" | "pairing" | "connected" | "expired" | "error";

export type SessionView = {
  state: SessionState;
  pubkey?: string;
  signerType?: RemoteSigner["kind"];
  expiresAt?: string;
  detail?: string;
};

export type IntentState = "prepared" | "signing" | "signed" | "publishing" | "published" | "failed";

export type SignIntentView = {
  intentId: string;
  state: IntentState;
  event: EventTemplate;
  expiresAt: string;
  signedEvent?: SignedEvent;
};
