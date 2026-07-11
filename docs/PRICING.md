# PRICING.md — AMC Pricing

## The model

AMC is open source and MIT licensed. The full trust stack is free.

The only paid surface is **Industry Packs** — 41 sector-specific domain packs that map trust scoring to regulated and specialized verticals. Access is **$9.99/month** for all 41 packs.

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
- **All 14 framework adapters** — LangChain, CrewAI, OpenAI, Claude Code, Gemini, AutoGen, LlamaIndex, Semantic Kernel, OpenClaw, OpenHands, Python SDK, generic CLI, OpenAI-compatible
- **1,159 CLI command paths**
- **244 default diagnostic questions** plus the free, opt-in 20-question lifecycle expansion
- **Browser playground**
- **CI trust gates**
- **GitHub Action**

All of the above is MIT licensed and always will be.

## What is paid

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

### How to access
- **Industry Packs** — $9.99/month for all 41 packs in CLI and Studio
- **Enterprise** — Industry Packs plus priority support, custom pack development, deployment assistance

CLI:

```bash
amc domain pack access
amc domain pack checkout
amc domain pack activate --key <license-key>
amc domain pack verify --key <license-key>
```

For production checkout, set `AMC_INDUSTRY_PACKS_CHECKOUT_URL` to the live payment link and configure the API with `AMC_INDUSTRY_PACKS_LICENSE_SECRET` plus `AMC_INDUSTRY_PACKS_ADMIN_TOKEN`. Payment webhooks or a checkout adapter can then call `POST /api/industry-packs/license/issue` to generate a signed activation key after a paid subscription event.

## Pricing tiers

| Tier | What you get | Who it's for |
|---|---|---|
| **Free / Open Source** | Full AMC trust stack (Score, Shield, Enforce, Vault, Watch, Comply, Fleet, Passport), all adapters, all CLI commands, browser playground, CI gates | Everyone — solo devs, teams, enterprises evaluating |
| **Industry Packs** | Everything in Free + all 41 Industry Packs for $9.99/month | Teams in regulated industries who need sector-specific diagnostics |
| **Enterprise** | Everything in Industry Packs + priority support + custom pack development + deployment assistance | Regulated organizations, platform teams at scale |

## FAQ

### Is the core product really free?
Yes. Score, Shield, Enforce, Vault, Watch, Comply, Fleet, Passport — all free, all MIT licensed. No feature gating on the trust stack itself.

### What if I don't need Industry Packs?
Then AMC is completely free for you. The full trust stack works without any Industry Pack.

### Can I build my own domain packs?
Yes. AMC's pack system is extensible. You can create custom packs for your own domain. The paid Industry Packs are professionally maintained, regularly updated, and backed by regulatory research.

### Will free features ever become paid?
No. The MIT license is permanent. Features that are free today stay free.

## Read next
- `docs/PRODUCT_EDITIONS.md`
- `docs/PRICING_FAQ.md`
- `docs/DEPLOYMENT_OPTIONS.md`
- `docs/ENTERPRISE.md`
