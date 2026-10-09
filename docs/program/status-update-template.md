# Weekly program status

```text
STATUS · <YYYY-MM-DD> · Gate <Gx> due <date> · Health: On track / At risk / Off track
Gate progress: <n> of <N> gate issues Done · <n> In review · Blocked: <keys>
Metrics (node scripts/program-metrics.mjs --markdown at <short SHA>):
<table>
Top 3 risks: 1. <risk> · impact · mitigation · owner  2. …  3. …
Decisions pending: <D-xx> · decide by <date> · blocks <keys>
Done last week: <KEY> · PR · merged SHA
Next week: <KEY> · owner
Asks for Sid: <specific asks>
```

Health is **On track** when every gate issue due this week is Done or In review and no Urgent issue has been Blocked for more than 3 working days. Health is **Off track** when the gate date cannot hold without cutting scope. Otherwise it is **At risk**. Cut workflows and jurisdictions, never acceptance criteria.

The integrator posts the completed note as a comment on the plan document's Plan tab each Monday and adds a one-line summary to the Issues index. The first generated update is due Monday 19 Oct 2026. Posting and measurement runs remain deferred; this coding-only slice does not create a status result or qualification claim.

## Canonical inputs

The current Plan attachment, `/Users/sid/.codex/attachments/5e9e28b6-252a-448a-a772-f2b7a3b13e67/Pasted text.txt`, is the metric source. Its “Metrics” table at lines 2065–2193 contains **15 rows**, including the A4 row added to the strategy's original 14. The earlier P0-41 writeup and the Plan's line 1951 still say 14; the complete current table governs.

Targets in `metrics.json` are copied verbatim as strings. Their columns are “Oct 2026”, “G0 (Nov 2026)”, “G1 (Jan 2027)”, “G2 (Apr 2027)”, “G3 (Sep 2027)” and “Single maintainer (Sep 2027)”. The `owner` field preserves the table's “Moved by” cell. These targets are proposals to agree; only Sid changes them. `targetColumn` remains `funded` until D-01 chooses the single-maintainer scope.

The A4 row is “A4 projects taken Aspire → Activate with bound approvals from two distinct users”. Its G3 and single-maintainer target cells are the source's explicit “—”; they are unspecified targets, not zero. Every other metric target cell is present. Its current value remains “not measured” until a qualification receipt supplies evidence. No target cell is a current measurement.

Only the critical-gap metric has a registered source: `{ "type": "gaps" }`. Its count describes the declared register state, not a fresh qualification result. Other metric sources remain `null`, and `metrics-manual.json` begins with no entries. Missing producers, reports, jobs or manual evidence must display “not measured”, never a substituted zero.

Future repo sources may register the P0-41 source variants: `gaps`; `vitest` with exact test files for `cli`, `reports`, `mcp`, `api` and `studio`; `ci-matrix` with a workflow and job; or `json` with a committed path and numeric JSON pointer. A CI matrix counts configured operating-system declarations only; it does not prove shell containment. Manual entries require a metric ID, value, dated `asOf`, source and recorder.

All gap rows begin open, with `closedBy`, `closingEvidence` and `closedAt` set to `null`. Source-only merged work or an In review status cannot close a gap. Later closing evidence must identify a normalized relative `qualification/` path and the full merged commit SHA in `{ "path": "...", "mergedSha": "..." }`.

The template follows the issue `scratchpad/plan/issue-P0-41.md` and the current Plan's weekly-status rules at lines 1971–1982. Source qualification, tests, measurement execution and Monday posting remain pending.

## Gap source and mapProvenance

The gap cells come from “AMC Strategic Plan — Gaps, Competitors & Regulated-Industry Packs”, document `df2f49d2-c861-4a27-b368-e7f35526b7c1`, tab `7ac61d95-002a`, “What's missing” block `mg4sf4j6wvz.66975`, revision 132. Claude extracted the exact table on 9 Oct 2026 to `scratchpad/plan/strategy-gaps-and-metrics.md`. The [original artifact](https://claude.ai/artifact/UZUAqpS3bmo2b5dxKz1E72) is its external source.

The register preserves all 26 titles, severities, evidence and fix cells verbatim, including Markdown code spans. The source orders G21–G25 before its Medium rows G18, G26, G19 and G20; that order is retained. It has 7 Critical, 15 High and 4 Medium gaps. These are historical source findings, not a refreshed assessment of current source or release behavior.

The extraction's original success-metrics table, block `mg4sf4j6wvz.155945`, has 14 rows. Those cells agree with the current Plan's first 14 rows; the current Plan supplies the additional A4 row.

`mapProvenance`: `ownerKeys` starts with the issue P0-41 step 2 map. It was reconciled against the mapped issues' “Plan refs” lines in `scratchpad/plan/issue-P*.md` and D-04 in `scratchpad/plan/decisions-full.md`. Supporting mappings to named strategy sections remain included; a mapped owner is not proof that a gap is closed. Explicit gap references add:

- P0-36 to G1, G2, G3 and G16, alongside its existing G4 mapping.
- P0-28 to G15 and G20, alongside its existing G11 mapping.
- P1-07 to G25, alongside its existing G5 mapping.

D-04 explicitly cites G6. No gap was marked closed during this source slice, and no source findings were refreshed into measured values.

The script checks closing-evidence structure and local file availability; it does not verify receipt signatures or prove that a declared SHA was merged. Gap counts describe the register's declared state. These checks cannot replace qualification receipts or the integrator's review.

A supplied surface report can show a known passed count with `partially_measured` status and separate passed, failed and not-measured surface states. An empty registration or missing/pending file result never passes vacuously. With no evaluable surface, the metric stays not measured. CI matrix `include`/`exclude` combinations and dynamic expressions stay pending rather than using an approximate workflow expansion.
