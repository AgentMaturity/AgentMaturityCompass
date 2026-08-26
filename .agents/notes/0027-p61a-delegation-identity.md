# ADR-0027 — P6.1a: a child is governed as its root, never as itself

Status: accepted · Date: 2026-08-26 · Opens Phase 6 · Follows [ADR-0026](0026-p53-one-redaction-table.md)

## Two escapes, measured before writing any subagent code

P6.1a asks for in-process subagents — `ctx.subagents`, spawn/fork, continuable
children, `maxDepth`. Before designing the API, two things in the existing tree
were measured, because both decide what the API is allowed to be.

**AMC keys budgets by `agentId`.**

    budgetForAgent(config, agentId):
      const explicit = config.budgets.perAgent[agentId];
      if (explicit) return explicit;
      return config.budgets.perAgent.default ?? null;

An unknown id falls back to the `default` **limits**, while
`budgetUsageSnapshot(workspace, agentId)` counts **usage** filtered by
`meta.agentId === agentId` — zero for a name nothing has spent under. So a run
under a fresh id gets full limits and no spend: a complete, unspent budget.

**AMC keys guard scopes by `agentId` too.** `ToolRegistry` resolves a scope layer
with `this.scopes.get(execution.agentId)`, and scopes are where guards NARROW
what the global layer allows — the registry's own comment says guards "compose by
NARROWING". A run under an unknown id gets the global guards and none of the
narrowing.

**Neither is a bug today.** A person running `amc agent --agent x` is meant to
get agent `x`'s budget and agent `x`'s scope. They become bugs the moment a run
can spawn a child that picks its own id, because then "spawn a child" is how you
reset a budget and shed a restriction — a privilege escalation dressed as
delegation, and the second one is the worse of the two: a child would be *less*
restricted than its parent.

## The design consequence

The identity a child is GOVERNED as is inherited, never chosen.

    governedAs   the id budgets and guard scopes key on — always the ROOT's
    runAs        this run's own name; evidence and reporting only
    depth        0 at the root
    parent       the parent's runAs, or null

`delegateTo(parent, childRunAs, maxDepth)` copies `governedAs` from the parent
and takes `runAs` from the caller. There is no path on which a child names what
governs it. That one line is what the module exists to hold, and the mutation
that changes it to `governedAs: runAs` turns three tests red.

## Refusal is a value, not an exception

`delegateTo` returns `{ok: false, reason}` rather than throwing. A parent that
asked for one child too many gets a reason it can put in an evidence row; a
thrown error is something a caller can swallow. The tests pin that a refusal
carries enough text to be auditable rather than a bare `false`.

`chainOf` returns only what one identity can actually know — a child knows its
parent, not its grandparent. It is used for the refusal message, not as an audit
record. The signed handoff packets are the audit record.

## The budget test is not vacuous

Asserting "the child resolves the root's budget" would pass on a broken
implementation if both names happened to resolve the same thing. So the test also
asserts that a child-NAMED lookup resolves something **different** from the
root's. If that ever stops being true the escape has gone away on its own, and
the test says so rather than passing quietly.

## Verification

10 tests, 4 mutations all caught: a child governing as itself (3 red), the depth
limit removed (2), `maxDepth: 0` not disabling delegation (1), and depth never
incrementing (4).

Full suite **10,075 / 10,075** across 1,249 files. `lint`, `typecheck`,
`check:architecture-boundaries`, `check:counts` pass.

## What this is not yet

This is the identity primitive, not the subagent mechanism. Still to build for
P6.1a:

- **`ctx.subagents`** — there is no `ctx` object in the loop today. `AgentDriver`
  and its `AgentDriverInit` are the composition point, and `AgentDriver` already
  owns a `LoopInbox` with signed `next-turn`/`next-step` lanes, so a child is a
  nested driver whose inbox is genuinely its only mailbox.
- **The evidence story.** `EvidenceEventType` already declares
  `agent_delegation_started`, `agent_delegation_completed`, `agent_handoff_sent`
  and `agent_handoff_received`, and `src/fleet/orchestrationDag.ts` is the only
  file that references them. `src/fleet/handoffPacket.ts` has zod-schema'd signed
  packets. **None of it is wired to the live loop** — verified: nothing under
  `src/agent/` or `src/tools/` references `handoffPacket` or `trustInheritance`.
  So P6.1a is "build the mechanism and wire the existing evidence layer in", not
  "wire it up".
