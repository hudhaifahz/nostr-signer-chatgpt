import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "./mcp.js";
import { createRuntime } from "./runtime.js";
import { publicError } from "./security.js";
import { signerHtml } from "./ui.js";

const MAX_BODY_BYTES = 160_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = Number(process.env.HOSTED_RATE_LIMIT_PER_MINUTE ?? 120);
const MCP_REGISTRY_AUTH = "v=MCPv1; k=ed25519; p=O+eBQnTFnlUtT3TFb5c8K/nY/s29atAHsT6EaEkSFvM=";
const SESSION_TTL_MS = Number(process.env.HOSTED_SESSION_TTL_MS ?? 15 * 60_000);
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "0.0.0.0";
const DEFAULT_PUBLIC_BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : `http://127.0.0.1:${PORT}`;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL ?? DEFAULT_PUBLIC_BASE_URL).replace(
  /\/$/u,
  "",
);

type HostedSession = ReturnType<typeof createRuntime> & {
  token: string;
  expiresAt: number;
  transport: StreamableHTTPServerTransport;
};

const sessions = new Map<string, HostedSession>();
const pairings = new Map<string, HostedSession>();
const MAX_SESSIONS = Number(process.env.HOSTED_MAX_SESSIONS ?? 100);
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function clientAddress(request: IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(",", 1)[0]?.trim() || request.socket.remoteAddress || "unknown";
}

function rateLimited(request: IncomingMessage): boolean {
  const key = clientAddress(request);
  const now = Date.now();
  const current = requestCounts.get(key);
  if (!current || current.resetAt <= now) {
    requestCounts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT_MAX;
}

function sendHtml(response: ServerResponse, body: string): void {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy":
      "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
  response.end(body);
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title} | Nostr Signer</title><style>body{max-width:760px;margin:4rem auto;padding:0 1.25rem;font:16px/1.6 system-ui;color:#171717}h1,h2{line-height:1.2}a{color:#5b35d5}code{background:#f2f2f2;padding:.1rem .3rem}</style><main><h1>${title}</h1>${body}<hr><p><a href="/">Nostr Signer</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/support">Support</a></p></main></html>`;
}

const publicPages = new Map<string, string>([
  [
    "/",
    page(
      "Nostr Signer",
      `<p>An accountless bridge that lets compatible AI clients prepare Nostr events while you approve signatures in your own browser signer.</p><p>Your private key is never requested or stored. Signing and publication remain separate actions.</p><p><strong>MCP endpoint:</strong> <code>${PUBLIC_BASE_URL}/mcp</code></p><p><a href="https://github.com/hudhaifahz/nostr-signer-chatgpt">Source and installation</a></p>`,
    ),
  ],
  [
    "/privacy",
    page(
      "Privacy notice",
      `<p><strong>Effective 2026-09-10.</strong> The hosted bridge has no user accounts, advertising, or analytics. It processes public keys, unsigned and signed Nostr events, relay choices and responses, and short-lived pairing/session metadata only when you invoke its tools.</p><p>Sessions are held in process memory and expire after 15 minutes of inactivity or service restart. Operational logs are designed to omit event content, pairing links, tokens, private-message plaintext, and private keys. Hosting and selected Nostr relays process network metadata under their own policies.</p><p>The service never requests or stores a Nostr private key or seed phrase. Public events accepted by relays may be copied and cannot be reliably deleted by this service.</p><p>To clear service-held session data, disconnect or wait for expiry. For privacy questions, use the private security contact linked on the support page.</p>`,
    ),
  ],
  [
    "/terms",
    page(
      "Terms of use",
      `<p><strong>Effective 2026-09-10.</strong> Nostr Signer is an experimental community service provided without warranty or service-level commitment.</p><p>You control and are responsible for reviewing events, approving signatures, selecting relays, protecting your signer, and complying with applicable law and third-party rules. The service does not custody keys or offer key recovery.</p><p>Publication can be difficult or impossible to reverse. A relay acknowledgement proves acceptance at that time, not permanent retention or network-wide propagation. Abuse, attempts to impair the service, or unlawful use may result in access restriction. The service may change or be suspended.</p><p>The source is licensed under Apache-2.0; the hosted service is operated subject to these terms.</p>`,
    ),
  ],
  [
    "/support",
    page(
      "Support",
      `<p>Report bugs through <a href="https://github.com/hudhaifahz/nostr-signer-chatgpt/issues">GitHub Issues</a>. Include your OS, AI client, browser signer and version, relay URLs, expected behavior, actual behavior, and redacted logs.</p><p>Never include a private key, seed phrase, pairing link, token, or private-message plaintext. Report exploitable security issues privately through <a href="https://github.com/hudhaifahz/nostr-signer-chatgpt/security/advisories/new">GitHub security advisories</a>.</p><p>This community public beta has no guaranteed response time.</p>`,
    ),
  ],
]);

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function fresh(session: HostedSession): boolean {
  if (session.expiresAt > Date.now()) return true;
  void closeSession(session);
  return false;
}

async function closeSession(session: HostedSession): Promise<void> {
  pairings.delete(session.token);
  for (const [id, candidate] of sessions) if (candidate === session) sessions.delete(id);
  session.service.close();
  await session.transport.close().catch(() => undefined);
}

async function createSession(): Promise<HostedSession> {
  if (sessions.size >= MAX_SESSIONS)
    throw new Error("The hosted bridge is at capacity. Try again later.");
  const runtime = createRuntime();
  const token = randomBytes(32).toString("base64url");
  let session!: HostedSession;
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: randomUUID,
    onsessioninitialized: (id) => {
      sessions.set(id, session);
    },
  });
  session = { ...runtime, token, expiresAt: Date.now() + SESSION_TTL_MS, transport };
  runtime.service.setSetupUrl(`${PUBLIC_BASE_URL}/pair/${token}`);
  pairings.set(token, session);
  transport.onclose = () => void closeSession(session);
  await createMcpServer(runtime.service, runtime.logger, runtime.grynvault).connect(
    transport as Transport,
  );
  return session;
}

