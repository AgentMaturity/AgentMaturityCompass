# P1-34 receipt: catalog content governance and currency reviews

Environment: local macOS 26.6.2 arm64 (Darwin 25.6.0), Node v22.23.3, pnpm 10.33.0. Not CI. Branch
`rtd/p1-34-catalog-governance`, run at the commit `receipt.json` names, with `int` (`737c8738c`) merged in, after the independent review's
third round. `receipt.json` lists every command with its exit code and duration.

The spec asks for no receipt; this one records the mutation checks, the comparison with `int` and the checks after both
review rounds. Nothing here is a review: every catalog record is still `experimental`, D-08 has named no expert, and
docs/catalog/GOVERNANCE.md is a draft awaiting Sid's approval.

## What was checked

- Every command in `receipt.json` exits 0, `release:notes -- --check` included (the 2.0.0 notes already carry the
  P1-34 changeset). The list includes
  `check:freeze -- --base-ref int`, the duplicate and dead-code ratchets, `check:qualification`,
  `check:catalog-currency -- --as-of 2027-01-15` (0 errors, 3 register status-review warnings, 15 re-verify items open,
  0 review records) and `check:catalog-changelog -- --base-ref int`.
- `focused-tests.json`: the catalog, trust and verifier suites and the suites around the routed paths, 1093 tests, all
  passed. The full suite was not run here.
- `mutations.json`: 85 mutations, one per guard, each killed by the test it names (the loader mutation fails its test
  file at load). They cover the record format; every verification step in effectiveSupport (signature, pinned entry,
  purpose, key validity, reviewer from the key, roster membership and identities, independence, F5, currency); identity
  normalization; the quorum; promotions (minted only, non-empty, frozen, record digests bound, bound to current content,
  not reviewed after asOf, not overdue); trust only from the operator's AMC home with its trust roots; compilePlan's
  purity and binding only the promotions it accepted; the server clock; the routed views
  (compile, activation, A4, OSCAL); the report; `git log --follow`; the cadence rules; the changelog guard; the re-verify
  list; and both catalog-review purpose rules in the shared admission rule.
- `int-comparison.json`: the catalog's load issues, its warnings (P1-18's `CAT_NO_REGISTER_ENTRY`) and six compiled
  fixture plans are identical under `int`'s code and this branch's. For all 62 shipped controls the shown review status
  equals the record's (`experimental`/`pending`), so sealed A4 conformance statements recompute identically.

## Not evaluated, and the limit that remains

Real review records, the D-08 roster and pinned reviewer keys do not exist, so no positive path ran against real
people.

Follow-ups for P1-33:

- Nothing re-checks a plan's `promotions[].recordDigests` against the review records when a plan is loaded from disk or
  activated; the digests are bound into the plan digest, but no reader re-verifies them.
- A workspace vault key that no trust list pins for its own purpose is not detected; only keys a list pins for
  another purpose are refused for `catalog-review`.

Independence rests on git authorship, which is unsigned: an author can commit under a new identity the roster does not
list, and one person with two roster entries whose identities never overlap counts as two people. Only signed commits
and a signed D-08 roster close those gaps. Look-alike characters from other scripts (UTS #39 confusables, not folded) and
initials ("A. Smith") also pass as different people.
