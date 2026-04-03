# AMC vs G0DM0D3 — Exhaustive Competitive Gap Analysis
## Compiled: April 2, 2026

---

## TL;DR

G0DM0D3 is NOT a traditional AMC competitor — it's an **inference-time output steering framework** for LLMs. But it overlaps with AMC in critical areas: **safety evaluation, red-teaming, jailbreak detection, and agent quality scoring**. More importantly, G0DM0D3 demonstrates several *engineering paradigms* that AMC lacks entirely, and its research rigor (NeurIPS-style paper with proper baselines and confidence intervals) sets a bar AMC hasn't matched.

**Key insight:** G0DM0D3 treats safety evaluation, creative amplification, and technical precision as **the same control surface** with different parameter configurations. AMC treats them as separate domains. G0DM0D3's unified approach is architecturally superior.

---

## SECTION 1: WHAT G0DM0D3 IS (Full Technical Breakdown)

### Core Concept
G0DM0D3 = 5 composable "steering primitives" operating at inference time through standard chat completion APIs. No fine-tuning, no weight access, no GPU required.

### The 5 Primitives

| # | Primitive | What It Does | Lines of Code |
|---|-----------|-------------|---------------|
| 1 | **AutoTune** | Context-adaptive sampling parameter engine (temp, top_p, top_k, frequency/presence/repetition penalty) | 639 |
| 2 | **Feedback Loop** | EMA-based online learning from thumbs up/down (α=0.3) | 354 |
| 3 | **Parseltongue** | Input perturbation/obfuscation for red-teaming (leetspeak, unicode homoglyphs, ZWJ, phonetic) | 432 |
| 4 | **STM** | Semantic Transformation Modules — post-processing output normalization (hedge removal, direct mode, casual mode) | 153 |
| 5 | **ULTRAPLINIAN** | Multi-model racing engine — queries 10-51 models in parallel, scores on 5 axes, serves best via "liquid response" SSE streaming | 425 |

### Pipeline Flow
```
User Input → Classification → AutoTune (parameter selection) →
Feedback Loop (learned adjustments) → Parseltongue (optional perturbation) →
Multi-Model Inference (parallel) → Scoring (5-axis, 100-point) →
STM (output normalization) → Liquid Response (streaming best result)
```

### Scoring Formula (ULTRAPLINIAN)
```
S = min(S_len + S_struct + S_anti + S_dir + S_rel, 100)

S_len   = min(|content|/40, 25)         — response length
S_struct = min(3*headers + 1.5*lists + 5*codeblocks, 20) — structure
S_anti  = max(25 - 8*refusals, 0)       — anti-refusal
S_dir   = 8 if preamble, 15 otherwise   — directness
S_rel   = 15 * (query_words ∩ response / |query_words|) — relevance
```

### Classification System
- Regex/keyword harm taxonomy classifier (536 lines)
- Domains: benign, gray, meta, plus harmful categories
- 3x weight boost on critical-tier patterns
- LLM fallback via llama-3.1-8b-instruct (4s timeout)
- Returns: { domain, subcategory, confidence, flags[] }

### Data Architecture (3-Tier Privacy)
- **Tier 1 (ZDR)**: Always-on metadata — timestamps, endpoints, latencies. NEVER content.
- **Tier 2 (Telemetry)**: Structural metadata — model, context type, pipeline config. No content.
- **Tier 3 (Dataset)**: Opt-in only — full steering context with PII scrubbing (regex for emails, SSNs, credit cards, API keys, etc.)

### Research Evaluation Framework
6 formal evaluation scripts with proper statistical methodology:
- AutoTune classification: 150-case benchmark, confusion matrix, per-class F1
- Baseline comparison: 4 baselines, bootstrap CIs (B=10,000), McNemar's test
- Scoring calibration: monotonicity, tier discrimination, edge cases
- Feedback convergence: 5 synthetic user profiles, noise robustness (0-50%)
- STM precision: 77 test cases, precision/recall/F1
- Parseltongue analysis: trigger coverage, transformation properties

