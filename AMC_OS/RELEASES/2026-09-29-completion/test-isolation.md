# Guard workspace isolation and read-only readiness — 2026-09-29

Role: REV_QA_LEAD. Scoped implementation and handoff after the full-suite run exposed mutations to eight tracked public-key/history files and four `.previous-*` backups. This agent did not restore or delete developer runtime artifacts and did not read private keys. Parent performed a separate scoped backup/restore before the validation baseline below.

## Cause and changes

- Unisolated `checkExec`/Shield tests emitted real guard events into the repository cwd. Default dual-write then opened a writable ledger and initialized signing keys. With public trust anchors but no vault, vault initialization replaced all four public roles and backed up the four histories. This was implicit initialization, not an explicit monitor-key rotation.
- `vitest.config.ts` now loads `tests/setup/guardWorkspace.ts` before each test file. It assigns a fresh disposable guard DB path and receipt workspace directly, so a test's `vi.unstubAllEnvs()` returns to the sandbox baseline. It preserves real emission, dual writes and signatures. No global cwd change or disabling of persistence/signing was added. After-file cleanup closes the exact sandbox ledger pool and guard connection, deletes only the allocated temporary workspace, and restores environment values in `finally`.
- Six fixtures previously set `<temporary-dir>/guard_events.sqlite`; consolidation resolves two parent levels and therefore wrote to the shared temporary parent. Their paths now use `<temporary-dir>/.amc/guard_events.sqlite`: `evidencePipeline`, `enforce/guardEventChain`, and the GAP-1247, 1263, 1300 and 1305 receipt-boundary tests. Each closes its exact ledger pool before removing its workspace; the existing consolidation fixture now does the same.
- Production-readiness's three ledger queries now use `{ readonly: true }` with `finally` closure. `readGuardEvents` also uses a short-lived readonly, existing-file-required SQLite connection instead of invoking the schema-creating writer. Missing or incompatible stores yield no evidence. Stage selection remains shared with the writer. SQLite can still coordinate existing WAL readers through sidecars; this change does not claim immutable access to every existing SQLite database.

## Verification

- Node 22 focused run after fixture-pool cleanup: **159 passed across 15 files**, 8.00 seconds. Files: `guardWorkspaceIsolation`, `productionReadinessReadOnly`, `advancedScoring`, `evidencePipeline`, `enforce/guardEventChain`, `guardEventConsolidation`, `enforce`, `enforce-full`, `shield`, `shield-full`, `shieldRuntimeAnalysis`, and the four named GAP receipt boundaries. Final environment restoration was additionally wrapped in `finally` following review; the cleanup success path is unchanged.
- `node node_modules/typescript/bin/tsc -p tsconfig.tests.json --noEmit`: passed under Node 22.
- New regression evidence: an implicit `checkExec` call writes matching real legacy/consolidated rows and signs receipts only within the per-file sandbox; temporary env stubs restore that baseline. A cold child process assessing a fresh public-only workspace returns blocked readiness without changing any file path, file hash or modification time, and creates no vault or evidence stores.
- Repository guard against recurrence during the focused runs: all **8** public-key/history SHA-256 hashes and the complete selected path set match before/after; **0** new `.previous-*` files. Local comparison receipts: `/tmp/amc-guard-isolation-public-state-before.json` and `/tmp/amc-guard-isolation-public-state-after.json`.
- Independent read-only review confirmed exact cleanup boundaries, legacy guard-table read compatibility, preserved dual-write parity/chain tamper/signature tests, and no remaining scoped findings. No native Windows execution is claimed here.

## Handoff

All product and test paths are stable. Parent owns final generated references/counts, source build/typecheck, full-suite/coverage/release validation and commit/push. No heavy suite or root build was run by this agent. The isolated global setup applies to the whole suite, so final combined-suite validation remains necessary.
