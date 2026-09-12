# AMC Execution Brief — 2026-09-09

**Read this file in full before your first tool call, and re-read it after every context
compaction.** It is the standing order. Where this brief and your recollection disagree,
this brief wins; where this brief and the repository disagree, the repository wins and you
correct this brief.

---

## 0. The order

Continue and complete the AMC program: drive the existing execution queue to genuine Done,
then take AMC to a live public deployment, then close the remaining capability and
experience gaps against DeepSeek Harness and pi so that AMC is defensibly the better
harness — and can *show* it rather than assert it.

Four workstreams, in this order of precedence when they conflict:

1. **Truthfulness** of every claim, score, count and receipt.
2. **Phase A** — the 34 open children of AMC-1505 reach real Done.
3. **Phase B** — deployment: release gate → signed artifact → npm publish → live Studio.
4. **Phase C** — new gap sweep vs. the pinned comparators, plus first-run experience.

Obsidian and Linear are updated continuously *as you go*, not batched at the end.

**Model and harness.** This brief runs under either of two configurations, and nothing
below depends on which one you are:

| Harness | Model | Model ID |
|---|---|---|
| Claude Code session | Fable 5.1 | `claude-fable-5-1` |
| Codex session | GPT-6 Astra | as configured in that session |

Rules: a session uses **one** model for all its work, including every subagent and
workflow — no per-subagent overrides, no mixing within a session. Different sessions may
run on different harnesses concurrently; §3 and §4 already assume that. Where this brief
names a harness-specific tool, use your harness's equivalent, and if there is none, do the
work by hand and say so in the execution log. (Sid, 2026-09-09.)

---

## 1. Ground truth — verify these before trusting them

Everything below was true at 2026-09-09. Re-verify each one; if a fact has moved, correct
this section in place and note the correction in the execution log.

| Fact | Value |
|---|---|
| Repo root | `/Users/sid/AgentMaturityCompass` |
| Branch | `amc/gap-register-execution` |
| HEAD at brief authoring | `7bd1e8ce` (2026-09-12 correction: integration HEAD is `4d2d69e5`, unchanged since 2026-09-11) |
| Main | `3d6b8d4a` (root is ~197 commits ahead) |
| Remote | `https://github.com/AgentMaturity/AgentMaturityCompass.git` |
| Live plan | `plans/amc-dsh-pi-execution-2026-09-08.md` |
| Evidence root | `AMC_OS/RESEARCH/2026-09-08-dsh-pi/` |
| Linear epic | AMC-1505 |
| Linear team UUID | `9cee9981-00cf-40b2-8b48-2a1b588bfb43` |
| Obsidian vault | `/Users/sid/Documents/AMC` (589 notes, 10 canvases) |
| Local package version | `1.2.0` |
| Published npm version | `1.1.1` |
| Worktrees | 45 registered, ~15 dirty (2026-09-12 correction: 63 registered, 15 dirty; receipt `AMC_OS/RESEARCH/2026-09-09-worktree-audit/refresh-2026-09-12T131601Z/`) |
| Shared stash | `152a61696f336f658893a72aa9357d58df8c5679` — **do not touch** |

**Comparators, pinned. Do not compare against `main` of either project — pin or re-pin
explicitly and record the new commit and retrieval date.**

- DeepSeek Harness — `https://github.com/deepseek-ai/deepseek-harness`, commit
  `c389f96bf3a9b6807cb71ed6bdad5849be0df6d8`, version `0.1.3-alpha.2`, retrieved 2026-09-08.
- pi — `https://github.com/earendil-works/pi`, commit
  `b2602be77cb7b0de45dd616407fd210daa48aa75`, version `0.85.1`, retrieved 2026-09-08.

Stale comparisons already caught and retired — **do not reintroduce them**: dsh now has v2
session migrations, Electron releases, and browser launch-token/cookie authentication. The
old blanket claims "dsh has no auth", "no migration", "no signing anywhere" are false.
pi has documented v3 CLI sessions, new telemetry contracts, and experimental v4
harness/protocol work.

**Linear state UUIDs.** In Claude Code sessions the Linear MCP tool
(`mcp__linear__create_issue`) rejects `state` and `priority` at create time with an
Argument Validation Error — create minimal, then `update_issue`. Codex sessions use
whichever Linear connector is configured; if none is, record every intended Linear change
in the execution log with the issue key and target state, flagged `LINEAR-PENDING`, so a
session that has the tool can apply it. Never let a Linear update silently not happen.

