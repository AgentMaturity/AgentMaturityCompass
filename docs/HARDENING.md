# Hardening AMC Deployment

This is the short practical entry point for teams who need the secure deployment story without reading the entire architecture archive.

## Read this with

- `docs/SECURITY.md`
- `docs/security/THREAT_MODEL.md`
- `docs/OPS_HARDENING.md`
- `docs/DEPLOYMENT.md`

## High-priority hardening moves

### 1. Prefer controlled deployment environments
- use Docker/Compose, Helm, or other repeatable infra
- avoid ad-hoc snowflake installs for anything team-facing

### 2. Protect secrets and signing material
- keep vault/signing secrets out of source control
- use environment or secret managers, not committed files
- rotate release and signing keys with intent

### 3. Restrict network paths
- use gateway/proxy patterns intentionally
- limit direct provider/network access where the deployment model supports it
- segment AMC services from unrelated workloads when possible

### 4. Verify before you trust
- run `amc doctor`
- run verification flows
- treat broken signatures, invalid policy, or missing evidence as real issues, not cosmetic warnings

### 5. Make retention and backups explicit
- define retention behavior
- test backup/restore paths
- know what is archived vs pruned

## Minimum secure-operating baseline

At minimum, a team deployment should have:
- controlled install path
- documented secret handling
- repeatable deploy method
- verification/doctor checks in runbooks or CI
- changelog/release review before upgrades

## Bottom line

AMC is a trust tool. If the deployment itself is sloppy, you kneecap the exact thing the product is trying to prove.
