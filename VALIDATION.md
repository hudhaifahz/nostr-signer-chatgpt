# Local validation record

Validated on 2026-09-10 in a local macOS checkout. This record distinguishes simulated evidence from live interoperability evidence.

## Environment

- macOS Darwin 24.6.0 arm64
- Node.js 24.7.0 (project minimum: 22)
- npm 11.5.1
- Release candidate: 0.3.0

## Passing release gate

`npm run check` passed with:

- Biome formatting and lint checks: clean
- strict TypeScript check: clean
- Vitest: 8 files and 27 tests passed
- TypeScript compilation and esbuild release bundle: passed
- spawned stdio smoke test: the committed bundle exposed all 18 intended MCP tools with complete behavior annotations
- repository-local release validator: passed
- Nostr skill validator: passed for v0.3.0
- Agent Plugin validator: passed for v0.3.0

Additional checks passed:

- `npm audit --audit-level=moderate`: 0 known vulnerabilities
- simulated end-to-end demo: prepared, signed, signature-verified, published, acknowledged, and queried a kind:1 event entirely in memory
- NIP-07 bridge integration: connected by public key, queued an exact event over the loopback HTTP boundary, rejected unauthenticated access, returned an extension-produced signature, and passed it through the normal verification pipeline
- package dry run: included portable and Codex manifests, skill, source, tests, documentation, third-party license texts, and the standalone MCP bundle
- detached clean-package simulation: copied only releasable source (no Git metadata, dependencies,
  outputs, or work files), installed from the lockfile, then passed the complete release gate
- manual secret-pattern scan: no embedded nsec-like key, private-key block, or API-key-shaped fixture found outside dependencies/generated output
- local setup UI: returned HTTP 200 from `127.0.0.1:34846`, with `no-store`, frame denial, referrer protection, and loopback-only listener confirmed

## Release artifact

- Entrypoint: `mcp/server.mjs`
- Size: 991,566 bytes
- SHA-256: `220dd9854fc838e357b9ba2d7299f82e3b81fd8f971873cf412dfa9f90cdfaad`
- Third-party bundle inventory: 13 packages with preserved license texts

## What this proves

The local implementation, security gates, simulated protocol-independent flow, NIP-07 loopback request bridge, MCP transport, manifest structure, package contents, ordinary-user setup page, and exact mocked Grynvault v115 exchanges work in this environment. The private signing key is absent from every designed input and state path; signing is delegated through NIP-07 or NIP-46.

## What remains unproven

- No current Alby, nos2x, or other real NIP-07 extension was connected during automated validation.
- No real Amber, nsec.app, Clave, or other bunker-compatible signer was paired during this validation.
- No event was published to a public relay.
- ChatGPT Work/web remote HTTPS or Secure MCP Tunnel connectivity was not configured or tested.
- OpenClaw installation and tool discovery were not available to test in this environment.
- The production Grynvault v116 health check and an ephemeral signed, read-only account canary passed
  at commit `ea6880a2…`; the single-use challenge replay was rejected with 401. The plugin's invoice
  creation tools were not invoked against production, and no invoice was created.
- Marketplace installation and public distribution were deliberately not performed.

One live local NIP-07 flow was reported by the user on 2026-09-10, but the browser, extension, and
versions were not captured. That observation is not enough for a named provider claim. Before making
one, execute and record the live matrix in `COMPATIBILITY.md` without using production keys or accounts.