- **Enforcement.** The identity type makes the safe thing expressible; it does
  not yet make the unsafe thing impossible. A spawn path that ignores
  `governedAs` would still compile. The tests that matter next are the ones that
  run a real child and assert it was metered against the root.

---

# The packet that authorises a child

## `createHandoffPacket` degrades quietly, and for a delegation that is wrong

    let signature = "unsigned";
    try { signature = signHexDigest(...); } catch { /* unsigned */ }
    writeFileAtomic(handoffFilePath(workspace, packetId), ...);

The file is written either way, and `verifyHandoffPacket` reports it invalid
later — `verifyCanonicalBodySignature` returns false the moment it sees
`"unsigned"`.

For a handoff between two operators that deferral is survivable: someone verifies
before accepting. For a DELEGATION it is not. The packet is what authorises the
child to run, so discovering it never verified **after the child has executed** is
discovering it too late.

`mintDelegationPacket` therefore fails at mint time and **leaves no file behind**.
An unsigned packet on disk is worse than no packet: a later reader finds a record
of an authorisation that never held.

It reuses `createHandoffPacket` rather than inventing a second format, because
that record is already zod-schema'd, canonically signed, receipt-bearing, and the
thing `amc fleet handoff verify` already knows how to check. A delegation-only
dialect would be a second unverifiable format.

## The orphan test earned its place immediately

The first version rebuilt the packet path locally as `.amc/fleet/handoff/…`. The
real layout is `fleetRoot(workspace)/handoffs/…` — plural, different parent — so
the cleanup silently deleted nothing and the orphan test failed on the first run.

The fix was not to correct the guess but to stop guessing: `handoffPacket.ts` now
exports `removeHandoffPacket`, because the module that owns the layout is the one
that should be able to undo its own write. A duplicated path is a latent bug the
moment either copy moves, and a stale copy here would leave exactly the orphan
the branch exists to prevent.

## What the packet records, and what it does not

`fromAgentId`/`toAgentId` carry the two runs' OWN names, because that is what the
packet is a record of. `governedAs` and `depth` travel in `constraints`, so a
reader can see both ends are metered as the same root. A packet whose ends
disagreed would be a delegation across a governance boundary, and minting refuses
it — belt to `delegateTo`'s braces, since a hand-built identity could otherwise
reach the packet.

`delegationScope` is recorded as the parent's declared intent. It is **not** the
enforcement point — guards are — and the module says so rather than implying
otherwise.

## Verification

6 tests, 4 mutations all caught: the orphan not removed, the signature check
removed (3 red), the cross-governance check removed, and `governedAs` not
recorded on the packet.

Full suite **10,081 / 10,081** across 1,250 files. `lint`, `typecheck`,
`check:architecture-boundaries`, `check:counts`, `check:docs-drift` pass.

## Findings from the parallel scouting run, verified before use

- **`src/score/orchestrationDAG.ts:114`** penalises `maxDepth > 5` with "Deep
  orchestration chain increases latency and failure risk". AMC says this **in its
  scoring engine, about other people's systems**, and enforces no depth limit on
  its own execution path. That also settles whether
  `DEFAULT_MAX_DELEGATION_DEPTH = 3` is defensible: it is stricter than what AMC
  asks of everyone else.
