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

---

# The real runner — a child that actually executes

P6.1a's Verify criterion is "a parent delegates to a continuable child that
reports back; every delegation carries a signed handoff packet." Everything up to
here proved properties about the governance with the child's executor stubbed.
`createDriverRunner` puts a real `AgentDriver` behind that seam.

## Writing the end-to-end test found a bug in my own reasoning

The first version of `subagentRunner.ts` took the parent's `LoopLlm` directly, and
its module comment explained at length why reusing it was correct.

It was not. `LlmRuntime` captures a session at construction and calls
`prepareRequest(this.init.session, …)`, so a child sharing the parent's runtime
writes its `request/header` and `request/response` rows into the **parent's**
session — two runs interleaved in one hash chain, and the child's provider traffic
attributed to its parent.

The runner now takes `makeLlm(session)`: the parent supplies the registry,
credentials and transport it already composed, and the child gets its own runtime
bound to its own session. The child still cannot pick its provider or route —
those come from the parent — but its evidence lands where it belongs. The route,
by contrast, genuinely is a plain value and is passed straight through.

A test asserts the split directly: the child's session has `request/header` rows
and the parent's has none.

## Three things make the child governed, and all three are now end-to-end

1. **Its session is opened with the root's id.** This is the one that actually
   closes the budget escape: `budgetUsageSnapshot` counts spend by filtering
   `meta.agentId`, so what matters is the id on the rows the child really wrote,
   not merely the id handed to its toolset. Asserted against the ledger.
2. **Its toolset is built with the same id**, so guard scopes resolve to the
   parent's narrowing rather than an empty layer.
3. **Its session id is the one the parent already announced**, supplied rather
   than generated, so `agent_delegation_started` names the session the child
   really wrote. The mutation that lets the runner generate its own id turns
   three tests red.

## Two refusals the runner adds

- **`driverStatus === "failed"`** is terminal: the spine refused a `turn/end` or
  `turn/seal`, so the child's log has an open turn nothing may build on. The
  child's text may look complete; the run it came from is not.
- **`unsignedRows > 0`** — the field documents itself as "zero is the only
  acceptable value". A child whose evidence is unsigned produced words with no
  provenance, and handing those to a parent that will quote them would launder
  them into the parent's own signed log.

## A schema quirk worth recording

The `sessions` table has no `agent_id` column. `SessionService.open` explains
why: "a natively-run agent has no separate binary, so `binary_path` records the
agent id and `binary_sha256` the composition it ran under." The first version of
the ownership assertion guessed `agent_id` and failed on a missing column — the
second reads `binary_path`, with the reason written next to it.

## A shared helper, exported rather than copied

`scriptedAdapter`, `FixedCredentials` and `silentTransport` were private to
`tests/helpers/agentLoopHarness.ts`. They are now exported: duplicating a stub
adapter into a second test file is how two "identical" stubs drift into
disagreeing about what a provider does.

## Verification

4 end-to-end tests against a real driver, 4 mutations caught with a no-op control
that correctly stayed green: the child's session owned by `runAs` (1 red), the
runner generating its own session id instead of the announced one (3), and the
child's text dropped (1).

Full suite **10,095 / 10,095** across 1,252 files. `lint`, `typecheck`,
`check:architecture-boundaries`, `check:counts`, `check:docs-drift` pass.

## Where P6.1a now stands

Met: a parent delegates, a real child executes, the child reports back in its own
words, and the delegation carries a signed packet with a started/completed pair
in the parent's log.

**Not met: "continuable".** Nothing resumes a child. `whenIdle()` runs it to
completion inside the tool body and the session closes. A continuable child needs
its session left open, its driver held, and a resume path that posts into the same
`LoopInbox` — which the inbox already supports, since it replays from its own
signed rows. That is the next sub-step.

Also still absent: **`ctx.subagents`.** Nothing calls `spawnSubagent` from inside
a running loop yet. The shape is a `delegate` tool bound by closure capture at
registration, the way `agentToolset` already binds its registry, pipeline and
ledger — which is also what would give the child's report its route back into the
parent through `ToolCallOutcome.additionalContext`.

---

# Continuable children

## The evidence decision that shapes everything else

A child that can still be asked something has not finished. So a continuable
child's `delegation-completed` is **deferred** until the parent releases it —
writing the completion when its first turn went quiet would close a delegation the
parent can still talk to, and the log would say it ended while it was running.

A parent that never releases leaves an unmatched `delegation-started`. That is not
a leak to paper over: it is the honest signature of a delegation nobody ended, and
a test asserts it survives rather than being tidied away.

The handle's `close` is idempotent, because a parent may release a child on a path
that also unwinds and two completion rows would make the log say it ended twice.
The first settlement stands; later ones are dropped.

## The cursor `readAgentRunSummary` forced

`readAgentRunSummary` folds the WHOLE session. Without a cursor, a second
continuation hands the parent everything the child has ever said — the first
answer quoted back as if it were the new one. The runner tracks how much has been
reported and returns only what is fresh. The mutation removing that cursor turns
the "reports only what the child said THIS time" test red.

