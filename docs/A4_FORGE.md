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
| Adapt | prompts, permissions, memory policy and the compiled applicability, every regulatory record marked `experimental` (D-08) | none: the context probe is a turn A4 runs on the stub provider, so its ref is `synthetic_example` | not available |
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
`OWNER_ACKNOWLEDGED`, is bound into the next gate when it is one of the stage's bound items, lapses after 90 days and is
never cleared. A BLOCKED item cannot be acknowledged. Acknowledge before requesting the gate: an acknowledgement
supersedes an open gate on the same revision. Adapt's `plan_unresolved` (an owner's out of scope),
`regulatory_sources_status` and `context_probe_unavailable` (a JSONL session store) are not in Adapt's bound set yet, so their acknowledgements are on the chain but not in the
gate's intent (a change to the bound set needs a versioned intent; requested).

## Resources, the catalog lock and the compiled-plan lockout

A gate binds the digests of the signed configs and resources its revision depends on. Decide, complete and every
effect recompute them; a moved digest is `RESOURCE_DRIFTED`. The catalog lock changes with every register or overlay
merge, so across projects a lock change renders as `scope_changed` ("catalog lock changed"), never as a fault: re-propose
and re-approve.

An activated compiled plan whose identity binding requires a lease used to deny every native tool call from Studio
tasks, which carry none. P1-67 has Studio mint a lease per native task runtime; Adapt (P1-61) models the remaining
cases as the readiness item `adapt.plan.nativeSessionsAllowed` (`PLAN_DENIES_NATIVE_SESSION`) rather than hiding them.
Every revision now binds `plan.journalEntrySha256` (the active compiled-plan journal's head; any activation, in A4 or
from the CLI, makes an open gate `RESOURCE_DRIFTED`) and `plan.lockDigest` (the shipped catalog's lock, digested without
`generatedBy`, the AMC version that built it, which `verifyCatalogLock` ignores too: an AMC upgrade with an unchanged
catalog moves neither the slot nor Adapt's `plan_lock_drift`). A revision
recorded before these slots existed binds them as null, so its open gates read `RESOURCE_DRIFTED` once: record a new
revision. The same holds for the context slots (`context.contextPluginSha256`, `context.memoryPolicySha256`,
`context.promptPackSha256`) and the operating-profile slots (`operatingProfile.sha256`, the agent's
`amc-operating-profiles/<agent>/a4-<station>.operating-profile.json` files; `operatingProfile.activationSha256`, every
activation record of the agent). Those files sit outside `.amc/`: an entry that is not a regular file (a link, a FIFO)
or a profile directory that is a link reads `RESOURCE_UNREADABLE`. A prompt pack rebuilt by the prompt
scheduler moves `context.promptPackSha256`, so an open gate reads `RESOURCE_DRIFTED` until it is requested again.
Under an active plan, Studio mints a native task's lease with the workspace lease key, which the vault holds: while the
vault is locked, `adapt.plan.nativeSessionsAllowed` reads WAITING (`LEASE_NOT_ISSUED`, `VAULT_LOCKED`). The item decides
from the journal head the head revision bound only while that head is current: a head moved since (an activation from
the CLI, another project or this one) or a journal that no longer verifies reads NOT_EVALUATED
(`PLAN_HEAD_MOVED_OR_UNREADABLE`), never `NO_ACTIVE_PLAN`.

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
- **Build** (an owner) signs the agent's preset into `.amc/agents.yaml` (the presets file is verified and parsed from
  one read, and the bytes written are the bytes signed), writes the typed graph and journals one native
  build session in its revision; Studio starts it after the step is recorded, on its one native task service (the
  four-session limit and its sweeper are shared with every Studio task). Further turns, cancel and resume use the native
  tasks page as the session's owner; the Build card loads the owner's build log with the same cursor contract. Build
  refuses, before any write, a session start Studio's native tasks would refuse (`ANSWER_INVALID:validation` or
  `ANSWER_INVALID:capabilities`): a check missing from the operator's config, checks without the signed workspace
  `bash`, or more than 8 or duplicate check ids. Propose already leaves such checks out of the plan and lists them as
  unsupported (`NOT_IN_VALIDATION_CONFIG`, `VALIDATION_SCOPE_REQUIRED`), and builds the prompt from the capabilities with
  control characters removed, cut by code point.
