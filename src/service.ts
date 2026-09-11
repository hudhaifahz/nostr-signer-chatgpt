import type { Filter } from "nostr-tools/filter";
import { createKindOneNote } from "./events.js";
import type { Nip07Bridge, Nip07Operation } from "./nip07.js";
import type {
  Nip46ClientBridge,
  Nip46ClientBridgeView,
  Nip46ClientRequestView,
} from "./nip46-server.js";
import { normalizeRelayUrls } from "./relays.js";
import { assertNoNsec } from "./security.js";
import type { SignerSession } from "./session.js";
import type { Nip46SignerFactory } from "./signers.js";
import type {
  EventTemplate,
  RelayAck,
  RelayGateway,
  SessionView,
  SignIntentView,
  SignedEvent,
} from "./types.js";

export class NostrSignerService {
  constructor(
    readonly session: SignerSession,
    private readonly signers: Nip46SignerFactory,
    private readonly nip07: Nip07Bridge,
    private readonly relays: RelayGateway,
    private readonly defaultRelays: string[],
    private readonly clientBridge?: Nip46ClientBridge,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private setupUrl: string | undefined;

  status(): SessionView {
    return this.session.status();
  }

  async connectBunker(uri: string): Promise<SessionView> {
    assertNoNsec(uri);
    const signer = await this.signers.connectBunker(uri);
    await this.session.attach(signer);
    return this.status();
  }

  async connectBrowserExtension(pubkey: string): Promise<SessionView> {
    const signer = this.nip07.register(pubkey);
    await this.session.attach(signer);
    return this.status();
  }

  nextBrowserExtensionRequest(): Nip07Operation | null {
    return this.nip07.next();
  }

  respondToBrowserExtension(requestId: string, value: unknown, rejected: boolean): void {
    this.nip07.respond(requestId, value, rejected);
  }

  setSetupUrl(url: string): void {
    this.setupUrl = url;
  }

  getSetupUrl(): string {
    if (!this.setupUrl) throw new Error("The local signer setup page is not ready.");
    return this.setupUrl;
  }

  startClientBridge(relays?: string[]): Nip46ClientBridgeView {
    return this.requireClientBridge().start(this.selectedRelays(relays));
  }

  clientBridgeStatus(): Nip46ClientBridgeView {
    return this.requireClientBridge().view();
  }

  nextClientBridgeRequest(): Nip46ClientRequestView | null {
    return this.requireClientBridge().next();
  }

  approveClientBridgeRequest(
    requestId: string,
    confirmed: boolean,
  ): Promise<Nip46ClientBridgeView> {
    return this.requireClientBridge().approve(requestId, confirmed);
  }

  rejectClientBridgeRequest(requestId: string): Promise<Nip46ClientBridgeView> {
    return this.requireClientBridge().reject(requestId);
  }

  stopClientBridge(): Nip46ClientBridgeView {
    this.requireClientBridge().close();
    return this.requireClientBridge().view();
  }

  beginNostrConnect(relays?: string[]): { uri: string; status: SessionView } {
    const selected = this.selectedRelays(relays);
    const pairing = this.signers.beginNostrConnect(selected);
    this.session.beginPairing(pairing.connected);
    return { uri: pairing.uri, status: this.status() };
  }

  getPublicKey(): string {
    return this.session.getPublicKey();
  }

  prepareNote(content: string): SignIntentView {
    assertNoNsec(content);
    return this.session.prepare(createKindOneNote(content, Math.floor(this.now() / 1000)));
  }

  prepareEvent(event: EventTemplate): SignIntentView {
    return this.session.prepare(event);
  }

  signEvent(intentId: string, confirmed: boolean): Promise<SignIntentView> {
    return this.session.sign(intentId, confirmed);
  }

  async publishEvent(
    intentId: string,
    confirmed: boolean,
    relays?: string[],
  ): Promise<{ eventId: string; acks: RelayAck[] }> {
    if (!confirmed) throw new Error("Explicit publication confirmation is required.");
    const event = this.session.beginPublish(intentId);
    try {
      const acks = await this.relays.publish(event, this.selectedRelays(relays));
      this.session.finishPublish(
        intentId,
        acks.some((ack) => ack.ok),
      );
      return { eventId: event.id, acks };
    } catch (error) {
      this.session.finishPublish(intentId, false);
      throw error;
    }
  }

  nip44Encrypt(pubkey: string, plaintext: string, confirmed: boolean): Promise<string> {
    assertNoNsec(plaintext);
    return this.session.encrypt(pubkey, plaintext, confirmed);
  }

  nip44Decrypt(pubkey: string, ciphertext: string, confirmed: boolean): Promise<string> {
    return this.session.decrypt(pubkey, ciphertext, confirmed);
  }

  async queryEvents(input: {
    relays?: string[] | undefined;
    authors?: string[] | undefined;
    kinds?: number[] | undefined;
    limit?: number | undefined;
    since?: number | undefined;
  }): Promise<SignedEvent[]> {
    const kinds = input.kinds ?? [1];
    if (kinds.some((kind) => kind !== 0 && kind !== 1))
      throw new Error("Safe query mode supports only profile (0) and note (1) events.");
    const limit = input.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new Error("Query limit must be from 1 through 50.");
    const filter: Filter = { kinds, limit };
    if (input.authors) filter.authors = input.authors;
    if (input.since !== undefined) filter.since = input.since;
    return this.relays.query(this.selectedRelays(input.relays), filter);
  }

  async disconnect(): Promise<void> {
    await this.session.disconnect();
    this.nip07.close();
  }

  close(): void {
    this.clientBridge?.destroy();
    this.relays.close();
    this.nip07.close();
    void this.session.disconnect();
  }

  private selectedRelays(relays?: string[]): string[] {
    const values = relays && relays.length > 0 ? relays : this.defaultRelays;
    if (values.length === 0)
      throw new Error("No relays are configured. Set NOSTR_RELAYS or provide relays explicitly.");
    return normalizeRelayUrls(values);
  }

  private requireClientBridge(): Nip46ClientBridge {
    if (!this.clientBridge)
      throw new Error("The NIP-46 client bridge is unavailable in this runtime.");
    return this.clientBridge;
  }
}
