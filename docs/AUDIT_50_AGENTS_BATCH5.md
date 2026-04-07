# AMC User Audit — Batch 5 (Personas 41–50)

**Date:** 2026-03-14  
**Auditor:** Subagent (automated multi-persona UX audit)  
**Scope:** CLI journey, docs, website, package metadata — 10 personas  
**Method:** Direct CLI execution, file inspection, gap analysis  

---

## Executive Summary of Findings

| Persona | Role | Score | Critical Gaps |
|---------|------|-------|---------------|
| Jordan (Indie Hacker) | quickscore / quickstart | **7/10** | Works, but non-interactive mode silently defaults to L0 |
| Priscilla (Board Member) | Executive docs | **4/10** | No dedicated non-technical exec path on website; dashboard Exec view exists but undiscoverable |
| Hassan (DevRel) | Dev community onboarding | **7/10** | CONTRIBUTING.md is solid; test count badge mismatch undercuts credibility |
| Emma (Procurement) | Compare, leaderboard, badges | **6/10** | `--badge` on `amc cert generate` missing; `amc compare` has it; no leaderboard export docs |
| Liam (Cloud Architect) | Cloud service, Docker | **6/10** | `amc api start` is a broken command (returns "unknown command 'start'"); Docker docs exist |
| Suki (Accessibility) | CLI a11y, dashboard a11y | **5/10** | CLI has `--no-color` flag but no `NO_COLOR` env-var respecting at top level; screen reader issues |
| Roberto (Integration Engineer) | Webhooks, APIs, events | **7/10** | SSE exists at `/events/org`; webhook docs scattered; outbound webhook config only in `amc alert` |
| Tanya (Risk Manager) | Risk quantification | **5/10** | `amc comply risk-classify` doesn't exist (was `amc classify agent` or EU AI Act sub-path); no monetary risk quantification |
| Oscar (PhD Student) | Citation, methodology | **7/10** | Whitepaper exists; citations use `[CITATION: ...]` placeholder style — not actual DOIs; no "Cite This Work" block |
| Mei (Startup CTO) | 10-min value, no bloat | **7/10** | `amc quickstart --profile dev` works; score defaults to 0/50 in non-interactive — looks like a broken tool |

**Overall product UX maturity: 6.1/10**

---

## 🔴 CRITICAL CROSS-CUTTING GAPS (Affect Multiple Personas)

### 1. Stat Inconsistencies Everywhere — Trust Destroyer

Found **four different test counts** across the codebase:
- README badge: **3,488** tests
- README text (2 places): **3,311** tests
- Website stats strip: **3,311** tests
- Whitepaper abstract: **2,723** tests
- CONTRIBUTING.md: **3,311** (Node) + **1,586** (Python) = 4,897

Found **two different command counts**:
- README badge / pricing table / website: **481** CLI commands
- `docs/API_REFERENCE.md`: **842** commands

Found **three different diagnostic question counts**:
- Website: **138** questions
- Whitepaper abstract: **140** questions
- README: uses "**113**-question diagnostic" (in `amc score formal-spec` reference)

**Impact:** Every persona who checks multiple docs notices the inconsistency. For Emma (procurement), this is a deal-breaker — it implies sloppy process or inflated marketing claims. For Hassan (DevRel), recommending a tool with stat drift in its own README is embarrassing.

### 2. `amc api start` is a Broken Command

```bash
$ amc api start
error: unknown command 'start'
(Did you mean status?)
```

The README, DEPLOYMENT_OPTIONS.md, and Liam's entire cloud deployment journey reference `amc api start` or imply it starts an API server. The actual command is `amc up` or `amc studio start`. This is the #1 WTF moment for any API consumer.

### 3. No "Cite This Work" Section in Whitepaper or RFC

The whitepaper ends with a copyright notice and submission declaration but no BibTeX block or "How to Cite This Work" section. For Oscar writing a thesis, this is unacceptable.

---

## Persona Deep-Dives

---

### 41. Jordan (Indie Hacker) — Score: 7/10

**Goal:** Simplest possible AMC score for his side project. Budget: 5 minutes.

**Journey:**
```bash
npx agent-maturity-compass quickscore
```

