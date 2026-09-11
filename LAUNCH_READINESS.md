# Launch readiness

Assessment date: 2026-09-10

## Decision

| Release | Decision | Reason |
|---|---|---|
| Public GitHub source beta | **Live** | Public repository and v0.4.0 prerelease are available; claims remain limited to a local public beta |
| Versioned downloadable local plugin | **Ready** | The v0.4.0 archive, checksum, extracted-manifest validation, and bundled-server startup passed |
| OpenAI public plugin directory | **Not ready** | Requires production HTTPS MCP, verified identity/domain, public URLs, operational controls, and live review cases; the beta intentionally has no OAuth |
| Free hosted service | **Prototype** | Accountless Streamable HTTP bridge and isolated capability sessions work locally; public HTTPS, capacity controls, monitoring, multi-instance routing, and review remain |
| Claim that it "works for all" | **No** | Browser, signer, OS, relay, mobile, and hosted coverage is not universal |
| Community announcement posts | **Live** | Owner-approved event was accepted and independently read back from three public relays |

## Public-beta release gates

| ID | Gate | State |
|---|---|---|
| PB-001 | Portable install/build/test commands with no developer-specific paths | Passed on detached clean package |
| PB-002 | Consistent v0.4.0 manifests, source version, changelog, and package metadata | Prepared |
| PB-003 | Every MCP tool declares read-only, destructive, and open-world behavior | Passed bundled smoke test |
| PB-004 | CI on Node 22 and 24 | Public GitHub Actions run passed |
| PB-005 | No-key boundary, exact-event binding, separate publish confirmation | Implemented and automated tests exist |
| PB-006 | Privacy, terms, support, security, contribution, and compatibility documents | Prepared; owner contact still required |
| PB-007 | Live extension matrix on two current browser/signer combinations | Open |
| PB-008 | Public-relay ACK plus independent event-ID readback with a test identity | Open |
| PB-009 | Clean-machine macOS plus Windows or Linux onboarding | Open |
| PB-010 | Final publisher name, repository URL, support/security contact, and screenshots | Owner input required |
| PB-011 | Immutable tester archive with checksum; SBOM/provenance decision recorded for broad release | Archive and checksum prepared; provenance decision remains open for broad release |
| PB-012 | Explicit owner approval for repository push, release, and each public post | Required immediately before each external action |

## Minimum proud-to-share standard

Do not post broadly until PB-007 through PB-011 are complete. A smaller tester invitation can go out
after PB-001 through PB-006 pass, provided it says **local public beta**, names the unverified areas,
uses a test Nostr identity, and does not promise provider-wide compatibility.

## Owner-supplied facts

- Public publisher name or verified business name.
- GitHub organization/account and repository name.
- Public homepage and documentation domain, if separate from GitHub.
- Private security contact and public support contact.
- Countries/regions intended for a later hosted service.
- Whether the beta is an individual/community project or a company offering.

## External actions deliberately not taken

The public repository and v0.4.0 prerelease were published. No OpenAI catalog submission, hosted
endpoint, external account registration, or community post was created. Those actions should use the
finished materials here only after their identity and approval gates are satisfied.
