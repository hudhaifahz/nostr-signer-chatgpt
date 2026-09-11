# Security policy and threat model

## Non-negotiable rule

An `nsec`, raw private key, seed phrase, or signer backup must never enter ChatGPT, Codex, this plugin, its setup UI, tool arguments, telemetry, crash reports, tests, fixtures, or logs. This project has no private-key import feature. If key material reaches any of those surfaces, assume exposure and rotate it in a trusted signer outside this project.

The preferred path uses the NIP-07 `window.nostr` API injected by an installed browser extension. The local page receives only a public key and signed/encrypted results. The advanced path accepts NIP-46 connection material, not signing keys. `bunker:` and `nostrconnect:` secrets are still sensitive bearer-like session material and must not be logged or shared.

Do not put a Nostr private key in GitHub Actions secrets, Cloudflare secrets, environment variables, or an application database for this plugin. Those stores can protect a value at rest, but the service must recover it at runtime to sign; that changes the product into a custodial hot signer and expands the blast radius to deployment credentials, logs, operators, and remote tool calls.

## Assets

- User identity and the signer-controlled private key, which is out of scope and must remain in the signer.
- Ephemeral NIP-46 client key, connection secret, remote signer authorization state, and relay selection.
- Ephemeral third-party-client bridge key, one-use bunker secret, connected client public key, declared
  permissions, and exact queued RPC request.
- NIP-07 browser-extension permission, loopback anti-CSRF token, exact pending operation, and returned result.
- Exact unsigned event reviewed by the user, returned signature, publication intent, and relay acknowledgements.
- NIP-44 plaintext, ciphertext, and decrypted output.
- Availability and integrity of the local MCP process and setup page.

## Trust boundaries

1. **User ↔ ChatGPT/Codex:** the model can propose tool arguments but is not a trusted authority for user intent or event integrity.
2. **ChatGPT/Codex ↔ local MCP process:** every input is untrusted and is validated server-side. Tool confirmation booleans are an application gate, not a substitute for clear user intent.
3. **Local browser ↔ setup page:** the page binds only to loopback, uses a per-process anti-CSRF token, accepts bounded JSON, sends no data to third-party origins, and persists nothing. The NIP-07 bridge works only in a browser profile where a signer injects `window.nostr`.
4. **Plugin ↔ Nostr relays:** relays are untrusted for confidentiality, availability, ordering, completeness, and acknowledgements. NIP-46 payloads are encrypted and events are signature-verified.
5. **Relays ↔ signer:** the signer is the signing authority and must present its own approval UI according to its policy. The plugin cannot and must not bypass it.
6. **Signer and build chain:** the selected NIP-07 extension or NIP-46 signer is trusted to protect the private key and enforce its policy. `nostr-tools`, the MCP SDK, npm packages, and the host runtime are trusted code dependencies and require review and updates.
7. **Plugin ↔ Grynvault API:** the API is a fixed HTTPS destination. Signed account reads and invoice
   writes are authorized with exact short-lived Nostr events; API responses and payment state remain
   untrusted until independently verified.
8. **Third-party Nostr app ↔ client bridge:** the app and its self-reported name are untrusted. The
   bridge binds one approved client public key, validates signed RPC events, decrypts NIP-44 or legacy
   NIP-04 transport, enforces declared permissions when present, and queues sensitive operations for
   local approval before delegating to the actual signer.

## Threats and controls

| Threat | Primary controls | Residual risk |
|---|---|---|
| User pastes an `nsec` | No key field; recursive nsec/key-name rejection; redaction tests | A novel encoding may evade pattern matching; never solicit keys |
| Prompt injection triggers signing | Exact prepare/sign separation; fresh one-use intent; explicit user intent; signer-side approval | A compromised or poorly configured signer may auto-approve |
| Model attempts to approve its own request | NIP-07 approval controls are absent from the MCP tool surface; exact intent gates remain; extension approval is encouraged | A computer-control-capable host, malware, or a compromised local account can operate the page; browser click is not proof of human presence |
| Event changed after review | Canonical fingerprint; immutable stored template; returned-event field equality; hash/signature verification | User may misunderstand displayed content or tags |
| Replay or duplicate action | One-use signing intents; expiry; session generation; already-published guard | A relay or external client may replay valid signed events; Nostr events are inherently replayable |
| Late response bound to new session | NIP-46 request IDs and author filters in the library; local session generation; expected signer pubkey; exact intent binding | Upstream library defects remain possible |
| Relay spoofs signer response | Nostr signature verification, expected author filter, NIP-44 conversation encryption, request ID binding | Relay can delay/drop/correlate traffic |
| Relay falsely reports or withholds publication | Per-relay ACK evidence; success requires one fulfilled ACK; signed event ID returned | ACK does not prove broad propagation or durable retention |
| Correlation/privacy leakage | Minimal relay set; no event-content logs; no persistent session store | Relays observe timing, client/signer pubkeys, and IP metadata |
| Stale session or abandoned pairing | Five-minute pairing timeout; default 30-minute session TTL; restart/disconnect clears memory | Process memory can be inspected by a compromised host |
| Local hostile webpage attacks setup UI | Loopback binding and Host allowlist, anti-CSRF token, strict CSP, no CORS, bounded body, no-store headers | Malware or a compromised local account can attack the process |
| Forged or stale NIP-07 response | One pending request, random request ID, session generation, timeout, expected signer pubkey, exact signed-event verification | A malicious extension with page access can return hostile data, which is rejected when invalid |
| Stolen third-party app link | 192-bit random secret, one successful client binding, 30-minute expiry, local connect approval, secret erased after approval | Anyone who obtains the link before pairing can request connection; verify the displayed client public key |
| Malicious NIP-46 client | Signed/encrypted RPC, one bound client, one queued request, requested-permission enforcement, exact local approval, signer approval, size and timestamp bounds | An approved client may repeatedly prompt, and empty permission declarations rely on per-request approval |
| Legacy NIP-04 transport weaknesses | Used only for NIP-46 RPC compatibility; exact signed event envelope, bound client, short-lived session, per-request approval | NIP-04 lacks NIP-44's modern authenticated-encryption properties; prefer NIP-44 clients when available |
| Sensitive errors/logs | Structured redaction for nsec, URI secrets, bearer tokens, plaintext, and event content; no request-body logging | Dependency-level console output may change; audit upgrades |
| Denial of service | Bounded body, content, tags, relays, filters, query results, and timeouts | Public relays and signers remain availability dependencies |
| Duplicate or falsely settled invoice | Prepare/create separation; one-use operation; exact payload hash; no automatic retry; redirects rejected; pending-only result | A timeout after submission can leave the outcome unknown; inspect the account before retrying |

