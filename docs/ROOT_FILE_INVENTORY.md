# ROOT_FILE_INVENTORY.md — Root-level classification

This is the first pass at classifying root-level repo items.

## Public product surfaces
- `README.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `SPONSORING.md`
- `package.json`
- `tsconfig.json`
- `website/`
- `docs/`
- `examples/`
- `src/`
- `tests/`
- `deploy/`
- `sdk/`
- `amc-action/`
- `vscode-extension/`

## Contributor / ecosystem surfaces
- `CHANGELOG.md`
- `Formula/`
- `integrations/`
- `scripts/`
- `tools/`
- `whitepaper/`

## Internal operating / planning artifacts (candidate move targets after reference audit)
- `AGENTS.md`
- `AMC_ARMY_ROLES.md`
- `AMC_IMPROVEMENT_ROADMAP.md`
- `BOOTSTRAP.md`
- `CONTINUATION.md`
- `HANDOFF.md`
- `HEARTBEAT.md`
- `IDENTITY.md`
- `MEMORY.md`
- `NOW.md`
- `PRODUCTION_MONITORING_IMPLEMENTATION.md`
- `SCORE_HISTORY_IMPLEMENTATION.md`
- `SOUL.md`
- `TOOLS.md`
- `USER.md`
- `qualification.md`
- `sales_playbook.md`

## Experimental / debug artifacts (candidate cleanup)
- `debug_hipaa.js`
- `debug_hipaa2.js`
- `debug_hipaa3.js`
- `test-compare-models.js`
- `test-model-scanner.cjs`
- `test-model-scanner.mjs`

## Generated / stateful artifacts (candidate visibility reduction)
- `amc_product_determinism.db`
- `amc_product_prompt_modules.db`
- `amc_product_queues.db`
- `amc_stepup.db`
- `--json`
- `--verbose`
- `.DS_Store`
- local cache/state directories such as `.amc_cache`, `.pytest_cache`, `.v8cov*`, `logs/`, `tmp/`, `venv/`

## Next safe step
Before moving anything:
1. reference search
2. move low-risk artifacts first
3. run build/tests
4. verify docs/workflows

## Executed safe moves
Moved out of root into safer buckets:
- `HANDOFF.md` → `internal/archive/HANDOFF.md`
- `qualification.md` → `internal/archive/qualification.md`
- `sales_playbook.md` → `internal/archive/sales_playbook.md`
- `debug_hipaa.js` → `internal/debug/debug_hipaa.js`
- `debug_hipaa2.js` → `internal/debug/debug_hipaa2.js`
- `debug_hipaa3.js` → `internal/debug/debug_hipaa3.js`
- `test-compare-models.js` → `internal/debug/test-compare-models.js`
- `test-model-scanner.cjs` → `internal/debug/test-model-scanner.cjs`
- `test-model-scanner.mjs` → `internal/debug/test-model-scanner.mjs`

## Deferred intentionally
Left in root for now because they appear tied to operating/bootstrap conventions or need broader tracing:
- `CONTINUATION.md`
- `NOW.md`
- `HEARTBEAT.md`
- `IDENTITY.md`
- `MEMORY.md`
- `SOUL.md`
- `TOOLS.md`
- `USER.md`
- `AGENTS.md`
- `BOOTSTRAP.md`
