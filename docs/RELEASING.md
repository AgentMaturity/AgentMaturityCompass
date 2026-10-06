# Releasing AMC

AMC releases are deterministic, signed, and offline-verifiable.

## 1) Create a changeset

```bash
npm run changeset
```

Commit the generated `.changeset/*.md` file in your PR.

## 2) Prepare a release key

Initialize release signing metadata:

```bash
amc release init
```

To write a private key file:

```bash
amc release init --write-private-to .amc/release/keys/release-signing
```

For CI, provide one of:
- `AMC_RELEASE_SIGNING_KEY_FILE`
- `AMC_RELEASE_SIGNING_KEY` (base64 of PEM)

## 3) Build and pack release bundle

```bash
amc release pack --out dist/amc-<version>.amcrelease
```

Bundle contents include:
- npm tarball
- CycloneDX SBOM
- dependency license inventory
- provenance record
- secret scan report
- signed manifest + public key

## 4) Verify offline

```bash
amc release verify dist/amc-<version>.amcrelease --pubkey <published-release-signing.pub>
```

Optional public-key override:

```bash
amc release verify dist/amc-<version>.amcrelease --pubkey <published-release-signing.pub> --pubkey ./release-signing.pub
```

## 5) Tag-driven GitHub release

`/.github/workflows/release.yml` runs on tags `v*.*.*` and:
- runs tests/build
- runs prepack release guardrails
- builds + signs `.amcrelease`
- verifies bundle offline
- publishes npm package
- uploads release assets to GitHub Releases

## 6) Operational runbooks (required)

Before cutting a release, execute:
- [`docs/RELEASE_RUNBOOK.md`](./RELEASE_RUNBOOK.md)
- [`docs/MIGRATION_RUNBOOK.md`](./MIGRATION_RUNBOOK.md)

These define required backup/restore drills, post-release verification, and rollback triggers.

## Key Rotation

Generate a new release keypair and distribute the new public key to verifiers:

```bash
amc release init --write-private-to /secure/path/release-signing
```

Do not commit private keys.