## Confirmation expectations

- Preparing an event is safe and does not sign or publish.
- `sign_event` requires a fresh prepared intent and explicit user intent. The remote signer must remain free to approve or reject.
- Publication is a separate tool call with separate explicit intent. A signature is never automatically published.
- NIP-44 encryption/decryption requires explicit intent and should not be retried silently after an ambiguous timeout.
- With NIP-07, the user reviews the queued operation in the loopback page and clicks **Continue in extension**. The extension remains free to show and enforce its own approval.
- A third-party NIP-46 client must first receive explicit connect approval. Its client name is
  self-reported and is never sufficient identity evidence. Every event, NIP-04, and NIP-44 request is
  displayed and approved separately.
- Never weaken signer confirmation to improve convenience. Signers that auto-approve are outside the protection this project can provide.

## Replay, timeout, and session rules

- Signing intents expire after two minutes and are consumed before the remote request starts. A timeout or error is terminal; prepare a fresh event.
- The NIP-07 bridge permits one pending operation at a time, binds the response to a random request ID, and rejects stale or duplicate responses.
- The third-party client bridge permits one connected client and one pending request at a time, rejects
  replayed event IDs, ignores requests outside a two-minute timestamp window, consumes the connection
  secret after approval, and erases its ephemeral key on stop or expiry.
- Pairing expires after five minutes. Connected sessions expire after 30 minutes by default.
- A newer pairing/connection generation invalidates late results from older attempts.
- Signed events are replayable Nostr objects. The session prevents this plugin from publishing the same stored intent twice after any successful acknowledgement, but cannot stop other clients or relays from replaying the event.
- A fully failed publication may be explicitly retried with the same signed event during the active session.

## Relay rules

- Use `wss://` in live operation. Plain `ws://` is accepted only for loopback tests.
- Relay URLs with credentials, query strings, or fragments are rejected.
- Keep relay sets small and user-configurable. Do not infer that a no-result query proves an event does not exist.
- Relay ACK means that relay accepted the event at that moment. It does not prove durable retention, propagation, moderation status, or visibility in every client.

## Grynvault account and invoice rules

- Grynvault requests use a fixed HTTPS API origin; callers cannot supply a destination URL.
- Signed HTTP authorization binds kind 27235 to the exact URL, POST method, challenge, and SHA-256 hash
  of the exact JSON body.
- Account-dashboard access requires explicit signature confirmation but is classified read-only and
  cannot create an invoice.
- Supporter and NIP-05 invoice preparation creates only a short-lived local operation. A separate tool
  and separate explicit confirmation are required to sign and submit it.
- An operation is one-use. Ambiguous network outcomes are not retried automatically.
- Redirects are rejected. `pending`, an invoice ID, or a checkout link is never reported as payment,
  settlement, entitlement activation, or NIP-05 activation.
- Supporter plans and paid NIP-05 are separate products; a NIP-05 identifier is not proof of human or
  legal identity, game entitlement, or payment authority.

## Logging and retention

- No raw prompts, event content, tags, NIP-44 plaintext, decrypted output, bunker secret, connection URI, loopback token, auth token, or private-key-like value in logs.
- Public keys, event IDs, relay origins, intent IDs, state transitions, and sanitized error categories may be logged for local diagnosis.
- This release candidate has no telemetry and no persistent application database. All signer/session state is process memory and is discarded on disconnect, expiry, or exit.
- Do not add analytics, crash reporting, or persistent session storage without a new threat-model decision and deletion/retention policy.

## Dependency and release security

- Keep dependencies pinned by `package-lock.json` and review lockfile changes.
- Run `npm audit --omit=dev`, the complete test/check gate, the plugin validator, and manual artifact/secret scans before release.
- Review upstream `nostr-tools` NIP-46 behavior when upgrading, especially request IDs, author filters, NIP-44 encryption, timeouts, and console output.
- Live-test each claimed signer/version and relay set. Mocked integration coverage is not production proof.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/hudhaifahz/nostr-signer-chatgpt/security/advisories/new) and include the affected version, impact, minimal reproduction, and proposed embargo window. Do not include real keys, pairing URIs, tokens, NIP-04/NIP-44 plaintext, or user data. This community public beta has no guaranteed response time; marketplace submission requires published response targets.