### Academic Paper
NeurIPS-style LaTeX paper (669 lines) with reported results:
- AutoTune: 84.0% accuracy, 95% CI [78.0, 89.3], macro F1 84.2%
- Feedback loop: 29-62% parameter improvement within 19 ratings
- STM: 100% precision/recall on test cases
- ULTRAPLINIAN: 82-point quality tier discrimination
- **Honest about limitations**: underpowered study (n=150), self-constructed benchmarks

### Infrastructure
- AGPL-3.0 license
- Next.js frontend with Zustand store, 4 themes
- Express.js API server
- Docker + Docker Compose
- HuggingFace Spaces deployment
- 3-tier API access (free/pro/enterprise)

---

## SECTION 2: WHAT AMC IS (Current State)

- 1,364 TypeScript source files
- 235 diagnostic questions across 5 dimensions
- L0-L5 maturity scale with 4 evidence trust tiers
- 79 scoring modules
- 147 assurance packs (red-team attack scenarios)
- 481 CLI commands
- 4,161 tests across 299 test files
- Full jailbreak detection subsystem (TAP, PAIR, Crescendo strategies)
- Studio web dashboard (8,583-line server)
- Ed25519 cryptographic evidence chain
- Merkle tree transparency logs
- Compliance: EU AI Act, ISO 42001, NIST AI RMF, SOC 2, OWASP LLM Top 10
- Multi-agent fleet management
- 14 framework adapters (LangChain, Vercel AI, etc.)
- Domain packs for 7 industries
- 7 production dependencies (minimal footprint)

---

## SECTION 3: FEATURE-BY-FEATURE GAP ANALYSIS

### ============================================
### CATEGORY A: THINGS G0DM0D3 HAS THAT AMC LACKS
### ============================================

#### GAP A1: INFERENCE-TIME OUTPUT STEERING
**G0DM0D3**: Full pipeline for controlling LLM output quality at inference time.
**AMC**: Zero. AMC evaluates agents post-hoc but cannot steer their behavior.

**Impact**: CRITICAL. This is the difference between a thermometer and a thermostat. AMC tells you the temperature; G0DM0D3 changes it.

**Recommendation**: Build an `amc steer` module that:
- Wraps any LLM API call
- Applies context-adaptive sampling parameters
- Learns from user feedback in real-time
- Post-processes outputs for quality
- This turns AMC from "score your agent" to "score AND improve your agent"

---

#### GAP A2: ADAPTIVE SAMPLING PARAMETER ENGINE
**G0DM0D3**: AutoTune detects context (code/creative/analytical/conversational/chaotic) via regex scoring and selects optimal temperature, top_p, top_k, frequency_penalty, presence_penalty, repetition_penalty profiles. Low-confidence blending, conversation-length adaptation.
**AMC**: No concept of this. The bridge module proxies LLM calls but doesn't optimize parameters.

**Impact**: HIGH. This is the kind of actionable improvement AMC should recommend after scoring.

**Recommendation**: Build `src/steer/autotune.ts` — context-adaptive parameter engine. AMC already has the classification capability (79 scoring modules). Wire the scoring output into parameter recommendations.

---

#### GAP A3: REAL-TIME FEEDBACK LOOP / ONLINE LEARNING
**G0DM0D3**: EMA-based learning from binary ratings. Per-context learned profiles. Cold start handling. Weight scaling based on sample count.
**AMC**: Has corrections/feedback in `src/corrections/` but it's a manual tracking system, not an online learning loop.

**Impact**: HIGH. Users want improvement, not just measurement.

**Recommendation**: Build `src/steer/feedbackLoop.ts` — EMA-based or Bayesian online learning from user ratings that automatically adjusts recommendations over time.

---

