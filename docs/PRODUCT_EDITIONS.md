# PRODUCT_EDITIONS.md — AMC Edition Matrix

## Edition model

AMC has one simple split:

- **Free / Open Source**: the entire trust stack
- **Industry Packs / Enterprise (planned)**: sector-specific, self-reported domain questionnaires; public checkout is not live

A licence unlocks access to Industry Pack questions and runs. It never changes a score, gap, report or other result: the same inputs give the same result in every edition.

## Full edition matrix

| Product | Free / Open Source | Industry Packs (planned $9.99/mo per user) | Enterprise (contact-first) |
|---|---|---|---|
| **Score** | ✅ Full | ✅ Full | ✅ Full |
| **Shield** (<!-- amc:count:assurancePacksRegistered -->143<!-- /amc:count --> registered assurance packs) | ✅ Full | ✅ Full | ✅ Full |
| **Enforce** | ✅ Full | ✅ Full | ✅ Full |
| **Vault** | ✅ Full | ✅ Full | ✅ Full |
| **Watch** | ✅ Full | ✅ Full | ✅ Full |
| **Fleet** | ✅ Full | ✅ Full | ✅ Full |
| **Passport** | ✅ Full | ✅ Full | ✅ Full |
| **Comply** | ✅ Full | ✅ Full | ✅ Full |
| **All 14 adapters** | ✅ Full | ✅ Full | ✅ Full |
| **1,262 CLI command paths** | ✅ Full | ✅ Full | ✅ Full |
| **Browser playground** | ✅ Full | ✅ Full | ✅ Full |
| **CI trust gates** | ✅ Full | ✅ Full | ✅ Full |
| **Industry Packs** (41 verticals) | ❌ | ✅ All 41 packs | ✅ All 41 packs |
| **Priority support** | ❌ | ❌ | ✅ |
| **Custom pack development** | ❌ | ❌ | ✅ |
| **Deployment assistance** | ❌ | ❌ | ✅ |

## Why this model

Most open-source projects gate core features behind paid tiers, which kills adoption. AMC gates only **domain-specific content** (Industry Packs) — the part that requires ongoing regulatory expertise and maintenance.

The trust stack itself is free. Always.

Commercial availability boundary: the licence gate exists, but public checkout and automatic issuance are not live. A deployment offers checkout only when a checkout URL and a pinned licence signing key are configured; otherwise every locked surface says checkout is not available in this deployment and to contact sales. Do not present this matrix as a purchase-ready offer until `website/publication-status.json` marks that channel live.

## Read next
- `docs/PRICING.md`
- `docs/PRICING_FAQ.md`
- `docs/ENTERPRISE.md`
