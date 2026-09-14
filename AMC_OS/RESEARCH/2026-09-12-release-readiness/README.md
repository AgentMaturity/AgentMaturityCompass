<!-- Written by the integrating root session on 2026-09-14 from the readiness:b0-b1 fleet agent's report
     (run wf_c844d75d-d8d, 41 tool uses, REPORT_ONLY; record AMC_OS/RESEARCH/2026-09-14-fleet-sequential/readiness-b0-b1/).
     The directory name carries the label the fleet prompt used (2026-09-12); the audit ran on 2026-09-14 against 505a28ce.
     Root actions after the audit: the stray tracked `--/.amc/` workspace was untracked and guarded in `7cfcb767` (files kept on
     disk; history untouched). Everything else below is unchanged and awaits the B0/B1 decisions named in section 6. -->

# Release readiness — B0/B1/B2 read-only audit

**Date:** 2026-09-14  
**Integration commit audited:** `505a28ce965fca69d3ed52978f171e95789eb852` (`amc/gap-register-execution`, 2026-09-14 12:38 +0530)  
**Environment:** Darwin 25.6.0 arm64, Node v25.5.0, pnpm 10.33.0  
**Write scope:** none. No files in the repo were modified.

## 0. Boundary of this audit

- The worktree the harness provisioned (`.claude/worktrees/wf_c844d75d-d8d-1`) was at **`3d6b8d4a` (2026-07-15)**, an ancestor **437 commits behind** `505a28ce`; `plans/` does not exist there. I did not check out, reset or stash. Instead the `505a28ce` tree was exported read-only (`git archive 505a28ce | tar -x`) into the session scratchpad, and `pnpm install --frozen-lockfile --prefer-offline`, `pnpm build`, and the two B2 scripts were run **in that export**. All `file:line` citations below are against the `505a28ce` tree unless marked *HEAD-3d6b8d4a*.
- **Exercised:** static reads of source, .gitignore, deploy files and plans/records at 505a28ce; `git ls-tree` of both commits; install, build, `release:verify-version`, `release:prepack-check`.
- **Not exercised:** the vitest suite, `release:gate`, `check:packed-install`, `check:clean-source`, any mutation test, any runtime confirmation that verifiers reject literal `"unsigned"` signatures, the npm registry, the validity of any credential.

## 1. B0 — trust root (state at 505a28ce)