#### GAP A4: INPUT PERTURBATION ENGINE (PARSELTONGUE)
**G0DM0D3**: 54 trigger words, 6 obfuscation techniques (leetspeak with 85 rules, unicode with 72 homoglyphs, ZWJ injection, mixed case, phonetic, random composite), 3 intensity levels.
**AMC**: Has `src/redteam/adversarialGenerator.ts` and `src/redteam/multilingualAttacks.ts` but these are for testing, not a composable perturbation engine.

**Impact**: MEDIUM-HIGH. AMC's red-team system could be much more powerful with a dedicated perturbation engine.

**Recommendation**: Extract a composable `src/redteam/perturbation.ts` engine that can be used both for attack generation AND for testing agent robustness. Include all 6 G0DM0D3 techniques plus: markdown injection, prompt delimiter attacks, encoding attacks (base64, rot13, hex), context window manipulation.

---

#### GAP A5: MULTI-MODEL RACING / PARALLEL INFERENCE
**G0DM0D3**: ULTRAPLINIAN queries 10-51 models in parallel, scores each on 5 axes, serves the best result via "liquid response" SSE streaming. Upgrades response live when a better model finishes.
**AMC**: Has `src/bridge/` for LLM proxy but single-model only. No parallel inference, no model racing, no quality-based selection.

**Impact**: HIGH. This is a killer feature for users who want the best output regardless of which model produces it.

**Recommendation**: Build `amc race` — multi-model racing with AMC's scoring as the selection criteria. This naturally monetizes AMC's scoring expertise: "Which model is actually best for YOUR use case?"

---

#### GAP A6: OUTPUT NORMALIZATION / POST-PROCESSING
**G0DM0D3**: STM modules — hedge reduction (remove "I think", "perhaps"), direct mode (remove "Sure!", "Great question!"), casual mode (formal→casual substitutions). Composable pipeline.
**AMC**: Detects sycophancy and over-compliance but doesn't fix it.

**Impact**: MEDIUM. Nice-to-have but differentiating — turns detection into correction.

**Recommendation**: Build `src/steer/stm.ts` — semantic transformation modules. Start with hedge reduction and direct mode. Add AMC-specific modules: compliance-safe mode (ensure outputs include required disclaimers), evidence mode (auto-cite sources), structured mode (force JSON/table output).

---

#### GAP A7: COMPOSABLE PIPELINE ARCHITECTURE
**G0DM0D3**: Every primitive is independently toggleable. Pipeline is: Input → AutoTune → Feedback → Parseltongue → Inference → STM → Output. Each stage can be on/off.
**AMC**: Monolithic. Assurance packs run independently but there's no composable pipeline for real-time inference enhancement.

**Impact**: HIGH. Composability is the key architectural insight.

**Recommendation**: Design AMC's steering pipeline as middleware that wraps any LLM call:
```typescript
const steer = amc.createPipeline({
  autotune: true,
  feedback: true,
  guard: true,        // AMC-specific: block harmful outputs
  evidence: true,     // AMC-specific: log to transparency chain
  stm: ['hedge_reducer', 'direct_mode']
});
const response = await steer.chat(messages, { model: 'gpt-4' });
```

---

#### GAP A8: ACADEMIC PAPER / RESEARCH RIGOR
**G0DM0D3**: NeurIPS-style paper with proper methodology — baselines, confidence intervals (bootstrap B=10,000), McNemar's test, confusion matrices, honest limitations section.
**AMC**: Zero academic output. No paper, no formal evaluation, no statistical methodology.

**Impact**: CRITICAL for credibility. Enterprise buyers and researchers need peer-reviewable evidence.

**Recommendation**: Write and submit an AMC paper. You have the data: 235 questions, 4,161 tests, 147 assurance packs, MiroFish simulation results. Target: ACM FAccT, AAAI, or a safety-specific workshop.

---

