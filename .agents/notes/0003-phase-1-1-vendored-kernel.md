---
id: 0003
title: P1.1 — Cordis vendored, rescoped, and running
status: implemented
date: 2026-08-22
gates: [P1.1]
implements: [ADR-0001, ADR-9]
---

# ADR-0003 — P1.1: the vendored composition kernel

**Exit criterion met.** `import { Context } from "@amc/cordis"` resolves through
the workspace link and runs from plain Node: a plugin loads, its tracked effect
is released on unload, and a registered service is withdrawn from the context.
Disposal — not loading — is the property later phases depend on.

## What landed

- `vendor/` — nine packages from dsh's already-patched tree, rescoped
  `@deepseek-ai/*` → `@amc/*` by `scripts/vendor/rescope-vendor.mjs`.
  Directory names, versions, dependency ranges and every upstream runtime
  identifier (`Symbol.for('schemastery')`, Schemastery's `vendor:` field) are
  unchanged.
- `vendor/VENDOR_DIVERGENCE.md` — AMC's ledger, three AMC-local modifications
  with per-patch provenance.
- `vendor/UPSTREAM_LEDGER_DSH.md` — dsh's own ledger, verbatim.
- `THIRD_PARTY_NOTICES` — generated, with the BSD-3-Clause obligation for
  `native/landlock-run` recorded as pending against P4.4.
- Three gates in CI: `check:vendor-links`, `check:vendor-rescope`,
  `check:third-party-notices`.

## The package manager was forced, not chosen

ADR-0001 chose pnpm on structural grounds. It turned out to be mandatory: the
vendored manifests declare each other with pnpm's `workspace:` protocol, which
npm cannot parse — npm cannot even generate a lockfile against this tree. That
made the migration part of P1.1 rather than P1.2.

Consequences worked through rather than deferred:

- `nodeLinker: hoisted`. AMC's own release tooling walks `node_modules/<name>`
  for every dependency; pnpm's default isolated store exposes only direct
  dependencies there, so the SBOM and licence report would have silently lost
  every transitive package. The flat layout is load-bearing until that tooling
  reads a graph instead of a directory.
- `src/release/lockfileDependencies.ts` — new. `releaseSbom` and
  `releaseLicenses` parsed `package-lock.json` directly, so both stopped working
  on the repository whose compliance artifacts they generate. They now read
  either lockfile, because a consumer's workspace may use either.
- `audit:runtime` is `pnpm audit --prod`; `npm audit` has no lockfile to read.
  The test now asserts the *properties* (production-only, moderate severity)
  rather than the tool name.
- CI: seven workflows moved to `pnpm/action-setup` + `pnpm install
  --frozen-lockfile`; path triggers and four tests moved off `package-lock.json`.
- `package-lock.json` is deleted and ignored. Two lockfiles would be two
  silently-drifting sources of truth.

## Vendored build

`scripts/vendor/build-vendor.mjs`. `tsc -b` emits JS and declarations into
`lib/types/`, but every vendored manifest points `main` at `lib/<entry>.js` —
dsh reconciles this with tsdown, which AMC does not carry. Without the shim,
`@amc/cordis` fails to resolve with "Failed to resolve entry for package" even
though the link is correct.

## Corrections made while verifying

Two assertions in the first smoke test were my assumptions, not kernel
behaviour: services register from their constructor via `super(ctx, name)`
rather than a static `provide` field, and subtree teardown runs outer-then-inner.
The disposal test now asserts that every cleanup in a subtree runs, as a set —
pinning Cordis's ordering would turn an upstream implementation detail into an
AMC contract.

## Next

P1.2 — `amc-core` boot + loader + config, and the `packages/*` restructure.
`pnpm-workspace.yaml` already declares `packages/*` so members can be carved out
of `src/` without another workspace change.
