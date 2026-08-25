# ADR-0013 — P4.1: the tool registry and execution pipeline

Status: accepted · Date: 2026-08-25 · Implements ADR-4 · Follows [ADR-0012](0012-guard-contract-and-signing-cost.md)

## What this closes

AMC's core promise is governed agent execution. Until now the governance and
the execution were in different places: the firewall, budgets and the signed
`tools.yaml` allowlist each had an opinion about whether an action should
happen, and each of them was reported by a command somebody had to run. The
toolhub server enforced its own allowlist; nothing enforced the other two on
the path a tool call actually took, because there was no such path.

There is one now: `visibility → freeze arguments → approval → guards → body →
filters`.

## The two properties everything else follows from

**Guards cannot allow.** `ToolGuard = (execution) => string | undefined`.
Returning a string denies; returning `undefined` means "leave unchanged", not
"allow". Because the type has no allow inhabitant, no ordering of guards can
turn a denial back into permission — monotonicity is a property of the type
rather than a rule the pipeline has to remember, which is the only version that
survives someone adding a guard next year. Restrictions narrow the same way:
`deny` beats `allow`, and two restrictions intersect.

**Failure facts stay in separate fields.** `exitCode`, `timedOut` and `denied`
are independent. A killed process reports a timeout AND exit 143. A denied call
has `exitCode: null`, because a call that never ran has no exit status and a
sentinel there would make "denied" indistinguishable from "exited 126" in
six-month-old evidence. An HTTP 404 is a body and a status, never an exit code.

## Approval runs BEFORE guards, deliberately

Approval asks whether a human wants this. A guard states that policy forbids
it. Ordered the other way, a granted approval would overturn a policy denial —
precisely the laundering the guard type exists to prevent. So: approval is a
pre-execute concern, guards are the last word, and no approval reaches past
one. `tests/toolPipeline.test.ts` pins it, and reordering the two stages turns
that test red.

Approval is also three-valued. `unavailable` denies — an approval nobody
answered is not a grant — and a composition that requires approval for an
action class while supplying no answerer denies rather than treating an
unanswerable question as yes.

## Arguments are frozen, and lossy ones are refused

`freezeToolArguments` detaches and deep-freezes. A guard that could edit
arguments would have the pipeline decide on one call and run another, and the
evidence would describe the first.

It also rejects values `JSON.stringify` would silently mangle — `NaN`,
`undefined` members, functions. Recording arguments that differ from the ones
the tool ran is worse than refusing the call.

## Porting the executors was the risky part

`fs`/`git`/`http`/`process` now exist as pipeline tools that call the SAME
executors the toolhub server calls, so there is one implementation of "write
this file". Their names and action classes match the signed `tools.yaml`
entries exactly, because `toolhubAllowlistGuard` resolves definitions by name
and the budget guard meters on the class — a rename would silently detach a
tool from the policy governing it.

The allowlist itself is a guard, not something reimplemented inside the bodies.
Without it the port would have looked like a migration and been a hole: path
globs, host allowlists, binary allowlists and argv deny patterns all lived in
the toolhub server. `validateToolRequest` already returns `{ok, reason}` —
deny-only — so it composed without adaptation.

Three deliberate widenings beyond what the underlying engines say on their own:

- An unverifiable **budgets** config denies EVERY action class, not the three
  the consequence model freezes. "We cannot tell what the limits are" is not a
  reason to permit reads.
- An unverifiable **tools** config denies everything. An unverifiable allowlist
  is not an empty one and certainly not an absent one; deleting a `.sig` must
  never widen what may run.
- A registered tool the signed config does not name is denied under
  `denyByDefault`. Otherwise registering a tool would be the same as
  authorising it.

And one narrowing: a SIMULATE call is never denied for budget, because
`budgetUsageSnapshot` only counts EXECUTE and a guard that disagreed with the
meter it reads would be reporting a limit nobody spent.

## Verification

39 tests across three files. Every property was mutation-verified — the rule
was broken, the test confirmed RED, the source restored — over 21 mutations.
Five of them initially survived, and each survivor was a real gap rather than a
false alarm:

- a permissive-guard short-circuit, an `allow`-list that never narrowed,
  `denyByDefault` ignored for unknown tools, an unverifiable tools config
  waved through, and an HTTP status written into `exitCode`.

Two more mutations were badly written (they renamed a property without
changing its behaviour) and were rewritten before they could be mistaken for
coverage.

## What is not here

`ctx.tools` is composed as `ctx.amcTools` (`src/kernel/services/toolServices.ts`)
with fiber-bound registration, so an unloaded plugin stops being consulted. The
pipeline is not yet wired into `amc agent` — that is the P4.1 rollback gate,
and the loop still calls tools its old way until the substrate under it (P4.2)
exists. Evidence recording is an injected `record` callback rather than a
hard-wired ledger write, which keeps `src/tools/` free of workspace-package
imports; wiring it to the session spine belongs with that same step.
