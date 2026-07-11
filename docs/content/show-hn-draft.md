# Show HN: AMC – Open-source trust scoring for AI agents (evidence > claims)

**URL:** https://github.com/AgentMaturity/AgentMaturityCompass

**Text:**

Hi HN,

I built AMC (Agent Maturity Compass) because I got tired of agents that say "I'm safe" with no proof.

AMC is an open-source CLI that scores AI agents from L0 (dangerous) to L5 (production-ready) based on what they actually do — not what their docs claim. One command, no account:

```
curl -fsSL https://agentmaturity.co/install.sh | sh && amc
```

What makes it different from eval tools like Promptfoo:

- **Evidence-weighted scoring** — observed behavior (via transparent proxy) is weighted higher than self-reported claims. Cryptographic proof chains (Ed25519 + Merkle trees) make scores tamper-evident.

- **244 default diagnostic questions across 5 dimensions** — not pass/fail, but a maturity model (L0-L5) that gives you a concrete improvement path. Teams can opt into the 264-question lifecycle set when they need deeper runtime and proof coverage.

- **142 assurance packs** — adversarial testing for prompt injection, exfiltration, alignment faking, sandbagging, tool misuse, and more.

- **Compliance automation** — generates audit binders for EU AI Act, ISO 42001, NIST AI RMF, SOC 2, OWASP. Maps directly to regulatory requirements.

- **14 framework adapters** — LangChain, CrewAI, AutoGen, OpenAI Agents SDK, Claude Code, etc. Zero code changes.

- **41 industry domain packs** — healthcare/HIPAA, finance/MiFID II, education/FERPA, logistics reliability, and more.

The entire trust stack is MIT licensed and free. Only the industry-specific domain packs are paid.

Tech: TypeScript, Commander CLI, Ed25519 crypto, SQLite evidence ledger, 8,365 passing Vitest tests, MCP server for AI coding assistants.

I'd love feedback on the scoring model and whether the evidence-weighted approach resonates. Happy to answer any questions about the architecture.
