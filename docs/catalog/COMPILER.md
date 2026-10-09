# Applicability compiler

Status: v0.1, experimental (P1-10). Code: `src/catalog/compiler/`. CLI: `amc catalog compile`. Record format:
[CONTROL_RECORD.md](CONTROL_RECORD.md).

The compiler turns a deployment profile and the Regulated Control Catalog into a control plan: which controls apply
and why, the runtime policy they imply, and the evidence plan that would show them working. A plan is experimental
planning output. It makes no compliance claim: its catalog content is agent-drafted and unreviewed, an applicable
control is not a met control, and what P1-11 later evaluates is evidence of conformity, never proof of compliance.

## Input: the deployment profile

A strict JSON object (`deploymentProfileSchema` in `src/catalog/compiler/types.ts`); an unknown key fails.

| Field | Rule |
| --- | --- |
| `profileVersion` | `1`. |
| `profileId` | A term (`[A-Za-z0-9][A-Za-z0-9_.-]*`); it names the default output folder. |
| `deployment` | `tenantId`, `workspaceId`, `deploymentId` and at least one `agentIds` entry. |
| `primaryStation`, `stations`, `domains`, `jurisdictions`, `roles`, `entityTypes`, `riskClass`, `useCases`, `dataClasses` | Facts. Stations are the seven station ids; `stations` must include `primaryStation` when both are known. |
| `euRoleRecord`, `art63Record` | `{ ref, sha256 }` or null: artifacts, not flags. The compiler carries them; it does not check them. |
| `operatingProfile` | `{ path, sha256, schemaVersion }` of an F1 operating profile (path relative to the working directory), or null. The CLI refuses a file whose bytes do not hash to `sha256`. |
| `exceptions` | Reviewer exceptions, below. |

A fact is `{ value, provenance, source, reviewedBy }`. `value: null` means unknown: the compiler never guesses.
`provenance` is `asserted`, `observed` or `reviewed`; `reviewedBy: { reviewer, date }` is set exactly when it is
`reviewed`. The plan records each fact's provenance (or `unknown`) in `profile.factProvenance`, so asserted facts
stay visible. An F1 operating profile carries settings for one station, not deployment facts, so it is referenced
by hash rather than converted.

Terms outside `catalog/vocabulary.yaml` are accepted but match no predicate, because every predicate term is a
vocabulary term.

## Three-valued predicates

`evaluatePredicate(p, profile)` returns `"true"`, `"false"` or `"unknown"` with the unknown facts the result depends
on and one reason line per leaf clause (fact value and provenance).

| Operator | Result |
| --- | --- |
| `{ fact, ... }` | unknown when the fact is null; otherwise whether the fact matches |
| `all` | false if any child is false, else unknown if any child is unknown, else true |
| `any` | true if any child is true, else unknown if any child is unknown, else false |
| `not` | swaps true and false; unknown stays unknown |
| `always` | true |

An unknown operator or fact, or an operator that does not fit the fact, throws.

## Candidates and decisions

Candidates are every Layer 0 control; Layer 1 to 3 controls whose `stations` meet the profile's stations; for packs
that list jurisdictions, only where those meet the profile's jurisdictions; and Layer 3 controls only where their own
predicate is not false. Candidacy is evaluated three-valued, so an unknown station or jurisdiction pulls a control in
as unresolved instead of dropping it. A retired candidate is listed under `unsupported` and not decided. Each control
appears once; `pulledInBy` lists every source (`layer0`, `station:<id>`, `jurisdiction:<term>`, `profile:<pack>`,
`station:unknown`, `jurisdiction:unknown`).

| Candidacy and predicate | Exclusions and exceptions | Decision |
| --- | --- | --- |
| false | any | `not_applicable`, exclusion source `predicate` |
| true or unknown | an exclusion is true | `not_applicable` with that exclusion's reason |
| true or unknown | an unexpired whole-control reviewer exception | `not_applicable`, source `reviewer_exception` |
| unknown | none true | `unresolved` with `missingFacts` |
| true | none true | `applicable` (an unknown exclusion does not stop it: applying is the conservative direction) |

`citationsInScope` lists the citation keys whose `appliesWhen` is null or true; an unknown `appliesWhen` is out of
scope. Crosswalk rows never add a requirement: they appear only in `crosswalkLinks`, for controls that apply or are
unresolved.

## Reviewer exceptions

An exception names a control and either a parameter or `null` (the whole control). It records the reason, the
approver, the approval request id and `expiresAt` (a date or an offset date-time). An exception is in force while
`expiresAt` is after the compile time; an expired one is ignored and noted in that control's reasons. The compiler
does not check the approval request: the plan's own review covers every exception it applies.

