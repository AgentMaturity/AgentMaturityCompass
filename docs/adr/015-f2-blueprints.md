# ADR 015: Fold the F2 blueprints into the compiler and do not land them

Status: decided on 2026-10-18 by the P1-46 implementer, under Sid's instruction to decide without asking him. The
integrator approves this ADR in the P1-46 PR, and Sid records `DECISION:` on the P1-46 heading of the plan document.
Owner: P1-46. Date: 2026-10-18.

## Context

F2 ("regulated-agent blueprints") turns a station or one industry pack into an agent definition. That definition
covers tool classes, approvals, budget, refusal rules, assurance packs, evidence outputs, guardrails written from pack
questions, and an `.amc/agents.yaml` preset. It exists only on the candidate `amc/regulated-platform-20261003` at
`37c1466b`. The commits are `d35ccbb6` (module and 14 tests), `c25bc23a` (docs/INDUSTRY_BLUEPRINTS.md) and `91b434b8`
(receipt), merged by `37948853`. It never reached `main` or `int`. The landing slice map holds it in the `hidden` slice
as `record-only`. A monitor accepted it as self-reported PARTIAL, because the CLI and `agents.yaml` wiring were outside
its claim.

AMC now has two other generators of the same per-station policy:

- **F1 operating profiles** (`src/domains/operatingProfiles/`, P1-15). They hold sourced per-station settings for
  approvals, budgets, execution tickets, egress, firewall, retention, oversight and incident clocks. Each value carries
  a fact status, and each station's profile lists its assurance packs.
- **The applicability compiler** (`src/catalog/compiler/`, P1-10). It turns a deployment profile and the catalog
  into a signed plan: requirement decisions, an effective runtime policy and an evidence plan. It pins an F1 profile by
  hash and does not convert it.

F2 was written before F1 existed. Its `StationProfileSource` is a seam left open for F1
(`src/domains/blueprints/stationProfile.ts:15-17` on `37c1466b`).

## Options

1. **Fold into the compiler.** Do not land F2. Carry its policy-relevant rules in the single compile path, and prove
   them with golden tests for all seven stations.
2. **Keep hidden.** Do not land F2 now. Keep it parked on the candidate for later wiring, with a test that keeps it
   unreachable.
3. **Register a CLI.** Wire `amc blueprint render` and the `agents.yaml` preset. This is excluded: the freeze allows no
   new CLI command path, and P1-46's scope says no `amc blueprint` path is ever registered.

## Comparison

F2 references are to `37c1466b`. Compiler, F1 and default-policy references are to `int` at `3b0e47607`.

| F2 part | What F2 does | What the compiler and F1 do | Disposition |
|---|---|---|---|
| Approvals | Refuses WRITE_HIGH with fewer approvals or distinct users than `defaultApprovalPolicy()` (`stationProfile.ts:89-104`); the blueprint copies the default rule (`blueprintCompose.ts:85-98`) | The proposed approval policy starts from the same default: WRITE_HIGH needs 2 approvals from distinct users (`approvalPolicyEngine.ts:64-67`). A catalog value never lowers a compiled rule (`runtimePolicy.ts:99-104`), and every class the policy gates is in `approvalRequiredFor` (`runtimePolicy.ts:157-160`) | Already held. Pinned by golden tests |
| Budget | Refuses SECURITY and FINANCIAL because the default budget gives them 0 (`stationProfile.ts:50-53, 74-80`) | The proposed budgets are `defaultBudgets()` per agent (`runtimePolicy.ts:134`): SECURITY 0 and FINANCIAL 0 (`budgets.ts:85-86`). No compiler parameter raises a budget | Already held. Pinned |
| Tier refusals | Forbids DEPLOY, NETWORK_EXTERNAL, DATA_EXPORT and IDENTITY at the critical pack tier, DEPLOY and IDENTITY at very-high, and DEPLOY at high (`stationProfile.ts:36-41`). The tier is the highest pack `riskTier` (`stationProfile.ts:43-47`), and F2 calls the table "an AMC blueprint DEFAULT, not a regulatory requirement" (`stationProfile.ts:20`) | The proposed action policy is `defaultActionPolicy()` (`runtimePolicy.ts:136`). It sets `allowExecute: false` for SECURITY, FINANCIAL, NETWORK_EXTERNAL, DATA_EXPORT and IDENTITY (`actionPolicyEngine.ts:230-289`). DEPLOY stays executable behind 2 distinct approvals, an execution ticket and the OBSERVED_HARDENED trust tier (`actionPolicyEngine.ts:196-214`). F1 deliberately allows DEPLOY with cited bases, for example health at 1 per day with 2 distinct approvals (`stationProfilesA.ts:22, 30`) | Not ported for DEPLOY (departure 1). The other three classes are already non-executable |
| Execution tickets | Lists the classes whose default action policy needs a ticket (`blueprintCompose.ts:89`) | Same default action policy, carried in the plan (`runtimePolicy.ts:136`); F1 sets tickets per station | Already held. Pinned |
| Required assurance packs | Station registry packs plus the packs the default action and approval policies require (`blueprintCompose.ts:111-117`) | F1 lists the registry packs plus the industry map, a superset (`operatingProfileBuilder.ts:144-160`). The plan pins F1 by hash (`types.ts:74-76`). The default approval policy's DEPLOY rule requires `unsafe_tooling` (`approvalPolicyEngine.ts:70-76`) and is carried in the plan | Not copied into the evidence plan (departure 2) |
| Evidence receipts and binder sections | Two constant lists, the same for every blueprint (`blueprintCompose.ts:30, 32`) | The evidence plan requests evidence per control contract from admitted producers (`evidencePlan.ts:18-38`, `catalog/producers.yaml`). Layer 0 already asks the tool pipeline, receipts, approvals and ledger for it at every station | Covered by Layer 0. The binder section list is dropped: it describes an export, not a plan |
| Guardrails from question text | One "Enforce ... Escalate or block" sentence per pack question (`blueprintCompose.ts:46-54`), written into the preset's role prompt (`blueprintPreset.ts:33-42`) | None. Pack questions remain the self-assessment surface, whose producer `amc.questionnaire` is capped at `self_reported` (`catalog/producers.yaml`) | Dropped. Never enforced and never listed as duties |
| EU AI Act classification and risk statements | Pack `euAIActClassification` and `keyRisks`, verbatim (`blueprintCompose.ts:150-151`) | Applicability comes from catalog predicates, with each fact's value and provenance in the reasons (`applicability.ts`) | Dropped. Catalog predicates only |
| Pack from another station; unknown pack | Thrown at `blueprintCompose.ts:34-44` | A Layer 1 control is a candidate only where its stations meet the profile's (`applicability.ts:30`). An unknown station fails the compile with `PROFILE_INVALID` (`types.ts:44`, `compile.ts:29-33`) | Already held. Pinned |
| `agents.yaml` preset | `toAgentPreset` (`blueprintPreset.ts:44-59`) | Not a compiler output. Starter profiles are P1-40 | Out |
| Entitlement gate | `assertIndustryPackAccess` before rendering (`blueprintRender.ts:102`) | Compiling is free. Payment never changes a result (truth rule 6, D-06) | Dropped |
| CLI | `registerBlueprintCommand`, never registered (`blueprintCli.ts:19-57`) | `amc catalog compile` | Never registered |

