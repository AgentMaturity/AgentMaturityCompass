# ADR-0018 — Wiring Phase 4 into the agent loop

Status: accepted · Date: 2026-08-25 · Follows [ADR-0017](0017-phase-4-5-code-mode.md)

## What this closes

Everything Phase 4 built was correct, tested, and reachable only from tests.
The loop still offered `echoTool`, whose own header says it is "a demonstration
tool with side effects, mounted before the pipeline that governs side effects
exists". Phase 4 was five phases of governance that no agent ran through.

The socket was already there. `AgentToolSeam` (P3.2) splits ORDER and EVIDENCE
— the loop's job — from EXECUTION, and `ToolCallRequest` already carried
`parentToken` marked "set for a sub-call dispatched from inside a running
program (P4.5)". So this is a connection, not a redesign.

## Three things the wiring found

**1. Tools had no published parameter schema.** `ToolDefinition` carried name,
action class, description and body — everything except the one thing a model
needs to call it. The built-ins validated arguments with zod *inside* the body,
so a wrong call failed at execution rather than being impossible to formulate.
`parameters` is now published per tool, and a tool without one is **omitted
from the catalogue** rather than advertised uncallably. That also gives a
deliberate way to register a tool only other code dispatches.

**2. The first-run blocker was one config, not two.** ADR-0015 recorded that a
fresh workspace needs `amc tools init` *and* `amc firewall enable`. Checked
rather than assumed: `initWorkspace` already writes and signs `tools.yaml`. The
real blocker is the firewall policy alone — plus a different failure the
original note missed, an allowlist signed by an older `init` that predates
these tools, where the config verifies, the guard consults it, and every
built-in is denied for not being listed. Readiness names whichever applies.

**3. A third instance of the name-keyed policy bug.** `validateToolRequest`
applies argv deny-patterns only to the literal name `"process.spawn"` — the
same shape as the host allowlist reaching one identifier (`"http.fetch"`, found
in P4.3) and the path globs reaching two (`"fs.read"`/`"fs.write"`). So a
`bash` entry declaring `argvRegexDenylist` was **dead config that reads as
policy**. The allowlist guard now applies deny patterns generically to a tool's
string arguments. The underlying name-keying in `toolhubValidators` remains and
should be fixed at the source.

## A scope creep I caught and reverted

To make `bash`, `glob`, `grep` and `fs.edit` work, they had to be added to the
shipped allowlist — an unlisted tool is a tool that does not work. While there,
I also widened `fs.read` from `./workspace/**` to `**` and `fs.write` from
`./workspace/output/**` to `**`, reasoning that an agent asked to work on a
repository works in the repository.

Three existing tests failed. Two were counting the default tool list, which is
expected. The third was `amc1476ProviderSteerOutcome`, whose subject is *a path
outside the allowlist gets corrected into one inside it* — and my widening had
erased the case entirely.

That test was not stale. It was telling me I had moved a published security
default as a side effect of making tools reachable, in a product whose whole
claim is that policy is enforced rather than described. **Reverted.** `fs.edit`
takes `fs.write`'s scope rather than a wider one, and the wiring **surfaces**
the configured write scope instead — `readiness.writeScope`, printed by
`amc agent-loop run --tools workspace`. An operator who wants an agent editing
a whole repository widens it deliberately, which is a decision on its own
merits; they just cannot make it without being told what they currently have.

## What is composed, and why together

`agentToolset()` assembles the built-ins, all four guards, the pipeline, the
sandbox check and (under `mode: code`) the transport, in one function. The
pieces are only safe together: the tools without the guards are an ungoverned
filesystem, the guards without the signed configs deny everything, and Code
Mode without the sandbox is a program that can bypass the tool binding
entirely. Assembling them per call site is how one eventually gets left out.

Code Mode is given the **measured** confinement answer, not a hopeful constant.

Guard order is a reporting choice, not a semantic one — guards cannot allow, so
whichever denies first is simply the one named. The policy engines come before
the allowlist so a denial reads as "the firewall stopped this" rather than
"this tool is not listed", which is the more actionable of two true answers.

Writes are **exclusive**, reads **parallel**. Two writes in one step are not
something the model knows are concurrent: read-before-edit would see one land
between another's check and its write, and the file is neither edit the model
asked for. An unknown tool is exclusive too — it is about to fail, and letting
it overlap buys nothing while making the failure harder to place.

## Verification

18 tests driving the seam the loop actually calls, against real signed
workspace state. 13 mutations, all caught after two survivors were closed:

- every registered tool happened to publish a schema, so the filter that omits
  unschema'd ones was never exercised;
- the pre-abort check was masked by a second abort check after the call, so a
  cancelled call that RAN still reported CANCELLED. The test now asserts the
  file was not written, not merely that the verdict was right.

**One mutation is not distinguishable on this machine and is recorded rather
than faked.** Forcing Code Mode's `confined` to a constant `true` changes
nothing here, because this machine genuinely is confined — the measured value
and the constant agree. Forcing it to `false` *is* caught. The asymmetry is
inherent to testing a measurement on a machine where the measurement is true.

## Still open

`--tools workspace` is opt-in, and `echo` remains the stub-route default:
spending an operator's tokens to exercise the real toolset is not a default
anyone would choose. Making the governed toolset the default for a configured
provider is a separate decision, and it should wait until the loop has been run
against a real provider more than a handful of times.
