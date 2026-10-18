# Pack admission criteria v1

> **Experimental checker (P1-33).** No pack is admitted as reviewed today: every catalog record is `experimental`, the
> D-08 expert roster does not exist, so no review record can count, and no rule for `qualified` is defined. A met record
> criterion shows that signed records exist, not that the reviewer was right. Nothing here is a certification or a
> compliance claim.

A pack may claim `reviewed` support only when it meets all ten admission criteria (strategy, "Pack admission
criteria"). `amc catalog check` checks every pack's declared support against them, writes nothing unless asked, and
never edits a pack: promoting a pack is a human-reviewed change to its YAML. Code: `src/catalog/admission/`.

## The ten criteria

Each criterion is checked over the pack's mandatory controls unless stated, and is `met`, `not_met` or
`not_evaluated` (the check could not run here). Every finding has a code.

| # | Criterion | Kind | Checks | Codes |
|---|---|---|---|---|
| 1 | Manifest and reproducible digest | mechanical | id, semver version, a `compilerCompat` range the running compiler (`amc` version) satisfies, publisher, a maintainer, an SPDX licence id; two fresh `loadCatalog()` runs and the lock built from them give one pack digest | `ADM1_ID_INVALID`, `ADM1_VERSION_INVALID`, `ADM1_COMPILER_INCOMPATIBLE`, `ADM1_PUBLISHER_MISSING`, `ADM1_MAINTAINER_MISSING`, `ADM1_LICENCE_MISSING`, `ADM1_DIGEST_NOT_REPRODUCIBLE`, `ADM1_LOCK_UNAVAILABLE` |
| 2 | Citations | mixed | clause and edition, a `dateNote` for a null date, the P1-09 citation rules at reviewed strictness (official host, a resolving S5 `registerId`, not superseded, retrieval inside the review window), `retrieval.state: verified` with a hash; each declared legal review shows `recorded` only where effectiveSupport let the control's support stand, which needs a credentialed legal reviewer who did not author it (P1-34) | `ADM2_CITATION_INCOMPLETE`, `ADM2_CITATION_INVALID`, `ADM2_CITATION_UNVERIFIED`, `ADM2_LEGAL_REVIEW_MISSING`, `ADM2_LEGAL_REVIEW_UNVERIFIED` |
| 3 | Applicability | mechanical | every predicate parses and uses vocabulary terms; reasons given; empty `exclusions` only with `predicate: { always: true }` | `ADM3_PREDICATE_INVALID`, `ADM3_REASONS_MISSING`, `ADM3_EXCLUSIONS_MISSING` |
| 4 | Binding | mechanical | an enforcement point with `points`, or a manual duty with duty, owner role, cadence and evidence of performance | `ADM4_BINDING_POINTS_MISSING`, `ADM4_MANUAL_DUTY_INCOMPLETE` |
| 5 | Tests | mechanical | at least one test; each oracle names what it observes; type and oracle agree (below) | `ADM5_TEST_MISSING`, `ADM5_ORACLE_UNOBSERVED`, `ADM5_ORACLE_MISMATCH` |
| 6 | Negative fixtures | mechanical, executes | negative fixtures of classes stale, replayed, contradictory, cross_tenant and empty; every fixture runs and matches `expected`; no negative fixture passes or is allowed (`falseMandatoryPasses` 0) | `ADM6_NEGATIVE_CLASS_MISSING`, `ADM6_FIXTURE_MISMATCH`, `ADM6_FALSE_MANDATORY_PASS`, `ADM6_HARNESS_NOT_REGISTERED` (not evaluated) |
| 7 | Evidence contracts | mechanical | each contract names an `available` producer, binding fields with `controlId` and a scope field, freshness and sampling; `invalidatedBy` is non-empty | `ADM7_EVIDENCE_MISSING`, `ADM7_PRODUCER_UNKNOWN`, `ADM7_PRODUCER_NOT_AVAILABLE`, `ADM7_BINDING_FIELDS`, `ADM7_FRESHNESS_SAMPLING`, `ADM7_INVALIDATION_MISSING` |
| 8 | Unknown facts fail closed | mechanical, executes | with every profile fact unknown, P1-10 never decides a control not applicable (it stays unresolved or applies) and P1-11's evaluator gives `not_evaluated`; a control bound to approvals, deletion or egress has an `unknown_authority`, `unknown_hold` or `unknown_residency` fixture, and every unknown-fact fixture gives deny or `not_evaluated` | `ADM8_UNKNOWN_FACTS_DECIDED`, `ADM8_EVALUATOR_NOT_FAIL_CLOSED`, `ADM8_UNKNOWN_FIXTURE_MISSING`, `ADM8_UNKNOWN_FIXTURE_PASSED`, `ADM8_UNKNOWN_FIXTURE_UNEXPECTED`, `ADM8_COMPILER_ERROR`, `ADM8_HARNESS_NOT_REGISTERED` (not evaluated) |
| 9 | Sign-offs | record | the pack version's review records (subject kind `pack`, bound to the pack digest) give a domain lead credentialed for one of its stations, a credentialed legal reviewer and a risk owner who are three distinct people, with no objection; a record naming a non-human signer is refused; every mandatory control's declared support stands under effectiveSupport, so an AI-drafted control has a human approval confirming the draft, and its `approvedBy` names a reviewer whose record counted | `ADM9_SIGNOFF_MISSING`, `ADM9_SIGNOFF_NOT_DISTINCT`, `ADM9_SIGNOFF_REJECTED` (warning), `ADM9_AGENT_SIGNER`, `ADM9_OBJECTION`, `ADM9_REVERIFY_OPEN`, `ADM9_AI_DRAFT_UNAPPROVED`, `ADM9_CONTROL_UNREVIEWED` |
| 10 | Stewardship | record | `stewardship.partner` (a name; `confidential` needs a signed partner attestation reference, which the pack format cannot carry yet), `updatePlan` naming an owner and funding (`owner: ...; funding: ...`), `triageTargetDays`, and `coverageDoc`: a regular file inside the repository with a heading "Unsupported behaviour". Presence, not truth | `ADM10_PARTNER_MISSING`, `ADM10_PARTNER_ATTESTATION_MISSING`, `ADM10_UPDATE_PLAN_INCOMPLETE`, `ADM10_TRIAGE_TARGET_MISSING`, `ADM10_COVERAGE_DOC_MISSING`, `ADM10_COVERAGE_SECTION_MISSING` |

`ADM_TRUST_UNAVAILABLE` leaves criterion 2 or 9 not evaluated when review records exist but this machine's operator
trust (`trust/trust-roots.json` and the signed trust list in the AMC home) does not load. A missing record is not met.

Test types and the oracles that observe their effect (criterion 5):

| Test type | Oracle |
|---|---|
| `runtime_enforced` | `enforcement_receipt` or `ledger_state` |
| `executed_adversarial` | `external_observer` or `system_of_record` |
| `drill` | `ledger_state` or `system_of_record` |
| `configuration_check` | `signed_config` |
| `document_review` | `human_assessor` |

### Mechanical and record parts

Criteria 1, 3 to 8 read the records and run fixtures. Criteria 2 (its legal-review part) and 9 are record checks built on
P1-34 ([GOVERNANCE.md](GOVERNANCE.md)): `effectiveSupport` for each control and `packSignoffs` for the pack verify review
records at the server's clock against trust loaded only from the operator's AMC home, with the same steps (pinned
`catalog-review` key, reviewer from the key, D-08 roster, independence from the authors, F5, currency). The checker never
reads a declared review status, expert, approver or legal reviewer except through those results, and never creates a
record. Criterion 10 is a presence check.

### Fixture runs

Evidence fixtures (`setup.harness: "evidence"`) run through P1-11's `evaluateControl` in process. Guard fixtures
(`lease`, `tool_allowlist`, ...) drive real enforcement points in temp workspaces; those harnesses live in the test
suite (tests/catalog/l0/), so `amc catalog check` registers none. A guard fixture nothing ran leaves criteria 6 and 8
`not_evaluated`, never met. `checkPackAdmission({ harnesses })` takes harnesses by `setup.harness` name for callers that
have them. P1-10 and P1-11 are both present; `fixtureRun` would be null only without P1-11.

## Decision

| Declared support | Decision |
|---|---|
| `experimental` | admitted (as experimental only) when the pack passes P1-09 validation; the criteria are still reported, and the reasons say "experimental, unreviewed" until criterion 9 is met |
| `reviewed` | admitted only when the pack passes validation and all ten criteria are met; any `not_met` or `not_evaluated` refuses, with reasons |
| `qualified` | refused with "qualification rule not defined": the strategy gives `qualified` the same ten criteria and no further rule, so it waits for Sid's decision |
| `retired` | reported, never admitted to new plans |

`maxAdmissibleSupport` is `reviewed` when the pack validates and all ten are met, otherwise `experimental`; it is capped
at `reviewed`.

## The report

`amc catalog check --write` writes `catalog/admission/<pack-id>-<version>.json` (`AdmissionReport`, schema in
`src/catalog/admission/types.ts`): `reportVersion: 1`, `checker`, `checkedAt`, the catalog and pack (id, version,
digest, declared support), the ten criteria in order (status, items `checked`, sorted findings, evidence: lock rows,
review record digests, the fixture run and coverage document hashes), `fixtureRun` (`mandatoryControls`, `fixtures` run,
`falseMandatoryPasses`, `failures`), `maxAdmissibleSupport`, `decision`, `reasons` and `digest`: sha256 of the canonical
report without `checkedAt` and `digest`, so two runs over the same inputs give the same digest. Reports sit outside every
catalog digest and the changelog. A report's verdict depends on the machine's operator trust and roster; reports for
experimental packs are informational.

## Gating

`loadCatalog({ enforceAdmission: true })`, which `amc catalog compile` and plan activation use, reads the committed
report of each pack declaring `reviewed` or `qualified`, checks that it parses, that its digest verifies, that it covers
the pack's current digest (recomputed) and that it admits the declared support. A missing, malformed, stale or refusing
report downgrades the pack to `experimental` in memory with warning `ADM_SUPPORT_DOWNGRADED`; the YAML is never edited,
and the lock then records the pack as experimental. A committed report is the checker's last verdict, not a trust
anchor: gating only lowers support, and a reviewed row in a plan still needs promotions from verified review records.

## Commands

```
amc catalog check [--pack <id>] [--catalog <dir>] [--json] [--write]
npm run check:catalog-admission          # CI, after the build
```

Exit 0 when every pack's declared support is admissible, 1 otherwise. The check fails a reviewed or qualified claim a
pack does not meet, a pack failing P1-09 validation and a malformed report under `catalog/admission/`; a stale report or
one for a pack version no longer in the catalog is a warning. An experimental, unreviewed draft is reported and never
fails the check for being experimental.

## How a pack moves from experimental to reviewed

1. The content meets criteria 1 and 3 to 8 (`amc catalog check --pack <id>` lists what is open).
2. Citations are fetched and hashed, and each control's review records are signed by named reviewers (P1-34, D-08).
3. The domain lead, legal reviewer and risk owner sign the pack version's records over its digest; stewardship is filled
   in and the coverage document has its "Unsupported behaviour" section.
4. A human-reviewed change sets the pack's and controls' `support: reviewed`, and `amc catalog check --write` commits the
   admitting report in the same change (after any change to the pack, run it again: a stale report downgrades it).

## Not done

- No reviewer exists (D-08), so no pack can be admitted as reviewed; this needs Sid.
- `qualified` has no rule beyond the ten criteria; Sid decides.
- The repository commits no `catalog.lock.json`, so criterion 1 compares two loads and the lock built from them; a
  plan's own lock is checked by `amc catalog compile --lock`.
- A confidential partner's signed attestation has no field in the pack format yet.
- Guard harnesses are not registered outside the test suite, so packs with guard fixtures show criteria 6 and 8 not
  evaluated in `amc catalog check`.
