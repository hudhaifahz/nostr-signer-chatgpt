import { SimplePool } from "nostr-tools/pool";
import type { Filter } from "nostr-tools/filter";
import { assertSignedEvent } from "./events.js";
import type { RelayAck, RelayGateway, SignedEvent } from "./types.js";

export function normalizeRelayUrls(values: string[]): string[] {
  const unique = new Set<string>();
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error("Relay URL is invalid.");
    }
    const local =
      url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
    if (url.protocol !== "wss:" && !(local && url.protocol === "ws:")) {
      throw new Error("Relays must use wss://; ws:// is allowed only for localhost.");
    }
    if (url.username || url.password || url.search || url.hash)
      throw new Error("Relay URLs cannot contain credentials, query parameters, or fragments.");
    unique.add(url.toString().replace(/\/$/u, ""));
  }
  if (unique.size === 0) throw new Error("At least one relay is required.");
  if (unique.size > 8) throw new Error("No more than eight relays may be used per request.");
  return [...unique];
}

export function relayUrlsFromEnvironment(value = process.env.NOSTR_RELAYS ?? ""): string[] {
  return value ? normalizeRelayUrls(value.split(",")) : [];
}

export class NostrRelayGateway implements RelayGateway {
  constructor(
    private readonly pool = new SimplePool({ enablePing: true, enableReconnect: false }),
    private readonly timeoutMs = 8_000,
  ) {}

  async publish(event: SignedEvent, relays: string[]): Promise<RelayAck[]> {
    assertSignedEvent(event);
    const normalized = normalizeRelayUrls(relays);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const results = await Promise.allSettled(
        this.pool.publish(normalized, event, { maxWait: this.timeoutMs, abort: controller.signal }),
      );
      return results.map((result, index) => ({
        relay: normalized[index] ?? "unknown",
        ok: result.status === "fulfilled",
        message:
          result.status === "fulfilled" ? result.value || "accepted" : "rejected or timed out",
      }));
    } finally {
      clearTimeout(timer);
    }
  }

  async query(relays: string[], filter: Filter): Promise<SignedEvent[]> {
    const normalized = normalizeRelayUrls(relays);
    const events = await this.pool.querySync(normalized, filter, { maxWait: this.timeoutMs });
    return events.filter((event): event is SignedEvent => {
      try {
        assertSignedEvent(event);
        return true;
      } catch {
        return false;
      }
    });
  }

  close(): void {
    this.pool.destroy();
  }
}

export class SimulatedRelayGateway implements RelayGateway {
  readonly events: SignedEvent[] = [];

  async publish(event: SignedEvent, relays: string[]): Promise<RelayAck[]> {
    assertSignedEvent(event);
    const normalized = normalizeRelayUrls(relays);
    this.events.push(event);
    return normalized.map((relay) => ({ relay, ok: true, message: "simulated: accepted" }));
  }

  async query(_relays: string[], filter: Filter): Promise<SignedEvent[]> {
    return this.events
      .filter((event) => !filter.kinds || filter.kinds.includes(event.kind))
      .filter((event) => !filter.authors || filter.authors.includes(event.pubkey))
      .slice(0, filter.limit ?? 20);
  }

  close(): void {}
}