#### GAP A9: FORMAL EVALUATION FRAMEWORK WITH BASELINES
**G0DM0D3**: 6 evaluation scripts comparing against baselines (random, majority class, length heuristic, flat keywords). Bootstrap confidence intervals. McNemar's test for statistical significance.
**AMC**: Has tests (4,161) but they're unit/integration tests, not evaluation benchmarks. No baselines, no CIs, no significance testing.

**Impact**: HIGH. Without formal evals, AMC's claims are unsubstantiated.

**Recommendation**: Build `research/` directory with:
- Scoring calibration benchmarks (do AMC scores actually predict agent quality?)
- Inter-rater reliability (do different evaluators get the same score?)
- Baseline comparisons (AMC vs random scoring, vs simple heuristics)
- Bootstrap CIs for all reported metrics
- Ablation studies (which of the 235 questions actually matter?)

---

#### GAP A10: PRIVACY-BY-CONSTRUCTION DATA ARCHITECTURE
**G0DM0D3**: 3-tier architecture where Tier 1 (always-on) provably CANNOT contain content. PII scrubber with regex for 7+ PII types. In-memory ring buffers with caps.
**AMC**: Has transparency logs and evidence chain but no formal privacy tiers. No automated PII scrubbing in telemetry.

**Impact**: MEDIUM-HIGH. Increasingly important for enterprise adoption.

**Recommendation**: Implement a formal 3-tier data architecture for AMC Studio and the API. Add PII scrubbing to all telemetry and evidence collection.

---

#### GAP A11: CONSORTIUM / HIVE MIND MODE
**G0DM0D3**: Collects ALL parallel model responses, feeds them to an orchestrator model for synthesis. Uses top-tier orchestrators (Claude Opus, GPT-5.3, Gemini 3 Pro, Grok 4).
**AMC**: No concept of multi-model synthesis.

**Impact**: MEDIUM. Cool feature but may be expensive.

**Recommendation**: Build `amc consensus` — use AMC's scoring to weight multiple model outputs, then synthesize. This is AMC's unique angle: the synthesis is quality-weighted, not just "ask a smart model to pick."

---

#### GAP A12: "LIQUID RESPONSE" STREAMING
**G0DM0D3**: Serves the first good response immediately via SSE, then transparently upgrades to a better response when a superior model finishes.
**AMC**: No streaming response optimization.

**Impact**: MEDIUM. Great UX pattern.

**Recommendation**: Implement in `amc race` — stream the fastest decent result, upgrade live.

---

#### GAP A13: CONTEXT-TYPE DETECTION
**G0DM0D3**: Classifies every input into 5 context types (code, creative, analytical, conversational, chaotic) with weighted regex scoring (3x current message, 1x last 4 history).
**AMC**: Has diagnostic question classification but not real-time input classification.

**Impact**: MEDIUM. Enables adaptive behavior.

**Recommendation**: Build `src/classify/contextDetector.ts` — reusable input classifier that AMC scoring, steering, and assurance can all leverage.

---

### ============================================
### CATEGORY B: THINGS AMC HAS THAT G0DM0D3 LACKS
### (Defend these — they're AMC's moat)
### ============================================

| AMC Strength | G0DM0D3 Equivalent | AMC Advantage |
|---|---|---|
| **235-question diagnostic** | None — G0DM0D3 doesn't score agents | Massive. AMC's core differentiator. |
| **L0-L5 maturity model** | None | Provides a growth path, not just a snapshot |
| **147 assurance packs** | 4 jailbreak combos in "Libertas" | 36x more attack scenarios |
| **Ed25519 cryptographic evidence** | None | Tamper-evident proof chain |
| **Merkle tree transparency** | None | Verifiable audit trail |
| **Compliance frameworks** (EU AI Act, ISO 42001, NIST, SOC 2, OWASP) | None | Enterprise-ready |
| **Multi-agent fleet management** | None — single-session only | Enterprise scale |
| **481 CLI commands** | Web UI only | Developer-first, scriptable |
| **14 framework adapters** | OpenRouter only | Ecosystem integration |
| **Domain packs** (7 industries) | None | Vertical expertise |
| **Jailbreak detection** (TAP, PAIR, Crescendo, DAN) | Jailbreak GENERATION only | AMC defends; G0DM0D3 attacks |
| **Runtime shield** | None | Real-time protection |
| **Governor / approval workflows** | None | Enterprise governance |
| **Forecast / drift detection** | None | Proactive monitoring |
| **Experiments framework** | None | A/B testing for agent configs |
| **SDK** (JS + Python) | API only | Integration depth |

