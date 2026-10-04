# Track F2 — Regulated-agent blueprints — receipt

- Date: 2026-10-03
- Worktree: `/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_fc54d4b0-c89-2`, branch `worktree-wf_fc54d4b0-c89-2`
- Base: `8f57ce63d8331f1bef1c2a18fde82a7e8f4511da` (verified with `git rev-parse HEAD` before the first edit; no merge needed)
- Environment: Darwin 25.6.0 arm64, Node v25.5.0, pnpm (`pnpm install --frozen-lockfile --prefer-offline`, exit 0), vitest v4.1.11
- Commits: `d35ccbb6` feat (module + tests), `c25bc23a` docs; the receipt commit follows this file
- Status: PARTIAL — library, CLI command module, tests and docs are complete and green; `src/cli.ts` registration and `.amc/agents.yaml` registration are left at the ready-to-wire boundary because both surfaces are unclaimable for this track.

## What changed and why

| Path | Lines | Purpose |
|---|---|---|
| `src/domains/blueprints/blueprintTypes.ts` | 138 | Data model: `AgentBlueprint` (station, packId?, name, purpose, riskStatements, classification, profile, guardrails[{id,text,derivedFrom{packId,questionId,dimension,regulatoryRef}}], guardrailSelection, toolScope{classes,allowlist}, approvals, budget, requiredAssurancePacks, evidence{receipts,binderSections}, sources[], renderedFrom), `BlueprintRequest`, `BlueprintRefusedError` |
| `src/domains/blueprints/stationProfile.ts` | 107 | `resolveStationProfile` (injected `StationProfileSource` first, else pack risk tier table at :36-41), `zeroQuotaClasses` from `defaultBudgets()` (:51-54), `evaluateBlueprint` producing every refusal with a stable rule id (:67-105) |
| `src/domains/blueprints/blueprintCompose.ts` | 176 | `composeBlueprint`: pack resolution (:34-44), one guardrail per question with the question id in the text (:46-55), station-level top-3-by-weight selection with omitted ids recorded (:57-72), approvals from `defaultApprovalPolicy()` and exec tickets from `defaultActionPolicy()` (:86-99), budget from `defaultBudgets()` with out-of-scope classes zeroed (:101-110), required assurance packs from registry plus policies (:112-118), sources with `verified:false` (:120-135); throws `BlueprintRefusedError` on any refusal (:171); `validateBlueprint` re-checks |
| `src/domains/blueprints/blueprintRender.ts` | 115 | `renderBlueprintFiles`: entitlement gate first (:100), refuses any out dir under `.amc/` before writing (:25-32, :102), writes yaml/json/summary atomically; `renderBlueprintSummary` with the preset YAML to append |
| `src/domains/blueprints/blueprintPreset.ts` | 59 | `toAgentPreset` -> `AgentPreset` (strict schema in `src/presets/agentPresets.ts`): `tools: workspace`, `toolMode: native`, `persona` = guardrail role prompt, `approveTools` = strictest gated class |
| `src/domains/blueprints/blueprintCli.ts` | 57 | `registerBlueprintCommand(program)`: `blueprint render <station> [--pack] [--out] [--tool-classes] [--approvals] [--json]`; refusals print each rule and set exit code 1 |
| `src/domains/blueprints/index.ts` | 28 | module exports (does not touch `src/domains/index.ts`) |
| `tests/industryBlueprints.test.ts` | 219 | 14 tests; prints `stations=7 blueprints=48` |
| `docs/INDUSTRY_BLUEPRINTS.md` | — | model, commands, profile table, measured results, ready-to-wire diffs |

No existing file was modified. No file in the other session's dirty list or any S1–S10/F1/F3/F4 claim was written.

## Step 1 — measurements (commit 8f57ce63)

