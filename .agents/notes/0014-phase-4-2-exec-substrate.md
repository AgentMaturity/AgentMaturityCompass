# ADR-0014 — P4.2 (part 1): the process-execution substrate

Status: accepted · Date: 2026-08-25 · Implements P4.2 · Follows [ADR-0013](0013-phase-4-1-tool-pipeline.md)

## Everything here was measured, because the flag names lie

The four combinations of `detached` and kill target, on darwin, killing a shell
that backgrounds a leaf:

| `detached` | kill target | leaf survived |
|---|---|---|
| `false` | pid | **yes** — orphaned, not killed |
| `true` | pid | **yes** — same |
| `false` | **group** | **yes** — `ESRCH`; the kill fails and nothing dies |
| `true` | group | **no** — the only combination that reaps |

The third row is the trap: a group kill without `detached: true` throws `ESRCH`,
so code that catches and ignores it *looks* like it terminated a tree while
killing nothing at all.

My first version of this experiment reported that nothing ever survived. It was
wrong: `sh -c` exec's into a single inner command, so the pid I recorded was the
child's own and I was measuring whether the shell died, not whether the leaf
did. The corrected experiment records the leaf's pid and defeats the exec
optimisation.

## `detached: true` costs Ctrl-C, and the cost has to be paid back

Measured: `detached: false` leaves the child in the parent's process group
(`pgid` 52253 for both); `detached: true` gives it its own (`pgid == pid`). A
child in its own group is no longer in the terminal's **foreground** group, so
Ctrl-C stops reaching it. Measured again: an un-forwarded `SIGINT` never
arrives, and a forwarded one does.

So the substrate detaches (required for tree-kill) **and** forwards SIGINT,
SIGTERM and SIGHUP to the child's group. `amc wrap claude` keeps Ctrl-C.
Detaching without forwarding would have silently removed it, and no existing
test would have noticed.

`SIGCONT` rides along with `SIGTERM` for the same class of reason: a process
stopped by SIGTSTP never runs its handler, so it would sit out the whole grace
window and die by SIGKILL — recorded as though it had deliberately ignored the
polite signal.

## What is NOT claimed

`treeExitProven` is a separate field from `exitCode`, and it is honest rather
than optimistic. `kill(-pgid, 0)` answers "is anyone left"; it cannot answer
"who". Enumerating a process group's members needs `/proc` on Linux and a
native `sysctl` on macOS, and this phase adds no native dependency. So the
outcome reports what was actually established — the group was observed empty,
or it was not — and `false` means "not demonstrated absent", never "survivors
exist". Reporting a clean teardown we cannot demonstrate is the false-green
this project keeps finding.

## Two live bugs the reading turned up, both confirmed before fixing

**`versionProbe` handed provider keys to an unvetted binary.** It ran the target
program up to three times via `spawnSync` with **no `env`** — so Node passes the
parent's, including every provider API key — while the real spawn twenty lines
below carefully calls `stripProviderKeys` before running the same program. It
also passed no `timeout`, so a binary that blocks on `--version` blocked AMC
across all three attempts. Now `probeBinaryVersion`: stripped env, 3s per
attempt, stdin ignored, and exported so the guarantee is tested directly rather
than inferred.

**`AMC_EVALUATED_AGENT=1` is the ledger's trusted-writer fence**
(`ledger.ts:305`, `jsonlSessionEventStore.ts:427`) and only `monitor.ts:67`
sets it. The adapters path never does, so an adapter-launched child is not
fenced out of the ledger the way a wrapped one is. Recorded here; the fix
belongs with the fold, which is the remaining part of this phase.

## The collector, and a bug in my own first version

Bounded and scrubbing, because `spawnMonitoredProcess` was neither: every chunk
went to the signed ledger uncapped and unredacted, so a process emitting a
gigabyte wrote a gigabyte of evidence and a key echoed by a child landed
verbatim in the log *and* on the operator's terminal.

Scrubbing across chunk boundaries is the normal case, not an edge case — pipes
chunk on buffer sizes, not on tokens — so the collector holds back the last
`longest_secret - 1` characters. My first implementation cut the buffer and
then scrubbed the prefix, which leaks any secret straddling the cut. That is
not hypothetical: with two secrets of different lengths the carry boundary
lands inside the second one, and the test caught it. It now scrubs the whole
buffer and cuts afterwards.

`droppedBytes` sits beside the text: a consumer reading a truncated tail must
be able to say how much it did not see. The tee is deliberately **not** bounded
— the cap governs evidence, and truncating the operator's terminal too would
let an evidence setting silently change what a command appears to do.

