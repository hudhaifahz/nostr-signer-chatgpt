import { NostrSignerService } from "./service.js";
import { SignerSession } from "./session.js";
import { SafeLogger } from "./security.js";
import { SimulatedRelayGateway } from "./relays.js";
import { SimulatedSigner, type Nip46SignerFactory } from "./signers.js";

const logger = new SafeLogger();
const relay = new SimulatedRelayGateway();
const session = new SignerSession(logger);
const unsupportedFactory = {} as Nip46SignerFactory;
const service = new NostrSignerService(session, unsupportedFactory, relay, ["ws://127.0.0.1:7777"]);

await session.attach(new SimulatedSigner());
const prepared = service.prepareNote("Hello from the safe simulated Nostr signer demo.");
const signed = await service.signEvent(prepared.intentId, true);
const published = await service.publishEvent(prepared.intentId, true);

process.stdout.write(
  `${JSON.stringify(
    {
      mode: "simulated",
      pubkey: service.getPublicKey(),
      intentState: signed.state,
      eventId: published.eventId,
      relayAcknowledgements: published.acks,
      note: "No live signer or public relay was used.",
    },
    null,
    2,
  )}\n`,
);
service.close();
