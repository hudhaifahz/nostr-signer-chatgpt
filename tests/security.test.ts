import { describe, expect, it } from "vitest";
import { assertNoNsec, containsNsecLike, SafeLogger } from "../src/security.js";

const FAKE_NSEC = `nsec1${"q".repeat(58)}`;

describe("secret input boundary", () => {
  it("rejects nsec-like strings and secret-key-shaped fields", () => {
    expect(containsNsecLike(`do not log ${FAKE_NSEC}`)).toBe(true);
    expect(() => assertNoNsec(FAKE_NSEC)).toThrow(/not accepted/iu);
    expect(() => assertNoNsec({ private_key: "anything" })).toThrow(/not accepted/iu);
  });

  it("accepts bunker and nostrconnect connection material", () => {
    expect(() =>
      assertNoNsec(
        `bunker://${"a".repeat(64)}?relay=wss%3A%2F%2Frelay.example&secret=pairing-secret`,
      ),
    ).not.toThrow();
  });

  it("redacts nsec, bunker secrets, tokens, and content from logs", () => {
    const lines: string[] = [];
    const logger = new SafeLogger((line) => lines.push(line));
    logger.error(
      `failed for ${FAKE_NSEC}`,
      new Error(
        `bunker://${"a".repeat(64)}?secret=pair-secret Bearer abc.def.ghi ${JSON.stringify({ content: "returned private note" })}`,
      ),
      { content: "private note", plaintext: "secret words", safe: "visible" },
    );
    const output = lines.join("\n");
    expect(output).not.toContain(FAKE_NSEC);
    expect(output).not.toContain("pair-secret");
    expect(output).not.toContain("abc.def.ghi");
    expect(output).not.toContain("private note");
    expect(output).not.toContain("returned private note");
    expect(output).not.toContain("secret words");
    expect(output).toContain("visible");
    expect(output).toContain("REDACTED");
  });
});
