# A4 Forge

A4 Forge takes one agent from a brief to a recorded, customer-controlled deployment in four stages: **Aspire**
(conceptualization), **Assemble** (creation), **Adapt** (contextualization) and **Activate** (commercialization). Every
stage records what people asked, understood, proposed, built and reviewed, and every gate binds the exact bytes the
approvers decided on. A4 produces signed, `self_reported` records of how the agent was built; no A4 output is a
statement that the agent is safe, correct or lawful.

Status: preview. Every A4 route and Studio page is absent unless the operator sets `AMC_A4_PREVIEW=1` in the Studio
process environment (D-20). The spine (store, gates, readiness, verification, Studio shell) has landed; each stage's
producers land with its own plan item (Aspire P1-59, Assemble P1-60, Adapt P1-61, Activate P1-62), and until then a
stage records human-authored content through the "no producer registered" path, labelled as such. The decisions behind
the design are in `docs/adr/013-a4-forge-spine.md`; the verifier rules are in `spec/ACCEPTANCE_RULES.md`
("A4 project record").

## The journey

Each stage runs the same eight steps: **asked** (answers to the stage's questions), **understood** (AMC's reading of
them, confirmed by a person), **explained** (choices at the reader's level), **proposed** (a revision of the
specification), **direction approved** (the direction gate), **built**, **reviewed**, and **completion approved** (the
completion gate, which moves the project to the next stage). A change of specification is a new revision; any open
gate on the old one goes stale. An owner can hold, resume, reopen an earlier stage, tune a released agent or retire the
project; each is a transition in the chain.

## Glossary

| Word | Meaning | Not to be confused with |
| --- | --- | --- |
| project | one agent's build journey in one workspace; one active project per agent | `amc product` |
| stage | `aspire`, `assemble`, `adapt`, `activate`; `retired` ends the project | lifecycle stages `development` to `deprecated`; program gates G0 to G3 |
| step | the eight steps above | onboarding steps |
| revision | an accepted specification at a stage, content-addressed (`spec_digest`), with the resource digests it depends on | Enforce manifest ids |
| gate | one approval request (`direction`, `completion`, or `policy` for a gate-policy change) bound to one revision | tool-call approvals |
| effect | a side effect run after a gate is consumed, journaled as transitions | |
| lane | `recommendation`, `implementation`, `observed` or `verified`: derived from the claim kind and the referenced row's trust tier, never chosen by the writer | scoring lanes |
| SoD-distinct | a second principal in the same auth plane whom the separation-of-duties rules accept as a different person; satisfies a quorum, and the decision stays `self_reported` | independent |
| independently reviewed | the claim kind reachable only from an admitted external record whose issuer key is outside the workspace and on the operator's trust list (P2-24, P3-21; not available yet) | a second member's APPROVE; AMC checking its own signatures |

**SoD-distinct is not independent.** Two members of one workspace sign under one workspace signing authority. Their two
approvals meet a two-person quorum; they are not two independent reviews.

## What each stage can claim

Every A4-authored row is `self_reported`. AMC writes no OBSERVED row of its own for A4: observed facts enter only by
reference to a row the runtime wrote (an action receipt, a session row, an effective-policy receipt), and the lane
follows that row's tier and method. A stub-provider session yields `synthetic_example` for every agent-facing ref, and
synthetic refs are exported labelled, never stripped.

| Stage | Recommendation and implementation lanes | Observed lane | Verified lane |
| --- | --- | --- | --- |
| Aspire | the brief, hypotheses and quality targets as people stated them | a hypothesis leaves `proposed` only through a runtime-written row inside its window | not available until P2-24 or P3-21 |
| Assemble | the architecture and build outputs | runtime rows of native builds | not available |
| Adapt | prompts, permissions, memory policy and the compiled applicability, every regulatory record marked `experimental` (D-08) | runtime rows only | not available |
| Activate | the package, the deployment plans and the operator's deployment receipts | AMC's own check of a destination is `self_reported`, kept apart from the operator's statement | not available |

AMC's own integrity checks (signatures, the chain, side rows) are a separate integrity section. They describe bytes,
never the agent, and are never a lane, a ref or a claim kind.

## What each record proves

A signature proves who wrote a record and that it is unchanged since, never that its statement is true.

| Record | Signed by | Proves |
| --- | --- | --- |
| every transition | its `audit` ledger row (monitor key, hash-chained) with a receipt over the transition's bytes | this workspace wrote these bytes and has not changed them; the chain names every side row, so a deleted or altered row shows |
| gate request, decision, release, deployment and rollback | additionally an `A4_RECORD` envelope (auditor key) | an auditor-key statement a verifier can admit from its own pinned trust list |
| gate request | `binding_digest` over the request, stored in the signed row | the exact bytes approvers decided on; a decision with another digest counts for nothing |
| stage output files | an `a4-stage-output` artifact signature | the file is unchanged since it was produced |
| binder slice | an `a4-binder` artifact signature over its manifest, plus a transparency entry | the slice's files are the ones exported |

