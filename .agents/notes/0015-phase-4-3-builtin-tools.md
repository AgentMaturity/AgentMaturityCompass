# ADR-0015 — P4.3 (part 1): built-in tools

Status: accepted · Date: 2026-08-25 · Follows [ADR-0014](0014-phase-4-2-exec-substrate.md)

## The finding that shaped the phase

AMC's host allowlist reaches a tool call exactly one way: `validateToolRequest`
in `toolhubValidators.ts`, hard-keyed on `input.tool.name === "http.fetch"`.

So the allowlist looks like a policy about network access and is actually a
policy about one identifier. A second network tool — `web_fetch`, `download`,
anything — gets no host check from that path at all. Adding the tool P4.3 asks
for, the obvious way, would have shipped it completely ungoverned.

`networkEgressGuard` keys on `actionClass === "NETWORK_EXTERNAL"` instead,
which every network tool already declares to be metered by the budget guard. A
new network tool is therefore governed by existing, or it is not a network
tool. Its tests use a deliberately differently-named tool.

A NETWORK_EXTERNAL tool that names no parseable host is **denied**: a call
whose destination cannot be determined cannot be checked, and "we could not
tell where this was going" is not a reason to let it go.

### Two neighbours of that finding, recorded not fixed

`src/enforce/egressProxy.ts` is 62 lines called by nothing outside itself. It
returns `logged: true` and a `strippedHeaders` list while writing no log and
stripping no headers. It is a false-capability surface and belongs in the same
sweep as the P5.3 redaction reconciliation.

`validateToolRequest`'s **path** allow/deny globs are keyed the same way, on
`"fs.read"`/`"fs.write"`. Tools named anything else get no path policy from it.
That is why containment is enforced inside the fs tools too, below.

## Redirects, measured

The allowlist is checked against the URL the caller asked for, which is only
sound while the fetch does not follow redirects.

| implementation | follows a 302? |
|---|---|
| `node:http.request` (what AMC uses) | **no** — returns the redirect itself |
| global `fetch()` | **yes**, by default |

So replacing the executor with `fetch()` — an entirely reasonable-looking
modernisation — turns an allowlisted host into an open redirector: request
`api.github.com`, receive a 302 to anywhere, and the guard that approved the
call never sees the second URL. `tests/egressRedirectBoundary.test.ts` exists
so that change cannot be made quietly.

## A containment bug I wrote, and the review caught

`insideWorkspace` resolved a path and compared it to the workspace root with
`relative`. That is purely **lexical**: it does not follow symlinks, and
`readFileSync` does. Demonstrated end to end — a symlink inside the workspace
pointing at a file outside it read straight through, and the tool reported
success.

Containment now decides on the **real** path: symlinks are resolved on the
deepest existing prefix of the target (so a write to a not-yet-existing file
still gets its ancestors resolved), and both sides are realpath'd because the
workspace root is itself commonly a link — `/var` → `/private/var` on macOS.

`.amc` and `.git` are refused at the tool level as well. They are inside the
workspace, so containment alone permits them, and a tool that can read
`.amc/keys` or write `.git/hooks/pre-commit` is a privilege escalation rather
than a file operation. The signed allowlist denies these globs too; this is the
second lock, because a guard a composition forgets to install enforces nothing.

## Read-before-edit

Two halves defending different things. **Read first** stops a blind edit — a
find-and-replace over content the model believes is there. **Unchanged since**
stops everything else, because a path is not a stable identity: it can be
re-pointed by a symlink, replaced between calls, or written by another process
while the agent was thinking. The recorded content digest is what makes the
check about the file rather than the name.

Scoped per agent: one agent's read must not authorise another's edit.

Two behaviours taken from dsh's policy and worth stating, because the naive
version gets both wrong:

- Creating a NEW file needs no prior read. There is nothing to have read, and
  refusing makes the first write of every file impossible. Overwriting an
  existing one does need one.
- A successful write or edit **refreshes** the observation. Demanding a re-read
  of content the agent itself just wrote trains it to read reflexively, which
  defeats the policy by turning it into noise.

