# AMC User Persona Audit — Batch 2 (Personas 11–20)

**Date:** 2026-03-14  
**Auditor:** Subagent (automated multi-persona UX audit, depth 1)  
**Method:** Live CLI execution (`amc` installed globally), source code inspection, full `docs/*.md` and `website/docs/` review  
**Verdict:** Brutally honest. A command documented in three places that errors on run is NOT "partially working."

---

## Executive Summary

| # | Persona | Role | Rating | Verdict |
|---|---------|------|--------|---------|
| 11 | Alex | Startup Founder / Badge | **3/10** | `amc cert generate --badge` doesn't exist. `amc badge` doesn't exist. `amc quickscore --share` doesn't exist. Three phantom commands in the main quickstart doc. |
| 12 | Nina | QA Engineer / Assurance | **4/10** | `amc assurance run --all` hard-blocks on vault. No `--no-sign` bypass. `amc assurance list` works. Half the journey is a wall. |
| 13 | Omar | Compliance Auditor / Binder | **3/10** | `amc audit binder create` vault-blocked. `amc verify` shows 19 real ledger failures on a dev workspace. First impression is a corrupted system. |
| 14 | Grace | ML Engineer / Eval | **5/10** | `amc run` vault-blocked. `amc compare` requires args but help is clear. No ML-native eval flow. Has to understand AMC's internal model first. |
| 15 | David | CISO / Red Team | **5/10** | `amc redteam run` works. `amc shield analyze-mcp` doesn't exist — phantom command in docs. Good security depth, rough edges. |
| 16 | Aisha | Enterprise Architect | **4/10** | `amc fleet status` returns `unknown command`. `amc inventory list` returns `unknown command`. Both documented, neither exists. |
| 17 | Carlos | Frontend Dev / Embed | **3/10** | `amc api start` doesn't exist. `amc api routes` and `amc api docs` only work via `npx tsx src/cli.ts` (source), not installed `amc` CLI. `amc dashboard open` blocks terminal, no browser open. |
| 18 | Kim | Regulatory Lawyer | **6/10** | `amc comply report --framework ISO_42001/SOC2/NIST_AI_RMF` all work. Framework names in `website/docs/compliance.html` are wrong — every copy-paste fails. Generates JSON, not human-readable. |
| 19 | Wei | Infrastructure Engineer | **5/10** | `amc watch start` doesn't exist (correct: `amc monitor start`). `amc monitor` works well. `amc alert` exists. `amc metrics status` returns JSON stub. The entire `docs/CONTINUOUS_MONITORING.md` uses wrong command namespace. |
| 20 | Sophie | Technical Writer | **4/10** | 228 markdown docs. Dead command references throughout. Framework name inconsistency across website. `amc quickscore --share`, `amc badge`, `amc fleet status`, `amc inventory list`, `amc watch start` all documented but broken or nonexistent. |

**Batch average: 4.2/10**

The fundamental problem: AMC has deep engineering but documentation and CLI help are out of sync with reality. The personas most likely to evaluate AMC for purchase (Alex, Kim, Omar, Aisha) hit the most phantom commands.

---

## Persona 11 — Alex (Startup Founder) · Rating: **3/10**

**Goal:** Put an AMC trust badge on his product to build investor confidence.

### Journey

Alex reads `docs/GETTING_STARTED.md` (the top-level new-user doc). It says:

```bash
amc quickscore --share
# Outputs a markdown snippet + shields.io badge you can paste anywhere

amc badge
# ![AMC L3](https://img.shields.io/badge/AMC-L3%20Defined-blue)
```

He runs `amc quickscore --share`:
```
error: unknown option '--share'
```

He runs `amc badge`:
```
error: unknown command 'badge'
Closest command paths:
  amc export badge
  amc passport badge
  amc dag
```

He tries `docs/QUICKSTART.md` (the other getting-started doc):
```bash
amc quickscore --share    # Markdown snippet + shields.io badge
amc badge                 # README badge: ![AMC L3](https://img.shields.io/badge/AMC-L3-blue)
```

Same errors. Now he checks `docs/AMC_MASTER_REFERENCE.md`:
```
| `amc badge` | Generate maturity badge for current agent (markdown, HTML, or URL) |
| `amc badge --level <0-5>` | Generate badge for a specific level |
| `amc badge --format html` | HTML <img> tag output |
```

`amc badge` doesn't exist as a top-level command. The real command is `amc passport badge --scope agent --id <id>` — which requires a vault unlock. The `amc cert generate --badge` path from the task instructions also doesn't exist: `amc cert generate` only accepts `--agent`, `--output`, and `--valid-days`.

Alex eventually finds `amc passport badge` but it immediately errors:
```
error: required option '--scope <scope>' not specified
```

With correct flags: `amc passport badge --scope agent --id default`:
```
Vault is locked. Run `amc vault unlock` before signing operations.
```

Dead end. Alex can't get a badge without completing full vault setup — which requires a passphrase, a workspace, and at least one diagnostic run. That's 30+ minutes of setup to get what he thought would be a 2-minute badge.

### Gaps Found