```
Triage           4e38aa75-eed5-4307-b4e0-7b58a6b391c4
Backlog          e5d664d1-c86f-4c89-a1e3-3554c06cd4f9
Todo             fcf9572e-0bc4-4016-aaab-5ec188c504b8
In Progress      4c8f254e-2fb2-4c09-a894-af5fb58ce2ad
In Review        80b16120-8f2d-43ab-b543-05338e8ca754
Ready to Merge   e37fba14-8bd0-4c7b-ac84-79e88ff6b349
Done             992acb9d-d3f4-4a58-865c-9837e7522979
Canceled         871104da-7035-46fd-a615-71db5b8c6e48
Duplicate        cc3b9479-d1f1-459a-a4b8-7084b0dba4b5
```

---

## 2. The evidence contract — the part that matters most

AMC sells trustworthy evidence about agents. A false claim inside AMC is not a bug, it is
the product failing at its only job. This repository has already shipped that failure once,
and the audit of 2026-08-20 named it exactly:

- `amc shield red-team` scored by `Math.random() < 0.2` (`cli.ts:20125`).
- 142 assurance packs graded a hardcoded `syntheticResponse()` (`assuranceRunner.ts:133/315`).
- ~18 score dimensions scored by `existsSync('src/...')` against **AMC's own repo**, not the
  target (`gamingResistance.ts:53`).
- The eval judge returned `{score: 0.8, "Mock judge response"}` (`llmJudgeEngine.ts:346`).
- `buildMockReportForUx` faked four dashboards (`cli.ts:19216`).

Every one of those was easier to write than the real thing, and each read as success. You
will feel the same pull. These rules are how you resist it.

### Hard rules

1. **A number you did not measure is a lie.** Never write a count, score, ratio, percentage
   or duration into code, docs, Linear, Obsidian or a commit message unless you produced it
   in this session from a real run, or you are quoting a dated receipt *and you name that
   receipt inline*.
2. **Name the boundary of every result.** Every claim states the exact source commit, the
   environment (OS/arch/Node), what was exercised, and what was **not**. "Passed" without a
   boundary is not a result.
3. **Distinguish these four, always.** Source qualification ≠ package qualification ≠
   platform qualification ≠ a deployed release. A green local suite is none of the other
   three.
4. **A verifier that cannot see the evidence must never call it verified.** (ADR-0010, from
   the bug where `amc verify` returned `chain.ok=true` on an openly rewritten JSONL
   workspace by reading an empty table and calling that success.)
5. **Gating on a crude detector is defensible only when its errors fail closed.** A false
   refusal is acceptable; a hostile input reading SECURE is not. The MCP security score was
   once buyable with vocabulary — an untrusted `npx -y untrusted@latest` server scored
   100/100 by adding `auth`/`sandbox`/`rateLimit`/`logging` all set to `"none"`.
6. **Mutation-verify every security property.** Break the rule, confirm the test goes RED,
   restore. Roughly a quarter of mutations survive first pass on this codebase, and nearly
   every survivor is a real missing test. A test that passes for the wrong reason is worse
   than no test.
7. **Protection written next to a protection that already covers the case is decoration,
   not defence in depth.** This was caught three separate times while *removing* dead policy
   (ADR-0019, ADR-0020). Before adding a guard, prove the existing one does not already
   cover it — by mutating it.
8. **A failing test whose subject is a security property is telling you something, not
   blocking you.** Do not widen a policy to make a test pass. Scope creep of exactly this
   shape was caught and reverted once already.
9. **"10x" is a target, not a claim.** Never write that AMC is 10x better, is the industry
   standard, or is superior to dsh/pi, unless §11's measurement produced that result under a
   named protocol. The existing plan's language is the correct register — copy it.
10. **Do not mass-close on the strength of a summary.** Some historical dispositions are
    documented deferrals or reclassifications, not completions.

---

## 3. Working rules for this checkout

**Another session — Claude Code or Codex — edits this same root checkout concurrently.**
Its uncommitted files sit in `git status` beside yours. You cannot message it, and you
cannot assume it runs the same harness or model as you. Linear and the plan's execution log
are your only coordination channels. This has already cost a wrong commit.

