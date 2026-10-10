# a4-record normative fixtures (P1-63)

Seven `amc.a4-record/v1` exports of A4 projects (`spec/schemas/v1/a4-record.schema.json`), two valid and five
negative, for any verifier of the "A4 project record" rules in `spec/ACCEPTANCE_RULES.md`. A second verifier must
reach the verdict listed below for each file. They move to `spec/fixtures/v1/a4-record/` when P1-06 creates that
directory.

Every JSON column (`body_json`, `spec_json`, `request_json`, `decision_json`, `meta_json` and the rest) is the exact
text the ledger stored, so every digest recomputes from these bytes. Never re-serialize a column before hashing it.
`publicKeys` identify the signers only; admit them from the trust list below, never from the record.

## How they were made

One temporary workspace with three local users in one signing plane: `alice` (OWNER), `bob` (APPROVER, OPERATOR) and
`carol` (APPROVER). Its signed approval policy requires two distinct approvals for `WRITE_LOW`, the action class of the
`aspire.direction` gate. AMC's own store and gate functions wrote every row (`src/a4/a4Store.ts`, `src/a4/a4Gates.ts`),
except the two decisions named "written past the gate rules" below. Those went through `store.transition` without
`recordDecision`'s checks: they stand in for a buggy or hostile writer that holds the workspace keys, which is exactly
what a verifier exists to catch. Keys and ids are random per generation, so the bytes are not reproducible; the
verdicts are. The generator is a scratch script and is not committed.

Project one, through Aspire's direction gate, for the agent `default`:

| seq | kind | by |
| --- | --- | --- |
| 0 | CREATED | alice |
| 1, 2 | MEMBER (bob as builder and approver, carol as approver) | alice |
| 3 | REVISION 1 (`aspire`) | alice |
| 4 | EVIDENCE_REF (`ledger_event`, a SELF_REPORTED row of agent `default`) | alice |
| 5 to 7 | STEP asked → understood → explained → proposed | alice |
| 8 | GATE_REQUESTED `aspire.direction` (2 approvals required) | alice |
| 9 | GATE_DECIDED approve | bob |
| 10 | GATE_DECIDED approve | carol |
| 11 | GATE_CONSUMED | alice |
| 12 | STEP direction_approved → built | bob |
| 13 | STEP built → reviewed | alice |
| 14 | GATE_REQUESTED `aspire.completion` (bob is an excluded key: he built revision 1) | alice |
| 15 | GATE_DECIDED approve, written past the gate rules | bob |

Project two, for the agent `agent-b`, repeats seq 0 to 9 and adds seq 10: an approval by carol whose
`request_digest` (and the decision record's `requestDigestSha256`) names a request this gate never had, written past
the gate rules.

## Expected verdicts

Under the fixture trust list (`trust/amc-trust-list.json`, root `trust/trust-roots.json`), which pins the workspace
monitor key for `ledger-row` and `receipt` and its auditor key for `artifact-seal`:

| File | Made from | integrity | scope | freshness | completeness | satisfaction |
| --- | --- | --- | --- | --- | --- | --- |
| `valid.json` | project one at seq 9 (after the first APPROVE) | pass | pass | pass | pass | pass |
| `second-vote-lands.json` | project one at seq 11; gate `binding_digest` and `readiness_sha256` equal those in `valid.json` | pass | pass | pass | pass | pass |
| `builder-approved-own-revision.json` | project one at seq 15 | pass | pass | pass | pass | fail: `SOD_VIOLATION` (`builder_not_completion_approver`) |
| `stale-approval.json` | project two at seq 10 | pass | pass | fail: `DECISION_NOT_BOUND` | pass | pass (the stale decision counts for nothing) |
| `dangling-evidence-ref.json` | `valid.json` without the ledger row the seq 4 ref names | pass | pass | pass | fail: `REF_DANGLING` | not-evaluated |
| `deleted-evidence-ref.json` | `valid.json` without the `a4_evidence_refs` row of seq 4 (no transition touched) | fail: `A4_SIDE_ROW_MISMATCH` | pass | pass | fail: `A4_SIDE_ROW_MISMATCH` | not-evaluated |
| `tampered-transition.json` | `valid.json` with one hex digit of the seq 3 `specDigest` changed in `body_json` | fail: `A4_CHAIN_INVALID` (body digest mismatch) | not-evaluated | not-evaluated | not-evaluated | not-evaluated |

`tampered-transition.json` reports `INTEGRITY_FAILED` for scope, freshness, completeness and satisfaction under any
trust list, because integrity is checked first. With no trust list, the other six files report integrity only:
`issuerAdmission: fail` (the keys are not pinned), the ledger unanchored, and scope, freshness, completeness and
satisfaction `not-evaluated` with `ISSUER_NOT_ADMITTED`. A passing satisfaction lists each gate still open with its
count (`GATE_OPEN`, for example `1 of 2 approvals` in `valid.json`): a pass never states that an open gate met its
quorum. A pass here is evidence about the record's bytes and its gate rules, never about the agent:
every decision is `self_reported`, and SoD-distinct users in one workspace are not independent reviewers.

AMC reports these through `verifyA4Bundle` (`src/a4/a4Verify.ts`), which takes either one of these files or an
`.amcbundle` whose signed manifest lists an A4 slice. Turning each row of the table into a test is recorded as P2-35
debt, together with one bundle case no file here covers: a bundle for agent X whose `a4/index.json` and manifest list a
verified record of agent Y, re-signed by an admitted auditor key, must report scope `fail` with
`A4_SCOPE_AGENT: record <projectId> is not about the bundle's agent`.
