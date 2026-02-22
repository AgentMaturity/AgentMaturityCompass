# AMC Wave 4 Integration Audit

Date: 2026-02-22  
Scope: webhook/events, plugin/adapter extensibility, coupling, SDK lifecycle, data portability, integration patterns, enterprise identity, and API consumer limits.

## Executive Summary

AMC has strong integration primitives (signed configs, queue-backed delivery, IdP support, export/backup tooling), but several critical gaps previously reduced practical integration reliability/extensibility.  
This pass remediated the top five blockers and added integration tests for webhook/event behavior.

## Top 5 Blockers Fixed

1. **Dispatcher reliability was effectively single-round in practice**  
   - Fixed by making delivery rounds configurable via integration policy (`maxRounds`) instead of hard-coding one round.  
   - Files: `src/integrations/integrationSchema.ts`, `src/integrations/integrationStore.ts`, `src/integrations/integrationDispatcher.ts`.

2. **Webhook retry policy was not channel-configurable end-to-end**  
   - Fixed by threading per-channel retry policy into queue processing (`deliveryPolicy`) and honoring defaults/overrides.  
   - Files: `src/integrations/integrationDispatcher.ts`.

3. **Dead-letter handling was fragmented and not consistently journaled**  
   - Fixed by unifying on the existing delivery journal/dead-letter store and recording dead letters from dispatcher outcomes.  
   - Files: `src/integrations/integrationDispatcher.ts`, `src/integrations/integrationsCli.ts`.

4. **Plugin adapters were largely theoretical for runtime execution**  
   - Fixed by adding adapter catalog resolution that merges built-in + plugin-provided adapters, and using it in CLI/runner paths.  
   - Files: `src/adapters/catalog.ts`, `src/adapters/adapterCli.ts`, `src/adapters/adapterRunner.ts`.

5. **SDK deprecation/version context lacked runtime visibility and explicit policy**  
   - Fixed by adding SDK identity headers and deprecation metadata handling in SDK clients, plus explicit deprecation policy documentation.  
   - Files: `src/sdk/amcClient.ts`, `src/sdk/python/amc_client.py`, `src/sdk/go/amc_client.go`, `docs/SDK.md`.

## 1) Webhook/Event System Audit

### Current state
- Delivery is queue-backed (`integration-delivery.sqlite`) with state transitions (`PENDING`, `DELIVERED`, `DEAD_LETTER`).
- Per-attempt retry/backoff exists in `deliverWebhookWithRetry`.
- Ordered processing is enforced per channel via queue order and dispatch locks.
- Delivery journals/dead letters are persisted and exportable.

### Reliability verdict
- **Retries:** present and now policy-configurable per channel.
- **Dead letters:** present and now consistently recorded.
- **Ordering:** present (per channel), with sequence propagated through queue + headers.

### Remaining risk
- Ordering guarantees are workspace+channel scoped and process-coordinated through DB/locks, but there is no external broker-level exactly-once guarantee.

## 2) Plugin/Adapter Extensibility Audit

### Before
- Plugin manifests allowed `adapter` assets, but runtime CLI/runner resolution depended on built-ins in several paths.

### After
- Adapter catalog now resolves available adapters from both built-ins and installed plugin assets.
- Configure/env/run/init-project now use catalog resolution.

### Verdict
- **Now practically extensible**, not just schema-declarative.

## 3) Tight Coupling Audit

### Findings
- Some integration behavior is still tightly coupled to workspace-local runtime state (vault, signed config files, local Studio lifecycle).
- Adapter execution remains coupled to `studioStatus`/gateway availability (intentional for governance, but operationally strict).

### Impact
- Integration extension is safer but still opinionated toward AMC-managed runtime boundaries.

## 4) SDK Versioning & Deprecation Audit

### Findings
- SDK packages are versioned, but lifecycle signaling to the bridge was previously weak.
- Explicit deprecation policy text was missing.

### Changes
- Added `x-amc-sdk-name` and `x-amc-sdk-version` headers (Node/Python/Go).
- Added deprecation metadata propagation in SDK responses.
- Added policy section in `docs/SDK.md` (Sunset/Deprecation headers, migration window, major-version removals).

## 5) Import/Export Data Portability Audit

### Strengths
- Delivery journal export, bundle export/verify, backup/restore, transparency export, federation import/export, benchmark import/export.
- Verifier evidence export supports JSON/CSV/PDF.

### Gap
- Portability is broad but distributed across many commands/schemas; onboarding remains complex for non-expert operators.

## 6) Missing Integration Pattern Audit

### Present
- **Batch:** `dispatchIntegrationEventsBatch` and multiple queue/batch subsystems.
- **Streaming:** SSE and streaming passthrough paths exist in core services.
- **Async callbacks:** webhook delivery/retry primitives exist.

### Gap
- Callback pattern standardization is still split across modules (integration queue vs product callback abstractions).

## 7) Enterprise Identity Integration Audit (SAML/OIDC)

### Findings
- OIDC auth code + PKCE implemented.
- SAML start/ACS flows implemented with assertion verification.
- SCIM provisioning implemented.
- Signature-backed identity config and role mapping present.

### Verdict
- **Enterprise IdP integration is materially complete** for common SSO provisioning scenarios.

## 8) Rate Limiting & Quota Audit

### Findings
- Studio route class limiters exist (`auth`, `write`, `health`, `api`).
- Lease quotas are enforced in gateway path for LLM calls.
- Budget policy enforcement exists at workspace/agent level.

### Residual risk
- Rate-limit semantics are split across gateway/studio/bridge modules and can be hard to reason about globally.
- Cross-instance distributed quota coordination is not explicit in current local-first architecture.

## Added Integration Tests

New tests in `tests/integration/webhookEventSystem.test.ts` cover:

- retry behavior with ordered sequence continuity,
- dead-letter creation when retries are exhausted,
- concurrent dispatch ordering by channel sequence,
- sequence persistence and journal export behavior.
