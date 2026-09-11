# Public-beta launch kit

These are drafts, not published posts. Replace every bracketed field, verify every linked destination,
and capture the live compatibility evidence before posting.

## Claim-safe one-liner

Nostr Signer is a free, open-source local plugin that lets an AI prepare Nostr events while you approve
signatures in your own NIP-07 browser extension—without giving the AI your private key.

## Product Hunt

**Tagline (57 characters):** Let your AI use Nostr without giving it your private key

**Description:**

Nostr Signer connects ChatGPT Work or Codex to a user-controlled NIP-07 browser extension through a
loopback-only approval page. Your AI can prepare an exact event, you approve the signature in your
extension, and publishing requires a separate confirmation. It is free, open source, and currently a
local desktop public beta.

**Maker comment:**

I built Nostr Signer after running into a bad choice: either paste a Nostr private key into an AI
workflow or operate a separate remote signer flow that felt too technical for everyday use. This
project takes a simpler route. The AI prepares the event, a local page shows the exact pending action,
and Alby, nos2x, or another compatible NIP-07 extension remains the signer.

The hard boundary is the point: the plugin has no private-key field, signing and publishing are
separate, and a post is not called live until a relay acknowledges it. The current release is a local
desktop beta, not a universal hosted service. I would especially value compatibility reports that name
the browser, signer version, OS, and exact result.

Try it: `[REPOSITORY OR PRODUCT URL]`

## Stacker News

**Title:** Show SN: A local signer bridge so AI agents never need your Nostr private key

**Body:**

I wanted an AI to help draft and publish Nostr events, but I did not want an `nsec` in a prompt,
environment variable, GitHub secret, or hosted database.

Nostr Signer is the local, open-source result. The AI prepares an exact event; a loopback page in your
extension-enabled browser shows the pending operation; your NIP-07 signer approves or rejects it; and
publishing is a separate confirmed step. The service verifies the returned event hash, signature, and
pubkey before it can be published.

What is real today: the MCP surface, security gates, simulated flow, and local NIP-07 bridge are tested,
and one live local flow has been reported. What is not proven yet: a versioned Alby/nos2x matrix,
Windows/Linux coverage, public-relay readback, or a hosted ChatGPT-web service.

Source and setup: `[REPOSITORY URL]`

I would value blunt feedback on the signing UX and threat model. If you test it, please include browser,
OS, signer/version, whether the extension prompted, signature verification, and relay ACK/readback.

## OpenClaw community

**Title:** Show and tell: Nostr signing for agents, with the key kept in a browser extension

**Body:**

I made a free local MCP signer bridge for agent workflows. It lets an agent prepare a Nostr event while
the user keeps the private key in a NIP-07 extension. Every signature is bound to an exact reviewed
event, the browser page requires a user continuation, and publish is a separate action.

The current package uses the Agent Plugin/Codex bundle layout that OpenClaw documents loading, with a
local stdio MCP server and bundled signer skill. That installation path still needs a real OpenClaw
test. I would like OpenClaw builders to report install, tool-discovery, signer, and restart results
without weakening the no-`nsec`, no-unattended-signing boundary.

Repository: `[REPOSITORY URL]`
Compatibility matrix: `[COMPATIBILITY URL]`
Security model: `[SECURITY URL]`

## Nostr announcement

Built a free, open-source local bridge that lets an AI prepare Nostr events while your browser extension
keeps the key and approves the signature. Exact-event review, separate publish confirmation, no `nsec`
field. Public-beta candidate; compatibility testers wanted. `[URL]`

## Launch order

1. Publish a public repository and immutable `v0.3.0` release artifact labeled **local public beta**.
2. Ask 5–10 technical testers for versioned compatibility reports.
3. Fix release-blocking results and publish the tested matrix.
4. Post the technical launch on Stacker News and Nostr.
5. Validate the current bundle with OpenClaw, run the ClawHub publish dry-run, then share in the
   appropriate OpenClaw community channel and ClawHub with its local-beta limits stated plainly.
6. Launch on Product Hunt only when the repository/product URL, logo, screenshots, support path, and
   clean-machine onboarding are live.

Use one canonical URL and channel tags such as `utm_source=stackernews`, `utm_source=nostr`,
`utm_source=openclaw`, and `utm_source=producthunt`. Do not use referral links or duplicate/repetitive
posts.

## Reply bank

**Does it work with Alby or nos2x?**

It uses the standard NIP-07 browser API those extensions are designed to expose, but we are still
collecting versioned live results. Please treat the named integrations as intended compatibility until
your browser/signer row is marked tested.

**Can I paste my private key instead?**

No. If a private key has been pasted into an AI chat or form, treat it as exposed and rotate it using a
trusted signer.

**Is there a hosted version?**

Not yet. The hosted design keeps signing in the browser extension, but it still needs per-user OAuth,
session isolation, abuse controls, privacy/retention work, and independent review.

**Can an agent sign unattended?**

That is deliberately outside this product's safety boundary. The signer remains the final approval
point.
