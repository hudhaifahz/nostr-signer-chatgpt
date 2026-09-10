import { createRuntime } from "./runtime.js";
import { serveMcp } from "./mcp.js";
import { startLocalSetupUi } from "./ui.js";

const { service, logger } = createRuntime();
const setupUi = await startLocalSetupUi(service, logger);
const mcp = await serveMcp(service, logger);

async function shutdown(): Promise<void> {
  service.close();
  await setupUi.close();
  await mcp.close();
}

process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
