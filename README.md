# Nostr Signer for ChatGPT and Codex

A local-first, open-source signer bridge that lets ChatGPT Work or Codex request Nostr signatures from Alby, nos2x, another NIP-07 browser extension, or an advanced NIP-46 remote signer. The signer keeps the private key. This project never needs, accepts, stores, logs, or transmits an `nsec`.

> Release status: v0.2.0 local release candidate. The simulated path and loopback bridge are tested. Live compatibility with current extension releases, NIP-46 signers, and public relays still needs to be recorded.

## The ordinary-user journey

1. Install and start the plugin locally.
2. Open the local setup page at `http://127.0.0.1:34846/` in the Chrome or Firefox profile where Alby, nos2x, or another NIP-07 signer is installed.
3. Click **Connect browser extension** once and approve public-key access in the extension. Keep this page open.
4. Ask ChatGPT or Codex to prepare a Nostr note.
5. Review the exact note. Tell ChatGPT or Codex to request the signature.
6. The local page shows the exact pending operation. Click **Continue in extension**, then approve in the extension if it asks.
7. Separately tell ChatGPT or Codex to publish. A post is reported live only when at least one relay acknowledges it.

Never paste an `nsec`, raw private key, seed phrase, or backup into ChatGPT, Codex, the setup page, or a tool call. If an `nsec` was exposed, rotate it in a trusted signer outside this project.

## Architecture

```mermaid
flowchart LR
  U[User] --> C[ChatGPT Work or Codex]
  U --> E[Alby, nos2x, or NIP-07 extension]
  U --> S[Advanced NIP-46 signer]
  C -->|focused MCP tools| P[Local plugin process]
  B[Local approval page\n127.0.0.1 only] <--> P
  B -->|window.nostr request| E
  E -->|signed or encrypted result| B
  P -->|NIP-46 encrypted requests| R[(Configured Nostr relays)]
  R -->|NIP-46 events| S
  S -->|approve or reject| R
  P -->|verified signed event\nafter separate publish intent| R

  K[nsec] -. remains inside signer .-> E
  K -. remains inside signer .-> S
```

The code separates the signer interface, session/intent state, relay gateway, MCP adapter, and local UI. A future MCP Apps component, WebMCP site tool, hardware signer, or different transport can reuse the service layer without changing event-validation policy.

## What is implemented

- Primary NIP-07 bridge for Alby, nos2x, and compatible extensions: one local connection, one queued approval at a time, random request IDs, stale-response rejection, and no private-key access.
- Advanced `bunker://` and client-generated `nostrconnect://` flows using `nostr-tools` NIP-46 support.
- `get_public_key`, exact generic-event and kind:1 preparation, bound `sign_event`, `nip44_encrypt`, `nip44_decrypt`, separately confirmed `publish_event`, and bounded relay reads for kinds 0 and 1.
- Exact unsigned-event validation, signature/hash verification, signer-pubkey binding, one-use signing intents, timeouts, session expiry, and stale-pairing rejection.
- Per-relay publication acknowledgements. No success claim when every relay rejects or times out.
- In-memory-only signer sessions. Restarting or disconnecting forgets pairing material and prepared events.
- A localhost-only setup page with a per-process anti-CSRF token, request size limit, no external scripts, and no persistence.
- Redacted structured logs and hard rejection of `nsec`-like input.
- Portable Agent Plugins manifests plus the scaffolded Codex compatibility manifest.
- A deterministic safe simulated signer/relay path for CI and onboarding.

## Local setup

Requirements: Node.js 22 or later and npm.

```bash
npm install
cp .env.example .env
npm run build
npm start
```

Set `NOSTR_RELAYS` to comma-separated `wss://` relay URLs before live pairing or publication. The example file contains starting values, not an availability guarantee. `ws://` is rejected except for `localhost`/loopback test relays.

The setup page binds to and accepts only `127.0.0.1`. Open it in the browser profile containing your NIP-07 extension—not the Codex in-app browser unless that browser actually has such an extension. Connect once and keep the tab open while signing. The page queues the exact request and requires a browser-side click before calling `window.nostr`. That interaction gate is not proof of human presence when the host also has browser automation, so the extension's own approval policy remains the final protection.

The advanced section accepts a `bunker:` URI only in memory and never logs it. A generated `nostrconnect:` URI contains an ephemeral pairing secret; treat it as sensitive and do not post it publicly.

