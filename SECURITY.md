# Security policy and threat model

## Non-negotiable rule

An `nsec`, raw private key, seed phrase, or signer backup must never enter ChatGPT, Codex, this plugin, its setup UI, tool arguments, telemetry, crash reports, tests, fixtures, or logs. This project has no private-key import feature. If key material reaches any of those surfaces, assume exposure and rotate it in a trusted signer outside this project.

The plugin accepts NIP-46 connection material, not signing keys. `bunker:` and `nostrconnect:` secrets are still sensitive bearer-like session material and must not be logged or shared.

## Assets

- User identity and the signer-controlled private key, which is out of scope and must remain in the signer.
- Ephemeral NIP-46 client key, connection secret, remote signer authorization state, and relay selection.
- Exact unsigned event reviewed by the user, returned signature, publication intent, and relay acknowledgements.
- NIP-44 plaintext, ciphertext, and decrypted output.
- Availability and integrity of the local MCP process and setup page.

## Trust boundaries

1. **User ↔ ChatGPT/Codex:** the model can propose tool arguments but is not a trusted authority for user intent or event integrity.
2. **ChatGPT/Codex ↔ local MCP process:** every input is untrusted and is validated server-side. Tool confirmation booleans are an application gate, not a substitute for clear user intent.
3. **Local browser ↔ setup page:** the page binds only to loopback, uses a per-process anti-CSRF token, accepts bounded JSON, sends no data to third-party origins, and persists nothing.
4. **Plugin ↔ Nostr relays:** relays are untrusted for confidentiality, availability, ordering, completeness, and acknowledgements. NIP-46 payloads are encrypted and events are signature-verified.
5. **Relays ↔ signer:** the signer is the signing authority and must present its own approval UI according to its policy. The plugin cannot and must not bypass it.
6. **Dependencies/build chain:** `nostr-tools`, the MCP SDK, npm packages, and the host runtime are trusted code dependencies and require review and updates.

## Threats and controls

| Threat | Primary controls | Residual risk |
|---|---|---|
| User pastes an `nsec` | No key field; recursive nsec/key-name rejection; redaction tests | A novel encoding may evade pattern matching; never solicit keys |
| Prompt injection triggers signing | Exact prepare/sign separation; fresh one-use intent; explicit user intent; signer-side approval | A compromised or poorly configured signer may auto-approve |
| Event changed after review | Canonical fingerprint; immutable stored template; returned-event field equality; hash/signature verification | User may misunderstand displayed content or tags |
| Replay or duplicate action | One-use signing intents; expiry; session generation; already-published guard | A relay or external client may replay valid signed events; Nostr events are inherently replayable |
| Late response bound to new session | NIP-46 request IDs and author filters in the library; local session generation; expected signer pubkey; exact intent binding | Upstream library defects remain possible |
| Relay spoofs signer response | Nostr signature verification, expected author filter, NIP-44 conversation encryption, request ID binding | Relay can delay/drop/correlate traffic |
| Relay falsely reports or withholds publication | Per-relay ACK evidence; success requires one fulfilled ACK; signed event ID returned | ACK does not prove broad propagation or durable retention |
| Correlation/privacy leakage | Minimal relay set; no event-content logs; no persistent session store | Relays observe timing, client/signer pubkeys, and IP metadata |
| Stale session or abandoned pairing | Five-minute pairing timeout; default 30-minute session TTL; restart/disconnect clears memory | Process memory can be inspected by a compromised host |
| Local hostile webpage attacks setup UI | Loopback binding, anti-CSRF token, strict CSP, no CORS, bounded body, no-store headers | Malware or a compromised local account can attack the process |
| Sensitive errors/logs | Structured redaction for nsec, URI secrets, bearer tokens, plaintext, and event content; no request-body logging | Dependency-level console output may change; audit upgrades |
| Denial of service | Bounded body, content, tags, relays, filters, query results, and timeouts | Public relays and signers remain availability dependencies |

## Confirmation expectations

- Preparing an event is safe and does not sign or publish.
- `sign_event` requires a fresh prepared intent and explicit user intent. The remote signer must remain free to approve or reject.
- Publication is a separate tool call with separate explicit intent. A signature is never automatically published.
- NIP-44 encryption/decryption requires explicit intent and should not be retried silently after an ambiguous timeout.
- Never weaken signer confirmation to improve convenience. Signers that auto-approve are outside the protection this project can provide.

## Replay, timeout, and session rules

- Signing intents expire after two minutes and are consumed before the remote request starts. A timeout or error is terminal; prepare a fresh event.
- Pairing expires after five minutes. Connected sessions expire after 30 minutes by default.
- A newer pairing/connection generation invalidates late results from older attempts.
- Signed events are replayable Nostr objects. The session prevents this plugin from publishing the same stored intent twice after any successful acknowledgement, but cannot stop other clients or relays from replaying the event.
- A fully failed publication may be explicitly retried with the same signed event during the active session.

## Relay rules

- Use `wss://` in live operation. Plain `ws://` is accepted only for loopback tests.
- Relay URLs with credentials, query strings, or fragments are rejected.
- Keep relay sets small and user-configurable. Do not infer that a no-result query proves an event does not exist.
- Relay ACK means that relay accepted the event at that moment. It does not prove durable retention, propagation, moderation status, or visibility in every client.

## Logging and retention

- No raw prompts, event content, tags, NIP-44 plaintext, decrypted output, bunker secret, connection URI, auth token, or private-key-like value in logs.
- Public keys, event IDs, relay origins, intent IDs, state transitions, and sanitized error categories may be logged for local diagnosis.
- This release candidate has no telemetry and no persistent application database. All signer/session state is process memory and is discarded on disconnect, expiry, or exit.
- Do not add analytics, crash reporting, or persistent session storage without a new threat-model decision and deletion/retention policy.

## Dependency and release security

- Keep dependencies pinned by `package-lock.json` and review lockfile changes.
- Run `npm audit --omit=dev`, the complete test/check gate, the plugin validator, and manual artifact/secret scans before release.
- Review upstream `nostr-tools` NIP-46 behavior when upgrading, especially request IDs, author filters, NIP-44 encryption, timeouts, and console output.
- Live-test each claimed signer/version and relay set. Mocked integration coverage is not production proof.

## Reporting a vulnerability

This is a local release candidate and does not yet publish a security mailbox. Report privately to the local project maintainer and include the affected version, impact, minimal reproduction, and proposed embargo window. Do not include real keys, pairing URIs, tokens, NIP-44 plaintext, or user data. Before any public or marketplace release, the release owner must add and verify a private security contact and response targets.
