# ADR 019: Industry Packs are free

Status: decided on 2026-11-07 by the owner. Supersedes [ADR-005](005-free-core-paid-industry-packs.md).
Date: 2026-11-07.

## Context

[ADR-005](005-free-core-paid-industry-packs.md) (2026-03-10) kept the trust stack free and made Industry Packs, the 41 sector questionnaire packs, the paid part of AMC. P1-51 (2026-10-18, D-06 = B) kept that gate: pack questions and runs needed a licence that verified against an `artifact-seal` key pinned in the operator's trust list, at a planned price of US$9.99 a month. Public checkout and licence issuance never went live; `website/publication-status.json` records the `industryPacksCheckout` channel as `not_live`.

On 2026-11-07 the owner asked to "make it ready to deploy with industry packs also available for free".

## Decision

Industry Packs are free for everyone: no licence, checkout, account or payment.

- Every surface gives full access: the CLI (`amc domain pack list|describe|run|access|checkout|activate|verify` and `amc domain assess|gaps|report|assurance|roadmap|apply`), Studio `/industry-packs/*`, the MCP tools `amc_list_industry_packs`, `amc_get_industry_pack`, `amc_score_industry_pack` and `amc_score_sector_pack`, the dashboard and the console.
- `getIndustryPackEntitlement()` (`src/domains/industryPackEntitlement.ts`) always returns `active: true`, `source: "free"`, `planId: "industry-packs-free"`, `priceUsdMonthly: "0.00"`, `checkoutAvailable: false`, `checkoutUrl: null` and `expiresAt: null`. Catalogue items keep their `locked` field for API compatibility; it is always `false`.
- Every gate is removed: `assertIndustryPackAccess`, `IndustryPackAccessError`, the paywall message, the checkout URL builder, Studio's 402 on `GET /industry-packs/<id>`, the MCP `industry_packs_locked` refusal, the locked states in the dashboard and console, and the console's checkout button and licence form.
- The checkout entry points stay so that existing callers get an answer, and say there is nothing to buy: `amc domain pack checkout` prints the free message and exits 0 (`--json`: `checkoutUrl: null` and the entitlement); Studio `GET|POST /industry-packs/checkout` and the hosted `POST /api/industry-packs/checkout` answer 200 with `checkoutUrl: null`. The hosted `/api/health` reports `industryPacksPlan: "industry-packs-free"` and `industryPacksPriceUsdMonthly: "0.00"`.

## What stays

Legacy licence verification, for anyone who already holds a licence. None of it is needed for access.

- `amc domain pack activate --key` records a licence that verifies against an `artifact-seal` key pinned in the operator's trust list, and prints that it changes nothing. `amc domain pack verify --key` verifies one. Both still refuse a licence that no pinned key signed.
- Studio `POST /industry-packs/activate` still verifies and records a licence. It answers 200 `{ entitlement, licence, entitlementNote }`: `entitlement` is the free record, and `licence` (`{ planId, status, expiresAt, customerId?, subscriptionId? }`) describes the recorded licence; `amc domain pack activate --json` adds the same `licence` object to the free entitlement. Its `INDUSTRY_PACKS_ACTIVATED` audit payload is `{ planId, licenseStatus, expiresAt, subscriptionId }`, taken from the licence.
- Studio `POST /industry-packs/license/verify` and the hosted licence issue, verify and webhook endpoints in `api/index.ts` behave as before.
- Licences keep the plan id `industry-packs-monthly` (`INDUSTRY_PACKS_PLAN_ID`). `entitlement.licenseVerificationConfigured` reports whether this machine pins a key that could verify one.

## Truth rule

Access never changes a score, gap, report, assurance result, roadmap, trust tier or verification outcome. A pack result is a self-reported questionnaire (claim kind `self_reported`, level 1 at most) whose content is experimental: AI-drafted until a named expert signs it. It is never a certification, a compliance verdict or proof of safety. The free message (`INDUSTRY_PACKS_FREE_MESSAGE`) says that pack results are self-reported and that access never changes a result, and Studio's `entitlementNote` says that access never changes a result, a trust tier or a verification outcome.

## Consequences

- **Positive**: no barrier to the sector questionnaires; anyone can run every pack.
- **Positive**: no access gate or checkout to operate, and no locked branch to keep consistent across the CLI, Studio, MCP, dashboard and console.
- **Negative**: the pack revenue ADR-005 counted on does not exist, while pack maintenance still needs ongoing regulatory research and expert review.
- **Neutral**: Enterprise stays a contact-first plan for priority support, custom pack development and deployment assistance (`docs/PRICING.md`, `docs/ENTERPRISE.md`). It no longer includes pack access, because every pack is free.
- `tests/industryPackEntitlement.test.ts` and `tests/industryPacksPaywallSurfaces.test.ts` pin the free behaviour.
