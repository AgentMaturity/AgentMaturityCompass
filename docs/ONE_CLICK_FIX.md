# Design: One-click "fix & upgrade my agent" (`amc fix`)

**Status:** Design — approved direction ("feature now, design the one-click flow").
**Goal:** Anyone — including someone who has never opened a terminal — can go from
"I have an AI agent" to "AMC found the problems and fixed them" in a single click
or a single command, then watch the score go up.

This is the Pi.dev idea ("just ask, it fixes itself") applied to AMC, on top of
capabilities that already ship today.

---

## 1. What already ships (so the website claim is true now)

AMC is already more than a scorer. Two commands do real fixing today:

- `amc run --fix` — runs the full assessment, then generates a **signed,
  one-command fix plan** (`buildAgentFixPlan` → `writeAgentFixPlan`) describing
  the highest-impact improvements.
- `amc guide --go` — the zero-friction path: auto-detects the agent framework,
  scores, generates framework-specific guardrails, and **writes them straight
  into the agent's own config files** (AGENTS.md, CLAUDE.md, .cursorrules, and
  the other `KNOWN_AGENT_CONFIGS`) via `applyGuardrails`.

So "AMC fixes the gaps for you" is honest today. What's missing is a single,
obvious, friendly entry point a non-coder will remember. That is `amc fix`.

## 2. The `amc fix` command

One command. No flags required. It composes the pieces above into a guided,
plain-language loop.

```
amc fix
```

### Flow

1. **Look** — detect the agent framework and instruction/skill files already in
   the folder (reuses `detectFramework` + the onboarding `detectAgentInstructionSources`).
   Print, in plain words, what AMC found: "Found your Claude Code setup and AGENTS.md."
2. **Score** — run the assessment (reuse the `run` path; `--quick` for the rapid
   5-question score when there is no evidence yet). Show the current grade as a
   report card, not a wall of numbers.
3. **Explain** — list the top 3 fixes in one sentence each ("Your agent has no
   runtime policy check — anything it's told, it runs."). No jargon.
4. **Fix (ask first)** — show exactly which files will change and what will be
   added, then ask once: "Apply these fixes? [Y/n]". On yes, call `guideToGuardrails`
   + `applyGuardrails` to write the guardrails into the detected agent files, and
   `writeAgentFixPlan` to stage the signed plan. Non-interactive/`--yes` applies
   directly; `--dry-run` previews only.
5. **Re-score & show lift** — re-run the score and print before → after:
   "Trust score: L1 → L3. Fixed 4 of 6 gaps. Your agent is now review-ready."
6. **Next** — one line: "Run `amc fix` again after your next change, or open the
   app to watch it live."

### Output sketch

```
  Looking at your agent…  Claude Code + AGENTS.md found.
  Scoring…                L1 (32/100) — "Aware, not yet safe."

  Top 3 things to fix:
    1. No runtime policy check — the agent runs whatever it's told.
    2. No fallback when the model is down — it just crashes.
    3. Secrets can leak into logs.

  Apply these fixes to AGENTS.md and .claude/settings.json? [Y/n] y

  Fixed. Re-scoring…      L3 (61/100)  ▲ +29
  4 of 6 gaps closed. Your agent is now review-ready.
  Re-run `amc fix` anytime, or open Studio to watch it live.
```

### Flags (all optional)
- `--yes` — apply without the confirmation prompt (for scripts/CI).
- `--dry-run` — show the plan and the exact diffs, change nothing.
- `--agent <id>` — target a specific agent.
- `--json` — machine-readable result (grade before/after, files changed, gaps closed).

### Safety (non-negotiable)
- **Never touches API keys or credentials.** `amc fix` reads config and writes
  guardrails; it never asks for, stores, or transmits a key. Bring-your-own-key stays the user's action.
- **Asks before writing** by default; every changed file is shown first; changes
  are additive guardrail blocks that are easy to revert (git diff).
- **Signed** — the fix plan is written with AMC's signature so the before/after
  is verifiable evidence, not a claim.

## 3. The app parallel (Studio "Fix" button)

Studio already renders the score, top gaps, and READY/blocked state. Add one
primary button: **"Fix my agent."** It calls the same code path as `amc fix`,
shows the same "here's what I'll change" confirm sheet, applies, and animates the
score moving up. This is the true one-*click* experience for people who never
open a terminal — the download-first homepage now points here.

## 4. Upgrade loop (beyond one-shot fixing)

"Fix" closes today's gaps. "Upgrade" keeps the agent improving:

- After a fix, AMC records the signed before/after as evidence.
- `amc fix --watch` (or the Studio toggle) re-checks on each change and offers the
  next fix when the score regresses or new gaps appear — the Diagnose → Fix →
  Re-score loop from the whitepaper, made one-click.
- Industry Pro Packs ($19/user/month) add sector-specific fixes (HIPAA, EU AI
  Act, etc.) to the same button for regulated teams.

## 5. Implementation plan (small, low-risk)

`amc fix` is a thin composition of shipping functions — no new fix engine:

1. Extract the `guide --go` happy-path (`detectFramework` → score →
   `generateGuide` → `guideToGuardrails` → `applyGuardrails` over
   `KNOWN_AGENT_CONFIGS`) into a reusable `runOneClickFix(opts)` in
   `src/guide/` so both `guide --go` and `fix` call it (guide behavior unchanged).
2. Register `amc fix` in the CLI as a friendly wrapper over `runOneClickFix`
   with the flags above; regenerate `docs/CLI_COMMAND_INVENTORY.md`.
3. Add the score-before / apply / score-after wrapper and the plain-language
   renderer.
4. Add the Studio "Fix my agent" button calling the same path.
5. Tests: unit-test `runOneClickFix` (fixture agent → files written, gaps closed),
   and a CLI smoke test for `amc fix --dry-run`.

Estimated: one focused change, fully gate-testable, no new dependencies.

---

*Companion to the app-first homepage: the site promises "download it, fix it in
one click." `amc guide --go` backs that today; `amc fix` makes it a command a
first-timer can guess.*