1. **`amc badge` doesn't exist** — documented in GETTING_STARTED.md, QUICKSTART.md, AMC_MASTER_REFERENCE.md, API_REFERENCE.md, MIGRATION doc, and the demo video script. Zero of those point to the real command (`amc passport badge`).
2. **`amc quickscore --share` doesn't exist** — documented in QUICKSTART.md, GETTING_STARTED.md, AMC_MASTER_REFERENCE.md, OSS_ADOPTION_ROADMAP.md. The `amc quickscore --help` shows no `--share` flag.
3. **`amc cert generate --badge` doesn't exist** — `amc cert generate` only takes `--agent`, `--output`, `--valid-days`. The `--badge` flag exists on `amc compare`, not on `amc cert generate`.
4. **`amc passport badge` requires vault** — the simplest badge path still requires full vault setup.
5. **`amc certify` exists but requires `--run` ID** — there's no flow to go from zero to a shareable badge without a completed diagnostic run (which itself requires vault).
6. **No unauthenticated badge path** — Alex can run `amc quickscore` without vault (works!) but cannot generate any badge from that output.
7. **Investor-facing framing absent** — no docs explain what a badge communicates to non-technical stakeholders (investors, board members). The badge generates a shields.io URL, which means nothing to an investor who doesn't understand CI badges.

### Verdict

The badge story is the product's most important marketing hook for builders, and it's completely broken in the installed CLI. Alex would uninstall after 10 minutes.

---

## Persona 12 — Nina (QA Engineer) · Rating: **4/10**

**Goal:** Run assurance packs to understand test coverage, find gaps.

### Journey

Nina runs `amc assurance run --all`:
```
Vault is locked. Run `amc vault unlock` before signing operations.
```

She tries `amc assurance run --all --no-sign`:
```
error: unknown option '--no-sign'
```

She checks `amc assurance --help`: sees `list`, `describe`, `run`, `runs` subcommands. She runs `amc assurance list`:
```
- injection: Prompt Injection Resistance (scenarios=10)
- exfiltration: Secret Exfiltration Resistance (scenarios=10)
- toolMisuse: Legacy Tool Misuse Compatibility Pack (scenarios=10)
- truthfulness: Legacy Truthfulness Compatibility Pack (scenarios=8)
- sandboxBoundary: Legacy Sandbox Boundary Compatibility Pack (scenarios=8)
- notaryAttestation: Legacy Notary Attestation Compatibility Pack (scenarios=8)
- unsafe_tooling: Unsafe Tool Action Resistance (scenarios=8)
...
```

This is useful. But she can't run any of them without vault.

She checks `amc assurance run --help` carefully — no `--no-sign`, no `--dry-run`, no `--demo`. The `wave4-test-coverage-audit.md` (an internal audit doc) reveals that auth is only 45.5% directly covered by tests and that `src/verify/verifyAll.ts` is a high-risk untested path. Nina can read this but can't run her own validation without vault setup.

### Gaps Found

1. **`amc assurance run --all` vault-blocks with no bypass** — this was flagged in Batch 1 audits (UX_AUDIT_REPORT.md, UX_FINAL_AUDIT.md) as "single highest-impact fix" but is still not fixed. `--no-sign` flag promised in audit commentary doesn't exist.
2. **No `--dry-run` or `--demo` mode** — QA engineers evaluating the tool can't try assurance without full setup.
3. **`amc assurance list` works** — this is good. Nina can see 91 packs. But she can't run any of them.
4. **"Legacy" pack names** — `toolMisuse: Legacy Tool Misuse Compatibility Pack`. Why is a production pack labeled "Legacy"? This erodes confidence.
5. **No test coverage surface in CLI** — Nina can't ask `amc assurance coverage` to understand which agent behaviors have assurance packs and which don't.
6. **`amc pack test .` still broken** — scaffold generates `index.mjs`, runner looks for `index.js` (known from Batch 1, still not fixed per UX_FINAL_AUDIT.md Persona 10 Ryan, 3/5).
7. **No output format options in `amc assurance list`** — no `--json` flag, no way to pipe the pack list into automation.

### Verdict

Nina can discover the assurance system (list works) but cannot use it without committing to full vault setup. This is a textbook "evaluation wall." A QA engineer evaluating AMC for their team's toolchain will hit this and deprioritize.

---

## Persona 13 — Omar (External Compliance Auditor) · Rating: **3/10**

**Goal:** Create an audit binder with evidence chain, verify it offline.

### Journey

Omar's first command per docs: `amc audit binder create`

```
error: required option '--scope <scope>' not specified
```

He checks `amc audit binder create --help` to find required flags. Adds `--scope workspace`:

```
Vault is locked. Run `amc vault unlock` before signing operations.
```

He tries `amc verify` (the global verify command, per the task):

```
Ledger verification FAILED
- Missing blob file for event 3b8e0c04...
- Missing blob file for event 076cd8c2...
- Event 9a3ae906... writer signature invalid
- Event 58a0d08e... writer signature invalid
- Event 58a0d08e... receipt verification failed: signature verification failed
[... 15 more failures ...]
```

This is a developer workspace with a non-fresh ledger — events were created by the audit process without proper vault signing. To an external auditor, this looks like a **compromised evidence chain**. The correct interpretation is "these are unsigned dev events," but there's no explanation in the output.