- **Stage by explicit path. Never `git add -A`.**
- **Never `git stash`** — the stash stack is shared, and `152a6169…` must survive.
- Before `git commit --amend`, check HEAD is still yours and `.git/index.lock` is absent. A
  zero-byte `index.lock` older than ~5 minutes with no git process is orphaned.
- **Never run `gen-counts --write` or any generator in the shared root** — it will count the
  other session's uncommitted files and bake a false number into a committed doc. Generate
  against a clone of your candidate commit.
- Read other worktrees **read-only**. Preserve every dirty worktree. Do not `git worktree
  remove`, reset, or check out over anyone's changes. Inventory with
  `git worktree list --porcelain` and per-worktree `git status --porcelain`.
- **Know your shell before you loop.** Claude Code's Bash tool runs zsh, where
  `for f in $LIST` does NOT word-split — two copy loops once silently ran once with the
  whole list as one path. Codex's shell may differ; check with `echo $0` / `$SHELL` on first
  use. In either case: use literal word lists, arrays, or `${=VAR}`, and never trust an
  `echo` after a command that wasn't `&&`-chained.

---

## 4. Execution model — parallel worktree fan-out

Work fans out across worktrees, with these constraints.

### Ownership manifest

Before starting parallel work, write `plans/ownership-manifest.md` declaring, per active
worktree: the Linear issue, the branch, and the **exact file paths it may write**. Rules:

- Two worktrees may never claim the same path. Overlapping claims **serialize** — one waits.
- High-collision surfaces are **serial-only, in root**: `src/cli.ts`, `src/studio/studioServer.ts`,
  the ledger and session spine, any signed config (`.amc/tools.yaml`, `.amc/agents.yaml`,
  `.amc/schedules.yaml`, `amc.config.yaml`), and `package.json`.
- Update the manifest when a worktree finishes. A stale manifest is worse than none.

### The receipt rule

**No gate, count, test result or acceptance produced in the shared root or in a dirty
worktree is a receipt.** Every acceptance must be reproduced in a **fresh clone pinned to the
exact candidate commit**, in a scratch directory, with a clean install. Record the clone
path, the commit SHA, and the environment. If you cannot reproduce it in a fresh clone, it
did not happen.

### Cleanup

Every process group, server, gateway, VM and endpoint you start must be closed, and the
closure recorded. This discipline is already established in the existing receipts — keep it.

---

## 5. Phase A — drive the queue to Done

There are 34 children under AMC-1505: 30 In Review, 4 In Progress (AMC-1512, AMC-1518,
AMC-1530, AMC-1538). Verify this live before planning against it.

> 2026-09-12 correction (live Linear read): 43 children — 28 In Review, 11 In Progress
> (AMC-1512, 1518, 1530, 1540, 1541, 1542, 1543, 1545, 1546, 1547, 1548), 3 Done
> (AMC-1526, 1528, 1544), 1 Canceled (AMC-1524). AMC-1538 is In Review, not In Progress.

"In Review" here means *implemented and locally accepted* — not merged, not released, not
independently validated. Phase A converts that into real Done.

### Definition of Done (all seven, per issue)

1. Implementation is committed on a named branch, and the branch is **merged to the
   integration branch** (currently `amc/gap-register-execution`) without conflict.
2. Its acceptance is reproduced in a **fresh clone at the merged commit** — not the tree
   where it was written.
3. The **full suite** passes at that commit, with the pass/fail/pending counts recorded and
   zero failures. A composite of scoped runs is not a full-suite pass; say so when it is one.
4. The **release gate** (`pnpm release:gate`) passes, or every skipped check is named with
   its reason.
5. Its receipt lands under `AMC_OS/RESEARCH/` with source commit, environment, what was
   exercised, and what was not.
6. The Linear issue is moved to Done with a comment carrying the commit SHA and receipt path.
7. The relevant Obsidian note is updated (§9).

### Sequencing