**Notary mode.** In `NOTARY` mode with the default `trust.enforcement.denyLocalVaultSigningIfNotaryEnabled: true`, every
`A4_RECORD` envelope is a notary call, so each gate decision adds one. Today the readiness item `signing.notary_route`
reports the `A4_RECORD` route only. `A4_PACKAGE` is not a sign kind yet: once Activate (P1-62) adds it, an operator whose
`trust.yaml` lists `requireNotaryFor` explicitly keeps that list and must add `A4_PACKAGE` to it and re-sign
`trust.yaml`.

## Approvals and separation of duties

- Identity comes from the authenticated Studio session, never from a request body. Decisions bind the live
  `(authSource, userId, username, roles)`; a disabled user is refused even when a member row exists.
- The author of a revision cannot approve it; whoever built a revision cannot approve its completion; the requester
  cannot approve their own gate; every approver is distinct; a gate takes decisions from one auth plane only.
- A first APPROVE never makes a second one stale: a gate's readiness binding covers only items its own votes cannot
  change (`A4_BOUND_ITEMS`), so the second vote lands on the same bytes.
- **Two local users are not evidence of two people.** Every LOCAL_USER key is minted under one workspace signing
  authority. A regulated project whose approvers are all LOCAL_USER is labelled `SOD_DEGRADED_SELF_PROVISIONED`, and a
  user created with no recorded creator is self-provisioned.

### The single-user rule

Self-approval is derived, never supplied. It is allowed only when the workspace has exactly one ACTIVE local user, no
live host (WORKSPACE_ROUTER) session, the request did not come through the hosted router (`/w/<id>/`), the project is
not regulated, the signed workspace floor does not forbid it, the deciding principal is that one user, and the chain
has not ratcheted. In host mode a workspace's `users.yaml` usually holds one bootstrap owner while the host has many
members, so a host session or the hosted router turns it off; a WORKSPACE_ROUTER principal never self-approves. The
**ratchet**: once any transition recorded two or more active principals, or any gate held two distinct approvers, the
project never self-approves again, whatever later revocations do. A `policy` gate is never self-approved. A
self-approved decision is recorded with `self_approved = 1` and its facts, and a verifier reports it as
`not-evaluated` (`SINGLE_USER_WORKSPACE`).

### Acknowledged items

An owner may acknowledge some WAITING items (for example `sod.self_provisioned`). The item stays WAITING with
`OWNER_ACKNOWLEDGED`, is bound into the next gate, lapses after 90 days and is never cleared. A BLOCKED item cannot be
acknowledged. Acknowledge before requesting the gate: an acknowledgement supersedes an open gate on the same revision.

## Resources, the catalog lock and the compiled-plan lockout

A gate binds the digests of the signed configs and resources its revision depends on. Decide, complete and every
effect recompute them; a moved digest is `RESOURCE_DRIFTED`. The catalog lock changes with every register or overlay
merge, so across projects a lock change renders as `scope_changed` ("catalog lock changed"), never as a fault: re-propose
and re-approve.

An activated compiled plan whose identity binding requires a lease used to deny every native tool call from Studio
tasks, which carry none. P1-67 has Studio mint a lease per native task runtime; Adapt (P1-61) models the remaining
cases as the readiness item `adapt.plan.nativeSessionsAllowed` (`PLAN_DENIES_NATIVE_SESSION`) rather than hiding them.

## Assemble: building the agent

Assemble turns the approved brief into a built agent: the native path through Studio's native tasks, or an external
framework through a scaffold, connect instructions and a trace import.

- **Ask and Understand.** Assemble asks for capabilities, autonomy (`advise`: no tools; `act_with_approval`: the signed
  workspace tools), tools, MCP connectors, the build provider (`stub`, or `provider:model`), existing systems, budget,
  the engineering path, validation checks and, optionally, a declared workflow. Understand carries `riskTier` and
  `stations` from Aspire (change them there) and reads the tool pipeline's readiness, the doctor's checks, the native
  task limits, providers (credentials by reference and `configured` only, never a value), tool scope and validation
  config from Studio's own native task service, the frameworks, mechanic profiles, the compiled plan (and whether it
  shows the `workflow` tool), the open `outcome_unknown` executions and the path table.
