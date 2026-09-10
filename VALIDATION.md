# Local validation record

Validated on 2026-09-10 in a local macOS checkout. This record distinguishes simulated evidence from live interoperability evidence.

## Environment

- macOS Darwin 24.6.0 arm64
- Node.js 24.7.0 (project minimum: 22)
- npm 11.5.1
- Release candidate: 0.1.0

## Passing release gate

`npm run check` passed with:

- Biome formatting and lint checks: clean
- strict TypeScript check: clean
- Vitest: 5 files and 17 tests passed
- TypeScript compilation and esbuild release bundle: passed
- spawned stdio smoke test: the committed bundle exposed all 12 intended MCP tools
- Nostr skill validator: passed
- Agent Plugin validator: passed

Additional checks passed:

- `npm audit --audit-level=moderate`: 0 known vulnerabilities
- simulated end-to-end demo: prepared, signed, signature-verified, published, acknowledged, and queried a kind:1 event entirely in memory
- package dry run: included portable and Codex manifests, skill, source, tests, documentation, third-party license texts, and the standalone MCP bundle
- manual secret-pattern scan: no embedded nsec-like key, private-key block, or API-key-shaped fixture found outside dependencies/generated output
- local setup UI: returned HTTP 200 from `127.0.0.1:34846`, with `no-store`, frame denial, referrer protection, and loopback-only listener confirmed

## Release artifact

- Entrypoint: `mcp/server.mjs`
- Size: 964,678 bytes
- SHA-256: `bc9a64fdeefea92c1559ee6f1888b7f2458a9a53a0d2dae28ab2be31438f9ad1`
- Third-party bundle inventory: 13 packages with preserved license texts

## What this proves

The local implementation, security gates, simulated protocol-independent flow, MCP transport, manifest structure, package contents, and ordinary-user setup page work in this environment. The private signing key is absent from every designed input and state path; signing is delegated through NIP-46.

## What remains unproven

- No real Amber, nsec.app, Clave, or other bunker-compatible signer was paired during this validation.
- No event was published to a public relay.
- ChatGPT Work/web remote HTTPS or Secure MCP Tunnel connectivity was not configured or tested.
- Marketplace installation and public distribution were deliberately not performed.

Before making any signer-specific compatibility claim, execute and record the live matrix in `MARKETPLACE_CHECKLIST.md` without using production keys or accounts.