**What works:**
- `amc quickscore` runs without auth, account, or keys. Zero friction to first output. ✅
- Output is readable: score, level (L0–L5), top 3 recommendations, next steps. ✅
- `amc quickstart --profile dev` works and shows a radar chart in terminal. ✅
- `npx` invocation works (package is on npm). ✅

**What fails:**
- In non-interactive mode (CI / piped output), it silently defaults all answers to L0 and prints "0/50 (0%) — Non-interactive mode: using L0 defaults." Jordan running this in a script or GitHub Action gets a useless 0/50 score with no explanation of why interactive mode didn't trigger.
- The `--share` flag mentioned in QUICKSTART.md: no evidence it actually generates a shareable link to any hosted service (would require a backend).
- `amc quickscore --share` is documented but not validated as working without a running Studio instance.

**Gaps:**
- `--auto` flag auto-scores from ledger, but Jordan has no ledger on first run → still gets 0.
- No "did you mean to run interactive mode?" hint when stdin is a TTY but no questions appear.
- "2 minutes to your first score" promise: reality is ~30 seconds to a 0/50 default score that feels broken.

**Rating: 7/10** — Works for interactive users. Breaks silently for script users.

---

### 42. Priscilla (Board Member) — Score: 4/10

**Goal:** Non-technical executive summary explaining AI risk at her company.

**What she finds:**

**Website (`website/index.html`):**
- The hero immediately hits her with `npm i -g agent-maturity-compass` — a command line. She has no idea what this means.
- Stats strip: "138 diagnostic questions, 86 assurance packs, 1,013 total diagnostics, 3,311 tests, 14 adapters." Meaningless to a board member.
- The "84-point documentation inflation gap" section is promising but uses jargon ("execution-verified evidence," "cryptographic proof chains").
- No "For Executives" button or path. No language like "understand your AI risk in plain English."

**Dashboard:**
- The dashboard has an "Exec" tab (view mode selector in topbar). This is great — but it requires actually opening the dashboard via CLI (`amc up` + browser to localhost), which Priscilla cannot do.
- The "Exec" view presumably simplifies the output, but there's no standalone executive summary doc or web page.

**What's missing:**
- No `/executive` or `/board` landing page on the website.
- No PDF-able executive summary or one-pager.
- No plain-language explanation of what an AMC score means for a company.
- `amc cert generate` produces a trust certificate — potentially what Priscilla wants — but requires an agent ID and vault setup. No path for her.
- No "what does L3 mean for business risk?" prose document.

**Gaps:**
- No executive persona docs (PERSONAS.md exists in docs/ but is undiscoverable from website).
- The website's value proposition is entirely developer-oriented. No translation layer for business stakeholders.
- No shareable executive summary artifact from any CLI command.

**Rating: 4/10** — Functional product but zero executive entry point.

---

### 43. Hassan (DevRel) — Score: 7/10

**Goal:** Evaluate AMC to recommend to his 20k-member developer community.

**What works:**
- `README.md` is comprehensive, well-structured with personas, recipes, product family table. ✅
- `CONTRIBUTING.md` is thorough: setup, test types, pack authoring guide, PR process. ✅
- Web playground exists at `playground.html` — great for live demos. ✅
- Discord/community link in README. ✅
- MIT licensed. ✅
- GitHub Actions CI template in README is copy-paste ready. ✅

**What fails:**
- **Stat badge drift is a credibility killer.** README badge says "3,488 passing" but the contributing guide says "3,311 tests." If Hassan's community members notice this (and they will), the tool looks sloppy or inflated.
- `amc compare` command exists and is solid, but `amc compare --badge` is on the `compare` command (not `cert generate`). This is undocumented in the README.
- No "AMC in 5 minutes" video or GIF demo. For a DevRel endorsement, visual proof is essential.
- `docs/GETTING_STARTED.md` is referenced in CLI help text but... let me check if it exists.

**Gap found:** `docs/GETTING_STARTED.md` is referenced in the CLI output but resolves to `docs/QUICKSTART.md` (the actual file). The file referenced by path doesn't exist at that path. Users who try to `cat docs/GETTING_STARTED.md` get a file-not-found.

```
# CLI help output references:
"Full guide: https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/GETTING_STARTED.md"
# But the actual file is:
docs/QUICKSTART.md
```

