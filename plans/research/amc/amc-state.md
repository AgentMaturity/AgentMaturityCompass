# AMC On-Disk State Model — Exploration Report

## 1. STRUCTURE

**Workspace root: `<project>/.amc/`** (created by `initWorkspace` in `src/workspace.ts`). Real current contents of `/Users/sid/AgentMaturityCompass/.amc/`:

- **Signed config plane** — YAML + detached `.sig` pairs at root: `action-policy.yaml`, `adapters.yaml`, `agent.config.yaml`, `bridge.yaml`, `budgets.yaml`, `fleet.yaml`, `gateway.yaml`, `model-taxonomy.yaml`, `ops-policy.yaml`, `tools.yaml`, `trust.yaml`. Unsigned: `amc.config.yaml` (profiles dev/ci/prod, runtimes, trustBoundaryMode), `guardrails.yaml`, `eval-harness.yaml`, `prompt-addendum.md`, `context-graph.json`, `current-agent` (active agent id).
- **Keys/crypto** — `keys/`: public keys + rotation history only (`{monitor,auditor,lease,session}_ed25519.pub` + `*_history.json`). Private keys live encrypted in `vault.amcvault` (+ `vault.amcvault.meta.json` fingerprints); `src/crypto/keys.ts` delegates to `src/vault/vault.ts`. NB: a separate empty `vault/` dir also exists.
- **SQLite (root)** — `evidence.sqlite` (10MB, +wal/shm): the hash-chained evidence ledger. `guard_events.sqlite` (23MB + 4.5MB WAL): enforcement decisions.
- **Blob store** — `blobs/`: 2,363 encrypted `blob_<base32>.blob` files + `index.jsonl` + chained `index.jsonl.sig` (`src/storage/blobs/`).
- **Per-agent dirs** — `agents/{default,live-ci-agent,pr-22}/`. Scoped layout (`src/fleet/paths.ts`): `targets/`, `runs/`, `reports/`, `bundles/`, `context-graph.json`, `guardrails.yaml`, `agent.config.yaml(.sig)`, `gatePolicy.json(.sig)`. In practice: `pr-22` fully scoped, `default` holds only `quality/ratings.json` (root fallback active), `live-ci-agent` empty.
- **Domain subsystems**, each with `policy.yaml(.sig)` and often `scheduler.json(.sig)`: `assurance/` (certificates, runs, waivers), `audit/` (binders, maps, requests), `bench/`, `prompt/` (packs, lint, snapshots), `value/` (contracts, events, snapshots — mode 700), `forecast/`, `cgx/`, `canon/canon.yaml`, `mechanic/` (targets/profiles/tuning), `diagnostic/bank/`, `passport/` (700), `transparency/` (`log.jsonl` + `merkle/` + `log.seal.json/.sig`), `fleet/governance-state.json`, `enforce/resources/`.
- **Per-run artifacts keyed by UUID** — `runs/`, `episodes/`, `decision-receipts/`, `lifecycle-receipts/` + `lifecycle-runs/` (signed), `trace-indexes/` (signed), `observability-lane/` (signed), `finding-proofs/`, `reports/` (md + `assurance/`), `onboarding/state.json`.
- **Empty scaffolding** — `bundles/`, `cache/`, `logs/`, `plugins/`, `backups/`, `evidence/` (one demo json).
- **Oddities** — `release/working/npm-cache` = **1.0GB** (of a 1.2GB `.amc`); `studio-demo-host/` = a complete embedded multi-tenant host (28MB: `host.db`, `host.db.sha256`, `workspaces/{demo,_deleted}`, plaintext `demo-vault-passphrase` at 0600).
- **`.amc_cache/`** — exists at repo root, **empty since Feb 24, referenced nowhere in `src/`**. Dead.
- **Host mode layout** (`src/workspaces/workspacePaths.ts`): `<hostDir>/host.db` (+`.sha256` digest sidecar), `logs/`, `tmp/`, `workspaces/<id>/.amc/`, `workspaces/_deleted/`.
- **Hooks** — `.amc/hooks/<provider>/` created by `amc hooks install` (`src/adapters/hookIntegration.ts:402`), gitignore-protected; not currently present here.

## 2. HOW IT ACTUALLY WORKS

