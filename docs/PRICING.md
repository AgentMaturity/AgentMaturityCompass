# PRICING.md — AMC Pricing

## The model

AMC is open source and MIT licensed. The full trust stack is free.

The planned commercial surface is **Industry Packs** — 41 sector-specific domain packs that map trust scoring to regulated and specialized verticals. The target price is **$9.99/month per user** for all 41 packs. **Public checkout and automatic license issuance are not yet publicly live or available.**

## What is free

Everything except Industry Packs:

- **Score** — full evidence-weighted trust scoring, gap analysis, maturity diagnostics
- **Shield** — all 142 adversarial assurance packs
- **Enforce** — policy controls, approval workflows, scoped actions, governance
- **Vault** — Ed25519 signatures, Merkle chains, tamper-evident proof infrastructure
- **Watch** — traces, anomalies, timelines, monitoring, operational drift detection
- **Comply** — regulatory mapping (EU AI Act, ISO 42001, NIST AI RMF, OWASP), audit binders, governance reports
- **Fleet** — multi-agent oversight, comparison, delegation graphs
- **Passport** — portable identity, credentials, trust portability artifacts
- **All 16 framework adapters** — AutoGen, Claude Code, CrewAI, DeepSeek Harness, Gemini CLI, Generic CLI, Hermes Agent, LangChain for Node and Python, LangGraph, LlamaIndex, OpenAI Agents SDK, OpenClaw, OpenHands, Python AMC SDK, and Semantic Kernel. OpenAI-compatible endpoints use Generic CLI. The optional DeepSeek Harness adapter requires a reviewed, signed launcher; process capture does not prove internal tool or provider coverage.
- **1,233 CLI command paths**
- **244 default diagnostic questions** plus the free, opt-in 20-question lifecycle expansion
- **Browser playground**
- **CI trust gates**
- **GitHub Action**

All of the above is MIT licensed and always will be.

## What is planned as paid

**Industry Packs** — 41 domain-specific packs that add sector-tuned diagnostics, compliance mappings, and trust scoring calibrated to specific regulated verticals.

Examples:
- Healthcare / HIPAA
- Financial services / SOX / PCI-DSS
- Education / FERPA
- Government / FedRAMP
- Insurance
- Legal / eDiscovery
- Mobility / autonomous systems
- Energy / critical infrastructure

### Why these are paid
Industry packs require deep domain expertise, regulatory research, and ongoing maintenance as regulations evolve. Keeping them as the paid tier funds the open-source core sustainably.

### Current access status
- **Industry Packs** — implemented behind an entitlement boundary; target price $9.99/month per user; not yet publicly purchasable
- **Enterprise** — contact-first planning only; no self-serve checkout claim

CLI:

```bash
amc domain pack access
amc domain pack checkout # fails closed unless a verified checkout provider is configured
amc domain pack activate --key <license-key>
amc domain pack verify --key <license-key> --pubkey <license-public-key.pem>
```

`domain pack verify` counts only an Ed25519 license signature from a key pinned by `--pubkey`, a signed trust list or `AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY`, and exits 0, 1 or 2 like every verify command. A license signed with `AMC_INDUSTRY_PACKS_LICENSE_SECRET` or a legacy allowlisted key names no signer, so `verify` refuses it; `activate` still accepts them.

For a future production checkout, an operator must first verify a real payment link, then set `AMC_INDUSTRY_PACKS_CHECKOUT_URL` and configure the API with `AMC_INDUSTRY_PACKS_LICENSE_SECRET` plus `AMC_INDUSTRY_PACKS_ADMIN_TOKEN`. Payment webhooks or a checkout adapter can then call `POST /api/industry-packs/license/issue` to generate a signed activation key after a paid subscription event. None of that configuration exists on the static public website today.

## Pricing tiers

| Tier | What you get | Who it's for |
|---|---|---|
| **Free / Open Source** | Full AMC trust stack (Score, Shield, Enforce, Vault, Watch, Comply, Fleet, Passport), all adapters, all CLI commands, browser playground, CI gates | Everyone — solo devs, teams, enterprises evaluating |
| **Industry Packs (planned)** | Everything in Free + all 41 Industry Packs; target $9.99/month per user; checkout not live | Teams in regulated industries who need sector-specific diagnostics |
| **Enterprise (contact-first)** | Planned Industry Packs access + priority support + custom pack development + deployment assistance | Regulated organizations, platform teams at scale |

## FAQ

### Is the core product really free?
Yes. Score, Shield, Enforce, Vault, Watch, Comply, Fleet, Passport — all free, all MIT licensed. No feature gating on the trust stack itself.

### What if I don't need Industry Packs?
Then AMC is completely free for you. The full trust stack works without any Industry Pack.

### Can I build my own domain packs?
Yes. AMC's pack system is extensible. You can create custom packs for your own domain. AMC intends to maintain the commercial Industry Packs with ongoing regulatory research once that channel launches.

### Will free features ever become paid?
No. The MIT license is permanent. Features that are free today stay free.

## Read next
- `docs/PRODUCT_EDITIONS.md`
- `docs/PRICING_FAQ.md`
- `docs/DEPLOYMENT_OPTIONS.md`
- `docs/ENTERPRISE.md`
