# Vendor divergence ledger

Every difference between `vendor/` and upstream Cordis, with **per-patch
provenance** as ADR-9 requires. Three origins are distinguished, because they
carry different obligations:

| Origin | Meaning | On upstream sync |
|---|---|---|
| `upstream-cordis` | Present in the Cordiverse source | Nothing to re-apply |
| `dsh` | Applied by DeepSeek Harness before AMC vendored it | Re-apply, or drop if upstream absorbed it |
| `AMC-local` | Applied here | Re-apply, and justify again |

The `dsh` modifications arrived with the tree and are recorded verbatim in
[UPSTREAM_LEDGER_DSH.md](./UPSTREAM_LEDGER_DSH.md) — that file is dsh's own
ledger, kept unedited so their reasoning is not paraphrased away. This file
does not restate them; it records what **AMC** changed on top, and the sync
procedure that keeps both honest.

## Manifest (as vendored)

Versions are read from the tree, not copied from dsh's table — dsh's manifest
records cordis at `4.0.0-rc.7` while the tree actually carries `4.0.1`, so
copying it would have published a false provenance claim.

| Directory | npm name (AMC) | Version |
|---|---|---|
| `cordis/` | `@amc/cordis` | 4.0.1 |
| `cosmokit/` | `@amc/cosmokit` | 1.8.2 |
| `group/` | `@amc/cordis-plugin-group` | 1.0.1 |
| `hmr/` | `@amc/cordis-plugin-hmr` | 1.0.16 |
| `include/` | `@amc/cordis-plugin-include` | 1.0.6 |
| `loader/` | `@amc/cordis-plugin-loader` | 1.0.2 |
| `logger-console/` | `@amc/cordis-plugin-logger-console` | 1.0.1 |
| `schemastery/` | `@amc/schemastery` | 3.18.1 |
| `timer/` | `@amc/cordis-plugin-timer` | 1.1.3 |
Third-party dependencies of these packages stay on npm and are not vendored:
`@standard-schema/spec`, `js-yaml`, `chokidar`, `picomatch`,
`@babel/code-frame`, `supports-color`, `node-addon-require-builtin`.

## AMC-local modifications

Keep this exhaustive. Every divergence introduced here must be listed with its
rationale, so a future sync can decide to re-apply or drop it.

1. **`@amc` rescope** — *AMC-local, supersedes dsh's `@deepseek-ai` rescope
   (their ledger §17).* Every vendored manifest `name`, every internal
   dependency among the vendored set, and every module specifier that reaches
   them now use `@amc/*`. Deliberately unchanged: directory names, version
   numbers, dependency ranges, and every upstream runtime identifier —
   `Symbol.for('schemastery')` and Schemastery's `vendor: 'schemastery'`
   metadata field keep their upstream values, because renaming those would
   change behaviour rather than packaging. Re-apply with
   `node scripts/vendor/rescope-vendor.mjs --apply`; verify with `--check`.

2. **`vendor/hmr/package.json` declares its loader and include peers** —
   *AMC-local.* `hmr/src/index.ts` imports `ModuleLoader` from
   `@amc/cordis-plugin-loader` and the `Include` type from
   `@amc/cordis-plugin-include`, but the manifest declared neither. Under
   pnpm's strict resolution nothing links them and the package does not
   compile. Both are declared as `peerDependencies` (matching how `cordis` and
   `timer` are already declared) rather than dependencies, because hmr composes
   with them rather than owning them. This is a genuine phantom dependency in
   the upstream manifest, not a packaging preference — worth offering upstream.

3. **`vendor/schemastery/tsconfig.json` sets `moduleResolution: "bundler"`** —
   *AMC-local.* Upstream sets `module: "preserve"`, which TypeScript rejects
   against the `NodeNext` resolution the shared base applies to every other
   vendored package. Scoped to the one package that needs it, rather than
   loosening the base for all nine.

## Root configuration this tree depends on

These live outside `vendor/` but exist for it, and a sync must keep them in
step:

- **`tsconfig.base.json`** — the shared base each vendored package extends
  (dsh's ledger §3 regenerated their tsconfigs to extend a repo-root base of
  the same name). It sets `allowImportingTsExtensions` for the explicit `.ts`
  specifiers dsh introduced (§4), `composite` for the project references
  between packages, `ES2024` because `timer` uses `Promise.withResolvers`, and
  both the `node` types and the `DOM` lib because `cosmokit` uses `Buffer` and
  `btoa`/`atob` in the same file.

  It deliberately does **not** set `verbatimModuleSyntax`. dsh marked erased
  imports explicitly across cordis, loader, include, hmr and schemastery
  (their §10) but not `logger-console`, so enabling it would mean patching
  vendored source to satisfy a setting upstream never had.

- **`pnpm-workspace.yaml`** — `linkWorkspacePackages: true` plus
  `onlyBuiltDependencies` for `better-sqlite3` and `esbuild`. pnpm is not a
  preference here: the vendored manifests use the `workspace:` protocol, which
  npm cannot parse.

## Gates

- `node scripts/vendor/verify-vendored-links.mjs` — every vendored package
  resolves to the workspace copy and never to a registry package of the same
  name. A registry publication under one of these names would otherwise swap
  the kernel out silently.
- `node scripts/vendor/rescope-vendor.mjs --check` — no `@deepseek-ai`
  reference has crept back in.
- `node scripts/vendor/gen-third-party-notices.mjs --check` —
  `THIRD_PARTY_NOTICES` matches the tree, and every vendored package still
  carries its `LICENSE`.

## Sync procedure

1. In the upstream workspace, note `git rev-parse HEAD` of the relevant module.
2. Copy the package's `src/` (and `bin.js`, `README.md`, `LICENSE` if changed)
   over the vendored directory.
3. Re-apply the `dsh` modifications from `UPSTREAM_LEDGER_DSH.md`, then the
   `AMC-local` ones above — or drop any upstream has absorbed, updating the
   relevant log either way.
4. Update the version in the manifest table above.
5. `pnpm install && node scripts/vendor/rescope-vendor.mjs --apply`
6. `node scripts/vendor/verify-vendored-links.mjs && node scripts/vendor/gen-third-party-notices.mjs`
7. `npm run typecheck && npm test`
