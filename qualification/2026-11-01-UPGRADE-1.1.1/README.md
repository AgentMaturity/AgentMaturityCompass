# UPGRADE-1.1.1: a 1.1.1 workspace upgraded to this line

Date: 2026-11-01. Source: `rtd/gap-upgrade` at `0fe34af0ed97131c0671c4357618dd99a285b9be` (package version 1.2.0, the line that ships as 2.0.0). macOS 26.6.2 arm64, Node v22.23.3.

## What was qualified

A workspace created and used with AMC 1.1.1 was opened, verified, migrated and used with this line's packed build. Every command ran in a new process with an empty HOME, its own npm cache, no `AMC_*` or `npm_config_*` variables from the caller and an ephemeral `AMC_VAULT_PASSPHRASE`, the discipline of `scripts/qualify-platform.mjs`. `reproduce.sh` is the exact driver; `commands.json` lists every command with its exit code and duration.

### The 1.1.1 build

The tarball was not fetched from the npm registry: this lane makes no network fetch. It was built from the `v1.1.1` tag (`ff53902225ff276c55558d5ca17a8fc60b780655`):

```bash
git archive v1.1.1 | tar -x -C <scratch>/src111
cd <scratch>/src111 && npx tsc -p tsconfig.json && chmod +x dist/cli.js && npm run -s copy-assets
npm pack --ignore-scripts --pack-destination <scratch>
```

