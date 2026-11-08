# PRODUCT_EDITIONS.md — AMC Edition Matrix

## Edition model

AMC has one product, and it is free:

- **Free / Open Source**: the entire trust stack and all 41 Industry Packs (sector-specific, self-reported domain questionnaires whose content is experimental), MIT licensed
- **Enterprise (contact-first, planned)**: priority support, custom pack development and deployment assistance; not a self-serve product

Industry Packs are free in the current source build (unreleased; the next release is 2.0.0): no licence, account or payment ([ADR 019](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/adr/019-industry-packs-free.md), decided on 2026-11-07). The published 1.1.1 release still asks for a licence before pack questions and runs, and its checkout never went live. Access never changes a score, gap, report or other result: the same inputs give the same result for everyone.

## Full edition matrix

| Product | Free / Open Source | Enterprise (contact-first, planned) |
|---|---|---|
| **Score** | ✅ Full | ✅ Full |
| **Shield** (<!-- amc:count:assurancePacksRegistered -->143<!-- /amc:count --> registered assurance packs) | ✅ Full | ✅ Full |
| **Enforce** | ✅ Full | ✅ Full |
| **Vault** | ✅ Full | ✅ Full |
| **Watch** | ✅ Full | ✅ Full |
| **Fleet** | ✅ Full | ✅ Full |
| **Passport** | ✅ Full | ✅ Full |
| **Comply** | ✅ Full | ✅ Full |
| **All <!-- amc:count:adapters -->16<!-- /amc:count --> adapters** | ✅ Full | ✅ Full |
| **1,279 CLI command paths** | ✅ Full | ✅ Full |
| **Browser playground** | ✅ Full | ✅ Full |
| **CI trust gates** | ✅ Full | ✅ Full |
| **Industry Packs** (41 packs, 7 stations) | ✅ All 41 packs | ✅ All 41 packs |
| **Priority support** | ❌ | ✅ |
| **Custom pack development** | ❌ | ✅ |
| **Deployment assistance** | ❌ | ✅ |

## Why this model

Most open-source projects gate core features behind paid tiers, which kills adoption. AMC puts nothing behind payment: the trust stack and the domain-specific content (Industry Packs) are both free.

The trust stack itself is free. Always.

Commercial availability boundary: there is no checkout and nothing to buy in the product. Enterprise is contact-first planning for services, not a purchase-ready offer, and no feature or pack depends on it.

## Read next
- `docs/PRICING.md`
- `docs/PRICING_FAQ.md`
- `docs/ENTERPRISE.md`
