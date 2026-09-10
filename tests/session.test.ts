import { describe, expect, it } from "vitest";
import { createKindOneNote } from "../src/events.js";
import { SafeLogger } from "../src/security.js";
import { SignerSession } from "../src/session.js";
import { SimulatedSigner } from "../src/signers.js";

describe("signer session and intent binding", () => {
  it("consumes each signing intent exactly once", async () => {
    const now = Date.now();
    const session = new SignerSession(new SafeLogger(() => {}), () => now);
    await session.attach(new SimulatedSigner());
    const intent = session.prepare(createKindOneNote("one approval", Math.floor(now / 1000)));
    const signed = await session.sign(intent.intentId, true);
    expect(signed.state).toBe("signed");
    await expect(session.sign(intent.intentId, true)).rejects.toThrow(/already used/iu);
  });

  it("requires explicit confirmation", async () => {
    const now = Date.now();
    const session = new SignerSession(new SafeLogger(() => {}), () => now);
    await session.attach(new SimulatedSigner());
    const intent = session.prepare(createKindOneNote("review me", Math.floor(now / 1000)));
    await expect(session.sign(intent.intentId, false)).rejects.toThrow(/confirmation/iu);
  });

  it("expires intents and sessions", async () => {
    let now = Date.now();
    const session = new SignerSession(new SafeLogger(() => {}), () => now, 2_000, 1_000);
    await session.attach(new SimulatedSigner());
    const intent = session.prepare(createKindOneNote("short lived", Math.floor(now / 1000)));
    now += 1_001;
    await expect(session.sign(intent.intentId, true)).rejects.toThrow(/intent expired/iu);
    now += 1_000;
    expect(session.status().state).toBe("expired");
    expect(session.status().pubkey).toBeUndefined();
  });

  it("discards a stale pairing result after a newer session wins", async () => {
    let resolveOld: ((signer: SimulatedSigner) => void) | undefined;
    const oldPairing = new Promise<SimulatedSigner>((resolve) => {
      resolveOld = resolve;
    });
    const session = new SignerSession(new SafeLogger(() => {}));
    session.beginPairing(oldPairing);
    const winner = new SimulatedSigner();
    await session.attach(winner);
    const winnerPubkey = await winner.getPublicKey();
    resolveOld?.(new SimulatedSigner());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(session.getPublicKey()).toBe(winnerPubkey);
  });

  it("serializes publication attempts and permits an explicit retry after total failure", async () => {
    const now = Date.now();
    const session = new SignerSession(new SafeLogger(() => {}), () => now);
    await session.attach(new SimulatedSigner());
    const intent = session.prepare(createKindOneNote("publish once", Math.floor(now / 1000)));
    await session.sign(intent.intentId, true);
    const event = session.beginPublish(intent.intentId);
    expect(event.content).toBe("publish once");
    expect(() => session.beginPublish(intent.intentId)).toThrow(/already being published/iu);
    session.finishPublish(intent.intentId, false);
    expect(() => session.beginPublish(intent.intentId)).not.toThrow();
    session.finishPublish(intent.intentId, true);
    expect(() => session.beginPublish(intent.intentId)).toThrow(/already published/iu);
  });
});
