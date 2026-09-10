import { describe, expect, it } from "vitest";
import { assertEventTemplate, bindSignedEvent, createKindOneNote } from "../src/events.js";
import { SimulatedSigner } from "../src/signers.js";

describe("strict event validation", () => {
  it("accepts a valid signature bound to the exact approved event", async () => {
    const signer = new SimulatedSigner();
    const event = createKindOneNote("approved");
    const signed = await signer.signEvent(event);
    const pubkey = await signer.getPublicKey();
    expect(() => bindSignedEvent(event, signed, pubkey)).not.toThrow();
  });

  it("rejects signer mutations even when the returned event is cryptographically valid", async () => {
    const signer = new SimulatedSigner();
    const approved = createKindOneNote("approved");
    const changed = await signer.signEvent({ ...approved, content: "changed" });
    const pubkey = await signer.getPublicKey();
    expect(() => bindSignedEvent(approved, changed, pubkey)).toThrow(/does not match/iu);
  });

  it("rejects a different signer key", async () => {
    const signer = new SimulatedSigner();
    const otherSigner = new SimulatedSigner();
    const event = createKindOneNote("approved");
    const signed = await signer.signEvent(event);
    const otherPubkey = await otherSigner.getPublicKey();
    expect(() => bindSignedEvent(event, signed, otherPubkey)).toThrow(/different public key/iu);
  });

  it("rejects stale templates and extra unsigned fields", async () => {
    const stale = { kind: 1, created_at: 100, tags: [], content: "old" };
    expect(() => assertEventTemplate(stale)).toThrow(/timestamp/iu);
    const signer = new SimulatedSigner();
    await expect(signer.signEvent({ ...stale, extra: true } as typeof stale)).rejects.toThrow(
      /unexpected/iu,
    );
  });
});
