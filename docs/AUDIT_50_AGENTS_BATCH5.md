# AMC User Audit — Batch 5 (Personas 41–50)

**Date:** 2026-03-14  
**Auditor:** Subagent (automated multi-persona UX audit)  
**Scope:** CLI journey, docs, website, package metadata — 10 personas  
**Method:** Direct CLI execution, file inspection, gap analysis  

---

## Executive Summary of Findings

| Persona | Role | Score | Critical Gaps |
|---------|------|-------|---------------|
| Jordan (Indie Hacker) | quickscore / quickstart | **8.7/10** | Non-interactive JSON, placeholder labeling, auto no-evidence fail-closed JSON, offline `quickscore --share`, and first-run interactive hints are resolved; first-run evidence still needs real capture for meaningful scores |
| Priscilla (Board Member) | Executive docs | **8.5/10** | Dedicated executive website path, L3 business-risk memo, and `amc executive brief` board artifact are resolved; richer hosted board sharing remains |
| Hassan (DevRel) | Dev community onboarding | **8.5/10** | CONTRIBUTING.md is solid; public test-count drift, compare-badge docs, community demo kit, why-AMC one-pager, and blog/changelog validation are resolved; hosted video/GIF proof remains |
| Emma (Procurement) | Compare, leaderboard, badges | **8/10** | `amc cert generate --badge` and anonymized public leaderboard export are resolved; hosted third-party validation remains |
| Liam (Cloud Architect) | Cloud service, Docker | **8.5/10** | `amc api start`, Helm/Kustomize artifacts, Terraform/Pulumi Helm examples, provider cloud references, and OpenAPI self-hosted server template are resolved; hosted SaaS remains |
| Suki (Accessibility) | CLI a11y, dashboard a11y | **8.5/10** | Chart labels, heatmap text alternatives, contrast, accessibility statement, high-contrast mode, focus trap, `NO_COLOR` discoverability, and release evidence capture are resolved; manual AT review remains |
| Roberto (Integration Engineer) | Webhooks, APIs, events | **8.7/10** | SSE, webhook schemas, value webhook token contract, rate-limit headers, reconnect docs, self-hosted OpenAPI roots, SDK inventory, and observe API parity are present; packaged SDK publication remains |
| Tanya (Risk Manager) | Risk quantification | **9/10** | `amc comply risk-classify`, `amc business risk`, FAIR-style scenario distributions, portfolio monetary heatmaps, and GRC exports are resolved; native GRC sync and certified Open FAIR remain |
| Oscar (PhD Student) | Citation, methodology | **9/10** | BibTeX, truthful arXiv status, homepage/docs whitepaper discovery, placeholder citations, the methodology reproducibility packet, and a public synthetic L0-L5 sample case-study dataset are resolved; DOI/arXiv assignment and third-party empirical datasets remain |
| Mei (Startup CTO) | 10-min value, no bloat | **9.5/10** | Non-interactive placeholder warning, `--answers`, minimal startup setup, startup plan, and what-broken mode are resolved; docs-volume perception remains |

**Overall product UX maturity: 8.7/10**

---

## 🔴 CRITICAL CROSS-CUTTING GAPS (Affect Multiple Personas)

### 1. Stat Inconsistencies Everywhere — Test, Command, and Diagnostic Counts Resolved

The original audit found multiple public test-count claims. Resolved 2026-06-16 by normalizing current-facing README, CONTRIBUTING, website i18n, launch drafts, and whitepaper claims to **5,394 statically collected Vitest tests across 407 files**.

Reproduction:
```bash
tmp=$(mktemp /tmp/amc-vitest-list.XXXXXX)
npx vitest list --json "$tmp" --staticParse --no-color >/tmp/amc-vitest-list.out
node -e 'const fs=require("fs"); const tests=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const files=new Set(tests.map(t=>t.file).filter(Boolean)); console.log({ tests: tests.length, files: files.size });' "$tmp"
# { tests: 5394, files: 407 }
```

External verification basis: Vitest's official CLI docs state that `vitest list` supports `--json` output and `--static-parse` collection; Shields.io's official static badge docs confirm the `label-message-color` path format used for the README badge.

The command-count drift was resolved 2026-06-16 by regenerating `docs/CLI_COMMAND_INVENTORY.md` from the compiled Commander registry and updating current-facing README, website, pricing, edition, enterprise, benchmark, and API reference surfaces to **1,140 public CLI command paths**.

Reproduction:
```bash
node dist/cli.js commands --json | node -e 'let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>console.log(JSON.parse(s).total));'
# 1140
```

The product diagnostic-count drift was resolved 2026-06-16 by separating runtime product counts from the whitepaper's research-core framing:

- Product runtime default: **244 diagnostic questions** (`amc-legacy-240-v1` compatibility version).
- Product runtime expanded lifecycle set: **264 diagnostic questions** (244 default + 20 lifecycle questions).
- Industry packs: **41 packs** with **600 sector-specific diagnostic questions**.
- Product runtime total with sector packs: **844 default** or **864 expanded** when sector questions are included.
- Whitepaper research framing remains explicit and separate: **140 core diagnostic questions + 600 sector-specific questions = 740 questions**.

Reproduction:
```bash
node --input-type=module -e "const q=await import('./dist/diagnostic/questionSets.js'); const d=q.getQuestionSet({version:'default'}); const l=q.getQuestionSet({version:'lifecycle'}); console.log({defaultQuestions:d.questions.length,lifecycleQuestions:l.questions.length,delta:l.questions.length-d.questions.length});"
# { defaultQuestions: 244, lifecycleQuestions: 264, delta: 20 }
```

**Impact:** Every persona who checks multiple docs notices stat drift. The current test-count, command-count, and diagnostic-count drift have been resolved with reproducible evidence.

### 2. `amc api start` is Resolved

```bash
$ amc api start
# Resolved 2026-06-16: command exists.
# Usage: amc api start [options]
# Start the AMC API server (alias for 'amc up')
```

The original audit found an unknown-command failure. Current compiled CLI exposes `amc api start --help`, with `--port <port>` and a description that it starts the API server as an alias for `amc up`.

### 3. Cite This Work Section is Resolved; arXiv Status is Explicit

Resolved 2026-06-16. `whitepaper/AMC_WHITEPAPER_v1.md` now includes a `## Cite This Work` section with BibTeX. `docs/AMC_STANDARD_RFC.md` now includes `## 11. Citation` with a companion BibTeX entry. Web search against arxiv.org did not find an AMC/Agent Maturity Certification record, so the paper now states that no DOI or arXiv identifier is assigned and removes the old unsupported arXiv-availability claim.

---

## Persona Deep-Dives

---