0. **Audit uncommitted work and every worktree — before anything else.** Real work has
   already been recovered from a dirty worktree once (AMC-1508, from
   `vigilant-merkle-2d8549`). Do this read-only:
   - `git worktree list --porcelain`, then per worktree: branch, HEAD, `git status
     --porcelain`, and `git log --oneline -5` against the integration branch to see what it
     holds that root does not.
   - Include the root's own uncommitted files (`docs/ARCHITECTURE_NAVIGATION.md` was
     modified at brief authoring — establish whose it is before touching it) and the
     `.claude/worktrees/*` sessions and any Codex-created worktrees (check `.codex/` and
     `git worktree list` for paths outside `AgentMaturityCompass-worktrees/`).
   - Classify every dirty path and every unmerged branch as one of: **recoverable work**
     (real, unmerged, worth an issue), **superseded** (already landed another way — cite the
     commit), **abandoned experiment**, or **unknown**. "Unknown" is a valid answer; guessing
     is not.
   - File one Linear issue per recoverable item under AMC-1505, linking the worktree and
     branch. Do not port anything until its diff has been read and its tests identified.
   - Write the result to `AMC_OS/RESEARCH/2026-09-09-worktree-audit/` (inventory JSON plus a
     README with the classification table), and reference it from the execution log. The
     previous audit receipt is `worktrees-refresh-final-native-3ea14e58.json` — diff against
     it so new deltas stand out.
   - Never remove, reset, check out over, or stash any of it.
1. **Reconcile the queue.** For each of the 34, read its current state and its claimed
   evidence, and verify the claim still holds at current HEAD. Some will have decayed.
   Record which.
2. **Finish the 4 In Progress**, which carry the known-open work:
   - **AMC-1512** — real-provider evidence and human first-use protocol.
   - **AMC-1518** — matched comparative outcomes vs. dsh/pi.
   - **AMC-1530** — the broader platform and install matrix.
   - **AMC-1538** — operator public task validation across core/CLI/SDK/Studio.
3. **Then merge and close the 30 In Review**, in dependency order, one merge at a time.
4. Do not open new issues in Phase A unless you find a defect that blocks a close — then
   open it, link it, and fix it.

### Known-open items to fold in, not rediscover

These are recorded in project memory as verified-open. Confirm before acting, but do not
re-derive them from scratch:

- `studioState.ts:130` issues every agent bearer token
  `toolhub:intent`/`toolhub:execute`/`governor:check`/`receipt:verify` unconditionally — a
  child holding one routes around its lease.
- `WRITE_LOW` and `WRITE_HIGH` both map to `toolhub:execute` (granularity loss).
- `correlate.ts:33` filters `stdout`/`stderr` but the adapter path writes
  `agent_stdout`/`agent_stderr` — contributes zero to `correlationRatio`, a precondition for
  `OBSERVED_HARDENED`.
- `stopConditions` on `SubagentRequest` is written into the signed packet, rendered for
  humans, and read by nothing.
- Hook control is not inherited by a spawned child; no spawn path installs it.
- `ToolsetReadiness.confined` is a machine probe, not a process property.
- P6.1d: no CLI manages schedules; nothing calls `runDueSchedules` on a timer.
- Spill writes plaintext, is invisible to retention/DSAR/export/backup, and a spill write can
  precede its signed commitment (ADR-0010) — close before spill carries regulated content.
- Coverage thresholds are all 0; `lint` aliases `typecheck`; Playwright e2e is unwired.
- Number drift across three disagreeing scorers: tests 8,604 (badge) / ~4.2k / 5,031;
  questions 126 / 244 / 264; packs 142 / 153.

---

## 6. Phase B — deployment

**Phase B does not start until Phase A's queue is Done and the full release gate is green at
a single pinned commit.**

### B0 — Blocking security gate

**This is a hard blocker on any public exposure. Do not proceed past it.**

- The 2026-02-23 supply-chain scan FAILed with 8 HIGH findings including
  `ANTHROPIC_TOKEN_HINT`. Three BFG history rewrites followed. **There is no in-repo proof
  the flagged keys were ever rotated.** Establish that proof, or **stop and ask Sid**.
- Verify and record: the trust root is filesystem-spoofable (unsigned key-history JSON,
  notary responses auto-append to auditor key history, `AMC_NO_SIGN=1` writes literal
  "unsigned" signatures, the vault falls back to `amc-test-passphrase` under test,
  `zkPrivacy.ts` is placeholder crypto, `binderVerifier` shells raw `tar -xzf`,
  `amc.config.yaml` — which controls `trustBoundaryMode` — is unsigned).
- Plaintext demo vault passphrase on disk; default passphrases baked into both Dockerfiles.
  **These must not reach a live deployment.**