- **Path resolution**: `getWorkspacePaths()` (`src/workspace.ts:69`) composes root paths with `getAgentPaths()` (`src/fleet/paths.ts:135`). Agent resolution order: explicit arg → `AMC_AGENT_ID` → `.amc/current-agent` → `"default"`. The `default` agent uses the **root** `.amc` layout unless `agents/default/` contains core config — a backward-compat fallback (`paths.ts:137-151`) that explains the split-brain layout on disk.
- **Init**: `initWorkspace()` (`workspace.ts:242`) idempotently creates dirs, signing keys, context graph, then calls ~20 `init*` functions (action policy, toolhub, budgets, adapters, gateway, bridge, taxonomy, ops, trust, forecast, canon, diagnostic bank, cgx, mechanic, bench, prompt, assurance, audit policies/maps) — each writing a YAML + Ed25519 `.sig`. `quickstartWizard()` adds an inquirer flow, provider→gateway presets, and hard-asserts `questionIds.length === 244`.
- **Evidence ledger** (`src/ledger/ledger.ts`, 2,366 lines): `openLedger()` acquires a connection from `getOrCreateSqlitePool` (`src/storage/sqlitePool.ts` — keyed pools, default 4 conns, max 32 pools, WAL; `AMC_LEDGER_SQLITE_SYNCHRONOUS` defaults FULL). 10 in-file migrations create: `evidence_events` (sha256 payload, `prev_event_hash` chain, `writer_sig`), `sessions` (seal sigs), `runs`, `schema_meta`, `assurance_runs`, `outcome_events`/`outcome_contracts`, `claims`/`claim_transitions`, `evidence_incident_links`/`evidence_corrections`, `bridge_request_usage`. SQLite **triggers abort UPDATE/DELETE** on events and runs (append-only at the engine level). Large payloads spill to the encrypted blob store (`ledger.ts:27`, `blobStore.ts`); receipts are minted/verified via `src/receipts/receipt.ts` and embedded in event meta. Verification (`VerifyResult`) re-walks the hash chain against key history from `keys/*_history.json`.
- **Multi-tenant host** (`src/workspaces/`): `WorkspaceManager` runs in two modes — single-workspace (cwd `.amc`) or host mode (`hostDir` + `host.db` registry). `host.db` (`hostDb.ts`, 1,247 lines) holds `users` (LOCAL/OIDC/SAML/SCIM), `workspaces`, `memberships`, `membership_sources`, `host_sessions` (CSRF), `host_audit`, `scim_groups`; every write refreshes `host.db.sha256`. Workspace dirs are realpath-checked against escape (`workspacePaths.ts:38-51`) and lazily `initWorkspace`d with `trustBoundaryMode: "isolated"`. `bootstrapHost` (`hostBootstrap.ts`) seeds admin + default workspace. `amc studio demo` builds the embedded host at `.amc/studio-demo-host` (`cli.ts:3548`).
- **Guard events** (`src/enforce/evidenceEmitter.ts:203-240`): module-global singleton `better-sqlite3` handle at `cwd/.amc/guard_events.sqlite` (override `AMC_GUARD_EVENTS_DB_PATH`), one `amc_guard_events` table with signed receipts verified against key history — a **parallel evidence path** outside the ledger.
- **Lazily created DBs**: `corrections.sqlite` (`cli-observability-commands.ts`), `score_history.sqlite` (pooled, `score/scoreHistory.ts:141`), `score_sessions.sqlite` (`api/scoreStore.ts:33`), `scratchpad.sqlite` + `prompt_modules.sqlite` + `amc_product_queues.db` (`src/product/*`, each its own cwd-based singleton), `integration-delivery.sqlite` (`integrations/integrationDeliveryQueue.ts:150`). **Distinct SQLite databases AMC can create: 10 named files** (evidence, guard_events, corrections, score_history, score_sessions, scratchpad, prompt_modules, amc_product_queues, integration-delivery, host.db) plus per-bundle `evidence/evidence.sqlite` exports (`bundles/bundle.ts:366,649`) and an `:memory:` probe (`storage/nativeGuard.ts`). Currently on disk: evidence, guard_events, and two host.db instances.

## 3. CAPABILITY INVENTORY

- `amc init` / `quickstartWizard` — full workspace scaffold, provider-preset gateway config, first diagnostic report to `.amc/reports/latest.md`.
- `runDoctor()` — runtime detection, wrap-check, docker check, signature verification (fleet/agent/gateway), missing auth env vars, trust-boundary warning.
- Agent fleet: `amc fleet init`, `amc agent add`, current-agent switching, per-agent scoped state, `AMC_AGENT_ID` override, gate policies, governance state.
- Evidence: append (with receipt), session sealing, run sealing, claims lifecycle, outcome events/contracts, incident links, corrections, retention/archival (blob spill, prune flags, retention proof index), full-chain verify.
- Encrypted blob store: base32 ids, encrypt/decrypt, signed JSONL index, CLI (`blobCli.ts`), verification.
- Vault: passphrase-encrypted private keys (4 identities), `amc vault unlock`, `AMC_VAULT_PASSPHRASE`; key history rotation model.
- Host/Studio: host bootstrap (admin, workspace, memberships, notary options, LAN/CIDR binding), SCIM/OIDC/SAML user model, sessions with CSRF, host audit log, workspace lifecycle incl. `_deleted`, demo host.
- Hooks: provider hook install/observe/control with leases, ownership manifests, gitignore management, receipt-verified health (`hookIntegration.ts`, `watch/hookHealthDiagnostics.ts`).
- Policy subsystems (each init+verify+scheduler): assurance, audit (binders/maps), bench, prompt packs, value, forecast, cgx, canon, mechanic, diagnostic bank.
- Transparency log with Merkle seals; signed lifecycle receipts/runs/trace-indexes/observability lanes per run UUID.
- Bundles: portable evidence export (subset sqlite + verification).
- Env/config knobs: `AMC_LEDGER_SQLITE_POOL_SIZE`/`AMC_SQLITE_POOL_SIZE`, `AMC_LEDGER_SQLITE_SYNCHRONOUS`, `AMC_GUARD_EVENTS_DB_PATH`, profiles dev/ci/prod (proxy env, isolation).