- A whole-control exception may exclude any control except a mandatory Layer 0 control (`EXCEPTION_ON_LAYER0`, refused
  even when expired).
- A parameter exception only resolves an unresolved conflict, and only when its value equals one of the differing
  values. The lowest exception id wins.
- An exception naming an unknown control or a parameter its control does not bind is refused.

## Merge and strictness

Parameters of every applicable or unresolved control are grouped by name. Unknown applicability denies: an unresolved
control's parameters are applied while its requirement stays `unresolved` ("not evaluated").

| Strictness | Differing values resolve to |
| --- | --- |
| `max` | the largest |
| `min` | the smallest |
| `true_wins` | true if any is true |
| `union` | every item of every list |
| `intersection` | the common items; none in common is unresolved |
| `none` | always unresolved (two legitimate strict directions, such as retention) |

Every difference is listed in `conflicts` with its resolution (`stricter_applied`, `reviewer_exception` or
`unresolved`). Controls that share a name with different strictness fail with `STRICTNESS_MISMATCH`.

The plan is `blocked` when a conflict is unresolved or a mandatory control is unresolved; otherwise `ready`.

## Parameters and enforcement points

Only these parameter names exist. Any other name (`UNKNOWN_PARAMETER`), another strictness (`STRICTNESS_MISMATCH`),
a wrong value type (`PARAMETER_TYPE`) or a point the binding does not list (`PARAMETER_POINT`) fails the compile,
for every control in the catalog, applicable or not.

| Parameter | Point | Strictness | Value |
| --- | --- | --- | --- |
| `toolPipeline.visibleTools` | `tool_pipeline` | `intersection` | tool names |
| `toolPipeline.approvalRequiredFor` | `tool_pipeline` | `union` | action classes |
| `toolPipeline.requireAgentLease`, `toolPipeline.requirePrincipal` | `tool_pipeline` (guard `identity-binding`) | `true_wins` | boolean |
| `approvals.<ActionClass>.requiredApprovals` | `approvals` | `max` | integer >= 0 |
| `approvals.<ActionClass>.requireDistinctUsers` | `approvals` | `true_wins` | boolean |
| `approvals.<ActionClass>.rolesAllowed` | `approvals` | `intersection` | user roles |
| `approvals.<ActionClass>.ttlMinutes` | `approvals` | `min` | integer >= 1 |
| `egress.allowHosts` | `egress` | `union` | lowercase host names |
| `deletion.retentionDays.auditLog`, `deletion.retentionDays.payloads` | `deletion_executor` | `none` | integer >= 1 |

Guard ids are those the native tool pipeline registers (`prompt-injection`, `runtime-firewall`, `budgets`,
`network-egress`, `tool-allowlist`, `native-tool-identity`) plus `identity-binding`, which the `compiled-policy` guard
enforces (P1-12). A control whose parameters need a guard that is not registered is listed as `unsupported` with
`enforcement_point_absent`.

## Outputs

`compilePlan({ profile, catalog, asOf })` returns a `CompiledPlan` (types in `src/catalog/compiler/types.ts`):

- `profile`: id, the SHA-256 of the canonical normalized profile, and fact provenance.
- `lock`: the P1-09 catalog lockfile.
- `requirements`, sorted by control id, with `reasons`, `missingFacts`, `exclusion`, `citationsInScope` and
  `pulledInBy`; `conflicts`; `unsupported` (`enforcement_point_absent`, `producer_planned`, `retired`;
  `manual_owner_unassigned` is reserved for owner assignment in P2-22); `crosswalkLinks`.
- `runtimePolicy`: the tool pipeline (visible tools, action classes that need approval, guards with their
  parameters), approval rules per action class (never looser than the shipped default rule: roles are intersected
  with its roles, and no common role leaves nobody able to approve), egress (deny by default,
  allowed hosts), deletion (an unknown legal hold denies; retention days), `proposedSignedConfigs` and `policyDigest`.
  `proposedSignedConfigs` start from the defaults and zod schemas F1's operating-profile builders use. The compiler
  writes nothing under `.amc/`; activation is described below.
