# Industry Blueprints — governed agent definitions from the first turn

A blueprint is the agent definition an operator reviews and signs *before* an
agent in a regulated station takes its first turn. It is derived from an
industry pack (or a whole station) and composes:

| Field | Derived from |
|---|---|
| `guardrails[]` | one per pack question; `text` always contains the question id; `derivedFrom` carries `packId`, `questionId`, `dimension`, `regulatoryRef` |
| `riskStatements[]`, `classification[]` | pack `keyRisks` and `euAIActClassification`, verbatim (these are **not** guardrails: they cite no question) |
| `profile` | the station profile the blueprint was validated against (see below) |
| `toolScope.classes` | requested action classes, default `READ_ONLY, WRITE_LOW`; `allowlist` is empty until the operator fills it |
| `approvals` | `defaultApprovalPolicy()` for the classes in scope (gated classes, quorum, distinct users, roles, TTL); `requireExecTicketFor` from `defaultActionPolicy()` |
| `budget` | `defaultBudgets()` daily limits with every class outside scope set to 0 |
| `requiredAssurancePacks[]` | `DOMAIN_REGISTRY[station].assurancePacks` ∪ the packs the default action policy and approval policy require for the classes in scope |
| `evidence` | ledger receipt kinds (`ReceiptKind`) and binder section names the agent must produce |
| `sources[]` | pack `regulatoryBasis` and question `regulatoryRef` strings; always `verified: false` — the render cites the pack, it does not retrieve primary text |

Source: `src/domains/blueprints/`. The module imports packs and the station
registry by module path and does not touch `src/domains/index.ts`.

## Commands

```
amc blueprint render <station> [--pack <id>] [--out <dir>] [--tool-classes A,B] [--approvals <n>] [--json]
```

Writes `<station>[-<pack>].blueprint.yaml`, `.blueprint.json` and `.summary.md`
under `--out` (default `blueprints/`). The summary ends with the exact preset
entry to append to `.amc/agents.yaml`. The command **never writes `.amc/`** and
requires the industry-pack entitlement, like `amc domain apply`.

The command is not yet wired into `src/cli.ts` (serial-only surface). Until
then, call the library directly or register it yourself — see "Ready to wire".

## Station profile — fail closed

A blueprint cannot grant a class its station profile forbids. The profile
comes from, in order:

1. an injected `StationProfileSource` — the seam for F1's operating-profiles
   module (its export shape was unknown at commit `8f57ce63`, so nothing is
   imported from it; wire it through `composeBlueprint(request, { profileSource })`);
2. the built-in table keyed by the **highest pack risk tier** in scope.

| Tier (pack `riskTier`) | Forbidden classes (AMC blueprint default, not a regulatory requirement) |
|---|---|
| `critical` | `DEPLOY`, `NETWORK_EXTERNAL`, `DATA_EXPORT`, `IDENTITY` |
| `very-high` | `DEPLOY`, `IDENTITY` |
| `high` | `DEPLOY` |
| `elevated` | none beyond the baseline |

Baseline in every station: classes whose daily `maxToolExecutes` is `0` in
`defaultBudgets()` (`SECURITY`, `FINANCIAL` at `8f57ce63`) are refused with rule
`budget-default/zero-quota/<CLASS>`. `WRITE_HIGH` is refused unless the
blueprint's approvals meet `defaultApprovalPolicy().actionClasses.WRITE_HIGH`
(2 approvals, distinct users at `8f57ce63`), rule
`<profile.ruleId>/write-high-requires-approval`.

Every refusal names its rule, and `validateBlueprint()` re-checks a rendered
file after the operator edited it.

## Measured at commit 8f57ce63 (macOS Darwin 25.6.0 arm64, Node v25.5.0, worktree `wf_fc54d4b0-c89-2`)

Numbers below come from `tests/industryBlueprints.test.ts` and a scratch run of
`registerBlueprintCommand` on a commander program (2026-10-03); nothing here is
estimated.

- `pnpm vitest run tests/industryBlueprints.test.ts` → `Tests 14 passed (14)`, prints `stations=7 blueprints=48` (7 station-level + 41 pack-level).
- Pack corpus: 41 packs, 600 questions, 0 empty `regulatoryRef`, 0 duplicate question ids across packs. Packs per station: environment 6, health 9, wealth 5, education 5, mobility 6, technology 5, governance 5.
- `amc blueprint render health` → 27 guardrails (top 3 by weight from each of 9 packs; 124 of 151 questions listed under `guardrailSelection.omittedQuestionIds`), tier `critical`, rule `station-profile/critical`, required assurance packs `healthcarePHI, safetyCriticalSIL, injection, unsafe_tooling, governance_bypass`, 89 sources.
- `amc blueprint render health --pack clinical-trials` → 16 guardrails (all 16 questions).
- `--tool-classes READ_ONLY,WRITE_LOW,WRITE_HIGH --approvals 0` on health → refused: `station-profile/critical/write-high-requires-approval`, exit 1.
- `--tool-classes READ_ONLY,DEPLOY` on health → refused: `station-profile/critical/forbidden-class/DEPLOY`, exit 1.
- `--out <dir>/.amc/x` → refused before writing, exit 1.
- `pnpm typecheck` exit 0; `pnpm typecheck:tests` exit 0.
- Mutation checks (each applied, run, restored; restore run `14 passed`): remove WRITE_HIGH refusal → `2 failed`; break `derivedFrom.questionId` → `2 failed`; remove forbidden-class refusal → `2 failed`; remove zero-quota refusal → `2 failed`; remove `.amc/` write refusal → `1 failed`; remove entitlement gate → `1 failed`.

Not exercised: `src/cli.ts` registration (unclaimable), `savePresets()` into a
real `.amc/agents.yaml` (requires auditor keys; the test asserts the preset
shape only), running an agent from a blueprint preset, the F1 profile module
(not present at this commit), any primary regulatory text.

## Ready to wire

### `src/cli.ts` (serial-only; one line each)

```diff
 import { registerDomainApplyCommand } from "./domains/domainApplyCli.js";
+import { registerBlueprintCommand } from "./domains/blueprints/index.js";
 ...
 registerDomainApplyCommand(domainCmd);
+registerBlueprintCommand(program);
```

### `.amc/agents.yaml` (signed; operator step)

After reviewing the rendered files, append the preset from the summary through
the existing signed writer so it is validated against the strict schema and
signed with the auditor key:

```ts
import { readPresets, savePresets } from "./src/presets/agentPresets.js";
import { composeBlueprint, toAgentPreset } from "./src/domains/blueprints/index.js";

const existing = readPresets(workspace);
if (!existing.ok) throw new Error(existing.reason);
const preset = toAgentPreset(composeBlueprint({ station: "health", packId: "clinical-trials" }), { model, providerId });
savePresets(workspace, [...existing.presets, preset]);
```

`toAgentPreset` sets `tools: workspace`, `toolMode: native`, `persona` to the
guardrail role prompt, and `approveTools` to the strictest gated class in scope
(`WRITE_HIGH` when granted; undefined for a read-only scope because the default
policy needs 0 approvals for `READ_ONLY`). A preset cannot widen the runtime
approval policy, action policy, budgets or tool allowlist.