- **External path.** After Build and before Review, an owner can write the path's scaffold, the bridge contract tests
  and the agent's policy pack into a new workspace directory outside `.amc/` (the record binds a manifest of every
  file's sha256; the files are written after it commits), get connect instructions (the lease token is shown once and
  never stored; the record keeps the leaseId), and import the agent's traces through the neutral importer (originals
  retained; imported traces are self-reported). A source already imported is refused (`IMPORT_EXISTS`): an existing
  import, which an earlier record may name, is never rewritten or rolled back. Whoever scaffolds, connects or imports
  counts as a builder of the stage: they cannot approve its completion gate or the `a4.assemble.apply` request. The scaffold directory and the import source are workspace paths of
  plain names with no symbolic link on the way (each component is checked; `PATH_NOT_PLAIN` otherwise), so a link
  such as `docs -> .amc` cannot lead either into `.amc/`. A bounded first task through `createForeignRunner` is not run: a foreign
  child runs only under `spawnSubagent`, which Studio's native tasks cannot do (`NATIVE_TASKS_NO_DELEGATION`); the plan
  gives a supervised command for you to run.
- **Review** is run by the session's owner and refuses a session that is not the start Build journaled
  (`BUILD_SESSION_MISMATCH`; the prompt itself is not comparable yet and is recorded as not evaluated), one that runs
  or has failed, and one that is still open (`BUILD_SESSION_OPEN`): verify the session on the native tasks page, which
  closes it, so it takes no turn after what approvers approve. AMC's `verifyAgentRun` is an integrity self-check (`workspace-key-consistency`, `SELF_CHECK`) with its
  verifier report attached; a session with no head event is not evaluated. Review also records each session's
  effective-policy receipts and their downgrades, listed from the session's signed `EFFECTIVE_POLICY` ledger rows (a
  receipt file that is missing or does not hash to its row reads unverified, `RECEIPT_MISSING`), and four execution phases (admission, model completion, side-effect
  completion, evidence verification). On the stub provider every ref about the agent is `synthetic_example` and the
  review reads "tool pipeline observed on a stub model; agent behaviour not evaluated". Review records the agent's
  lifecycle stage as `lifecycle/state.json` holds it (`not_evaluated` with the reason when the file is absent or
  unreadable) and advances nothing: the development → testing bridge (design §7 item 9) waits for the A4 lifecycle
  wrapper, so `lifecycle_bridge` reads NOT_EVALUATED with `KEY:A4_LIFECYCLE_WRAPPER`. `unit_tests_passing` needs every
  pinned check executed and passed on a non-stub provider. Review itself records no observed ref yet: it does not
  reference the session's runtime-written rows as ledger refs. Every answered capability is `not_evaluated`: nothing
  maps a check or a session output to it.
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
  is recorded once A4's dual control holds: approvals bound to the request from members other than the operator, the
  principals who built at Assemble and the owners of its build sessions, two distinct live-checked identities when the
  project is regulated. The engine request is filed at that floor (at least 1 approval, 2 distinct users when regulated)
  even when the action class's rule asks for fewer, so it stays open until A4's quorum can be met. The note is sealed in
  the project's blob store; the
  engine request and the action journal carry only a reference naming the sealed blob and the note's sha256. The
  resolution is the operator's statement, `self_reported`, never observed. A denied or expired request is requested
  again from the same card. If the journal settled a resolution but its project record was refused, the item stays
  BLOCKED (`RESOLUTION_UNRECORDED`) and the card keeps "Record the resolution" for it. Decisions cast from the card on
  engine requests are mirrored to the human action log (`HUMAN_APPROVAL_DECISION`), as Studio's approvals page does.

## Adapt: the compiled plan and the agent's context

Adapt makes the agent specific to its audiences, markets, sector and data: applicability, signing, activation and the
conformance statement, then the context plugin and its probe, the memory policy, the operating-profile widenings and
the agent's prompt pack.