### ============================================
### CATEGORY C: THINGS BOTH HAVE (HEAD-TO-HEAD)
### ============================================

#### C1: RED-TEAMING
- **G0DM0D3**: Parseltongue (input perturbation) + Libertas (4 jailbreak combos) + GODMODE system prompt. Research-grade perturbation engine.
- **AMC**: 147 assurance packs + adversarial generator + multilingual attacks + jailbreak detector. Broader coverage but less principled perturbation engine.
- **WINNER**: AMC on breadth, G0DM0D3 on the perturbation engineering.
- **ACTION**: Adopt Parseltongue-style composable perturbation engine. AMC's adversarial generator should use systematic obfuscation (leetspeak, unicode homoglyphs, ZWJ, phonetic) instead of just prompt template variations.

#### C2: HARM CLASSIFICATION
- **G0DM0D3**: Regex classifier (84% accuracy) + LLM fallback. Deliberate transparency choice.
- **AMC**: Multiple scoring modules (factuality, hallucination, sycophancy, deception detection, etc.) but no unified harm taxonomy classifier.
- **WINNER**: AMC on depth, G0DM0D3 on simplicity/transparency.
- **ACTION**: Build a unified harm classifier that sits in front of all AMC scoring. Publish accuracy metrics with CIs.

#### C3: SCORING
- **G0DM0D3**: 5-axis, 100-point, single-response scoring (length, structure, anti-refusal, directness, relevance).
- **AMC**: 235-question, L0-L5 maturity scoring with evidence trust tiers (OBSERVED_HARDENED 1.1x → SELF_REPORTED 0.4x).
- **WINNER**: Different games. G0DM0D3 scores individual responses; AMC scores entire agent capability.
- **ACTION**: Add response-level micro-scoring to complement AMC's macro-scoring. Every interaction gets a quick quality score (like G0DM0D3's 5-axis). Aggregate micro-scores into macro-maturity.

#### C4: API / HOSTED SERVICE
- **G0DM0D3**: Express.js API with 3 tiers (free: 10 req/min, pro: 60 req/min, enterprise: 300 req/min). Hosted at godmod3.ai. HuggingFace Spaces. OpenAPI.
- **AMC**: Studio server with OpenAPI. Docker deployment. But NOT hosted anywhere publicly.
- **WINNER**: G0DM0D3 — they're live and accessible.
- **ACTION**: Ship AMC Studio as a hosted service. This is the #1 go-to-market gap.

---

## SECTION 4: THE 100x IMPROVEMENT ROADMAP

### TIER 1 — PARADIGM SHIFTS (Would make AMC categorically different)

#### 1. FROM THERMOMETER TO THERMOSTAT
Build `amc steer` — a composable middleware pipeline that wraps any LLM API call and applies AMC's intelligence to actively improve outputs. This is the single biggest paradigm gap.

```
Current:  Agent → LLM → Response → AMC Score (post-hoc)
Proposed: Agent → AMC Steer → LLM → AMC Score + Fix → Better Response (real-time)
```

Modules:
- `autotune.ts` — Context-adaptive sampling parameters
- `feedbackLoop.ts` — Online learning from ratings
- `stm.ts` — Output normalization/transformation
- `guard.ts` — Real-time safety filtering (AMC already has shield)
- `evidence.ts` — Auto-log to transparency chain

