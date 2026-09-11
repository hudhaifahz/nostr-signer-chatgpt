# Changelog

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
