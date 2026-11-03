# UPGRADE-1.1.1 (published): the npm 1.1.1 package upgraded to this line

Date: 2026-11-03. Source: `rtd/gap-upgrade111` at `6d7835b5033fa5584b9c680fa8fed18dfbed5482` (package version 1.2.0, the line that ships as 2.0.0). macOS 26.6.2 arm64, Node v22.23.3, npm 10.9.9.

This receipt repeats `qualification/2026-11-01-UPGRADE-1.1.1/` with the bytes npm users actually have. That receipt used a tarball rebuilt from the `v1.1.1` tag, and the published tarball differs from it materially: 104 files exist only in the published package and 246 files differ (the published `dist/` carries hook integration, the Hermes adapter and a different `verify all`, among others). The published 1.1.1 was therefore built from a later source than the tag.

## What was qualified

A workspace created and used with the published AMC 1.1.1 was opened, verified, migrated and used with this line's packed build. The driver is `qualification/2026-11-01-UPGRADE-1.1.1/reproduce.sh` (sha256 `a79c47df8b6953580d91eb94e7ac644cea37ceaea58c7446e8b9078d57844e74`), unchanged: every command ran in a new process with an empty HOME, its own npm cache, no `AMC_*` or `npm_config_*` variables from the caller and an ephemeral `AMC_VAULT_PASSPHRASE`. `commands.json` lists every command with its exit code and duration.

### The published 1.1.1 package

`agent-maturity-compass-1.1.1.tgz` as served by the npm registry, checked against the registry's `dist.integrity`:

- registry integrity `sha512-lMwIlX26+w+6FAyh12KLlbl3i3gmmvazlk4PS8/aaEron8Higa3xHOHL3Wy41lmvyNDinNg8mCDfMej50j2X3w==` (recomputed from the file and equal)
- sha256 `2aaa010a90dc9993bfca8b02453c203b82e3d5900d92d0d18fd8b38f0148d27d`, 3337 files

It was installed the way a user installs it, as a dependency of an empty consumer package, with its production dependencies and their build scripts (better-sqlite3 12.11.1 compiled its native binding):

```bash
mkdir <scratch>/c111 && cd <scratch>/c111 && echo '{"name":"c111","private":true}' > package.json
npm install --omit=dev --no-audit --no-fund <scratch>/agent-maturity-compass-1.1.1.tgz   # 171 packages
```

The 1.1.1 package dir is `<scratch>/c111/node_modules/agent-maturity-compass`. Running `npm install --omit=dev` inside the extracted package dir instead fails in npm 10.9.9 with `Cannot read properties of null (reading 'edgesOut')`, an npm Arborist failure on the package's own `overrides` (`qs: 6.15.2`) while it resolves the dev tree; an npm user never takes that path.

### This line

`npm run -s build && npm pack --ignore-scripts --pack-destination <scratch>` (47 s for both), `agent-maturity-compass-1.2.0.tgz` sha256 `388f339fa177b3abc5486e63f062fe48f9e29ef40bebd329671732569b195ef9` (6691 files), extracted to `<scratch>/c3/package` with `node_modules` linked to the line's installed dependencies, as in the 2026-11-01 receipt.

### The 1.1.1 workspace

Created by the published 1.1.1 CLI with the same steps as before (c01 to c07). The `.amc/` snapshot (104 files, ledger schema migrations 1 to 9) is `<scratch>/final/ws111-snapshot.tgz`, sha256 `cf3bb3b0768d8e2c9a708aafa0929d5d0c7b7ae026eac3ed2a43da98115abf7f`. It holds the encrypted vault, so it is not committed. Monitor key fingerprint `1ed41404b6827f214c8cb4ca5aa4679841cefcf412dbc13346c9a3ea3cd59945`.

## Results

