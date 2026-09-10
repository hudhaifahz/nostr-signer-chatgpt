import { describe, expect, it } from "vitest";
import { createKindOneNote } from "../src/events.js";
import { Nip07Bridge } from "../src/nip07.js";
import { SimulatedSigner } from "../src/signers.js";

describe("NIP-07 browser bridge", () => {
  it("round-trips an exact event to a browser extension without a private key", async () => {
    const extension = new SimulatedSigner();
    const pubkey = await extension.getPublicKey();
    const bridge = new Nip07Bridge(1_000);
    const remote = bridge.register(pubkey);
    const event = createKindOneNote("sign in extension");
    const signing = remote.signEvent(event);
    const operation = bridge.next();
    expect(operation?.method).toBe("sign_event");
    if (!operation || operation.method !== "sign_event") throw new Error("Missing operation.");
    bridge.respond(operation.requestId, await extension.signEvent(operation.event));
    await expect(signing).resolves.toMatchObject({ pubkey, content: "sign in extension" });
    expect(bridge.next()).toBeNull();
  });

  it("rejects overlapping, stale, and explicitly denied extension requests", async () => {
    const extension = new SimulatedSigner();
    const bridge = new Nip07Bridge(1_000);
    const remote = bridge.register(await extension.getPublicKey());
    const first = remote.signEvent(createKindOneNote("first"));
    await expect(remote.signEvent(createKindOneNote("second"))).rejects.toThrow(/another/iu);
    const operation = bridge.next();
    if (!operation) throw new Error("Missing operation.");
    bridge.respond(operation.requestId, undefined, true);
    await expect(first).rejects.toThrow(/rejected/iu);
    expect(() => bridge.respond(operation.requestId, {}, false)).toThrow(/unknown/iu);
  });

  it("bridges optional NIP-44 operations when the extension supports them", async () => {
    const extension = new SimulatedSigner();
    const pubkey = await extension.getPublicKey();
    const bridge = new Nip07Bridge(1_000);
    const remote = bridge.register(pubkey);

    const encrypting = remote.nip44Encrypt(pubkey, "private message");
    const encryptOperation = bridge.next();
    if (!encryptOperation || encryptOperation.method !== "nip44_encrypt")
      throw new Error("Missing encryption operation.");
    bridge.respond(
      encryptOperation.requestId,
      await extension.nip44Encrypt(encryptOperation.pubkey, encryptOperation.plaintext),
    );
    const ciphertext = await encrypting;

    const decrypting = remote.nip44Decrypt(pubkey, ciphertext);
    const decryptOperation = bridge.next();
    if (!decryptOperation || decryptOperation.method !== "nip44_decrypt")
      throw new Error("Missing decryption operation.");
    bridge.respond(
      decryptOperation.requestId,
      await extension.nip44Decrypt(decryptOperation.pubkey, decryptOperation.ciphertext),
    );
    await expect(decrypting).resolves.toBe("private message");
  });
});
