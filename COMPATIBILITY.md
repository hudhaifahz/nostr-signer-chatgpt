# Compatibility and evidence

This file separates designed compatibility, automated evidence, and live observations. A check mark
means the exact row was observed; it does not imply every version or platform works.

## Current support statement

Nostr Signer is a **public-beta candidate for local desktop use**. It should work wherever all of the
following are true:

- Node.js 22 or later can run a local stdio MCP server.
- The AI host can connect to that local MCP server.
- A Chrome- or Firefox-family browser exposes a compatible NIP-07 `window.nostr` provider.
- The user can keep the loopback approval tab open while signing.

It is not yet a universal ChatGPT-web, mobile, hosted, or unattended-agent signer.

## Evidence matrix

| Surface | Environment | Evidence | Result | Claim allowed |
|---|---|---|---|---|
| Build and MCP tools | macOS arm64, Node 24.7.0 | Automated local gate, 2026-09-10 | Pass | Works in this local environment |
| NIP-07 bridge | Mock extension provider | Automated tests | Pass | Bridge behavior is tested |
| NIP-07 live flow | User's local browser, provider/version not captured | User-reported success, 2026-09-10 | Observed | One live local flow worked; provider-specific compatibility is unconfirmed |
| Alby | Current release | Source/API design review only | Unverified | Intended, not tested |
| nos2x | Current release | Source/API design review only | Unverified | Intended, not tested |
| Firefox-family NIP-07 | Current release | CSP and protocol design only | Unverified | Intended, not tested |
| NIP-46 signers | Current releases | Automated protocol adapter tests only | Unverified | Advanced experimental path |
| Generic NIP-46 client bridge | Mock clients using NIP-04 and NIP-44 RPC transport | Automated connect, reject, public-key discovery, and verified event-signing tests | Pass | Protocol core is tested; named clients still need live evidence |
| Noornote 1.5.3 web | Codex in-app browser, `bunker://`, NIP-04 RPC transport | Live login, 2026-09-10 | Pass | Login interoperability observed; signing and publishing untested |
| YakiHonne web | Codex in-app browser, `bunker://` | Live login, 2026-09-10 | Pass | Login interoperability observed; signing and publishing untested |
| Public relays | Real Internet relays | No captured live ACK/readback | Unverified | Do not claim live publication compatibility |
| ChatGPT Work/web | Remote HTTPS MCP | Not implemented | Not supported | Hosted service is a separate phase |
| Windows / Linux | Node 22+ | Not run on clean machines | Unverified | Community testers wanted |
| Mobile | Mobile browser/AI host | Not implemented or tested | Not supported | Do not advertise |
| OpenClaw bundle | Agent Plugins/Codex bundle mapping | Current documentation review only | Unverified | Package format is intended to load; live install is required |
| Grynvault v117 API | `https://app.frontiercrown.com`, commit `7517fea8…` | Live health check plus exact in-app browser handoff, 2026-09-10 | Pass | Read-only dashboard handoff live; invoice creation was not invoked |

## Live test record template

Copy this section for each result. Never include a private key, seed phrase, NIP-46 pairing secret,
account token, or private message.

```text
Date/time:
Tester alias:
OS and version:
AI host and version:
Browser and version:
Signer and version:
Connection method: NIP-07 | NIP-46
Relay URLs (public only):
Public-key request: pass | reject | timeout
Kind:1 signing: pass | reject | timeout
Returned event hash/signature/pubkey verification: pass | fail
Signer rejection path: pass | fail
Publish ACK by relay: accepted | rejected | timeout | not tested
Independent readback by event ID: pass | fail | not tested
Notes (no secrets):
```

## Promotion rule

A provider moves from **intended** to **tested** only after a complete record names its version,
browser, OS, approval behavior, and cryptographic verification result. A relay publication claim also
requires an acknowledgement and independent readback by event ID.
