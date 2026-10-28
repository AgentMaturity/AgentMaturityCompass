# PRICING.md — AMC Pricing

## The model

AMC is open source and MIT licensed. The full trust stack is free.

The planned commercial surface is **Industry Packs** — 41 sector-specific domain packs for regulated and specialized verticals. The target price is **$9.99/month per user** for all 41 packs. **Public checkout and automatic license issuance are not yet publicly live or available.**

Industry Packs are self-reported questionnaires. A licence unlocks access to pack questions and runs; it never changes a score, gap, report, assurance result or roadmap, nor a trust tier or verification outcome. Pack names, descriptions and regulatory basis stay visible without a licence.

## What is free

Everything except Industry Packs:

- **Score** — full evidence-weighted trust scoring, gap analysis, maturity diagnostics
- **Shield** — all <!-- amc:count:assurancePacksRegistered -->143<!-- /amc:count --> registered adversarial assurance packs
- **Enforce** — policy controls, approval workflows, scoped actions, governance
- **Vault** — Ed25519 signatures, Merkle chains, tamper-evident proof infrastructure
- **Watch** — traces, anomalies, timelines, monitoring, operational drift detection
- **Comply** — regulatory mapping (EU AI Act, ISO 42001, NIST AI RMF, OWASP), audit binders, governance reports
- **Fleet** — multi-agent oversight, comparison, delegation graphs
- **Passport** — portable identity, credentials, trust portability artifacts
- **All 16 framework adapters** — AutoGen, Claude Code, CrewAI, DeepSeek Harness, Gemini CLI, Generic CLI, Hermes Agent, LangChain for Node and Python, LangGraph, LlamaIndex, OpenAI Agents SDK, OpenClaw, OpenHands, Python AMC SDK, and Semantic Kernel. OpenAI-compatible endpoints use Generic CLI. The optional DeepSeek Harness adapter requires a reviewed, signed launcher; process capture does not prove internal tool or provider coverage.
- **1,268 CLI command paths**
- **244 default diagnostic questions** plus the free, opt-in 20-question lifecycle expansion
- **Browser playground**
- **CI trust gates**
- **GitHub Action**

All of the above is MIT licensed and always will be.

## What is planned as paid

**Industry Packs** — 41 domain-specific, self-reported questionnaires with regulatory mappings for regulated verticals. They are scored by the same published method with or without a licence.

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
- **Industry Packs** — implemented behind a licence gate; target price $9.99/month per user; not yet publicly purchasable. Every locked surface (CLI, Studio, console, dashboard, MCP, hosted API) states what is locked, the price, and either a working checkout or "Checkout is not available in this deployment; contact sales for access."
- **Enterprise** — contact-first planning only; no self-serve checkout claim

CLI:

```bash
amc domain pack access    # what is locked, the price, and whether checkout is available here
amc domain pack checkout  # exits 1 with the reason unless checkout and licence verification are configured
amc domain pack activate --key <license-key>
amc domain pack verify --key <license-key>
```

`domain pack verify`, `activate` and every locked command, route and tool accept only a licence signed by a key that the signed trust list in your AMC home (`<AMC home>/trust/amc-trust-list.json`, or `--trust-list` on `verify`; see [TRUST_LIST.md](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/TRUST_LIST.md)) pins for `artifact-seal`. A public key, shared secret or legacy allowlist in the environment is supplied by the client, so it never counts, and `verify` takes no `--pubkey`. With no such key pinned, `verify` exits 1 with "licence verification is not configured", `amc domain pack access` reports it as not configured, `activate` refuses and stores nothing, and checkout is not offered, because a licence bought there could not be activated. A licence's expiry is the one its issuer signed into it and is enforced at verification; `activate --expires-at` is refused.

For a future production checkout, an operator must first verify a real payment link, then configure the issuing API (`api/index.ts`) with `AMC_INDUSTRY_PACKS_CHECKOUT_URL`, an Ed25519 `AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY` and `AMC_INDUSTRY_PACKS_ADMIN_TOKEN`; the API offers checkout only when all three are set, and answers `POST /api/industry-packs/checkout` with 503 and the reason otherwise. With `AMC_INDUSTRY_PACKS_WEBHOOK_SECRET` set, `POST /api/industry-packs/webhook` verifies the payment provider's `Stripe-Signature` (HMAC-SHA256 over the raw body, five-minute tolerance) and records each paid checkout once for fulfilment; it never issues a licence. An admin issues it with `POST /api/industry-packs/license/issue` (admin token, compared in constant time), and delivering it to the buyer is not wired. Buyers also need the matching public key pinned in their trust list. None of that configuration exists on the static public website today.

## Pricing tiers

| Tier | What you get | Who it's for |
|---|---|---|
| **Free / Open Source** | Full AMC trust stack (Score, Shield, Enforce, Vault, Watch, Comply, Fleet, Passport), all adapters, all CLI commands, browser playground, CI gates | Everyone — solo devs, teams, enterprises evaluating |
| **Industry Packs (planned)** | Everything in Free + all 41 Industry Packs (self-reported questionnaires; results never depend on payment); target $9.99/month per user; checkout not live | Teams in regulated industries who need sector-specific diagnostics |
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
