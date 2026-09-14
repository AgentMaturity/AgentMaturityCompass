# START_HERE.md — Where to begin with AMC

Choose what you want to do first. AMC can run a native task, assess evidence, or connect to an agent you already use.

| Your intent | Start here | What happens |
|---|---|---|
| Run a native task | `amc agent-loop guide` | Read-only guidance for an explicit provider, model and credential reference. |
| Assess existing evidence | `amc` | Creates or updates an evidence baseline; a valid report can still have insufficient evidence. |
| Connect an existing agent | `amc connect --help` | Shows capture and connection options for your existing runtime. |

The native guide does not contact a model, open a session or change configuration. Choose OpenAI Chat Completions (`openai`), OpenAI Responses (`openai-responses`), or Anthropic with a model you can access for a real task. Choose `--provider stub` explicitly for a local recording demonstration; it does not produce a real model answer. Native commands pin the selected agent: explicit `--agent`, then `AMC_AGENT_ID`, the workspace's current agent, and finally `default`.

See [the native task quickstart](QUICKSTART.md#run-a-native-task) for the commands and separate evidence verification step.

**First governed turn, keyless.** A fresh workspace denies every native tool call
until its Runtime Firewall policy is signed; `amc init` signs the tool allowlist but
leaves that policy to you, and prints the three actions that follow it:

```bash
export AMC_VAULT_PASSPHRASE='<a passphrase you keep>'   # signing commands read it from the shell
amc init --minimal
amc firewall enable                                       # creates + signs the policy; idempotent; explains what it wrote
amc --agent default agent-loop run "Check recording with a local demonstration." --provider stub --model amc-stub-1 --tools echo --max-steps 2 --max-tokens 512
amc agent-loop verify <session-id>                        # the run prints the session id
```

`amc doctor` names each missing precondition and the exact command that fixes it
(`runtime-firewall-policy` and `vault` are the two a fresh init leaves open); plain
`amc doctor` warns, `amc doctor --strict` fails closed on the same checks. See
[Quickstart](QUICKSTART.md#first-governed-turn-in-three-actions-keyless) for the
measured timing of this path.

For daily interactive use, run `amc agent-loop chat` with the same provider, model
and credential reference. `--credentials-home` selects the shared skills directory
at `<home>/skills` as well as the default credential-file location.
`--credentials-file` can point elsewhere; it does not replace the selected skills
home. The guide's provider choices and ready command retain these independent
selections. Chat retains the explicit home and pinned credential file in every
child turn and in its printed resume command, so a home-only slash skill is not
lost when the next process starts. Workspace skills still take precedence.

Pass reference names with `--credential`, never secret values. Local metadata
being present does not prove remote authentication, task correctness or verified
evidence; each remains a separate outcome.

Native run output, chat replies and `amc session show <session-id>` display
**cumulative recorded-session usage**, not counters remembered by the process.
Inspection follows the workspace's recorded SQLite or JSONL backend and does not
take a session writer. A missing or unreadable selected history is not replaced
with a different backend. Use `amc agent-loop verify <session-id>` separately for
evidence verification; inspection alone does not authenticate the rows.

Token totals are labelled **observed subtotals**. Missing reports, partial failed
streams, pending requests and local stub demonstrations remain visible. Retry
attempts are counted once per recorded request, not again from step summaries.
Unreported cache counts say `unreported`, never measured zero. The displayed
**cache-read share of reported input** divides cache-read tokens by uncached input
plus reported cache-read/write tokens from complete reports with a cache-read
count. Its coverage names excluded requests and missing cache-write fields: it is
not an all-request hit probability, a complete-input ratio when fields are absent,
or a billing-savings estimate. A zero denominator has no rate. Historical records
without explicit report provenance remain unknown rather than being upgraded.

Chat checks a child command's result before adopting its session reference. A
resume must return the requested session; a fork must return a distinct child.
Truncated or malformed output and unsupported driver states stop chat without an
automatic retry or a guessed session ID. The previous known reference, when one
exists, remains available for deliberate inspection and verified resume. This
protocol check does not itself verify signatures or prove a task succeeded: a
valid failed or cancelled result retains its recorded outcome.

Interactive approval also separates a signed decision from clean command
delivery. If the decision command exceeds its deadline, even a later graceful
zero exit is not clean delivery. Chat reads back the signed queue, names whether
the decision was recorded, does not resend it, and requests cancellation of the
waiting turn. Inspect that exact approval before taking another action; existing
authenticated reviewer, request-digest and quorum requirements still apply.

Native failures now display a supported failure code and an inspection action,
not arbitrary exception text. Recorded failed-attempt diagnostics appear in run
text/JSON, chat and session inspection. These are cumulative: an earlier failed
attempt can be followed by a successful retry, so read the latest turn ending and
validation separately. Missing or inconsistent recorded metadata remains unknown.
Suggested actions do not retry the task, change a signed budget, reset usage or
re-sign policy. Use the session reference printed by the command in place of
`<session-id>`; use its recorded owner in place of `<recorded-agent>`.

Use `--no-delegate` on native `run` or `chat` to disable child delegation even
when a signed preset enables it. Chat retains the selected disabled posture in
every child and printed resume command. Inherited child-only defaults cannot
silently turn it back on; contradictory explicit child scope/depth/provider/stop
settings are refused rather than ignored. The selected preset must still verify,
and tool allowlists, approvals, budgets and all other composition settings remain
in force. Disabling children does not grant any additional parent permissions.

## What AMC is

AMC combines a governed native agent runtime with evidence-based assessment for agents and other runtimes.

If you want the repo-backed architectural version of that statement before choosing a path, read `docs/ARCHITECTURE_BRIEF.md`.

It helps you:
1. **Score** an agent from evidence
2. **Find** trust and governance gaps
3. **Generate** fixes, reports, and next actions

If you only remember one thing, remember this:

> AMC is strongest when you want evidence, not vibes.

---

## Choose your path

## Path 1 — I just want to try it right now
Use the browser playground.

- URL: `website/playground.html`
- Best for: first-touch demos, lightweight exploration, understanding the scoring model
- Limitation: browser try-now is for exploration, not full execution evidence capture

Next step:
- Go to the playground
- Explore the questions and scenarios
- If you want real traces / datasets / CI gates, move to the CLI path

---

## Path 2 — I want a real score locally
Use the CLI.

```bash
curl -fsSL https://agentmaturity.co/install.sh | sh
amc
```

On Windows PowerShell, install with `irm https://agentmaturity.co/install.ps1 | iex`, then run `amc`.

The first run is an honest baseline. A signed `VALID` artifact can still be `INSUFFICIENT_EVIDENCE`; capture a real agent run and rerun before making external claims. Only evidence readiness `READY` is claim-eligible.

Best for:
- scoring a real project
- getting a trust maturity level
- seeing practical gaps
- generating fixes

Recommended next steps after your first score:
1. `amc`
2. `amc fix`
3. `amc doctor --json`
4. review `docs/AFTER_FIRST_SCORE.md`

---

## Path 3 — I want AMC in CI
Use the GitHub Action / CI workflow.

Best for:
- score thresholds
- preventing trust regressions
- PR comments and artifacts
- repeatable release gates

Start here:
- `.github/workflows/amc-score.yml`
- `docs/CI_TEMPLATES.md`

---

## Path 4 — I want compliance and governance outputs
Use AMC when you need more than a score.

Best for:
- EU AI Act mapping
- audit binders
- governance evidence
- regulated delivery workflows

Start with:
- **Comply** concepts in the README
- compliance docs in `docs/`
- binder/report generation workflows

---

## Path 5 — I already have an agent stack
AMC works best when it wraps what you already run.

Examples:
- LangChain
- CrewAI
- AutoGen
- OpenAI Agents SDK
- Claude Code
- Gemini
- OpenClaw
- generic CLI agents

Use:

```bash
amc wrap <adapter> -- <your command>
```

Then move into:
- full scoring with `amc`
- traces
- assurance packs
- CI

---

## AMC product family

These names are canonical:

- **Score** — trust scoring and maturity diagnostics
- **Shield** — adversarial assurance packs
- **Enforce** — policy controls and approvals
- **Vault** — signatures, proof chains, evidence integrity
- **Watch** — traces, anomalies, monitoring
- **Fleet** — multi-agent oversight and inventory
- **Passport** — portable identity and credential artifacts
- **Comply** — compliance mapping and audit outputs

Do not overthink this on day one.
If you are new, start with:
- Score
- then Shield
- then Watch / Comply as needed

---

## Recommended first 15 minutes

1. Install from the verified release script, then run `amc`
2. Read the gaps
3. Run `amc fix`
4. Read `docs/AFTER_FIRST_SCORE.md`
5. Decide whether you need:
   - browser exploration
   - local CLI workflows
   - CI gating
   - compliance outputs

---

## Honest scope notes

- The browser path is a real playground, not a fake full browser execution runtime.
- The CLI is the serious path for execution evidence, traces, datasets, and CI.
- Single-binary packaging exists as an experimental path and should be treated honestly.
- SDKs, editor integrations, and CI shells are useful, but most of them wrap the same TypeScript runtime rather than replacing it.
- If you want that distinction spelled out, read `docs/IMPLEMENTATION_REALITY_MAP.md`.

---

## Next docs to read

- `docs/ARCHITECTURE_BRIEF.md`
- `docs/IMPLEMENTATION_REALITY_MAP.md`
- `docs/deep-dive/INDEX.md`
- `docs/AFTER_FIRST_SCORE.md`
- `docs/QUICKSTART.md`
- `docs/ADAPTERS.md`
- `docs/CI_TEMPLATES.md`
- `docs/BROWSER_SANDBOX.md`
- `docs/SINGLE_BINARY.md`
