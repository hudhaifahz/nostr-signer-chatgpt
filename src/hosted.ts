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
