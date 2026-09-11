# Privacy notice — local public beta

Effective date: 2026-09-10

Nostr Signer v0.3.0 is local software, not a hosted service. This notice describes the code in this
repository. Any future hosted edition must publish its own operator identity, subprocessors, retention
periods, deletion process, and jurisdiction-specific disclosures before accepting users.

## What the local plugin handles

- Public keys exposed by the user's signer.
- Unsigned and signed Nostr events the user asks the AI to prepare, sign, or publish.
- Relay URLs and relay responses.
- Grynvault challenges, selected supporter plan or NIP-05 name, signed HTTP authorization, and the
  account/invoice response when the user explicitly invokes those tools.
- NIP-44 plaintext or ciphertext only when the user explicitly invokes those advanced tools.
- Short-lived pairing/session metadata held in process memory.

## What it does not collect

- No Nostr private key, seed phrase, or backup is requested or accepted.
- No analytics, advertising identifier, crash-reporting service, or remote telemetry is included.
- No account database or cloud storage is included.
- No local session is restored after the process exits.

## Storage and logs

Signer sessions, browser requests, and prepared events are held in memory and disappear on disconnect,
expiry, or process exit. Structured logs redact known sensitive values and do not intentionally record
event content, pairing URIs, NIP-44 plaintext, tokens, or private keys. The AI host, browser extension,
terminal host, operating system, and selected Nostr relays have their own data practices.

## Network destinations

The NIP-07 setup page listens only on `127.0.0.1`. Live pairing, reads, and publishing contact only the
Nostr relays configured by the user or installation. Grynvault tools contact the fixed
`https://app.frontiercrown.com` origin after the user invokes them. The software
does not send data to a project-owned analytics service.

## Your control

Disconnect the signer or stop the process to clear in-memory state. Remove the plugin configuration and
checkout to uninstall it. Nostr events accepted by public relays may be copied or retained by those
relays and cannot be reliably deleted by this local software.

## Contact

Before public distribution, the release owner must replace this section with a verified private support
and privacy contact. Do not send private keys, seed phrases, pairing secrets, tokens, or private-message
plaintext in a report.
