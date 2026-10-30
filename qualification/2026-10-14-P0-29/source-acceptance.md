## P0-29 · Reconcile the 290-ID gap register (AMC-1496) into this plan

**Gate** G0 · **Epic** E00 Program management, gates and tracking · **Priority** High · **Due** 2026-10-30 · **Effort** M (1–3 person-weeks) · **Route** Agent-Doable · **Tags** Documentation

**Blocked by** none · **Blocks** GATE-G0 · **Old Linear issues** AMC-1496, AMC-1497, AMC-1498, AMC-1499, AMC-1500, AMC-1501, AMC-1502, AMC-1503, AMC-1504 (related) · **Plan refs** strategy "What's missing" (gaps G1–G26 replace the old register as the plan's gap list); survey of AMC-1496 and its G1–G8 children (5 Oct 2026)

### Why this matters

The August gap register holds 290 findings with evidence and line numbers, and its execution log claims fixes for most of them. Its "COMPLETE" summaries mix fixes with mitigations, relabels, withdrawals and deferrals. Without a row-by-row reconciliation, real residual defects (for example G6-07 key-history admission) either vanish or get redone. This issue gives every row a verified status and an owner in this plan, so the old tracker can close.

### Current state (verified on main @ 8f57ce63)

- `plans/amc-gap-register.md` (705 lines) has 290 unique IDs matching `^\| (G[1-8]-\d+[a-z]?) \|`: G1 50, G2 46, G3 32, G4 40, G5 37, G6 26, G7 24, G8 35 (289 original plus G8-17b). Columns: id, gap, location, evidence, severity, disposition.
- `plans/amc-gap-execution-log.md` (237 lines) has 107 rows starting `| G`. Some cover several IDs (`G1-16/17`, `G4-04/05 + 30 oversized files`). Raw statuses include `✅ DONE` (90 rows), `VERIFIED`, `UNTRACKED`, `SURFACED`, `N/A`, `⏭️ GUARDED`, `DEFER`, `NOT ATTEMPTED`, `❌ WITHDRAWN`, `⚠️ ACCEPTANCE UNRESOLVED`, `REOPENED 2026-09-08 — AMC-1525` and `NEEDS SID`.
- The log's per-group "Historical summary … COMPLETE" lines (`:74, :117, :131, :146, :163, :180, :195`) and the old "255/289" figure are history, not status.
- ID repair: the log's G7-13b (stale-count test) and G8-25b (scanner paths) are supplemental fixes. Original G7-13 (untested casebooks, eoc, executive, bootstrap, e2e) and G8-25 (embedded `qa/` service) are `ACCEPTANCE UNRESOLVED` (`:191`, `:215`).
- Examples: G5-18 licence is `SURFACED` (`b993093e`, flagged for Sid); G6-07 is reopened for AMC-1525; G6-17 is `NEEDS SID` (rotation proof); G2-45 is deferred to G4-02; G4-01 is `GUARDED` by the line-budget ratchet; G5-24/25 are withdrawn; G7-01/02 were not attempted.
- `plans/amc-state-ledger.md` records per-file status at `521b2136` (28 Aug). The local note `AMC_OS/RESEARCH/2026-09-08-dsh-pi/reconciliation.md` holds spot checks (G6-10 still HMAC, G8-02 defaults to DUAL_WRITE) but is not in a clone; copy any fact you use and re-check it on main.
- The cited commits checked so far (`4247e610`, `5eec4d9d`, `fba5824e`, `8c0a4d28`, `cb6bba21`, `7cfcb767`) are ancestors of main. The log contains 48 distinct backticked 8-hex strings.

### Goal

`docs/program/gap-register-reconciliation.json` and `.md` give all 290 IDs a verified status, evidence on main and a successor (plan key or paused group), checked by a test.

### Scope

**In:** the two output files, a coverage test, and the Linear close-out list for Sid. **Out:** fixing any row (the successor issues do that); the 16 June GAP-0xxx research stubs (a separate, already cancelled queue); AMC-1505 children (other close-out issues).

### Touch scope

New: `docs/program/gap-register-reconciliation.json`, `docs/program/gap-register-reconciliation.md`, `tests/gapRegisterReconciliation.test.ts`, `qualification/<date>-P0-29/`. Do not edit `plans/*.md`; they stay as history.

### Step-by-step

1. Branch `rtd/p0-29-gap-reconciliation`. Write the test first: the register parser and the spot checks under "Tests to add".
2. Extract the 290 rows (id, group, title, location, severity, register disposition) with the regex above. Expand grouped log IDs (`G1-16/17` gives G1-16 and G1-17) and attach each raw log status, commit and verification text.
3. Normalize each row to one status: `implemented` (fix on main; commit is an ancestor), `deleted`, `relabelled` (claim changed, capability not built), `withdrawn` (the finding was wrong; give the reason), `deferred`, `mitigated` (risk reduced, acceptance unmet, for example `GUARDED` or DUAL_WRITE) or `open`. Check the code on main for every implemented, deleted or relabelled row, and cite `path:line` at 8f57ce63.
4. Give every `deferred`, `mitigated` or `open` row a successor: a plan key, or `paused: AMC-1500` (G4) or `paused: AMC-1503` (G7). Known mappings: G1-48, G5-35, G8-20 → P1-01; G5-18 → D-04; G6-07, G6-08 → P0-09 (AMC-1525 stays linked); G6-01, G6-17, G8-06, G8-34 → P0-37; G6-10 → P1-08; G8-02 → P2-09; G2-21, G8-11 → P1-51 (DELETE if D-06 retires the gate); G1-16, G1-17 → P0-15; G4 decomposition → paused AMC-1500 or P2-29; G7 lint and Playwright → P0-33; other G7 rows → paused AMC-1503. List rows with no fitting key under "Needs a successor" for Sid.
5. JSON shape:
  ```ts
  type Row = { id: string; group: string; oldIssue: string; title: string; severity: string;
    registerDisposition: string; logStatus: string | null;
    status: "implemented" | "deleted" | "relabelled" | "withdrawn" | "deferred" | "mitigated" | "open";
    commits: string[]; evidence: string; successor: { planKey: string | null; paused: "AMC-1500" | "AMC-1503" | null };
    reason: string | null; notes: string };
  type Reconciliation = { schemaVersion: 1; verifiedOn: { main: string; date: string }; sources: string[];
    counts: { rows: number; byGroup: Record<string, number>; byStatus: Record<string, number> };
    rows: Row[]; supplemental: Row[]; linearCloseout: { duplicates: string[]; close: string[]; paused: string[]; keepLinked: string[] } };
  ```
  Put G7-13b and G8-25b in `supplemental` only.
6. The `.md` holds: summary counts by group and status; one table per group (ID, title, old status, new status, evidence, successor); "Needs a successor"; supplemental rows; and the close-out list. If Sid still uses Linear: AMC-1497, 1498, 1499, 1501, 1502 and 1504 become duplicates of this work, AMC-1496 closes, AMC-1500 and AMC-1503 stay paused, and AMC-1525 stays linked to P0-09.
7. Verify every cited commit with `git merge-base --is-ancestor <sha> origin/main`. Record results in `qualification/<date>-P0-29/receipt.json` (P0-01 format).

### Tests to add

`tests/gapRegisterReconciliation.test.ts`:

- the register yields 290 IDs with the group counts above, and the JSON `rows` IDs equal that set exactly (no extras, no duplicates);
- `supplemental` IDs are exactly G7-13b and G8-25b;
- every status is in the enum; implemented, deleted and relabelled rows have at least one 8–40 hex commit; withdrawn rows have a reason; deferred, mitigated and open rows have a plan key or a paused group;
- spot checks: G6-07 is open → P0-09; G5-18 is open → D-04; G7-13 and G8-25 are not implemented; G7-01 is paused under AMC-1503; G8-02 → P2-09;
- negative fixture: a copy of the JSON with G3-07 removed, or with an implemented row lacking a commit, must fail the same assertions.

Mutation check: drop the exact-set comparison; the "G3-07 removed" fixture must then pass, proving the check matters. Restore it and record this in the PR.

### Commands

```
npx vitest run tests/gapRegisterReconciliation.test.ts
node -e 'const r=require("./docs/program/gap-register-reconciliation.json");console.log(r.counts)'
node -e 'const r=require("./docs/program/gap-register-reconciliation.json");for(const c of new Set(r.rows.flatMap(x=>x.commits)))console.log(c)' | while read c; do git merge-base --is-ancestor "$c" origin/main || echo "NOT ON MAIN $c"; done
npm run typecheck:tests && npm run lint && npm test && npm run check:docs-drift
```

### Acceptance criteria

- The JSON has 290 rows plus 2 supplemental rows, and the test passes.
- No row cites a commit that is not an ancestor of main (the loop prints nothing).
- Every non-final row names a plan key or a paused group; the "Needs a successor" list is empty or answered by Sid in a comment.
- The `.md` contains the Linear close-out list and states that the historical COMPLETE figures are not status.
- Receipt committed under `qualification/<date>-P0-29/`.

### Evidence to attach when closing

PR link, merged SHA, test output, status counts by group, and the receipt path.

### Dependencies

- **Blocked by:** none. P0-01 lands first and supplies the receipt format and `docs/program/`.
- **Blocks:** GATE-G0 (the old register must not hold open work the plan does not track).
- **Related old issues:** AMC-1496 closes on this; AMC-1497, 1498, 1499, 1501, 1502, 1504 are superseded; AMC-1500 (G4) and AMC-1503 (G7) stay paused; AMC-1525 continues under P0-09.

### Risks and gotchas

- Log IDs were reused for different findings; match the log's verification text to the register row, not just the ID.
- `DONE` with a commit is not proof: confirm the fixed behaviour on main today.
- Relabels are not implementations (G6-12 relabelled zero-knowledge claims; it built no zero-knowledge proof system).
- Do not cite `AMC_OS/` paths as evidence; copy the fact and cite main.