### 41. Jordan (Indie Hacker) — Score: 8.7/10

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
- Non-interactive placeholder scoring resolved in the 2026-06-16 follow-up. `quickscore --json` and `quickscore --rapid --json` now emit parseable JSON with `scoreStatus: "NON_INTERACTIVE_PLACEHOLDER"` and a warning that the L0 result is not a measured maturity score.
- First-run interactive hint — ✅ Resolved 2026-06-16. Placeholder paths now include: "Did you mean to run the interactive score?" and point users to terminal prompting or explicit answer JSON. In real TTY mode, the CLI prompts; the confusing case was non-TTY or quiet execution where prompts cannot appear.
- Auto no-evidence status — ✅ Resolved 2026-06-16. `quickscore --auto --json` now fails closed with `scoreStatus: "AUTO_NO_EVIDENCE"` and no measured score fields when ledger/context evidence is unavailable, instead of exposing human setup errors or a normal-looking zero score.
- `amc quickscore --share` is now validated without Studio or vault: the compiled rapid path emits an offline Markdown badge, HTML snippet, Shields URL, and text summary from provided answers. It does not publish a hosted link; hosted/static bundles are handled by `amc report ... --share` and demo share flows after a real run.

**Gaps:**
- `--auto` no-evidence fail-closed behavior is resolved; Jordan still needs terminal answers or captured evidence for a meaningful first score.
- "2 minutes to your first score" promise: reality is ~30 seconds to a labeled placeholder, provided answers, or an evidence-capture setup path depending on terminal/evidence state.

**Verification:** `npx vitest run tests/quickscoreNonInteractiveCli.test.ts tests/diagnostic/quickscoreShare.test.ts --reporter=dot` validates the compiled `quickscore --rapid --share --answers ...` path, the share formatter, structured placeholder metadata, the `AUTO_NO_EVIDENCE` fail-closed JSON path, the default non-interactive first-run hint, and audit/docs coverage. External sources checked: Shields.io Static Badge documentation (`https://shields.io/badges/static-badge`) for the static badge URL shape, and Node.js TTY documentation (`https://nodejs.org/api/tty.html`) for terminal detection behavior.

**Rating: 8.7/10** — Works for interactive users, scripts get valid JSON plus explicit placeholder metadata, auto mode fails closed when no evidence exists, no-prompt shells show a direct interactive-score hint, and `quickscore --share` is validated as an offline badge/summary path. First-run scoring still needs real evidence capture or terminal answers.

---

### 42. Priscilla (Board Member) — Score: 8.5/10

**Goal:** Non-technical executive summary explaining AI risk at her company.

**What she finds:**

**Website (`website/index.html`):**
- `website/executive.html` now provides a dedicated board brief with plain-language framing, what the board sees, what engineering does, what changes, and a four-step operating path. ✅
- Homepage desktop/mobile nav and footer now link to the executive path. ✅
- Executive KPI copy uses current counts: 244 default diagnostic questions, 147 assurance packs, 41 industry packs, and 600 sector-specific questions. ✅
- The page uses `website/og-card.png` as an inspectable product visual and includes accessibility basics through the shared website shell. ✅

**Dashboard:**
- The dashboard has an "Exec" tab (view mode selector in topbar). This is great — but it requires actually opening the dashboard via CLI (`amc up` + browser to localhost), which Priscilla cannot do.
- The "Exec" view presumably simplifies the output, and `website/executive.html` now gives non-technical stakeholders a pre-dashboard explanation.
- The standalone executive web page now covers the pre-dashboard path; the dashboard Exec view remains the richer local review surface after engineering starts Studio.

**What's missing:**
- `amc executive brief --run latest --out board-brief.html` now produces a print-ready board one-pager without vault or certificate signing. ✅
- `amc cert generate` remains available for signed trust certificates, but the board one-pager is now the low-friction non-certificate path.
- L3 business-risk memo — ✅ Resolved 2026-06-16. `docs/BOARD_RISK_L3_MEMO.md` explains that L3 supports limited production use only when scope, residual risk, owners, evidence coverage, and monitoring are explicit. It warns that L3 is not blanket approval.

**Gaps:**
- PDF/exportable board one-pager — ✅ Resolved 2026-06-16 with `amc executive brief`.
- Hosted one-click board packet sharing remains future work.

**Verification:** `npx vitest run tests/executiveBrief.test.ts tests/executiveBoardPath.test.ts tests/websiteAccessibility.test.ts --reporter=dot` verifies the board page, L3 business-risk memo, current-count docs, and built-CLI `amc executive brief` output. Direct scan confirmed stale executive claims (`593 sector-specific`, `86 assurance`, `docker run -it amc/compass`, `No subscription fees`) are absent from the executive docs/page.

**Rating: 8.5/10** — The board-facing web entry point, current non-technical docs, L3 business-risk memo, and print-ready board one-pager now exist. Remaining gap is hosted one-click board sharing.

---

### 43. Hassan (DevRel) — Score: 8.5/10

**Goal:** Evaluate AMC to recommend to his 20k-member developer community.

**What works:**
- `README.md` is comprehensive, well-structured with personas, recipes, product family table. ✅
- `CONTRIBUTING.md` is thorough: setup, test types, pack authoring guide, PR process. ✅
- Web playground exists at `playground.html` — great for live demos. ✅
- Discord/community link in README. ✅
- MIT licensed. ✅
- GitHub Actions CI template in README is copy-paste ready. ✅

**What fails:**
- **Resolved 2026-06-16:** Public test-count claims now use the same reproducible inventory: 5,394 statically collected Vitest tests across 407 files. The README badge also says "collected" rather than overclaiming a sandboxed full-suite pass.
- `amc compare --badge` is now documented in the README and getting-started docs. The two-run path now writes the comparison SVG badge instead of silently ignoring the flag. ✅
- Community demo kit resolved 2026-06-16: `docs/COMMUNITY_DEMO_KIT.md`, `docs/WHY_AMC_ONE_PAGER.md`, and `website/assets/amc-five-minute-terminal.svg` now provide a shareable five-minute terminal proof asset and one-page "why AMC" artifact. ✅
- Hosted "AMC in 5 minutes" video/GIF production remains future work.
- `docs/GETTING_STARTED.md` is referenced in CLI help text but... let me check if it exists.

**Gap found:** `docs/GETTING_STARTED.md` is referenced in the CLI output but resolves to `docs/QUICKSTART.md` (the actual file). The file referenced by path doesn't exist at that path. Users who try to `cat docs/GETTING_STARTED.md` get a file-not-found.

```
# CLI help output references:
"Full guide: https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/GETTING_STARTED.md"
# But the actual file is:
docs/QUICKSTART.md
```

**Gaps:**
- Community demo kit — ✅ Resolved 2026-06-16 with `docs/COMMUNITY_DEMO_KIT.md`, `docs/WHY_AMC_ONE_PAGER.md`, and `website/assets/amc-five-minute-terminal.svg`.
- Hosted video/GIF screencasts and third-party demo recordings remain future work.
- Website blog/changelog validation — ✅ Resolved 2026-06-16. `website/blog.html` has three real article cards and long-form article bodies, and `website/changelog.html` now has a static release notes fallback if remote changelog loading fails.
- Why-AMC community-shareable one-pager — ✅ Resolved 2026-06-16 with `docs/WHY_AMC_ONE_PAGER.md`.