- Agent definition schema (`src/presets/agentPresets.ts` `presetSchema`): 11 top-level fields (`id, description, model, providerId, maxSteps, maxTokens, tools, toolMode, persona, approveTools, delegate`) + 6 `delegate` subfields (`enabled, scope, maxDepth, provider, timeoutMs, stopConditions`). `.amc/agents.yaml` is not tracked at HEAD (`git ls-files .amc` lists no `agents.yaml`); `presetsPath()` names it.
- Pack fields that can derive guardrails: `questions[]` (id, dimension, text, regulatoryRef, l1/l3/l5, weight) — used, one guardrail per question; `keyRisks[]` and `euAIActClassification` — carried as `riskStatements`/`classification`, not as guardrails, because they cite no question id (acceptance requires every guardrail to cite one).
- Corpus (scratch `measure.ts`, tsx): 41 packs, 600 questions, 0 empty `regulatoryRef`, 0 duplicate question ids. Per station: environment 6 packs/87 q, health 9/151, wealth 5/70, education 5/72, mobility 6/78, technology 5/71, governance 5/71. Highest tier per station is `critical` for every station except wealth (`very-high`).
- 143 assurance packs registered; every `DOMAIN_REGISTRY[*].assurancePacks` id exists in `listAssurancePacks()`.
- `ACTION_CLASSES`: READ_ONLY, WRITE_LOW, WRITE_HIGH, DEPLOY, SECURITY, FINANCIAL, NETWORK_EXTERNAL, DATA_EXPORT, IDENTITY. `defaultBudgets()` zero-quotas SECURITY and FINANCIAL. `defaultApprovalPolicy().WRITE_HIGH` = 2 approvals, distinct users.
- `src/assurance/packs/industryPackManifest.ts` does not exist at HEAD (S9 will add it); `src/domains/operatingProfiles/**` (F1) does not exist at HEAD.

## Commands run and exact results

| Command | Result |
|---|---|
| `git rev-parse HEAD` | `8f57ce63d8331f1bef1c2a18fde82a7e8f4511da` |
| `pnpm install --frozen-lockfile --prefer-offline` | exit 0 (background task) |
| `pnpm vitest run tests/industryBlueprints.test.ts` (before implementation) | `Test Files 1 failed`, `Tests no tests` — module missing (RED) |
| `pnpm vitest run tests/industryBlueprints.test.ts` (after) | `Tests 14 passed (14)`; stdout `stations=7 blueprints=48` |
| `node scripts/architecture-boundaries-check.mjs` | exit 1; `failures` = only `dist/cli.js is missing` and `dist/api/index.js is missing` (no build run; not needed by tests). New-file counts recorded by the checker: 58/177/60/116/139/29/108 lines, all under the 800 cap; it also reports 10 pre-existing files already below baseline at HEAD (not touched here, `--update` not run) |
| `pnpm typecheck` | exit 0 |
| `pnpm typecheck:tests` | exit 0 |
| scratch `cli-exercise.mts` (commander program + `registerBlueprintCommand`, license env generated in-process) | `render health` -> 27 guardrails, exit 0; `render health --pack clinical-trials` -> 16 guardrails, exit 0; `--tool-classes READ_ONLY,WRITE_LOW,WRITE_HIGH --approvals 0` -> `station-profile/critical/write-high-requires-approval`, exit 1; `--tool-classes READ_ONLY,DEPLOY` -> `station-profile/critical/forbidden-class/DEPLOY`, exit 1; `--out <tmp>/.amc/x` -> refused before writing, exit 1 |
| `git status --porcelain` after each commit | empty |
| `ls .amc/keys \| grep -c previous` | 0 — no key rotation occurred |

## Acceptance self-report

1. `pnpm vitest run tests/industryBlueprints.test.ts` -> 14 passed; prints `stations=7 blueprints=48`. PASS.
2. Health blueprint >= 8 guardrails each with `derivedFrom.questionId` in the pack question set: station-level health renders 27 (test asserts every id exists and the text contains it; CLI run confirms 27). PASS.
3. A refused blueprint names the station profile rule: `BlueprintRefusedError.message` and each `refusals[].rule` carry e.g. `station-profile/critical/write-high-requires-approval`; CLI prints the rule. PASS.

