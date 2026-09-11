const NSEC_PATTERN = /\bnsec1[023456789acdefghjklmnpqrstuvwxyz]{20,}\b/giu;
const BUNKER_SECRET_PATTERN = /((?:bunker|nostrconnect):\/\/[^\s"']*?[?&]secret=)[^&\s"']+/giu;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/giu;
const NOSTR_AUTH_PATTERN = /\bNostr\s+[A-Za-z0-9+/]+=*/giu;
const SERIALIZED_SENSITIVE_VALUE_PATTERN =
  /("(?:content|plaintext|ciphertext)"\s*:\s*)"(?:[^"\\]|\\.)*"/giu;
const SENSITIVE_KEY_PATTERN =
  /^(?:nsec|private_?key|secret_?key|auth_?token|access_?token|plaintext|content)$/iu;

export class UnsafeSecretInputError extends Error {
  constructor() {
    super(
      "Secret-key material is not accepted. Use a NIP-07 browser extension or NIP-46 pairing flow.",
    );
    this.name = "UnsafeSecretInputError";
  }
}

export function containsNsecLike(value: unknown): boolean {
  if (typeof value === "string") {
    NSEC_PATTERN.lastIndex = 0;
    return NSEC_PATTERN.test(value);
  }
  if (Array.isArray(value)) return value.some(containsNsecLike);
  if (value && typeof value === "object") {
    return Object.entries(value).some(
      ([key, child]) =>
        /^(?:nsec|private_?key|secret_?key)$/iu.test(key) || containsNsecLike(child),
    );
  }
  return false;
}

export function assertNoNsec(value: unknown): void {
  if (containsNsecLike(value)) throw new UnsafeSecretInputError();
}

export function redactString(value: string): string {
  NSEC_PATTERN.lastIndex = 0;
  BUNKER_SECRET_PATTERN.lastIndex = 0;
  BEARER_PATTERN.lastIndex = 0;
  NOSTR_AUTH_PATTERN.lastIndex = 0;
  return value
    .replace(NSEC_PATTERN, "[REDACTED_NSEC]")
    .replace(BUNKER_SECRET_PATTERN, "$1[REDACTED]")
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(NOSTR_AUTH_PATTERN, "Nostr [REDACTED]")
    .replace(SERIALIZED_SENSITIVE_VALUE_PATTERN, '$1"[REDACTED]"');
}

export function redact(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((entry) => redact(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]),
    );
  }
  return value;
}

export type LogSink = (line: string) => void;

export class SafeLogger {
  constructor(private readonly sink: LogSink = (line) => process.stderr.write(`${line}\n`)) {}

  info(message: string, fields: Record<string, unknown> = {}): void {
    this.write("info", message, fields);
  }

  error(message: string, error: unknown, fields: Record<string, unknown> = {}): void {
    const safeError =
      error instanceof Error
        ? { name: error.name, message: redactString(error.message) }
        : redact(error);
    this.write("error", message, { ...fields, error: safeError });
  }

  private write(level: string, message: string, fields: Record<string, unknown>): void {
    const safeFields = redact(fields) as Record<string, unknown>;
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message: redactString(message),
      ...safeFields,
    });
    this.sink(line);
  }
}

export function publicError(error: unknown): Error {
  if (error instanceof UnsafeSecretInputError) return error;
  const message = error instanceof Error ? redactString(error.message) : "Unexpected error";
  return new Error(message);
}
