# Wave 4 Test Coverage Audit (Agent 17)

Date: 2026-02-22

## Scope
Audit focused on coverage and quality gates for:
- Auth
- Scoring
- Ledger
- Evidence verification

## 1) Coverage Analysis (line/branch/function)
Coverage could not be computed in this sandbox.

Executed:
- `npm test -- --coverage --reporter=dot`

Result:
- `MISSING DEPENDENCY  Cannot find dependency '@vitest/coverage-v8'`

Attempted dependency install:
- `npm i -D @vitest/coverage-v8 --fetch-timeout=20000 --fetch-retries=0`

Result:
- `ENOTFOUND registry.npmjs.org` (no npm registry DNS/network access)

Conclusion:
- Actual line/branch/function coverage percentages are currently **unavailable** in this environment.

## 2) Critical Untested Paths Found
Direct-import coverage proxy (not a substitute for line coverage):
- `auth`: 5/11 files directly imported by tests (45.5%)
- `scoring`: 27/49 files directly imported by tests (55.1%)
- `ledger`: 2/2 files directly imported by tests (100%)
- `evidence verification`: 4/6 files directly imported by tests (66.7%)

Highest-risk untested/under-tested paths identified:
- `src/auth/sessionTokens.ts` token format/signature/expiry behavior
- `src/workspaces/hostAuth.ts` host session tamper/expiry behavior
- `src/score/formalSpec.ts` weighted scoring math regression sensitivity
- `src/api/scoreRouter.ts` full score session pipeline behavior
- `src/verify/verifyAll.ts` critical failure reason aggregation
- `src/ledger/ledger.ts` trust-boundary fail-closed check

## 3) Tests That Pass But Are Low-Value
Examples of pass-with-limited-signal tests:
- `tests/apiRouters.test.ts` "router imports" checks only exported function existence.
- `tests/score-extensions.test.ts` shape/property assertions with no numeric invariant checks.
- `tests/advancedScoring.test.ts` schema/shape checks; limited behavior assertions.
- `tests/e2e_full_agent.test.ts` broad positivity checks and logs; weak fail-fast numeric invariants for core scoring.

## 4) Full Scoring Pipeline E2E
Before this audit, there was no direct test of the score API flow (`session -> question -> answer -> result -> inactive session`) without network harness complexity.

Added:
- `tests/scorePipelineE2E.test.ts`

This validates full routing/persistence path for scoring session lifecycle.

## 5) Missing Edge Case Tests
Still missing in critical areas:
- Auth:
  - Very large/malformed cookie headers and oversized role sets
  - Invalid base64 payload corruption beyond signature tamper cases
- Scoring:
  - NaN/Infinity/future timestamp evidence behavior
  - Very large evidence-set performance boundaries
- Ledger:
  - Max-size batch/retention boundary stress on `appendEvidenceBatch`
  - Archive/prune idempotency under repeated operations
- Evidence verification:
  - Corrupt archive/zip and mixed partial workspace states in `verifyAll` end-to-end

## 6) Would Suite Catch Core Scoring Regression?
Before changes: weakly.
- Existing scoring tests mostly asserted object shape/ranges.

After changes: improved.
- Added deterministic weighted-decay invariant test against expected math in `src/score/formalSpec.ts`.
- Added baseline empty-input and zero-delta velocity guards.

## 7) CI/CD Quality Gate Audit
Observed in `.github/workflows/ci.yml` and `.github/workflows/release.yml`:
- Enforced: lint, typecheck, tests, build, docker/helm/security-lite checks.
- Not enforced: coverage collection + threshold gate.

Added gate configuration in `vitest.config.ts`:
- Coverage provider set to `v8`
- Thresholds configured:
  - lines: 70
  - functions: 70
  - branches: 60
  - statements: 70

Note: threshold enforcement will be active once coverage runtime dependency is available in CI.

## 8) Tests Added for Top Critical Paths
Added test file: `tests/wave4CriticalPaths.test.ts`

New critical-path tests:
1. Session token minimum TTL floor
2. Session token malformed format rejection
3. Session token signature tamper rejection
4. Session token expired payload handling
5. Cookie parser encoded-value handling
6. Host password short-password rejection + hash verify behavior
7. Host session signature tamper rejection
8. Host session expired payload handling
9. Core weighted-decay scoring regression guard
10. Empty scoring input baseline
11. Zero-delta improvement velocity guard
12. Trust-boundary fail-closed check
13. `verifyAllTopReasons` critical-failure prioritization behavior

Added integration-style scoring pipeline test:
- `tests/scorePipelineE2E.test.ts`

## 9) Validation Run for New Work
Executed and passing:
- `./node_modules/.bin/vitest run tests/scorePipelineE2E.test.ts tests/wave4CriticalPaths.test.ts --reporter=dot`
- `npm run typecheck`