## Scope taken and scope declined

`credentialGuard.ts` states in its own header that AMC has three redaction
engines and **P5.3** owns reconciling them. P4.2's plan text says "converge
it". The code's note wins: this phase gives the subprocess path a scrubber it
did not have, and does not unify the three. Deleting `redactSecretsInText` in
particular would be a security *weakening* shipped as a cleanup, because it has
no minimum length while `credentialGuard` skips anything under 8 bytes.

**PTY is not in this part.** The plan's own rollback is "pipe-only (no PTY)
fallback", and `node-pty` is a native module in a published CLI with eight
runtime dependencies and one native one. That is a packaging decision with
consequences for every install, and it is flagged for the operator rather than
taken quietly. VERIFY criterion 2 (a PTY reaches readiness by evidence ladder)
is therefore **not met by this part** and is called out as outstanding rather
than reported as done.

## Verification

19 tests over real processes — a mocked child proves nothing about operating
system behaviour. 13 mutations, each breaking a rule and confirming RED. Two
initially survived, both the same gap: every collector test pushed only one
chunk past the cap, so the already-full path was never exercised. Fixed with a
second-chunk test, after which both mutations go red.

---

## Part 2 — the fold

`spawnMonitoredProcess` now runs on the substrate. `wrapRuntime`,
`wrapAny` and `superviseProcess` were already thin wrappers over it, so
folding one function folded all three.

**Kept, because things depend on it.** `profileResolver` tells a wrap-style
session from an adapter-style one by counting `stdin` events against
`agent_process_started`, so the event vocabulary — `gateway`/`process_start`,
per-chunk `stdin`/`stdout`/`stderr`, the `runtime_exit_code` metric, the sealed
session — survives unchanged. A fold that tidied the vocabulary would have
silently reclassified every historical session.

**Gained.** Termination (there was no kill path at all), an `AbortSignal` on
every wrapper, bounded ledger writes, output scrubbing, and `terminatedBy` /
`treeExitProven` recorded beside the exit code. `superviseProcess` now scrubs
`AMC_LEASE` — it hands the child a bearer credential, and a child that echoed
it put it in the signed log and on the operator's terminal.

**Bounding without silence.** Output past the 4 MiB-per-stream cap is not
recorded, and hitting the cap emits a `runtime_output_truncated` metric naming
how much went unrecorded. An uncapped log was the old behaviour; a capped log
that says nothing about stopping would be worse than either.

**A spawn failure now seals its session.** Previously the promise rejected
before `sealSession`, leaving a session open forever with nothing in the chain
explaining why.

**The adapters fence.** `AMC_EVALUATED_AGENT=1` is the ledger's trusted-writer
check, and of the three ways AMC launches an agent exactly one — the adapters
path — left the agent able to write to the evidence about itself. Now set.
AMC records from the parent process, so fencing the child costs nothing it
legitimately needed, and the full suite confirms it.

## Two of my own tests were wrong, and the mutations found both

**A test that asserted something the OS cannot report.** I wrote "does not
record stdin the child never accepted" and had `write()` return false when the
child closed its end. Measured, it does not:

| child behaviour | parent's write |
|---|---|
| exits | `ERR_STREAM_DESTROYED`, refused |
| destroys its stdin | **succeeds, no error** |
| ignores stdin | succeeds, no error |

A child that closes or ignores its end is indistinguishable from one reading
normally — the bytes genuinely reach the pipe. So "delivered" is the strongest
claim available, and the test demanded a stronger one. It now pins the case the
OS does report.

The change it prompted is still right: `write()` resolves at the flush
callback rather than returning synchronously, because a synchronous answer is
about the parent's buffer rather than the child.

**A test that passed for the wrong reason.** The monitor-level version of the
same check emitted terminal input after the run had ended. Four separate
mutations left it green — including "record stdin regardless of delivery" and
"never detach the handler" — because by that point the ledger is closed and
nothing could have been recorded either way. It demonstrated nothing beyond
what `ledgerAndDiagnostic` already covers, so it is deleted rather than kept as
something that looks like coverage.

The surviving substrate test is honest about its own shape: two independent
mechanisms enforce the refusal and each is sufficient alone, so mutating either
leaves it green and removing both turns it red. The redundancy is deliberate
and no single guard is load-bearing.

---

## Part 3 — jobs (VERIFY criterion 3)

Both halves of "settles once with an owner-fenced wake" are about identity
rather than scheduling.

**The fence is authorization, not secrecy.** Ids are `bash-1`, `bash-2`, …
and guessable on purpose: a scheme whose safety rests on unguessable ids is one
leak away from having no safety. So `get`/`kill`/`wait` refuse another
session's job, and `list()` **filters** rather than throwing — a throwing list
would tell a caller how many jobs someone else has.