## 4. REUSE VERDICTS

- **Evidence ledger schema + append/verify core** — **KEEP-AS-SERVICE**: hash chain, triggers, migrations, receipts are sound and hard-won. But the 2,366-line `ledger.ts` mixing schema, verification, incidents, retention, receipts needs **REFACTOR** (decompose) before wrapping.
- **`sqlitePool.ts`** — **KEEP-AS-SERVICE**: clean, generic keyed pooling; the natural substrate to consolidate every other DB onto.
- **Blob store (`storage/blobs/`)** — **KEEP-AS-SERVICE**: self-contained encrypted CAS with signed index.
- **Vault + `crypto/keys.ts`** — **KEEP-AS-SERVICE**: clean identity/rotation model; only public material on disk.
- **`fleet/paths.ts` agent scoping** — **REFACTOR**: sound idea, but the default-agent root-fallback heuristic creates two coexisting layouts; harness should pick one.
- **`workspace.ts` init/quickstart** — **REPLACE**: hardcoded 20-call init chain, embedded inquirer wizard, magic `244` assertion — supersede with harness-native plugin registration.
- **Workspaces host mode (`hostDb.ts` et al.)** — **KEEP-AS-SERVICE**: well-schema'd, path-escape-guarded, self-contained multi-tenancy.
- **`enforce/evidenceEmitter.ts` (guard_events)** — **REPLACE**: cwd-keyed mutable singleton, parallel unpooled evidence store duplicating the ledger's job; fold into the ledger.
- **`src/product/*` DBs (scratchpad, prompt_modules, product_queues)** — **REPLACE**: three copy-pasted `getDb()` singletons, `require()` in ESM code, no pooling.
- **Score stores + corrections + integration queue** — **REFACTOR**: legitimate data, but should become tables in a consolidated store, not four more files.
- **Signed-config plane (.sig everywhere)** — **KEEP-AS-SERVICE** as a generic sign/verify util; per-subsystem policy loaders are boilerplate to generate.

## 5. SURPRISES & DEBT

- **1.0GB npm-cache inside `.amc/release/working/`** — release build scratch living in the state dir; 83% of `.amc`'s size is not state.
- **`.amc_cache/` is dead**: empty, zero references in `src/`.
- **guard_events.sqlite (23MB+WAL) is 2× the evidence ledger** — the biggest live database is the *parallel* store, undercutting the single-tamper-evident-ledger narrative.
- **10+ distinct SQLite files with three creation idioms** (pooled / module singleton / open-per-call) — no shared lifecycle, backup, or WAL-checkpoint story; `ops/backup/backupEngine.ts` must chase them individually.
- **Dual default-agent layout**: root-level `targets/ runs/ reports/` AND `agents/default/` both exist; `agents/default` holds only `quality/ratings.json`, `agents/live-ci-agent` is an empty husk.
- **Plaintext `demo-vault-passphrase`** file inside `.amc/studio-demo-host/` (0600, but on disk in a repo dir).
- **`amc.config.yaml` is the only unsigned root config** in a system that signs everything else — the file controlling trustBoundaryMode is unauthenticated.
- **`src/cli-new-commands.ts.fragment`** — stray fragment checked into `src/`.
- **Hardcoded `questionIds.length !== 244` throw** in `quickstartWizard` — schema drift lands as a runtime crash in onboarding.
- **README describes `.amc/hooks/` flows extensively** but no hooks dir exists here; `bundles/`, `cache/`, `logs/`, `plugins/`, `backups/`, `vault/` (dir) are created-but-empty scaffolding; empty `vault/` dir shadows the real `vault.amcvault` file.
- **`cli.ts` is ~12k lines** and is where hostDir wiring, demo-host, and identity CLI all live — the real composition root is monolithic.
- Root `runs/` (24MB) holds two UUID JSONs mirrored across seven sibling dirs (episodes, receipts, proofs, lanes, trace-indexes) — a fan-out-per-run pattern with no shared run manifest.