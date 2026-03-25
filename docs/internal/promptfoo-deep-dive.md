# Promptfoo Deep Dive — What AMC Must Learn

> Intelligence gathered 2026-03-10. Source: promptfoo.dev docs, GitHub repo, pricing page.

## What Promptfoo Is

**CLI + library for evaluating and red-teaming LLM apps.** MIT licensed, open source. Install via `npm`, `brew`, or `pip`. Runs 100% locally — prompts never leave your machine.

- **300K+ developers**, 127 Fortune 500 companies
- Battle-tested on LLM apps serving **10M+ users in production**
- Available as CLI, Node.js library, Python package, and CI/CD action

## Architecture (3 Components)

### 1. Test Generation Engine
- **Plugins** generate adversarial inputs for specific vulnerability types
- **Strategies** deliver those inputs in different patterns (base64, leetspeak, multi-turn, GOAT framework)
- **Attack Probes** = plugin output + strategy wrapping → natural language adversarial prompt

### 2. Target Interface (30+ target types)
- HTTP API (REST endpoints)
- Direct Model (OpenAI, Anthropic, local models, 60+ providers)
- Browser (Selenium/Puppeteer)
- Custom Provider (Python/JavaScript)

### 3. Evaluation Engine
- Vulnerability analysis with configurable detectors
- LLM-as-a-judge response grading
- Generates findings with severity, attack vector, mitigation steps

## Red Teaming — 134 Plugins Across 6 Categories

