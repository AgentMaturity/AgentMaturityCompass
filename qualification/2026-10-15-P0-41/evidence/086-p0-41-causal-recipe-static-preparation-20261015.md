# P0-41 causal recipe static preparation — 15 October 2026

Both single-anchor recipes are statically plausible against the unchanged metrics script. No blocking recipe finding was identified. This is not parser/type validation, fixture/setup approval, runtime authorization or a mutant-kill claim.

The original source is 23978 bytes, SHA256 e7f77e3924d722b384cdd3cee169e83539eb83a3345c0e8fbcbe7228060bdbf9. No historical programMetrics test corpus is established. Q1–Q13 are scenario groups for the separately authored NEW private fixture, not 13 original or collected tests.

| Recipe | Exact source change | In-memory derived source |
| --- | --- | --- |
| M1 missing-source-zero | Replace the unique pending return at 88–89 with the existing measured(0, private marker) call. | 23876B, SHA256 3bae4d74178f588d98b1d960582b15e5754b80b9c0114bb83e15dc1781273ee6 |
| M2 vacuous-file-pass | Replace the unique completeness predicate at 125 with file.status!==passed only. | 23892B, SHA256 440b3fb3ecad99f95a0e1bc74c6cd4e6e70be88e651204e580bb04d2c80001f8 |

The JSON retains exact find/replacement text, byte counts and SHA256, one-match counts and unchanged prefix/suffix checks. Neither mutant was written.

For M1, measured is an existing hoisted function. The transformed return introduces no new binding, import or obvious syntax defect. In canonical supplied inputs, critical_gaps_open remains the declared register count 7; release_cadence is the first missing row. Q2 must first assert its value===null, then cover the other missing rows. Status/current/source/asOf checks follow. If the first null assertion fails during a future run, the later checks in that case are masked.

For M2, assertions remains used by the unchanged failed-assertion branch at 124. Failed files/assertions, missing matching files and duplicate matches retain their existing paths. Q6a must first assert value===null for a passed file with assertionResults:[]. The author's reported five one-file registrations with only CLI supplied is a valid finite shape: the other four missing files stay pending. M2 conditionally makes CLI count 1. Failure precedence and duplicate diagnostics belong in separate Q6b/Q6c cases; they are not effects of this mutation. No actual case or kill has been observed.

A small finite direct-import corpus can test supplied-input null/empty safety, valid sourced zeros, malformed provenance and report completeness. Existing allowJs:true/NodeNext configuration supports the unchanged .mjs import by source inspection; actual new fixture types still need their own review. The source entry guard keeps main outside direct compute calls.

Separate actual Node CLI children in an owned genuine Git fixture can test committed HEAD selection, dirty working-copy independence and structural closure refusals. The script derives root from its own URL; its physical scripts/docs layout must belong to that fixture. Use actual Git history and command results. No mocked Git output, copied-without-Git positive proof, --online or npm view belongs in this proposal.

These tests can establish bounded local input/output behavior after execution. They cannot authenticate supplied reports, prove independently signed receipts or approved merges, measure current outcomes, qualify OS containment, choose D01 targets or post weekly status. Q1's independent table and Q9–Q13 CLI cases are new coverage proposals.

Fresh baseline/mutant/restored processes, preserved config/guards/source, first-error attribution and fail-closed process restoration controls remain future release prerequisites. Import/type/native/hook/global/unhandled/pending/timeout errors are infrastructure rather than semantic kills. Normal freeze/quality gates and every inherited source hold remain unchanged.

Only source/config/readiness reads and standard-library in-memory byte/hash calculations occurred. No imports, parsers, collection, typecheck, Git, tests, source writes or active author-file reads occurred. All reads finished. Formal acceptance remains open.
