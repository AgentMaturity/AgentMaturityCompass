# START_HERE.md — Where to begin with AMC

AMC can look broad because it is broad. This page is the shortest route to the right starting point.

## What AMC is

AMC is a trust score for AI agents.

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
npx agent-maturity-compass quickscore
```

Best for:
- scoring a real project
- getting a trust maturity level
- seeing practical gaps
- generating fixes

Recommended next steps after your first score:
1. `amc quickscore`
2. `amc fix`
3. `amc doctor --json`
4. review `docs/AFTER_QUICKSCORE.md`

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
- `quickscore`
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

1. Run `npx agent-maturity-compass quickscore`
2. Read the gaps
3. Run `amc fix`
4. Read `docs/AFTER_QUICKSCORE.md`
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
- `docs/AFTER_QUICKSCORE.md`
- `docs/QUICKSTART.md`
- `docs/ADAPTERS.md`
- `docs/CI_TEMPLATES.md`
- `docs/BROWSER_SANDBOX.md`
- `docs/SINGLE_BINARY.md`