`agent-maturity-compass-1.1.1.tgz` sha256 `8ce09962afe5686a12480ef9eb34212d0a721ffda6a3796101a62e8caefdad94` (3233 files). It was not compared with the registry's `dist.integrity`, so this qualifies the tagged 1.1.1 source, not the published bytes. Both consumers resolved their dependencies from the line's shared `node_modules` (1.1.1's dependency ranges are satisfied by it; the line pins newer `@modelcontextprotocol/sdk` and `zod` minors) instead of a registry install.

This line: `npm run -s build && npm pack --ignore-scripts`, `agent-maturity-compass-1.2.0.tgz` sha256 `10e0409f9c67bc60957b1a436d0a4911982c251ecf2ea88b41524f29f737c415`.

### The 1.1.1 workspace

With the 1.1.1 CLI: `amc init --skip-vault` (vault created with the passphrase from the environment), a score run (`amc run --score-only --json`), a wrapped agent run captured as a sealed, vault-signed session (`amc evidence collect --first-run --runtime any -- node -e ...`), a signed budget (`amc budgets init`), a signed action policy (`amc policy action init`) and a governor check. 1.1.1 has no native sessions or agent loop, so the governed session is the wrapped capture. The `.amc/` snapshot (106 files, ledger schema migrations 1 to 9, four evidence events, two sessions) is `<scratch>/final/ws111-snapshot.tgz`, sha256 `eaa541355b0b9c878f432de50ca7f99acd327b010f862156b7e6a28218e97e12`. It holds the encrypted vault, so it is not committed.

1.1.1's own `amc verify all` already exits 1 on this workspace (`passport-policy-signature: file missing`), and its score run is `INVALID` with `TRUST_BOUNDARY_VIOLATION` (the default shared trust boundary). Both are the 1.1.1 baseline, not upgrade results.

## Results

| # | CLI | Command | Exit | Decisive output |
|---|---|---|---|---|
| b01 | 1.1.1 | `AMC_BACKUP_PASSPHRASE=… amc backup create --out <file>` | 0 | `Backup created` |
| u01 | line | `amc doctor --json` | 1 | `ok: false`; FAIL `key-history-monitor`, `-auditor`, `-lease`, `-session`: "legacy history has no admission signature" |
| u02 | line | `amc verify` | 1 | `Ledger verification FAILED: UNANCHORED` |
| u03 | line | `amc verify --expect-monitor <fp>` | 0 | `Ledger verification PASSED`, anchored to the pinned monitor key |
| u04 | line | `amc session verify --expect-monitor <fp>` | 0 | `Ledger verification PASSED`; 0 native sessions |
| u05 | line | `amc run --score-only --json` | 0 | `INVALID`, `TRUST_BOUNDARY_VIOLATION` (same as 1.1.1); ledger migrated to 16 |
| u06 | line | `amc governor check --agent default --action READ_ONLY --risk low --mode execute` | 0 | `allowed: true`, effective mode `SIMULATE` (same as 1.1.1) |
| u07 | line | `amc --agent default agent-loop run … --provider stub` | 1 | `AMC_NATIVE_BUDGET_REFUSED` before dispatch |
| m01 | line | `amc vault history migrate --role <role> --expected-sha256 <sha>` ×4 | 0 | current key admitted, original kept as `.untrusted-<sha256>` |
| m02 | line | `amc doctor --json` | 0 | `ok: true`, 27 PASS, 8 WARN, 0 FAIL |
| m03 | line | `amc verify --expect-monitor <fp> --relabel-legacy --dry-run` | 0 | `7 scanned, 1 to record` |
| m04 | line | `amc verify --expect-monitor <fp> --relabel-legacy` | 0 | `1 recorded`, signed `MIGRATION_RECEIPT` |
| m05 | line | `amc budgets sign` (after `daily.maxCostUsd: null`) | 0 | `Reviewed budgets signed` |
| m06 | line | `amc --agent default agent-loop run … --provider stub` | 0 | `turn 1 ended: complete`, 0 unsigned rows |
| m07 | line | `amc agent-loop verify <session> --expect-monitor <fp>` | 0 | `VERIFIED`, requests derived 2/2 |
| m08 | line | `amc session verify --expect-monitor <fp>` | 0 | `PASSED`; 2 closed native sessions |
| m09 | line | `amc verify all --expect-monitor <fp>` | 1 | `INCOMPLETE: critical checks not performed: passport-policy-signature, a4-projects` |
| m10 | line | `amc backup verify <1.1.1 backup> --pubkey .amc/keys/auditor_ed25519.pub` | 0 | `Backup verification PASSED` |
| m11 | line | `amc budgets verify` | 0 | `Budgets signature valid` |
| s01–s03 | line | `amc studio start --bind 127.0.0.1 …`, `GET /health`, `amc status`, SIGTERM | 0 | `/health` `{"status":"ok","dbStatus":"ok"}`; `Readiness: READY`; every 1.1.1-signed config `VALID`; exit 0 on SIGTERM |

Ledger: `schema_migrations` reads 1 to 16 after the upgrade; every 1.1.1 evidence row and the 1.1.1 session still verify under the pinned monitor key. The vault unlocks with the same passphrase and keys (the fingerprints in `vault.amcvault.meta.json` are unchanged) and `vault.amcvault` is re-encrypted on the first unlock; 1.1.1 cannot unlock it afterwards (finding 1).

## Findings

No 1.1.1 signature failed to verify, no migration threw and the new build refused no 1.1.1 schema. Every failure above is a documented 2.0.0 change; seven were missing or wrong in the Migration section of `docs/releases/2.0.0.md`, which this lane corrected:

1. **Backup before the first 2.0.0 unlock.** 1.1.1 `amc backup create` refuses without `AMC_BACKUP_PASSPHRASE` or `AMC_BACKUP_PASSPHRASE_FILE`, and once 2.0.0 has unlocked the vault, 1.1.1 reports `Vault unlock failed: incorrect passphrase or corrupted vault` (seen while exploring). The Migration section now names the variable and the order.
2. **`amc verify --json` does not exist in 1.1.1** (`error: unknown option '--json'`). The section now prescribes `amc verify all --json`.
3. **Unanchored ledger.** Every verify fails `UNANCHORED` after the upgrade until a monitor pin is given. The section now says to record `shasum -a 256 .amc/keys/monitor_ed25519.pub` outside the workspace before upgrading and pass it as `--expect-monitor`.
4. **Ledger migrations.** The section said 10 to 13; the build applies 10 to 16 (evidence-store encryption rule, agent lifecycle state, incident clock runs added).
5. **Doctor FAIL on legacy key history.** Not mentioned before; the section now prescribes `amc vault history migrate` per role (m01), after which the doctor passes (m02).
6. **`--relabel-legacy` needs the pin.** Without `--expect-monitor` it prints `Legacy relabel skipped: the integrity check failed. Nothing was written.` The section now gives the pinned form.
7. **1.1.1 budgets refuse native turns.** 1.1.1 `amc budgets init` writes `daily.maxCostUsd: 50`; under `wp28b-budget-reservations` a hard USD budget admits a request only under a signed request bound, so even the keyless stub turn refuses `AMC_NATIVE_BUDGET_REFUSED`. docs/BUDGETS.md stated it; the Migration section did not. It now prescribes `daily.maxCostUsd: null` (or `nativeUsdBounds`) and `amc budgets sign`, which m05 and m06 confirm.

Open, not upgrade-specific (a fresh 1.2.0 workspace shows the same): `amc verify all` reports `INCOMPLETE` because `passport-policy-signature` and `a4-projects` are skipped critical checks when no passport policy or A4 project exists, and `amc user add` needs a terminal for its password prompt. The score run's claim label says "the signature does not verify" for a run whose artifact verification passed but whose trust boundary is shared.

## Reproduce

```bash
export PATH="$(brew --prefix node@22)/bin:$PATH"
# build and pack 1.1.1 as above into <scratch>/c111/package; pack this line and extract it into <scratch>/c3/package;
# link each package's node_modules to an install that satisfies its dependencies
zsh qualification/2026-11-01-UPGRADE-1.1.1/reproduce.sh <scratch>/c111/package <scratch>/c3/package <scratch>/final
```

Ports 47811, 47812, 3210, 3211 and 9464 must be free for the Studio step.
