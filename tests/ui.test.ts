import { request } from "node:http";
import { describe, expect, it } from "vitest";
import { Nip07Bridge } from "../src/nip07.js";
import { SimulatedRelayGateway } from "../src/relays.js";
import { SafeLogger } from "../src/security.js";
import { NostrSignerService } from "../src/service.js";
import { SignerSession } from "../src/session.js";
import { SimulatedSigner, type Nip46SignerFactory } from "../src/signers.js";
import { startLocalSetupUi } from "../src/ui.js";

describe("loopback NIP-07 setup page", () => {
  it("connects and completes a signature through the HTTP bridge", async () => {
    const logger = new SafeLogger(() => {});
    const bridge = new Nip07Bridge(1_000);
    const service = new NostrSignerService(
      new SignerSession(logger),
      {} as Nip46SignerFactory,
      bridge,
      new SimulatedRelayGateway(),
      ["ws://127.0.0.1:7777"],
    );
    const ui = await startLocalSetupUi(service, logger, 0);
    service.setSetupUrl(ui.url);
    try {
      const page = await (await fetch(ui.url)).text();
      expect(page).toContain("Connect browser extension");
      expect(page).toContain("Advanced: remote NIP-46 signer");
      const tokenMatch = page.match(/const token=("[^"]+")/u);
      const serializedToken = tokenMatch?.[1];
      if (!serializedToken) throw new Error("Missing anti-CSRF token.");
      const token = JSON.parse(serializedToken) as string;
      const call = async (path: string, body: unknown) => {
        const response = await fetch(new URL(path, ui.url), {
          method: "POST",
          headers: { "content-type": "application/json", "x-nostr-ui-token": token },
          body: JSON.stringify(body),
        });
        expect(response.status).toBe(200);
        return (await response.json()) as Record<string, unknown>;
      };

      const extension = new SimulatedSigner();
      const pubkey = await extension.getPublicKey();
      await call("/api/nip07/connect", { pubkey });
      expect(service.status()).toMatchObject({ state: "connected", signerType: "nip07", pubkey });

      const intent = service.prepareNote("browser bridge test");
      const signing = service.signEvent(intent.intentId, true);
      const next = await call("/api/nip07/next", {});
      const operation = next.operation as ReturnType<Nip07Bridge["next"]>;
      if (!operation || operation.method !== "sign_event") throw new Error("Missing operation.");
      const signed = await extension.signEvent(operation.event);
      await call("/api/nip07/respond", { requestId: operation.requestId, result: signed });
      await expect(signing).resolves.toMatchObject({ state: "signed", signedEvent: { pubkey } });

      const unauthorized = await fetch(new URL("/api/nip07/next", ui.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(unauthorized.status).toBe(404);
      const reboundStatus = await new Promise<number | undefined>((resolve, reject) => {
        const rebound = request(ui.url, { headers: { host: "attacker.example" } }, (response) => {
          response.resume();
          resolve(response.statusCode);
        });
        rebound.once("error", reject);
        rebound.end();
      });
      expect(reboundStatus).toBe(421);
    } finally {
      service.close();
      await ui.close();
    }
  });
});
