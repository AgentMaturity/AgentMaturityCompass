# G0DM0D3 vs AMC — Competitive Gap Report

**Date:** 2026-04-03
**G0DM0D3 repo:** github.com/elder-plinius/G0DM0D3 (~17,000 LOC)
**AMC steer module:** /src/steer/ (~2,962 LOC) + related modules

---

## Executive Summary

AMC already has parity or advantage on most steer/runtime features.
G0DM0D3 has a few UX/research features AMC lacks entirely.
Below: feature-by-feature comparison and actionable gaps.

---

## Feature Comparison Matrix

| # | Feature | G0DM0D3 | AMC | Gap? |
|---|---------|---------|-----|------|
| 1 | **AutoTune (context-adaptive params)** | 639 LOC, 5 context types, 6 strategies, conversation history scoring, low-confidence blending | 355 LOC, 5 context types (incl. adversarial), 4 strategies, history support, pipeline integration | **MINOR** — AMC is slightly thinner but has adversarial type G0DM0D3 lacks |
| 2 | **Feedback Loop (EMA learning)** | 354 LOC, EMA alpha=0.3, max 500 history, per-context learned profiles | 298 LOC, EMA-based, per-context buckets, positive/negative EMAs | **PARITY** — architecturally equivalent |
| 3 | **Parseltongue (input obfuscation)** | 432 LOC, 60+ trigger words, 6 techniques (leet/homoglyph/zwj/case/phonetic/mix), 3 intensities | N/A — AMC has `shield/detector.ts` and `redteam/perturbation.ts` for DETECTING obfuscation, not APPLYING it | **N/A** — AMC is a trust framework, not a jailbreak tool. Obfuscation application is antithetical to AMC's mission |
| 4 | **Harm Classifier** | 536 LOC regex + 208 LOC LLM (Llama-3.1-8B), 13 domains, dual-path | 347 LOC, 12 domains, allowlist support, dual-path (regex + LLM fallback) | **PARITY** — AMC has allowlists (security research context), G0DM0D3 has one more domain (meta) |
| 5 | **Multi-Model Race** | 425 LOC, 5-axis scoring (length/structure/anti-refusal/directness/relevance), tiered model lists | 198 LOC, uses microScore, OpenAI + Anthropic response extraction, fastestAboveThreshold mode | **MINOR** — AMC race is functional but leaner. G0DM0D3 has more scoring axes |
| 6 | **Liquid Response (streaming)** | ~200 LOC in routes, progressive "best-so-far" display, 8% min improvement threshold, max 4 attempts | 201 LOC, token-level buffering, sentence-boundary flushing, hygiene transform during stream | **DIFFERENT APPROACH** — G0DM0D3: "replace whole response with better one". AMC: "transform stream in-flight". Both valid |
| 7 | **Consortium (hive-mind synthesis)** | 361 LOC, queries N models → orchestrator synthesizes unified response, 5 tiers (fast→ultra) | 364 LOC, multi-org collaborative benchmarking protocol (different concept!) | **DIFFERENT CONCEPT** — G0DM0D3 consortium = multi-model synthesis. AMC consortium = multi-org benchmark sharing. Not comparable |
| 8 | **STM / Output Hygiene** | 153 LOC, 3 modules (hedge/direct/casual), regex-based | 168 LOC, hedge + preamble stripping, SteerStage integration | **PARITY** — AMC has more patterns (16 hedge, 12 preamble). G0DM0D3 has casual mode (formal→informal) AMC lacks |
| 9 | **Privacy Tiers** | 146 LOC, free/pro/enterprise, rate limits, feature gates | 207 LOC, multi-level tiers, telemetry filtering, data residency | **AMC ADVANTAGE** — AMC's privacy tiers are more granular |
| 10 | **Telemetry** | 203 LOC, privacy-first, batched beacon, no PII | AMC has `telemetry/telemetryCli.ts` + `ops/otelExporter.ts` | **AMC ADVANTAGE** — AMC has OpenTelemetry export, G0DM0D3 is fire-and-forget |
| 11 | **MicroScore (response quality)** | Embedded in ultraplinian (5 axes, 100 total) | 291 LOC standalone module, reusable across race/liquid/pipeline | **AMC ADVANTAGE** — AMC's scoring is modular and reusable |
| 12 | **Parameter Matrix** | Embedded in autotune | 256 LOC dedicated module | **AMC ADVANTAGE** — separated concern |
| 13 | **Thermostat CLI** | None | 432 LOC interactive CLI for tuning | **AMC ADVANTAGE** — AMC has CLI tooling |
| 14 | **Pipeline orchestration** | Hardcoded in ChatInput.tsx (877 LOC) | 43 LOC pipeline.ts + 130 LOC index.ts, composable SteerStage abstraction | **AMC ADVANTAGE** — clean composable pipeline vs. monolith |