## Local demo

The safe onboarding demo exercises prepare → sign → verify → publish entirely in memory:

```bash
npm run demo
```

The output includes a simulated public key, event ID, and relay acknowledgement. It does not prove compatibility with a live signer or public relay.

To inspect the real MCP tool surface locally:

```bash
npm run build
npx @modelcontextprotocol/inspector node mcp/server.mjs
```

To connect this checkout directly to a local Codex host without installing a marketplace package:

```bash
codex mcp add nostr-signer -- node /absolute/path/to/nostr-signer-chatgpt/mcp/server.mjs
```

Then restart the ChatGPT desktop app/Codex host and use `/mcp` or MCP settings to verify the server. For a packaged install, use the included `plugin.json`, `mcp.json`, `.codex-plugin/plugin.json`, `.mcp.json`, skill, and committed `mcp/server.mjs` bundle in a local marketplace. The current OpenAI documentation distinguishes local Codex stdio support from ChatGPT web: ChatGPT Work/web needs a registered remote HTTPS MCP endpoint or Secure MCP Tunnel. This repository does not create or publish either.

Relevant OpenAI guidance: [plugin packaging](https://developers.openai.com/plugins/build/plugins), [connecting and testing](https://developers.openai.com/plugins/deploy/connect-chatgpt), and [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp).

## Example conversation

> You: Connect my signer safely.
>
> Assistant: Open the local setup URL in the browser profile where Alby or nos2x is installed, click **Connect browser extension**, and approve public-key access. I will wait for the signer status to become connected.
>
> You: Prepare “Hello Nostr” as a note.
>
> Assistant: Here is the exact kind:1 event preview. It is not signed or published. Should I request its signature?
>
> You: Yes, request the signature.
>
> Assistant: The exact request is waiting on the local page. Click **Continue in extension**, then approve in the extension. The verified event will remain signed but not published until you separately tell me to publish.
>
> You: Publish it.
>
> Assistant: Relay A accepted the event; Relay B timed out. The event is live on at least Relay A.

## Tools and safety gates

| Tool | Purpose | Gate |
|---|---|---|
| `get_setup_url` | Return the loopback extension/setup page | None |
| `get_signer_status` | Read in-memory connection state | None |
| `begin_nostrconnect_pairing` | Advanced: create an ephemeral pairing URI | User initiates pairing; signer approves |
| `connect_bunker` | Advanced: connect an existing bunker URI | Prefer localhost UI; signer approves |
| `get_public_key` | Read the signer-exposed public key | Active session |
| `prepare_note` | Bind an exact kind:1 event | No signing or network write |
| `prepare_event` | Bind any exact valid event template | No signing or network write; show every field |
| `sign_event` | Sign exactly one prepared intent | Explicit tool confirmation and signer approval |
| `publish_event` | Publish the verified stored event | Separate explicit confirmation |
| `nip44_encrypt` / `nip44_decrypt` | Ask signer for NIP-44 operation | Explicit confirmation; no plaintext logging |
| `query_events` | Read verified public kind 0/1 events | Bounded filters and result count |
| `disconnect_signer` | Forget session and intents | Explicit confirmation |

## Signer status

| Signer | Intended connection | Automated evidence | Live evidence in this RC |
|---|---|---|---|
| Simulated signer | In-process test adapter | Passing | Not a live signer |
| Alby | NIP-07 browser bridge | Bridge tests only | Not live-tested |
| nos2x | NIP-07 browser bridge | Bridge tests only | Not live-tested |
| Amber | NIP-46 / bunker-compatible target | Protocol path only | Not tested |
| nsec.app | NIP-46 / bunker-compatible target | Protocol path only | Not tested |
| Clave | NIP-46 / bunker-compatible target | Protocol path only | Not tested |
| Other bunker-compatible signers | `bunker:` or `nostrconnect:` | Protocol path only | Not tested |

“Intended” is not a compatibility claim. Record signer/version, pairing mode, relay set, requested method, approval UI, returned event verification, and publication acknowledgement before changing a signer to “tested.”

## How the NIP-07 bridge works

NIP-07 defines `window.nostr.getPublicKey()`, `window.nostr.signEvent()`, and optional encryption methods for browser pages. The plugin does not inject or impersonate an extension. Its loopback page detects the API supplied by an installed signer, sends one reviewed request to it, and returns the result to the same verification pipeline used by NIP-46. The [NIP-07 specification](https://nips.nostr.com/7) defines the standard interface.

The extension decides whether to prompt, approve, or reject. Multiple installed signer extensions can contend for `window.nostr`; use a dedicated browser profile if selection is ambiguous.

## Why there is no private-key fallback

GitHub and Cloudflare secret stores protect values at rest, but signing code must recover usable key material at runtime. That would turn this plugin into a remotely custodial hot signer and expand signing authority to deployment credentials, operators, and any compromised runtime. Local encrypted storage has the same runtime-unlock problem. This project therefore keeps the private key in the user's extension or remote signer.

## Troubleshooting

- **No relays are configured:** copy `.env.example` to `.env`, or provide relays to the pairing tool. The included start command loads `.env` when it exists.
- **No extension is detected:** copy the setup URL into the Chrome or Firefox profile where Alby or nos2x is installed and unlocked, then reload the page. The Codex in-app browser normally does not share those extensions.
- **More than one extension is installed:** disable the unwanted signer for this site or use a browser profile with only the intended extension.
- **A request is waiting:** keep the setup page open, review the displayed operation, click **Continue in extension**, and complete any extension prompt. Do not silently retry after a timeout.
- **Pairing stays pending:** verify the exact relay set is reachable by both client and signer, approve in the signer, and retry with a fresh URI after five minutes. Pairing URIs are one-session secrets.
- **Signer request times out:** check signer connectivity and relay reachability. Prepare a new event; do not silently retry an ambiguous signing request.
- **All publish acknowledgements fail:** the signed event is retained for an explicit retry during the same session. Check relay policy, authentication requirements, and network access.
- **Setup page will not start:** another process may own port 34846. Set `NOSTR_SETUP_PORT` to a free local port.
- **ChatGPT web cannot reach the server:** stdio is local-host only. Use a reviewed Secure MCP Tunnel for development or deploy an authenticated streamable-HTTP server before hosted use.

## Developer commands

| Command | Result |
|---|---|
| `npm run format` | Format source, tests, and manifests |
| `npm run format:check` | Check formatting without writing |
| `npm run lint` | Run static lint rules |
| `npm run typecheck` | Strict TypeScript check |
| `npm test` | Run unit and mocked integration tests |
| `npm run build` | Type-check and create the committed standalone `mcp/server.mjs` entrypoint |
| `npm start` | Start the real MCP server and local setup page |
| `npm run demo` | Run the fully simulated end-to-end demo |
| `npm run smoke:bundle` | Start the distributable bundle and verify its MCP tools |
| `npm run validate:skill` | Validate the bundled Nostr operating skill |
| `npm run validate:plugin` | Run the installed plugin-creator validator |
| `npm run check` | Run the complete release-candidate gate |

See `VALIDATION.md` for the exact local evidence and its limits.

## Limitations and roadmap

- Live Alby, nos2x, NIP-46 signer, and relay compatibility is not yet proven.
- Sessions are deliberately non-persistent; reconnect after every process restart or expiry.
- The NIP-07 browser tab must remain open because browser extensions expose `window.nostr` only to browser pages.
- An MCP Apps iframe is not used for signing because it does not automatically inherit the user's ordinary browser extensions or their permission model.
- Signer `auth_url` challenges are not surfaced in v0.2.0; NIP-46 signers that rely on them may not complete pairing.
- NIP-46 relay authentication, signer relay switching, offline queues, multi-account selection, and automatic event discovery are not included.
- ChatGPT Work/web needs a remote/tunneled MCP transport, authentication, privacy disclosures, and workspace/public review.
- Future work: real compatibility matrix, native-browser handoff helper, authenticated streamable HTTP, WebMCP/site-tools adapter, and optional hardware-backed local signer adapter that still never exports a private key.

## License

Apache License 2.0. It is permissive for broad reuse while adding an explicit patent grant and preserving license/notice obligations—useful for a security-sensitive interoperability project that may attract multiple implementations.

## Contributing and security

Read `CONTRIBUTING.md`, `SECURITY.md`, `DECISIONS.md`, `MARKETPLACE_CHECKLIST.md`, and `THIRD_PARTY_NOTICES.md` before changing protocol, trust-boundary, packaging, or dependency code.
