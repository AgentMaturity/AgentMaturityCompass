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