| # | CLI | Command | Exit | Decisive output | Same as the tag rebuild |
|---|---|---|---|---|---|
| c01–c06 | 1.1.1 | init, score run, evidence collect, budgets init, action policy init, governor check | 0 | score `INVALID`, `TRUST_BOUNDARY_VIOLATION`; governor `allowed: true`, `SIMULATE`; `budgets.yaml` `daily.maxCostUsd: 50` | yes |
| c07 | 1.1.1 | `amc verify all --json` | 0 | `status: PASS`; `passport-policy-signature` SKIP "passport not initialized yet" | **no**: the tag rebuild exited 1 with `passport-policy-signature: file missing` |
| b01 | 1.1.1 | `AMC_BACKUP_PASSPHRASE=… amc backup create --out <file>` | 0 | `Backup created` | yes |
| u01 | line | `amc doctor --json` | 1 | `ok: false`; 27 PASS, 8 WARN, 2 INFO, FAIL `key-history-monitor`, `-auditor`, `-lease`, `-session`: "legacy history has no admission signature" | yes |
| u02 | line | `amc verify` | 1 | `Ledger verification FAILED: UNANCHORED` | yes |
| u03 | line | `amc verify --expect-monitor <fp>` | 0 | `Ledger verification PASSED`, anchored to the pinned monitor key | yes |
| u04 | line | `amc session verify --expect-monitor <fp>` | 0 | `PASSED`; 0 native sessions | yes |
| u05 | line | `amc run --score-only --json` | 0 | `INVALID`, `TRUST_BOUNDARY_VIOLATION` (same as 1.1.1) | yes |
| u06 | line | `amc governor check --agent default --action READ_ONLY --risk low --mode execute` | 0 | `allowed: true`, effective mode `SIMULATE` | yes |
| u07 | line | `amc --agent default agent-loop run … --provider stub` | 1 | `AMC_NATIVE_BUDGET_REFUSED` before dispatch | yes |
| m01 | line | `amc vault history migrate --role <role> --expected-sha256 <sha>` ×4 | 0 | current key admitted, original kept as `.untrusted-<sha256>` | yes |
| m02 | line | `amc doctor --json` | 0 | `ok: true`, 27 PASS, 8 WARN, 2 INFO, 0 FAIL | yes |
| m03 | line | `amc verify --expect-monitor <fp> --relabel-legacy --dry-run` | 0 | `7 scanned, 1 to record` | yes |
| m04 | line | `amc verify --expect-monitor <fp> --relabel-legacy` | 0 | `1 recorded`, signed `MIGRATION_RECEIPT` | yes |
| m05 | line | `amc budgets sign` (after `daily.maxCostUsd: null`) | 0 | `Reviewed budgets signed` | yes |
| m06 | line | `amc --agent default agent-loop run … --provider stub` | 0 | `turn 1 ended: complete` | yes |
| m07 | line | `amc agent-loop verify <session> --expect-monitor <fp>` | 0 | `VERIFIED`, 0 unsigned rows, requests derived 2/2 | yes |
| m08 | line | `amc session verify --expect-monitor <fp>` | 0 | `PASSED`; 2 closed native sessions | yes |
| m09 | line | `amc verify all --expect-monitor <fp>` | 1 | `INCOMPLETE`: `passport-policy-signature` and `a4-projects` are skipped critical checks | yes |
| m10 | line | `amc backup verify <1.1.1 backup> --pubkey .amc/keys/auditor_ed25519.pub` | 0 | `Backup verification PASSED` | yes |
| m11 | line | `amc budgets verify` | 0 | `Budgets signature valid` | yes |
| s01–s03 | line | `amc studio start --bind 127.0.0.1 …`, `GET /health`, `amc status`, SIGTERM | 0 | `/health` `{"status":"ok","version":"1.2.0","dbStatus":"ok"}`; `Readiness: READY`; every 1.1.1-signed config `VALID`; exit 0 on SIGTERM | yes |
| x01 | 1.1.1 | `amc vault unlock` on a copy of the upgraded workspace | 1 | `Vault unlock failed: incorrect passphrase or corrupted vault.` | confirms finding 1 of the 2026-11-01 receipt |
| x02 | 1.1.1 | `AMC_BACKUP_PASSPHRASE=… amc backup create` on that copy | 1 | `ops policy invalid: TypeError: entries.map is not a function` | new evidence for the same finding |

x01 and x02 are outside `reproduce.sh`: after the driver finished, `.amc/` was copied to `<scratch>/xws` and the published 1.1.1 CLI was run there with the same environment discipline.

Ledger: `schema_migrations` reads 1 to 16 after the upgrade; every 1.1.1 evidence row and the 1.1.1 session verify under the pinned monitor key.

## Findings

Every upgrade command (u, m and s) has the same exit code and the same decisive output as with the tag rebuild. No 1.1.1 signature failed to verify, no migration threw and the new build refused no published 1.1.1 schema. No AMC 2.0 defect was found, so `src/` is unchanged.

1. **The 1.1.1 baseline differs, not the upgrade.** The published 1.1.1 `verify all` skips the passport checks when no passport exists, so it passes (c07) where the tag rebuild failed. After the upgrade, 2.0.0 reports `INCOMPLETE` for the same skipped critical checks (m09), as it does on a fresh 2.0.0 workspace.
2. **The Migration section had lost its 1.1.1 corrections.** The seven corrections the 2026-11-01 receipt made to `docs/releases/2.0.0.md` (commit `0fe34af0e`) were reverted by the merge of `rtd/gap-earlya` (`dae416c94`), so the section again said `amc verify --json`, "ledger migrations 10 to 13" and nothing about the monitor pin, key history, the relabel pin or the 1.1.1 USD budget. This run reproduces every one of them with the published bytes (b01, u01, u02, u07, m01 to m06, x01, ledger migrations 1 to 16), and this lane restores the seven corrections unchanged.
3. **After the upgrade, 1.1.1 can no longer back up the workspace.** x01 and x02 confirm that the backup must be taken before the first 2.0.0 command, as the restored Migration section says: the published 1.1.1 cannot unlock the re-encrypted vault, and its backup refuses before reaching the vault, while reading the upgraded workspace's policy state.

Open and not upgrade-specific, as before: `amc verify all` reports `INCOMPLETE` without a passport policy or an A4 project.

## Reproduce

```bash
export PATH="$(brew --prefix node@22)/bin:$PATH"
# install the published 1.1.1 into <scratch>/c111 as above; pack this line and extract it into <scratch>/c3/package,
# with node_modules linked to an install of the line's dependencies
zsh qualification/2026-11-01-UPGRADE-1.1.1/reproduce.sh <scratch>/c111/node_modules/agent-maturity-compass <scratch>/c3/package <scratch>/final
```

Ports 47811, 47812, 3210, 3211 and 9464 must be free for the Studio step.
