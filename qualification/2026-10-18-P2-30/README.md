# P2-30 dependency preflight — 2026-10-18

Status: **blocked before implementation**. This is a dependency receipt, not an overlay qualification or a ready-for-landing handoff.

Clone: `/Users/sid/AgentMaturityCompass-worktrees/codex-7f/p2-30`; branch: `codex/p2-30-technology-overlay`; source and `int`: `b9866b0fa29d2efdb7a8f8c176cdf12e1af959d0`.

The binding assignment requires the P2-30 specification and prohibits editing P1-09's schema or P1-10's compiler. Its reserved-path rule says: “If an item needs a reserved path, stop and write the exact path and reason in RESERVATIONS.md first.” The program contract also requires stopping on a missing dependency and reporting incorrect issue facts without silently changing scope.

## Reproduced blockers

- `src/catalog/loader.ts:183` admits layer packs and controls; lines 198–201 admit canonical fixtures and reject every other path. The requested `catalog/stations/technology/**`, `catalog/instruments/**` and station-prefixed fixtures produce `CAT_STRAY_FILE`. The probe records six independent rejected paths.
- `src/catalog/schema.ts:140` requires fixture references under `<controlId>/<positive|negative>/<name>.json`. Its strict pack schema at line 255 rejects instrument, profile and promotion metadata. `src/catalog/validate.ts:52` and line 113 independently require canonical fixture and control locations. Renaming control IDs and layer directories alone cannot encode the required ancillary records.
- Current source has 75 Technology pack questions and zero `technology-deep-*` questions. The spec requires 77 and 16. Ten specified pack disposition IDs are absent. `TECH-CI-15` asks about GPAI documentation; `TECH-PP-15` asks about Data Act fair contracting. Neither can be assigned the spec's meaning without inventing source history. The question freeze remains intact.

`preflight.json` records exact questions, missing paths, validation issues, baseline catalog digest, HEAD and `git status --porcelain`. Probe files are isolated under this receipt directory; no production catalog file was changed. The existing catalog validates with zero errors. Before handoff, Claude's integration tip advanced to `3c23d1c504f3b0b8b9b2defc668ab39611bf8074` for P1-38. An explicit two-revision diff confirms no change in `src/catalog/`, the Technology question registry, the deep-question registry or the station map. `integration-blocker-path-diff.txt` is empty. This branch remains based on its original `int`; no merge was performed.

## Verification

- Node `v22.23.3`, pnpm `10.33.0`, local macOS arm64; not CI.
- `pnpm install --frozen-lockfile`: exit 0 (`install.log`).
- `pnpm build`: exit 0 (`setup-build.log`). These establish the unchanged baseline only.
- `node qualification/2026-10-18-P2-30/preflight.mjs`: exit 0; confirms the blockers, rather than an implemented overlay.
- D-15 planned receipt paths and final `int` scan: `none`.
- No Vitest, mutation, full-suite, citation or implementation qualification runs occurred. Typecheck, typecheck:tests, lint, counts, docs-drift, freeze, architecture-boundaries, gates, schemas, api-ref, threat-model, clean-source, duplicates and dead-code were not run as standalone checks: implementation stopped at the contract dependency.
- Qualification receipt validation is recorded in `qualification-check.log`.
- Fresh clone had an empty status before setup. Preflight changed no tracked source. All later changes belong to this receipt directory.
- Graphify: historical root graph queried without modification; it contains no `src/catalog/` nodes. Installed CLI 0.9.74 differs from the repository refresh pin 0.9.56. No graph was refreshed; current source supplied the evidence.

## Integrator actions

Claude must provide an admitted storage/validation contract for station metadata and no-URL unverified instrument records, or release the exact schema/loader/validator changes needed. Reconcile the spec's disposition inventory against this `int`, or supply the intended integration revision. Do not weaken the catalog's stray-file guard or invent frozen questions.

After that decision, continue P2-30 in this clone, re-read `int` and reservations, write the failing overlay test, then draft the eight controls and decisive fixtures. Runtime fixture adapters may exercise marking, IoT and CRA oracles, but unavailable production enforcement remains `none` and `not_evaluated`.

Needs-Sid placeholders remain: D-14 named Technology reviewer and P1-29 platform/content-safety partner. No reviewer, review record, approval or external contact was created. P3-14 and later items have not started. Existing worktrees and the halted qualification run remain untouched.
