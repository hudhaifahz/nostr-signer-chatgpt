import { spawn, type ChildProcess } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { afterEach, expect, test } from "vitest";

let processUnderTest: ChildProcess | undefined;

afterEach(() => {
  processUnderTest?.kill("SIGTERM");
  processUnderTest = undefined;
});

async function waitForHealth(url: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Hosted test server did not become ready.");
}

async function setupUrl(client: Client): Promise<string> {
  const result = await client.callTool({ name: "get_setup_url", arguments: {} });
  const block = (result.content as Array<{ type: string; text?: string }>)[0];
  if (block?.type !== "text") throw new Error("Expected a text tool response.");
  return JSON.parse(block.text ?? "").url as string;
}

test("hosted bridge creates isolated accountless capability sessions", async () => {
  const port = 18_800 + Math.floor(Math.random() * 500);
  const base = `http://127.0.0.1:${port}`;
  processUnderTest = spawn(process.execPath, ["--import", "tsx", "src/hosted.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      PUBLIC_BASE_URL: base,
      HOSTED_SESSION_TTL_MS: "60000",
    },
    stdio: "ignore",
  });
  await waitForHealth(`${base}/health`);

  const first = new Client({ name: "hosted-test-a", version: "1.0.0" });
  const second = new Client({ name: "hosted-test-b", version: "1.0.0" });
  await first.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)) as Transport);
  await second.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)) as Transport);
  const hostedTools = (await first.listTools()).tools.map((tool) => tool.name);
  expect(hostedTools).not.toContain("nip44_encrypt");
  expect(hostedTools).not.toContain("nip44_decrypt");
  expect(hostedTools).toHaveLength(17);
  const firstUrl = await setupUrl(first);
  const secondUrl = await setupUrl(second);

  expect(firstUrl).not.toBe(secondUrl);
  expect((await fetch(firstUrl)).status).toBe(200);
  expect((await fetch(secondUrl)).status).toBe(200);
  expect((await fetch(`${base}/pair/${"x".repeat(43)}`)).status).toBe(404);
  await first.close();
  await second.close();
});