- `evidencePlan`: one test entry per control test (run at `activation` and on each `invalidatedBy` trigger; drills
  and document reviews on the manual duty's cadence), one request per evidence contract, the manual duties, and
  release gates for runtime-enforced, configuration-check and adversarial tests, blocking when the control is
  mandatory.
- `digest`: `digestOf` (sorted-key JSON, SHA-256) of the plan without `digest`.

The compiler is deterministic: profile lists are sorted (primary station first), every output list has a stable
order, and it never reads the clock, randomness or the environment. `asOf` comes from the caller and only decides
which exceptions have expired and the catalog validation date. The catalog must validate as of `asOf`
(`CATALOG_INVALID`).

## Signing, weakening and review

`signPlan` is blocked in agent mode (`catalog compile`). It recomputes the plan digest, verifies the previous plan
whole (digest recomputed from its content, `CONTROL_PLAN` signature over that digest) and refuses one compiled
for another `profileId`, since a laxer baseline would hide weakenings. It then lists
every weakening against it and refuses to sign unless `allowWeakening` is set:

- a requirement that applied or was unresolved and is now absent or not applicable, or whose control version changed;
- runtime-policy changes by rule: tools, hosts or roles added, approval classes or guards removed, fewer approvals,
  longer approval TTLs, a true requirement turned false; any change no rule classifies, retention included, counts;
- proposed signed configs by the same rules activation applies to live configs (`fragmentWeakenings`);
- evidence-plan rows removed, fewer attempts, longer maximum age, a blocking gate made non-blocking, fixtures,
  triggers or binding fields removed, and any other change;
- every reviewer exception the plan applies, on every signing.

The digest is signed as `CONTROL_PLAN` through `signDigestWithPolicy`, so a notary-mode workspace signs with its
notary. Checked against the workspace's own auditor keys, the signature is a local audit trail, not portable trust
(P0-09). It shows who signed the plan, not that the plan is right. `compiledAt` is set from the clock at signing and
sits outside the digest with the diff, the signature and the review.

With `--request-review`, an approval request is created through `createApprovalForIntent` under the profile's first
agent id (sorted), bound to the intent `planReviewIntent(plan)`: tool `catalog.plan.activate`, action class
`SECURITY`, payload `{ planDigest, policyDigest, profileId }`. Activation checks the decision with
`verifyApprovalForExecution` and consumes it. The plan's `review.status` stays `pending`.

## Diff

`diffPlans(prev, next)` lists requirements added, removed, or changed in applicability or version, with a reason, and
leaf-level runtime-policy and evidence-plan changes (rows matched by id, not position). `renderPlanDiffMarkdown`
renders it as `plan.diff.md`.

## Activation and enforcement

`activateControlPlan` (`src/catalog/compiler/activate.ts`, P1-12) makes a signed plan the workspace's active compiled
policy. It is blocked in agent mode and refuses unless all of these hold: the plan's digest recomputes from its content
and its `CONTROL_PLAN` signature verifies; the plan is `ready`; the shipped catalog matches the plan's lockfile; the
plan review named by `--activate` approved exactly this plan's intent (it is consumed, so one review activates once);
and, against the plan already active, there is no weakening, by the same rules signing applies, unless
`--allow-weakening`. The plan is appended to a signed control journal (`.amc/control-plan/heads/`, kind
`compiled-control-plan`) with a host-local checkpoint and signer pin outside the workspace, the same primitive the
Runtime Firewall policy uses, so deleting, truncating or rolling back the journal is an integrity failure, never "no
policy".

An active plan is what makes a workspace a regulated profile. Every native session (`agentToolset`) and the kernel
tool service load it when they start. The load verifies the journal whole, then the plan inside the entry it read
(digest and signature in the same read), then the shipped catalog against the plan's lockfile. Anything that does not
verify refuses the session. With no plan ever activated, the session runs and its receipt records the downgrade
`no_compiled_policy`.

The `compiled-policy` guard runs first in the native pipeline and fails closed:

- a call whose tool is not in `toolPipeline.visibleTools` is denied (`run_code` is exempt; each sub-call is checked).
  Native sessions also leave those tools out of the tool list offered to the model, using the plan pinned at
  start; the guard stays the enforcement point;
- `identity-binding` (`requireAgentLease`, `requirePrincipal`) reads the authorization record bound for the call:
  no verified lease denies `IDENTITY_UNRESOLVED`, and no authenticated principal (an OS user name is self-reported)
  denies `PRINCIPAL_UNRESOLVED`. A Studio native task started or resumed while a plan is active runs under a lease
  Studio mints for that runtime alone (P1-67): the task's agent, the task id as the work order, `toolhub:execute`
  narrowed to the action classes of its pinned signed tools, the task's step and token caps as its rate fields (the
  tool pipeline does not read them), and at most the runtime's one-hour lifetime. Only the lease id is recorded on the signed task descriptor; the token reaches the
  `amc acp` child through `AMC_NATIVE_TASK_LEASE`, which the child unsets before anything runs and scrubs from tool
  output. Every call binds it to the authorization record through the pipeline's own lease verifier (signature,
  expiry, agent, scope, class, signed revocations), so `identity-binding` admits the call with the lease as its
  principal. Studio revokes the lease when the runtime stops (release, the idle and lifetime sweeper, shutdown, a
  failed start, cold verification), before minting the next one on resume, and at archive. A native session without a verified lease (a
  task started before this change or while no plan was active, a CLI agent session, an `amc acp` process nobody
  handed a lease) is still denied every call under a plan with `L0-IDN-01`. Without a plan the lease is never bound;