- **Ask and Understand.** Adapt asks for audiences, workflows, preferences, languages, accessibility, the compiler's
  nine facts (jurisdictions, primary station, domains, roles, entity types, risk class, use cases, data classes; the
  stations are carried), excluded uses, data residency, retention and processors, and deployment needs. Understand
  carries `markets` and `stations` from Aspire. An empty or `unknown` fact stays unknown (null) and is never guessed;
  `jurisdictions` left empty uses the carried markets. Every fact is the member's assertion (`provenance: asserted`,
  source `a4:<projectId>@r<revision>`). Understand compiles the plan with `compilePlan` on that profile and records the
  applicability per requirement with its reasons and missing facts, each citation's `appliesWhen`, the register entries
  of the stations with `verified` as recorded, the reporting-clock candidates (each `NEEDS_CLASSIFICATION`, with
  `CLOCK_REVIEW_STATUS`), the signed configs' states and the active plan's head. The missing facts name the questions
  that resolve them. An answer given before a carried question had any value at Adapt, and current then, is stamped
  against the values Understand carries, so the first carry does not mark it stale; one given against another, earlier
  carried value stays stale.
- **Explain** quotes the catalog's own notice at every level, never a sentence of Adapt's: "Every record here is `experimental`: it
  was drafted by an agent, its citations are not yet fetched, hashed or legally reviewed, and no named expert has
  approved it." (D-08). It renders applicability, missing facts, the required reviews of the completion rule (a role's
  approval is an acknowledgement, not an expert review), activation and the lockout, and what is declared but not
  enforced (data handling: P2-01, P2-02; reporting clocks: P3-23).
