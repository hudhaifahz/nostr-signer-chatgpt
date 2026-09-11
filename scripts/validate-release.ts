import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

type JsonObject = Record<string, unknown>;

const root = process.cwd();
const requiredFiles = [
  ".app.json",
  ".codex-plugin/plugin.json",
  ".github/workflows/ci.yml",
  ".mcp.json",
  "CHANGELOG.md",
  "COMPATIBILITY.md",
  "CONTRIBUTING.md",
  "GRYNVAULT_INTEGRATION.md",
  "HOSTED_SERVICE.md",
  "LAUNCH_KIT.md",
  "LICENSE",
  "MARKETPLACE_CHECKLIST.md",
  "OPENAI_SUBMISSION.md",
  "PRIVACY.md",
  "README.md",
  "SECURITY.md",
  "SUPPORT.md",
  "TERMS.md",
  "assets/icon.svg",
  "mcp.json",
  "plugin.json",
  "skills/nostr-signer/SKILL.md",
];

async function text(path: string) {
  return readFile(join(root, path), "utf8");
}

async function json(path: string): Promise<JsonObject> {
  return JSON.parse(await text(path)) as JsonObject;
}

async function listScannableFiles(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if ([".git", "coverage", "dist", "node_modules", "outputs", "work"].includes(entry.name)) {
      continue;
    }
    const relative = join(prefix, entry.name);
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listScannableFiles(absolute, relative)));
    } else if (["", ".json", ".md", ".mjs", ".ts", ".yml", ".yaml"].includes(extname(entry.name))) {
      files.push(relative);
    }
  }
  return files;
}

const errors: string[] = [];
for (const file of requiredFiles) {
  try {
    await text(file);
  } catch {
    errors.push(`Missing required release file: ${file}`);
  }
}

const packageJson = await json("package.json");
const version = packageJson.version;
if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/u.test(version)) {
  errors.push("package.json must contain a stable semantic version.");
}
if (packageJson.private !== true) {
  errors.push("The beta package must stay private to prevent accidental npm publication.");
}
if (packageJson.license !== "Apache-2.0") {
  errors.push("package.json license must match LICENSE (Apache-2.0).");
}

for (const manifest of ["plugin.json", ".codex-plugin/plugin.json"]) {
  const value = await json(manifest);
  if (value.name !== packageJson.name) {
    errors.push(`${manifest} name does not match package.json.`);
  }
  if (value.version !== version) {
    errors.push(`${manifest} version does not match package.json.`);
  }
}

const lock = await json("package-lock.json");
const lockPackages = lock.packages as JsonObject | undefined;
const lockRoot = lockPackages?.[""] as JsonObject | undefined;
if (lock.version !== version || lockRoot?.version !== version) {
  errors.push("package-lock.json root version does not match package.json.");
}

const mcpSource = await text("src/mcp.ts");
if (!mcpSource.includes(`version: "${version}"`)) {
  errors.push("The MCP server-reported version does not match package.json.");
}

const packageScripts = JSON.stringify(packageJson.scripts ?? {});
if (/\/(Users|home)\//u.test(packageScripts) || /[A-Za-z]:\\/u.test(packageScripts)) {
  errors.push("package.json scripts contain a machine-specific absolute path.");
}

const secretPattern = /\bnsec1[023456789acdefghjklmnpqrstuvwxyz]{20,}\b/giu;
for (const file of await listScannableFiles(root)) {
  const contents = await text(file);
  if (secretPattern.test(contents)) {
    errors.push(`Secret-shaped nsec value found in ${file}.`);
  }
  secretPattern.lastIndex = 0;
}

if (errors.length > 0) {
  throw new Error(`Release validation failed:\n- ${errors.join("\n- ")}`);
}

process.stdout.write(`Release metadata is portable and consistent at v${version}.\n`);
