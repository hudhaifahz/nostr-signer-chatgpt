import { describe, expect, it } from "vitest";
import type { SimplePool } from "nostr-tools/pool";
import { createKindOneNote } from "../src/events.js";
import { NostrRelayGateway, normalizeRelayUrls } from "../src/relays.js";
import { SimulatedSigner } from "../src/signers.js";

describe("relay publication acknowledgements", () => {
  it("binds each acknowledgement or failure to its relay", async () => {
    const pool = {
      publish: () => [Promise.resolve("saved"), Promise.reject(new Error("blocked"))],
      destroy: () => {},
    } as unknown as SimplePool;
    const gateway = new NostrRelayGateway(pool, 100);
    const signer = new SimulatedSigner();
    const event = await signer.signEvent(
      createKindOneNote("publish", Math.floor(Date.now() / 1000)),
    );
    const acks = await gateway.publish(event, ["wss://one.example", "wss://two.example"]);
    expect(acks).toEqual([
      { relay: "wss://one.example", ok: true, message: "saved" },
      { relay: "wss://two.example", ok: false, message: "rejected or timed out" },
    ]);
  });

  it("rejects insecure remote relay URLs and secret-bearing relay URLs", () => {
    expect(() => normalizeRelayUrls(["ws://relay.example"])).toThrow(/wss/iu);
    expect(() => normalizeRelayUrls(["wss://relay.example?token=secret"])).toThrow(/query/iu);
    expect(normalizeRelayUrls(["ws://127.0.0.1:7777/"])).toEqual(["ws://127.0.0.1:7777"]);
  });
});