- **Propose** freezes the profile, the plan, the diff against this project's previous proposal, the operating scope
  and the declared data handling (`enforcement: none`). **Build** signs the plan (`CONTROL_PLAN`, checked against this
  workspace's keys: a local audit trail). Build is an owner's, as at Aspire and Assemble: it signs the plan and re-signs
  the agent's Enforce manifest. Before it writes, the agent's resources must match its signed Enforce manifest (else
  `409 ENFORCE_DRIFTED`: review the drift in Enforce and re-baseline it there), and it re-writes the manifest only when
  its own writes moved nothing but the agent's memory directory, signed: a manifest that cannot be written or signed is
  refused before anything is published (`requireSignature`), and Build is refused with 409 and that code
  (`MANIFEST_SIGNATURE_INVALID`, for example) with its writes put back. A plan weaker than the plan this project put in force
  is refused (`POLICY_WIDENING_REFUSED`). Every refusal comes before Build writes, including the router's own size
  (256 KiB) and credential checks of the record Build makes (`413 INPUT_TOO_LARGE`; Propose already refuses a proposal
  that leaves Build no room). When a write fails, or the step is not recorded after Build returned (the head moved, the
  transition was refused, a replay answered), the memory policy, the context plugin and the Enforce manifest and its
  signature are put back as they were, so no change stays behind that no revision records. **Review** is an owner's too
  (owner mode): it signs the control results with the workspace auditor key. It refuses with `409 RESOURCE_DRIFTED` when
  the memory policy, the context plugin or the agent's Enforce resources moved since Build, then evaluates every
  requirement with `evaluateControl` (no loader binds runtime rows to catalog evidence contracts yet, so each reads
  `not_evaluated`; a requirement whose control the shipped catalog no longer holds stays listed, `not_evaluated` with
  `CONTROL_NOT_IN_SHIPPED_CATALOG`), writes the set signed (`CONTROL_RESULT`) under
  `a4-projects/<projectId>/control-results/` (each directory made plain, never through a link) and reads it back. Only
  two read-back outcomes are local limits, recorded `not_evaluated`: a notary-route signature (the pinned notary's key,
  which does not verify under this workspace's keys) and a workspace key the operator's trust list does not pin
  (`ISSUER_NOT_PINNED`). Anything else (missing, changed, unsigned, a signature that does not verify, a distrusted or
  revoked signer, bytes or a shape that do not parse) is an integrity failure: `adapt.control_results_signature` reads
  BLOCKED (`CONTROL_RESULTS_INTEGRITY_FAILED`) and holds the gates. Readiness and the conformance view check the file
  again on every read, so a results file edited or deleted after Review reads the same way. Nothing in Adapt is an
  observed ref.
- **Context plugin.** Build writes the members' audience, market, sector, language, accessibility, data-handling and
  regulatory-note answers as one attributed context plugin (`# A4 context: <section>`, source
  `a4:<projectId>@r<revision>`, order 160, the catalog's notice quoted) to `<agent>/a4/context-plugin.json`. The only
  path that delivers it is `extraContextPlugins` of an in-process `runComposedTurn` (the CLI's agent-loop run). A Studio
  native task loads only the instructions file and the time plugin, and nothing loads the plugin into a deployed agent:
  `context.native_delivery` stays `not_evaluated` (P2-37), and a native task started after Adapt shows no A4 context
  plugin in its frame.
- **Context probe.** `POST /api/v1/a4/projects/:id/stages/adapt/probe` (after Build; owner; owner mode) runs one
  in-process turn on the stub provider, with no network and no credential, with the plugin as an extra context. A4
  composes the turn and writes nothing into its session: no tools and no receipt of its own. The runtime writes an
  effective-policy receipt only before a governed tool call, and this turn makes none, so there is no receipt to cite.
  The probe checks that the run's signed `user/message` row carries the plugin's exact text and reads the turn's signed
  `turn/end` reason, and records the session's own signed `session/open` row (which names the agent) as a `ledger_event`
  ref, `synthetic_example`: A4 ran the turn on the stub provider, so it is never observed. The session is named
  `a4probe-<uuid>`, and the A4 store records any ref to one of its rows as `synthetic_example` with no trust tier,
  whoever cites it (`POST …/evidence` included). Outside A4, ledger scoring reads those rows as it reads any
  `amc agent-loop run --stub` turn's: the runtime stamps native rows `OBSERVED`, and a session-level synthetic stamp
  needs the session spine. `context_reaches_runtime_frame` stands on AMC's check
  of the `user/message` row (named `SNAPSHOT:<row>`), made by the probe and again by Review, in the implementation
  section ("observed in-process, not in a Studio native session"). A turn that did not end `complete` (blocked, error,
  cancelled, max steps: `PROBE_DENIED`), a row without the text (`CONTEXT_NOT_IN_FRAME`), a session row that no longer
  resolves (`PROBE_REF_UNRESOLVED`), or a row Review finds gone or changed never satisfies it. Whoever runs the probe
  counts as a builder of the revision, so they cannot approve the completion gate or the activation. Delivery to a model
  (`model_delivery`) is `not_evaluated` on the stub provider. The item is mandatory once Adapt is built, so a regulated
  project's plan is activated only after the probe. A workspace whose session store is JSONL has no ledger row for the
  ref: the probe is refused before any turn runs (`409 PROBE_NOT_RECORDED`, `SESSION_STORE_JSONL`),
  `context_reaches_runtime_frame` reads NOT_EVALUATED and is not mandatory there, and `context_probe_unavailable` waits
  in its place until an owner acknowledges it with a reason: such a project completes only with that acknowledgement on
  the record, the plugin's delivery not evaluated.
- **Memory policy.** Four optional questions (privacy class, retention days, review days, consumers) build
  `amc.a4-memory-policy/v1` with `ReasoningMemoryItem`'s field names. An empty answer takes the stated default
  (restricted, 90 days, 30 days, every consumer), labelled `default`. Build writes it to `<agent>/memory/policy.json`,
  inside the agent's `memory` Enforce resource, and re-writes the signed Enforce manifest after it; Review re-reads the
  bytes Build wrote, and other bytes, even ones that parse, read BLOCKED (`MEMORY_POLICY_CHANGED`); until Review has
  re-read it, `memory_policy_present` says `REVIEW_RECHECK_PENDING`. Enforcement is
  `advisory`: the reasoning-memory writer does not read the file yet.
- **Permissions.** Understand builds the primary station's operating profile in memory (deterministic bytes) and
  compares it with the current verified configs through `planActivationWidenings`, a read-only view of the comparison
  `activateOperatingProfile` runs (no write closure leaves that module). It writes no file and signs nothing: the auditor signature that makes a profile activatable stays the owner's
  `amc domain apply --sign-profile` on a profile they emitted and reviewed. `profile_no_widening` lists each widening as
  `scope_changed` (`POLICY_WIDENING_REFUSED`) until a project owner's revision answers `acceptWidenings` with exactly
  their digest. A4 never passes `allowWidening` and never activates a profile: activation stays the owner's
  `amc domain apply --activate-profile` after review. Not built yet (`KEY:A4_PROFILE_EFFECT`): the effect
  `a4.adapt.activate_profile` (design §6.1), the per-agent `gatePolicy.json` and lease-cap proposal, and building a
  prompt pack.
- **Prompt pack.** Understand and Review record the agent's latest signed prompt pack and whether it verifies under this
  workspace's own keys, over exactly the bytes they hashed (`adapt.prompt_pack_signature`, an integrity item: no lane, no claim). A prompt pack is a signed
  Score resource; the runtime does not load it into a model's prompt, and Adapt does not build one.
- **Conformance statement** (`amc.a4-conformance-statement/v1`): five dimensions per control and counts, never a
  percentage. `GET /api/v1/a4/projects/:id/conformance?stage=` and the `amc_a4_conformance` MCP tool return it: Adapt's
  from the results its newest Review recorded, with the results file checked again (one that no longer verifies reads
  `not_evaluated` with its reason), and with the owner's out-of-scope settlement and the sources acknowledgement recorded
  on that Adapt revision; once its completion gate is consumed, the acknowledgement in force then stays on the statement
  after it expires and after Activate records new revisions. Every other stage, and Adapt before its Review, carries no
  plan and says `not_evaluated`. `not_applicable` comes only from the plan. A mandatory requirement left unresolved keeps
  `plan_unresolved` WAITING; an owner may record it out of scope with a reason (Acknowledge), and it then stays
  unresolved in the counts with `OWNER_OUT_OF_SCOPE` and `OWNER_ACKNOWLEDGED` (a true exception is P2-24).
- **Completion.** A regulated project activates its plan at completion through the effect `a4.adapt.activate_plan`
  (`plan_activated` waits from Review on; it never holds the direction gate). Once the completion gate has its quorum,
  an owner opens it: who may open it and that quorum are checked before anything is filed; then `signPlan` files the
  plan review (`SECURITY`, two distinct people when regulated) and approvers decide it from the A4 card. `complete`
  verifies that grant and re-checks separation of duties and membership; `activateControlPlan` then consumes it itself
  (`activate-<digest32>`, recorded on `EFFECT_FINISHED`). A failed activation is not retried in place: re-open the
  effect gate (only after a failed, unfinished attempt; on a consumed gate anything else is `409 A4_GATE_STALE`,
  `consumed`). Only a ready plan activates: opening the review on a blocked plan is `409 PLAN_BLOCKED`. Whenever
  activation is due or opened, `plan_activated` is BLOCKED from Review on for a plan `activateControlPlan` would refuse
  (`PLAN_BLOCKED`, `PLAN_WEAKENS_ACTIVE_PLAN`, `ACTIVE_PLAN_UNREADABLE`); before Review the same codes show on a WAITING
  item that is not mandatory, so it never holds the direction gate. A workspace has one active plan for every agent:
  activating replaces it, and `activateControlPlan` refuses a plan weaker than the active one. Each project's plan
  carries its own agent's budgets, so another agent's active plan makes this one weaker (`PLAN_WEAKENS_ACTIVE_PLAN`) and
  opening the review is refused before any gate is consumed. Understand and Review record the active plan's profile:
  while another profile's plan is active, activation is not due, and even a regulated project completes with its plan
  signed and not activated (`PLAN_SIGNED_NOT_ACTIVATED`, `REPLACES_ACTIVE_PLAN`, `ACTIVE_PLAN_OF_ANOTHER_PROFILE`)
  until per-agent plans exist. A non-regulated project completes with the plan signed and not activated
  (`PLAN_SIGNED_NOT_ACTIVATED` once Build signed it); an owner may still open the effect, before completing: once the
  completion gate is consumed without it, it cannot be opened there. An activation that started and has not finished
  reads `PLAN_ACTIVATION_NOT_FINISHED`. Any active plan makes a project regulated: its own activation (`EFFECT_FINISHED`)
  does at once, and every project's next revision in the workspace records the active plan's head. That stays the
  remaining limit: a project whose revisions recorded another project's active plan keeps the regulated quorum and
  identity floors (two distinct keys, live-checked identities) although its own plan is not activated. Under an active plan, Studio native tasks with workspace tools started after activation run under a lease
  (P1-67); tasks started before it, CLI agent sessions and delegated children are denied every call.
- **Lifecycle bridge.** Adapt's rows (`testing → staging`) are the only source of `controlsSatisfied` for that advance:
  `integration_tests_passing` from executed checks that all passed on a non-stub provider, `security_review_signed`
  only from a `review_record` entry met by an admitted external record (an AUDITOR role vote alone leaves it
  `not_evaluated` with `REVIEW_NOT_INDEPENDENT`), `deployment_plan_approved` from the consumed Activate direction gate.
  Adapt never advances the lifecycle; the A4 lifecycle wrapper (P1-62) does.

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