## Decision

Option 1: fold. F2 does not land. Its commits stay `record-only` and `skip-receipt` in the slice map, and the
`hidden` slice records "not landed: folded into the compiler". No `amc blueprint` command path exists.

The fold adds no compiler template data. Every F2 rule with an enforcement meaning already comes out of the compile
path, from the same shipped defaults F2 read. Station-specific values live in F1, which the plan pins. Copying F2's
values in as a third set would be the duplicate generator this item exists to remove. So the fold is a set of golden
tests that pin those rules for all seven stations, plus a test that keeps a blueprint module and command out. Compiled
plans are byte-stable: no compiler code or catalog file changed. The finance-ops-us sample plan digest is
`sha256:1c37285d6e11a724df335344c79de68c9492fed7d38c72867bf6d0f893c67072` before and after (the P1-46 receipt). No
changeset or catalog-lock recompile note is needed.

### Departures from the proposed dispositions

1. **DEPLOY is not forbidden.** The tier table is unsourced, and it derives the tier from self-declared pack metadata.
   The proposal says applicability should come from catalog predicates, never from pack content; the same reasoning
   applies to this table. On `int`, every station would forbid DEPLOY outright: six at the critical tier and Wealth at
   very-high. That contradicts F1's sourced per-station DEPLOY settings, so two generators would disagree on day one.
   It would also need a class-deny parameter that neither the compiler (`runtimePolicy.ts:35-46`) nor the
   compiled-policy guard implements. F2 itself enforced the table only when composing a file, never at runtime. A
   station that should forbid DEPLOY gets a reviewed catalog control through the normal catalog path.
2. **Assurance packs are not copied into the evidence plan.** F1 already lists them, as a superset, and the plan
   pins F1. A new evidence-plan field would change every plan's digest without adding any enforcement. An assurance
   pack becomes a plan requirement the way every other requirement does: through a control whose evidence contract
   names the `amc.assuranceRunner` producer.

## Evidence

`tests/compilerStationDefaults.test.ts` has 14 cases:

- seven golden cases, one per station, plus a station-list check;
- one case per F2 refusal, each named by its F2 rule id. The cases cover `station-profile/critical/write-high-requires-approval`,
  `budget-default/zero-quota/SECURITY` and `/FINANCIAL`, `station-profile/critical/forbidden-class/DEPLOY` (the
  departure, asserted as approval-gated), an unknown station, and the F1 seam;
- one case that keeps F2 folded.

Five mutations each fail at least one case:

- removing the compiler's approval floor;
- setting the default WRITE_HIGH rule to 0 approvals;
- raising the SECURITY quota;
- adding `src/domains/blueprints/`;
- importing it from `src/index.ts`.

The list is in `qualification/2026-10-18-P1-46/`. `tests/programLandingSliceMap.test.ts` checks the slice map's decision
and that no F2 commit is picked.

## Consequences

- One compile path decides policy. F2's 48 blueprints (7 stations and 41 packs), its question guardrails, its preset
  and its CLI are not shipped. The monitor-accepted F2 work stays readable on the candidate. This ADR says what was ported
  (golden tests of the rules the compiler holds) and what was dropped (the DEPLOY tier refusal, guardrails, preset,
  CLI and entitlement call).
- Station-only profiles compile to the same runtime policy at six stations. Only Wealth differs, through its Layer 1
  overlay. Station-specific values remain in F1 and reach a workspace through F1's own activation. Converting F1
  values into compiler parameters is follow-up work for the F1 and compiler owners, not F2's.
- Found while comparing: F1's Technology profile sets WRITE_HIGH to 1 approval without distinct users
  (`stationProfilesB.ts:67`). That is looser than the shipped default and than what F2 would have accepted. The compiler
  never proposes less than the default. This is a decision for the F1 owner.
