# Build and deployment provenance

The local and hosted bundles are built from the public repository with the locked dependency graph.
Run the following commands from a clean checkout:

```bash
npm ci
npm run check
npm run build:hashes
shasum -a 256 -c SHA256SUMS
```

`SHA256SUMS` records the local bundle, hosted bundle, and dependency-lock hashes. Two consecutive clean
build commands must produce identical bundle hashes before release. Tagged releases additionally use
GitHub's build-provenance attestation action for the downloadable archive.

The live service exposes `/provenance`, containing the public source repository, deployed Git revision,
hosted bundle SHA-256, and reproduction command. A matching hash proves byte equality with the public
bundle; it does not prove that Railway is executing those bytes or eliminate trust in the host. Verify
the local edition when that remaining operator trust is unacceptable.