## A surviving mutation, resolved by testing one guard and deleting the other

Mutation testing found `released` checked in two places and only one
distinguishable:

- **`drain`'s guard is real.** `SubagentContinuation` is on the runner's own
  result, so a caller can hold it without going through the handle. Without the
  guard that caller gets an opaque failure from a closed session instead of a
  refusal it can act on. It now has a test that reaches the runner directly, and
  removing the guard turns it red.
- **`release`'s early return was decoration.** Measured rather than reasoned
  about: `SessionService` already refuses a second close with "SessionService used
  after close()" and writes exactly one `session/close` row. A guard there sat
  next to a protection that already covered the case. Deleted; the flag stays
  because `drain` needs it.

That is the rule this codebase keeps re-learning, applied in both directions in
one change: test it if it is real, delete it if it is not.

## Verification

9 continuation tests, 6 mutations: completion not deferred (7 red), close not
idempotent (1), the report cursor removed (1), the child torn down despite being
continuable (3), the drain guard removed (1 — after it was given a test), and the
release early-return, which survived and was deleted rather than kept.

Full suite **10,104 / 10,104** across 1,253 files. `lint`, `typecheck`,
`check:architecture-boundaries`, `check:counts`, `check:docs-drift` pass.

## P6.1a's Verify criterion is now met

"A parent delegates to a **continuable** child that reports back; every delegation
carries a signed handoff packet." All of it, against a real `AgentDriver`:

- the parent delegates, and a depth-bounded child is authorised by a packet that
  cannot be unsigned;
- the child runs, governed as its root, in its own session;
- it reports back in its own words, kept separate from the runtime's account;
- it can be asked again through the same inbox, in the same session;
- and the delegation is announced and accounted for in the parent's signed log.

## What remains before P6.1b

**`ctx.subagents` — nothing calls any of this from inside a running loop.** The
whole path is exercised by tests, not by an agent. The shape is a `delegate` tool
bound by closure capture at registration, the way `agentToolset` already binds its
registry, pipeline and ledger; the child's report would then reach the parent
through `ToolCallOutcome.additionalContext`, which already routes tool text into
the parent's durable inbox.

Two things that sub-step must not get wrong, both already visible:

- **The report must not be concatenated with the runtime's account.** They are
  separate provenance and the parent's log would otherwise record a runtime
  summary as if the child had written it.
- **`drain()` must stay inside the tool body.** `whenIdle()` is per-driver and
  nothing links a child's lifetime to its parent's; an "async spawn" convenience
  would let a child outlive the parent that authorised it, with no lifecycle
  evidence saying so.

---

# `ctx.subagents` — delegation an agent can actually reach

## Why it is a tool, not a context property

There is no `ctx` object in the agent loop and there cannot be one at that layer:
only `src/kernel/**` may import Cordis, enforced by
`scripts/architecture-boundaries-check.mjs`. What AMC has instead is
`ToolExecution` — ids, strings and frozen arguments, no service handles — and one
established way to give a tool body a service: **closure capture at
registration**, which `agentToolset` already uses for its registry, pipeline and
ledger.

So delegation arrives as a `delegate` tool the caller's toolset closes over. That
is `ctx.subagents` under AMC's constraints, not a compromise of it.

## Depth comes from an identity, and that is what makes `maxDepth` real

Every run in a chain shares `governedAs` by design, so `agentId` cannot say how
deep this one is. The capability therefore carries the CALLER's
`DelegationIdentity`, and `subagentRunner` gives a child that may itself delegate
a toolset carrying **its own**.

Without that, `delegateTo` would always be handed the root, every generation
would look like depth 1, and `maxDepth` would be a field nothing enforces — the
exact shape `src/score/orchestrationDAG.ts:114` already penalises in other
people's systems. The mutation that reads depth from `agentId` instead turns two
tests red, one of them a caller already at the limit whose child never runs.

## The two accounts are never concatenated

On success the tool returns the child's OWN words and nothing else; on refusal it
returns the runtime's account and nothing else. The runtime's account of a
successful delegation is not withheld — it is in the `agent_delegation_completed`
row, which is where it belongs. The mutation that prefixes the child's text with
`[amc] delegate reported:` turns the test red.

`ToolCallOutcome.additionalContext` would let the child's words arrive as their
own durable inbox row instead. `pipelineToolSeam` does not plumb it today — the
loop consumes it, the pipeline seam never produces it — so this returns through
the tool result. The separation holds either way, and plumbing it is an available
improvement rather than a prerequisite.

## Two parties must agree, and the tests found this by failing

The first run of these tests met `"delegate" is not in the signed tool allowlist`.
That is correct, and it is now pinned as its own test rather than worked around:

- the **integrator** composes the capability into a toolset (`subagents`, absent
  by default — an agent that cannot delegate);
- the **operator** signs a policy that permits the tool.

Delegation spends the operator's budget on agents they did not start, so one
party enabling it is not enough. `delegate` is deliberately **not** in the default
allowlist.

## Verification

