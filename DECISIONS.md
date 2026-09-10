# Decision log

## D-001 — Skills plus a local stdio MCP server

**Decision:** Package one workflow skill with a TypeScript MCP server. Include both the portable Agent Plugins manifests and the plugin-creator compatibility manifest.

**Why:** Signing and relay work need controlled executable tools; the skill preserves the required user-confirmation sequence. Local stdio is the narrowest runnable Codex shape. Hosted ChatGPT requires a later tunnel or authenticated HTTPS deployment.

## D-002 — `nostr-tools` for protocol cryptography and NIP-46

**Decision:** Pin `nostr-tools` and use its NIP-46 `BunkerSigner`, NIP-44 primitives, event finalization, and signature verification.

**Why:** It avoids handwritten secp256k1, Schnorr, NIP-44, and event-hash code while keeping the dependency boundary reviewable. Local code owns validation, intent binding, expiry, confirmation gates, and relay acknowledgement policy.

## D-003 — No private-key or persistent signer storage

**Decision:** Reject nsec-like input recursively. Generate NIP-46 client keys at runtime and keep signer/session state only in process memory.

**Why:** The private key belongs in the remote signer. Non-persistence reduces breach impact and makes stale-session behavior explicit, at the cost of reconnecting after restart or expiry.

## D-004 — Exact prepared-event binding and two user gates

**Decision:** A signing request consumes one fresh intent bound to the canonical unsigned event. Publication is a separate confirmed action using the stored verified event.

**Why:** This prevents the model, transport, or signer response from silently changing reviewed content and avoids conflating signer approval with publication authority.

## D-005 — Local setup page instead of an MCP Apps form in v0.1

**Decision:** Serve a minimal connection page on `127.0.0.1` from the same process. Do not ship an iframe component yet.

**Why:** `bunker:` URIs contain sensitive connection material. The local page keeps direct-pairing entry out of model-visible chat/tool arguments. A future MCP Apps UI needs a reviewed bridge/data path and must still work headlessly.

## D-006 — Safe bounded reads only

**Decision:** Relay queries support only public profile and note events (kinds 0 and 1), at most 50 results and eight relays.

**Why:** It provides useful verification/readback without turning the MVP into a general relay proxy or exposing an unbounded query surface.
