import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { publicError, type SafeLogger } from "./security.js";
import type { NostrSignerService } from "./service.js";

const MAX_BODY_BYTES = 160_000;

function html(token: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-local' chrome-extension: moz-extension:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'">
<title>Nostr Signer for ChatGPT</title><style>
:root{color-scheme:light dark;font:16px system-ui,sans-serif}body{max-width:800px;margin:40px auto;padding:0 20px;background:#101417;color:#f4f7f5}main{background:#182026;border:1px solid #334149;border-radius:18px;padding:28px}h1{margin-top:0}.safe{color:#7ee2ad;font-weight:700}.warn{color:#ffd479}.card{padding:20px;border:1px solid #42535d;border-radius:14px;background:#12191d;margin:20px 0}.recommended{border-color:#7a63ff;box-shadow:0 0 0 1px #7a63ff}.badge{display:inline-block;background:#6d46ff;border-radius:999px;padding:4px 9px;font-size:.78rem;font-weight:800}label{display:block;margin:18px 0 7px}input,textarea,button{font:inherit;border-radius:9px;border:1px solid #52636d;padding:11px;background:#0f1519;color:#fff}input,textarea{box-sizing:border-box;width:100%}button{cursor:pointer;background:#6d46ff;border-color:#8e73ff;font-weight:700}button.secondary{background:#29343b}button.reject{background:#512b33;border-color:#8c4c59}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0d1215;padding:14px;border-radius:9px;min-height:44px}.row{display:flex;gap:10px;flex-wrap:wrap}.row button{flex:1}.muted{color:#aab7bd;font-size:.92rem}details{margin-top:24px}summary{cursor:pointer;font-weight:700}#approval[hidden]{display:none}</style></head>
<body><main><h1>Nostr Signer for ChatGPT</h1><p class="safe">Your private key stays in your signer.</p>
<section class="card recommended"><span class="badge">Recommended</span><h2>Use Alby, nos2x, or another NIP-07 extension</h2><p>Open this local page in the Chrome or Firefox profile where your signer extension is installed. Connect once, keep this tab open, and approve each request here and in your extension.</p><div class="row"><button id="extension">Connect browser extension</button><button class="secondary" id="copyUrl">Copy setup URL</button></div><pre id="extensionStatus">Extension not connected.</pre>
<div id="approval" hidden><h3>Approval waiting</h3><p class="warn">Review the exact request below. Continue only if it matches what you asked to do; your extension's own approval policy is the final protection.</p><pre id="request"></pre><div class="row"><button id="approve">Continue in extension</button><button class="reject" id="reject">Reject request</button></div></div></section>
<div class="row"><button class="secondary" id="status">Refresh signer status</button></div><h2>Signer status</h2><pre id="output">Disconnected.</pre>
<details><summary>Advanced: remote NIP-46 signer</summary><section class="card"><h3>Scan a nostrconnect URI</h3><label for="relays">Pairing relays (comma-separated wss:// URLs)</label><input id="relays" placeholder="wss://relay.nsec.app,wss://relay.damus.io"><button id="pair">Create pairing URI</button><label>Pairing URI</label><pre id="pairing">Not created.</pre>
<h3>Or paste a bunker URI</h3><p class="muted">The URI is held only in process memory and is never logged.</p><label for="bunker">bunker:// URI</label><textarea id="bunker" rows="3" autocomplete="off" spellcheck="false"></textarea><button id="connect">Connect remote signer</button></section></details>
<p class="warn">Never paste an nsec, seed phrase, or raw private key. This project intentionally rejects them.</p>
</main><script nonce="local">
const token=${JSON.stringify(token)}; const output=document.querySelector('#output'); let pending=null; let polling=false;
async function call(path,body){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json','x-nostr-ui-token':token},body:JSON.stringify(body)});const x=await r.json();if(!r.ok)throw new Error(x.error||'Request failed');return x}
function extensionApi(){if(!window.nostr)throw new Error('No NIP-07 extension detected. Open this URL in the browser profile where Alby or nos2x is installed.');return window.nostr}
function showPending(operation){pending=operation;document.querySelector('#approval').hidden=!operation;document.querySelector('#request').textContent=operation?JSON.stringify(operation,null,2):''}
async function poll(){if(polling)return;polling=true;try{const x=await call('/api/nip07/next',{});showPending(x.operation)}catch(e){document.querySelector('#extensionStatus').textContent=e.message}finally{polling=false}}
setInterval(poll,750);
document.querySelector('#extension').onclick=async()=>{try{const pubkey=await extensionApi().getPublicKey();const x=await call('/api/nip07/connect',{pubkey});document.querySelector('#extensionStatus').textContent='Connected: '+pubkey;output.textContent=JSON.stringify(x,null,2);await poll()}catch(e){document.querySelector('#extensionStatus').textContent=e.message}};
document.querySelector('#copyUrl').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);document.querySelector('#extensionStatus').textContent='Setup URL copied. Paste it into the browser profile containing your signer extension.'}catch(e){document.querySelector('#extensionStatus').textContent='Copy the URL from the address bar and open it in your extension-enabled browser.'}};
document.querySelector('#approve').onclick=async()=>{if(!pending)return;const current=pending;try{const api=extensionApi();let result;if(current.method==='sign_event')result=await api.signEvent(current.event);else if(current.method==='nip44_encrypt'){if(!api.nip44?.encrypt)throw new Error('This extension does not provide NIP-44 encryption.');result=await api.nip44.encrypt(current.pubkey,current.plaintext)}else{if(!api.nip44?.decrypt)throw new Error('This extension does not provide NIP-44 decryption.');result=await api.nip44.decrypt(current.pubkey,current.ciphertext)}await call('/api/nip07/respond',{requestId:current.requestId,result});showPending(null);document.querySelector('#extensionStatus').textContent='Request completed by extension.'}catch(e){document.querySelector('#extensionStatus').textContent=e.message}};
document.querySelector('#reject').onclick=async()=>{if(!pending)return;try{await call('/api/nip07/respond',{requestId:pending.requestId,rejected:true});showPending(null);document.querySelector('#extensionStatus').textContent='Request rejected.'}catch(e){document.querySelector('#extensionStatus').textContent=e.message}};
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
      if (!/^127\.0\.0\.1(?::\d+)?$/u.test(request.headers.host ?? "")) {
        json(response, 421, { error: "Loopback host required." });
        return;
      }
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
      if (request.url === "/api/nip07/connect" && typeof body.pubkey === "string") {
        json(response, 200, await service.connectBrowserExtension(body.pubkey));
        return;
      }
      if (request.url === "/api/nip07/next") {
        json(response, 200, { operation: service.nextBrowserExtensionRequest() });
        return;
      }
      if (request.url === "/api/nip07/respond" && typeof body.requestId === "string") {
        service.respondToBrowserExtension(body.requestId, body.result, body.rejected === true);
        json(response, 200, { accepted: true });
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