- Public-repo hygiene, tracked and shipping: `COMPETITIVE_*_G0DM0D3.md`,
  `.tmp-gap-report.json` (`.gitignore` guards the wrong filename), `test_model.pkl`
  fake-malware fixture, `mirofish-simulation/` **fabricated practitioner testimonials**,
  three release tarballs, `..bfg-report/`, `cli-new-commands.ts.fragment`, empty
  `security-audit/` husks, the embedded `qa/` subproject, the OpenClaw persona stack
  (`HEARTBEAT.md` monitors a personal crypto bot). Remove these from the public surface
  before the repo or package is exposed. The fabricated testimonials are the most serious.

### B1 — Credentials check, up front

Detect and report missing credentials **before** doing Phase B work, not at the finish line:

- `NPM_TOKEN` and `CHANGESETS_GITHUB_TOKEN` (Changesets automation has been stalled, likely
  for exactly this reason).
- Railway and/or Vercel deploy tokens (`railway.json` and `vercel.json` both exist).
- Any registry or container credentials for the Docker images.

If any are absent: stop, list precisely what is needed and where it goes, and wait.

### B2 — Release candidate

- `pnpm release:gate` green at a pinned commit, every skipped check named with its reason.
- `pnpm release:prepack-check` green.
- `pnpm check:packed-install` and `check:clean-source` green in a fresh clone.
- `pnpm release:verify-version` — local is `1.2.0`, npm is at `1.1.1`. Version the
  outstanding changesets.
- Produce the signed artifact and record its SHA256.

### B3 — Publish — **CONFIRM WITH SID FIRST**

`pnpm release` runs `changeset publish`. **Do not run it until you have shown Sid the
version, the artifact SHA256, the gate result, and the B0 disposition, and he has said yes
in this conversation.** Publishing is irreversible and outward-facing.

### B4 — Live deployment — **CONFIRM WITH SID FIRST**

Same gate. Before deploying:

- Build and record image digests (`Dockerfile`, `docker/docker-compose.yml`,
  `docker/Dockerfile.quickstart`).
- Prove no default or demo passphrase is present in the deployed configuration.
- Have a tested rollback, and a health check that actually exercises a governed turn — note
  that "live deployment health" has been an *explicitly skipped* gate in every prior receipt,
  so this is new ground and must not be reported as previously qualified.
- **Then show Sid the target, the digest, the rollback, and wait for an explicit yes.**

After deploying: record the live URL, the deployed commit, the image digest, and a real
post-deploy verification. Update Obsidian and Linear.

---

## 7. Phase C — the gap sweep

Only after Phase A. May overlap Phase B while waiting on Sid's confirmations.

1. **Re-read both comparators at their pinned commits** (§1). Produce a fresh gap register at
   `plans/amc-gap-register-2026-09.md`, each row carrying: the capability, the comparator's
   file/commit evidence, AMC's current state with file evidence, the gap class, and severity.
   **Grep-verify every "comparator lacks X" claim** — the existing pi analysis was
   grep-verified, and that is the standard.
2. **Broaden beyond dsh and pi.** The plan already calls for source-backed comparison against
   other current first-party harnesses with dated official references. Do that before
   claiming market-wide superiority — and if you cannot, say so plainly instead.
3. **File new Linear issues** under AMC-1505 (or a new epic if the register is large), using
   the create-minimal-then-update pattern from §1.
4. **First-run experience is a named product problem, not polish.** The firewall guard denies
   without a signed policy and the allowlist guard denies anything unsigned — correct for
   regulated deployments, hostile as a first run. `initWorkspace` already signs `tools.yaml`,
   so the missing piece is `amc firewall enable`. Ship a guided init or first-run diagnostic.
   The full UX standard is §7a.
5. **Automated persona contract checks are automated checks.** They are not human usability
   ratings and must never be labelled as such.
6. **Verify the status of the five pi-deciding items** recorded in project memory
   (2026-08-28). Each was open then; some have moved. Confirm each against current source
   and record the finding before opening issues:
   1. **Ship** — npm stuck at 1.1.1 vs local 1.2.0, then signed binaries (pi only checksums).
   2. **Honest evidence** — every pack and red-team score carries a session-id provenance
      link; the gate refuses a score without one.
   3. **Provider breadth + prompt caching** — the August finding was 3 cacheless adapters vs
      pi's ~40 cached. The September plan says native prompt caching now exists. Measure
      the real provider count and cache behaviour today; vendoring pi's MIT `pi-ai` layer
      behind AMC's seam was the identified fast path.
   4. **`amc agent` REPL/TUI** over the existing loop + spine — the daily-driver surface.
   5. **Signed code plugins** — pi loads unsigned code with full permissions; turn their
      strength into AMC's differentiator.

