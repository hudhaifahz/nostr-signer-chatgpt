import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createMcpServer } from "../src/mcp.js";
import { Nip07Bridge } from "../src/nip07.js";
import { SimulatedRelayGateway } from "../src/relays.js";
import { SafeLogger } from "../src/security.js";
import { NostrSignerService } from "../src/service.js";
import { SignerSession } from "../src/session.js";
import { SimulatedSigner, type Nip46SignerFactory } from "../src/signers.js";

function harness() {
  const logger = new SafeLogger(() => {});
  const relay = new SimulatedRelayGateway();
  const session = new SignerSession(logger);
  const service = new NostrSignerService(
    session,
    {} as Nip46SignerFactory,
    new Nip07Bridge(),
    relay,
    ["ws://127.0.0.1:7777"],
  );
  return { logger, relay, session, service };
}

describe("simulated end-to-end integration", () => {
  it("prepares, signs, verifies, publishes, and reads a kind:1 event", async () => {
    const { relay, session, service } = harness();
    await session.attach(new SimulatedSigner());
    const intent = service.prepareNote("hello from integration test");
    const signed = await service.signEvent(intent.intentId, true);
    expect(signed.signedEvent?.kind).toBe(1);
    const published = await service.publishEvent(intent.intentId, true);
    expect(published.acks[0]?.ok).toBe(true);
    expect(relay.events).toHaveLength(1);
    const queried = await service.queryEvents({ kinds: [1], limit: 5 });
    expect(queried[0]?.id).toBe(published.eventId);
    await expect(service.publishEvent(intent.intentId, true)).rejects.toThrow(
      /already published/iu,
    );
  });

  it("exposes only the intended MCP capability surface", async () => {
    const { logger, session, service } = harness();
    await session.attach(new SimulatedSigner());
    const server = createMcpServer(service, logger);
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(
      [
        "begin_nostrconnect_pairing",
        "connect_bunker",
        "disconnect_signer",
        "get_public_key",
        "get_setup_url",
        "get_signer_status",
        "nip44_decrypt",
        "nip44_encrypt",
        "prepare_event",
        "prepare_note",
        "publish_event",
        "query_events",
        "sign_event",
      ].sort(),
    );
    const prepared = await client.callTool({
      name: "prepare_note",
      arguments: { content: "MCP smoke test" },
    });
    expect(prepared.isError).not.toBe(true);
    const generic = await client.callTool({
      name: "prepare_event",
      arguments: {
        event: {
          kind: 7,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["e", "a".repeat(64)]],
          content: "+",
        },
      },
    });
    expect(generic.isError).not.toBe(true);
    await client.close();
    await server.close();
  });

  it("requires explicit confirmation for NIP-44 and round-trips with the simulated signer", async () => {
    const { session, service } = harness();
    await session.attach(new SimulatedSigner());
    const pubkey = service.getPublicKey();
    await expect(service.nip44Encrypt(pubkey, "private message", false)).rejects.toThrow(
      /confirmation/iu,
    );
    const ciphertext = await service.nip44Encrypt(pubkey, "private message", true);
    const plaintext = await service.nip44Decrypt(pubkey, ciphertext, true);
    expect(plaintext).toBe("private message");
  });
});