An ambiguous edit is refused rather than resolved: an edit that silently
changed the first of several matches would be a different edit from the one
intended, and nothing downstream could tell.

## Search: bounded, not spilled

dsh sends over-cap search output to a spill store. AMC has one, and ADR-0010
records what is wrong with it — plaintext protected only by file mode while
evidence blobs are encrypted, invisible to retention, DSAR and export, and a
spill write can precede its signed commitment — concluding that these must be
closed "before spill carries regulated content". Grep results over a customer's
source code are exactly that. So P4.3 caps and **reports** instead.

Reporting is what makes capping honest. A truncated result that does not say it
was truncated is a claim about the codebase nobody checked: the model concludes
"there are three matches" when there were four hundred, and acts on it.

Three caps, because each is defeated alone: a match limit by one 50 MB minified
line, a byte limit by a million one-character matches, a file limit by neither.

Pure Node rather than ripgrep: dsh vendors the `@vscode/ripgrep` binary, and
AMC publishes a CLI with eight runtime dependencies and one native one. A
second native dependency to make a capped search faster is a bad trade.

## bash: thin over the substrate, honest about its class

The body is `runProcess` plus argument parsing. Tree termination, output
bounding, scrubbing and the timeout all come from P4.2 — which is the point of
having built it. A bash tool that spawned its own child would be the fourth way
this repo starts a process and the first with none of those.

**Its action class is an understatement and cannot not be.** `WRITE_HIGH` is
the closest single label; `bash "git push"` is a DEPLOY that `git.push` must
declare, and `bash "curl …"` is egress the NETWORK_EXTERNAL guard cannot see
because this tool is not in that class. A shell is not one action class, it is
all of them. No label fixes that, so the control is stated as being elsewhere:
the signed argv deny-patterns and binary allowlist, and the OS sandbox P4.4
adds. A deployment that composes this tool without those has given an agent a
shell.

## Deferred, explicitly

- **`lsp`** — 2,486 lines across three dsh packages for the seam alone. Named
  in the P4.3 VERIFY line and not delivered; it is a phase, not a tool.
- **persistent bash / `terminal_*` tools** — the `TerminalSession` and its
  readiness ladder exist (P4.2); the model-facing tools over them do not.
- **`web_search`** — needs a search provider and an API credential, which is a
  product decision rather than an implementation one.
- **`ask_user_question`** — the approval seam answers policy questions; this is
  a different channel with no UI to reach.
- **render-intent cards** — dsh's card vocabulary is a UI contract, and AMC has
  no UI consumer until P7.2. Building the projection now means a module whose
  only caller is its own test.

**So P4.3's exit criterion — "a genuinely useful coding agent" — is partly
met.** read/write/edit/glob/grep/bash is the working core of one. It is not the
whole list the plan names, and the gap is stated here rather than absorbed.

## One product problem this surfaces

Composing `runtimeFirewallGuard` (denies with no signed firewall policy, per
ADR-0011) together with `toolhubAllowlistGuard` (denies anything absent from a
signed `tools.yaml` under `denyByDefault`) means a fresh workspace denies every
tool until an operator signs two configs. That is correct for a regulated
deployment and hostile as a first run: the failure reads as broken tools rather
than as unconfigured policy. Whoever wires these into `amc agent` needs an
answer — a guided `amc init` that signs both, or a first-run diagnostic that
names the two commands. Recorded here because the tests hit it first, and the
same wall is what a user gets.

## Verification

69 tests across five files. 41 mutations, all caught after seven survivors were
closed. The survivors are the interesting part, and they were all real:

- a binary-file fixture whose bytes never contained the search string, so the
  binary check was never exercised;
- a symlink-following mutation that changed nothing, because `withFileTypes`
  already excludes links — the test now mutates the realistic break (classify
  with `statSync`) instead;
- two read-before-edit properties whose tests asserted the safe direction only;
- a per-agent mutation of mine that was a no-op;
- a containment test that passed for the wrong reason, because
  read-before-edit refuses the same call for a different reason.