- any other compiled guard id denies, because this pipeline does not implement it;
- for an action class with a compiled approval rule, the live signed approval policy must be at least as strict
  (approvals, distinct users, roles, TTL), read and verified in one read, or the call is denied;
- a different active plan than the one the session pinned at start (changed, or activated since) denies; start a
  new session.

A denial names the control: `compiled policy denied this call (control <id>@<version>): <reason>`. Under a plan every
call is bound to an authorization record, and `toolPipeline.approvalRequiredFor` sets the record's
`boundApprovalRequiredFor`. Each record carries `control.controlId` and `control.controlVersion` of the rule that
admitted the call, `policy.compiledPolicyDigest` and `policy.policyRevision` (the journal revision), and the session's
effective-policy receipt in `evidenceRefs`. Egress and deletion rules stay on the policy object for P2-01; nothing
enforces them yet, and receipts say so.

Each native session writes an effective-policy receipt (`amc.effective-policy-receipt/v1`,
`src/policy/effectivePolicyReceipt.ts`) before its first governed call, and again when its guard set changes: an
`EFFECTIVE_POLICY` audit row through the session's writer and a signed artifact (`effective-policy-receipt`) under
`.amc/effective-policy/`. It lists the policy, plan and lock digests and the journal revision; each control in force
per binding (`tool-pipeline`, `approvals`, `egress`, `deletion-executor`, `manual`) with its enforcement, boundary and
catalog review status; the composed guard labels; the 14 guardrails as that session ran them; the domain-apply rules
with `enforcement: "none"`; strict evidence binding; the downgrades `no_compiled_policy` and
`unenforced_domain_rules`; and `leaseId`, the lease the session's calls are bound to, named only when the pipeline's
lease verifier accepted it as the receipt was written (`null` otherwise; every call verifies it again). A receipt that cannot be written denies the call. A receipt for one policy digest is no
evidence for a session that ran another, and an experimental control stays `review: "pending"` however it is enforced.

## CLI

```
amc catalog compile --profile <file> [--previous <plan.json>] [--lock <catalog.lock.json>] [--out <dir>]
                    [--request-review] [--allow-weakening] [--activate <approvalRequestId>] [--json]
```

`--activate <approvalRequestId>` activates the plan just compiled once that review approved it. Compiling is
deterministic, so the usual flow is `--request-review`, an approver's `amc approvals approve`, then the same compile
with `--activate <approvalRequestId>`. It cannot be combined with `--request-review`.

It compiles against the shipped catalog and writes `plan.json` (the `CompiledPlan`), `plan.sig.json` (`compiledAt`,
`diff`, `signature`, `review`), `plan.diff.md` and `catalog.lock.json` to `--out`, by default
`amc-control-plans/<profileId>/<first 12 hex of the digest>/`. An `--out` under `.amc/` is refused. `--previous` reads
`plan.json` and the `plan.sig.json` beside it. `--lock` refuses to compile when the loaded catalog differs from the
lockfile. Exit codes: 0 ready, 2 blocked, 1 error or refusal. Only `--request-review` and `--activate` write under
`.amc/`: the first through the approval engine's own request store (which creates a default signed approval policy
when none exists), the second to the control-plan journal.

Example, with the synthetic sample profile:

```
amc catalog compile --profile tests/fixtures/catalog/compiler/finance-ops-us.profile.json --out /tmp/amc-plan --json
```

## Error codes

`PROFILE_INVALID`, `CATALOG_INVALID`, `UNKNOWN_PARAMETER`, `PARAMETER_TYPE`, `PARAMETER_POINT`, `STRICTNESS_MISMATCH`,
`EXCEPTION_ON_LAYER0`, `EXCEPTION_UNKNOWN_CONTROL`, `EXCEPTION_UNKNOWN_PARAMETER`.

## Not in this step

Evidence evaluation (P1-11), egress and deletion enforcement (P2-01), the review workflow UI (P2-22), reassessment on `invalidatedBy` (P2-23) and cross-station profile definitions (P2-28).
