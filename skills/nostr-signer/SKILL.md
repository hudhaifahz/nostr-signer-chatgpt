---
name: nostr-signer
description: Connect a user-controlled NIP-46 signer and safely prepare, approve, sign, publish, encrypt, decrypt, or read Nostr events without accepting an nsec. Use for Nostr signing and posting requests; do not use as a NIP-07 browser extension.
---

# Nostr Signer

Never request, accept, repeat, or store an nsec or raw private key. If one appears, stop and tell the user to rotate it outside ChatGPT; do not call a tool with it.

For a new signer session, prefer `begin_nostrconnect_pairing` so the user can approve in their own signer. If the user already has a `bunker://` URI, direct them to the local setup page; call `connect_bunker` only when they knowingly supplied the URI in chat. Treat bunker and pairing secrets as sensitive even though they are not an nsec.

For posting:

1. Check `get_signer_status`; pair if needed.
2. Call `prepare_note` and show the exact note, kind, timestamp, and any tags. This step does not sign.
3. Call `sign_event` only after the user explicitly says to sign that prepared event. Tell them to review and approve in their signer. Never imply that signer-side approval can be bypassed.
4. Call `publish_event` only after separate explicit publication intent. Report each relay acknowledgement and call the post live only if at least one relay accepted it.

For non-note event kinds, use `prepare_event` and show every exact field, including all tags, before requesting a signature. Explain the event's likely effect when known; if its semantics are unclear or unusually consequential, pause for clarification instead of treating the kind number as harmless.

Do not silently retry a signing request. An expired, failed, or consumed signing intent must be prepared again so the user reviews a fresh event. Do not silently republish an event already marked published.

Treat NIP-44 plaintext and decrypted output as sensitive. Use the encryption or decryption tools only for the user's explicit request and avoid repeating plaintext unnecessarily.

NIP-07 is a separate browser-extension interface. This plugin does not inject `window.nostr`, impersonate an extension, or grant arbitrary third-party pages access to the signer.