- **`LoopEventRecord` is a closed union** (`loopEventMeta.ts:169`, "Closed: a new
  one is a deliberate change") written through one seam,
  `SessionService.recordLoopEvent`. That is the cheapest honest place for a
  delegation row — one union member plus one builder branch, keeping the single
  writer and the per-session envelope chain.
- **The report channel already exists.** `ToolCallOutcome.additionalContext`
  routes tool-produced text into the parent's durable inbox
  (`toolSeam.ts` → `toolCalls.ts` → `agentDriver.ts` → `inbox.insert("next-step",
  …)`). A child's report does not need a new channel.
- **A third same-name trap.** `src/fleet/trustInheritance.ts`'s
  `computeInheritedTrust` has no production caller, while a **different function
  of the same name** at `src/score/crossAgentTrust.ts:348` is wired to the API —
  which makes the fleet version look wired when it is not. Same class as the two
  `ratioIncrease` functions found in P5.2b. Not wired here: it is a scoring
  input, and making trust math load-bearing for execution is not what it was
  designed for.
- **`appendDagNode`/`createDag` have zero call sites**, and `SESSION_EVENT_TYPES`
  (`sessionTypes.ts:14`) is dead and already stale (omits `loop/retry`). Both
  recorded as debt rather than touched here.

---

# The spawn path — where the identity becomes enforced

## The escape is now a failing test

`spawnSubagent` hands its runner a `toolsetAgentId`, and it is always
`identity.governedAs`. That single line is the whole governance story, and the
mutation that changes it to `identity.runAs` turns two tests red — one asserting
the id directly, one resolving it through the real `budgetForAgent`.

The second is written so it cannot pass vacuously: it also asserts that a
child-NAMED lookup resolves something **different** from the root's. If the two
ever stop differing, the escape has closed on its own and the test says so rather
than passing quietly.

A pointer now sits at `agentToolset.ts`'s `const { workspace, agentId }` naming
both mechanisms and the file that must not be bypassed. The dangerous failure is
not a maintainer deliberately choosing `runAs` — it is one adding "the child gets
its own toolset so it can have a narrower filter" and passing `runAs` because
that reads more natural.

## Order is the safety property

    refuse → authorise → announce → run → account

- A depth refusal writes **nothing**: no packet, no row.
- An unsignable packet leaves **no file and no row** — an authorisation that
  never held must not be discoverable as a record.
- `delegation-started` is written **before** the child runs, so an unmatched
  `started` is the honest signature of a parent that died mid-delegation. Crash
  repair must not synthesise the missing half.
- `delegation-completed` is written for **every** announced child, including one
  that failed or threw. The cases that most need an account — a refusal, a token
  ceiling, a cancellation — are exactly the ones where the child never got to
  report, so a "do not duplicate when the child already reported" optimisation
  would drop the account precisely in the failure modes it exists for.

Each of those four is a mutation that turns the suite red.

## The child's words stay the child's

`SubagentOutcome.childText` carries what the child said; the
`delegation-completed` row carries `settledAs` and a one-phrase `reason` that are
the RUNTIME's account. A test asserts the runtime's account does not contain the
child's text. Merging them would credit the child with a summary it never wrote —
and in a signed log that misattribution is permanent.

## Why the child's executor is injected

Running a real child needs an LLM, a route and a session. Injecting the runner
keeps every governance property — depth, signing, the toolset id, the evidence
pair, the ordering — testable without a model, which is what makes them testable
at all. Wiring a real `AgentDriver` into that seam is the next sub-step, and it
changes none of the properties above.

## Two delegation rows in the closed union

`LoopEventRecord` gained `delegation-started` and `delegation-completed`, written
through the same single seam as every other control row, with literal key order
as the hash pre-image. They use the `agent_delegation_started` /
`agent_delegation_completed` types that `EvidenceEventType` has declared all
along and that, until now, **nothing wrote**.

The builder refuses two spellings outright: a delegate at depth 0, and a
completion with a blank reason — an outcome with no reason is not auditable.

## Verification

10 spawn tests, 5 mutations all caught: the escape itself (2 red), the
announcement removed (3), the completion removed (4), `maxDepth` ignored (1), and
the child's words leaking into the runtime's account (2).

Full suite **10,091 / 10,091** across 1,251 files. `lint`, `typecheck`,
`check:architecture-boundaries`, `check:counts`, `check:docs-drift` pass.

## What P6.1a still owes

- **A real runner.** The seam is injected and unwired; no `AgentDriver` runs
  behind it yet, so no child has actually executed. Every property above is
  proven about the governance, not about a running child.
- **`ctx.subagents`.** There is no `ctx` in the loop. The scouting run corrected
  my earlier "there is no ctx counterpart" — `ToolExecution` and `StepRunnerInit`
  ARE the context objects; what `ToolExecution` lacks is service handles, and the
  established workaround is closure capture at registration, as `agentToolset`
  already does for the registry, pipeline and ledger. A `delegate` tool bound
  that way is the shape.
- **Continuable children.** Nothing resumes a child yet. `LoopInbox` is safe to
  instantiate per child provided each child gets its own `SessionService`, which
  is the constraint that sub-step has to respect.