| Item | State | Evidence |
|---|---|---|
| Unsigned key-history JSON | **Mitigated** (signed envelope) | `src/crypto/keyHistoryEnvelope.ts:9-17` envelope carries `signature`; sealed over domain tag `AMC_KEY_HISTORY_ADMISSION_V1\0` (`:38-44`); `src/vault/vault.ts:204,549` seal, `:197,540` verify; `src/crypto/keys.ts:57-66` admission requires the active vault role key and an already-authenticated prior history. Not run-tested here. |
| Notary responses auto-append to auditor key history | **Mitigated** (explicit admission only) | Sole notary-sourced writer is `src/trust/trustConfig.ts:373`, inside the notary-enable path, after the signed trust config is saved (`:367-372`). `keys.ts:55` throws in no-sign mode; `:58-60` refuses without the active role key; `:67` warns on any non-local admission. Grep of `addPublicKeyToHistory|sealKeyHistory` finds no writer in `src/notary/*` or any client response path. |
| `AMC_NO_SIGN=1` writes literal `"unsigned"` | **Present** | `src/ledger/ledger.ts:203` reads the env; `:245,249` return `"unsigned"`. Also `let signature = "unsigned"` defaults at `src/governor/emergencyOverride.ts:145`, `policyCanary.ts:375`, `policyDebt.ts:129`, `canaryRegisters.ts:61`. Enabled by the instant-workspace paths `src/cli.ts:1767-1769` and `:5343-5345` when `state.vault.noSign` (`:1441-1446`: no `AMC_VAULT_PASSPHRASE`, no local passphrase file, but an existing vault). Partial mitigation: key admission/migration refuse in no-sign mode (`keys.ts:55,74`). Whether `amc verify` fails closed on a literal `"unsigned"` was **not exercised**; grep found no explicit handling beyond a display label at `src/cli.ts:20642`. |
| Vault falls back to `amc-test-passphrase` | **Narrowed, still present** | `src/vault/vault.ts:126-144`: `AMC_VAULT_PASSPHRASE` wins; the fallback fires **only when `process.env.VITEST === "true"` or `"1"`** (`:137-139`); otherwise it throws (`:141`). `NODE_ENV` is no longer consulted (`:130-136` comment). The literal remains in shipped source; an environment with `VITEST` set would reopen it. |
| `zkPrivacy.ts` placeholder crypto | **Present, labelled** | `src/vault/zkPrivacy.ts:1-35` header: "NOT a zero-knowledge proof system", enumerates the failing schnorr/range/bit proofs and the wrong group parameters, states only Pedersen commit/open and Shamir work, and that "the CLI and API surfaces say so". The CLI/API labelling itself was **not verified** in this run. |
| `binderVerifier` shells raw `tar -xzf` | **Mitigated** (validated extraction) | `src/audit/binderVerifier.ts:15` imports `extractValidatedTarGzipArchive`; `:54-56` delegates with limits (`:25-31`: 10,000 entries, 128 MiB entry, 512 MiB total, 1,024-byte paths). `src/security/safeTarArchive.ts:27` still spawns the system `tar` binary, but member paths are validated (`:38-50`) and limits enforced before extraction. `binderVerifier.ts:4` still imports `spawnSync` with no other use found. |
| `amc.config.yaml` (`trustBoundaryMode`) unsigned | **Mitigated for the `isolated` claim; signing is opt-in** | `src/config/amcConfigSignature.ts:13-22` signs with the auditor key; `:38-48` verifies. `src/ledger/ledger.ts:1287-1298` refuses `trustBoundaryMode=isolated` when unsigned or invalid ("sign it with: amc verify --sign-config"). Default mode is `shared` and unsigned (`src/workspace.ts:103`). |
| Plaintext demo vault passphrase on disk | **Present, hardened** | `src/studio/studioSupervisor.ts:64-76` writes `<hostDir>/demo-vault-passphrase`: random 32 bytes, `writeFileAtomic(..., 0o600)`. `src/cli.ts:1422-1424` `.amc/local-vault-passphrase`, read at `:1431-1436` (min 8 chars). `src/watch/continuousMonitor.ts:65` reads the same file. `.gitignore:27-28` ignores `.amc/studio/` and `.amc/studio-demo-host/`; **no pattern covers `.amc/local-vault-passphrase`**. |
| Default passphrases in both Dockerfiles | **Absent** | Two Dockerfiles: `Dockerfile`, `docker/Dockerfile.quickstart`. No `PASSPHRASE`/`PASSWORD` lines in either; `ENV`/`ARG` lines are `Dockerfile:4,12,32,54,73` (image, CI, NODE_ENV, HOME, AMC_WORKSPACE_DIR) and `docker/Dockerfile.quickstart:15` `ARG AMC_VERSION=1.1.1`. Secrets are file-mounted: `docker/entrypoint.sh:34-47`, `docker/docker-compose.yml:25-55`, `deploy/k8s/deployment.yaml:39-44,112-113`. Only `*.txt.example` secret files are tracked (`deploy/compose/secrets/`, values `change-me-*`); `deploy/k8s/kustomization.yaml:5-8` excludes `secret.yaml`. *HEAD-3d6b8d4a* still had `Dockerfile.runner` (1,675 B); it is gone at 505a28ce. |

**B4 note found in passing:** `docker/Dockerfile.quickstart:15` pins `AMC_VERSION=1.1.1` — the published npm version, not the local 1.2.0.

## 2. B0 — key rotation evidence

**No dated proof exists in the repo.** Every record that mentions the 2026-02-23 scan says the rotation cannot be verified from the repo:

- `plans/amc-gap-execution-log.md:170` — G6-17 "⚠️ NEEDS SID … Whether the Feb-23 `ANTHROPIC_TOKEN_HINT` was rotated cannot be verified from the repo."
- `plans/amc-gap-register.md:554` (G6-17 row) and `:580` ("the load-bearing action is confirming the rotation").
- `plans/amc-superharness.md:112, 527-528` (P0.2: "Confirm with Sid whether the flagged keys were rotated").
- `plans/2026-09-09-amc-execution-brief.md:313-314`.
- `plans/research/amc/amc-oddities.md:28` — locates the original finding in `src/adapters/builtins/claudeCli.ts`.

Searched: `AMC_OS/RESEARCH`, `docs/`, `CHANGELOG.md`, `SECURITY.md`, `plans/`, `research/` (Markdown) for `rotat` near token/secret/supply/BFG/2026-02. Hits are generic guidance (`docs/OPERATIONS.md:79`, `docs/LAUNCH.md:139`, `docs/NOTARY.md:84`) or gate-waiver language in receipts (`AMC_OS/RESEARCH/2026-09-09-*/NEXT_ACTION.md`), none a dated rotation record. In source, `ANTHROPIC_TOKEN_HINT` appears only as the scanner's own rule name (`src/release/releaseSecretScan.ts`); `claudeCli.ts:22` now lists env-var *names* only.

## 3. B0 — public-repo hygiene (tracked = present in `git ls-tree 505a28ce`)

| Artifact | 505a28ce | Notes / HEAD-3d6b8d4a contrast |
|---|---|---|
| `COMPETITIVE_*_G0DM0D3.md` | not tracked | `.gitignore:89-92` widened to `COMPETITIVE_*.md`. HEAD-3d6b8d4a tracked both (28,809 B + 8,221 B). |
| `.tmp-gap-report.json` | not tracked | `.gitignore:114` `.tmp-*` (the previously wrong guard is fixed). HEAD-3d6b8d4a tracked 41,073 B. |
| `test_model.pkl` | not tracked | `.gitignore:115`. HEAD-3d6b8d4a tracked 47 B. |
| `mirofish-simulation/` | **tracked, 4 files, 194,144 B** | `data.js` 86,455; `index.html` 31,511; `mirofish-report.md` 37,594; `mirofish-report-100agents.md` 38,584. Now labelled "Synthetic simulation — not research, not real users" (`mirofish-report.md:1`, `-100agents.md:1`, `index.html:143`); named personas with quoted opinions remain (`data.js:47-104`). Excluded from the npm tarball by the `files` whitelist (`package.json:7-19`) but still on the public repo surface. |
| `*.tgz` / `*.tar.gz` | none tracked | `.gitignore:7`. |
| `..bfg-report/` | not tracked | `.gitignore:95`. |
| `cli-new-commands.ts.fragment` | not tracked | HEAD-3d6b8d4a tracked `src/cli-new-commands.ts.fragment` 24,382 B. |
| empty `security-audit/` husks | none in tree | `find` returned nothing; git cannot track empty dirs. |
| `qa/` subproject | **tracked, 30 files, 118,692 B** | `README.md`, `package.json`, `package-lock.json`, `src/`, `tests/`, `tsconfig.json`. Excluded from npm by the `files` whitelist. |
| OpenClaw persona stack (`HEARTBEAT.md` etc.) | none tracked | `.gitignore:62-70` lists SOUL/MEMORY/BOOTSTRAP/HEARTBEAT/IDENTITY/USER/TOOLS/NOW.md. `docs/IDENTITY.md` exists but is enterprise "Identity (Host Mode)" documentation. |
| **NEW — `--/.amc/` stray workspace** | **tracked, 30 files, 325,921 B** | Includes `--/.amc/vault.amcvault` (1,164 B) + `.meta.json` (411 B), `evidence.sqlite` (270,336 B), `evidence.sqlite-shm` (32,768 B), public keys and signed key-history JSON for auditor/lease/monitor, signed policy YAMLs. Added by `521f21e7` (2026-08-22, "fix(P2.0): local verification could not detect a workspace-write attacker"). `.gitignore:86-87` guards only `--json`/`--verbose`, not `--/`. Not present at HEAD-3d6b8d4a (which instead tracked `.amc/vault.amcvault` at the root — the G6-01 blob). Whether this blob opens under a known passphrase was not determined. |

