---
"agent-maturity-compass": minor
---

A4 Forge preview groundwork (P1-56): the project store, its schema, contracts and identity land with no route or page yet, so no A4 surface is reachable.

- Ledger migration 13 adds twelve dormant `a4_*` tables the next time a workspace's evidence ledger is opened for writing: `a4_projects` (the one mutable head; a trigger refuses changes to its identity columns, and a partial unique index allows one active project per agent), the append-only `a4_transitions`, `a4_revisions`, `a4_gates`, `a4_decisions`, `a4_members`, `a4_comments`, `a4_evidence_refs`, `a4_releases` and `a4_deployments`, plus `a4_requests` (request deduplication) and `a4_effects` (effect liveness). An evidence ref in the `observed` lane must carry claim kind `observed`, an observed trust tier and a runtime-observation or executed-test method; the `verified` lane needs `independently_reviewed`.
- Fifteen A4 contracts are published as JSON Schemas: `spec/schemas/v1/a4-*.schema.json` for the project, revision, gate, decision, transition, intent, readiness, gate policy, integration claim, package, release, deployment receipt, rollback receipt, value claim and conformance statement.
- `/api/v1/a4` and every path under it are native Studio paths: requests pass the same Host, Origin, intent-header and CSRF admission as native tasks, and the console's `apiNativeRequest` accepts them. No A4 route exists yet, so they still answer not found.
- New sign kind `A4_RECORD` (in both sign-kind lists, not in `requireNotaryFor`) and artifact kind `a4-stage-output`. Evidence with `meta.source: "a4-store"` is classified as a manual producer, so A4 rows are `SELF_REPORTED` and cannot carry an observed tier.
- `deleteVaultSecret` removes one vault secret and is refused while the vault is locked. User records in `users.yaml` accept an optional `createdBy` (`{ principalKey, admission }` or null); existing files parse unchanged, and a missing creator is treated as self-provisioned.

A4 rows are signed with the workspace's own keys: a local audit trail, not a portable verdict. Comment bodies are stored encrypted per project outside the ledger; destroying a project's key makes them unreadable only once every backup older than the destruction has been rotated.