Omar reads `docs/AUDIT_BINDER.md` — it requires a complete signed audit trail. He reads `docs/COMPLIANCE_MAPS.md` — solid, explains the evidence model well. But he can't generate a binder to verify.

### Gaps Found

1. **`amc audit binder create` requires `--scope`** — the docs (`amc audit binder create`) don't show required args; help is needed to discover this. The failure message "required option '--scope'" is technically correct but unhelpful — it doesn't say what values `--scope` accepts.
2. **Vault blocks binder creation** — external auditors can't generate a binder from existing evidence without vault access. There's no read-only binder export mode.
3. **`amc verify` output is alarming without context** — 19 failures on a dev workspace looks like a security incident. No caveat like "signatures invalid because vault was not unlocked during these events." An external auditor would file this as a finding against the product.
4. **`amc audit binder list` works** — but returns empty without any guidance.
5. **No read-only auditor role** — the docs describe RBAC with OWNER/AUDITOR/VIEWER roles but `amc user role` commands require vault. An external auditor cannot be given read-only access without the vault owner completing setup.
6. **No sample/demo binder** — no way to show Omar what a binder looks like before he generates one.
7. **`amc audit binder verify <file>` works** but there's no binder to verify without vault.

### Verdict

Omar's journey is: try command → missing required arg → fix arg → vault block → try verify → see 19 failures. He leaves thinking AMC generates corrupted evidence chains. This is the worst possible impression for a compliance product.

---

## Persona 14 — Grace (ML Engineer) · Rating: **5/10**

**Goal:** Run evals on agent behaviors, compare model outputs, evaluate custom training data.

### Journey

Grace runs `amc run`:
```
Vault is locked. Run `amc vault unlock` before signing operations.
```

She tries `amc compare`:
```
error: missing required argument 'items'
```

She checks `amc compare --help` — it's actually clear: `amc compare <runId1> <runId2>` or `amc compare <model1> <model2>`. She tries `amc compare gpt-4o claude-3-5-sonnet --agent default`:

This would require a live run (which is vault-blocked). She explores `amc whatif --help` — solid documentation of counterfactual comparison. She finds `amc eval import` which works for LangSmith/DeepEval/Promptfoo formats. `amc quickscore --auto` is available. `docs/INTEGRATIONS.md` is comprehensive for provider coverage.

The `amc run` vault block is the primary obstacle. `amc eval import --format langsmith --file <file>` is the escape hatch but it requires having LangSmith output already — not useful for bootstrapping.

### Gaps Found

1. **`amc run` vault-blocked** — the primary eval command requires vault. No `--no-sign` bypass.
2. **No native ML eval format** — Grace is used to eval frameworks (Evals by OpenAI, DeepEval, Ragas). AMC imports them but doesn't feel like a peer. No BLEU/ROUGE/BERTScore integration.
3. **`amc compare` requires existing run IDs** — if you don't have runs, you can't compare. The bootstrap sequence isn't documented: "to compare, first run X, then Y, then compare."
4. **No dataset-level eval** — AMC scores agents by governance/behavior, not by task performance on a dataset. Grace would need to integrate her own eval framework and then import results.
5. **`amc whatif` exists** but isn't discoverable — it doesn't appear in `--help` footer suggestions. Grace would never find it without reading docs.
6. **Custom model training path absent** — no docs for "I'm fine-tuning a model, here's how to track behavioral drift across training runs."
7. **No comparison of training checkpoints** — `amc compare` compares diagnostic runs or models, not model checkpoints.

### Verdict

Solid eval infrastructure buried under vault requirements and ML-engineer-unfamiliar vocabulary. Grace will integrate with AMC only if she has dedicated time to learn its model. She won't adopt it spontaneously.

---

## Persona 15 — David (CISO) · Rating: **5/10**

**Goal:** Evaluate security posture, run vulnerability scanning, red team agents.

### Journey

David runs `amc redteam run`:
```
Usage: amc redteam run [options] [agentId]
...strategies, plugins...
```

`amc redteam strategies` → lists strategies (direct, indirect, multi-step, adversarial).  
`amc redteam plugins` → lists 91 attack plugins. This is impressive.

He runs `amc shield analyze-mcp`:
```
error: unknown command 'analyze-mcp'
Tip: add '--help' after any command to see available options.
```

`amc shield --help` shows: `analyze`, `sandbox`, `sbom`, `reputation`, `conversation-integrity`, `threat-intel`, `detect-injection`, `sanitize`. No `analyze-mcp`.

He reads `docs/MARKET_INTELLIGENCE_MARCH_2026.md`:
> `amc shield analyze-mcp <server>` — deep security analysis of MCP server

This is listed as a **Tier 1 feature** to ship. It's in the roadmap docs but presented as if it already exists.

David finds `docs/MITRE_ATLAS_MAPPING.md` — comprehensive and impressive. He finds `docs/SECURITY.md` — solid. `docs/THREAT_MODEL.md` (if it exists) would be his next read. He runs `amc shield sbom ./package.json` — works. `amc watch safety-test default` — works (6 tests, all pass).

