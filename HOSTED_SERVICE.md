# Free hosted service design

This is the implementation contract for a future hosted edition. It is not a description of the
current local plugin.

## Product boundary

The recommended public offering has two editions:

| Edition | Who runs the bridge | Key custody | Current state |
|---|---|---|---|
| Free local plugin | Each user | Browser extension or NIP-46 signer | Public-beta candidate |
| Free hosted bridge | Project operator | Browser extension only; service never receives an `nsec` | Designed, not implemented |

"Free" means no user subscription is planned for the beta. It does not mean hosting has no operator
cost or that unlimited usage can be promised.

## Hosted user journey

1. The AI host begins the standard MCP OAuth flow.
2. The authorization page asks the user's NIP-07 extension to sign a short-lived Nostr login
   challenge. There is no separate username, password, or custodial Nostr account.
3. The authorization server verifies that signature and issues a scoped OAuth token binding the AI
   connection to that Nostr public key.
4. The plugin returns a short-lived signer-page link or QR code.
5. The user opens that HTTPS page in a browser profile containing the same NIP-07 identity.
6. The page connects to the same authenticated, tenant-isolated session.
7. The AI prepares an exact event and displays it for review.
8. The signer page displays the same event and requires a click before invoking the extension.
9. The extension approves or rejects and returns only the public key or signed event.
10. Publishing remains a separate explicit action, with per-relay acknowledgements returned.

The service must reject raw private keys at every public boundary. GitHub Secrets, Cloudflare Secrets,
environment variables, databases, and local encrypted files are not acceptable Nostr-key stores for
this product because the server would need recoverable signing authority at runtime.

## Architecture

```mermaid
flowchart LR
  A[AI host] -->|OAuth access token + HTTPS MCP| M[Remote MCP gateway]
  B[Extension-enabled browser] -->|Nostr-signed login + short-lived session| W[Signer web page]
  W -->|WebSocket/SSE| Q[Ephemeral session coordinator]
  M --> Q
  W -->|NIP-07| E[User's signer extension]
  M -->|after separate publish approval| R[(Allowlisted relays)]

  K[nsec] -. remains inside extension .-> E
```

## Required controls

| ID | Requirement | Launch evidence |
|---|---|---|
| HS-001 | Stable public HTTPS streamable-MCP endpoint | External initialization and tool-discovery capture |
| HS-002 | MCP OAuth 2.1 authorization-code flow with PKCE; its authorization page authenticates the user with a fresh Nostr signature | Positive, replay, wrong-pubkey, expired-token, wrong-scope, and logout tests |
| HS-003 | One user and one signer page per isolated session | Cross-tenant access test |
| HS-004 | Short-lived, single-use browser pairing codes | Replay and expiry tests |
| HS-005 | No endpoint, schema, log, metric, or backup accepts an `nsec` | Encoded-secret red-team suite and log review |
| HS-006 | Exact event equality, hash, signature, and signer-pubkey verification | Tamper and signer-mismatch tests |
| HS-007 | Separate sign and publish confirmations | Negative review cases and audit events |
| HS-008 | Fixed relay allowlist for hosted beta | SSRF and unsupported-scheme tests |
| HS-009 | Per-user and per-IP rate limits, event-size bounds, and abuse response | Load, spam, and denial tests |
| HS-010 | Ephemeral draft/session data with documented TTL and deletion | Durable readback showing expiry and deletion |
| HS-011 | Redacted logs; no raw drafts, ciphertext plaintext, tokens, or pairing secrets | Production log sampling |
| HS-012 | Monitoring, dependency alerts, rollback, incident response, and status page | Recovery drill |
| HS-013 | Public support, privacy, terms, security, and data-deletion URLs | Live URL checks |
| HS-014 | Accurate annotations on every MCP tool | OpenAI Scan Tools output |
| HS-015 | Five positive and three negative reviewer-ready test cases | Recorded expected and actual responses |

## Deliberate v1 exclusions

- No pasted or uploaded private keys.
- No server-side key generation or custody.
- No NIP-44 encrypt/decrypt in the hosted beta; those calls can expose message plaintext to the service
  even when the Nostr private key stays in the extension.
- No arbitrary user-supplied relay URLs.
- No hosted Grynvault invoice tool until payment-flow abuse limits and account-link privacy are reviewed.
- No unattended/background signing.
- No mobile compatibility claim.
- No promise of permanent free or unlimited service.

## Identity model

OAuth is the compatibility envelope between a remote MCP client and the hosted service; it is not a
second user identity. The only end-user login should be a fresh, domain-bound Nostr challenge approved
by the user's signer. The resulting access token identifies the verified Nostr public key and carries
short-lived scopes such as account read, event preparation, or invoice creation. It must never contain
or grant direct access to a private key.

The local stdio plugin does not need this envelope because the MCP process, approval page, and AI host
run on the same machine. It uses the connected signer public key and per-operation signatures directly.

## Delivery stages and gates

### H1 — Private hosted alpha

Implement HS-001 through HS-008 behind an allowlist. Gate H1 passes only when two separate accounts
cannot observe or complete each other's operations and no secret-shaped input reaches logs.

### H2 — Security and operations

Implement HS-009 through HS-012, commission an independent review, run a rollback/recovery drill, and
publish the retention/deletion behavior. Gate H2 passes only with written reviewer approval and
captured operational evidence.

### H3 — Public beta and plugin review

Publish HS-013 materials, complete HS-014 and HS-015, verify the publisher and domain, and submit the
remote MCP server through the OpenAI plugin portal. Gate H3 passes only after approval and a clean
production smoke test using a non-production Nostr identity.

## Hosting choice

A Cloudflare Worker plus a per-session Durable Object is a plausible coordinator, but it is not yet a
selected or deployed architecture. The decision must be based on current WebSocket/session behavior,
data residency, abuse controls, observability, deletion semantics, and measured beta cost. Whichever
platform is selected, its secret manager may hold the authorization server's own signing and
deployment credentials—not users' Nostr private keys.
