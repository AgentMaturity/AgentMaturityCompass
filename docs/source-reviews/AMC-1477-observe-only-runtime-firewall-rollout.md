# AMC-1477 - signed observe-only Runtime Firewall rollout counters

- Issue: `AMC-1477`
- Dimension: observe-only control rollout, signed decision aggregation, and evidence truth
- AMC surfaces requested: Watch, Enforce, CLI, existing firewall API status, Docs
- Sources reviewed: [Agent Control concepts](https://docs.agentcontrol.dev/concepts/overview), [Agent Control UI monitoring](https://docs.agentcontrol.dev/core/ui-quickstart), and [Agent Control repository](https://github.com/agentcontrol/agent-control)
- Retrieval: live first-party docs and immutable repository source reviewed 2026-07-12
- Immutable source commit: Agent Control `83188b62c63e2b4ff9ada87048fd99605184ee5a`
- Status: Locally verified; exact-SHA CI and production publication pending

## Relevance decision

Observe-only rollout is relevant because AMC already owns a signed Runtime Firewall policy with `observe`, `warn`, and `block` modes, but its status exposed only a raw event count. Operators could see that traffic was evaluated but could not prove what the same exact policy would warn or block before promotion.

The source signal is limited to the usability of a non-blocking observe action and execution/match/action counters. AMC keeps its own signed policy, evaluator, artifact, redaction, journal, API, and CLI contracts.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No question, maturity, weighting, or methodology change. |
| Shield | Existing Runtime Firewall matches remain unchanged; no detector or assurance pack was added. |
| Enforce | The existing policy and evaluator bind candidate action, actual action, suppression state, policy revision/hash, and thresholds. |
| Vault | Existing domain-separated artifact signing and redaction remain the trust boundary; no payload store was added. |
| Watch | Existing status surfaces aggregate privacy-safe rollout evidence and disclose invalid, legacy, and historical-policy exclusions. |
| Fleet | No fleet policy, per-agent override, inheritance, or aggregation was added. |
| Passport | No portable token or public badge change. |
| Comply | Signed decision evidence remains available to existing audit exports; no framework mapping changed. |

## Product closure

- Kept one signed Runtime Firewall policy and one production evaluator across observe, warn, and block.
- Added a versioned rollout binding to new signed decision artifacts. It records the effective policy revision/hash, thresholds, candidate full-enforcement action, actual mode action, and whether mode suppressed enforcement.
- Preserved observe as non-blocking for valid matched traffic, warn as warning-only, and block as full enforcement.
- Preserved actual fail-closed blocks for missing/invalid policy and invalid signed Guardrails state.
- Added strict, domain-separated signature verification before any event contributes to counters.
- Scoped would-warn and would-block counters to the current exact effective policy binding: hash, mode, revision, source integrity, and thresholds. Historical policy revisions are counted but excluded.
- Classified domain-separated verified legacy decisions without rollout binding as legacy-unclassified rather than inferring a candidate action.
- Rejected signed decisions whose receipt digest, risk score, severity, degraded state, or match reasons disagree with the event body.
- Kept verified disabled-policy history visible but explicitly non-claimable.
- Exposed the same projection from `amc firewall status [--json]` and existing `GET /api/v1/firewall/status`; no route was added.
- Stabilized the effective policy hash for Guardrails-only configurations by binding the derived policy timestamp to signed Guardrails state.
- Prevented caller-supplied policy objects from producing recorded rollout proof; they remain simulation-only.

## Fail-closed rule

Tampered payloads, missing or invalid signatures, legacy non-domain-separated signatures, wrong artifact kinds, malformed or unknown fields, duplicate rule matches, invalid thresholds, exact-policy binding mismatch, receipt mismatch, inconsistent risk/severity/degraded/reason/candidate/actual/mode mappings, workspace/path mismatch, and counter invariant failure make rollout status `fail_closed`. Invalid events never contribute to trusted counters. Missing or untrusted effective policy state cannot become an observe-mode allow claim, and a disabled policy cannot become claim-eligible.

## Privacy boundary

Counters contain enum actions, counts, rule IDs, timestamps, revisions, and hashes. They do not add prompts, request or response content, raw provider payloads, tool arguments, credentials, session text, or new previews. Existing decision redaction and export behavior is unchanged.

## No-bloat boundary

No competitor code, prose, schemas, examples, policies, database model, API, dashboard, screenshot, asset, or generated output was copied. No duplicate control store, policy language, evaluator, telemetry database, analytics service, background daemon, hook mode, endpoint, Score change, or automatic promotion was added.

## Verification

- Expected-red: 1 file / 7 tests failed only on missing rollout binding, counters, fail-closed aggregation, and CLI rendering.
- Review-hardening red: exact-policy threshold/revision mismatch, disabled-policy claim eligibility, and signed risk/match inconsistency each reproduced before the fixes.
- Focused Runtime Firewall slice: 6 files / 57 tests passed across rollout evidence, existing firewall behavior, Guardrails integrity, control simulation, control projection, API, and OpenAPI.
- Typecheck and build: passed.
- Full Vitest: 1,073 files / 8,501 tests passed.
- Authoritative release gate: passed OpenAPI parse, typecheck, build, full Vitest, architecture boundaries at 24,373 CLI / 8,874 Studio lines, 1,495-file Docs drift, zero-vulnerability runtime audit, CLI/domain smoke, and all install personas; receipt `tmp/release-gate/amc-1477-final.json`.
- Desktop packaging: npm plus macOS universal, Linux x64, and Windows x64 artifacts built and verified.
- Package SHA-256: npm `d461a91c413f55956f148666d2afdbdcbf3a455023c4269bb371f4e11dcbdf71`; macOS `b055f044b9f9f9938e3ae2307af846e62be50a924c91e57d25d963e9a2faf6dc`; Linux `84a1919fe95dc2dacabadceb489519bed20a9e4c0d16bc6f48480c2ab25548be`; Windows `2cb509d64e6dc2345a7853213ffeb8a1f10d0f3b63a78f2c427890d4afc81b0a`.
- Playwright: 55 passed with 2 established conditional i18n skips, including desktop/mobile Docs shell and CLI page coverage.
- Exact-SHA CI and production checks remain pending before closure.
