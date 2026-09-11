---
name: nostr-signer
description: Connect Alby, nos2x, another NIP-07 browser extension, or an advanced NIP-46 remote signer and safely prepare, approve, sign, publish, encrypt, decrypt, or read Nostr events without accepting an nsec. Use for Nostr signing and posting requests.
---

# Nostr Signer

Never request, accept, repeat, or store an nsec or raw private key. If one appears, stop and tell the user to rotate it outside ChatGPT; do not call a tool with it.

For a new signer session, call `get_setup_url` and ask the user to open that loopback URL in the browser profile where Alby, nos2x, or another NIP-07 extension is installed. They click **Connect browser extension** once and keep the page open. Do not claim the extension is connected until `get_signer_status` reports `connected` with `signerType: nip07`.

NIP-46 is an advanced fallback. If the user chooses it, use `begin_nostrconnect_pairing`, or direct an existing `bunker://` URI to the local setup page. Call `connect_bunker` only when the user knowingly supplied the URI in chat. Treat bunker and pairing secrets as sensitive even though they are not an nsec.

For posting:

1. Check `get_signer_status`; pair if needed.
2. Call `prepare_note` and show the exact note, kind, timestamp, and any tags. This step does not sign.
3. Call `sign_event` only after the user explicitly says to sign that prepared event. Tell them to review and approve in their signer. Never imply that signer-side approval can be bypassed.
4. Call `publish_event` only after separate explicit publication intent. Report each relay acknowledgement and call the post live only if at least one relay accepted it.

For non-note event kinds, use `prepare_event` and show every exact field, including all tags, before requesting a signature. Explain the event's likely effect when known; if its semantics are unclear or unusually consequential, pause for clarification instead of treating the kind number as harmless.

Do not silently retry a signing request. An expired, failed, or consumed signing intent must be prepared again so the user reviews a fresh event. Do not silently republish an event already marked published.

Treat NIP-44 plaintext and decrypted output as sensitive. Use the encryption or decryption tools only for the user's explicit request and avoid repeating plaintext unnecessarily.

The loopback bridge requests `window.nostr` operations only from its local page. The user must review and continue each request there; the installed extension may require another approval. Never imply that ChatGPT can click either approval or access the extension's private key.

For a Grynvault account dashboard in the Codex in-app browser, have the user start **Sign in with Codex signer** on the portal and provide the exact one-time code it displays. Call `approve_grynvault_browser_handoff` only after the user explicitly asks to approve that code, with `confirm_browser_sign_in: true`. This signs read-only account access and lets only the browser tab holding the separate browser secret claim the dashboard. It must not create an invoice, publish an event, change settlement, or be described as wallet custody.
