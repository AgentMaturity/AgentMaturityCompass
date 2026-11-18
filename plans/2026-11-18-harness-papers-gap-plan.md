# AMC against two harness papers: gaps and plan (2026-11-18)

Sources read in full:

- Seong et al., "The Last Harness You'll Ever Build" (arXiv 2604.21003v3). A Harness Evolution Loop
  (worker, adversarial evaluator, evolution agent, always evolving from the best harness with the
  full history) and a Meta-Evolution Loop that tunes the loop itself across tasks.
- Barbaste et al., "Harness Engineering: Anatomy, Architecture, and Evolution of Coding Agents"
  (arXiv 2609.00006v1). A source study of eleven harnesses and one meta-harness: seven subsystems,
  13 observations, 29 patterns, 18 recommendations.

AMC was audited against both by three read-only passes on `c5cbb8892` (same tree as `origin/main`
`4f7423b37`). Each finding below was checked in source by the auditor; none was re-checked by a
second reader.

## Where AMC already leads

Signed hash-chained evidence per action with offline verification, Rekor and RFC 3161 anchoring,
KMS and PKCS#11 key custody, approval quorum with separation of duties, kill switch and freeze,
truncation guard, read-before-edit enforced in code, concurrency-partitioned tool batches, deferred
tool loading, byte-stable cached prompt prefix, no yolo mode, default-deny network sandbox on macOS
and Linux, env allowlist, SSRF guards, OIDC/SAML/SCIM, S3 Object Lock export, ACP server, signed
plugin packs, no agent framework and no code RAG (the survey's two "do not build" items).

The survey reports append-only logs in two systems (Pi's session tree, OpenHands' event log) and
signing in none. Signed evidence is AMC's position; every lane below must write its decisions to
the evidence spine.

## Gaps

Keys are stable; lanes cite them.

### Loop (survey D1, R1, R18)
- HP-01 No stuck detection: no repeated-call hash, no malformed-response cap. Only `maxStepsPerTurn` 64.
- HP-02 Corrected after a source check: a dollar limit exists as the signed budget, which refuses a
  model request before it is sent (`AMC_NATIVE_BUDGET_REFUSED`). What is missing is a per-run cost
  limit and a default wall-clock limit for runs without a signed budget.
- HP-03 Turn policies are branches in `agentDriver.ts`, not composable.
- HP-04 Verification after a file-changing turn is opt-in (`--validate`); no verify-on-stop.
- HP-05 Context overflow is terminal; no compact-and-retry; summaries are not merged; no required
  sections; no file restore after compaction.
- HP-06 No file checkpoint or rewind, although the log holds file hashes.
- HP-07 Steering exists in the CLI only; chat, SDK, ACP and Studio cannot steer.
- HP-08 Plan mode has no structural exit and is missing from native chat.

### Model integration (D2, R2)
- HP-09 One pinned route per run, no failover chain.
- HP-10 No shared reasoning-effort scale; OpenAI reasoning refused; Anthropic thinking only without tools.
- HP-11 No model-family prompt or tool variants for the native loop.
- HP-12 GenAI spans are exported after the fact, not live.

### Tools (D3, R5)
- HP-13 Edit tool has no Unicode/whitespace canonicalization and no closest-match hint.
- HP-14 No argument coercion for schema drift.
- HP-15 No lint or LSP diagnostics after edits.
- HP-16 Native bash uses regex argv patterns; the tokenizer in `shellCommandPlan.ts` is not used there;
  no grants scoped by command arity.
- HP-17 No remoting seam for native tools (container, SSH, micro-VM). Windows sandbox is a disabled prototype.

### Memory and context (D4, R6, R7)
- HP-18 No persistent agent memory with a review step; no session search.
- HP-19 `GEMINI.md` and `.cursorrules` not read; no folder-trust gate; context files not scanned.

### Safety (D5, R10, R11)
- HP-20 MCP tool results and skill bodies are not fenced as untrusted; no injection scan of context
  files, skills or MCP descriptions.
- HP-21 Policies have no inline match/not_match examples checked at parse time.
- HP-22 No managed (organisation) config layer above the workspace; a cloned workspace can sign its own floor.
- HP-23 No denial tracking per agent.
- HP-24 No LLM approval reviewer. Kept out on purpose as an approver; see "Not building".

### Orchestration and protocols (D6, R12, R13)
- HP-25 Sub-agent definitions lack model, permission-mode and skills fields, scopes and fork modes.
- HP-26 No ACP client/host role; only `claude-cli` as a foreign delegate; no cross-vendor review rule.
- HP-27 Conformance bench checks hook payloads only, not live turn, tool call, stream, interrupt,
  model override, policy denial.

### Extensibility and platform (D7, R14, Obs. 12)
- HP-28 Hooks: 4 of 9 parsed events fire; deny only; no PermissionRequest, SubagentStart/Stop, PostCompact.
- HP-29 Skills: `~/.claude/skills` not read; no `paths` activation; no registry, trust tiers, scan,
  quarantine or provenance; no agent-authored skill inbox.
- HP-30 Plugins: `.claude-plugin` not read; no git or URL marketplace add.
- HP-31 MCP: no sampling, no prompts.
- HP-32 No agent-as-model endpoint (`/api/v1/chat/completions` is allow-listed with no handler); no
  TypeScript SDK; VS Code extension is a scaffold; the GitHub Action only scores.
- HP-33 Importers bring transcripts only, not settings, skills or config.
- HP-34 Connectors: no Jira, ServiceNow or Teams; SIEM and GRC are file exports, no live push.

### Harness evolution (paper 1)
- HP-35 The harness of one agent is split across the Enforce resource manifest, `AgentVersionManifest`
  and A4 digests; skills and hooks are not fields.
- HP-36 Evaluator: LLM judge off in suites (D-12); no state verification beyond files; no LLM-time
  versus tool-time split; no time tiebreaker; not a separate adversarial agent.
- HP-37 `runImprovementLoop` has no model-backed editor and no CLI or Studio caller;
  `amc experiment optimize` ranks estimates and never runs a candidate.
- HP-38 The held-out cases also pick the winner; there is no untouched test split; no
  IMPROVED/REGRESSED verdict per variant.
- HP-39 Nothing meta-level.

### Regulated depth
- HP-40 No 21 CFR Part 11 / EU Annex 11 electronic signature (meaning, re-authentication, manifest).
- HP-41 No validation package from evidence (IQ/OQ/PQ, SR 11-7, EU AI Act Annex IV); GRC export binds
  no evidence to controls; no PDF binder.
- HP-42 Production monitoring: no canary or shadow for agent versions, drift is on score runs not
  traffic, update policy is recorded but not enforced, no post-market monitoring report.
- HP-43 Replay is playback only; no deterministic re-run from recorded model and tool I/O.
- HP-44 Erasure is per A4 project, not per data subject; no DSAR workflow; timestamp-authority
  certificate revocation is not checked.

## What makes AMC the reference harness

Paper 1's loop has no governance: the evolution agent edits the harness and the best score wins.
In a regulated setting that is an uncontrolled change to a validated system. AMC already has the
missing half (signed manifests, regression gate, approvals with separation of duties, rollback).
The plan joins them: a governed evolution loop in which every variant, evaluator report, score and
verdict is a signed record, the winner is confirmed on a test split the loop never saw, and no
variant reaches a running agent except through Enforce apply and the A4 TUNE approvals. That is a
change-control record produced by the loop itself, which neither paper describes.

## Recorded decisions these gaps touch

Some gaps are earlier decisions, not omissions. A lane that touches one reads the recorded reason
first, then either keeps the decision or writes here why it changes.

- Context overflow is terminal on purpose ("do not silently drop history or automatically retry",
  `src/agent/nativeFailureGuidance.ts`). HP-05 keeps the rule's intent: a retry happens only after a
  signed compaction receipt, once, and the turn's record shows it. Nothing is dropped.
- File rewind is deferred (`docs/AGENT_LOOP_CONTINUITY.md`, "Not in this slice") until four things
  exist: a checkpoint store that works without vault blob keys, a conflict check against the last
  recorded `afterSha256`, a live-writer fence on fork, and a truthful child identity. HP-06 builds
  those four, in that order, or stops.
- The LLM judge in suites is deferred (D-12). HP-36 turns it on only with a calibration record and
  never as the only grader of a criterion.
- Sub-agent `model` must be `inherit`; "auto" and "on-failure" approval modes are refused; OpenAI
  reasoning output is refused; `scimAdapter` is unmounted. HP-10 and HP-25 read each reason first.
- Keys here use the prefix HP- so they do not collide with G1 to G12 in `plans/amc-superharness.md`
  or the rows of `plans/amc-gap-register*.md`.

## How lanes run

Every lane's first step is to confirm its gaps in source and against the gap registers, and to drop
or correct any that are wrong. Lanes with real design choices (8, 13, 14, 15, 17) get a written
design read by zero-context reviewers before code, as the EGM standing order asks; Sid asked for
"plan and then start executing" on 2026-11-18, which is taken as the go for the work, not as
approval of the three items under "For Sid".

## Lanes

One lane at a time, Opus 5.5 medium, directed and signed off by Fable, each through implement,
review, fix, integrate with the gate on `rtd/integ-1115`. Nothing is pushed without Sid.

Wave 0, from the UX walk of 2026-11-18 (report: `work/lanes-1118/ux-audit/REPORT.md`, UX-01 to UX-31).
These run before the rest of wave 1 because a new person cannot reach a working agent and an
auditor cannot export and verify unaided.
0a. `first-run` HP-46, UX-01 UX-28 UX-29 UX-02: bare `amc` leads to a workspace that can really act;
    a plain sentence works in chat; a folder whose `.amc` was removed can start fresh; a skill turn
    does not end the chat.
0b. `auditor-path` UX-03 UX-04 UX-05 UX-06 UX-30: hook decision before the person's approval; chat
    actions and approval content visible in the console; export of a session closed with `/exit`;
    `amc-verify` reads the session export; one truthful verification result; Governor page states
    what really runs; idle Studio stops writing an aborted-run record every minute.

Wave 1, loop floor (lane 1 `loop-guards` merged 2026-11-18, `03e864173`)
1. `loop-guards` HP-01 HP-02 HP-03 HP-23: turn policies as a small ordered list (step cap, token cap,
   dollar cap, wall clock, repeated-call signature, malformed cap, denial count). Repetition asks the
   person; in headless runs it stops. Every trip is an evidence event.
2. `overflow` HP-05: compact-and-retry once on overflow, previous summary merged, fixed sections,
   files restored after compaction.
3. `verify-stop` HP-04 HP-15: a turn that changed files and produced no fresh check result is continued
   once, then sealed as "unverified"; on by default for A4 and regulated projects.
4. `rewind` HP-06 HP-08: content-addressed pre-image store per turn, `amc session rewind`, signed;
   plan-mode exit tool; plan mode in chat.
5. `routes` HP-09 HP-10 HP-11 HP-12: signed failover chain that respects residency, one effort scale,
   thinking with tools, live spans.

Wave 2, content-borne threats and governance
6. `untrusted` HP-19 HP-20: fences for MCP results and skill bodies, scan of context files, skills and
   MCP descriptions, folder trust, neighbours' context files.
7. `shell` HP-16 HP-21: tokenizer in the native bash guard, arity-scoped grants, inline policy
   examples checked at load.
7b. `edit` HP-13 HP-14: edit canonicalization and closest-match hints, bounded argument coercion.
8. `managed` HP-22: signed organisation layer above the workspace, pinned out of band, tighten-only.
9. `hooks` HP-28 HP-25: all events fire, PermissionRequest (deny or ask, never allow), sub-agent events
   and fields.
10. `skills` HP-29 HP-30 HP-33: discovery, `paths` activation, trust tiers, scan, quarantine, signatures,
    review inbox for agent-authored skills, `.claude-plugin` read, settings and skills import.

Wave 3, governed harness evolution
11. `harness-manifest` HP-35: one content-addressed harness record with skills and hooks.
12. `evaluator` HP-36: separate evaluator run, state checks, per-criterion verdicts, LLM versus tool
    time, two-tier score, calibrated judge.
13. `evolve` HP-37 HP-38: model-backed editor, `amc evolve`, history with verdicts, evolve from best,
    train/select/test split, landing only through Enforce and A4 TUNE.
14. `meta-evolve` HP-39: blueprint tuning across packs with held-out packs; last, and only if 13
    shows gains on real suites.

Wave 4, regulated depth
15. `esign` HP-40: opt-in signed policy; signature meaning, re-authentication, manifest bound to the record.
16. `validation` HP-41: IQ/OQ/PQ, SR 11-7 and Annex IV packages built from evidence, evidence bound to
    controls, PDF binder.
17. `prod-monitor` HP-42 HP-43: version canary and shadow, traffic drift, enforced update policy,
    post-market report, record and replay.
18. `subject-rights` HP-44 HP-18: per-subject erasure, DSAR workflow, TSA revocation, session search,
    reviewed memory.

Wave 5, platform
19. `hosts` HP-26 HP-27 HP-17: ACP client role, live conformance probes, cross-vendor review rule,
    container remoting for native tools.
20. `service` HP-32 HP-07: agent-as-model endpoint, TypeScript SDK, steering from chat, SDK, ACP and
    Studio.
20b. `mcp-more` HP-31: MCP prompts and sampling.
20c. `editor-ci` HP-32: VS Code extension from scaffold, Action that runs suites.
21. `connectors` HP-34: Jira, ServiceNow, Teams, live SIEM push.

Wave 6, experience (each walked in a browser, 1440 and 390 px)
22. `ux-audit` HP-45: a read-only walk of first run, console, A4 and chat by a tester, producing
    keyed findings; seeded with the open lists below. Run early, right after lane 1, so its
    findings shape the later lanes.
23. `first-run` HP-46: a new workspace reaches a working governed task without hand-signing configs.
24. `console-new` HP-47: pages for evolve, harness diff, rewind, signatures, validation package and
    monitoring; pictures before text.
25. `console-debt` HP-48: light theme (C-28), codes and plan keys still shown to people, pack
    remembered per browser, Activate page load time, the rest of C-27.

UX gaps
- HP-45 No audit of the experience was part of this comparison.
- HP-46 A fresh workspace denies tools until configs are signed; bare `amc` folders only simulate.
- HP-47 The capabilities in waves 1 to 4 have no pages.
- HP-48 Open items from 2026-11-17: C-28, visible codes, per-browser state, slow Activate page,
  Activate never completed with a real deployment.

## Not building, with reasons

- Vector retrieval over code and agent frameworks: 0 of 11 systems use them (survey R15, R16).
- A2A: one adopter, demand unproven (R13).
- A yolo mode.
- An LLM reviewer that can approve. `ToolGuard` has no allow value by design; a reviewer may only
  deny or escalate to a person, and that is part of lane 9, not a new approver.
- A multi-agent swarm. Sub-agents stay in process (R12).

## For Sid

- Lane 15 adds a place where a second person types a password on the first person's screen. It is
  built opt-in behind a signed policy and stays off until he turns it on.
- Lane 8 needs a decision on where the organisation key pin lives on managed machines.
- Windows confinement stays a stated limit in this plan.
