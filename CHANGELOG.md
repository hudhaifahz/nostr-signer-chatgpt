# Changelog

## 0.2.0 — 2026-09-10

- Make the loopback NIP-07 browser-extension bridge the recommended signer path.
- Support Alby, nos2x, and compatible `window.nostr` providers without private-key access.
- Add exact pending-operation review, browser-side continuation/rejection, request serialization, expiry, stale-response rejection, and NIP-44 bridging.
- Add the `get_setup_url` MCP tool and signer-type status.
- Harden the loopback page against DNS rebinding and permit only packaged extension script schemes alongside its nonce-protected application script.
- Explicitly reject raw-key storage in local files, environment variables, GitHub secrets, Cloudflare secrets, or databases.

## 0.1.0 — 2026-09-10

- Initial local NIP-46 signer bridge, exact event validation, relay publication evidence, MCP tools, packaging, tests, and security documentation.