**Community demo kit — ✅ Resolved 2026-06-16:**
- `docs/COMMUNITY_DEMO_KIT.md` provides a five-minute script, talk track, copy blocks, source caveats, and a no-dogfood-agent boundary.
- `website/assets/amc-five-minute-terminal.svg` is a GitHub-shareable terminal-style proof asset showing quickscore, startup plan, business risk, and GRC export.
- `docs/WHY_AMC_ONE_PAGER.md` gives a concise Score/Evidence/Governance/Business-risk one-pager for community posts.
- External source checked: GitHub Docs attaching-files guidance at `https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files`, which lists SVG, GIF, image, and video formats for GitHub issue and PR conversations.

**Website blog/changelog validation — ✅ Resolved 2026-06-16:**
- `website/blog.html` contains three article cards and long-form article sections for agent evaluation, EU AI Act compliance, and the documentation inflation gap.
- `website/changelog.html` still fetches the remote `CHANGELOG.md` when available, but now includes a static release notes fallback with Version 1.0.0, GRC treatment-plan export, community demo kit, and cloud deployment items.
- External source checked: MDN noscript reference at `https://developer.mozilla.org/en-US/docs/Web/HTML/Element/noscript`, which documents fallback HTML when scripting is unavailable or unsupported.

**Verification:** `node dist/cli.js compare --help` lists `--badge`; `npx vitest run tests/compareBadgeDocs.test.ts --reporter=dot` verifies README/getting-started exposure and two-run badge generation. `npx vitest run tests/communityDemoKit.test.ts --reporter=dot` verifies the demo kit, SVG terminal proof asset, one-pager, README link, and audit text. `npx vitest run tests/websiteContentValidation.test.ts --reporter=dot` verifies blog cards, article bodies, changelog fallback, and audit text.

**Rating: 8.5/10** — Solid technical foundation; public test-count drift, the broken docs link, and compare-badge docs/runtime behavior are resolved; community-shareable proof assets are also resolved. Hosted video/GIF demos and validated third-party recordings remain.

---

### 44. Emma (Procurement Lead) — Score: 8/10

**Goal:** Buying AI tools, needs comparison data to justify purchase.

**Commands tested:**

```bash
amc compare <runId1> <runId2>      # ✅ works
amc compare --badge                # ✅ has --badge flag (generates SVG)
amc leaderboard show               # ✅ exists
amc leaderboard export             # ✅ documented
amc leaderboard public-export --output public-leaderboard  # ✅ anonymized dataset-card + JSONL bundle
amc cert generate --badge          # ✅ resolved 2026-06-16
amc cert generate --agent myAgent --output cert.pdf  # requires running setup
```

**The `--badge` problem:**
- `amc compare` has `--badge` (generates comparison badge SVG). ✅
- `amc cert generate --badge` is resolved in the current compiled CLI. Help now lists `--badge`, `--no-sign`, `--preview`, `--url`, and `--base-url`.

**Comparison data gaps:**
- `docs/COMPARE_AMC.md` exists — competitive comparison against alternatives. ✅
- `docs/BENCHMARKS.md` and `docs/BENCHMARK_GALLERY.md` exist. ✅
- `amc leaderboard public-export` now builds a pseudonymized public leaderboard bundle with a Hugging Face-style `README.md` dataset card and `data/train.jsonl`. ✅
- The default export requires at least 5 scored agents and keeps model/provider metadata opt-in to reduce re-identification risk. ✅
- Hosted, third-party verified benchmark data is still not shipped.

**Leaderboard:**
- `amc leaderboard show` works. 
- `amc leaderboard export` creates a JSON/HTML. ✅
- `amc leaderboard public-export` turns local scored runs into an anonymized dataset bundle suitable for public leaderboard review or upload. ✅
- A hosted AMC-operated leaderboard populated with third-party verified real agents remains future work.

**Gaps:**
- Public leaderboard — ✅ Resolved 2026-06-16 with anonymized dataset export; hosted third-party validation remains open.
- `amc cert generate --badge` resolved in the 2026-06-16 follow-up.
- ROI calculator — ✅ Resolved 2026-06-16 with `amc business roi`, which writes a cost-of-trust-gap ROI document from current maturity, target maturity, expected annual loss inputs, implementation cost, and annual control cost.
- Buyer package link — ✅ Resolved 2026-06-16. The homepage pricing section now links directly to `docs/#BUYER_PACKAGES` for buyer-type packages and purchase-ready artifacts.

**Rating: 8/10** — Core comparison tools, certificate badges, anonymized public leaderboard export, a cost-of-trust-gap ROI artifact, and a prominent buyer-package pricing link now work. Hosted third-party validation remains open.

---

### 45. Liam (Cloud Architect) — Score: 8.5/10

**Goal:** Run AMC as a cloud service, not on his laptop.

**`amc api start` — RESOLVED:**
```bash
$ amc api start
Usage: amc api start [options]
Start the AMC API server (alias for 'amc up')
```
This was the FIRST thing a cloud architect tried in the original audit. Current compiled CLI exposes the command and the help text explains the `amc up` alias relationship.

**What actually works:**
- Docker support is solid: `Dockerfile`, `docker/docker-compose.yml`, `docker/README.md` all exist. ✅
- Docker README has a working `docker run` command with proper env vars. ✅
- Multi-port exposure (3210, 3211, 3212) is documented. ✅
- `docs/DEPLOYMENT_OPTIONS.md` covers self-hosted, managed, enterprise paths. ✅
- GHCR quickstart image claim — ✅ Resolved 2026-06-16. README now uses local `docker build -t amc-quickstart -f docker/Dockerfile.quickstart .` plus `docker run -it --rm amc-quickstart amc` instead of an unverified public GHCR image.
- Helm chart exists at `deploy/helm/amc/` with Deployment, Service, Ingress, PVC, NetworkPolicy, ServiceAccount, PDB, ConfigMap, Secret, and example values profiles. ✅
- Raw Kustomize manifests exist at `deploy/k8s/`. ✅
- `docs/KUBERNETES_HELM_DEPLOYMENT.md` now documents validation, install, bootstrap secrets, health probes, rollback, Kustomize, Terraform deployment, and Pulumi deployment. ✅
- Terraform Helm-release example exists at `deploy/terraform/helm-release/`. ✅
- Pulumi Helm-release example exists at `deploy/pulumi/helm-release/`. ✅

**Cloud-specific gaps:**
- Provider-specific AWS/GCP/Azure reference architectures are now documented in `docs/CLOUD_REFERENCE_ARCHITECTURES.md`. ✅
- OpenAPI self-hosted server documentation now covers `https://{host}/api` for customer-owned DNS names. ✅
- Pulumi Helm-release module is now documented at `deploy/pulumi/helm-release/`. ✅
- AMC-operated hosted SaaS endpoint remains future work; AMC is documented as self-hosted from this repository and does not claim an AMC-operated public API domain.
- `amc api start` is no longer broken; remaining cloud gaps are a hosted SaaS offering and full-stack provider-specific infrastructure modules beyond Helm release examples.
- Health check endpoint paths are documented for Kubernetes and Docker (`/healthz`, `/readyz`, and `amc studio healthcheck`).
- Studio/API can be published at a customer-operated `https://{host}/api`; no AMC-operated public SaaS API is claimed.

