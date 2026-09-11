import { GrynvaultApiClient, GrynvaultService } from "./grynvault.js";
import { Nip07Bridge } from "./nip07.js";
import { NostrRelayGateway, relayUrlsFromEnvironment } from "./relays.js";
import { SafeLogger } from "./security.js";
import { NostrSignerService } from "./service.js";
import { SignerSession } from "./session.js";
import { Nip46SignerFactory } from "./signers.js";

export function createRuntime(): {
  service: NostrSignerService;
  grynvault: GrynvaultService;
  logger: SafeLogger;
} {
  const logger = new SafeLogger();
  const requestTimeoutMs = Number(process.env.NOSTR_REQUEST_TIMEOUT_MS ?? 120_000);
  const sessionTtlMs = Number(process.env.NOSTR_SESSION_TTL_MS ?? 1_800_000);
  const session = new SignerSession(logger, () => Date.now(), sessionTtlMs);
  const signers = new Nip46SignerFactory(logger, requestTimeoutMs);
  const nip07 = new Nip07Bridge(requestTimeoutMs);
  const relays = new NostrRelayGateway(undefined, Math.min(requestTimeoutMs, 15_000));
  const service = new NostrSignerService(
    session,
    signers,
    nip07,
    relays,
    relayUrlsFromEnvironment(),
  );
  const grynvault = new GrynvaultService(service, new GrynvaultApiClient());
  return { service, grynvault, logger };
}