`amc redteam run` itself requires an agent and ultimately needs vault to sign results.

### Gaps Found

1. **`amc shield analyze-mcp` doesn't exist** — listed as a Tier 1 feature in `docs/MARKET_INTELLIGENCE_MARCH_2026.md`. The CLI only has `amc shield analyze <path>` (static code analyzer). CISO specifically looking for MCP security gets a dead command.
2. **`amc redteam run` doesn't provide useful output without a live agent** — it runs assurance packs, which are vault-blocked. No demo/dry-run mode.
3. **`amc watch safety-test` only runs 6 tests** — for a CISO, 6 tests is insufficient. No way to expand scope or target specific attack categories.
4. **No CVE/vulnerability database integration** — `amc shield reputation <toolId>` exists but no reference to CVE scanning.
5. **`amc shield sandbox <agentId>` exists** but requires a configured agent. No sandbox configuration docs linked from the command help.
6. **RBAC for security roles absent from CLI** — `docs/RBAC.md` describes the model, but `amc user role assign` commands all require vault.
7. **No SIEM integration docs** — `amc alert config` supports webhooks/Slack/PagerDuty but no direct Splunk/Sentinel/QRadar integration guides.
8. **Phantom roadmap feature in technical docs** — `analyze-mcp` is in market intelligence docs (internal) presented as a real feature. If David is shown these docs, he'll expect a command that doesn't exist.

### Verdict

Better than most personas — the red-team surface is real and deep. The `analyze-mcp` phantom command and vault blocks on actual execution are the main issues. David would rate AMC positively in a briefing but find gaps when he tries to actually run anything.

---

## Persona 16 — Aisha (Enterprise Architect) · Rating: **4/10**

**Goal:** Get agent inventory, understand fleet management at scale.

### Journey

Aisha runs `amc fleet status`:
```
error: unknown command 'status'
Tip: add '--help' after any command to see available options.
```

She runs `amc inventory list`:
```
error: unknown command 'list'
Tip: add '--help' after any command to see available options.
```

Both commands were documented as working in `docs/UX_AUDIT_REPORT.md` (Batch 1 audit fixed F4: "`amc fleet status` doesn't exist" → "✅ Works"). But checking `docs/UX_FINAL_AUDIT.md` (Round 3 audit): `amc fleet status` was confirmed working. Checking live: it errors. The fix may have been reverted or is only in source, not in the installed CLI.

She finds `amc fleet --help` → real subcommands are `health`, `score`, `report`, `init`, etc. No `status`. She runs `amc fleet health` → works:
```
Fleet baseline integrity: 0.000
Agents: 1 (scored 1)
Average overall level: 1.00
```

She runs `amc inventory --help` → subcommand is `scan`, not `list`. She runs `amc inventory scan` → works:
```
🔍 AI Asset Inventory (1 assets found)
  agent (1): ● default [amc-registered]
```

The correct commands exist (`fleet health`, `inventory scan`) but the documented commands (`fleet status`, `inventory list`) don't.

### Gaps Found

1. **`amc fleet status` doesn't exist** — the correct command is `amc fleet health`. This was allegedly fixed in previous audits but is broken in the installed CLI. The discrepancy between audit docs (says "fixed") and live behavior is itself a quality control failure.
2. **`amc inventory list` doesn't exist** — the correct command is `amc inventory scan`. No alias provided.
3. **`amc fleet health` shows `0.000` integrity** — with no explanation of what `[UNRELIABLE — DO NOT USE FOR CLAIMS]` means when there's no active monitoring. Aisha would wonder if her AMC installation is broken.
4. **`amc inventory scan` only finds 1 agent** — with no guidance on how to register more agents or what "AI Asset Inventory" means in multi-team contexts.
5. **No `amc fleet overview` command** — Aisha wants a one-shot executive summary. `fleet health` gives numbers but no narrative.
6. **No bulk agent registration** — `amc inventory scan` finds AMC-registered agents. There's no docs on discovering and registering existing agents across an org.
7. **Fleet trust graph requires vault** — `amc fleet trust-init`, `trust-add-edge` all require vault. The most enterprise-relevant features are gated.
8. **No multi-workspace fleet aggregation** — docs suggest federation is possible but no CLI path for "show me agents across all teams."

### Verdict

`amc fleet health` and `amc inventory scan` work but aren't discoverable from docs. The documented commands fail. An enterprise architect evaluating AMC would have to know to look beyond the first error to find the working alternatives — which real users don't do.

---

## Persona 17 — Carlos (Frontend Dev) · Rating: **3/10**

**Goal:** Embed AMC dashboard/widgets in his app, use the REST API programmatically.

### Journey

Carlos runs `amc dashboard open`:
Terminal blocks at "Dashboard serving at http://127.0.0.1:3210" — no browser opens. He has to manually navigate to localhost:3210 and Ctrl+C to stop. Same issue documented in Batch 1 (UX_AUDIT_REPORT.md F5: "auto-open browser"). Still not fixed.

Carlos runs `amc api start`:
```
error: unknown command 'start'
Closest command paths:
  amc api status
  amc dag
```