async function handlePairing(
  request: IncomingMessage,
  response: ServerResponse,
  token: string,
  path: string,
): Promise<void> {
  const session = pairings.get(token);
  if (!session || !fresh(session)) return sendJson(response, 404, { error: "Pairing expired." });
  if (request.method === "GET" && path === "") {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-local' chrome-extension: moz-extension:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
    });
    response.end(signerHtml(token));
    return;
  }
  if (request.method !== "POST" || request.headers["x-nostr-ui-token"] !== token)
    return sendJson(response, 404, { error: "Not found." });
  const body = (await readJson(request)) as Record<string, unknown>;
  if (path === "/api/status") return sendJson(response, 200, session.service.status());
  if (path === "/api/nip07/connect" && typeof body.pubkey === "string")
    return sendJson(response, 200, await session.service.connectBrowserExtension(body.pubkey));
  if (path === "/api/nip07/next")
    return sendJson(response, 200, { operation: session.service.nextBrowserExtensionRequest() });
  if (path === "/api/nip07/respond" && typeof body.requestId === "string") {
    session.service.respondToBrowserExtension(body.requestId, body.result, body.rejected === true);
    return sendJson(response, 200, { accepted: true });
  }
  return sendJson(response, 400, { error: "Unsupported hosted signer request." });
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", PUBLIC_BASE_URL);
    if (rateLimited(request)) return sendJson(response, 429, { error: "Too many requests." });
    if (request.method === "GET" && url.pathname === "/.well-known/mcp-registry-auth") {
      response.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=300",
        "x-content-type-options": "nosniff",
      });
      response.end(MCP_REGISTRY_AUTH);
      return;
    }
    if (request.method === "GET" && publicPages.has(url.pathname))
      return sendHtml(response, publicPages.get(url.pathname) as string);
    if (request.method === "GET" && url.pathname === "/health")
      return sendJson(response, 200, { status: "ok" });
    const pairing = url.pathname.match(/^\/pair\/([A-Za-z0-9_-]{43})(\/.*)?$/u);
    if (pairing?.[1]) return await handlePairing(request, response, pairing[1], pairing[2] ?? "");
    if (url.pathname !== "/mcp") return sendJson(response, 404, { error: "Not found." });

    const idHeader = request.headers["mcp-session-id"];
    const id = Array.isArray(idHeader) ? idHeader[0] : idHeader;
    let session = id ? sessions.get(id) : undefined;
    let body: unknown;
    if (request.method === "POST") body = await readJson(request);
    if (session && !fresh(session)) session = undefined;
    if (!session && request.method === "POST" && isInitializeRequest(body))
      session = await createSession();
    if (!session) return sendJson(response, 400, { error: "A valid MCP session is required." });
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    await session.transport.handleRequest(request, response, body);
  } catch (error) {
    sendJson(response, 400, { error: publicError(error).message });
  }
});

const cleanup = setInterval(
  () => {
    for (const session of new Set(sessions.values())) fresh(session);
    const now = Date.now();
    for (const [address, entry] of requestCounts)
      if (entry.resetAt <= now) requestCounts.delete(address);
  },
  Math.min(SESSION_TTL_MS, 60_000),
);
cleanup.unref();

server.listen(PORT, HOST, () =>
  process.stderr.write(
    `${JSON.stringify({ level: "info", message: "Hosted bridge ready.", url: `${PUBLIC_BASE_URL}/mcp` })}\n`,
  ),
);

async function shutdown(): Promise<void> {
  clearInterval(cleanup);
  await Promise.all([...new Set(sessions.values())].map(closeSession));
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
