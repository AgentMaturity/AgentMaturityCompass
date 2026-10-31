# P1-30 qualification: AMC Core Spec 1.0 draft

Commit under test: the `receipt.json` `commit` (branch `rtd/w4-p1-30`, base `e95619acb`).

## What ran

- `node scripts/check-spec-sync.mjs --check` (the `check:spec` step CI runs): 16 spec files in sync with the code.
- check:docs-drift, check:gates, check:schemas, check:counts, check:api-ref and the freeze guard against the base:
  all exit 0. Also run on this commit, not timed here: build, typecheck, typecheck:tests, lint, check:dead-code and
  check:duplicates (0 new findings each), `node scripts/build-pages-site.mjs --out <tmp>` (renders 17 spec pages
  under `/spec/`, 10 of them chapters).
- Tests: `tests/spec/` (14 cases) plus 23 existing files that touch the docs site, the CI workflow, counts, public
  docs and level semantics: 361 passed, 0 failed.

## Red, then green

`red-run.log`: before the spec existed, `tests/spec` gave 9 failed, 3 passed. After: 14 passed.

## Mutation checks

1. Spec drift (the issue's mutation check): `name: "Runtime evidence"` in `dist/diagnostic/levelSemantics.js`
   changed without regenerating. `check-spec-sync --check` exits 1 with
   `spec/core/06-maturity-levels.md: amc:spec:levels is stale`; restored, it exits 0 (`mutation-check-spec.log`).
   The test "a changed level definition, claim kind, schema $id or receipt transition makes the check fail" does the
   same for a level, a band, a claim kind, a schema `$id` and a receipt transition.
2. Guards in `scripts/check-spec-sync.mjs`, each disabled in turn, then restored byte for byte:
   - stale-region comparison off: "a changed level definition … makes the check fail" fails;
   - licence-line check off: "the check refuses a missing licence line, an unknown $id …" fails;
   - unknown-`$id` check off: the same test fails;
   - missing-region check off: the same test fails.

## Open (not done by the agent)

- D-04 licence decision (Sid). The spec carries the repository licence (MIT) until then; one constant in
  `scripts/check-spec-sync.mjs` and `--write` change every file.
- Annex A expert sign-off (D-08), and the cross-check against the research note standards.md §1.2, which the agent did
  not have.
- Pages deploy and the `SPEC DRAFT:` public-URL comment (Sid).
- The npm alias `check:spec` in package.json (integrator; this worktree must not edit package.json).