`amc api --help` shows only: `status`, `help`. `amc api routes` → errors with `unknown command 'routes'`. `amc api docs` → errors with `unknown command 'docs'`.

IMPORTANT: `amc api routes` and `amc api docs` DO work via `npx tsx src/cli.ts api routes` (source run) but NOT via the installed `amc` binary. This means these commands were added to source but never published in the npm package. Carlos using the published package can't access them.

`amc api status` works and tells him to run `amc studio open` to start the server. He tries that — requires vault passphrase.

He reads `docs/API_REFERENCE.md` — comprehensive (1777+ lines). He reads `docs/DASHBOARD.md` — mentions `components/*.js` for embedding. But there's no guide for embedding the dashboard as an iframe or React component in an external app.

### Gaps Found

1. **`amc api start` doesn't exist** — documented in AUDIT_50_AGENTS_BATCH4.md as a known issue (Persona 35 Victor, also noted in R5). Still broken. `amc api status` only.
2. **`amc api routes` and `amc api docs` only work from source** — they're in `src/cli.ts` but not in the published binary. Carlos can see them in the internal audit docs but running `amc api routes` fails.
3. **`amc dashboard open` blocks terminal, doesn't open browser** — the second most-cited UX issue (after vault blocks). Still not fixed.
4. **No embedding guide** — `docs/DASHBOARD.md` mentions `components/*.js` but no docs explain how to embed the dashboard as an iframe, web component, or React module in an external app.
5. **No CORS configuration docs** — Carlos needs to know the Studio server's CORS policy to make cross-origin API calls from his app.
6. **REST API requires vault-started Studio server** — Carlos can't explore the API without completing full vault setup first.
7. **`amc studio open` vs `amc up` confusion** — `amc api status` says "run `amc studio open`", but the quickstart says "run `amc up`". Both start the server but the docs use them interchangeably with no explanation.
8. **No API client generation** — no `amc api generate-client` for TypeScript/React integration. The OpenAPI spec at `website/openapi.yaml` exists but there's no CLI to generate typed clients from it.

### Verdict

Carlos hits three consecutive blockers (dashboard no browser-open, api start missing, api routes source-only) before even getting to the embedding question. He'd use a different tool.

---

## Persona 18 — Kim (Regulatory Lawyer) · Rating: **6/10**

**Goal:** Get compliance mapping for ISO 42001, SOC2, NIST AI RMF for regulatory filings.

### Journey

Kim runs `amc comply report --framework ISO_42001` → **Works**:
```
Compliance report generated: compliance-iso_42001.json
Framework: ISO/IEC 42001:2023 + ISO/IEC 42005:2025 + ISO/IEC 42006:2025
Coverage score: 0.455
```

She runs `amc comply report --framework SOC2` → **Works**:
```
Coverage score: 0.500
```

She runs `amc comply report --framework NIST_AI_RMF` → **Works**:
```
Coverage score: 0.500
```

But Kim found this page before the CLI: `website/docs/compliance.html`. It shows:
```bash
amc compliance report --framework iso-42001
amc compliance report --framework nist-ai-rmf
amc compliance report --framework soc2
amc compliance report --framework owasp-llm
```

She copies these from the website. ALL FOUR FAIL:
```
Unsupported compliance framework: iso-42001
Unsupported compliance framework: nist-ai-rmf
Unsupported compliance framework: soc2
Unsupported compliance framework: owasp-llm
```

Every single framework name in the website's compliance page uses the wrong format. The correct names use underscores and uppercase (`ISO_42001`, `NIST_AI_RMF`, `SOC2`). The website uses lowercase hyphenated format. This is a systematic copy-paste failure for every user who finds the compliance feature via the website.

After figuring out the correct format, Kim gets JSON output — not a human-readable report. For regulatory filings, she needs a formatted document, not raw JSON.

### Gaps Found

1. **`website/docs/compliance.html` uses wrong framework names** — ALL four examples use `iso-42001`, `nist-ai-rmf`, `soc2`, `owasp-llm`. CLI rejects all of them. Correct: `ISO_42001`, `NIST_AI_RMF`, `SOC2`. This is an unambiguous bug affecting every website user.
2. **`amc comply report` with no args errors cryptically** — `required option '--framework <framework>' not specified`. Doesn't list available frameworks. The `amc comply --help` shows subcommands but not framework names. Kim has to go digging.
3. **Output is JSON, not human-readable** — regulatory lawyers need formatted markdown/PDF reports for filings. `amc comply report --framework ISO_42001` generates `compliance-iso_42001.json` with raw JSON. No `--format markdown` or `--format pdf` option.
4. **Coverage scores are meaningless without context** — "Coverage score: 0.455" for ISO 42001. Is that good? Bad? What's the minimum for compliance? No benchmarks, no pass/fail threshold in the output.
5. **`amc compliance fleet` requires `--framework`** — useful for org-level reporting, but Kim's first attempt returns `required option '--framework'`. Same discoverability problem.
6. **`amc compliance verify` gives wrong error** — returns "Compliance maps signature invalid: compliance maps signature missing" even for a fresh install. This is a dev workspace issue but looks like a broken installation to a first-time user.
7. **Website also uses `amc compliance report` (not `comply`)** — website blog post `eu-ai-act-agents.html` uses `amc compliance report --framework eu-ai-act`. CLI accepts both `comply` and `compliance` as namespace aliases, but `eu-ai-act` as a framework name fails (correct: `EU_AI_ACT`).
8. **ISO 42001 coverage at 0.455 means 45.5%** — Kim would need to understand what controls are missing to make a filing. The JSON output has this but it's not surfaced in the CLI output.

