# AMC-1472 - outcome-based first-run onboarding

- Issue: `AMC-1472`
- Dimension: first-run activation, evidence integrity, and adoption clarity
- AMC surfaces requested: Score, Enforce, Watch, Vault, Studio, CLI, Docs
- Source reviewed: first-party Agent Control and AgentApprove/AEP material already pinned by the competitive review
- Retrieval: public sites and repositories reviewed 2026-07-10; implementation review 2026-07-11
- Immutable source commits: Agent Control `83188b62c63e2b4ff9ada87048fd99605184ee5a`; Agent Event Protocol `2583cff9380f8f0a459d52c7112b6105c46496ed`
- Status: Verified locally; publication pending

## Relevance decision

The source signal is relevant because Agent Control and AgentApprove make connection and approval adoption easier to understand, while AMC already owns the stronger primitives needed to prove actual activation: signed adapter and hook ownership, receipt-backed Gateway and ToolHub events, bound hook decision lifecycles, and authenticated evidence review. The gap maps to existing Score, Enforce, Watch, Vault, Studio, CLI, and Docs behavior. It does not justify a setup analytics pipeline, synthetic run, provider-specific onboarding engine, or second evidence model.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Makes evidence readiness visible without changing maturity, questions, weights, or badges. |
| Shield | No new attack pack; tampered and ambiguous evidence is withheld. |
| Enforce | A real signed control decision is required before the decision milestone completes. |
| Vault | Existing receipt signatures and ledger integrity remain the proof authority. |
| Watch | Primary runtime evidence source for first observed action and bounded drilldown. |
| Fleet | Agent identity scopes every milestone; another agent's evidence cannot contribute. |
| Passport | No Passport claim is issued; the projection links to authenticated local proof only. |
| Comply | No framework mapping changes; existing signed evidence remains available to audit flows. |

## Product closure

- Added one pure projection over existing signed adapter/hook state and the existing evidence ledger.
- Added `amc connect --status --agent <id>` and `--json` without minting a lease or running a task.
- Added authenticated `GET /onboarding/status?agentId=<id>` with agent scope enforcement and generated/public OpenAPI schemas.
- Replaced setup-complete framing in Studio with an Activation path showing connected agent, first observed action, first control decision, and first signed proof. Workspace setup remains available as separate detail.
- Added bounded evidence links and one next action while excluding runtime payloads and credentials.
- Removed API GETs from the Console service-worker cache, switched static assets to network-first delivery with offline fallback, and rotated the asset/cache generation so existing clients cannot retain the old setup-based card or stale activation responses.
- Updated the public homepage to state the same evidence boundary: signed setup may be `READY`, while only verified runtime receipts can make the four-step activation path complete.

## Fail-closed rule

Metadata-only evidence fails closed. A candidate event must contain a valid AMC receipt and pass ledger integrity verification. Malformed candidate metadata, missing or invalid receipts, invalid signed adapter state, invalid or cross-agent hook ownership, broken hook request/decision binding, and payload or ledger tampering block every activation claim. Signed configuration may report `READY`, but it cannot report a completed milestone without verified runtime evidence for the selected agent.

## Privacy boundary

The projection exposes only agent ID, bounded status and reason enums, event ID/type, receipt ID/hash, observation time, source class, and a relative authenticated Studio path. It excludes prompts, provider request IDs, tool names and arguments, outputs, errors, leases, auth tokens, secrets, raw payloads, and absolute paths.

## No-bloat boundary

No onboarding event store, analytics stream, sample agent, synthetic task, provider call, daemon, scheduler, background worker, new receipt type, scoring rule, source-specific adapter, compatibility mode, or competitor asset was added. The existing Console service worker was narrowed rather than adding a cache layer. Status inspection performs no writes. No competitor code, prose, examples, schemas, prompts, screenshots, policies, mappings, configuration, or generated output was copied.

## Verification

- Expected-red contract covered setup-only false completion, metadata-only evidence, cross-agent evidence, tamper, CLI purity, Studio parity, OpenAPI, UI, docs, and no-bloat boundaries.
- Dedicated contract passes 1 file / 10 tests. The focused setup, hook, OpenAPI, Studio authorization, and host-mode slice passes 10 files / 56 tests; the final cache/public slice passes 4 files / 22 tests.
- Typecheck and build pass. Full Vitest passes at 1,068 files / 8,444 tests.
- The consolidated release gate passes generated and public OpenAPI parsing, typecheck, full Vitest, build, 1,153 command paths, architecture boundaries at 24,326 CLI lines and 8,870 Studio lines, 1,490-file Docs drift, zero runtime dependency vulnerabilities, CLI/domain smoke, and all 10 install personas at 10/10. Receipt: `tmp/release-gate/amc-1472-final.json`.
- macOS universal, Linux x64, and Windows x64 desktop packages build and pass package verification.
- Playwright passes 55 tests with 2 intentional i18n skips; the focused homepage suite passes 6/6 after the final public copy update.
- Manual Studio review at 1280x720 and 390x844 shows all four bounded milestones, 1,153 CLI paths, no horizontal overflow, and no warning/error logs. This review exposed the stale service-worker contract, which was repaired and reverified before publication.
- Production revision, HTTPS, deployed bytes, live browser, and live release-gate evidence remain pending until the exact tested commit is pushed.
