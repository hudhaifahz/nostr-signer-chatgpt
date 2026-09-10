import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const env = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
env.NOSTR_SETUP_PORT = "0";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve("mcp/server.mjs")],
  cwd: process.cwd(),
  env,
  stderr: "pipe",
});
const client = new Client({ name: "bundle-smoke-test", version: "1.0.0" });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  if (tools.tools.length !== 13) {
    throw new Error(`Expected 13 MCP tools, received ${tools.tools.length}.`);
  }
  const setup = await client.callTool({ name: "get_setup_url", arguments: {} });
  const setupText = setup.content.find((item) => item.type === "text");
  const setupData =
    setupText?.type === "text" ? (JSON.parse(setupText.text) as { url?: string }) : {};
  if (!setupData.url?.startsWith("http://127.0.0.1:")) {
    throw new Error("Bundled MCP server did not expose its loopback setup URL.");
  }
  process.stdout.write(
    `Bundled MCP server exposed ${tools.tools.length} tools and a loopback setup URL.\n`,
  );
} finally {
  await client.close();
}
