# AMC-1471 - privacy-safe approval lifecycle delivery

- Issue: `AMC-1471`
- Dimension: approval adoption, lifecycle delivery, and evidence privacy
- AMC surfaces requested: Enforce, Vault, Watch, Studio/PWA, CLI, Docs
- Source reviewed: first-party Agent Control and AgentApprove/AEP material already pinned by the competitive review
- Retrieval: public sites and repositories reviewed 2026-07-10; implementation review 2026-07-11
- Immutable source commits: Agent Control `83188b62c63e2b4ff9ada87048fd99605184ee5a`; Agent Event Protocol `2583cff9380f8f0a459d52c7112b6105c46496ed`
- Status: Published and verified

## Relevance decision

The source signal is relevant because AMC already had stronger signed quorum, execution binding, Vault-backed integration, retry, dead-letter, and receipt primitives, but its operator surfaces read two different stores and approval lifecycle events were reserved without being dispatched. This gap maps directly to existing Enforce, Vault, Watch, Studio, CLI, and evidence behavior. It does not justify a second approval system, event database, mobile app, push provider, protocol implementation, or compatibility layer.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring, question-bank, badge, or methodology semantic change. |
| Shield | Tampered request/context and replay paths fail closed; no new Shield pack. |
| Enforce | Primary surface. The canonical signed quorum chain remains execution authority. |
| Vault | Existing secret refs resolve only at send time; queue/journal evidence stores no URL, ref, secret, or raw transport error. |
| Watch | Approval lifecycle SSE and signed delivery receipts expose bounded operational state. |
| Fleet | Existing per-agent identity scopes requests and SSE node refresh; no Fleet store change. |
| Passport | Notifications and delivery receipts are explicitly not portable maturity proof. |
| Comply | Signed decisions and delivery evidence remain available to existing audit binders; no new framework mapping. |

## Product closure

- Added one canonical inbox projection over `approvalChainStore`; CLI list/show, Dashboard, diagnostics, and Studio no longer read the producerless legacy store.
- Preserved `APPROVED` as an input alias for `QUORUM_MET` and added `CANCELLED` across filters and summaries.
- Added one strict versioned metadata-only lifecycle envelope and delivery adapter over the existing signed Integrations router.
- ToolHub creation, partial decision, quorum, denial, cancellation, expiry, and consumption map to existing lifecycle routes without changing quorum.
- Studio emits approval SSE events, supports validated single-workspace and hosted-workspace deep links, refreshes the inbox, validates decisions strictly, persists and delivers expiry once, delivers actual ToolHub consumption, and rejects terminal replay.
- Approval list responses and CLI list output use one bounded summary; authenticated detail remains explicit.
- CLI decisions require explicit reviewer identity and roles, enforce distinct-user policy in the shared engine, and run the same lifecycle delivery path as Studio.
- Queue rows bind immutable routing/payload metadata with an auditor signature, due retries resume through Studio startup/scheduler drains, `QUEUED` is reported truthfully, and terminal journal/dead-letter finalization is idempotent.
- Session records bind the exact token digest. Revoked sessions, revoked users, changed local roles, disabled host users, changed workspace memberships, and workspace logout fail closed on subsequent requests. The router strips client bootstrap-admin headers and preserves mapped session roles at Studio.
- Session cookies add `Secure` for direct or forwarded HTTPS while preserving loopback HTTP development.
- Public and generated OpenAPI now name the actual routes, decision enum, and `amc_session` cookie.

## Fail-closed rule

Unsigned, malformed, or tampered requests are absent from the canonical inbox and cannot be delivered. Tampered decisions or consumption evidence make the chain untrusted; even a validly signed consumption artifact fails when its embedded request or agent differs from the addressed path. Invalid Approval Policy, Action Policy, tools, or budgets make context untrusted. Missing or invalid Integrations signatures block delivery without changing the pending signed approval. Payload/routing changes to a queued row are dead-lettered before network I/O. Unknown decisions and mode conflicts return `400`; role/policy denials return `403`; terminal decisions and cancellation return `409`.

Delivery success, failure, duplication, reordering, expiry, or replay never records a decision, changes quorum, grants a lease, or executes a tool. The notification is always `notificationOnly: true` and `proofEligible: false`.

## Privacy and persistence boundary

The outbound envelope contains only request ID/digest, action class, risk, requested/effective mode, timestamps, lifecycle status, quorum counts, and a relative authenticated review path. Tool names, intent/work-order IDs, raw arguments, reasons, bound hashes, signatures, credentials, Vault refs, auth/lease tokens, absolute paths, and destination URLs are excluded.

Destination and secret refs are loaded from the currently signed Integrations config when a queue row is processed. New and migrated queue rows store no destination or secret reference. The signed outbox binding covers channel, type, event, agent, payload digest, ordering sequence, retry limit, and creation time. Persisted delivery receipts use a destination hash and normalized transport code. The HMAC shared secret is never sent as a header.

## No-bloat boundary

AMC did not add a second approval store, queue, event database, push provider, Web Push subscription service, native/mobile app, policy language, notification secret format, source-specific integration, AgentApprove compatibility mode, or AEP conformance claim. No competitor code, prose, examples, schemas, policies, mappings, prompts, screenshots, assets, or generated output were copied.

## Verification

- Expected-red regression reproduced persisted destination URLs, accepted unknown decisions, terminal replay, revoked-session acceptance, and stale OpenAPI paths.
- Independent review found nine concrete host-auth, outbox, retry, consumption, lifecycle, CLI, deep-link, and OpenAPI defects; all nine now have code fixes and positive/negative regression coverage.
- Dedicated contract passes 1 file / 19 tests.
- Consolidated approval, host, ToolHub, Integrations, Console, and OpenAPI owner coverage passes 7 files / 59 tests.
- Typecheck passes.
- Full Vitest passes at 1,067 files / 8,434 tests.
- The consolidated release gate passes OpenAPI parsing, typecheck, 1,067 files / 8,434 tests, build, 1,153 command paths, architecture boundaries, 1,489-file Docs drift, a zero-vulnerability runtime audit, and all 10 clean-install personas at 10/10. Receipt: `tmp/release-gate/amc-1471-final.json`.
- Desktop packaging and verification pass for macOS universal, Linux x64, and Windows x64.
- Full Playwright passes 55 tests with 2 intentional i18n skips.
- Manual Studio review passes at 1280x720 and 390x844: the authenticated inbox exposes request/intent IDs, action class, `0/2 (PENDING)`, and decision controls without raw arguments or secrets; only the table scrolls horizontally on mobile, and browser warning/error logs are empty.
- Implementation commit `cc314c1df0f6a0949d948cf573ece330e8d320ef` is pushed to `main` and `origin/main`.
- Exact-head CI `29156322970`, npm validation `29156322967`, Docker Runner Image `29156322959`, and Pages `29156323008` passed. Node 20/22 full suites, local E2E, Helm, security, Docker smoke, release guardrails, and release preflight are green; registry/tag publication was intentionally skipped by release policy.
- Production Docs manifest reports the exact source revision and 170 guides. The live homepage, public OpenAPI, and approval guide are byte-identical to the committed files; the homepage exposes 8,434 and not the stale 8,413 proof.
- Apex returns `200`, `www` redirects to the apex, and the authorized certificate covers both names through 2026-09-24.
- Live desktop and 390x844 browser checks keep the homepage and rendered Approvals guide within viewport bounds with no console/page errors. Post-deploy quick release gate passes with receipt `tmp/release-gate/amc-1471-live.json`.