---

## GAPS: What G0DM0D3 Has That AMC Lacks

### GAP 1: Research Evaluation Suite (PRIORITY: HIGH)
**G0DM0D3:** 6 rigorous evaluation scripts (~2,018 LOC total):
- `eval_autotune_classification.ts` — 207 labeled test cases, confusion matrix, F1
- `eval_baselines.ts` — 4 baseline comparisons, bootstrap CIs, McNemar's test
- `eval_feedback_convergence.ts` — 5 synthetic user profiles, noise robustness
- `eval_parseltongue_analysis.ts` — Trigger recall, Levenshtein distance analysis
- `eval_scoring_calibration.ts` — Scoring monotonicity, tier discrimination
- `eval_stm_precision.ts` — Per-module precision/recall/F1

**AMC:** Has eval framework (`src/eval/`) but no steer-specific research evals.
**Action:** Create `research/` directory with steer-focused evaluation scripts.

### GAP 2: Casual Mode / Formality Transform (PRIORITY: LOW)
**G0DM0D3:** STM casual mode — 22 formal→informal substitutions
**AMC:** Has hedge + preamble but no formality transform
**Action:** Add optional `casualMode` to hygiene.ts

### GAP 3: HuggingFace Dataset Publishing (PRIORITY: MEDIUM)
**G0DM0D3:** Full auto-publishing pipeline to HuggingFace datasets:
- `hf-publisher.ts` (296 LOC) — auto-flush on 80% buffer, 30-min timer, SHA-256 dedup
- `hf-reader.ts` (327 LOC) — two-tier caching, filtering
- `dataset.ts` (184+231 LOC) — in-memory buffer engine

**AMC:** Has `benchmarks/huggingFacePublisher.ts` but may be thinner.
**Action:** Verify depth of existing HF publisher. Deepen if needed.

### GAP 4: Research API Endpoints (PRIORITY: MEDIUM)
**G0DM0D3:** Full research API (277 LOC): stats, batches, query, flush, download
**AMC:** Has bridge server but no dedicated research API
**Action:** Consider adding research data access endpoints to bridge/gateway.

### GAP 5: Anti-Refusal Scoring Axis (PRIORITY: MEDIUM)
**G0DM0D3 microScore:** 25+ refusal phrase patterns with penalty scoring
**AMC microScore:** Has response quality scoring but may lack explicit refusal detection
**Action:** Verify AMC microScore covers refusal detection. Add if missing.

---

## GAPS: What AMC Has That G0DM0D3 Lacks (Competitive Advantages)

1. **235-question diagnostic framework** — G0DM0D3 has nothing comparable
2. **5-layer trust architecture** — no equivalent in G0DM0D3
3. **Compliance frameworks** (EU AI Act, NIST) — absent from G0DM0D3
4. **Red team engine** (TAP, perturbation, adversarial generation) — G0DM0D3 only does obfuscation
5. **Shield module** (injection detection, MCP security) — G0DM0D3 has no defensive layer
6. **Fleet management** (cascade simulator, A/B) — absent
7. **Pack system** — full package management, registries
8. **CLI tooling** — thermostat, quickscore, etc.
9. **Identity/SCIM** — enterprise identity management
10. **Notary** — cryptographic attestation
11. **4,992 tests** — G0DM0D3 has 0 tests in repo

---

## Actionable Implementation Plan

### Phase 1: Research Eval Suite (fills Gap 1)
Create 4 steer-focused research evaluation scripts:
1. `research/eval_autotune_classification.ts` — labeled test cases + confusion matrix
2. `research/eval_scoring_calibration.ts` — microScore monotonicity + tier discrimination
3. `research/eval_hygiene_precision.ts` — per-transform precision/recall/F1
4. `research/eval_feedback_convergence.ts` — synthetic user profiles + convergence

### Phase 2: Minor Feature Gaps (fills Gaps 2, 5)
5. Add `casualMode` transform to `src/steer/hygiene.ts`
6. Add anti-refusal scoring axis to `src/steer/microScore.ts`

### Phase 3: Data Pipeline (fills Gaps 3, 4) — OPTIONAL
7. Verify/deepen HuggingFace publisher
8. Add research API endpoints to bridge server

---

## Conclusion

AMC is **architecturally superior** to G0DM0D3 — cleaner abstractions,
composable pipeline, 5,000 tests vs. 0, comprehensive trust framework.
G0DM0D3's main edges are: (1) research evaluation scripts that validate
their steer features empirically, and (2) a few minor UX features.

The research eval suite is the highest-priority gap to close — it adds
scientific rigor that strengthens AMC's "evidence over vibes" positioning.