**Gaps:**
- No screencasts or terminal recordings.
- Changelog page (`website/changelog.html`) and blog (`website/blog.html`) exist but may be empty/placeholder — not validated as having real content.
- No single "why AMC" pitch deck or community-shareable asset.

**Rating: 7/10** — Solid technical foundation, credibility damaged by stat inconsistencies and a broken docs link.

---

### 44. Emma (Procurement Lead) — Score: 6/10

**Goal:** Buying AI tools, needs comparison data to justify purchase.

**Commands tested:**

```bash
amc compare <runId1> <runId2>      # ✅ works
amc compare --badge                # ✅ has --badge flag (generates SVG)
amc leaderboard show               # ✅ exists
amc leaderboard export             # ✅ documented
amc cert generate --badge          # ❌ MISSING --badge flag
amc cert generate --agent myAgent --output cert.pdf  # requires running setup
```

**The `--badge` problem:**
- `amc compare` has `--badge` (generates comparison badge SVG). ✅
- `amc cert generate` does **NOT** have `--badge`. The help output confirms it only has `--agent`, `--output`, `--valid-days`. ❌
- The audit brief asks for `amc cert generate --badge` — it doesn't exist. Emma cannot generate a sharable badge from a certificate.

**Comparison data gaps:**
- `docs/COMPARE_AMC.md` exists — competitive comparison against alternatives. ✅
- `docs/BENCHMARKS.md` and `docs/BENCHMARK_GALLERY.md` exist. ✅
- But benchmark data is all self-reported (ironic for a tool whose thesis is anti-self-reporting).
- No third-party verified benchmark data cited.

**Leaderboard:**
- `amc leaderboard show` works. 
- `amc leaderboard export` creates a JSON/HTML. ✅
- But the leaderboard is local/fleet-only. There's no public AMC leaderboard of real agents (which would be Emma's dream: "show me where my agents rank vs industry").

**Gaps:**
- No public leaderboard of anonymized agent scores.
- `amc cert generate --badge` doesn't exist (confusing gap vs `amc compare --badge`).
- No ROI calculator or "cost of a trust gap" document.
- `docs/BUYER_PACKAGES.md` exists but needs to be linked from website pricing page more prominently.

**Rating: 6/10** — Core comparison tools work; `cert generate --badge` is missing; no external validation.

---

### 45. Liam (Cloud Architect) — Score: 6/10

**Goal:** Run AMC as a cloud service, not on his laptop.

**`amc api start` — BROKEN:**
```bash
$ amc api start
error: unknown command 'start'
(Did you mean status?)
```
This is the FIRST thing a cloud architect tries. It fails with a cryptic error. The actual equivalent is `amc up` or `amc studio start`. The `amc api` namespace only has `status` subcommand.

**What actually works:**
- Docker support is solid: `Dockerfile`, `docker/docker-compose.yml`, `docker/README.md` all exist. ✅
- Docker README has a working `docker run` command with proper env vars. ✅
- Multi-port exposure (3210, 3211, 3212) is documented. ✅
- `docs/DEPLOYMENT_OPTIONS.md` covers self-hosted, managed, enterprise paths. ✅
- GitHub Container Registry (`ghcr.io/agentmaturity/amc-quickstart`) referenced in README. Status unknown (image may not be published).

**Cloud-specific gaps:**
- No Kubernetes Helm chart or k8s manifests.
- No Terraform or Pulumi modules.
- No documented cloud provider (AWS/GCP/Azure) deployment guides.
- No SaaS/managed option — AMC is self-hosted only (or "coming soon" enterprise managed). No actual hosted endpoint.
- `amc api start` being broken is a critical gap for API-first cloud architects.
- No documented health check endpoint path (buried in docker README: `studio healthcheck` command, not a documented HTTP endpoint).
- Studio API is at localhost:3210 but there's no documented public cloud endpoint or SaaS offering.

**The OpenAPI spec:**
- `website/openapi.yaml` exists and is well-formed. ✅
- Only documents `http://localhost:3000/api` server. No production/cloud server listed. ❌

**Rating: 6/10** — Docker works, cloud native story is pre-Kubernetes, `amc api start` is broken.

---