### Brand (14 plugins)
- Competitor endorsement, excessive agency, financial hallucination/sycophancy/defamation
- Goal misalignment (Goodhart's Law), hallucination, imitation
- Off-topic manipulation, overreliance, political opinions, unverifiable claims

### Compliance & Legal (35+ plugins)
- **Industry-specific**: pharmacy (dosage, drug interaction, controlled substances), insurance (coverage discrimination, PHI), real estate (Fair Housing, steering, lending discrimination), telecom (TCPA, CPNI, account takeover), financial (SOX, insider trading, market manipulation), e-commerce (PCI DSS, fraud)
- **Regulatory**: COPPA, FERPA, copyright, illegal activities, weapons

### Dataset (12 plugins)
- Pre-built research datasets: Aegis (NVIDIA), BeaverTails, CyberSecEval, DoNotAnswer, HarmBench, Pliny, ToxicChat, UnsafeBench, VLGuard, VLSU, XSTest

### Security & Access Control (30+ plugins)
- ASCII smuggling, Context Compliance Attack (CCA), cross-session leak
- Data exfiltration, debug access, divergent repetition, direct PII exposure
- Indirect prompt injection, **MCP attacks**, memory poisoning
- Model identification, privilege escalation (BFLA), prompt extraction
- RAG poisoning, RAG source attribution, RBAC enforcement
- Reasoning DoS, shell injection, special token injection, SQL injection
- System prompt override, SSRF

### Trust & Safety
- Harmful content generation (misinformation, hate, violence, sexual content)
- Toxicity, bias, unsafe practices

### Custom
- Configurable tests for specific policies
- Custom probe generation for your use case

## Risk Management Frameworks (Built-in Mappings)

| Framework | Plugin ID Format |
|---|---|
| **NIST AI RMF** | `nist:ai:measure:1.1` |
| **OWASP LLM Top 10** | `owasp:llm:01` |
| **OWASP API Top 10** | `owasp:api:01` |
| **MITRE ATLAS** | `mitre:atlas:reconnaissance` |
| **ISO/IEC 42001** | `iso:42001:privacy` |
| **GDPR** | `gdpr:art5` |
| **EU AI Act** | `eu:ai-act:art5` |

**⚠️ AMC has EU AI Act mapping but NOT NIST, OWASP API, MITRE ATLAS, ISO 42001, or GDPR article-level mappings.**

## Assertion System — 50+ Metrics

### Deterministic Metrics
- String: equals, contains, icontains, regex, starts-with, contains-any/all
- Format: is-json, contains-json, is-html, contains-html, is-sql, is-xml
- Scoring: rouge-n, bleu, gleu, levenshtein, meteor, perplexity
- Operational: latency, cost, is-valid-function-call, trace-span-count/duration
- Custom: javascript, python, webhook

### Model-Assisted Metrics (LLM-as-Judge)
- **similar** — embeddings + cosine similarity
- **classifier** — output classification
- **llm-rubric** — free-form criteria grading
- **g-eval** — chain-of-thought evaluation (G-Eval framework)
- **answer-relevance** — is output related to query?
- **context-faithfulness** — does output use the context?
- **context-recall** — does ground truth appear in context?
- **context-relevance** — is context relevant to query?
- **conversation-relevance** — relevance across multi-turn
- **factuality** — adherence to facts (OpenAI eval method)
- **model-graded-closedqa** — closed QA evaluation
- **pi** — dedicated model for criteria evaluation

### Assertion Features
- Weighted assertions (importance ranking)
- Score thresholds (quality gates)
- Assertion sets (grouped pass/fail)
- Named metrics (aggregate related assertions)
- Assertion templates (reusable across tests)
- Custom scoring functions (JS/Python)
- CSV test data loading

## CI/CD Integration

### GitHub Actions (First-Class)
- Official marketplace action: `promptfoo/promptfoo-action@v1`
- PR-triggered evals (on prompt file changes)
- Quality gates (fail build on failures)
- Red team scans (daily scheduled)
- Artifact upload for results

### Other Platforms
- GitLab CI, Jenkins, Azure Pipelines, CircleCI, Bitbucket, Travis CI, n8n, Looper

### Key CI/CD Patterns
- Parallel model testing (matrix strategy)
- Scheduled security scans (daily cron)
- Docker-based CI/CD
- Result posting to PR comments
- SonarQube integration (Enterprise)
- Cache strategies for performance

## Pricing

| Tier | Price | Key Limits |
|---|---|---|
| **Community** | Free forever | 10K red team probes/month |
| **Enterprise** | Custom | Custom probe limits, SSO, continuous monitoring |
| **On-Premise** | Custom | Full data isolation, dedicated engineer |

## What Promptfoo Has That AMC Doesn't (Critical Gaps)

### 1. 🔴 Active Red Teaming Engine
Promptfoo's core: generate adversarial inputs, attack your system, grade the responses. 134 plugins, iterative refinement (attacks get smarter based on responses). AMC has assurance packs but **no active attack simulation**.

### 2. 🔴 CI/CD Integration
GitHub Actions, GitLab, Jenkins, etc. Quality gates. PR-triggered evals. AMC has **zero CI/CD story**.

### 3. 🔴 134 Red Team Plugins
Industry-specific (pharmacy, insurance, real estate, telecom, financial, e-commerce). AMC has nothing industry-specific.

### 4. 🔴 50+ Assertion Metrics
Deterministic + model-assisted. BLEU, ROUGE, perplexity, latency, cost, faithfulness, hallucination, relevance. AMC scores maturity, not output quality.

### 5. 🔴 YAML Declarative Config
`promptfooconfig.yaml` — define prompts, providers, test cases, assertions in one file. Dead simple. AMC requires code integration.

### 6. 🔴 Multi-Provider Comparison
Side-by-side eval across 60+ providers. Matrix view. Cost comparison. AMC doesn't compare providers.

### 7. 🔴 Framework Mappings Beyond EU AI Act
NIST AI RMF, OWASP API Top 10, MITRE ATLAS, ISO 42001, GDPR article-level. AMC only has EU AI Act.

### 8. 🔴 Research Dataset Integration
Pre-built test suites from published research: NVIDIA Aegis, HarmBench, CyberSecEval, etc. AMC doesn't leverage research datasets.

### 9. 🔴 Code Scanning
PR review for LLM-related security and compliance issues. AMC has nothing like this.

### 10. 🔴 Web UI with Shareable Results
`promptfoo view` — browser-based result viewer with share URLs. Team collaboration built in.

## What AMC Has That Promptfoo Doesn't (Our Moats)

### 1. ✅ Cryptographic Evidence Chains
Ed25519 signatures, Merkle trees, tamper-evident audit logs. Promptfoo has ZERO cryptographic verification.

### 2. ✅ L0-L5 Maturity Scoring Model
Ordinal maturity levels with clear progression criteria. Promptfoo gives pass/fail and scores, not maturity levels.

### 3. ✅ Evidence Trust Tiers
SELF_REPORTED 0.4x, OBSERVED 1.0x, VERIFIED 1.2x. Promptfoo trusts all evidence equally.

### 4. ✅ Gateway Behavioral Capture
Transparent proxy between agent and LLM — captures real behavior without SDK changes. Promptfoo requires explicit integration.

### 5. ✅ 14 Framework Adapters
LangChain, CrewAI, AutoGen, etc. — evaluate real agent code. Promptfoo is prompt-focused, not agent-architecture-aware.

### 6. ✅ 4,064 Tests (Internal Quality)
Massively more internal test coverage than any competitor.

### 7. ✅ Agent-Level Assessment
AMC evaluates the AGENT as a whole (governance, security, reliability, observability). Promptfoo evaluates individual prompts/outputs.

## Strategic Recommendations

### Phase 1: Table Stakes (0-3 months)
1. **Build red teaming module** — at least 20 attack types, iterative refinement
2. **Add CI/CD integration** — GitHub Actions workflow, `amc eval` command, quality gates
3. **YAML config** — `amcconfig.yaml` for declarative test cases
4. **Add NIST AI RMF mapping** — critical for US enterprise
5. **LLM-as-judge metrics** — faithfulness, hallucination, relevance, toxicity

### Phase 2: Differentiation (3-6 months)
6. **Research dataset integration** — HarmBench, CyberSecEval, Aegis
7. **Industry-specific packs** — financial services, healthcare, legal
8. **Web UI result viewer** — shareable reports with team collaboration
9. **Code scanning** — PR review for agent security issues
10. **Multi-provider comparison** — side-by-side model evaluation

### Phase 3: Category Creation (6-12 months)
11. **Continuous monitoring** — real-time score tracking in production
12. **Agent lifecycle management** — maturity progression tracking over time
13. **Compliance automation** — auto-generate compliance reports for NIST, OWASP, EU AI Act, ISO 42001
14. **Marketplace** — community-contributed assurance packs and plugins

## The Positioning Play

Promptfoo = "test your prompts"
AMC = "trust your agents"

Promptfoo is **prompt-centric** — it tests inputs and outputs at the prompt level.
AMC is **agent-centric** — it evaluates the entire agent system (governance, security, reliability, maturity).

**They're not the same category.** But Promptfoo is eating the space where AMC should also play (red teaming, eval, CI/CD). We need to absorb their strengths while maintaining our unique agent-level, evidence-backed maturity approach.

The winning move: **AMC = Promptfoo's red teaming + DeepEval's metrics + cryptographic evidence + maturity scoring + agent governance.** All in one.