#### 2. MULTI-MODEL RACING WITH QUALITY-WEIGHTED SELECTION
Build `amc race` — query N models in parallel, score each with AMC's 5-axis micro-scoring, serve the best via liquid response streaming. This is AMC's killer app because AMC's scoring is 10x more sophisticated than G0DM0D3's.

#### 3. RESPONSE-LEVEL MICRO-SCORING
Add a fast, per-response quality score (sub-100ms) that runs on every interaction:
- Length adequacy (not just length — is it appropriate for the question?)
- Structure quality (headers, lists, code blocks, citations)
- Refusal detection (is the model refusing? is it appropriate?)
- Directness (preamble detection, hedge detection)
- Relevance (semantic overlap with query)
- Safety (harm classification)
- Truthfulness (claim verification against known facts)
- Evidence quality (are citations real? are sources credible?)

Aggregate these into the macro maturity score over time.

#### 4. ACADEMIC VALIDATION
Write and submit a paper. Suggested title:
"Agent Maturity Compass: Evidence-Based Trust Scoring for AI Agents via Multi-Signal Diagnostic Assessment"

Include:
- Formal evaluation of scoring calibration
- Inter-rater reliability study
- Ablation: which of 235 questions predict real-world agent quality?
- Comparison against baseline scoring methods
- Bootstrap CIs for all metrics
- MiroFish simulation results with proper statistics

### TIER 2 — CRITICAL FEATURE ADDITIONS

#### 5. COMPOSABLE PERTURBATION ENGINE
Upgrade `src/redteam/` with a Parseltongue-style perturbation engine:
- 6+ obfuscation techniques (leetspeak, unicode, ZWJ, phonetic, encoding, markdown)
- 3 intensity levels
- Trigger word detection
- Composable (mix techniques)
- Usable in assurance packs AND as standalone CLI

#### 6. CONTEXT-ADAPTIVE RECOMMENDATIONS
After scoring, AMC should say "Here's what to change":
- "Your agent's temperature is too high for code generation — try 0.15"
- "Your agent hedges excessively — add a STM hedge reducer"
- "Your agent refuses 34% of benign queries — adjust safety threshold"

G0DM0D3 does this automatically. AMC should too.

#### 7. FORMAL EVALUATION FRAMEWORK
Build `research/` with:
- `eval_scoring_calibration.ts` — Do AMC scores predict real outcomes?
- `eval_inter_rater.ts` — Different evaluators, same score?
- `eval_baselines.ts` — AMC vs random, vs simple heuristics
- `eval_question_ablation.ts` — Which questions matter most?
- `eval_assurance_effectiveness.ts` — Do assurance packs catch real vulnerabilities?
- All with bootstrap CIs and significance tests

#### 8. HOSTED AMC STUDIO (SaaS)
Ship a hosted version of AMC Studio. G0DM0D3 is accessible at godmod3.ai with zero setup. AMC requires `npm install` and Docker. Hosted studio with:
- Free tier (5 assessments/month)
- Pro tier (unlimited assessments, API access)
- Enterprise tier (fleet management, SSO, compliance reports)

#### 9. PRIVACY-BY-CONSTRUCTION DATA ARCHITECTURE
Implement formal 3-tier telemetry:
- Tier 1: Structural metadata only (always on, provably content-free)
- Tier 2: Anonymized assessment data (opt-out available)
- Tier 3: Full evidence (opt-in, PII-scrubbed)

#### 10. ONLINE LEARNING / CONTINUOUS IMPROVEMENT
Build feedback-driven scoring that improves over time:
- Track which recommendations users actually implement
- EMA-based learning on what scoring weights best predict improvement
- Cold start → learned → stable profile per organization

### TIER 3 — COMPETITIVE PARITY + EXCELLENCE

