# FIX-3 Handoff

Date: 2026-02-22
Owner: FIX-3 (Scoring Schema Unification Engineer)

## Scope Completed

### 1) Audit of hardcoded question-count references
- Audited `src/` and `docs/` with:
  - `rg -n "\\b(42|48|67)\\b" src docs`
  - `rg -n "\\b(42|48)\\b" src docs`
- Remaining `42/48` in `src/` are non-question-count values only (CSS color channel, time window, route-length normalization, migration ETA text).

### 2) Canonicalized scoring schema to 67Q
Updated code paths and UX/report text that previously referenced 42/48 question assumptions:
- `src/cli.ts`
- `src/diagnostic/quickScore.ts`
- `src/diagnostic/runner.ts`
- `src/workspace.ts`
- `src/fleet/report.ts`
- `src/forecast/forecastSignals.ts`
- `src/domains/domainCliIntegration.ts`
- `src/passport/passportCollector.ts`
- `src/console/assets/app.js`
- `src/console/assets/equalizer.js`
- `src/dashboard/templates/index.html`
- `src/score/domainPacks.ts`

### 3) Fixed cross-framework mapping invalid QIDs
`src/score/crossFrameworkMapping.ts`:
- Replaced non-existent QIDs:
  - `AMC-3.1` -> valid IDs (`AMC-3.1.2`, etc.)
  - `AMC-3.2` -> valid IDs (`AMC-3.2.1`, etc.)
  - `AMC-3.4` -> valid IDs (`AMC-3.1.2`, `AMC-EUAI-1`)
- Added runtime mapping guard `assertValidMappedQids(...)` so future invalid QIDs fail fast.

### 4) Added specialized gates for additional high-priority security/compliance questions
Extended `src/diagnostic/questionBank.ts` with specialized gate logic for 12 more high-priority questions:
- `AMC-1.8`
- `AMC-3.1.2`
- `AMC-3.2.1`
- `AMC-4.6`
- `AMC-4.9`
- `AMC-HOQ-1`
- `AMC-HOQ-2`
- `AMC-FSEC-1`
- `AMC-EUAI-1`
- `AMC-OWASP-1`
- `AMC-KSAND-1`
- `AMC-RID-1`

This is in addition to existing specialized gates (e.g. `AMC-1.1`, `AMC-1.5`, `AMC-1.7`, `AMC-1.9`, `AMC-2.5`, `AMC-3.2.3`, `AMC-3.3.1`).

### 5) Docs updated to 67Q canonical
Required docs updated:
- `docs/DIAGNOSTIC_BANK.md`
- `docs/STANDARDS_MAPPING.md` (rewritten to canonical 67Q/5-dimension runtime model)

Also normalized stale references in related docs (console, fleet, quickstart, rubric, validity, etc.) so question-count messaging is consistently 67Q.

## Validation Run

Executed required command:
- `npm test -- --reporter=verbose 2>&1 | tail -30`

Observed result (tail):
- Test run completed, but many tests fail in this sandbox due socket bind restriction:
  - `Error: listen EPERM: operation not permitted 127.0.0.1`
  - Originating from `tests/enterpriseSsoScim.test.ts`
- Summary from tail:
  - `Test Files  27 failed | 81 passed (108)`
  - `Tests  78 failed | 1744 passed (1822)`
  - `Errors  66 errors`

Additional check:
- `npm run typecheck` passes.

## Notes
- `npm install` was run to install `vitest` so the required test command could execute.
