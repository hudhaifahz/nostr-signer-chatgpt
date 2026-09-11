# Grynvault integration contract

Implemented against CrownFrontier v115 at `https://api.frontiercrown.com`. The production owner reports
the API/dashboard live at exact commit `84e5b7cbe91bdbbdd0118228e3bd4156e8411b65`. An independent GET
probe from this environment still received DNS `ENOTFOUND` on 2026-09-10, so the contract is passing
against a mock server but its signed production round-trip is not proven here. Validation sends no
signed POST and creates no invoice.

## MCP tools

| Tool | Input | External effect |
|---|---|---|
| `get_grynvault_account_dashboard` | `{ "confirm_account_access": true }` | Signs and performs a read-only account POST; no invoice |
| `prepare_grynvault_supporter_invoice` | Monthly: `{ "plan": "member_monthly" }`; donation: `{ "plan": "basic_once", "donation_sats": 21..1000000 }` | Fetches a purpose-bound challenge and prepares an exact auth event; no signature or invoice |
| `create_grynvault_supporter_invoice` | `{ "operation_id": "<uuid>", "confirm_invoice_creation": true }` | Signs and submits exactly one prepared supporter request; returns pending only |
| `prepare_grynvault_nip05_invoice` | `{ "name": "alice" }` | Checks availability, fetches a purpose-bound challenge, and prepares the exact 2,000-sat request; no reservation or invoice |
| `create_grynvault_nip05_invoice` | `{ "operation_id": "<uuid>", "confirm_invoice_creation": true }` | Signs and submits exactly one prepared NIP-05 request; returns pending only |

## HTTP exchanges

### Read-only dashboard

1. `GET /api/supporter/account/challenge` returns `{ "challenge": "<64 hex>", "authUrl": "https://api.frontiercrown.com/api/supporter/account" }`.
2. Sign the exact POST body `{ "challenge": "<same value>" }`.
3. `POST <authUrl>` with that JSON body and the Nostr authorization.

The response contains only the signing pubkey's membership, badges, totals, payment history, and NIP-05
history. The plugin labels it `access: "read_only"`, `invoiceCreated: false`, and
`settlementChanged: false`.

### Supporter donation or membership invoice

1. `GET /api/supporter/challenge` returns a purpose-bound challenge and checkout `authUrl`.
2. Prepare exactly one of:

```json
{"challenge":"<64 hex>","plan":"basic_once","donationSats":2100}
```

```json
{"challenge":"<64 hex>","plan":"member_monthly"}
```

3. Only after separate confirmation, sign and `POST <authUrl>`.

One-time donations are integers from 21 through 1,000,000 sats. The monthly invoice is fixed at 2,100
sats for 30 days.

### Paid NIP-05 invoice

1. `GET /api/supporter/nip05/availability?name=<candidate>` returns the normalized name, identifier,
   availability, and fixed `sats: 2000`.
2. `GET /api/supporter/nip05/challenge` returns a purpose-bound challenge and checkout `authUrl`.
3. Prepare `{ "challenge": "<64 hex>", "name": "<normalized lowercase name>" }`.
4. Only after separate confirmation, sign and `POST <authUrl>`.

Supporter status and NIP-05 are separate. A NIP-05 identifier is not proof of human identity, legal
identity, entitlement, or payment authority.

## Nostr authorization

Every POST sends `Authorization: Nostr <base64-json-event>`. The unsigned event template is:

```json
{
  "kind": 27235,
  "created_at": 0,
  "content": "",
  "tags": [
    ["u", "<exact returned authUrl>"],
    ["method", "POST"],
    ["challenge", "<exact challenge>"],
    ["payload", "<sha256 of exact JSON.stringify body>"]
  ]
}
```

`created_at` is replaced by the fresh Unix timestamp used for the real request. Each challenge is
five-minute, single-use, and purpose-bound; the plugin additionally gives prepared auth events a
55-second local expiry. It verifies the signer pubkey, event fields, ID, and signature before sending.

## Payment truth

The create tools report only that an invoice was created with `status: "pending"`. They explicitly
return `paid: false`, `settled: false`, and `entitlementActive: false`. Redirects are rejected and an
ambiguous network outcome is never retried automatically. BTCPay settlement must be independently
confirmed through the account dashboard or a dedicated settlement-status contract before activation is
claimed.