## 4. B1 — credentials and deploy surfaces

- Env vars **not set** in this shell: `NPM_TOKEN`, `CHANGESETS_GITHUB_TOKEN`, `RAILWAY_TOKEN`, `VERCEL_TOKEN`, `DOCKER_USERNAME`, `DOCKER_PASSWORD`, `GHCR_TOKEN` (also checked `GITHUB_TOKEN`, `NPM_CONFIG_TOKEN`, `NODE_AUTH_TOKEN`: unset).
- `~/.npmrc` contains **one** `_authToken` line (presence only; value not read, scope/validity not tested).
- Present at 505a28ce: `railway.json`, `vercel.json`, `Dockerfile`, `docker/Dockerfile.quickstart`, `docker/docker-compose.yml`, `deploy/k8s/*`, `deploy/compose/.env.example`.

## 5. B2 — release candidate checks (run in the scratchpad export of 505a28ce)

- Scripts were read before running. `scripts/verify-release-version.mjs` only reads `package.json`, `pnpm-lock.yaml`, `website/install-channel.json`, `website/install.sh`, `website/install.ps1` and spawns `dist/cli.js --version`; no writes, no network. `scripts/prepack-release-check.mjs` runs `npm pack --ignore-scripts` into an OS tmpdir, then `dist/cli.js release sbom|licenses|scan|pack|verify` with an ephemeral Ed25519 key in that tmpdir, and `rmSync`s it; no writes to the repo tree were observed afterwards.
- `pnpm install --frozen-lockfile --prefer-offline` — exit 0.
- `pnpm build` — exit 0; `dist/cli.js --version` → `1.2.0`.
- `pnpm release:verify-version` — **passed**: `packageJson=builtCli=installChannel=unixInstaller=windowsInstaller=1.2.0`, `tag=null`.
- `pnpm release:prepack-check` — **exit 0**, all six sub-steps `EXIT 0` (pack → `agent-maturity-compass-1.2.0.tgz`, sbom, licenses, secret scan, release pack, release verify).
- Local `package.json` version **1.2.0** vs npm **1.1.1** as recorded in the brief (registry not contacted).
- **Not run:** `release:gate`, `check:packed-install`, `check:clean-source`, vitest.

## 6. What must be true before B3/B4 could be proposed to Sid

1. **Rotation proof from Sid** (out-of-repo, dated) for the keys flagged 2026-02-23, or an explicit decision that they were never live. Nothing in the repo can substitute.
2. **Remove `--/.amc/`** (30 tracked files incl. `vault.amcvault`, `evidence.sqlite`) and add a `.gitignore` guard for `--/`; decide whether its 2026-08-22 addition (post-BFG) needs a history purge.
3. **Dispose of `mirofish-simulation/` and `qa/`** on the public surface — the brief says remove; the current state is "labelled synthetic, still tracked".
4. **`pnpm release:gate` green at 505a28ce** (or the chosen pin) with every skipped check named; `check:packed-install` and `check:clean-source` green in a fresh clone; signed artifact SHA256 recorded. None of these were run here.
5. **Credentials provisioned where they belong**: `NPM_TOKEN` / `CHANGESETS_GITHUB_TOKEN` for publish, Railway/Vercel tokens and a container-registry credential for B4 — all absent from this shell. Confirm what the existing `~/.npmrc` token is and whether it should be the publish identity.
6. **Runtime, mutation-verified evidence** that (a) `amc verify` rejects a literal `"unsigned"` signature, (b) an unsigned `amc.config.yaml` cannot claim `isolated`, (c) the `VITEST` fallback is unreachable in the deployed image (VITEST unset, `AMC_VAULT_PASSPHRASE_FILE` mounted). Only static reads were done here.
7. **B4-specific:** bump `docker/Dockerfile.quickstart:15` `AMC_VERSION` after the 1.2.0 publish; prove no `change-me-*` example value reaches the deployed config; add a `.gitignore` entry for `.amc/local-vault-passphrase`.
8. **Harness hygiene:** agents must record `git rev-parse HEAD`; this run's worktree was 437 commits behind the stated pin.