For the same reason there is ONE error for "no such job" and for "not yours".
Distinguishable errors over predictable ids let a session enumerate `bash-1`,
`bash-2`, … and count another session's work. The test normalises out the id
the caller itself supplied and asserts everything else is identical.

Settlement listeners are registered per owner, not globally. A registry-wide
listener would hand every composed plugin another session's labels and
summaries — the same leak `list()` filters to avoid, reached through a
different door. My first version had exactly that: the doc comment said
"only about jobs belonging to `owner`" and the code notified everyone.

**Settle-once keeps the FIRST cause, not the last.** Four paths can end a job —
it finishes, it is killed, its owner is disposed, its deadline passes — and
they race. A job killed while finishing was *killed*; taking the later cause
would report a clean completion for work someone stopped. One flag, checked
and set before anything observable happens, and JavaScript runs that to
completion without interleaving.

Killing aborts the work rather than only marking the record. Marking a job
settled while its promise keeps running leaks exactly the work the kill was
for.

**Scope stated rather than implied:** these jobs are process-local. They do not
survive a restart and there is no persisted state to reconcile, so "exactly
once" means "no two settlement paths both win", not "durable across a crash".

**The wake budget is not in the VERIFY list and is here anyway.** The chain is
self-exciting by construction: a turn opened by a completion notice can start
the very job whose completion opens the next one. Unbounded, that is a loop;
bounded, it is four lines. It does **not** refill automatically — every
heuristic for "a human spoke" is defeatable by another producer posting to the
same inbox, and a budget that refills on something an agent can cause is not a
budget. A host that knows a human spoke calls `acknowledge`.

10 mutations over the registry, all caught.

---

## Part 4 — the terminal, and VERIFY criterion 2

Built on the pipe backend, per the operator's decision: `node-pty` is native,
AMC publishes a CLI with eight runtime dependencies, and an install that needs
a compiler is a worse failure than a missing capability. The backend is a
**parameter** of the seam, so a PTY backend composes in later without this code
changing.

**Criterion 2 says "a PTY reaches readiness by evidence ladder". The ladder is
built and tested; the PTY is not.** That is stated rather than reinterpreted.

### The correction that shaped the type

dsh's ladder ends in a deadline rung, and a deadline always fires. A result
carrying only `rung` therefore cannot express "this never became ready", and a
caller reading the output while ignoring the rung would treat a hung shell as a
completed command — and record it as one. So readiness carries three fields:

| rung | settled | proven | what was observed |
|---|---|---|---|
| `exited` | true | true | the shell is gone |
| `marker` | true | true | this send's own sentinel came back |
| `idle` | true | **false** | silence, which is not proof |
| `timeout` | **false** | false | nothing. Not readiness at all. |

`proven: false` on `idle` is the point of calling it an *evidence* ladder. A
command that pauses between writes is indistinguishable from one that has
finished, and an evidence product must not record a guess in the same shape as
an observation.

### The sentinel is per-send, and that is a security property

After the command, the session writes a line printing a nonce and `$?`. A fixed
sentinel could be produced by the command itself — `echo AMC-DONE` — and the
session would report a completion that never happened, with an exit code the
command chose. The nonce is minted per send, so output can only contain it by
having been generated after the command finished. Tested directly: a command
that prints a plausible marker does not settle its own send.

### A comment of mine that was simply wrong

I wrote that the sentinel goes on its own line "so `$?` is the user command's
status rather than the sentinel's own". That is false — `$?` refers to the
user's command either way, because it is expanded after that command has run.
The mutation "put the sentinel on the same line" stayed green, which is how I
found out.

The separate line IS right, for a different reason: it keeps the sentinel out
of the user's command *text*. `sleep 1 &` joined with `; printf …` is a syntax
error, and so is anything ending in a pipe or a trailing backslash. The comment
and a test now say that instead.

### Also found by a surviving mutation

The idle rung requires output to have been seen first. Without that, silence
before the first byte — ordinary startup latency — reads as completion, and
every slow-starting command settles almost immediately. No test covered a
command that produces no output at all; one does now.

### Honest about what a pipe is not

`resize` is **absent** from the pipe backend rather than a no-op. A method that
accepted the call and did nothing would let a caller believe it had changed
something; an absent method is a fact code can check, and `canResize` exposes
it. No TTY also means no job control and no program that insists on a terminal
— which is the capability the PTY backend would add, and the reason criterion 2
stays open.

11 mutations, all caught after two survivors were closed.