- **Paths.** Each path has an IntegrationClaim: which boundary enforces it, what its evidence can reach and what it does
  not cover. Native is `tool_pipeline`; `claude-code` is preview (P1-23, held on D-02); `pi` is unsupported (P1-22, held
  on D-02); the framework paths are gateway-only previews (P1-54). An unsupported path or plan item stays listed with its
  key, and the stage completes only after an owner acknowledges it out of scope with a reason. A `tools` answer narrower
  than the signed scope is listed too (`NATIVE_TASKS_WHOLE_SCOPE`): a native session is granted the whole scope.
- **Propose** records the plan: the typed graph with the agent's permissions, tasks by executor (`deterministic`,
  `native_turn`, `workflow`, `human`; `human` is a command for you to run, never run by AMC), the preset, the build session, the
  validation plan and the baseline Enforce manifest, which must be ACTIVE: pending Enforce drift is reviewed in Enforce
  first, never applied unseen by Assemble.
- **Workflow.** A declared workflow (JSON: `agent`, `parallel` and `pipeline` nodes, at most 64) is checked as data
  when you answer and needs autonomy `act_with_approval`. It runs only through the agent's `workflow` tool, each helper
  through `spawnSubagent` (depth limit, signed handoff packet, declared scope, a started/completed pair); AMC never
  starts helper agents on its own. Studio's native build sessions compose no delegation, so the plan lists the workflow
  as unsupported (`NATIVE_TASKS_NO_DELEGATION`) and it stays listed until an owner acknowledges it out of scope. Once a
  compiled plan is active its default `visibleTools` hides the tool, and the plan names that denial
  (`C6_COMPILED_POLICY_DENIES`, with the plan revision and its tool-pipeline controls); an unreadable plan counts as
  hiding it.
- **Build** (an owner) signs the agent's preset into `.amc/agents.yaml`, writes the typed graph and journals one native
  build session in its revision; Studio starts it after the step is recorded, on its one native task service (the
  four-session limit and its sweeper are shared with every Studio task). Further turns, cancel and resume use the native
  tasks page as the session's owner; the Build card loads the owner's build log with the same cursor contract.
- **External path.** After Build and before Review, an owner can write the path's scaffold, the bridge contract tests
  and the agent's policy pack into a new workspace directory outside `.amc/` (the record binds a manifest of every
  file's sha256; the files are written after it commits), get connect instructions (the lease token is shown once and
  never stored; the record keeps the leaseId), and import the agent's traces through the neutral importer (originals
  retained; imported traces are self-reported). A bounded first task through `createForeignRunner` is not run: a foreign
  child runs only under `spawnSubagent`, which Studio's native tasks cannot do (`NATIVE_TASKS_NO_DELEGATION`); the plan
  gives a supervised command for you to run.
- **Review** is run by the session's owner and refuses a session that is not the start Build journaled
  (`BUILD_SESSION_MISMATCH`; the prompt itself is not comparable yet and is recorded as not evaluated), or one that runs
  or has failed. AMC's `verifyAgentRun` is an integrity self-check (`workspace-key-consistency`, `SELF_CHECK`) with its
  verifier report attached; a session with no head event is not evaluated. Review also records each session's
  effective-policy receipts and their downgrades, and four execution phases (admission, model completion, side-effect
  completion, evidence verification). On the stub provider every ref about the agent is `synthetic_example` and the
  review reads "tool pipeline observed on a stub model; agent behaviour not evaluated"; the agent stays at lifecycle
  stage `development`. `unit_tests_passing` needs every pinned check executed and passed on a non-stub provider.
  `composition.compositionDigest` and `composition.policyDigest` are not recomputed per session yet (`composition_bound`
  is not evaluated); the reviewed receipts are bound through the review.
