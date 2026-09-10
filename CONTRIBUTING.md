# Contributing

Contributions are welcome after the local release candidate is published to a repository. Security and interoperability changes need evidence, not just a passing happy-path demo.

## Ground rules

- Never use a real `nsec`, seed phrase, backup, private key, account identifier, or production pairing URI in code, tests, screenshots, issues, or commits.
- Preserve the prepare → explicit sign intent → signer approval → separate publish intent sequence.
- Keep signer, session, relay, MCP, and UI layers separable and dependency-injected.
- Prefer maintained Nostr libraries to custom cryptography. A new dependency needs a maintenance, license, size, and security rationale.
- Do not broaden event kinds, read filters, signer methods, storage, or network destinations without updating the threat model and decision log.
- Treat tests as simulated/mocked evidence unless a separate live compatibility record names the signer version, relay set, date, and observable result.

## Development

```bash
npm install
npm run check
npm run demo
```

Use `npm test -- --coverage` when changing validation, redaction, session state, or request binding. Add focused tests for success, rejection, timeout, stale response, replay, and log output.

## Pull-request checklist

- Explain the user-visible change and trust-boundary impact.
- Add or update tests that prove meaningful behavior.
- Run `npm run check` and `npm audit --omit=dev`.
- Run a secret scan and inspect the staged diff.
- Update `SECURITY.md`, `README.md`, `DECISIONS.md`, and the compatibility matrix when applicable.
- Identify what is mocked and what was live-tested.
- Do not include generated `dist/`, coverage, local environment files, logs, or session material unless the packaging process explicitly requires a reviewed build artifact.

## Commit style

Use small imperative commits. Security fixes should avoid exploit details in public commit messages until disclosure is coordinated. Every release must be tagged from a clean tree after the full gate passes.