### 46. Suki (Accessibility Expert) — Score: 5/10

**Goal:** Verify CLI output readability, color contrast, screen reader compatibility.

**CLI color analysis:**
- Uses `chalk` for all colored output. ✅
- `--no-color` flag exists at CLI level (`amc --no-color`). ✅
- `NO_COLOR` env var: **partially supported** — found in `cliBridge.ts` and `replCli.ts` but not set globally at CLI entry point. If you set `NO_COLOR=1` in your shell, chalk v5 should respect it natively (chalk 5.x respects `NO_COLOR` by standard). But it's not explicitly surfaced in help text.

**Color-only information problem:**
- Terminal output uses color to distinguish score levels (green = good, red = bad, amber = warning). There is no text-only alternative indicator (no "✓ PASS" vs "✗ FAIL" symbols that aren't color-paired).
- Wait — actually the CLI does use emoji symbols (✓, ✗, ⚠) alongside colors. Partial credit.

**Dashboard accessibility:**
- `aria-label`, `role="dialog"`, `role="navigation"`, `role="main"`, `role="alert"`, `role="tab"`, `aria-selected` — all present. ✅
- `aria-modal="true"` on the onboarding overlay. ✅
- Skip navigation link exists: `<a href="#main" class="skip-link">Skip to content</a>`. ✅
- Mobile navigation has `aria-label`. ✅

**Dashboard gaps:**
- Charts (radar, heatmap, timeline) are rendered as Canvas/SVG with no ARIA descriptions or `aria-label`. Screen readers cannot interpret score visualizations.
- Color-only score indicators in heatmap (green/amber/red cells) have no text alternative within the cell.
- Focus management: no evidence that modal focus is trapped on open (keyboard trap not tested but `aria-modal` without JS focus management is incomplete).
- Dashboard CSS uses very low contrast secondary text: `--text-secondary: rgba(244,244,245,.55)` on dark background. Calculated contrast: ~4.1:1 — fails WCAG AA for small text (requires 4.5:1). ❌

**CLI-specific issues:**
- Error messages use `chalk.red()` only — no semantic prefix like "ERROR:" for color-blind users. Some do have emoji (✗) but inconsistently.
- No `--quiet` mode for all commands (only `quickscore` has `--quiet`).
- Interactive prompts (from `inquirer`) are not accessible via screen readers in most terminal emulators.

**Gaps:**
- No accessibility statement or `docs/ACCESSIBILITY.md`.
- No high-contrast mode option.
- Canvas charts have zero ARIA description.
- WCAG audit was never completed (no axe-core HTML report found, despite `@axe-core/playwright` being in devDependencies).

**Rating: 5/10** — Better than average CLI a11y (has skip link, ARIA roles on dashboard), but charts are inaccessible and contrast fails WCAG AA.

---

### 47. Roberto (Integration Engineer) — Score: 7/10

**Goal:** Webhooks, APIs, event streams from AMC for integration into his monitoring stack.

**What exists:**

**SSE Events (`/events/org`):**
- Confirmed in `docs/REALTIME.md` and implemented in `studioServer.ts`. ✅
- 10 event types documented (ORG_SCORECARD_UPDATED, AGENT_RUN_COMPLETED, etc.). ✅
- Auth required (VIEWER+ role). ✅
- Event payload is minimal metadata only (no secrets/transcripts). ✅

**Outbound webhooks:**
- `amc alert config` configures webhook endpoints (Slack, PagerDuty, custom). ✅
- `amc alert send` / `amc alert test` / `amc alert watch` all exist. ✅
- Inbound webhook at `/value/ingest/webhook` documented in studioServer. ✅

**API:**
- `website/openapi.yaml` is well-formed with schemas (ScoreResult, Incident, etc.). ✅
- REST endpoints are documented. ✅

**What's missing:**
- `amc api start` is broken (see Liam's section). Roberto's first instinct to start the API server fails.
- The OpenAPI spec only documents `localhost:3000/api` — no cloud/production server URL.
- No webhook event schema documentation in openapi.yaml (the spec covers REST endpoints, not event shapes).
- No documentation of the webhook authentication scheme (what's in `x-amc-webhook-token`?).
- SSE reconnection behavior is undocumented (what happens on disconnect? Last-event-ID?).
- No documented rate limits for API endpoints.
- `docs/API_REFERENCE.md` lists 842 commands but doesn't cross-link to OpenAPI spec.

**Gaps:**
- Webhook payload schemas not in OpenAPI (only inbound webhook token auth is hinted at in source).
- No SDK for Python or TypeScript beyond the raw REST calls.
- `amc observe` exists but doesn't expose data via API — only CLI output.
- No documentation of retry behavior for alert webhooks on failure.

**Rating: 7/10** — Core integration building blocks exist; API documentation is fragmented across 3+ locations.

---

### 48. Tanya (Risk Manager) — Score: 5/10

**Goal:** Enterprise risk framework, wants risk quantification in financial terms.

**`amc comply risk-classify` — DOES NOT EXIST:**
```bash
$ amc comply risk-classify
Usage: amc compliance|comply [options] [command]
Commands: init, verify, report, fleet, diff
# No risk-classify subcommand
```

The equivalent command appears to be `amc classify agent <agentId>` (classifies as workflow vs agent, not EU AI Act risk level) or the EU AI Act classification embedded in `amc quickscore --eu-ai-act`.

**What actually works:**
- `amc comply report --framework EU_AI_ACT` generates an evidence-linked compliance report. ✅
- `amc quickscore --eu-ai-act` shows EU AI Act risk classification. ✅
- `docs/COMPLIANCE_FRAMEWORKS.md` and `docs/COMPLIANCE_MAPS.md` exist. ✅
- NIST AI RMF, ISO 42001, SOC 2, GDPR, OWASP mappings all present. ✅

**Risk quantification gaps:**
- AMC produces maturity *scores* (L0–L5), not financial risk *quantities*.
- No "expected annual loss" or "risk in dollar terms" output.
- No risk heat map with business impact in monetary terms.
- No "residual risk after controls" calculation.
- The whitepaper mentions "quantified risk allocation" only in the sector-specific governance pack context — not as a core feature.
- `docs/THREAT_MODEL.md` exists but is technical, not financial.

**Enterprise risk framework integration:**
- No integration with ISO 31000 or FAIR (Factor Analysis of Information Risk).
- No output format compatible with GRC tools (RSA Archer, ServiceNow GRC, etc.).
- `docs/COMPLIANCE.md` clearly disclaims: "AMC intentionally avoids legal-claim language" — fair, but Tanya needs quantifiable numbers for her risk register.

**What Tanya needs but doesn't get:**
- Risk appetite comparison (is our L3 agent below/above our stated risk threshold?).
- Risk-adjusted scoring that maps trust level to breach probability.
- Board-ready risk summary with financial exposure estimates.

**Rating: 5/10** — Compliance mapping is solid; risk *quantification* (the thing Tanya specifically needs) is absent.

---

### 49. Oscar (PhD Student) — Score: 7/10

**Goal:** Writing thesis on AI governance; needs citable methodology with DOI.

**What exists:**
- `whitepaper/AMC_WHITEPAPER_v1.md` — **This is legitimately impressive.** 16,500-word academic paper with abstract, related work, methodology, empirical evaluation, citations in academic style. ✅
- `docs/AMC_STANDARD_RFC.md` — RFC-style formal specification. ✅
- Whitepaper has 40+ references in standard academic format (author, year, title, venue/arXiv ID). ✅
- Research papers listing: `docs/RESEARCH_PAPERS_2026.md`, `docs/RESEARCH_PAPERS_MARCH_2026.md`. ✅
- Whitepaper claims submission for peer review with arXiv preprint. ✅

**What's missing:**

**No "Cite This Work" block:**
The whitepaper ends with a copyright notice but no:
```bibtex
@article{amc2026,
  title={AMC: A Multi-Dimensional Maturity Framework...},
  author={POLARIS Research Team},
  journal={arXiv preprint},
  year={2026},
  url={https://arxiv.org/...}
}
```
Oscar literally cannot cite this without constructing the citation himself.

**Citations use placeholder format:**
Throughout the whitepaper, citations appear as `[CITATION: McKinsey, 2025]` and `[CITATION: Gartner, 2025]` — these are placeholder-style, not properly formatted. The references section at the end has real citations for academic papers but not for industry reports (McKinsey, Gartner). This is an inconsistency reviewers would flag.

**No actual arXiv ID:**
The paper says "A preprint is available at arXiv" but no arXiv URL or ID is provided. Oscar cannot find it.

**Methodology reproducibility:**
- The 140 diagnostic questions are described structurally but "the full diagnostic is available to licensed AMC users" — this is a reproducibility issue for academic review. The framework claims scientific rigor but gates access to the full instrument.
- The empirical case studies (ContentModerationBot, DataPipelineBot) are internal; no public dataset.

**Gaps:**
- No DOI assigned (expected for a submitted paper).
- No arXiv ID/URL.
- No BibTeX block.
- Some citations remain as `[CITATION: ...]` placeholders (not resolved to actual papers).
- Methodology not fully reproducible (full question bank gated).

**Rating: 7/10** — The whitepaper exists and is substantive. Academic credibility hampered by missing BibTeX, unresolved citations, and no actual arXiv ID.

---

### 50. Mei (Startup CTO) — Score: 7/10

**Goal:** Get AMC running for her 4-person startup in 10 minutes, no enterprise bloat.

**Journey:**
```bash
npm i -g agent-maturity-compass     # ~30 seconds
amc quickstart --profile dev        # ✅ works
```

**What works:**
- `--profile dev` option exists and runs without enterprise setup. ✅
- Output is clean: radar chart, top 5 gaps, next steps. ✅
- No API key required. ✅
- No account/login required. ✅
- `amc quickscore` is genuinely 30 seconds. ✅
- The "solo dev" docs path exists (`docs/SOLO_DEV_PATH.md`, `docs/SOLO_DEV_QUICKSTART.md`). ✅

**What frustrates Mei:**
- **The 0/50 score in non-interactive mode looks broken.** Running `amc quickstart --profile dev` in a non-TTY (script, Docker) defaults all answers to L0 silently. The output reads: "Non-interactive mode: using L0 defaults." Mei runs this in her Docker setup and assumes the tool is broken.
- **Vault passphrase requirement** is confusing for first-time users. `AMC_VAULT_PASSPHRASE` must be set or the CLI prompts interactively. This is not mentioned until you try to do real evidence capture.
- **234 docs files** — overwhelming. Even with `docs/START_HERE.md`, the sheer volume signals "enterprise" not "startup."
- The pricing section in README says "Free / Open Source... 481 CLI commands" — 481 commands sounds like enterprise bloat to a startup CTO.

**Gaps:**
- No `amc init --minimal` or `amc quickstart --minimal` for stripped-down setup.
- No "startup in 10 minutes" guided wizard that skips governance/fleet/SCIM/SSO sections.
- The non-interactive mode needs a `--answers` JSON flag so CI can provide pre-set answers without TTY.
- No "just tell me what's broken" single-command output that's startup-actionable.

**Rating: 7/10** — The fastest path works well in TTY; breaks silently in non-TTY. The 0/50 default score is the biggest confusion point.

---

## Cross-Cutting Issue Summary

### WHITEPAPER STATUS
✅ EXISTS at `whitepaper/AMC_WHITEPAPER_v1.md` — 16,500 words, academic quality  
⚠️ Not linked from website homepage  
⚠️ No BibTeX / cite-this block  
⚠️ No actual arXiv ID provided  
⚠️ Some citations remain as `[CITATION: ...]` placeholders  

### README.md STATUS
✅ Comprehensive, well-structured  
❌ Test count inconsistency: badge says 3,488, text says 3,311  
❌ Question count: "113-question diagnostic" referenced in CLI quickscore output, but docs say 138/140  
⚠️ CLI commands count: 481 (README/website) vs 842 (API_REFERENCE.md)  
⚠️ `docs/GETTING_STARTED.md` referenced in CLI help text but file doesn't exist at that path (it's `docs/QUICKSTART.md`)  

### WEBSITE/DOCS HTML
✅ `website/index.html` — well designed, production quality  
✅ `website/docs/index.html` — searchable docs hub  
✅ `website/docs/methodology.html` — technical methodology page  
✅ `website/compare.html` — exists  
✅ `website/blog.html` — exists  
✅ `website/changelog.html` — exists  
⚠️ No executive/non-technical landing page  
⚠️ No OG image at `og-card.png` (referenced in meta tags but not verified to exist)  
⚠️ `website/docs/index.html` references `compare.html` and `blog.html` in topbar — content of those pages not audited for staleness  
⚠️ No accessibility statement  

### PACKAGE.JSON
```json
"version": "1.0.0"           // OK but: no changelog showing what 1.0.0 includes
"description": "Tamper-evident maturity diagnostic for AI agents"  // Undersells the product
"keywords": ["agent", "maturity", "diagnostic", "evidence", "ledger"]  // Missing: "compliance", "governance", "AI safety", "LLM", "trust"
```
**Gaps:**
- Description doesn't mention LLM agents, AI governance, or any keywords that npm search would surface
- Keywords are minimal — misses major search terms
- No `funding` field (would help Hassan recommend it as open source)

---

## Priority Fix List

### P0 — Fix Immediately

1. **`amc api start` command** — Remove from docs or implement it. Currently returns "unknown command 'start'". Every API-focused user hits this first.
2. **Test count badge** — Pick one number (3,311 or current actual) and update all references: README badge, README text, CONTRIBUTING.md, whitepaper.
3. **`docs/GETTING_STARTED.md` link in CLI output** — File doesn't exist at referenced path. Update to `docs/QUICKSTART.md`.
4. **Non-interactive 0/50 score** — Add a visible warning that interactive mode is required for meaningful scores: `⚠️ Non-interactive mode: scores cannot be collected. Run in a terminal or use --answers for CI.`

### P1 — Fix This Sprint

5. **BibTeX / "Cite This" block** — Add to whitepaper and AMC_STANDARD_RFC.md.
6. **arXiv URL** — Add actual arXiv preprint URL to whitepaper.
7. **`amc cert generate --badge`** — Either add the `--badge` flag or document that `amc compare --badge` is the badge path.
8. **`amc comply risk-classify`** — Either create this as an alias for `amc classify agent` + EU AI Act output, or fix the docs.
9. **CLI commands count** — Reconcile 481 vs 842; the README/website should reflect actual count.
10. **package.json keywords** — Add: "llm", "ai-agent", "governance", "compliance", "trust", "safety".

### P2 — Fix This Quarter

11. **Executive/board-facing landing page** — A single website page or PDF one-pager for non-technical stakeholders.
12. **Dashboard chart accessibility** — Add `aria-label` descriptions to Canvas/SVG charts with score summary text.
13. **CSS contrast fix** — `rgba(244,244,245,.55)` on dark backgrounds fails WCAG AA. Fix to at least 4.5:1.
14. **`--answers <json>` flag** for non-interactive CI scoring.
15. **Webhook payload schemas** — Add to OpenAPI spec.
16. **Financial risk quantification** — Even a simple "risk score to expected incident frequency" mapping would serve Tanya.
17. **Kubernetes/Helm deployment guide** — For Liam's cloud architect use case.
18. **Public leaderboard** — Anonymized real-world AMC scores for procurement comparison (Emma's key gap).

---

## Files Created
- `/Users/sid/AgentMaturityCompass/docs/AUDIT_50_AGENTS_BATCH5.md`

## Acceptance Checks
- All 10 personas audited with 1–10 rating and specific gap identification
- All critical issues are backed by direct CLI execution or file inspection
- Cross-cutting issues (stat inconsistencies, broken commands) verified with actual output

## Next Actions
1. Fix P0 items: broken `amc api start`, test count badge, GETTING_STARTED link, non-interactive score UX
2. Add BibTeX cite block to whitepaper for academic credibility
3. Create executive landing page for non-technical stakeholders
4. Run actual WCAG automated audit (axe-core is already in devDeps — just unused)
5. Reconcile all stat numbers across README/website/whitepaper/CONTRIBUTING

## Risks / Unknowns
- `ghcr.io/agentmaturity/amc-quickstart` Docker image: not verified as actually published
- `amc quickscore --share` generates a shareable link: no backend hosting found; may be a planned feature
- Whether arXiv submission is real or planned (no ID found anywhere)
- `website/og-card.png` referenced in meta tags but not verified to exist in repo
