import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { assertNoNsec } from "./security.js";
import type { NostrSignerService } from "./service.js";
import type { EventTemplate, SignedEvent } from "./types.js";

export const GRYNVAULT_API_BASE = "https://api.frontiercrown.com";
const AUTH_KIND = 27_235;
const AUTH_TTL_MS = 55_000;
const RESPONSE_LIMIT = 256_000;

const hex64 = z.string().regex(/^[0-9a-f]{64}$/u);
const httpsUrl = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:");
const challengeSchema = z.object({ challenge: hex64, authUrl: httpsUrl });
const availabilitySchema = z.object({
  name: z.string(),
  identifier: z.string(),
  available: z.boolean(),
  sats: z.literal(2_000),
});
const pendingInvoiceSchema = z
  .object({
    id: z.string().min(1),
    invoiceId: z.string().min(1),
    checkoutLink: httpsUrl,
    status: z.literal("pending"),
    satsTotal: z.number().int().positive().optional(),
    sats: z.number().int().positive().optional(),
    plan: z.enum(["basic_once", "member_monthly"]).optional(),
    name: z.string().optional(),
    identifier: z.string().optional(),
  })
  .passthrough();
const accountSchema = z.record(z.unknown());

export type GrynvaultPlan = "basic_once" | "member_monthly";
type RequestBody = Record<string, string | number>;
export type GrynvaultOperationView = {
  operationId: string;
  type: "supporter_invoice" | "nip05_invoice";
  state: "prepared" | "submitting" | "submitted" | "failed" | "outcome_unknown";
  request: { url: string; method: "POST"; body: RequestBody };
  signingIntentId: string;
  signingEvent: EventTemplate;
  expiresAt: string;
  price: { sats: number; cadence: "once" | "30_days" };
  identifier?: string;
};

type OperationRecord = GrynvaultOperationView & { expiresAtMs: number };
type FetchLike = typeof fetch;

function payloadHash(body: RequestBody): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

function authEvent(url: string, body: RequestBody, nowMs: number): EventTemplate {
  const challenge = body.challenge;
  if (typeof challenge !== "string") throw new Error("Grynvault challenge is missing.");
  return {
    kind: AUTH_KIND,
    created_at: Math.floor(nowMs / 1_000),
    tags: [
      ["u", url],
      ["method", "POST"],
      ["challenge", challenge],
      ["payload", payloadHash(body)],
    ],
    content: "",
  };
}

function authorization(event: SignedEvent): string {
  return `Nostr ${Buffer.from(JSON.stringify(event), "utf8").toString("base64")}`;
}

function safeApiCode(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9_-]{1,80}$/iu.test(value)) return "request_failed";
  return value;
}

export class GrynvaultApiClient {
  private readonly base: URL;

  constructor(
    baseUrl = GRYNVAULT_API_BASE,
    private readonly request: FetchLike = fetch,
    private readonly timeoutMs = 15_000,
  ) {
    this.base = new URL(baseUrl);
    if (this.base.protocol !== "https:" && this.base.hostname !== "127.0.0.1") {
      throw new Error("The Grynvault API must use HTTPS.");
    }
  }

  endpoint(path: string): string {
    return new URL(path, this.base).toString();
  }

  async supporterChallenge() {
    return this.challenge("/api/supporter/challenge", "/api/supporter/checkout");
  }

  async accountChallenge() {
    return this.challenge("/api/supporter/account/challenge", "/api/supporter/account");
  }

  async nip05Challenge() {
    return this.challenge("/api/supporter/nip05/challenge", "/api/supporter/nip05/checkout");
  }

  async nip05Availability(name: string) {
    const url = new URL("/api/supporter/nip05/availability", this.base);
    url.searchParams.set("name", name);
    return availabilitySchema.parse(await this.json(url));
  }

  async account(authUrl: string, body: { challenge: string }, signed: SignedEvent) {
    return accountSchema.parse(
      await this.json(authUrl, {
        method: "POST",
        body: JSON.stringify(body),
        authorization: authorization(signed),
      }),
    );
  }

  async supporterInvoice(
    authUrl: string,
    body:
      | { challenge: string; plan: "basic_once"; donationSats: number }
      | { challenge: string; plan: "member_monthly" },
    signed: SignedEvent,
  ) {
    return pendingInvoiceSchema.parse(
      await this.json(authUrl, {
        method: "POST",
        body: JSON.stringify(body),
        authorization: authorization(signed),
      }),
    );
  }