**The OpenAPI spec:**
- `website/openapi.yaml` exists and is well-formed. ✅
- Documents local development at `http://localhost:3000/api` and self-hosted production at `https://{host}/api` with a DNS variable. ✅

**Rating: 8.5/10** — Docker, `amc api start`, Helm/Kustomize deployment, health probes, Terraform and Pulumi Helm-release examples, provider-specific self-hosting guidance, and an OpenAPI self-hosted server template are now present. Hosted SaaS delivery and full-stack provider modules remain open.

---

### 46. Suki (Accessibility Expert) — Score: 8.5/10

**Goal:** Verify CLI output readability, color contrast, screen reader compatibility.

**CLI color analysis:**
- Uses `chalk` for all colored output. ✅
- `--no-color` flag exists at CLI level (`amc --no-color`). ✅
- `NO_COLOR` env var: **resolved for global CLI discoverability and top-level handling** — `amc --help` now surfaces `NO_COLOR=1` / `--no-color`, and the global pre-action hook sets `process.env.NO_COLOR = "1"` plus `chalk.level = 0` when `--no-color` is passed.

**Color-only information problem:**
- Terminal output uses color to distinguish score levels (green = good, red = bad, amber = warning). There is no text-only alternative indicator (no "✓ PASS" vs "✗ FAIL" symbols that aren't color-paired).
- Wait — actually the CLI does use emoji symbols (✓, ✗, ⚠) alongside colors. Partial credit.

**Dashboard accessibility:**
- `aria-label`, `role="dialog"`, `role="navigation"`, `role="main"`, `role="alert"`, `role="tab"`, `aria-selected` — all present. ✅
- `aria-modal="true"` on the onboarding overlay. ✅
- Skip navigation link exists: `<a href="#main" class="skip-link">Skip to content</a>`. ✅
- Mobile navigation has `aria-label`. ✅

**Dashboard gaps:**
- Chart canvas accessible names are now present for the browser playground radar and generated console charts (`overallTrend`, `integrityTrend`, `layerBars`, `outcomeTrend`, `orgLayerBars`, `orgDistLine`, forecast charts, and value trend). ✅
- Color-only score indicators in the generated-dashboard heatmap are resolved: each row now exposes visible score, target, gap, and confidence text, ARIA grid/gridcell semantics, selected state, and confidence meter values. ✅
- Focus management: generated-dashboard onboarding now traps `Tab`/`Shift+Tab` inside the dialog while open and restores focus to the invoking element when closed. ✅
- Dashboard CSS contrast issue resolved: dark-mode `--text-secondary` changed from `rgba(244,244,245,.55)` to `rgba(244,244,245,.74)` and `tests/websiteAccessibility.test.ts` computes a WCAG AA >= 4.5:1 contrast ratio against `--bg`. ✅

**CLI-specific issues:**
- Error messages use `chalk.red()` only — no semantic prefix like "ERROR:" for color-blind users. Some do have emoji (✗) but inconsistently.
- No `--quiet` mode for all commands (only `quickscore` has `--quiet`).
- Interactive prompts (from `inquirer`) are not accessible via screen readers in most terminal emulators.

**Gaps:**
- Accessibility statement resolved: `docs/ACCESSIBILITY.md` and `website/accessibility.html` now exist and are discoverable from the homepage and docs hub. ✅
- High-contrast mode option resolved: generated dashboard Settings now includes `HC High contrast`, the top-right theme toggle cycles through it, and CSS defines `data-theme="high-contrast"`. ✅
- Canvas chart ARIA description gap resolved for named chart canvases. ✅
- Accessibility release evidence artifact — ✅ Resolved 2026-06-16. `docs/runbooks/ACCESSIBILITY_RELEASE_EVIDENCE.md` documents how to run the Playwright axe suite with JSON output and generate an auditable Markdown artifact via `npm run accessibility:release-evidence`. The artifact explicitly says manual assistive-technology review is not complete.

**External verification used:** W3C WCAG 2.2 Success Criteria 1.4.1 Use of Color, 1.4.3 Contrast (Minimum), and 4.1.2 Name, Role, Value; W3C WAI Accessibility Statement guidance; WAI-ARIA accessible name guidance; W3C WAI Evaluating Web Accessibility guidance; and Deque axe API documentation, retrieved 2026-06-16.

**Verification:** `npx vitest run tests/websiteAccessibility.test.ts tests/accessibilityReleaseEvidence.test.ts --reporter=dot` checks high-contrast theme controls, onboarding focus trap source, heatmap text alternatives, ARIA grid/meter semantics, published accessibility statement wording, chart names, skip links, focus-visible styles, generated-dashboard contrast, and accessibility release-evidence artifact generation.

**Rating: 8.5/10** — The concrete chart-label, heatmap text-alternative, contrast, statement, high-contrast, focus-trap, `NO_COLOR` discoverability, and release-evidence capture gaps are resolved with regression tests. Remaining risk is manual assistive-technology coverage for prompts and dense generated reports.

---

### 47. Roberto (Integration Engineer) — Score: 8.7/10

**Goal:** Webhooks, APIs, event streams from AMC for integration into his monitoring stack.

**What exists:**

**SSE Events (`/events/org`):**
- Confirmed in `docs/REALTIME.md` and implemented in `studioServer.ts`. ✅
- 10 event types documented (ORG_SCORECARD_UPDATED, AGENT_RUN_COMPLETED, etc.). ✅
- Auth required (VIEWER+ role). ✅
- Event payload is minimal metadata only (no secrets/transcripts). ✅
- Reconnect behavior is documented: the stream sends `retry: 15000`, event IDs use `summaryHash`, and reconnecting clients refresh current state because `/events/org` is live-update-only rather than replayable. ✅

**Outbound webhooks:**
- `amc alert config` configures webhook endpoints (Slack, PagerDuty, custom). ✅
- `amc alert send` / `amc alert test` / `amc alert watch` all exist. ✅
- Inbound webhook at `/value/ingest/webhook` documented in studioServer. ✅

**API:**
- `website/openapi.yaml` is well-formed with schemas (ScoreResult, Incident, etc.). ✅
- REST endpoints are documented. ✅
- OpenAPI now defines reusable webhook payload and receipt schemas: `WebhookSignatureHeaders`, `WebhookEventEnvelope`, `WebhookDeliveryRequest`, `WebhookAttemptReceipt`, `WebhookDeliveryReceipt`, `PortalWebhookPayload`, `OutcomeWebhookPayload`, and `ValueWebhookPayload`. ✅
- `POST /v1/product/portal/submit` now links its `payload` field to the webhook schema variants with concrete examples. ✅
- The value webhook route family now has a published token contract: single-workspace Studio uses `POST /value/ingest/webhook`, host mode uses `POST /w/:workspaceId/value/ingest/webhook`, auth accepts OWNER/OPERATOR session, `x-amc-admin-token`, or `x-amc-webhook-token`, and the token is documented as the vault secret `value/webhook/token` rather than an HMAC request signature. ✅
- Rate-limit behavior is documented in `docs/API_SURFACES.md`: Studio emits 429s with `Retry-After` when detailed buckets are exhausted, exposes `X-RateLimit-*` and `RateLimit-*` headers where that limiter applies, and Bridge/Gateway budget or lease denials can also return 429. ✅
- Webhook retry behavior is documented without overclaiming: `amc alert send/test` fail fast on non-2xx responses, while deterministic integration events use the retry/dead-letter path. ✅

**What's missing:**
- `amc api start` is resolved; self-hosted cloud endpoint documentation now points teams to `https://{host}/api` and `docs/CLOUD_REFERENCE_ARCHITECTURES.md`.
- The OpenAPI spec now documents both local `localhost:3000/api` and self-hosted `https://{host}/api` server roots.
- Inbound value webhook token details are now a published Studio route-family contract in `website/openapi.yaml`, `docs/API_SURFACES.md`, and `docs/VALUE_INGESTION.md`.
- SSE reconnect and rate-limit documentation are resolved in the 2026-06-16 follow-up.
- `docs/API_REFERENCE.md` now lists the canonical 1,140 public CLI command paths.
- `docs/SDK.md` now consolidates Node/TypeScript, Python, Go, and OpenAPI contract surfaces with current source paths and server roots. ✅
- Observe CLI data is now API-visible: `GET /api/v1/observe/status`, `GET /api/v1/observe/timeline`, and `GET /api/v1/observe/anomalies` expose the same timeline builder used by `amc observe timeline --json` and `amc observe anomalies --json`. ✅

**Gaps:**
- Node/TypeScript, Python, and Go SDK assets are repo-visible and documented; packaged SDK publication remains open as a release/distribution operation.
- Observe CLI API parity — ✅ Resolved 2026-06-16. `docs/API_SURFACES.md` and `website/openapi.yaml` now document `/api/v1/observe/*` routes, and `tests/observeApiRoutes.test.ts` proves timeline/anomaly routing, bounded query parameters, method guards, route registration, docs, and OpenAPI visibility.
- Hosted SaaS endpoint delivery remains open; self-hosted cloud endpoint documentation and SDK consolidation inventory are resolved.

**External verification used:** OpenAPI Specification v3.2.0 path and parameter documentation from `https://spec.openapis.org/oas/latest.html`, retrieved 2026-06-16.

**Rating: 8.7/10** — Core integration building blocks exist, webhook payload schemas are contract-visible, value webhook token details are route-contract visible, self-hosted cloud API roots are documented, SDK assets are consolidated in docs, rate-limit/reconnect/retry boundaries are documented, and observe data is now exposed as a first-class API. Packaged SDK publication and hosted SaaS delivery remain open.

---

### 48. Tanya (Risk Manager) — Score: 9/10

**Goal:** Enterprise risk framework, wants risk quantification in financial terms.

**`amc comply risk-classify` is resolved — 2026-06-16:**
```bash
$ amc comply risk-classify --employment --json
{
  "riskTier": "HIGH",
  "articles": ["Art. 6(2) + Annex III(4)"],
  "summary": "HIGH RISK..."
}
```

The compiled CLI exposes `amc compliance risk-classify`, and the `compliance` namespace has the `comply` alias. Documentation now lists `amc comply risk-classify` explicitly. External source checked: Regulation (EU) 2024/1689 official ELI record at `https://data.europa.eu/eli/reg/2024/1689/oj`.

**What actually works:**
- `amc comply report --framework EU_AI_ACT` generates an evidence-linked compliance report. ✅
- `amc comply risk-classify --employment --json` classifies employment/worker-management use as `HIGH` with `Art. 6(2) + Annex III(4)`. ✅
- `amc quickscore --eu-ai-act` shows EU AI Act risk classification. ✅
- `docs/COMPLIANCE_FRAMEWORKS.md` and `docs/COMPLIANCE_MAPS.md` exist. ✅
- NIST AI RMF, ISO 42001, SOC 2, GDPR, OWASP mappings all present. ✅
- `amc business risk --maturity 3 --baseline-frequency 4 --incident-cost 50000 --risk-appetite 75000 --json` converts maturity into expected annual loss, residual incident frequency, expected loss reduction, and risk-appetite status. ✅
- `amc business heatmap --portfolio risk-portfolio.json --out risk-heatmap.md` groups multiple agents by residual likelihood and monetary impact, totals residual expected annual loss, and highlights risk-appetite breaches. ✅
- `amc business grc-export --portfolio risk-portfolio.json --out grc-treatment-plan.csv` exports a GRC-ready treatment-plan register with control owners, due dates, risk appetite status, ISO 31000 treatment context, and FAIR-style loss-frequency/loss-magnitude fields. ✅
- `amc business fair-scenario --scenario claims-ai-data-leak ... --out fair-scenario.md` runs a deterministic seeded FAIR-style loss distribution with explicit min/most-likely/max frequency and magnitude calibration ranges, maturity-adjusted event frequency, P10/P50/P90/P95 loss outputs, and risk-appetite status. ✅

**Financial risk quantification — ✅ Resolved 2026-06-16:**
```bash
$ amc business risk --maturity 3 --baseline-frequency 4 --incident-cost 50000 --risk-appetite 75000 --json
{
  "baseline": { "annualIncidentFrequency": 4, "expectedAnnualLoss": 200000 },
  "residual": {
    "maturityRiskMultiplier": 0.38,
    "annualIncidentFrequency": 1.52,
    "expectedAnnualLoss": 76000,
    "expectedAnnualLossReduction": 124000,
    "reductionPct": 62
  },
  "riskAppetite": { "annualLossLimit": 75000, "status": "ABOVE", "delta": 1000 }
}
```

The model is intentionally explicit and conservative: expected annual loss equals annual incident frequency multiplied by average incident cost, then residual frequency is adjusted by a documented L0-L5 maturity multiplier. JSON output includes default flags, assumptions, recommendations, and external source references. External sources checked: NIST SP 800-30 Rev. 1 for likelihood-plus-impact risk assessment and NIST AI RMF 1.0 for contextual risk tolerance.

**Portfolio risk heatmap — ✅ Resolved 2026-06-16:**
```bash
$ amc business heatmap --portfolio risk-portfolio.json --out risk-heatmap.md
✓ Business risk heatmap saved to: risk-heatmap.md
  Agents: 3
  Residual expected annual loss: $551,000/year
  Highest severity: HIGH
```

The heatmap consumes a portfolio JSON file with agent ID, business unit, maturity level, baseline annual incident frequency, average incident cost, and optional risk appetite. It emits Markdown or JSON with 25 likelihood-by-impact cells, text labels in every non-empty cell, total baseline/residual expected annual loss, top residual exposures, appetite breaches, low-confidence rows, assumptions, and next actions. External source checked: NIST SP 800-30 Rev. 1 supports likelihood-plus-impact risk assessment and flexible reporting formats.

**GRC treatment-plan export — ✅ Resolved 2026-06-16:**
```bash
$ amc business grc-export --portfolio risk-portfolio.json --out grc-treatment-plan.csv
✓ GRC treatment-plan export saved to: grc-treatment-plan.csv
  Agents: 3
  Open treatments: 3
  Above risk appetite: 1
  Highest severity: HIGH
```

The export reuses the portfolio risk inputs and emits CSV, JSON, or Markdown rows with deterministic risk IDs, business unit, control owner, maturity level, residual expected annual loss, appetite status, treatment strategy, due date, ISO 31000 treatment context, acceptance criteria, recommended actions, and FAIR-style loss event frequency/loss magnitude/annualized loss exposure fields. External sources checked: ISO 31000:2018 official ISO page at `https://www.iso.org/standard/65694.html` and FAIR Institute "What is FAIR?" at `https://www.fairinstitute.org/what-is-fair`. Caveat: this is a GRC-ready exchange export, not a certified RSA Archer, ServiceNow GRC, or Open FAIR implementation.

**FAIR-style scenario loss distribution — ✅ Resolved 2026-06-16:**
```bash
$ amc business fair-scenario --scenario claims-ai-data-leak --maturity 3 \
  --frequency-min 2 --frequency-most-likely 5 --frequency-max 9 \
  --loss-min 20000 --loss-most-likely 75000 --loss-max 250000 \
  --risk-appetite 120000 --iterations 5000 --seed 12345 --out fair-scenario.md
✓ FAIR-style scenario report saved to: fair-scenario.md
  Scenario: claims-ai-data-leak
  P50: $208,363
  P90: $397,902
  Appetite: ABOVE_P90
```

The scenario command accepts explicit calibration ranges for annual event frequency and loss magnitude, samples triangular distributions with a deterministic seed, applies the AMC maturity risk multiplier to event frequency, and reports P10/P50/P90/P95 annualized loss. External sources checked: FAIR Institute "What is FAIR?" for financial risk quantification and standard taxonomy/data-collection/scenario modeling context, and NIST SP 800-30 Rev. 1 for likelihood-plus-impact analysis. Caveat: this is a FAIR-style planning tool, not a certified Open FAIR implementation, actuarial model, insurance model, native RSA Archer/ServiceNow sync, or financial-reporting valuation.

**Risk quantification gaps:**
- The whitepaper mentions "quantified risk allocation" only in the sector-specific governance pack context — not as a core feature.
- `docs/THREAT_MODEL.md` exists but is technical, not financial.

**Enterprise risk framework integration:**
- ISO 31000 treatment context and FAIR-style frequency/magnitude export fields now exist for CSV/JSON/Markdown register exchange.
- Native RSA Archer, ServiceNow GRC, or other system-of-record API sync is still not implemented.
- `docs/COMPLIANCE.md` clearly disclaims: "AMC intentionally avoids legal-claim language" — fair, but Tanya needs quantifiable numbers for her risk register.

**What Tanya needs but doesn't get:**
- Risk appetite policy management across multiple agents and business units.
- Certified Open FAIR analysis and native GRC system-of-record synchronization.

**Rating: 9/10** — Compliance mapping, EU AI Act risk-tier classification, simple expected annual loss quantification, FAIR-style scenario loss distributions, portfolio-level monetary heat maps, and a GRC treatment-plan export now exist. Tanya still lacks native GRC system sync and a certified Open FAIR implementation.

---

### 49. Oscar (PhD Student) — Score: 9/10

**Goal:** Writing thesis on AI governance; needs citable methodology with DOI.

**What exists:**
- `whitepaper/AMC_WHITEPAPER_v1.md` — **This is legitimately impressive.** 16,500-word academic paper with abstract, related work, methodology, empirical evaluation, citations in academic style. ✅
- `docs/AMC_STANDARD_RFC.md` — RFC-style formal specification. ✅
- Whitepaper has 40+ references in standard academic format (author, year, title, venue/arXiv ID). ✅
- Research papers listing: `docs/RESEARCH_PAPERS_2026.md`, `docs/RESEARCH_PAPERS_MARCH_2026.md`. ✅
- Whitepaper now states repository-preprint status and says no DOI/arXiv identifier is assigned as of 2026-06-16. ✅

**What's missing:**

**Cite This Work block — resolved 2026-06-16:**
The whitepaper and RFC now include copy-paste BibTeX entries:
```bibtex
@techreport{polaris2026agentmaturitycompass,
  title={AMC: A Multi-Dimensional Maturity Framework...},
  author={{POLARIS Research Team} and {AMC Labs}},
  institution={AMC Labs},
  year={2026},
  url={https://github.com/AgentMaturity/AgentMaturityCompass}
}
```
Oscar no longer has to construct a citation from scratch.

**Placeholder citations — resolved 2026-06-16:**
The whitepaper no longer ships `[CITATION: ...]` markers. The unsupported McKinsey/Gartner industry-report adoption claims were removed rather than reformatted because public primary-source verification did not support the drafted percentages. The introduction now cites source-backed agent literature and OpenAI's official agent-platform announcement.

**No actual arXiv ID — truthfully handled:**
Searches for the exact paper title, "Agent Maturity Compass", and "Agent Maturity Certification" did not find an arxiv.org record. The paper no longer claims arXiv availability; it says the arXiv identifier is not assigned as of 2026-06-16 and instructs readers to cite the repository whitepaper until an external identifier exists.

**Methodology reproducibility:**
- `amc methodology --reproducibility --json` now exports the live public scoring instrument with methodology id/version/hash, source paths, formulas, trust tiers, full default diagnostic question inventory, L0-L5 descriptors, evidence gates, question-bank SHA-256, reproduction commands, limitations, and external review alignment. ✅
- `amc methodology --reproducibility --format markdown --out amc-methodology-reproducibility.md` writes an auditor-readable packet with the full question inventory. ✅
- `amc methodology --sample-dataset --json` now exports a public synthetic L0-L5 sample case-study dataset with dataset-card metadata, methodology/question-bank hashes, evidence profiles, layer scores, source references, privacy notes, out-of-scope uses, and limitations. ✅
- The empirical case studies (ContentModerationBot, DataPipelineBot) are still internal; third-party empirical datasets remain separate.
- Whitepaper homepage/docs discoverability — ✅ Resolved 2026-06-16. `website/index.html` now links the Agent Maturity Compass whitepaper from the research section and footer, and `docs/INDEX.md` routes citation seekers to `whitepaper/AMC_WHITEPAPER_v1.md`.

**Methodology reproducibility packet — ✅ Resolved 2026-06-16:**
```bash
$ amc methodology --reproducibility --json
{
  "id": "amc-methodology-reproducibility-packet",
  "questionBank": {
    "questionCount": 244,
    "questionBankSha256": "..."
  }
}
```

The packet is source-generated from `src/methodology/publicMethodology.ts` and `src/diagnostic/questionBank.ts`, not hand-maintained prose. It follows ACM artifact-review expectations at the level AMC can control: artifact inventory, source paths, execution commands, hashes, and complete question/gate metadata. It also maps to FAIR data principles through stable identifiers, machine-readable JSON, metadata, and reuse limitations. External sources checked: ACM Artifact Review and Badging current policy and GO FAIR Principles.

**Methodology sample case-study dataset — ✅ Resolved 2026-06-16:**
```bash
$ amc methodology --sample-dataset --json
{
  "id": "amc-public-methodology-case-study-dataset",
  "status": "public-synthetic-sample",
  "datasetCard": { "rowCount": 6 },
  "cases": [
    { "caseId": "amc-sample-l0-notebook-helper", "maturityLevel": 0 },
    { "caseId": "amc-sample-l5-controlled-improver", "maturityLevel": 5 }
  ]
}
```

The sample dataset is source-generated from `src/methodology/publicMethodology.ts` and follows dataset-card/datasheet documentation expectations at the level AMC can truthfully support: motivation, composition, intended use, out-of-scope use, privacy notes, source references, reproduction commands, stable content hash, and methodology/question-bank hashes. External sources checked: Hugging Face Dataset Cards documentation and Gebru et al. "Datasheets for Datasets." Caveat: this is not a DOI/arXiv assignment or third-party empirical validation; it is a public synthetic sample dataset for methodology review and parser/tutorial fixtures.

**Gaps:**
- No DOI assigned (expected until an external archive or venue issues one).
- No arXiv ID/URL exists; the paper now states this explicitly rather than overclaiming.
- BibTeX block resolved for both whitepaper and RFC.
- Placeholder citation markers resolved; `tests/citationMetadata.test.ts` blocks recurrence.
- Methodology reproducibility packet and public synthetic sample case-study dataset resolved; third-party empirical case-study datasets remain separate.

**External verification used:** arXiv records for ReAct and LLM-agent survey work, OpenAI's official "New tools for building agents" announcement, and public searches for the drafted McKinsey/Gartner claims.

**Rating: 9/10** — The whitepaper is citable, discoverable from the homepage/docs index, no longer overclaims arXiv status, no longer contains placeholder citation markers, and now has source-generated reproducibility and sample case-study dataset artifacts for public methodology review. Academic credibility is still limited by no DOI/arXiv identifier and no third-party empirical case-study dataset.

---

### 50. Mei (Startup CTO) — Score: 9.5/10

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
- `amc init --minimal` and `amc quickstart --minimal` now create a startup-friendly workspace without vault prompting or immediate full-score prompting. ✅
- `amc quickstart --startup-plan --role cto --answers-out amc-startup-answers.json` now prints a role-aware 10-minute plan, detects common frameworks, and writes sample answers for non-interactive scoring. ✅
- `amc quickstart --what-broken` now prints only startup blockers and next commands without running the interactive score. ✅

**What frustrates Mei:**
- **The 0/50 score in non-interactive mode is now explicitly labeled as a placeholder.** Running `amc quickstart --profile dev` in a non-TTY prints "No TTY detected — no questions were answered" and says the displayed L0 is not a measured maturity result.
- **Vault passphrase requirement** is confusing for first-time users. `AMC_VAULT_PASSPHRASE` must be set or the CLI prompts interactively. This is not mentioned until you try to do real evidence capture.
- **234+ docs files** — still a lot. The minimal commands give a smaller path, but the full docs corpus still signals "enterprise" to some startup CTOs.
- The pricing section in README now says "Free / Open Source... 1,140 registered CLI command paths" with a link to the generated inventory; this is accurate but still risks sounding like enterprise bloat to a startup CTO.

**Gaps:**
- Minimal startup path — ✅ Resolved 2026-06-16. `amc init --minimal` and `amc quickstart --minimal` skip the vault prompt, skip the immediate full-score prompt, and show lightweight next steps.
- Startup guidance and what-broken mode — ✅ Resolved 2026-06-16. `amc quickstart --startup-plan --role cto --answers-out amc-startup-answers.json` provides role-specific copy, sample answers, framework detection, and vault-readiness guidance; `amc quickstart --what-broken` prints startup blockers only.
- `amc quickscore --answers <jsonOrFile> --json` now scores from provided L0-L5 answers in non-interactive CI without placeholder metadata. ✅
- The docs corpus is still large; the startup path now avoids it but does not reduce the repository-wide docs count.

**Startup guidance and what-broken mode — ✅ Resolved 2026-06-16:**
```bash
$ amc quickstart --startup-plan --role cto --answers-out amc-startup-answers.json
$ amc quickstart --what-broken
```

The startup plan reports role-specific goals, framework detection, workspace/sample-answer/measured-score/vault readiness, a sample answer file path, fastest next commands, caveats, and an explicit vault-passphrase environment-variable note. External source checked: Twelve-Factor App config guidance for keeping deploy-varying credentials in environment variables rather than source-controlled files.

**Rating: 9.5/10** — The fastest path works well in TTY, non-TTY placeholder output is no longer silent or misleading, CI can provide answer JSON directly, startups have a minimal setup path, and the new startup plan/what-broken modes cover role-specific guidance. Remaining friction is docs-volume perception, not basic CLI capability.

---

## Cross-Cutting Issue Summary

### WHITEPAPER STATUS
✅ EXISTS at `whitepaper/AMC_WHITEPAPER_v1.md` — 16,500 words, academic quality  
✅ Linked from website homepage research section and docs index on 2026-06-16.
✅ BibTeX / cite-this block added to whitepaper and RFC on 2026-06-16
✅ arXiv status is explicit: no DOI/arXiv identifier assigned as of 2026-06-16; cite repository whitepaper until issued
✅ Placeholder citation markers resolved; unsupported industry-report adoption claims removed rather than cited

### README.md STATUS
✅ Comprehensive, well-structured  
✅ Test count inconsistency resolved 2026-06-16: current-facing README, CONTRIBUTING, website, launch drafts, and whitepaper use 5,394 statically collected Vitest tests across 407 files
✅ Non-interactive quickscore placeholder output resolved 2026-06-16
✅ First-run quickscore interactive hint resolved 2026-06-16
✅ CLI command-count inconsistency resolved 2026-06-16: current-facing surfaces use 1,140 public command paths from `amc commands --json`
✅ `docs/GETTING_STARTED.md` exists and is referenced by README/CLI links

### WEBSITE/DOCS HTML
✅ `website/index.html` — well designed, production quality  
✅ `website/docs/index.html` — searchable docs hub  
✅ `website/docs/methodology.html` — technical methodology page  
✅ `website/compare.html` — exists  
✅ `website/blog.html` — exists and has validated article cards plus long-form article bodies
✅ `website/changelog.html` — exists and has a static release notes fallback if remote changelog loading fails
✅ Executive/non-technical landing page exists at `website/executive.html`, and `amc executive brief` now writes a board-ready one-pager artifact.
✅ OG image exists at `website/og-card.png`; `tests/websiteAccessibility.test.ts` now verifies `og:image` references resolve to shipped assets.
✅ `website/docs/index.html` references `compare.html` and `blog.html` in topbar; blog and changelog content are covered by `tests/websiteContentValidation.test.ts`.
✅ Accessibility statement exists at `docs/ACCESSIBILITY.md` and `website/accessibility.html`.

### PACKAGE.JSON
```json
"version": "1.0.0"           // OK but: no changelog showing what 1.0.0 includes
"description": "Tamper-evident maturity scoring, red-team testing, and compliance toolkit for AI agents"
"keywords": ["ai-agent", "ai-governance", "ai-safety", "ai-compliance", "trust-score", "llm-evaluation", "..."]
```
**Gaps:**
- Description and keyword discoverability are resolved for AI agents, governance, compliance, trust, safety, and LLM evaluation.
- No `funding` field (optional OSS packaging improvement; do not invent a sponsorship URL without a real destination).

---

## Priority Fix List

### P0 — Fix Immediately

1. **`amc api start` command** — ✅ Resolved 2026-06-16. Current compiled CLI exposes `amc api start --help`.
2. **Test count badge** — ✅ Resolved 2026-06-16. README badge, README text, CONTRIBUTING.md, website i18n, launch drafts, and whitepaper now use 5,394 statically collected Vitest tests across 407 files.
3. **`docs/GETTING_STARTED.md` link in CLI output** — ✅ Resolved 2026-06-16. The file exists.
4. **Non-interactive 0/50 score** — ✅ Resolved 2026-06-16. `quickscore --json` remains parseable and includes `scoreStatus: "NON_INTERACTIVE_PLACEHOLDER"`; human quickscore and quickstart output say the L0 is not a measured maturity result and now include the first-run interactive hint.

### P1 — Fix This Sprint

5. **BibTeX / "Cite This" block** — ✅ Resolved 2026-06-16. Added to whitepaper and AMC_STANDARD_RFC.md.
6. **arXiv URL/status** — ✅ Truthfully resolved 2026-06-16. No arxiv.org record was found; the false arXiv availability claim was removed and the paper now states no arXiv identifier is assigned.
7. **`amc cert generate --badge`** — ✅ Resolved 2026-06-16. Current compiled CLI exposes `--badge`.
8. **`amc comply risk-classify`** — ✅ Resolved 2026-06-16. Compiled CLI exposes the command through the `comply` alias and docs now list it explicitly.
9. **CLI commands count** — ✅ Resolved 2026-06-16. README, website, pricing, editions, enterprise, benchmark gallery, API reference, and generated CLI inventory now agree on 1,140 public command paths.
10. **package.json keywords** — ✅ Resolved 2026-06-16. Description and keywords now include AI agents, governance, compliance, trust, safety, and LLM evaluation terms.

### P2 — Fix This Quarter

11. **Executive/board-facing landing page** — ✅ Website path resolved 2026-06-16 at `website/executive.html`; exportable board artifact resolved with `amc executive brief --run latest --out board-brief.html`.
12. **Dashboard chart accessibility** — ✅ Resolved 2026-06-16 for named chart canvases, high-contrast mode, onboarding focus trap, and heatmap cell text alternatives.
13. **CSS contrast fix** — ✅ Resolved 2026-06-16. `tests/websiteAccessibility.test.ts` verifies generated-dashboard secondary text contrast against the dark background.
14. **`--answers <json>` flag** — ✅ Resolved 2026-06-16. `amc quickscore --answers <jsonOrFile> --json` supports inline JSON or answer files and emits `scoreStatus: "PROVIDED_ANSWERS"`.
15. **Webhook payload schemas** — ✅ Resolved 2026-06-16. `website/openapi.yaml` now defines reusable webhook/event/receipt schemas and links product portal payload examples to them.
16. **Financial risk quantification and heatmaps** — ✅ Resolved 2026-06-16. `amc business risk` maps maturity to residual incident frequency, expected annual loss, expected loss reduction, and risk-appetite status; `amc business heatmap` builds portfolio-level monetary risk heatmaps.
17. **Kubernetes/Helm deployment guide** — ✅ Resolved 2026-06-16. `docs/KUBERNETES_HELM_DEPLOYMENT.md` documents Helm install/rollback, Kustomize, health probes, bootstrap secrets, and Terraform/Pulumi Helm-release deployment.
18. **Cloud reference architectures** — ✅ Resolved 2026-06-16. `docs/CLOUD_REFERENCE_ARCHITECTURES.md` documents self-hosted AWS, GCP, and Azure deployment patterns with provider-native ingress/load balancing, secret management, TLS, health endpoints, and persistence boundaries.
19. **OpenAPI self-hosted server template** — ✅ Resolved 2026-06-16. `website/openapi.yaml` now lists `https://{host}/api` with a DNS variable while preserving local `http://localhost:3000/api`.
20. **Pulumi Helm-release module** — ✅ Resolved 2026-06-16. `deploy/pulumi/helm-release/` deploys the local AMC Helm chart through Pulumi's Kubernetes Helm v3 Release while keeping bootstrap secret literals outside Pulumi stack config/state.
21. **SDK consolidation inventory** — ✅ Resolved 2026-06-16. `docs/SDK.md` now consolidates Node/TypeScript, Python, Go, and OpenAPI contract surfaces with source paths, server roots, and package-publication caveats.
22. **GRC treatment-plan export** — ✅ Resolved 2026-06-16. `amc business grc-export --portfolio risk-portfolio.json --out grc-treatment-plan.csv` exports CSV/JSON/Markdown treatment-plan rows with control owners, due dates, appetite status, ISO 31000 context, and FAIR-style loss-frequency/loss-magnitude fields.
23. **Public leaderboard** — ✅ Resolved 2026-06-16. `amc leaderboard public-export` builds a pseudonymized dataset-card and JSONL bundle with a default 5-agent minimum cohort guard.
24. **Methodology reproducibility packet** — ✅ Resolved 2026-06-16. `amc methodology --reproducibility --json` exports the live public scoring instrument with question-bank hashes, full question metadata, formulas, source paths, commands, and limitations.
25. **Startup guidance and what-broken mode** — ✅ Resolved 2026-06-16. `amc quickstart --startup-plan` prints role-aware startup guidance with sample answers and framework detection; `amc quickstart --what-broken` prints blockers only.

---

## Files Created
- `/Users/sid/AgentMaturityCompass/docs/AUDIT_50_AGENTS_BATCH5.md`

## Acceptance Checks
- All 10 personas audited with 1–10 rating and specific gap identification
- All critical issues are backed by direct CLI execution or file inspection
- Cross-cutting issues (stat inconsistencies, broken commands) verified with actual output

## Next Actions
1. Add generated PDF/share artifact for executive summaries tied to a real run or certificate
2. Create a public reproducibility packet or sample dataset for the whitepaper methodology — ✅ Resolved 2026-06-16 with `amc methodology --reproducibility` and `amc methodology --sample-dataset`
3. Run the accessibility release-evidence command for each release candidate and complete manual AT checks for modal behavior, dense reports, and terminal prompts
4. Reconcile remaining non-count docs drift from the unresolved P2 list

## Risks / Unknowns
- GHCR quickstart image status is no longer overclaimed in public README install commands; publishing docs require public visibility verification before copy-paste GHCR run commands.
- `amc quickscore --share` is an offline badge/summary path, not a hosted publishing backend; use the report/demo share flows for static hosted bundles.
- arXiv submission remains unassigned as of 2026-06-16; paper now discloses this instead of claiming availability
- Full WCAG conformance still needs manual assistive-technology verification beyond the automated and static regressions added here
