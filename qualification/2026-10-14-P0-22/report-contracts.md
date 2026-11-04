# P0-22 report contracts — 14 October 2026

The remaining 12 spec-listed report builders now have tests against actual rendered output. Changes are limited to ten existing test files and ten new snapshot files. Fifteen new test cases were added; existing relevant cases gained claim/legend assertions. No production source, fleet test, shared CLI, registry, REPL, eligibility rule, budget, or freeze check was edited by this subtask.

The first contract run passed all 115 cases. Snapshot seeding then added 22 new entries without updating or removing an existing expectation. A fresh normal run without `--update` passed all 115 cases and matched all 22 snapshots, with zero failed, pending, todo, unmatched, unchecked, added, or updated entries. The final log reports 5.04 seconds.

| Builder | Test file | Acceptance proof |
|---|---|---|
| generateReport (Markdown) | tests/diagnosticReportStatus.test.ts | Actual report labels and complete legend for 1.1.1, absent version and unsealed current runs; no observed or independent-review promotion; canonical claim-line snapshots. |
| renderDomainReportMarkdown | tests/noCertificationFromSelfAssessment.test.ts | The same real assessment fixture renders default self-reported and explicitly synthetic-example report claims, both not evaluated, with complete legend and snapshots. |
| renderIndustryPackAuditMarkdown | tests/industryPackAudit.test.ts | Every actual control section is labelled self-reported/not evaluated; label count includes every control plus the aggregate; real auditor signing in an owned temporary workspace preserves all kinds; complete legend and per-result claim snapshots. |
| renderTransparencyReportMarkdown | tests/transparencyReport.test.ts | Actual generated label is preserved verbatim in rendered output for 1.1.1, absent-version and unsealed current runs; complete legend and legacy/current line snapshots. |
| complianceReportToMarkdown | tests/complianceReportReadability.test.ts | A mixed report preserves each service-decided category kind/result under its own heading, apart from the aggregate; exact line count, complete legend and three-result snapshots. |
| renderAssuranceMarkdown | tests/assuranceReportProvenance.test.ts | Typed renderer fixtures reuse the existing provenance fixture. Checked/unverified seal context is reflected in report and pack labels without independent-review promotion; empty/inconclusive-only reports have no passing canonical claim; complete legend and pack/header snapshots. |
| renderExecutiveBriefMarkdown | tests/executiveBrief.test.ts | Actual written/read-back Markdown artifact preserves a 1.1.1 legacy envelope and complete legend; unsealed current run remains self-reported/not evaluated/pending; rendered-line snapshots. |
| renderExecutiveBriefHtml | tests/executiveBrief.test.ts | Actual written/read-back HTML artifact carries the exact canonical formatter output and full HTML legend for legacy and unsealed current runs; rendered markup snapshots. Existing compiled-CLI missing-version case now also checks legacy wording and legend. |
| renderBenchRunMarkdown | tests/benchmarks/benchRunner.test.ts | Actual empty-import benchmark result is self-reported/not evaluated, with a claim kind on each of five category rows and full legend; claim and category-row snapshots. |
| renderBenchCompareMarkdown | tests/benchmarks/benchRunner.test.ts | Actual comparison result is self-reported/not evaluated, with a claim kind on every category row and full legend; comparison snapshots. |
| renderCoverageMatrixMarkdown | tests/compliance/complianceMatrix.test.ts | Existing real ledger/compliance-map fixture checks every framework's exact canonical line and table-row kind; full legend, unresolved applicability and aggregate/member label counts; framework snapshots. |
| renderResidencyReportMarkdown | tests/dataResidency.test.ts | Real configuration reports retain self-reported/not-evaluated claims when no violation is found and self-reported/fail claims for violations, with complete legend and snapshots. |

Snapshots retain stable canonical claim lines and explicit control, framework, benchmark or assurance result rows. Complete legends are checked separately against the common renderer, so removing a builder's legend still fails its contract. Generated timestamps, local paths and signing timestamps are not snapshotted.

Keep the evidence scope precise. The assurance renderer fixtures exercise a caller-provided checked/unverified seal context; they do not themselves verify a signature. Existing provenance tests exercise genuine signed report admission. The industry pack case uses the actual signer in a new temporary workspace. The mixed compliance fixture checks preservation of decisions made by a service; the existing matrix fixture separately uses real ledger/compliance maps.

No new per-question or configuration-row eligibility was manufactured. Diagnostic, domain, transparency, executive and residency nested rows retain their parent-report scope, as described in the original read-only audit. The fleet missing-map fallback remains separate. This subtask does not claim Node24, hosted CI, full-suite, coverage, freeze or whole-issue qualification.

The changes are uncommitted. The JSON companion records each touched path, original/final/new case counts, exact input and snapshot hashes, all three phases, acceptance mapping, unchanged protected inputs, and the complete patch. Root review and remaining required checks must precede closure.