## Mutation observations (scratch `mutate.sh`; each applied with perl, run, restored from backup)

| # | Guard | Mutation | RED | Restored |
|---|---|---|---|---|
| M1 | WRITE_HIGH-without-approval refusal (`stationProfile.ts:88`) | `if (blueprint.toolScope.classes.includes("WRITE_HIGH"))` -> `if (false)` | `2 failed, 12 passed` | `14 passed` |
| M2 | derivedFrom question-id lookup (`blueprintCompose.ts:52`) | `questionId: question.id` -> `question.id + "-x"` | `2 failed, 12 passed` | `14 passed` |
| M3 | forbidden-class refusal (`stationProfile.ts:79`) | -> `if (false)` | `2 failed, 12 passed` | `14 passed` |
| M4 | zero-quota refusal (`stationProfile.ts:73`) | -> `if (false)` | `2 failed, 12 passed` | `14 passed` |
| M5 | `.amc/` write refusal (`blueprintRender.ts:28`) | -> `if (false)` | `1 failed, 13 passed` | `14 passed` |
| M6 | entitlement gate (`blueprintRender.ts:100`) | `assertIndustryPackAccess(workspace);` -> `void workspace;` | `1 failed, 13 passed` | `14 passed` |

Existing-guard check (brief §2 rule 7): no blueprint-level guard existed before this track (new surface); the runtime approval/action/budget policies do not read blueprints, so they cannot cover a design-time grant. The blueprint guards reuse those policies' default values rather than restating them.

## Sources

No regulatory text was encoded by this track. Every `sources[]` entry in a rendered blueprint is a pack-provided `regulatoryBasis` or `regulatoryRef` string with `url: null`, `retrievedAt: null`, `verified: false`, reason "cited from the industry pack as shipped at this commit; blueprint render does not retrieve primary text". The research digest directories `research/health/` and `research/cross-framework/` were empty / absent at run time (checked 2026-10-03), so none was used.

## Not exercised

- `src/cli.ts` registration (unclaimable; diff in docs/INDUSTRY_BLUEPRINTS.md "Ready to wire").
- `savePresets()` into a real `.amc/agents.yaml` (needs auditor signing keys); the test checks the `AgentPreset` shape only. Zod validation against `presetSchema` is not run because the schema is not exported; `savePresets()` runs it at registration time.
- Running an agent from a blueprint preset; the F1 operating-profiles module (absent at HEAD) — only the injection seam is tested with a stub source.
- Full suite, release gate, generators, `pnpm build` — not run by program rule.
- Fresh-clone reproduction of the test run (brief §4 receipt rule) — not done in this track; the monitor's run in this worktree is the acceptance.

## Blockers

None blocking the claimed scope. PARTIAL only because CLI and agents.yaml wiring are outside the claim.

## Ready-to-wire diffs

`src/cli.ts`:

```diff
 import { registerDomainApplyCommand } from "./domains/domainApplyCli.js";
+import { registerBlueprintCommand } from "./domains/blueprints/index.js";
 ...
 registerDomainApplyCommand(domainCmd);
+registerBlueprintCommand(program);
```

`.amc/agents.yaml` (operator, signed): append `toAgentPreset(composeBlueprint(...), { model, providerId })` via `savePresets(workspace, [...readPresets(workspace).presets, preset])`; the exact YAML is printed at the end of every rendered `*.summary.md`.

## Cleanup

No servers, processes or endpoints were started. Scratch files live under the session scratchpad (`scratchpad/f2/`); temp render dirs under `$TMPDIR/amc-blueprint-*` were created by the test (removed in `afterEach`) and by the CLI exercise (one dir, left for inspection, not in the repo).
