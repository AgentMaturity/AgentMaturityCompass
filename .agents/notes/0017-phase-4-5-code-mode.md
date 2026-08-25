# ADR-0017 — P4.5: Code Mode, and where its boundary actually is

Status: accepted · Date: 2026-08-25 · Follows [ADR-0016](0016-phase-4-4-sandbox.md) · Completes Phase 4

## The question that had to be answered before any of it was designed

Code Mode runs a model-written program. dsh runs it in a worker thread. So:
**is a worker thread a security boundary?**

Measured, not assumed. A Node worker was asked to do the things a hostile
program would:

| attempt | result |
|---|---|
| `require("node:fs").writeFileSync` outside the workspace | **SUCCEEDED** — file created |
| `require("node:child_process").execSync` | **SUCCEEDED** |
| `require("node:net").connect` | available |
| `process.exit` | available |
| read `process.env` with `env: {}` | 0 keys — this one holds |

So a program that ignores the `tools` binding and calls the filesystem directly
is governed by **nothing** in the worker. `vm` is no better; Node's own
documentation says it is not a security mechanism. dsh reaches the same
conclusion in its own notes: *"The worker is an isolate, not a jail… `env: {}`
removes ambient CREDENTIALS, not capability."*

Then the second measurement, which is what makes the phase shippable: **the
P4.4 Seatbelt profile covers worker threads.** A worker's write outside the
workspace is refused with `EPERM`; a write inside succeeds.

## So the architecture is three boundaries, and only one of them is security

- **The worker** is a **fault** boundary: fresh per run, so a program that
  crashes, spins or exhausts memory takes nothing with it.
- **The sandbox (P4.4)** is the **security** boundary. It is the only thing
  standing between a program that bypasses the SDK and the filesystem.
- **The tool pipeline (P4.1)** is the **governance** boundary, and it applies
  only to calls that come through `tools.name(args)`.

`CodeModeRunner` therefore **refuses to run unconfined**. Not a warning, not a
flag with a permissive default: running a model-written program without the
sandbox is running ungoverned code with a governance story attached to it. P4.4
is a precondition of P4.5, which is why the phase order in the plan is right
even though I inverted its sub-steps.

There is a test asserting the bypass *works* — that a program calling
`node:fs` directly does write the file. It is deliberately phrased as
documentation: if it ever fails, a Node release has changed something
fundamental, and the sandbox-is-the-boundary argument should be re-examined
rather than quietly assumed to have become unnecessary.

## The governance claim, and the one line that carries it

A sub-call is dispatched back through the **same** `ToolPipeline`, carrying the
enclosing execution's token as `parentToken`. Guards, approval, budgets and
evidence apply to a code-dispatched call exactly as to a direct one — by
construction, not by a second implementation kept in step by hand.

A denial goes **back to the program** as a rejected call rather than killing the
run, and it carries the stage and reason verbatim. A program told only "failed"
retries the same call; one told which guard refused it, and why, can choose
something else.

## The collapse

Under `mode: "code"`, a direct call to anything but `run_code` is denied — and
it terminates at execution **creation**, before pre-execute policy and before
guards. A collapsed call can only ever fail, and letting policy observe it
would mean asking a human to approve, and recording an approval for, something
that was never going to run. A test counts guard invocations to pin that.

The predicate matches dsh's exactly: `!nested && mode === "code" && name !==
RUN_CODE_TOOL`, with `nested` derived from the presence of a parent token. A
sub-call is never collapsed — collapsing those would leave code mode able to
call nothing at all.

## The name is reserved, which the first version got wrong

dsh rejects registering or shadowing `run_code`, and rejects `restrict()`
naming it. My first version let any plugin register it — and under code mode
that name is the only thing callable directly, so whoever holds it becomes the
transport every dispatch flows through, able to see and rewrite every sub-call
a program makes. It now enters through one door, `defineCodeTransport`, and the
door closes behind it.

Restricting the transport is refused as a category error: denying it under code
mode leaves an agent able to call nothing, and allowing it says nothing about
what the program may then dispatch — which is decided per sub-call anyway.

## Hostile traffic on the port

A program can reach `parentPort` itself and post anything, so the compile-time
message type is worthless at that boundary. Two rules, both from dsh and both
tested by posting forged traffic from inside a real program:

- **Every call id is answered at most once.** A forged duplicate would let one
  call's result be delivered as another's.
- **Junk is dropped, never thrown on.** A throw in the host's message listener
  takes down the **host**, not the worker that sent it.

**A bug the second of those found in my own code.** I read `.kind` off the
incoming message before checking it was an object, so a posted `null` threw
inside the listener. And the first version of the test *passed anyway*, because
the crash surfaces as an unhandled rejection that leaves the program's own
result intact. The test now installs an `unhandledRejection` watcher and
asserts it stayed empty — without which the mutation "remove the null guard"
stayed green.

## Budgets, and which thread they live on

The wall-clock timer runs on the **host**. A spinning program never yields, so
nothing inside the worker can time itself out — the timer has to live where the
program cannot starve it. Verified against `while (true) {}`.

Also bounded: total tool calls, and the byte size of the returned result. The
environment is `env: {}` — a program that can read the host's environment can
read every credential the host holds, and has no legitimate need for any of it.

## Known-weaker than dsh, stated rather than implied

- **No busy/compute budget.** dsh polls `worker.performance.eventLoopUtilization()`
  from the host at a 25ms cadence, which catches a hot loop that also parks a
  decoy dispatch. Wall-clock alone catches the spinning case tested here; the
  compute budget is the finer instrument and is not built.
- **`worker.terminate()` ends the thread only.** OS processes the program
  spawned survive it. dsh records the same gap. The P4.2 substrate has
  process-group kill; nothing wires it to a program's descendants yet.
- **No byte accounting on intermediate binding traffic** — only on the final
  result. A program can move large values through tool calls without charge.
- **No captured-intrinsics hardening of the JSON codec.** dsh snapshots ~25
  intrinsics so a program replacing `Array.isArray` cannot steer the validator.
  This runner captures `JSON.stringify`/`parse`, `Promise` and `Map` in the
  worker bootstrap, which covers the protocol path it actually depends on, and
  does not go further.

## Verification

23 tests, 15 mutations, all caught after one survivor was closed — the null
guard, whose test had been passing while the host crashed.

Phase 4 is now complete except the two sub-steps blocked on CI lanes: P4.4a
(Linux) and P4.4c (Windows).
