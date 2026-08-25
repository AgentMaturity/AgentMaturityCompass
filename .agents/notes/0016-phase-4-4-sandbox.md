# ADR-0016 — P4.4: OS confinement, and the sub-step order

Status: accepted · Date: 2026-08-25 · Follows [ADR-0015](0015-phase-4-3-builtin-tools.md)

## Why this closes a different kind of gap

Every control up to here — the firewall, budgets, the signed allowlist,
read-before-edit, workspace containment — is AMC asking a process to behave.
The process could always decline. This is the kernel refusing.

## The plan says P4.4a (Linux) first. This does P4.4b (macOS) first.

Measured on this machine before designing anything:

| mechanism | present |
|---|---|
| `/usr/bin/sandbox-exec` (Seatbelt) | **yes** |
| `bwrap` | no |
| `landlock-run` | no |
| docker / podman / colima / lima | **none** |

So a Linux backend could not be executed **even once** before shipping. The
plan's own verify criterion for each sub-step is "the OS-matrix confinement
proof — a write outside the workspace is denied with the backend's own denial
signature", and there is no way to produce that proof for Linux here.

Writing a Landlock or bwrap backend blind and calling the sub-step done would
be shipping unverified confinement — the precise false assurance a sandbox
exists to remove, and worse than no sandbox because an operator would believe
there was a boundary. So P4.4a is **not attempted**, not attempted-and-hidden.
It needs a Linux lane, which is the same P8.1 dependency that already blocks
P4.4c. `defaultBackends()` says this in the code, where someone adding a
backend will read it.

## What Seatbelt actually does, measured not read

Four findings, each of which contradicts what the profile language suggests:

**1. Paths must be REAL.** `(subpath "/var/folders/…")` matches nothing,
because `/var` is a symlink to `/private/var` and Seatbelt matches the resolved
path. It fails **silently** — no error, no confinement, and an operator who
granted the workspace finds it is not writable. This is the single easiest way
to ship a sandbox that does nothing, and it is the same realpath trap that
defeated the fs tools' containment in P4.3, one layer down.

**2. `(deny default)` is too tight to start a shell.** A profile denying
everything and re-allowing reads of `/usr`, `/bin` and `/System` still aborts
`/bin/sh` at load with SIGABRT (exit 134): dyld needs more than file reads. The
workable shape is `(allow default)` then `(deny file-write*)` with the
workspace re-allowed.

**3. A denial is EPERM to the command, and invisible to us.** `sandbox-exec`
reports nothing; the command sees `Operation not permitted` and decides what to
do about it.

**4. Runner failure is exit 65 with a `sandbox-exec:` prefix on stderr** —
cleanly separable from anything the command itself produces, which is what
makes honest attribution possible at all.

### The honesty constraint that shaped the types

Because of (3), "was something denied?" is **not observable**. A command that
swallows EPERM exits 0 and looks identical to one that never tried. So
`SandboxOutcome` reports what was ESTABLISHED — `confined`, and the writable
roots in force — and never a denial count. A `denied: boolean` here would read
false for both "nothing was denied" and "we could not tell", which is exactly
the false-green shape this project keeps finding.

## What is confined, stated as a limit

**Writes.** Reads are open, because a coding agent loads Node, libraries and
toolchains from all over the filesystem and an allowlist wide enough for that
is not a read boundary worth claiming. Network is not confined here either —
AMC's egress allowlist is the orthogonal layer, by design and by the plan.

The profile says so in its own comments, and a test asserts the profile
contains no `(deny file-read` or `(deny network` — so the limit cannot quietly
become an implied claim.

## Fail closed, and the escape hatch that stays legible

With no backend available, a confined run is **refused**. It does not quietly
become an unconfined one. Silent passthrough is what makes a sandbox worse than
none: the operator believes there is a boundary, the evidence says a command
ran, and nothing records that the boundary was absent.

`allowUnconfined` exists because a developer on an unsupported platform still
needs to run things. It is a parameter a caller must pass, never a default, and
the outcome it produces says `confined: false` with an `unavailable` failure —
so a run without a boundary is legible as one afterwards.

A refused run reports `exitCode: null`. A zero would read as a command that
succeeded.

## Escalation widens strictly

`widenPolicy` may only ADD writable roots. A widening that replaced the set
could quietly drop a root the operator had granted, and an escalation protocol
that can narrow is a protocol for laundering a revocation as a grant.

The full same-turn denial→escalation→approval loop is not wired: it needs the
denial to be *observable*, and finding (3) says it is not. What exists is the
strict-widening primitive it would be built on. Recorded as a gap rather than
described as done.

## A profile-injection hole worth naming

A writable root is a caller-supplied string that lands inside an SBPL literal.
Unescaped, a quote closes the literal and everything after it is policy — so a
path could turn `(deny file-write*)` into `(allow file-write*)` and the sandbox
would report itself confined while confining nothing. Escaped, and tested both
as a unit and by confirming a real write is still refused when a root contains
quote characters.

## Verification

20 tests. The confinement ones run real commands under the real kernel sandbox
— a mocked backend would prove AMC calls a function, which is not the claim —
and are `runIf(darwin)`, skipped rather than faked elsewhere. A confinement
test that passed on a platform with no sandbox would report a boundary nobody
established.

13 mutations, all caught after two survivors were closed:

- the realpath resolution had no test isolating it, because every fixture
  handed the backend an already-resolved path;
- the runner-failure attribution was never driven through a run that could
  produce it, so the decision is now a pure exported predicate tested against
  the measured signature and both near-misses (a linter's own exit 65; a
  command that merely prints the string).

**One test was poisoning the file.** The `$HOME` probe wrote
`amc-sandbox-should-not-exist.txt` and never cleaned it up, so the first
mutation that leaked left a file that made every later run fail — a cascade
that reads as many broken tests instead of one broken boundary. It cleans up in
a `finally` now.
