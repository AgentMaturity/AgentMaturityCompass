---
"agent-maturity-compass": patch
---

The `amc-action` GitHub Action installs the local build with pnpm (`pnpm install --frozen-lockfile`) instead of `npm ci`, which failed because the repository has only `pnpm-lock.yaml`. It sets up pnpm 10.33.0 only when `amc-version` is `local`.
