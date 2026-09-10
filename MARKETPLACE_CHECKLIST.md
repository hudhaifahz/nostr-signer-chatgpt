# Marketplace and publication checklist

This checklist is deliberately not complete in v0.1.0. Public submission requires a separate human approval.

## Security and privacy

- [ ] Independent review of NIP-46 request/response binding, signer pubkey binding, replay handling, timeouts, and relay behavior.
- [ ] Dependency, lockfile, license, static-analysis, secret-scan, and production build review.
- [ ] Live test that an `nsec` is never requested or accepted, and red-team encoded/private-key variants.
- [ ] Publish and verify a private security-reporting contact with response targets.
- [ ] Publish privacy and retention disclosures covering model-visible tool inputs, relay metadata, local logs, and any hosted service.
- [ ] If hosted, add authentication, tenant isolation, rate limits, abuse controls, encrypted storage policy, deletion, monitoring, and incident response.

## Signer and relay evidence

- [ ] Record signer name/version, pairing mode, OS/device, relay set, connection approval, `get_public_key`, kind:1 signature, rejection path, NIP-44 operations, and disconnect.
- [ ] Verify returned event fields, hash, signature, signer public key, and one-use intent behavior.
- [ ] Record at least two relay ACK outcomes and independent readback by event ID; distinguish ACK from durable propagation.
- [ ] Test timeout, offline signer, stale pairing, mismatched signer, relay rejection, malformed response, and all-relays-failed behavior.
- [ ] Update the README compatibility table using only captured evidence.

## Product metadata and assets

- [ ] Final publisher identity, repository, homepage, support, security, privacy, and terms URLs.
- [ ] Final display name, short/long descriptions, capability labels, starter prompts, icon, light/dark logo, and screenshots.
- [ ] Accessibility, localization, small-window, dark-mode, and no-custom-UI fallbacks reviewed.
- [ ] No secrets, personal identifiers, real notes, or production signer screens in assets.

## Packaging and validation

- [ ] Semver release selected; manifests and server report the same version.
- [ ] `npm ci`, format, lint, typecheck, tests, build, plugin validator, MCP Inspector, and package-content inspection pass from a clean checkout.
- [ ] Portable Agent Plugins manifests and OpenAI compatibility overlay validate on target surfaces.
- [ ] Hosted streamable-HTTP endpoint or reviewed Secure MCP Tunnel passes initialization, tool discovery, schema, auth, and confirmation tests.
- [ ] `.app.json` contains the correct registered MCP technical ID when ChatGPT developer registration exists.
- [ ] SBOM/provenance and third-party notices prepared if required.

## Approval gates

- [ ] Security reviewer approval.
- [ ] Privacy/legal approval for disclosures and Apache-2.0 distribution.
- [ ] Product owner approval of capability scope and signer UX.
- [ ] Workspace administrator approval for private workspace publication, if used.
- [ ] Explicit release-owner approval before any external repository push, marketplace submission, workspace publication, announcement, or user onboarding.