### 7a. The user-experience standard

"User friendly" is measurable or it is marketing. AMC's trust plane makes every flow
*stricter* than dsh's or pi's, so friendliness has to be engineered in, not hoped for. Hold
AMC to these, and measure dsh and pi on the same protocol so the comparison is symmetric.

**Install and first run**

- One documented install command per platform that works on a clean machine. Record the
  exact command, platform, and elapsed time.
- `amc init` (or equivalent) gets a fresh workspace from nothing to a first governed,
  verified turn in **≤3 operator actions and <5 minutes**, keyless. Every step it takes is
  explained on screen in plain language.
- A first-run diagnostic (`amc doctor` or equivalent) that names each missing precondition
  and the exact command that fixes it. A refusal that does not name its fix is a defect.
- Every refusal the governance layer emits — firewall, allowlist, sandbox, budget, lease,
  approval — states *what* was refused, *which* signed policy refused it, and *how* an
  operator widens it deliberately. Compare this against dsh's and pi's equivalent messages
  side by side.

**Daily use**

- An interactive session surface (§7 item 6.4) with streaming, cancellation, resume/fork,
  slash-command skills and visible approvals, at parity with pi's REPL for the common
  loop. Record which pi/dsh interactions have no AMC equivalent.
- Provider setup that takes one credential reference, never a pasted secret; supports the
  major providers plus local models; and shows cache hit rate.
- Crash, Ctrl-C and network-drop recovery that preserves signed history and says so.

**Docs**

- The README's first screen gets a new user to a running governed turn. Everything else is
  linked, not inlined.
- `docs/` currently holds 180+ guides. Produce a reading order; retire or archive guides
  that describe removed or facaded behaviour. A guide that describes a facade is a false
  claim (§2).

**Measurement protocol** — five real first-use sessions per harness (AMC, dsh, pi), same
tasks, same machine class, recorded: actions to first useful result, elapsed time, setup
failures, refusals encountered and whether each named its fix, whether resume after an
interruption succeeded, and whether the user returned for a second task. Human sessions
are labelled human; automated persona runs are labelled automated. Report both, never
blended.

**Market breadth** — "better than any harness on the market as of Sep 2026" is only
claimable against a named, dated set. The plan already audited five first-party harness
sources; extend that to at least: Claude Code, OpenAI Codex CLI, Gemini CLI, OpenCode,
Cursor CLI, Aider, and Hermes Agent, each at a pinned release with a retrieval date and an
official source. For each, record the one thing it does that AMC does not. If a harness
cannot be evaluated on the protocol above, list it as *not evaluated* rather than omitting
it.

---

## 8. Linear contract

- Epic **AMC-1505**. Team `9cee9981-00cf-40b2-8b48-2a1b588bfb43`. State UUIDs in §1.
- Create minimal, then `update_issue` to set state and priority.
- Every state change carries a comment with: commit SHA, what was exercised, what was not,
  and the receipt path.
- Keep the epic's child-state tally accurate; the plan quotes it and it drifts.
- Do not close the older G1–G8 gap epics (AMC-1496…1504) on the strength of an execution-log
  summary.
- Reuse **AMC-483** for release-gate/CI/install alignment and **AMC-7** for published-install
  verification rather than opening duplicates.

---

## 9. Obsidian contract

Vault: `/Users/sid/Documents/AMC`. It is a real, curated vault — treat it as a document you
are maintaining, not a dump target.

**Notes to keep current** (all exist):

- `AMC Home.md` — the entry point.
- `Projects/AMC/AMC Now.md` — current state. The highest-churn note.
- `Projects/AMC/AMC Roadmap.md` — forward plan.
- `MOCs/MOC - Current Operations.md` — what is running right now.
- `MOCs/MOC - AMC Architecture.md` — links into the Graphify-generated architecture notes.
- `Evidence/` — one dated note per acceptance, mirroring the `AMC_OS/RESEARCH/` receipt.
- `Decisions/` — one note per real decision, with the alternatives rejected and why.
- `Canvases/` — regenerate via Graphify; do not hand-edit generated canvases.

**Rules:**

- **Checkpoint, never silently overwrite.** Before materially rewriting Home, Now or Roadmap,
  copy the current version to `Archive/Checkpoints/YYYY-MM-DD <note> checkpoint.md`. This is
  the existing convention — `Archive/Checkpoints/2026-07-21 AMC *.md` are the precedent.