### Verdict

Best persona in this batch. The commands work once you know the right format. But if Kim found AMC through the website (the most likely path), every compliance example she copies will fail. Fix the website framework names → immediate 2-point improvement.

---

## Persona 19 — Wei (Infrastructure Engineer) · Rating: **5/10**

**Goal:** Set up monitoring, alerting, and Prometheus/OTel observability for an AI agent fleet.

### Journey

Wei runs `amc watch start --agent default` (from `docs/CONTINUOUS_MONITORING.md`):
```
error: unknown command 'start'
Tip: add '--help' after any command to see available options.
```

He checks `amc watch --help`:
```
Commands:
  attest <output>
  explain <agentId> <runId>
  safety-test <agentId>
  host-hardening
```

`amc watch` is **not** the monitoring namespace. The monitoring commands are under `amc monitor`. But `docs/CONTINUOUS_MONITORING.md` uses `amc watch start`, `amc watch status`, `amc watch events`, `amc watch metrics` throughout. The entire doc is wrong.

He finds `amc monitor --help` → has `start`, `check`, `status`, `events`, `metrics`. The correct commands exist.

He tries `amc monitor start --agent default` — this starts a background process (no output, terminal doesn't return). He kills it.

`amc monitor status` → works:
```
Active monitors: 0
Total incidents: 0
Total anomalies: 0
No active monitors
```

`amc alert --help` → exists with `send`, `config`, `test`.  
`amc metrics status` → returns JSON `{"host": "127.0.0.1", "port": 9464}` — Prometheus endpoint location. This is useful.  
`amc observe timeline` → works. `amc observe anomalies` → works.  
`amc drift check` → works. `amc drift report` → works.

OTel: `src/observability/otelExporter.ts` exists. `src/ops/otelExporter.ts` also. No CLI to configure OTel — must set env vars directly.

### Gaps Found

1. **`docs/CONTINUOUS_MONITORING.md` uses entirely wrong command namespace** — all 8+ `amc watch start/status/events/metrics` references in this doc are wrong. The real commands are `amc monitor start/status/events/metrics`. This is the primary monitoring doc and it's systematically broken.
2. **`amc watch` has been repurposed** — it now means "observability, attestation, and safety testing," not continuous monitoring. The rename either happened after the doc was written or docs were never updated.
3. **`amc monitor start --agent` silently backgrounds** — no confirmation output, no PID, no "monitoring started, check status with `amc monitor status`". Wei has no idea if it worked.
4. **`amc alert test` returns "No destinations configured"** — not actionable. Should say "configure with `amc alert config --destination slack --url <webhook>`."
5. **No `amc metrics scrape` command** — Wei needs Prometheus to scrape `localhost:9464/metrics`, but `amc metrics status` only returns the bind address. No command to verify the endpoint is up or test scrape.
6. **OTel configuration via env vars only** — no `amc otel config` command. `OTEL_EXPORTER_OTLP_ENDPOINT` must be set externally. No CLI guidance.
7. **No Grafana dashboard JSON** — docs mention Prometheus metrics but no pre-built Grafana dashboard template for AMC metrics.
8. **`amc sla` / `amc slo` commands don't exist** — `src/ops/governanceSlo.ts` exists in source but isn't exposed as a CLI command. SRE vocabulary gap.
9. **`amc monitor start` requires `--agent`** but the help output says `Options: --agent <id>` — it's optional per help text but the monitor silently does nothing without it. No error, no confirmation.

### Verdict

The monitoring subsystem works (monitor, alert, observe, drift, metrics) but the main doc is wrong. Wei who follows `docs/CONTINUOUS_MONITORING.md` gets errors on every command. Wei who discovers `amc monitor` directly gets a reasonable experience. The doc is the bug.

---

## Persona 20 — Sophie (Technical Writer) · Rating: **4/10**

**Goal:** Evaluate docs completeness, consistency, and accuracy across all surfaces.

### Journey

Sophie reads all 228 markdown docs plus `website/docs/` (12 files). She's looking for: dead references, inconsistency, missing coverage, and commands that don't match the CLI.

**High-severity findings:**

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| S1 | `amc badge` documented in 8+ places, doesn't exist | GETTING_STARTED.md, QUICKSTART.md, AMC_MASTER_REFERENCE.md, API_REFERENCE.md, MIGRATION doc, demo video script | CRITICAL — flagship marketing feature |
| S2 | `amc quickscore --share` documented in 5+ places, doesn't exist | QUICKSTART.md, GETTING_STARTED.md, AMC_MASTER_REFERENCE.md, OSS_ADOPTION_ROADMAP | CRITICAL — first user action |
| S3 | `website/docs/compliance.html` uses wrong framework names (iso-42001 vs ISO_42001) | All 4 framework examples | HIGH — entire compliance feature broken via website |
| S4 | `docs/CONTINUOUS_MONITORING.md` uses `amc watch start/status/events/metrics` throughout — all wrong | 8 command references | HIGH — primary monitoring doc |
| S5 | `amc fleet status` documented as fixed/working, actually errors | UX_AUDIT_REPORT, UX_FINAL_AUDIT (claimed fixed) | HIGH — audit docs contradict live CLI |
| S6 | `amc inventory list` documented in task spec, doesn't exist | FLEET.md, ENTERPRISE.md | MEDIUM |
| S7 | `amc shield analyze-mcp` in market docs as if existing feature | MARKET_INTELLIGENCE_MARCH_2026.md | MEDIUM — internal confusion |
| S8 | `amc certify` vs `amc cert generate` — two commands, unclear which is primary | CERTIFICATION.md, API_REFERENCE.md, AMC_MASTER_REFERENCE.md | MEDIUM |
| S9 | `website/blog/eu-ai-act-agents.html` uses `--framework eu-ai-act` (wrong) | One blog post | LOW |
| S10 | `website/docs/cli.html` lists `amc compliance fleet/diff/init/verify` but init/verify fail on fresh install | website | LOW |
| S11 | `amc api start` documented as expected feature in Batch 4 audit, not fixed | AUDIT_50_AGENTS_BATCH4.md, UX_AUDIT_REPORT | MEDIUM |
| S12 | Question bank counts inconsistent: docs say 42, 67, 89, 113, 126 in different places | Wave 4 doc audit flagged this | HIGH — credibility issue |
| S13 | `amc assurance run --scope full` vs `amc assurance run --all` — both referenced in docs, both fail on vault | UX_AUDIT_REPORT.md footer shows wrong one (`--scope full`) | MEDIUM |
| S14 | `amc passport badge` requires `--scope` but docs show `amc badge` (no scope needed) | GETTING_STARTED.md vs live CLI | HIGH |

**Medium-severity structural issues:**

15. **No single authoritative command reference** — commands appear in AMC_MASTER_REFERENCE.md, API_REFERENCE.md, website/docs/cli.html, and the help footer. They contradict each other.
16. **PERSONAS.md doesn't include** the personas in this audit batch (startup founders, enterprise architects, regulatory lawyers) — it has "Solo builder," "Platform engineer," "Security/compliance/governance lead," "AI product team," "Evaluator/researcher." No "Regulatory Lawyer" or "Enterprise Architect" persona path.
17. **Wave 4 audit docs** (8 docs) are internal engineering artifacts accessible to users at `docs/wave4-*.md`. They expose internal gaps, unfixed bugs, and test coverage weaknesses. Sophie would find these alarming if she's evaluating AMC for enterprise purchase.
18. **`docs/AUDIT_50_AGENTS_BATCH3.md` and `BATCH4.md`** are also user-visible, showing previous users rating AMC 2-4/10 in multiple dimensions. This is either radical transparency or a product liability.
19. **Quickstart footer in every help command** still shows `amc assurance run --scope full` (wrong, should be `--all` per previous fixes).

### Gaps Found (Documentation-Level)

1. **No single authoritative "commands that exist and work" reference** — every reference doc has phantom commands.
2. **Docs update process broken** — features are added to source without updating docs, and vice versa (docs updated without implementing features).
3. **Website and CLI docs diverge on framework names** — systematic inconsistency affecting every compliance user.
4. **Internal engineering docs exposed publicly** — wave4 audit reports and persona audit batches are in `docs/` directory, visible to users.
5. **Question bank cardinality is unresolved** — 42, 67, 89, or 113 questions? Different docs say different things. Critical for anyone using AMC for formal assessment.
6. **`docs/INDEX.md` is a routing page** but misses several major doc files (AUDIT_BINDER.md, ASSURANCE_CERTS.md, BENCHMARKING.md, etc.).

### Rating: **4/10**
*AMC has excellent technical depth in 30-40% of its docs. But the other 60% range from stale to actively wrong. A technical writer auditing this would produce a 50-item remediation list before approving it for a product launch.*

---

## Cross-Persona Gap Summary

### Critical (P0 — breaking for most users)

| Gap ID | Description | Affects |
|--------|-------------|---------|
| G-B2-01 | `amc badge` command doesn't exist (8 docs say it does) | Alex, Sophie |
| G-B2-02 | `amc quickscore --share` doesn't exist (5 docs say it does) | Alex, Sophie |
| G-B2-03 | `website/docs/compliance.html` wrong framework names — ALL 4 examples fail | Kim, Sophie |
| G-B2-04 | `docs/CONTINUOUS_MONITORING.md` uses `amc watch` for all examples — all wrong | Wei, Sophie |
| G-B2-05 | `amc assurance run --all` vault-blocks with no bypass flag | Nina, Grace, David |
| G-B2-06 | `amc fleet status` doesn't exist (correct: `amc fleet health`) | Aisha, Sophie |
| G-B2-07 | `amc inventory list` doesn't exist (correct: `amc inventory scan`) | Aisha |

### High (P1 — blocking for specific personas)

| Gap ID | Description | Affects |
|--------|-------------|---------|
| G-B2-08 | `amc api start` doesn't exist | Carlos, Sophie |
| G-B2-09 | `amc api routes` and `amc api docs` only work from source, not installed binary | Carlos |
| G-B2-10 | `amc shield analyze-mcp` doesn't exist (in market docs as real feature) | David, Sophie |
| G-B2-11 | `amc verify` shows 19 failures on dev workspace — alarming without context | Omar |
| G-B2-12 | `amc audit binder create` requires undocumented `--scope` arg | Omar |
| G-B2-13 | `amc dashboard open` blocks terminal, no browser auto-open | Carlos, Alex |
| G-B2-14 | `amc passport badge` requires vault (badge path for Alex is completely blocked) | Alex |
| G-B2-15 | Question bank count inconsistency: 42/67/89/113/126 across docs | Sophie, Omar, Grace |

### Medium (P2 — friction without hard block)

| Gap ID | Description | Affects |
|--------|-------------|---------|
| G-B2-16 | `amc comply report` with no args gives cryptic error, doesn't list frameworks | Kim |
| G-B2-17 | Compliance JSON output not human-readable (no `--format markdown/pdf`) | Kim, Omar |
| G-B2-18 | `amc assurance list` packs labeled "Legacy" erodes confidence | Nina |
| G-B2-19 | `amc monitor start` silently starts without confirmation | Wei |
| G-B2-20 | No `amc sla`/`amc slo` top-level commands | Wei |
| G-B2-21 | Wave4 engineering audit docs exposed in public `docs/` | Sophie |
| G-B2-22 | `amc certify` vs `amc cert generate` — two paths, unclear which is canonical | Alex, Omar |
| G-B2-23 | `amc assurance run --scope full` in help footer (wrong, should be `--all`) | Nina |
| G-B2-24 | PERSONAS.md missing regulatory lawyer, enterprise architect, startup founder paths | Kim, Aisha, Alex |

---

## Priority Fixes (Ranked by User Impact)

### Must Fix Before Product Launch

1. **Add `amc badge` top-level command alias** → `amc passport badge --scope agent --id default` with no-vault fallback showing shields.io URL from latest quickscore. Fix in 2 hours. Unblocks Alex, fixes 8 docs instantly.

2. **Fix `website/docs/compliance.html` framework names** → change `iso-42001` → `ISO_42001`, `nist-ai-rmf` → `NIST_AI_RMF`, `soc2` → `SOC2`, `owasp-llm` → `OWASP_LLM_TOP_10` (or whatever the correct name is). Fix in 15 minutes. Unblocks every Kim who comes through the website.

3. **Rewrite `docs/CONTINUOUS_MONITORING.md`** → replace all `amc watch start/status/events/metrics` with `amc monitor start/status/events/metrics`. Fix in 30 minutes. Unblocks Wei.

4. **Add `--no-sign` bypass to `amc assurance run`** → allow assurance packs to run without vault signing for evaluation. This is the single highest-impact fix per the previous audit (UX_AUDIT_REPORT.md). Still not done. 1 day of work. Unblocks Nina, David, Omar.

5. **Add `amc fleet status` alias** → alias to `amc fleet health`. 15 minutes. Unblocks Aisha.

6. **Add `amc inventory list` alias** → alias to `amc inventory scan`. 15 minutes. Unblocks Aisha.

### Should Fix Within 2 Weeks

7. **`amc quickscore --share`** → implement the flag to print shields.io badge URL + markdown snippet from quickscore output. No vault required. 4 hours.

8. **`amc dashboard open` auto-browser** → add `open`/`start` system call after starting the server. 1 hour.

9. **`amc comply report` list frameworks on error** → when `--framework` is missing, print available framework names instead of a bare error. 1 hour.

10. **Move wave4 engineering audit docs** → out of `docs/` and into `docs/internal/` or `.amc/audits/`. They shouldn't be user-visible.

11. **Publish `amc api routes` and `amc api docs` in npm package** → these exist in source but not in the published binary.

12. **Reconcile question bank count** → pick one canonical number, update all docs. This is a credibility issue.

---

## Files Examined

- CLI: `amc` (installed binary), `src/cli.ts`, `src/cli-watch-commands.ts`
- Docs: All 228 `docs/*.md` files + `website/docs/` (12 files)  
- Key docs: CONTINUOUS_MONITORING.md, ASSURANCE_LAB.md, FLEET.md, CERTIFICATION.md, COMPLIANCE_FRAMEWORKS.md, ISO_42001_ALIGNMENT.md, STANDARDS_MAPPING.md, METRICS.md, BRIDGE.md, SDK.md, GETTING_STARTED.md, QUICKSTART.md, AMC_MASTER_REFERENCE.md, API_REFERENCE.md
- Previous audit reports: UX_AUDIT_REPORT.md, UX_FINAL_AUDIT.md, AUDIT_50_AGENTS_BATCH3.md, AUDIT_50_AGENTS_BATCH4.md, wave4-*.md

---

*Audit complete. Next batch should cover personas 21-30 if not already done (covered in BATCH3.md).*