#### 11. HARM TAXONOMY CLASSIFIER
Build a unified, transparent harm classifier:
- Regex-first (G0DM0D3's approach — 84% accuracy, fully traceable)
- LLM fallback for ambiguous cases
- Publish accuracy metrics with CIs
- Use as input to both scoring and steering

#### 12. OBFUSCATION-RESISTANT DETECTION
G0DM0D3's Parseltongue can bypass safety classifiers using:
- Leetspeak (85 substitution rules)
- Unicode homoglyphs (72 substitutions)
- Zero-width joiners
- Phonetic spelling

AMC's shield and jailbreak detector must be hardened against ALL of these. Test systematically.

#### 13. "WHAT-IF" SCORING SIMULATOR
G0DM0D3 frames scoring as configurable policy — change weights, change what "best" means.
AMC should offer: "If you changed X, your score would go from L2.7 to L3.4" with interactive weight adjustment.

#### 14. MODEL-SPECIFIC BEHAVIORAL PROFILES
G0DM0D3 knows how different models behave. AMC should build model-specific scoring profiles:
- GPT-4o tends to be overly compliant → adjust sycophancy threshold
- Claude tends to be overly cautious → adjust refusal threshold
- Llama 3 tends to hallucinate → adjust factuality threshold
- Per-model baselines derived from fleet data

#### 15. DATASET CONTRIBUTION SYSTEM
G0DM0D3 has opt-in dataset contribution that publishes to HuggingFace.
AMC should build a community dataset of agent assessments:
- Anonymized scoring data
- Common failure patterns
- Industry benchmarks
- Published to HuggingFace/GitHub

### TIER 4 — STRATEGIC DIFFERENTIATION

#### 16. AMC AS CI/CD GATE (Already partially exists)
Formalize and harden `src/ci/` as a first-class CI/CD integration:
- GitHub Action
- GitLab CI template
- Jenkins plugin
- "This PR degrades agent maturity from L3.2 to L2.8 — blocking merge"

#### 17. COMPETITIVE BENCHMARK SUITE
Build a public benchmark that evaluates AMC against alternatives:
- AMC vs Promptfoo vs G0DM0D3 vs manual evaluation
- Standardized test scenarios
- Published results with reproducible methodology

#### 18. AGENT IMPROVEMENT PLAYBOOKS
G0DM0D3 steers automatically. AMC should provide **guided improvement paths**:
- "You're L2 in Resilience. Here are the 5 specific things to implement for L3."
- Step-by-step playbooks per dimension, per level
- With code examples for each framework adapter

#### 19. REAL-TIME SCORING DASHBOARD
G0DM0D3 has live SSE streaming. AMC Studio should show:
- Real-time agent quality metrics (requests/sec, quality score distribution)
- Live drift alerts
- Score trends over time
- Fleet comparison view

#### 20. OPEN RESEARCH COMMUNITY
G0DM0D3 publishes their evaluation methodology and invites scrutiny.
AMC should:
- Open-source the research/ evaluation framework
- Publish quarterly "State of Agent Maturity" reports
- Host a public leaderboard of anonymized agent scores
- Invite academic collaboration

---

## SECTION 5: PRIORITY MATRIX

| # | Gap | Impact | Effort | Priority |
|---|-----|--------|--------|----------|
| 1 | Steering Pipeline (`amc steer`) | CRITICAL | HIGH | P0 |
| 2 | Multi-Model Racing (`amc race`) | HIGH | HIGH | P0 |
| 3 | Response-Level Micro-Scoring | HIGH | MEDIUM | P0 |
| 4 | Academic Paper | CRITICAL | MEDIUM | P0 |
| 5 | Composable Perturbation Engine | HIGH | MEDIUM | P1 |
| 6 | Context-Adaptive Recommendations | HIGH | MEDIUM | P1 |
| 7 | Formal Evaluation Framework | HIGH | MEDIUM | P1 |
| 8 | Hosted AMC Studio (SaaS) | CRITICAL | HIGH | P1 |
| 9 | Privacy-by-Construction Telemetry | MEDIUM-HIGH | MEDIUM | P1 |
| 10 | Online Learning Loop | HIGH | MEDIUM | P1 |
| 11 | Harm Taxonomy Classifier | MEDIUM | LOW | P2 |
| 12 | Obfuscation-Resistant Detection | MEDIUM | MEDIUM | P2 |
| 13 | What-If Scoring Simulator | MEDIUM | LOW | P2 |
| 14 | Model-Specific Profiles | MEDIUM | MEDIUM | P2 |
| 15 | Dataset Contribution System | MEDIUM | MEDIUM | P2 |
| 16 | CI/CD Gate Formalization | MEDIUM | LOW | P2 |
| 17 | Competitive Benchmark Suite | MEDIUM | MEDIUM | P3 |
| 18 | Improvement Playbooks | MEDIUM | MEDIUM | P3 |
| 19 | Real-Time Scoring Dashboard | MEDIUM | HIGH | P3 |
| 20 | Open Research Community | MEDIUM | LOW | P3 |

---

## SECTION 6: THE FUNDAMENTAL INSIGHT

G0DM0D3 is ~2,500 lines of TypeScript with a NeurIPS paper.
AMC is ~100,000+ lines of TypeScript with 4,161 tests and zero academic output.

**The gap isn't features — it's rigor.**

G0DM0D3 makes FEWER claims but PROVES them. AMC makes MORE claims but doesn't prove any.

The single highest-ROI action is: **Write the paper. Prove the claims. Publish the baselines.**

Everything else is features. This is credibility.

---

## SECTION 7: ARCHITECTURAL LESSONS FROM G0DM0D3

### Lesson 1: OBJECTIVE-AGNOSTIC DESIGN
G0DM0D3's primitives work for safety eval, creative writing, code generation, and adversarial testing — same code, different configs. AMC's modules are domain-specific silos.

**Action**: Refactor AMC scoring into configurable "lenses" — same engine, different weight profiles for different objectives.

### Lesson 2: TRANSPARENCY OVER ACCURACY
G0DM0D3 deliberately uses regex classifiers (84%) instead of black-box ML (95%+) because every decision is fully traceable.

**Action**: For AMC's harm classifier and scoring, prefer transparent algorithms with published accuracy over opaque ML models. Publish the tradeoff.

### Lesson 3: COMPOSABILITY OVER COMPLETENESS
G0DM0D3 has 5 primitives. AMC has 481 commands. Simplicity wins adoption.

**Action**: Identify AMC's "5 primitives" — the 5 things that, if used alone, deliver 80% of the value. Make them trivially easy to use. Everything else is advanced.

### Lesson 4: PROVE FIRST, SELL SECOND
G0DM0D3 published a paper before pursuing commercial traction. This builds credibility that no marketing can match.

**Action**: Academic credibility before commercial scale.

### Lesson 5: PRIVACY AS ARCHITECTURE, NOT POLICY
G0DM0D3's Tier 1 telemetry is structurally incapable of containing PII. Not "we promise not to" but "the code literally can't."

**Action**: Redesign AMC telemetry so that structural guarantees replace policy promises.

---

## SECTION 8: QUICK WINS (Can implement this week)

1. **Add leetspeak/unicode/ZWJ detection to jailbreak detector** — G0DM0D3 shows exactly how these bypasses work. Harden AMC against them.

2. **Add response-level micro-scoring** — 5-axis quick score on every bridge-proxied request. Store in SQLite. Show trends.

3. **Add hedge detection + removal** — G0DM0D3's 11 hedge patterns and 10 preamble patterns. Add to AMC's sycophancy scoring AND as an optional STM module.

4. **Create research/ directory** — Start with eval_scoring_calibration.ts. Even a 50-case benchmark is infinitely better than zero.

5. **Add PII scrubber to telemetry** — Regex for emails, phones, SSNs, credit cards, API keys. 50 lines of code. Huge trust signal.

---

*Generated by Satanic Pope 😈⛪ — April 2, 2026*
*Based on complete analysis of G0DM0D3 repo (all 50+ source files) and AMC repo (1,364 source files)*
