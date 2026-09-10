# Decision log

## D-001 — Skills plus a local stdio MCP server

**Decision:** Package one workflow skill with a TypeScript MCP server. Include both the portable Agent Plugins manifests and the plugin-creator compatibility manifest.

**Why:** Signing and relay work need controlled executable tools; the skill preserves the required user-confirmation sequence. Local stdio is the narrowest runnable Codex shape. Hosted ChatGPT requires a later tunnel or authenticated HTTPS deployment.

## D-002 — `nostr-tools` for protocol cryptography and NIP-46

**Decision:** Pin `nostr-tools` and use its NIP-46 `BunkerSigner`, NIP-44 primitives, event finalization, and signature verification.

**Why:** It avoids handwritten secp256k1, Schnorr, NIP-44, and event-hash code while keeping the dependency boundary reviewable. Local code owns validation, intent binding, expiry, confirmation gates, and relay acknowledgement policy.

## D-003 — No private-key or persistent signer storage

**Decision:** Reject nsec-like input recursively. Use only public NIP-07 results or ephemeral NIP-46 client keys, and keep bridge/session state only in process memory.

**Why:** The private key belongs in the browser extension or remote signer. Non-persistence reduces breach impact and makes stale-session behavior explicit, at the cost of reconnecting after restart or expiry.

## D-004 — Exact prepared-event binding and two user gates

**Decision:** A signing request consumes one fresh intent bound to the canonical unsigned event. Publication is a separate confirmed action using the stored verified event.

**Why:** This prevents the model, transport, or signer response from silently changing reviewed content and avoids conflating signer approval with publication authority.

## D-005 — Local setup page instead of an MCP Apps form in v0.2

**Decision:** Serve a minimal connection page on `127.0.0.1` from the same process. Do not ship an iframe component yet.

**Why:** An ordinary browser page can access the user's installed NIP-07 extension, while an embedded MCP Apps frame does not automatically inherit that browser profile. The same page keeps sensitive `bunker:` entry out of model-visible chat/tool arguments. A future MCP Apps UI needs a reviewed bridge/data path and must still work headlessly.

## D-006 — Safe bounded reads only

**Decision:** Relay queries support only public profile and note events (kinds 0 and 1), at most 50 results and eight relays.

**Why:** It provides useful verification/readback without turning the MVP into a general relay proxy or exposing an unbounded query surface.

## D-007 — NIP-07 browser extension is the primary signer path

**Decision:** Use a loopback-only browser page to bridge MCP requests to `window.nostr`. The user connects the extension once, keeps the page open, reviews the exact queued operation, and explicitly continues it in Alby, nos2x, or another compatible extension.

**Why:** NIP-07 provides the familiar browser approval flow while the private key remains inside the extension. The bridge is transport-only: signed events still pass the same exact-event, pubkey, hash, signature, expiry, and publication gates as NIP-46 results.

## D-008 — No raw-key fallback or hosted secret-key signer

**Decision:** Do not accept an nsec or store a Nostr private key locally, in GitHub secrets, Cloudflare secrets, environment variables, or a database. Keep NIP-46 as the non-browser fallback.

**Why:** Secret managers protect at rest and control retrieval, but signing code must obtain usable key material at runtime. That makes the service custodial and gives a compromised runtime or authorized tool path signing power. NIP-07 and NIP-46 provide easier and safer non-custodial alternatives.
