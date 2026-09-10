import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { publicError, type SafeLogger } from "./security.js";
import type { NostrSignerService } from "./service.js";

const MAX_BODY_BYTES = 32_768;

function html(token: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-local'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'">
<title>Nostr Signer for ChatGPT</title><style>
:root{color-scheme:light dark;font:16px system-ui,sans-serif}body{max-width:760px;margin:40px auto;padding:0 20px;background:#101417;color:#f4f7f5}main{background:#182026;border:1px solid #334149;border-radius:18px;padding:28px}h1{margin-top:0}.safe{color:#7ee2ad;font-weight:700}.warn{color:#ffd479}label{display:block;margin:18px 0 7px}input,textarea,button{font:inherit;border-radius:9px;border:1px solid #52636d;padding:11px;background:#0f1519;color:#fff}input,textarea{box-sizing:border-box;width:100%}button{cursor:pointer;background:#6d46ff;border-color:#8e73ff;font-weight:700}button.secondary{background:#29343b}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0d1215;padding:14px;border-radius:9px;min-height:44px}.row{display:flex;gap:10px;flex-wrap:wrap}.row button{flex:1}.muted{color:#aab7bd;font-size:.92rem}</style></head>
<body><main><h1>Nostr Signer for ChatGPT</h1><p class="safe">Your nsec never belongs here.</p>
<p>Connect a signer you control. Approval and signing stay in Amber, nsec.app, Clave, or another NIP-46 signer.</p>
<h2>Option A: scan a nostrconnect URI</h2><label for="relays">Pairing relays (comma-separated wss:// URLs)</label><input id="relays" placeholder="wss://relay.nsec.app,wss://relay.damus.io"><div class="row"><button id="pair">Create pairing URI</button><button class="secondary" id="status">Refresh status</button></div><label>Pairing URI</label><pre id="pairing">Not created.</pre>
<h2>Option B: paste a bunker URI</h2><p class="muted">This page is served only on 127.0.0.1. The URI is held in memory and never logged.</p><label for="bunker">bunker:// URI</label><textarea id="bunker" rows="3" autocomplete="off" spellcheck="false"></textarea><button id="connect">Connect and wait for signer approval</button>
<h2>Status</h2><pre id="output">Disconnected.</pre><p class="warn">Never paste an nsec or raw private key. The server rejects nsec-like input.</p>
</main><script nonce="local">
const token=${JSON.stringify(token)}; const output=document.querySelector('#output');
async function call(path,body){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json','x-nostr-ui-token':token},body:JSON.stringify(body)});const x=await r.json();if(!r.ok)throw new Error(x.error||'Request failed');return x}
document.querySelector('#pair').onclick=async()=>{try{const relays=document.querySelector('#relays').value.split(',').map(x=>x.trim()).filter(Boolean);const x=await call('/api/pair',{relays});document.querySelector('#pairing').textContent=x.uri;output.textContent=JSON.stringify(x.status,null,2)}catch(e){output.textContent=e.message}};
document.querySelector('#connect').onclick=async()=>{try{output.textContent='Waiting for approval in your signer…';const x=await call('/api/connect',{uri:document.querySelector('#bunker').value});document.querySelector('#bunker').value='';output.textContent=JSON.stringify(x,null,2)}catch(e){document.querySelector('#bunker').value='';output.textContent=e.message}};
document.querySelector('#status').onclick=async()=>{try{const x=await call('/api/status',{});output.textContent=JSON.stringify(x,null,2)}catch(e){output.textContent=e.message}};
</script></body></html>`;
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(data);
}

export async function startLocalSetupUi(
  service: NostrSignerService,
  logger: SafeLogger,
  port = Number(process.env.NOSTR_SETUP_PORT ?? 34_846),
): Promise<{ url: string; close: () => Promise<void> }> {
  const token = randomBytes(32).toString("base64url");
  const server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "x-frame-options": "DENY",
          "referrer-policy": "no-referrer",
        });
        response.end(html(token));
        return;
      }
      if (request.method !== "POST" || request.headers["x-nostr-ui-token"] !== token) {
        json(response, 404, { error: "Not found." });
        return;
      }
      const body = await readJson(request);
      if (request.url === "/api/status") {
        json(response, 200, service.status());
        return;
      }
      if (request.url === "/api/pair") {
        const relays = Array.isArray(body.relays)
          ? body.relays.filter((value): value is string => typeof value === "string")
          : undefined;
        const result = service.beginNostrConnect(relays);
        json(response, 200, result);
        return;
      }
      if (request.url === "/api/connect" && typeof body.uri === "string") {
        json(response, 200, await service.connectBunker(body.uri));
        return;
      }
      json(response, 400, { error: "Invalid setup request." });
    } catch (error) {
      logger.error("Local setup request failed.", error);
      json(response, 400, { error: publicError(error).message });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}/`;
  logger.info("Local signer setup page is ready.", { url });
  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
