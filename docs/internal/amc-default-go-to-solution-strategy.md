# Making AMC the default go-to solution for AI agents

_Strategy note — 2026-07-14. Internal._

_Update 2026-11-07: Industry Packs are free (ADR 019, `docs/adr/019-industry-packs-free.md`), so this note's plans to sell them are withdrawn and the lines that described them are updated._

## The one-sentence position

**AMC is the trust layer for AI agents: the tool that decides whether an agent
is safe to ship and produces the signed proof to back it.** Eval tools tell you
if a prompt is good; AMC tells you if the whole agent is trustworthy — across
Score, Shield, Enforce, Vault, Watch, Comply, Fleet, and Passport — and gives
you evidence anyone can verify without trusting you.

The durable moat is **signed, verifiable evidence**. Competitors emit reports;
AMC emits receipts. Everything below leans on that.

## Why "default" is winnable

- The category (agent governance / assurance) is still forming — no default yet.
- AMC is already deep: 8 surfaces, 142 assurance packs, 15 adapters, 1,171 CLI
  paths, a signed evidence ledger, and compliance crosswalks. The gap to
  "default" is **distribution and habit**, not capability.
- The buyer is bifurcated (developers + governance/risk). AMC is one of the few
  tools that serves both from the same artifact.

## The five moves that create default status

1. **Be one command, everywhere it already hurts.** `amc start` is done. Next:
   be *inside the loop* — a GitHub Action, a pre-commit hook, and a CI gate that
   fails a PR below a grade. Tools become defaults when they live in CI, not when
   they're run by hand. (AMC already has `amc run --fail-below`; package it as a
   marketplace Action with a 3-line setup.)
2. **Win on free.** The whole product, the trust stack, the Industry Packs and
   the Industry Pack Audit included, is MIT and free. The wedge is *proof you
   can hand to someone else* — which is exactly what the Industry Pack Audit
   does (see below).
3. **Make the evidence portable and social.** The Passport + signed bundles let
   a vendor hand a buyer an AMC score they can verify offline. Every verified
   bundle is a distribution event. Push "verify anyone's agent" as a first-class
   verb (`amc bundle verify`), and seed it with a public sample (already live at
   `/verify`).
4. **Own the compliance crosswalk.** One AMC run should satisfy EU AI Act, NIST
   AI RMF, ISO 42001, and SOC 2 evidence asks simultaneously. This is the single
   biggest time-saver for the governance buyer and the hardest thing for a
   dev-only eval tool to copy. The Industry Pack Audit is the first delivery of
   this; extend it to the core 8-surface run next.
5. **Ship trust about AMC itself.** The tool that grades trustworthiness must be
   visibly trustworthy: reproducible builds, a public methodology, a verifiable
   install (done), and — when ready — AMC's own SOC 2 / ISO posture published.

## Gaps to close (prioritized)

**Now (unblock distribution):**
- **npm publish (AMC-5).** Nothing compounds until `npx agent-maturity-compass`
  works. It's one credentialed step away; the package is verified publish-ready.
- **GitHub Action + pre-commit packaging.** Turn the existing CI gate into a
  one-copy-paste Action. This is the habit-forming surface.

**Next (deepen the wedge):**
- **Industry Pack Audit.** Shipped this iteration (below). Industry Packs are
  free since 2026-11-07, so there is no checkout to wire.
- **Continuous monitoring, not one-shot scoring.** A scheduled re-audit that
  alerts on drift turns AMC from a checkup into a heartbeat — and into a renewal.
- **Extend the multi-framework crosswalk from Industry Packs to the core run.**

**Later (widen the moat):**
- **More sectors** for Industry Packs (insurance/NAIC, energy/NERC CIP,
  telecom) — breadth widens adoption.
- **Marketplace network effects** — community packs, ratings, install counts.
- **Hosted verification endpoint** for teams that want a URL, not a CLI.

## How the Industry Pack Audit fits (shipped this iteration)

The Industry Packs were a questionnaire. They are now an **audit
deliverable**: for any pack, `amc domain apply --pack <id> --audit` produces a
signed bundle that scores each control, maps it across EU AI Act / NIST / ISO
42001 / SOC 2 + the sector regulation, states the expected evidence, and
generates a concrete fix for every gap — tamper-evident via a recomputable
receipt. That is the difference between "here's your score" and "here's the
binder you hand your auditor," which is what a compliance buyer actually
needs. Pack answers stay self-reported and the content experimental, so the
bundle is never a certification or a compliance verdict. It directly advances moves 2, 3, and 4 above.

## The scoreboard (what "default" looks like)

- `npx agent-maturity-compass` works and trends on npm.
- AMC runs in CI on real repos (Action installs, PRs gated).
- Verified bundles circulate between vendors and buyers.
- Regulated teams run the free Industry Pack Audit and share its bundles.
- "Is your agent AMC-graded?" is a question buyers start asking vendors.
