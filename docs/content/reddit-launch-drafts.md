# Reddit Launch Drafts

## r/LocalLLaMA

**Title:** I built an open-source trust scoring tool for AI agents — scores from L0 to L5 based on actual behavior, not documentation claims

**Body:**

After months of building AI agents and having no reliable way to know if they were actually safe, I built AMC (Agent Maturity Compass).

**What it does:**
- Scores agents L0 (dangerous) → L5 (production-ready) across 5 dimensions
- 147 adversarial test packs (prompt injection, exfiltration, alignment faking, sandbagging)
- Evidence is cryptographically signed — tamper-evident proof chains
- Works with any framework: LangChain, CrewAI, AutoGen, local models, etc.
- `curl -fsSL https://agentmaturity.co/install.sh | sh && amc` — 60 seconds, no account

**Why not just use Promptfoo?**
Different tools for different jobs. Promptfoo evaluates prompt quality. AMC answers "is this agent safe to ship?" with a structured maturity model and compliance documentation. You can even import Promptfoo results into AMC.

**What's free:** Everything — the entire trust stack (Score, Shield, Enforce, Vault, Watch, Comply, Fleet, Passport), all 14 adapters, the 244-question default diagnostic bank, CI gates. MIT licensed.

**What's paid:** 41 industry-specific domain packs for regulated verticals (healthcare, finance, education, logistics).

8,229 passing Vitest tests. Would love feedback from this community.

GitHub: https://github.com/AgentMaturity/AgentMaturityCompass

---

## r/MachineLearning

**Title:** [P] Agent Maturity Compass — evidence-based trust scoring for AI agents with cryptographic proof chains

**Body:**

Sharing a project I've been working on: an open-source framework for evaluating AI agent trustworthiness using execution-verified evidence rather than self-reported claims.

**Key technical decisions:**
- **Evidence trust tiers**: OBSERVED_HARDENED (1.1×), OBSERVED (1.0×), ATTESTED (0.8×), SELF_REPORTED (0.4×) — weights are applied to scoring based on evidence source quality
- **Transparent gateway proxy**: intercepts agent-provider API calls without modifying agent code, collecting OBSERVED-tier evidence
- **Cryptographic integrity**: Ed25519 signatures + Merkle tree proof chains on all assessment artifacts
- **5-dimension maturity model**: 244 default diagnostic questions across Strategic Ops, Leadership, Culture, Resilience, and Skills, with an optional 264-question lifecycle set
- **Research-backed scoring modules** including calibration gap, gaming resistance, sleeper agent detection, alignment faking, over-compliance detection
- **Informed by recent research**: arXiv:2512.01797 (over-compliance / H-Neurons), arXiv:2503.09950 (monitor bypass resistance), arXiv:2512.06914 (trust-authorization synchronization)

The framework generates compliance mappings for EU AI Act, ISO 42001, NIST AI RMF, and OWASP LLM Top 10.

MIT licensed, 8,229 passing Vitest tests, TypeScript.

Paper references and methodology: https://agentmaturity.co/methodology.html
GitHub: https://github.com/AgentMaturity/AgentMaturityCompass
