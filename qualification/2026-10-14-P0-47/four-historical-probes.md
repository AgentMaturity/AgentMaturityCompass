# P0-47 historical four-probe integration — 14 October 2026

Status: `HISTORICAL_INTEGRATION_SLICE_PASSED`. This is a historical integration slice, not current-main or full-suite qualification.

Fixture: `/Users/sid/.codex/worktrees/p0-47-historical-probes/AgentMaturityCompass`. Historical baseline: `b552b69cd220d7d73b63a58685f77bb2bbb26c8f`. Tooling: accepted main `5ea5e866a42acd5c8228a712e9b8c1d9f18c745c`.

Only the snapshot script, landed-source helper and helper/manifest test were overlaid. All 19 routed parity files and their assertions stayed byte-identical. The root compiled-dist ancestry guard fix at 0fef1989a was not overlaid.

Node v22.23.3; pnpm 10.33.0; GIT_NO_LAZY_FETCH=1. Each probe appended the exact line `export const p47Probe=1;` and rebuilt dist.

| Source | Baseline passed | Real red failures | Green passed | Source restored |
|---|---:|---:|---:|---|
| `src/types.ts` | 3017 | 3 | 3017 | True |
| `src/index.ts` | 3017 | 5 | 3017 | True |
| `src/sdk/nativeAgentClient.ts` | 3017 | 5 | 3017 | True |
| `src/workspace.ts` | 3017 | 2 | 3017 | True |

Every completed green result has success=true, zero failed/pending/todo, and the same 20-file corpus. Red and green use identical probe source and built-output bytes. Before snapshotting, only the owned probe source was restored and its baseline build reproduced; the snapshot therefore precedes the next probe rebuild.

## Measured red assertions

### src/types.ts

- `explainabilityContractParity.test.ts`: explainability shared contracts retain complete original exported flows restores full original bytes and keeps public types, callers, package entries and historical guards untouched. AssertionError: expected 'e3134d967423903fb159deca726772d6ae466…' to be '61ca2bd7d2394b3ef1d38666868c50f43698f…' // Object.is equality
- `metricParameterContractParity.test.ts`: preserves entire runtime emission and actual built public contracts. AssertionError: expected 'e3134d967423903fb159deca726772d6ae466…' to be '61ca2bd7d2394b3ef1d38666868c50f43698f…' // Object.is equality
- `metricRowPublicContract.test.ts`: metric validation input public TypeScript contracts src/types.ts preserves identical emitted runtime JavaScript. AssertionError: expected 'export const p47Probe = 1;\n' to be 'export {};\n' // Object.is equality

### src/index.ts

- `explainabilityContractParity.test.ts`: explainability shared contracts retain complete original exported flows restores full original bytes and keeps public types, callers, package entries and historical guards untouched. AssertionError: expected '382495618e1c580b0bd4304f0ad95b44d5930…' to be '9c33ae512e09e0526550c34a94c49001d9979…' // Object.is equality
- `metricParameterContractParity.test.ts`: preserves entire runtime emission and actual built public contracts. AssertionError: expected '91dc1ed0370eaea5e8476e28c4885e48ccc76…' to be '9aa3559ae0aa5ab9e73bd3f5f335e46bd2b24…' // Object.is equality
- `privateModuleHelperVisibility.test.ts`: individually reviewed module-private helper visibility retains the exact finite declaration manifest and supported package entries. AssertionError: expected '382495618e1c580b0bd4304f0ad95b44d5930…' to be '9c33ae512e09e0526550c34a94c49001d9979…' // Object.is equality
- `privateStoreLocatorVisibility.test.ts`: reviewed module-private store locator visibility retains the exact finite declaration manifest and supported package entries. AssertionError: expected '382495618e1c580b0bd4304f0ad95b44d5930…' to be '9c33ae512e09e0526550c34a94c49001d9979…' // Object.is equality
- `workspacePathRedactionParity.test.ts`: freezes every actual source byte outside the declared imports and private bodies. AssertionError: expected '91dc1ed0370eaea5e8476e28c4885e48ccc76…' to be '9aa3559ae0aa5ab9e73bd3f5f335e46bd2b24…' // Object.is equality

### src/sdk/nativeAgentClient.ts

- `explainabilityContractParity.test.ts`: explainability shared contracts retain complete original exported flows restores full original bytes and keeps public types, callers, package entries and historical guards untouched. AssertionError: expected 'e7cca0c35410d15a7230ee29d6679f2de6498…' to be '824475754824d4e4f4625b8545c3053241831…' // Object.is equality
- `metricParameterContractParity.test.ts`: preserves entire runtime emission and actual built public contracts. AssertionError: expected '9c91dacb3860102a66cd6ac7dd2eb44930c0e…' to be '8652b7c9ffded332a5e277ce4511f3a8a0e06…' // Object.is equality
- `privateModuleHelperVisibility.test.ts`: individually reviewed module-private helper visibility retains the exact finite declaration manifest and supported package entries. AssertionError: expected 'e7cca0c35410d15a7230ee29d6679f2de6498…' to be '824475754824d4e4f4625b8545c3053241831…' // Object.is equality
- `privateStoreLocatorVisibility.test.ts`: reviewed module-private store locator visibility retains the exact finite declaration manifest and supported package entries. AssertionError: expected 'e7cca0c35410d15a7230ee29d6679f2de6498…' to be '824475754824d4e4f4625b8545c3053241831…' // Object.is equality
- `workspacePathRedactionParity.test.ts`: freezes every actual source byte outside the declared imports and private bodies. AssertionError: expected '9c91dacb3860102a66cd6ac7dd2eb44930c0e…' to be '8652b7c9ffded332a5e277ce4511f3a8a0e06…' // Object.is equality

### src/workspace.ts

- `privateModuleHelperVisibility.test.ts`: individually reviewed module-private helper visibility src/workspace.ts retains every function, parameter, body and caller while changing only the declared visibility. AssertionError: expected 'import { spawnSync } from "node:child…' to be 'import { spawnSync } from "node:child…' // Object.is equality
- `privateModuleHelperVisibility.test.ts`: individually reviewed module-private helper visibility src/workspace.ts retains the entire emitted implementation except those unused export assignments. AssertionError: expected '"use strict";\nvar __createBinding = …' to be '"use strict";\nvar __createBinding = …' // Object.is equality

## Corpus boundary

The reproducible pre-merge marker inventory has 29 paths: 25 actual test files and 4 helpers. The 19 routed tests, 6 untouched tests and 4 helpers account for the PR count. This fixed 20-file corpus is the 19 routed tests plus the approved helper/manifest test. It is an integration slice, not a whole historical parity or full-suite qualification. No direct four-probe freeze comparisons were found in the six omitted test files; behavior outside this slice remains unqualified.

The historical PR count is not used as fresh evidence. In particular, measured failure counts are retained even when they differ from the historical 3/3/3/2 summary.

## Preserved evidence

Original archive bytes preserved: True. Original registration preserved: True. Original 19 parity files preserved: True. Approved overlay bytes preserved: True.

All per-phase commands, exits, timings, full source/build hashes, raw logs and JSON reports remain under `tmp/p0-47-historical/` in the fixture. The JSON summary records source restoration, snapshot rows and raw report hashes. No cleanup, commit or push was performed.