8 tool tests, 3 mutations caught with a no-op control that stayed green: depth
read from `agentId` instead of the identity (2 red), the runtime's account
concatenated onto the child's words (1), and an empty goal accepted (1) — a child
asked to do nothing still costs a turn and still writes a delegation to the log.

Full suite **10,112 / 10,112** across 1,254 files. `lint`, `typecheck`,
`check:architecture-boundaries`, `check:counts`, `check:docs-drift` and
`check:policy-fixtures` pass.

## P6.1a is complete

    ctx.subagents          a `delegate` tool bound by closure capture
    spawn/fork             spawnSubagent, depth-bounded and packet-authorised
    continuable children   a handle whose delegation stays open until released
    inbox is the mailbox   followup() is the only way work reaches a child
    report channel         the child's own words, alone
    maxDepth               enforced from the caller's identity, not decoration
    signed handoff packet  minted or refused; never written unsigned

## What P6.1a still does not do

- **`drain()` stays inside the tool body**, so a delegation blocks its parent's
  step. That is deliberate: `whenIdle()` is per-driver and nothing links a child's
  lifetime to its parent's, so an async spawn would let a child outlive the run
  that authorised it with no lifecycle evidence saying so. Concurrency is a later
  sub-step with its own evidence, not a convenience to bolt on here.
- **No CLI surface.** Nothing in `src/cli.ts` composes a toolset with
  `subagents`, so an operator cannot yet turn this on for a real run. That is the
  smallest remaining gap and the natural first move of P6.1b.
- **The child gets no context from the parent.** Its goal is the whole brief —
  the tool's description says so to the model. Sharing context is a design
  question about what a delegate is allowed to see, not an oversight.

---

# The CLI surface — an operator can turn delegation on

## The composition had to be inverted, and measurement is what showed it

The obvious shape — a `--delegate` flag that builds the capability in the CLI —
does not work. The capability needs three things that do not exist when a caller
builds its toolset:

1. **The parent's `SessionService`**, so the delegation rows land in the log of
   the run that delegated. `ComposedTurnHandle` exposes only `sessionId` and
   `cancel`, so there was no way to reach it.
2. **A way to build an `LlmRuntime` bound to a CHILD's session.** `LlmRuntime`
   captures its session at construction — the bug the end-to-end test found
   earlier — so a child cannot share the parent's.
3. **The rendered system prompt**, which the prompt fiber produces during
   composition.

So `runComposedTurn` builds the capability and hands it over:
`delegation: { maxDepth?, grant(capability) }`. The kernel supplies what only it
has; the caller decides where it goes.

**No new method was needed on the toolset.** `AgentToolset` already exposes its
`registry`, and `seam.schemas()` re-reads it each step by design — "a registry
change between steps reaches the next request". So the CLI's grant is
`toolset.registry.define(delegateTool(capability))`, using a seam that was built
for exactly this.

## One genuinely new seam capability

`LlmSeamService.runtimeForSession(session)` builds a runtime over the SAME
registry and credentials, bound to another session. The registry is shared
deliberately: a child must not be able to reach a provider its parent could not.
Only the session differs.

## The readiness check exists because the grant is two-party

`--delegate` alone is not enough — the operator must also have `delegate` in the
signed tool allowlist. Rather than let the agent discover that by being denied
once per turn, the CLI checks up front and names the fix, in the same style
`checkToolsetReadiness` already uses for the built-ins.

The flag deliberately does NOT add the tool to the allowlist. A command-line
argument that mutates a signed policy would defeat the point of signing it.

## The capability's lifetime is the run's

`recordLoopEvent` on the granted session throws once the run ends
("SessionService used after close()"). That is correct and is pinned as a test: a
delegation announced after the parent's turn ended would have nowhere honest to
record.

## A vacuous test, removed rather than kept

The first draft included "grants nothing when the caller did not ask" with a
counter that nothing incremented — with no `delegation` option there is no
callback to count, so the assertion could never fail. The absence is structural,
not behavioural. It is gone, with a note in its place saying why, because a test
that cannot fail is worse than no test.

## Verification

5 kernel-grant tests, 2 mutations caught: the capability governed as something
other than the run's own agent, and a fresh session in place of the parent's
(2 red). Full suite **10,117 / 10,117** across 1,255 files. `lint`, `typecheck`,
`check:architecture-boundaries`, `check:counts`, `check:docs-drift` and
`check:api-ref` pass.

## P6.1a is now reachable by an operator

    amc agent run --tools workspace --delegate [--max-delegation-depth N]

with `delegate` present in the signed allowlist. What that run gets: a `delegate`
tool that spawns a depth-bounded child, authorised by a packet that cannot be
unsigned, governed and metered as the root, running in its own session, reporting
back in its own words, and announced and accounted for in the parent's log.

## What is still not done

- **No end-to-end CLI test.** The kernel grant and the tool are each tested; the
  `--delegate` flag path itself is exercised only by `tsc` and lint. The existing
  `tests/cliAgentLoopCommands.test.ts` is where that belongs.
- **`drain()` still blocks the parent's step.** Unchanged and deliberate; see
  above.
- **The child still gets no context from the parent.**
