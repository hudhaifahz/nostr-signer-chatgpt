import { createHash } from "node:crypto";
import { validateEvent, verifyEvent } from "nostr-tools/pure";
import { assertNoNsec } from "./security.js";
import type { EventTemplate, SignedEvent } from "./types.js";

const HEX_32 = /^[0-9a-f]{64}$/u;
const HEX_64 = /^[0-9a-f]{128}$/u;
const MAX_CONTENT_BYTES = 65_536;
const MAX_TAGS = 128;
const MAX_TAG_PARTS = 16;
const MAX_TAG_PART_BYTES = 4_096;

function exactKeys(value: object, allowed: string[]): boolean {
  const keys = Object.keys(value).sort();
  const expected = [...allowed].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

export function assertHexPubkey(pubkey: string): void {
  if (!HEX_32.test(pubkey)) throw new Error("Expected a lowercase 64-character hex public key.");
}

export function assertEventTemplate(
  value: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
): asserts value is EventTemplate {
  assertNoNsec(value);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Event must be an object.");
  if (!exactKeys(value, ["content", "created_at", "kind", "tags"]))
    throw new Error("Unsigned event has unexpected or missing fields.");
  const event = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(event.kind) ||
    (event.kind as number) < 0 ||
    (event.kind as number) > 65_535
  ) {
    throw new Error("Event kind must be an integer from 0 through 65535.");
  }
  if (!Number.isSafeInteger(event.created_at))
    throw new Error("Event created_at must be an integer Unix timestamp.");
  const age = nowSeconds - (event.created_at as number);
  if (age > 300 || age < -60) throw new Error("Event timestamp is stale or too far in the future.");
  if (
    typeof event.content !== "string" ||
    Buffer.byteLength(event.content, "utf8") > MAX_CONTENT_BYTES
  ) {
    throw new Error("Event content must be a string no larger than 65536 UTF-8 bytes.");
  }
  if (!Array.isArray(event.tags) || event.tags.length > MAX_TAGS)
    throw new Error("Event tags are invalid or exceed the limit.");
  for (const tag of event.tags) {
    if (!Array.isArray(tag) || tag.length === 0 || tag.length > MAX_TAG_PARTS)
      throw new Error("Each event tag must be a non-empty string array.");
    for (const part of tag) {
      if (typeof part !== "string" || Buffer.byteLength(part, "utf8") > MAX_TAG_PART_BYTES) {
        throw new Error("Event tag values must be bounded strings.");
      }
    }
  }
}

export function assertSignedEvent(value: unknown): asserts value is SignedEvent {
  assertNoNsec(value);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Signed event must be an object.");
  if (!exactKeys(value, ["content", "created_at", "id", "kind", "pubkey", "sig", "tags"])) {
    throw new Error("Signed event has unexpected or missing fields.");
  }
  const event = value as SignedEvent;
  if (!HEX_32.test(event.id) || !HEX_32.test(event.pubkey) || !HEX_64.test(event.sig))
    throw new Error("Signed event has malformed identifiers.");
  if (!validateEvent(event) || !verifyEvent(event))
    throw new Error("Signed event failed Nostr hash/signature verification.");
}

export function bindSignedEvent(
  template: EventTemplate,
  signed: SignedEvent,
  expectedPubkey: string,
): void {
  assertEventTemplate(template, template.created_at);
  assertSignedEvent(signed);
  if (signed.pubkey !== expectedPubkey)
    throw new Error("Signer returned an event for a different public key.");
  const returnedTemplate = {
    kind: signed.kind,
    created_at: signed.created_at,
    tags: signed.tags,
    content: signed.content,
  };
  if (canonicalEventTemplate(returnedTemplate) !== canonicalEventTemplate(template)) {
    throw new Error("Signer returned an event that does not match the approved request.");
  }
}

export function canonicalEventTemplate(event: EventTemplate): string {
  return JSON.stringify([event.kind, event.created_at, event.tags, event.content]);
}

export function eventFingerprint(event: EventTemplate): string {
  return createHash("sha256").update(canonicalEventTemplate(event)).digest("hex");
}

export function createKindOneNote(
  content: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): EventTemplate {
  const event = { kind: 1, created_at: nowSeconds, tags: [], content };
  assertEventTemplate(event, nowSeconds);
  return event;
}
