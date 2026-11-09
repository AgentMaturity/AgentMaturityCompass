# PRICING.md — AMC Pricing

## The model

AMC is open source and MIT licensed, and the whole product is free, including all 41 **Industry Packs**. In the current source build (unreleased; the next release is 2.0.0) Industry Packs need no licence, account or payment ([ADR 019](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/adr/019-industry-packs-free.md), decided on 2026-11-07, which supersedes the paid-packs plan of ADR-005). The published 1.1.1 release predates that decision: it still asks for a licence before pack questions and runs, and its checkout never went live, so use the [source build](INSTALL.md#option-b-from-github-development) for packs. There is nothing to buy in the product: checkout is not available, because every feature and every pack is free.

Industry Packs are self-reported questionnaires whose content is experimental: AI-drafted until a named expert signs it. Access never changes a score, gap, report, assurance result or roadmap, nor a trust tier or verification outcome. A pack result is never a certification, a compliance verdict or proof of safety.

## What is free

Everything:

- **Score** — full evidence-weighted trust scoring, gap analysis, maturity diagnostics
- **Shield** — all <!-- amc:count:assurancePacksRegistered -->143<!-- /amc:count --> registered adversarial assurance packs
- **Enforce** — policy controls, approval workflows, scoped actions, governance
- **Vault** — Ed25519 signatures, Merkle chains, tamper-evident proof infrastructure
- **Watch** — traces, anomalies, timelines, monitoring, operational drift detection
- **Comply** — regulatory mapping (EU AI Act, ISO 42001, NIST AI RMF, OWASP), audit binders, governance reports
- **Fleet** — multi-agent oversight, comparison, delegation graphs
- **Passport** — portable identity, credentials, trust portability artifacts
- **Industry Packs** — all 41 sector questionnaire packs, with their CLI commands, Studio routes, MCP tools, dashboard and console views
- **All 16 framework adapters** — AutoGen, Claude Code, CrewAI, DeepSeek Harness, Gemini CLI, Generic CLI, Hermes Agent, LangChain for Node and Python, LangGraph, LlamaIndex, OpenAI Agents SDK, OpenClaw, OpenHands, Python AMC SDK, and Semantic Kernel. OpenAI-compatible endpoints use Generic CLI. The optional DeepSeek Harness adapter requires a reviewed, signed launcher; process capture does not prove internal tool or provider coverage.
- **1,271 CLI command paths**
- **244 default diagnostic questions** plus the free, opt-in 20-question lifecycle expansion
- **Browser playground**
- **CI trust gates**
- **GitHub Action**

All of the above is MIT licensed and always will be.

## Industry Packs

41 domain-specific, self-reported questionnaires with regulatory mappings, across seven stations: Health, Wealth, Education, Mobility, Technology, Environment and Governance. [DOMAIN_PACKS.md](DOMAIN_PACKS.md) gives the pack and question counts per station, `amc domain pack list` lists every pack, and [SCORING_METHODOLOGY.md](SCORING_METHODOLOGY.md) gives the published method that scores them: self-reported answers cap at level 1.

CLI:

```bash
amc domain pack list      # every pack, all included
amc domain pack access    # source build: Price: free, Status: active (1.1.1 without a licence: locked)
amc domain pack describe --pack <packId>
amc domain pack run --pack <packId>
```

`amc domain pack checkout` is kept for scripts that call it: it prints the free message and exits 0, and with `--json` it returns `checkoutUrl: null`. Studio `GET|POST /industry-packs/checkout` and the hosted API's `POST /api/industry-packs/checkout` answer 200 with `checkoutUrl: null`.

### Existing licences

A licence issued under the earlier plan is not needed for anything. `amc domain pack activate --key <license-key>` still records one that verifies against a key the signed trust list in your AMC home (`<AMC home>/trust/amc-trust-list.json`, or `--trust-list` on `verify`; see [TRUST_LIST.md](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/TRUST_LIST.md)) pins for `artifact-seal`, and prints that it changes nothing; `amc domain pack verify --key <license-key>` still verifies one. A public key, shared secret or legacy allowlist in the environment never counts, `verify` takes no `--pubkey`, and with no such key pinned `verify` exits 1 with "licence verification is not configured". The hosted API keeps its licence issue, verify and webhook endpoints (`api/index.ts`) for the same holders.

## Pricing tiers

| Tier | What you get | Who it's for |
|---|---|---|
| **Free / Open Source** | The whole product: the AMC trust stack (Score, Shield, Enforce, Vault, Watch, Comply, Fleet, Passport), all 41 Industry Packs, all adapters, all CLI commands, browser playground, CI gates | Everyone — solo devs, teams, enterprises |
| **Enterprise (contact-first)** | Planned: priority support + custom pack development + deployment assistance. Not a self-serve product, and not needed for any feature or pack | Regulated organizations, platform teams at scale |

## FAQ

### Is AMC really free?
Yes. Score, Shield, Enforce, Vault, Watch, Comply, Fleet, Passport and all 41 Industry Packs — all free, all MIT licensed. No feature gating on the trust stack itself, and no licence gate on Industry Packs in the current source build.

### Do I need a licence for Industry Packs?
No, with the current source build (unreleased; the next release is 2.0.0): every pack's questions and runs are included for everyone. The published 1.1.1 release still asks for a licence before pack questions and runs. A licence from the earlier plan still verifies, but in the source build it unlocks nothing, because nothing is locked.

### Can I build my own domain packs?
Yes. AMC's pack system is extensible. You can create custom packs for your own domain.

### Will free features ever become paid?
No. The MIT license is permanent. Features that are free today stay free.

## Read next
- `docs/PRODUCT_EDITIONS.md`
- `docs/PRICING_FAQ.md`
- `docs/DEPLOYMENT_OPTIONS.md`
- `docs/ENTERPRISE.md`
