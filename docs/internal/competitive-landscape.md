# AMC Competitive Landscape — March 2026

## Market Map

### Direct Competitors (Agent Trust/Maturity)
None with AMC's exact positioning. The "trust scorecard for AI agents" category is greenfield.

### Adjacent: Eval & Red-Team Frameworks
| Tool | Users | Focus | AMC Differentiation |
|------|-------|-------|---------------------|
| **Promptfoo** | 300K+ devs, 127 F500 | LLM eval + red-teaming | AMC: maturity model, governance, compliance, crypto proofs. Different problem. |
| **DeepEval** | 10K+ GH stars | Unit testing for LLMs | AMC: agent-level vs prompt-level. DeepEval tests outputs, AMC scores trust. |
| **Giskard** | ~5K GH stars | ML model testing | Focuses on traditional ML bias/fairness. Less agent-specific. |
| **LangSmith** | Large (LangChain ecosystem) | Observability + eval | Observability platform, not trust scoring. Framework-locked. |

### Adjacent: Observability Platforms
| Tool | Focus | AMC Differentiation |
|------|-------|---------------------|
| **Langfuse** | Open-source LLM observability | Traces and metrics, not trust scoring |
| **Helicone** | LLM proxy + analytics | Cost/latency focus, no maturity model |
| **Arize Phoenix** | ML observability | Traditional ML focus, expanding to LLM |

### Adjacent: Compliance & Governance
| Tool | Focus | AMC Differentiation |
|------|-------|---------------------|
| **Credo AI** | AI governance platform | Enterprise SaaS, expensive, manual processes. AMC: CLI-first, automated, open source. |
| **Holistic AI** | AI risk management | Consulting-heavy. AMC: developer-first, self-serve. |
| **IBM AI FactSheets** | AI transparency | Documentation-focused, no execution evidence. |

### Adjacent: Security Testing
| Tool | Focus | AMC Differentiation |
|------|-------|---------------------|
| **Lakera Guard** | LLM firewall/protection | Runtime protection, not assessment/scoring |
| **Robust Intelligence** | AI validation | Enterprise SaaS, not open source |
| **NVIDIA NeMo Guardrails** | Runtime guardrails | Complementary — runtime vs assessment |

## AMC's Unique Position

AMC occupies the intersection of three categories:
1. **Eval** (like Promptfoo) — but agent-level, not prompt-level
2. **Compliance** (like Credo AI) — but automated and open source
3. **Security** (like Lakera) — but assessment, not runtime protection

No existing tool combines:
- Evidence-weighted scoring with cryptographic proofs
- Multi-dimensional maturity model (L0-L5)
- Automated compliance artifact generation
- Multi-agent fleet governance
- 40 industry-specific domain packs
- Zero-code framework integration (14 adapters)

## Competitive Threats

### Short-term (3-6 months)
- **Promptfoo adds maturity model**: Possible but unlikely — different product DNA (eval vs governance)
- **LangSmith adds compliance**: Would be framework-locked to LangChain
- **New entrant**: Low risk — AMC has 4,161 tests, 235 questions, 147 assurance packs head start

### Medium-term (6-12 months)
- **Cloud providers** (AWS, Azure, GCP) add agent evaluation: Would be provider-locked. AMC is provider-agnostic.
- **Anthropic/OpenAI agent safety tools**: Would only cover their own agents. AMC is framework-agnostic.

### Long-term (12+ months)
- **Regulatory mandates**: EU AI Act enforcement begins Aug 2026. If regulators mandate specific evaluation frameworks, AMC's compliance mappings become critical infrastructure.

## Strategic Advantages
1. **First mover** in "trust scorecard for AI agents" category
2. **Open source** (MIT) — community contributions compound
3. **Framework agnostic** — works with any agent, any provider
4. **Evidence-based** — cryptographic proofs set a higher bar than competitors can easily match
5. **Depth** — 92 scoring modules, 40 domain packs, 14 adapters built before launch