- **Completion** runs the effect `a4.assemble.apply`: an owner opens the effect gate once the completion gate has its
  quorum, project approvers decide that second engine request from the A4 card (bound to its request digest), and
  `complete` applies the reviewed Enforce resources as the agent's active manifest with a signed receipt. A failed apply
  leaves the gate consumed and offers one owner retry. A vote that consumption would refuse (separation of duties, the
  revision's builders, a host session on a regulated project) is refused when it is cast.
- **outcome_unknown.** A cancelled or failed journaled call blocks the agent's journaled calls and this stage
  (`no_open_outcome_unknown`). The Outcome unknown card requests a resolution (the operator's statement, an
  `amc.action.resolve` engine request), another project approver or owner decides it from the card, and the resolution
  is recorded once A4's dual control holds: approvals bound to the request from members other than the operator, two
  distinct live-checked identities when the project is regulated. The note is sealed in the project's blob store; the
  engine request and the action journal carry only a reference naming the sealed blob and the note's sha256. The
  resolution is the operator's statement, `self_reported`, never observed. A denied or expired request is requested
  again from the same card.

## Deployment boundary

AMC prepares deployment plans and records what the operator says happened; it never deploys, never holds deployment
credentials and never merges the operator's statement with its own check. A deployment row has two columns:
`recorded_status` (the operator's statement, `self_reported`) and `amc_check_status` (`not_evaluated`, `reachable`,
`passed` or `failed`; AMC's own probe). In v1 the deployment is a same-host restart of the hosted Studio that built the
agent, from a pinned image (D-18); the first real deployment target is P2-40. "Verified" is reserved for the
independently reviewed lane.

## Private text and erasure

Free text that may carry personal data (personal context, brief free text, comment bodies) is not stored in the ledger.
It goes to the project's encrypted blob store under `a4-projects/<projectId>/private/`, sealed to a per-project key; the
ledger keeps a salted hash and the ciphertext's hash. Pasted text is retained until the project's key is destroyed, and
destruction is effective only after every backup, WORM segment or mirror older than it has been rotated out. Back up
`a4-projects/` and `a4-releases/` with the workspace: a restore without them orphans every blob reference in the chain.

## Exports and verification

- **Verify in place.** `GET /api/v1/a4/projects/:id/verify` returns a `VerifierReportV1` under the server operator's
  trust list. It takes no query parameter and no body: `?trustList=` is 400 `QUERY_INVALID`, and any trust a request
  names is refused. The report is the same for every reader allowed to see it. `amc verify all` runs the same check
  (`a4-projects`) for every project.
- **Export.** With `AMC_A4_PREVIEW=1`, `amc bundle export` adds each A4 project of the run's agent to the `.amcbundle`
  as an `amc.a4-record/v1` file, `a4/<projectId>.json`: the project rows as stored and the ledger rows they name.
  `a4/index.json` names each project's head and `containsSyntheticExamples`, and the signed manifest lists every file.
  A project is the agent's by the receipt signed for its first audit row, never by the head row's editable `agent_id`.
  Each project's chain is verified whole before it is exported. A project that does not verify, has lost its head row,
  or names two agents refuses the export with `A4_INTEGRITY_FAILED`. Only the store writes in the `a4-` session
  namespace (any other writer is refused with `A4_SESSION_RESERVED`), and only its rows there name a project. A project no signed receipt attributes is verified
  as well, so it too refuses the export unless it verifies. The bundle's own ledger is unchanged by the slice.
  `amc certify` builds its internal bundle the same way, so with the flag set such a project also refuses
  certification (`A4_INTEGRITY_FAILED`); the certificate itself copies none of the A4 records.
- **Verify offline.** `verifyA4Bundle` (`src/a4/a4Verify.ts`) checks a bundle or an `amc.a4-record/v1` JSON export
  without AMC's keys: every digest recomputes from the exported bytes, and keys count only when the caller's pinned
  trust list admits them. It is a library function for now: the CLI entry point is `amc a4 verify --trust-list`
  (P1-65). With no trust list the report states integrity only. In a bundle, a record whose `CREATED` body or signed
  seq-0 receipt names another agent than the manifest's fails scope (`A4_SCOPE_AGENT`). Seven normative fixtures,
  with their expected verdicts, are in `tests/fixtures/contracts/a4-record/`.
- **Binder slice.** `buildA4BinderSlice` (`src/a4/a4Binder.ts`) writes a project's revisions, gates, transitions,
  evidence refs and verifier summary under `.amc/audit/binders/exports/` only: digests, statuses and hashed principals,
  never specification text, comment bodies or decision reasons. Only ledger row ids are kept as they are; every other
  ref id (a file name, a receipt or external id) is hashed with its kind. The slice is scanned for personal data and
  key material, then staged, signed and moved into place, so a refused slice leaves nothing behind. It is a library
  function for now, absent without `AMC_A4_PREVIEW=1` (404 `A4_PREVIEW_DISABLED`): no route or command serves it yet.

## Using the API before the Studio pages

With `AMC_A4_PREVIEW=1` and a Studio session (`amc approvals login` or the Studio login), read the native CSRF token
from `GET /auth/me` (field `nativeCsrfToken`), then send on every call:

```text
Cookie: <the Studio session cookie>
Origin: <the Studio origin>
x-amc-native-intent: task-workspace-v1
x-amc-native-csrf: <nativeCsrfToken>
```

The `bootstrap-admin` token (`x-amc-admin-token`) reads A4 projects and never mutates them: `POST /api/v1/a4/projects`
with it is 403 `ADMIN_TOKEN_REFUSED`; a project needs a human session. Creating a project needs a signed workspace
approval policy; when it is missing the readiness item `approvals.policy_signed` names the fix:

```bash
amc policy approval init
```
