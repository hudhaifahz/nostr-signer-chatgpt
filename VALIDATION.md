# Local validation record

Validated on 2026-09-10 in a local macOS checkout. This record distinguishes simulated evidence from live interoperability evidence.

## Environment

- macOS Darwin 24.6.0 arm64
- Node.js 24.7.0 (project minimum: 22)
- npm 11.5.1
- Release candidate: 0.4.0

## Passing release gate

`npm run check` passed with:

- Biome formatting and lint checks: clean
- strict TypeScript check: clean
- Vitest: 9 files and 32 tests passed
- TypeScript compilation and esbuild release bundle: passed
- spawned stdio smoke test: the bundle exposed all 19 intended MCP tools with complete behavior annotations
- repository-local release validator: passed
- Nostr skill validator: passed for v0.4.0
- Agent Plugin validator: passed for v0.4.0

Additional checks passed:

- `npm audit --audit-level=moderate`: 0 known vulnerabilities
- simulated end-to-end demo: prepared, signed, signature-verified, published, acknowledged, and queried a kind:1 event entirely in memory
- NIP-07 bridge integration: connected by public key, queued an exact event over the loopback HTTP boundary, rejected unauthenticated access, returned an extension-produced signature, and passed it through the normal verification pipeline
- third-party NIP-46 client bridge: NIP-04 and NIP-44 encrypted handshake tests, one-client binding,
  rejection, public-key discovery, exact event approval, and returned signature verification passed
- public-relay interoperability: a standard `nostr-tools` BunkerSigner connected across `nos.lol`,
  `nostr.mom`, and `relay.primal.net`, discovered the expected public key, and received a verified signed
  kind:1 event through encrypted NIP-46 RPC; that kind:1 event was not published as a public note
- live in-app browser login: Noornote 1.5.3 completed its legacy NIP-04 encrypted NIP-46 handshake and
  reported authentication success; YakiHonne web completed the same `bunker://` flow and navigated to
  its signed-in home page. No post, follow, DM, encryption request, or publication was attempted.
- package dry run: included portable and Codex manifests, skill, source, tests, documentation, third-party license texts, and the standalone MCP bundle
- detached clean-package simulation: copied only releasable source (no Git metadata, dependencies,
  outputs, or work files), installed from the lockfile, then passed the complete release gate
- manual secret-pattern scan: no embedded nsec-like key, private-key block, or API-key-shaped fixture found outside dependencies/generated output
- local setup UI: returned HTTP 200 from `127.0.0.1:34846`, with `no-store`, frame denial, referrer protection, and loopback-only listener confirmed
- live Chrome-family NIP-07 signing: the signer exposed public key `0ab377…9b5bd`, matching the active
  Primal Web 3.0.124 profile. User-approved kind 22242 and kind 1 events returned through the packaged
  MCP server; their event IDs recomputed exactly and their Schnorr signatures independently verified.
  Neither event was published.
- release bundle: `nostr-signer-chatgpt-0.4.0.tgz` unpacked cleanly, passed the Agent Plugin validator,
  and started its bundled server on an alternate loopback port. SHA-256:
  `75d2c2cc7070ce0a15dbc122c479c312919279ff4160ed9e7e1993c335ce95a5`.

## Release artifact

- Entrypoint: `mcp/server.mjs`
- Size: 1,035,669 bytes
- SHA-256: `7186638ac7a89623873d6779a479c30c7870796ff10f60615abd90adf3bee20e`
- Third-party bundle inventory: 13 packages with preserved license texts

## What this proves

The local implementation, security gates, simulated protocol-independent flow, NIP-07 loopback request
bridge, third-party NIP-46 client bridge, MCP transport, manifest structure, package contents,
ordinary-user setup page, and exact mocked Grynvault exchanges work in this environment. The private
signing key is absent from every designed input and state path; signing is delegated through NIP-07 or
NIP-46.

## What remains unproven

- A real NIP-07 extension completed public-key and signing requests, but its product name/version was
  not captured. Alby- and nos2x-specific claims remain unverified.
- No real Amber, nsec.app, Clave, or other bunker-compatible signer was paired during this validation.
- Public announcement event `4d34405ebb3063ddad99e6c41b258172fe4699a86179d62e507fc6c4c0b21703`
  was accepted by `nos.lol`, `nostr.mom`, and `relay.primal.net`; independent exact-ID readback and
  signature verification succeeded on all three relays.
- The accountless hosted transport gave two MCP clients distinct 256-bit pairing capabilities; both
  signer pages loaded and an unknown capability returned 404. Public HTTPS remains untested.
- OpenClaw installation and tool discovery were not available to test in this environment.
- The production Grynvault v117 health check and exact in-app browser handoff passed at commit
  `7517fea8…`. The plugin's invoice creation tools were not invoked against production, and no invoice
  was created.
- The personal Codex marketplace installation is live locally. The hosted transport is implemented,
  but production deployment and public catalog submission were not performed.

One live local NIP-07 flow was observed on 2026-09-10, but the extension name/version was not captured.
That observation is not enough for a named provider claim. Noornote and YakiHonne login compatibility
is observed, but their signing and publication operations remain unverified. Before extending either
claim, execute and record the live matrix in `COMPATIBILITY.md` without using production keys or
accounts.
