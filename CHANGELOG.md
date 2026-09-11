# Changelog

## 0.4.0 — 2026-09-10

- Add a loopback-only Grynvault browser handoff for signing into the live account dashboard from the
  Codex in-app browser without exposing a private key.
- Add an experimental NIP-46 remote-signer mode for Noornote, YakiHonne, and compatible clients using
  a one-client, short-lived `bunker://` link.
- Support both NIP-44 and legacy NIP-04 encrypted NIP-46 RPC transport, plus approval-gated event
  signing and NIP-04/NIP-44 encryption operations.
- Add request replay/timestamp/size bounds, one-use connection secrets, permission checks, exact local
  approval, and in-memory key erasure.
- Record live Noornote 1.5.3 and YakiHonne web login interoperability while leaving client-side signing
  and publishing claims unverified.
- Record post-release Chrome-family NIP-07 public-key and signature verification against the same
  identity active in Primal Web 3.0.124, plus the downloadable archive checksum. No event was published.

## 0.3.0 — 2026-09-10

- Prepare a claim-safe local public beta without claiming universal or hosted compatibility.
- Make the release gate portable by removing machine-specific validator paths and adding a repository-local validator.
- Require and smoke-test behavior annotations on every MCP tool.
- Add Node 22/24 CI, compatibility evidence, privacy, terms, support, hosted-service gates, OpenAI submission cases, launch readiness, community drafts, and a production-ready SVG icon.
- Keep npm publication disabled and all public posting/deployment behind explicit owner approval.
- Add signed read-only Grynvault account access and two-stage supporter/NIP-05 invoice tools using the
  existing signer boundary, one-use authorization, a fixed API origin, redirect rejection, and explicit
  pending-versus-settled reporting.

## 0.2.0 — 2026-09-10

- Make the loopback NIP-07 browser-extension bridge the recommended signer path.
- Support Alby, nos2x, and compatible `window.nostr` providers without private-key access.
- Add exact pending-operation review, browser-side continuation/rejection, request serialization, expiry, stale-response rejection, and NIP-44 bridging.
- Add the `get_setup_url` MCP tool and signer-type status.
- Harden the loopback page against DNS rebinding and permit only packaged extension script schemes alongside its nonce-protected application script.
- Explicitly reject raw-key storage in local files, environment variables, GitHub secrets, Cloudflare secrets, or databases.

## 0.1.0 — 2026-09-10

- Initial local NIP-46 signer bridge, exact event validation, relay publication evidence, MCP tools, packaging, tests, and security documentation.
