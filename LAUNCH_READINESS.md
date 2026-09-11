# Launch readiness

Assessment date: 2026-09-10

## Decision

| Release | Decision | Reason |
|---|---|---|
| Public GitHub source beta | **Ready after owner fills identity/repository fields and approves publication** | Local implementation, package, tests, license, docs, and launch copy are prepared |
| Versioned downloadable local plugin | **Ready for a labeled tester beta after clean-package validation** | Build is portable; provider-specific and OpenClaw live evidence remains incomplete |
| OpenAI public plugin directory | **Not ready** | Requires hosted HTTPS MCP, verified identity/domain, Nostr-backed MCP OAuth, public URLs, review credentials, and live review cases |
| Free hosted service | **Not ready** | Architecture exists; authentication, tenant isolation, operations, privacy, abuse controls, and review are not implemented |
| Claim that it "works for all" | **No** | Browser, signer, OS, relay, mobile, and hosted coverage is not universal |
| Community announcement posts | **Drafted, not published** | Final URLs, release artifact, screenshots, and owner approval are still needed |

## Public-beta release gates

| ID | Gate | State |
|---|---|---|
| PB-001 | Portable install/build/test commands with no developer-specific paths | Prepared; rerun on clean checkout |
| PB-002 | Consistent v0.3.0 manifests, source version, changelog, and package metadata | Prepared |
| PB-003 | Every MCP tool declares read-only, destructive, and open-world behavior | Prepared; smoke test required |
| PB-004 | CI on Node 22 and 24 | Workflow prepared; not proven until public repository run |
| PB-005 | No-key boundary, exact-event binding, separate publish confirmation | Implemented and automated tests exist |
| PB-006 | Privacy, terms, support, security, contribution, and compatibility documents | Prepared; owner contact still required |
| PB-007 | Live extension matrix on two current browser/signer combinations | Open |
| PB-008 | Public-relay ACK plus independent event-ID readback with a test identity | Open |
| PB-009 | Clean-machine macOS plus Windows or Linux onboarding | Open |
| PB-010 | Final publisher name, repository URL, support/security contact, and screenshots | Owner input required |
| PB-011 | Immutable tester archive with checksum; SBOM/provenance decision recorded for broad release | Prepare archive now; finalize provenance before broad release |
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

No repository was pushed, release was published, plugin submission was created, hosted endpoint was
deployed, account was registered, or community post was sent. Those actions should use the finished
materials here only after their target URLs and identity are final.