- Every note updated in this program is dated and links to its receipt path and Linear issue.
- `AMC/Architecture/Graphify Generated/` is **generated output** — regenerate it, don't edit
  it, and record the extraction commit and symbol/relation counts alongside.
- Wiki links must resolve. The existing receipts count them (e.g. "1,027 wiki links, 217 file
  cards, 406 edges resolve") — hold that standard.
- Obsidian notes are subject to §2 exactly as code is. A confident note is still a claim.

---

## 10. Reporting cadence

- Append to the execution log in `plans/amc-dsh-pi-execution-2026-09-08.md` at every
  meaningful boundary — dated, with commit SHAs and receipt paths. Follow the existing entry
  style, including its explicit non-claims.
- Update `plans/ownership-manifest.md` whenever worktree ownership changes.
- Give Sid a short status when: a phase completes, a confirmation gate is reached, a blocker
  appears, or a prior receipt is found to be wrong.

---

## 11. Measuring "10x" honestly

The six axes below are the plan's own, and they are the only basis on which a superiority
claim may be made. Until measured, the correct phrasing is that these are targets.

1. **Evidence correctness** — every scored claim resolves to provenance with an explicit
   trust tier; imported unsigned telemetry cannot become "observed" by re-signing; tampering,
   missing evidence and unsupported formats fail visibly.
2. **Time to proof** — clean install → real task → failure explanation → independently
   verifiable bundle. Target: ≤3 operator actions, <5 minutes for a keyless conformance demo.
   Measure real-provider runs separately.
3. **Daily use** — multi-turn streaming, cancellation, resume/fork and crash recovery all
   preserve signed history and enforcement boundaries.
4. **Cost and performance** — paired identical task/model/tool/sandbox budgets across AMC,
   dsh and pi. Record repetitions, success criteria, latency, token and cache usage, cost
   source dates, and failures. **Never invent head-to-head scores.** The one real coding
   pilot run so far produced *zero qualified passes, five qualified failures and four
   inconclusive trials* — that is what an honest early result looks like.
5. **Interoperability** — a versioned producer-neutral contract with pi/dsh examples,
   explicit lossiness and unknowns, hostile-fixture conformance. External producers do not
   self-certify trust.
6. **Standard adoption** — publish a small independently implementable proof/profile spec, a
   standalone verifier, and a migration policy. Seek **independent implementations and real
   pilot results** before calling AMC an industry standard.

AMC's genuine differentiator, and the thing to protect: the trust plane. pi loads unsigned
plugin code with full permissions, has no session hashing or signing, no permission gate on
`prepareToolCall()`, and scopes prompt injection out in its `SECURITY.md`. That lead is real
— **and it is forfeit for as long as any fabricated-evidence class remains in AMC.** Which is
why §2 outranks everything else in this brief.

---

## 12. Stop and ask Sid

Stop and wait for an explicit answer — do not proceed on an assumption — when:

- **B3 npm publish** and **B4 live deployment** are ready. Both require confirmation
  immediately before the irreversible act.
- The B0 key-rotation proof cannot be established.
- Credentials are missing (§B1).
- You would need to force-push, rewrite history, remove a worktree, drop the shared stash, or
  touch another session's uncommitted work.
- You would need to rotate, generate or handle a production secret.
- A prior accepted receipt turns out to be wrong — report it immediately and prominently
  rather than quietly re-running.
- Closing an issue would require asserting something you could not verify.
- Scope would expand materially beyond this brief.

Everything else in Phases A and C is pre-authorized. Work autonomously, and do not stop for
confirmation on reversible, in-scope work.

---

## 13. Anti-patterns, named

If you catch yourself doing any of these, stop:

- Writing a plausible number instead of running the thing that produces it.
- Reporting a composite of scoped runs as a full-suite pass.
- Widening a permission, path or allowlist to make a failing security test pass.
- Adding a guard without mutating the existing one to prove it doesn't already cover the case.
- Closing a Linear issue because its description sounds done.
- Running a generator in the shared root and committing its output.
- Comparing against a comparator's `main` instead of its pinned commit.
- Saying "10x", "industry standard", or "better than" without §11 evidence.
- Letting an agent's own summary of its work stand as the acceptance for that work.
- Batching Obsidian and Linear updates to the end of the session.