  async nip05Invoice(
    authUrl: string,
    body: { challenge: string; name: string },
    signed: SignedEvent,
  ) {
    return pendingInvoiceSchema.parse(
      await this.json(authUrl, {
        method: "POST",
        body: JSON.stringify(body),
        authorization: authorization(signed),
      }),
    );
  }

  private async challenge(challengePath: string, authPath: string) {
    const value = challengeSchema.parse(await this.json(challengePath));
    const url = new URL(value.authUrl);
    if (
      url.origin !== this.base.origin ||
      url.pathname !== authPath ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      throw new Error("Grynvault returned an unexpected authorization URL.");
    }
    return value;
  }

  private async json(
    path: string | URL,
    options: { method?: "POST"; body?: string; authorization?: string } = {},
  ): Promise<unknown> {
    const url = path instanceof URL ? path : new URL(path, this.base);
    const response = await this.request(url, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.authorization ? { Authorization: options.authorization } : {}),
      },
      ...(options.body ? { body: options.body } : {}),
      redirect: "manual",
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const responseText = await response.text();
    if (responseText.length > RESPONSE_LIMIT) throw new Error("Grynvault response was too large.");
    let payload: unknown;
    try {
      payload = responseText ? JSON.parse(responseText) : {};
    } catch {
      throw new Error(`Grynvault API returned non-JSON HTTP ${response.status}.`);
    }
    assertNoNsec(payload);
    if (response.status >= 300 && response.status < 400) {
      throw new Error(
        `Grynvault API returned redirect HTTP ${response.status}; no invoice or settlement is assumed.`,
      );
    }
    if (!response.ok) {
      const code =
        payload && typeof payload === "object" && "error" in payload
          ? safeApiCode((payload as { error?: unknown }).error)
          : "request_failed";
      throw new Error(`Grynvault API returned HTTP ${response.status}: ${code}.`);
    }
    return payload;
  }
}

export class GrynvaultService {
  private readonly operations = new Map<string, OperationRecord>();

