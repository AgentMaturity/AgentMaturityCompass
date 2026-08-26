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
