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
  if (tools.tools.length !== 12) {
    throw new Error(`Expected 12 MCP tools, received ${tools.tools.length}.`);
  }
  process.stdout.write(`Bundled MCP server exposed ${tools.tools.length} tools.\n`);
} finally {
  await client.close();
}