  constructor(
    private readonly signer: NostrSignerService,
    private readonly api = new GrynvaultApiClient(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  async accountDashboard(confirmed: boolean) {
    if (!confirmed) throw new Error("Explicit confirmation is required to sign account access.");
    const challenge = await this.api.accountChallenge();
    const body = { challenge: challenge.challenge };
    const event = authEvent(challenge.authUrl, body, this.now());
    const intent = this.signer.prepareEvent(event);
    const signed = await this.signer.signEvent(intent.intentId, true);
    if (!signed.signedEvent) throw new Error("The signer did not return a verified event.");
    const account = await this.api.account(challenge.authUrl, body, signed.signedEvent);
    return {
      access: "read_only" as const,
      pubkey: signed.signedEvent.pubkey,
      account,
      invoiceCreated: false,
      settlementChanged: false,
    };
  }

  async prepareSupporterInvoice(
    plan: GrynvaultPlan,
    donationSats?: number,
  ): Promise<GrynvaultOperationView> {
    if (plan === "basic_once") {
      if (
        !Number.isInteger(donationSats) ||
        (donationSats as number) < 21 ||
        (donationSats as number) > 1_000_000
      ) {
        throw new Error("A one-time donation must be an integer from 21 through 1,000,000 sats.");
      }
      const challenge = await this.api.supporterChallenge();
      const body = { challenge: challenge.challenge, plan, donationSats: donationSats as number };
      return this.prepare("supporter_invoice", challenge.authUrl, body, {
        sats: donationSats as number,
        cadence: "once",
      });
    }
    if (donationSats !== undefined) {
      throw new Error("The monthly membership has a fixed price and does not accept donationSats.");
    }
    const challenge = await this.api.supporterChallenge();
    const body = { challenge: challenge.challenge, plan };
    return this.prepare("supporter_invoice", challenge.authUrl, body, {
      sats: 2_100,
      cadence: "30_days",
    });
  }

  async prepareNip05Invoice(nameInput: string): Promise<GrynvaultOperationView> {
    const availability = await this.api.nip05Availability(nameInput);
    if (!availability.available) throw new Error(`${availability.identifier} is not available.`);
    const challenge = await this.api.nip05Challenge();
    const body = { challenge: challenge.challenge, name: availability.name };
    return this.prepare(
      "nip05_invoice",
      challenge.authUrl,
      body,
      { sats: 2_000, cadence: "once" },
      availability.identifier,
    );
  }

  async createSupporterInvoice(operationId: string, confirmed: boolean) {
    const record = this.requireOperation(operationId, "supporter_invoice", confirmed);
    const signed = await this.sign(record);
    try {
      const body = record.request.body as
        | { challenge: string; plan: "basic_once"; donationSats: number }
        | { challenge: string; plan: "member_monthly" };
      const invoice = await this.api.supporterInvoice(record.request.url, body, signed);
      record.state = "submitted";
      return this.invoiceResult(record, invoice);
    } catch (error) {
      record.state = "outcome_unknown";
      throw new Error(
        `${error instanceof Error ? error.message : "Grynvault invoice request failed."} The request will not be retried automatically; check the signed account dashboard before creating another invoice.`,
      );
    }
  }

  async createNip05Invoice(operationId: string, confirmed: boolean) {
    const record = this.requireOperation(operationId, "nip05_invoice", confirmed);
    const signed = await this.sign(record);
    try {
      const body = record.request.body as { challenge: string; name: string };
      const invoice = await this.api.nip05Invoice(record.request.url, body, signed);
      record.state = "submitted";
      return this.invoiceResult(record, invoice);
    } catch (error) {
      record.state = "outcome_unknown";
      throw new Error(
        `${error instanceof Error ? error.message : "Grynvault NIP-05 request failed."} The request will not be retried automatically; check the signed account dashboard before creating another invoice.`,
      );
    }
  }

  private prepare(
    type: OperationRecord["type"],
    url: string,
    body: RequestBody,
    price: OperationRecord["price"],
    identifier?: string,
  ): GrynvaultOperationView {
    const signing = this.signer.prepareEvent(authEvent(url, body, this.now()));
    const record: OperationRecord = {
      operationId: randomUUID(),
      type,
      state: "prepared",
      request: { url, method: "POST", body: structuredClone(body) },
      signingIntentId: signing.intentId,
      signingEvent: structuredClone(signing.event),
      expiresAt: new Date(this.now() + AUTH_TTL_MS).toISOString(),
      expiresAtMs: this.now() + AUTH_TTL_MS,
      price,
      ...(identifier ? { identifier } : {}),
    };
    this.operations.set(record.operationId, record);
    return this.view(record);
  }

  private requireOperation(
    operationId: string,
    type: OperationRecord["type"],
    confirmed: boolean,
  ): OperationRecord {
    if (!confirmed) throw new Error("Explicit invoice-creation confirmation is required.");
    const record = this.operations.get(operationId);
    if (!record || record.type !== type) throw new Error("Unknown Grynvault operation.");
    if (record.state !== "prepared") throw new Error("This Grynvault operation was already used.");
    if (this.now() >= record.expiresAtMs) {
      record.state = "failed";
      throw new Error("The Grynvault authorization expired. Prepare a new operation.");
    }
    return record;
  }

  private async sign(record: OperationRecord): Promise<SignedEvent> {
    record.state = "submitting";
    try {
      const signed = await this.signer.signEvent(record.signingIntentId, true);
      if (!signed.signedEvent) throw new Error("The signer did not return a verified event.");
      return signed.signedEvent;
    } catch (error) {
      record.state = "failed";
      throw error;
    }
  }

  private invoiceResult(record: OperationRecord, invoice: z.infer<typeof pendingInvoiceSchema>) {
    const sats = invoice.satsTotal ?? invoice.sats ?? record.price.sats;
    if (sats !== record.price.sats)
      throw new Error("Grynvault returned an unexpected invoice amount.");
    return {
      operationId: record.operationId,
      invoiceId: invoice.invoiceId,
      checkoutLink: invoice.checkoutLink,
      status: "pending" as const,
      sats,
      ...(record.identifier ? { identifier: record.identifier } : {}),
      invoiceCreated: true,
      paid: false,
      settled: false,
      entitlementActive: false,
      notice:
        "The invoice exists but is not paid or settled. A checkout link or browser redirect is never settlement evidence.",
    };
  }

  private view(record: OperationRecord): GrynvaultOperationView {
    const { expiresAtMs: _expiresAtMs, ...view } = record;
    return structuredClone(view);
  }
}
