import { createHash } from "node:crypto";
import { verifyEvent } from "nostr-tools";
import { describe, expect, it } from "vitest";
import { GrynvaultApiClient, GrynvaultService } from "../src/grynvault.js";
import { Nip07Bridge } from "../src/nip07.js";
import { SimulatedRelayGateway } from "../src/relays.js";
import { SafeLogger } from "../src/security.js";
import { NostrSignerService } from "../src/service.js";
import { SignerSession } from "../src/session.js";
import { SimulatedSigner, type Nip46SignerFactory } from "../src/signers.js";
import type { SignedEvent } from "../src/types.js";

type SeenRequest = { url: string; init: RequestInit | undefined };

async function harness(payloads: Array<{ status?: number; payload: unknown }>) {
  const seen: SeenRequest[] = [];
  const request = (async (input: URL | RequestInfo, init?: RequestInit) => {
    seen.push({ url: String(input), init });
    const next = payloads.shift();
    if (!next) throw new Error("Unexpected Grynvault test request.");
    return new Response(JSON.stringify(next.payload), {
      status: next.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  const logger = new SafeLogger(() => {});
  const session = new SignerSession(logger);
  const signer = new NostrSignerService(
    session,
    {} as Nip46SignerFactory,
    new Nip07Bridge(),
    new SimulatedRelayGateway(),
    [],
  );
  await session.attach(new SimulatedSigner());
  const api = new GrynvaultApiClient("https://grynvault.test", request);
  return { api, grynvault: new GrynvaultService(signer, api), seen };
}

function signedAuthorization(request: SeenRequest): SignedEvent {
  const header = new Headers(request.init?.headers).get("Authorization");
  expect(header).toMatch(/^Nostr /u);
  return JSON.parse(Buffer.from(header?.slice(6) ?? "", "base64").toString("utf8")) as SignedEvent;
}

function tag(event: SignedEvent, name: string) {
  return event.tags.find((entry) => entry[0] === name)?.[1];
}

describe("Grynvault signed account and invoice operations", () => {
  it("retrieves a signed read-only dashboard without creating an invoice", async () => {
    const challenge = "a".repeat(64);
    const { grynvault, seen } = await harness([
      {
        payload: {
          challenge,
          authUrl: "https://grynvault.test/api/supporter/account",
        },
      },
      {
        payload: {
          pubkey: "account pubkey is returned by production",
          supporter: null,
          nip05: [],
        },
      },
    ]);

    await expect(grynvault.accountDashboard(false)).rejects.toThrow(/confirmation/iu);
    const dashboard = await grynvault.accountDashboard(true);
    expect(dashboard).toMatchObject({
      access: "read_only",
      invoiceCreated: false,
      settlementChanged: false,
    });
    expect(seen).toHaveLength(2);
    const event = signedAuthorization(seen[1] as SeenRequest);
    expect(verifyEvent(event)).toBe(true);
    expect(event.kind).toBe(27_235);
    expect(tag(event, "u")).toBe("https://grynvault.test/api/supporter/account");
    expect(tag(event, "challenge")).toBe(challenge);
    expect(tag(event, "payload")).toBe(
      createHash("sha256").update(JSON.stringify({ challenge })).digest("hex"),
    );
  });

  it("prepares separately, then creates one pending supporter invoice", async () => {
    const challenge = "b".repeat(64);
    const { grynvault, seen } = await harness([
      {
        payload: {
          challenge,
          authUrl: "https://grynvault.test/api/supporter/checkout",
        },
      },
      {
        status: 201,
        payload: {
          id: "payment-1",
          plan: "member_monthly",
          satsTotal: 2_100,
          invoiceId: "invoice-1",
          checkoutLink: "https://pay.grynvault.test/i/invoice-1",
          status: "pending",
        },
      },
    ]);

    const prepared = await grynvault.prepareSupporterInvoice("member_monthly");
    expect(prepared.price).toEqual({ sats: 2_100, cadence: "30_days" });
    expect(prepared.state).toBe("prepared");
    expect(seen).toHaveLength(1);
    await expect(grynvault.createSupporterInvoice(prepared.operationId, false)).rejects.toThrow(
      /confirmation/iu,
    );
    expect(seen).toHaveLength(1);

    const created = await grynvault.createSupporterInvoice(prepared.operationId, true);
    expect(created).toMatchObject({
      status: "pending",
      sats: 2_100,
      invoiceCreated: true,
      paid: false,
      settled: false,
      entitlementActive: false,
    });
    const event = signedAuthorization(seen[1] as SeenRequest);
    const expectedHash = createHash("sha256")
      .update(JSON.stringify({ challenge, plan: "member_monthly" }))
      .digest("hex");
    expect(tag(event, "payload")).toBe(expectedHash);
    await expect(grynvault.createSupporterInvoice(prepared.operationId, true)).rejects.toThrow(
      /already used/iu,
    );
  });

  it("binds a one-time donation amount into the exact signed payload", async () => {
    const challenge = "d".repeat(64);
    const { grynvault, seen } = await harness([
      {
        payload: {
          challenge,
          authUrl: "https://grynvault.test/api/supporter/checkout",
        },
      },
      {
        status: 201,
        payload: {
          id: "payment-donation",
          plan: "basic_once",
          satsTotal: 2_121,
          invoiceId: "invoice-donation",
          checkoutLink: "https://pay.grynvault.test/i/invoice-donation",
          status: "pending",
        },
      },
    ]);

    await expect(grynvault.prepareSupporterInvoice("basic_once")).rejects.toThrow(/21 through/iu);
    const prepared = await grynvault.prepareSupporterInvoice("basic_once", 2_121);
    expect(prepared.request.body).toEqual({
      challenge,
      plan: "basic_once",
      donationSats: 2_121,
    });
    await grynvault.createSupporterInvoice(prepared.operationId, true);
    const event = signedAuthorization(seen[1] as SeenRequest);
    const expectedHash = createHash("sha256")
      .update(JSON.stringify({ challenge, plan: "basic_once", donationSats: 2_121 }))
      .digest("hex");
    expect(tag(event, "payload")).toBe(expectedHash);
  });

  it("checks a name and creates a separate 2,000-sat NIP-05 invoice", async () => {
    const challenge = "c".repeat(64);
    const { grynvault, seen } = await harness([
      {
        payload: {
          name: "alice",
          identifier: "alice@frontiercrown.com",
          available: true,
          sats: 2_000,
        },
      },
      {
        payload: {
          challenge,
          authUrl: "https://grynvault.test/api/supporter/nip05/checkout",
        },
      },
      {
        status: 201,
        payload: {
          id: "nip05-1",
          name: "alice",
          identifier: "alice@frontiercrown.com",
          sats: 2_000,
          invoiceId: "invoice-nip05",
          checkoutLink: "https://pay.grynvault.test/i/invoice-nip05",
          status: "pending",
        },
      },
    ]);

    const prepared = await grynvault.prepareNip05Invoice("Alice");
    expect(prepared.identifier).toBe("alice@frontiercrown.com");
    expect(prepared.price).toEqual({ sats: 2_000, cadence: "once" });
    const created = await grynvault.createNip05Invoice(prepared.operationId, true);
    expect(created).toMatchObject({
      identifier: "alice@frontiercrown.com",
      sats: 2_000,
      status: "pending",
      settled: false,
    });
    expect(seen).toHaveLength(3);
    expect(seen[0]?.url).toContain("name=Alice");
  });

  it("rejects redirects instead of treating them as invoice or settlement evidence", async () => {
    const request = (async () =>
      new Response(JSON.stringify({ location: "https://pay.example" }), {
        status: 302,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
    const api = new GrynvaultApiClient("https://grynvault.test", request);
    await expect(api.supporterChallenge()).rejects.toThrow(/no invoice or settlement is assumed/iu);
  });

  it("rejects a challenge that points at the wrong action or origin", async () => {
    const request = (async () =>
      new Response(
        JSON.stringify({
          challenge: "e".repeat(64),
          authUrl: "https://attacker.example/api/supporter/account",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;
    const api = new GrynvaultApiClient("https://grynvault.test", request);
    await expect(api.accountChallenge()).rejects.toThrow(/unexpected authorization URL/iu);
  });
});
