import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { publicError, type SafeLogger } from "./security.js";
import type { NostrSignerService } from "./service.js";

const relayList = z.array(z.string().max(500)).max(8).optional();
const confirm = z
  .literal(true)
  .describe("Must be true only after the user explicitly approved this action.");

function result(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data as Record<string, unknown>,
  };
}

function failure(error: unknown, logger: SafeLogger) {
  logger.error("MCP tool call failed.", error);
  return { isError: true, content: [{ type: "text" as const, text: publicError(error).message }] };
}

export function createMcpServer(service: NostrSignerService, logger: SafeLogger): McpServer {
  const server = new McpServer(
    { name: "nostr-signer-chatgpt", version: "0.2.0" },
    {
      instructions:
        "Never ask for or accept an nsec/private key. Prefer the local NIP-07 setup page with Alby, nos2x, or another browser extension; NIP-46 is an advanced fallback. Before signing, prepare an exact event and show it to the user. Call sign_event only after explicit user intent; approval still happens in the user's signer. Publish only after separate explicit publication intent. Never claim a post is live unless at least one relay acknowledgement is returned.",
    },
  );

  server.registerTool(
    "get_setup_url",
    {
      title: "Get signer setup URL",
      description:
        "Return the loopback-only page used to connect a NIP-07 browser extension or an advanced NIP-46 signer.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => {
      try {
        return result({
          url: service.getSetupUrl(),
          recommended: "Open this URL in the browser profile that has Alby or nos2x installed.",
        });
      } catch (error) {
        return failure(error, logger);
      }
    },
  );

  server.registerTool(
    "get_signer_status",
    {
      title: "Get signer status",
      description: "Check whether a user-controlled NIP-07 or NIP-46 signer is connected.",
      inputSchema: {},
    },
    async () => result(service.status()),
  );

  server.registerTool(
    "begin_nostrconnect_pairing",
    {
      title: "Begin signer pairing",
      description:
        "Advanced fallback: create a nostrconnect:// URI for the user to scan or open in a remote signer. Never accepts an nsec.",
      inputSchema: { relays: relayList },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ relays }) => {
      try {
        return result(service.beginNostrConnect(relays));
      } catch (error) {
        return failure(error, logger);
      }
    },
  );

  server.registerTool(
    "connect_bunker",
    {
      title: "Connect bunker signer",
      description:
        "Connect a bunker:// URI only when the user knowingly supplied it. Prefer the local setup page so connection secrets are not placed in chat. Never accepts an nsec.",
      inputSchema: { connection_uri: z.string().max(8_192) },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ connection_uri }) => {
      try {
        return result(await service.connectBunker(connection_uri));
      } catch (error) {
        return failure(error, logger);
      }
    },
  );

  server.registerTool(
    "get_public_key",
    {
      title: "Get public key",
      description: "Return the public key exposed by the currently paired signer.",
      inputSchema: {},
    },
    async () => {
      try {
        return result({ pubkey: service.getPublicKey() });
      } catch (error) {
        return failure(error, logger);
      }
    },
  );

  server.registerTool(
    "prepare_note",
    {
      title: "Prepare Nostr note",
      description:
        "Prepare and bind an exact unsigned kind:1 note for user review. This does not sign or publish.",
      inputSchema: { content: z.string().min(1).max(65_536) },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ content }) => {
      try {
        return result(service.prepareNote(content));
      } catch (error) {
        return failure(error, logger);
      }
    },
  );

  server.registerTool(
    "prepare_event",
    {
      title: "Prepare exact Nostr event",
      description:
        "Validate and bind an exact unsigned Nostr event for user review. This does not sign or publish. Show the user every field before requesting a signature.",
      inputSchema: {
        event: z
          .object({
            kind: z.number().int().min(0).max(65_535),
            created_at: z.number().int().nonnegative(),
            tags: z.array(z.array(z.string().max(4_096)).min(1).max(16)).max(128),
            content: z.string().max(65_536),
          })
          .strict(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ event }) => {
      try {
        return result(service.prepareEvent(event));
      } catch (error) {
        return failure(error, logger);
      }
    },
  );

  server.registerTool(
    "sign_event",
    {
      title: "Request event signature",
      description:
        "Ask the paired signer to approve and sign the exact event bound to a fresh intent. Requires explicit user intent and never publishes.",
      inputSchema: { intent_id: z.string().uuid(), confirm_signature: confirm },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ intent_id, confirm_signature }) => {
      try {
        const signed = await service.signEvent(intent_id, confirm_signature);
        return result({
          intentId: signed.intentId,
          state: signed.state,
          signedEvent: signed.signedEvent,
        });
      } catch (error) {
        return failure(error, logger);
      }
    },
  );

  server.registerTool(
    "publish_event",
    {
      title: "Publish signed event",
      description:
        "Publish a previously verified signed event to configured relays. Requires separate explicit user intent.",
      inputSchema: { intent_id: z.string().uuid(), confirm_publish: confirm, relays: relayList },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ intent_id, confirm_publish, relays }) => {
      try {
        return result(await service.publishEvent(intent_id, confirm_publish, relays));
      } catch (error) {
        return failure(error, logger);
      }
    },
  );

  server.registerTool(
    "nip44_encrypt",
    {
      title: "Encrypt with signer",
      description:
        "Ask the paired signer to NIP-44 encrypt plaintext for a public key. Never logs plaintext; requires explicit user intent.",
      inputSchema: {
        pubkey: z.string().regex(/^[0-9a-f]{64}$/u),
        plaintext: z.string().min(1).max(65_536),
        confirm_encryption: confirm,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ pubkey, plaintext, confirm_encryption }) => {
      try {
        return result({
          ciphertext: await service.nip44Encrypt(pubkey, plaintext, confirm_encryption),
        });
      } catch (error) {
        return failure(error, logger);
      }
    },
  );

  server.registerTool(
    "nip44_decrypt",
    {
      title: "Decrypt with signer",
      description:
        "Ask the paired signer to NIP-44 decrypt ciphertext. Returns sensitive plaintext only after explicit user intent.",
      inputSchema: {
        pubkey: z.string().regex(/^[0-9a-f]{64}$/u),
        ciphertext: z.string().min(1).max(100_000),
        confirm_decryption: confirm,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ pubkey, ciphertext, confirm_decryption }) => {
      try {
        return result({
          plaintext: await service.nip44Decrypt(pubkey, ciphertext, confirm_decryption),
        });
      } catch (error) {
        return failure(error, logger);
      }
    },
  );

  server.registerTool(
    "query_events",
    {
      title: "Read Nostr events",
      description:
        "Read a bounded set of verified public profile or note events from selected relays.",
      inputSchema: {
        relays: relayList,
        authors: z
          .array(z.string().regex(/^[0-9a-f]{64}$/u))
          .max(20)
          .optional(),
        kinds: z
          .array(z.union([z.literal(0), z.literal(1)]))
          .max(2)
          .optional(),
        limit: z.number().int().min(1).max(50).optional(),
        since: z.number().int().nonnegative().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async (input) => {
      try {
        return result({ events: await service.queryEvents(input) });
      } catch (error) {
        return failure(error, logger);
      }
    },
  );

  server.registerTool(
    "disconnect_signer",
    {
      title: "Disconnect signer",
      description: "Forget the in-memory signer session and all prepared events.",
      inputSchema: { confirm_disconnect: confirm },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async () => {
      try {
        await service.disconnect();
        return result({ state: "disconnected" });
      } catch (error) {
        return failure(error, logger);
      }
    },
  );

  return server;
}

export async function serveMcp(
  service: NostrSignerService,
  logger: SafeLogger,
): Promise<McpServer> {
  const server = createMcpServer(service, logger);
  await server.connect(new StdioServerTransport());
  return server;
}
