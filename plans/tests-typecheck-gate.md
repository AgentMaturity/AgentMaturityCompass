# tests/ Typecheck Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every file under `tests/` under `tsc`, fix the ~453 errors that surface, and gate it in CI so a type error in a test can never ship silently again.

**Architecture:** A second project file, `tsconfig.tests.json`, extends the existing base compiler options and points `include` at `tests/`. It is a *separate* gate from `npm run typecheck` so the two can fail independently and the `src/` gate can never regress because of test churn. Errors are fixed in batches grouped by error class, not by directory, because the classes have very different risk profiles — an import-interop fix is mechanical, while replacing an impossible enum literal can legitimately turn a vacuously-passing test red.

**Tech Stack:** TypeScript 5.x (`NodeNext`, `strict`), Vitest 3, Playwright (for `tests/e2e/*.spec.ts`), GitHub Actions.

**Spec:** This plan's requirements are stated inline below; the originating analysis is in the session that produced `plans/tests-typecheck-inventory.md`.

## Global Constraints

- `tests/` is **not** covered by any line-count ratchet. `scripts/architecture-boundaries-check.mjs` budgets only `src/cli.ts` and `src/studio/studioServer.ts` (inline, lines 18–21). There is no `scripts/line-budgets.json` and no `scripts/gen-counts.mjs` in this repo, so there is no count-drift step to run before the suite.
- `npm run typecheck` (the `src/` gate) must stay green and must keep `noUncheckedIndexedAccess: true`. Never relax the base config.
- `tests/` runs with `noUncheckedIndexedAccess: false` — an explicit, approved policy decision. It removes 237 index-access errors that are noise on fixtures the test itself constructs.
- **Baseline suite (known-bad set): 1092/1095 test files pass. Exactly three fail, all environmental** — `tests/amc1473SignedControlLifecycle.test.ts`, `tests/publicDocsArtifact.test.ts`, `tests/publicTypographyArtifact.test.ts`. They fail because this git worktree's `node_modules` lacks `tsx/dist/loader.mjs` (real deps live at `/Users/sid/AgentMaturityCompass/node_modules`). A batch is clean when the failing set is *exactly* these three.
- Run the suite as `npx vitest run` **after** a `npm run build` has been done at least once in the worktree. Running `npx vitest run` on a cold worktree produces ~44 bogus `MODULE_NOT_FOUND` failures from tests that shell out to `dist/cli.js`.
- `tests/e2e/*.spec.ts` are Playwright specs, not Vitest specs (Vitest's `include` is `tests/**/*.test.ts`). They are typechecked by this gate but exercised only by `npm run test:e2e`.

## What Counts As A Fix

These rules exist because the failure mode being repaired is *tests that pass without testing anything*. A change that silences `tsc` while preserving that property is a regression, not a fix.

1. **Never widen a production type to accommodate a test.** If `RiskTier` has no `"medium"`, the test is wrong, not `RiskTier`.
2. **Never use `@ts-ignore`.** `@ts-expect-error` is permitted only for a genuine type-system limitation, and only with a one-line comment naming the limitation.
3. **`as any` / `as unknown as X` is a last resort**, and every use must be recorded in the execution log with the reason.
4. **When an impossible literal is replaced with a real one, re-run that test and read the result.** If it now fails, the test was passing vacuously and has found a real defect — record it in the log and report it. Do **not** adjust the assertion to make it pass again.
5. **Deleting a dead import is a fix. Deleting a live call is not.** If a test calls a function that does not exist, that is a defect to report, not to delete.
6. Changing an assertion's expected value requires an explicit note in the log saying why the old value was wrong.

## File Structure

- **Create:** `tsconfig.tests.json` — the tests project file. Sole responsibility: define the test typecheck program.
- **Create:** `plans/tests-typecheck-log.md` — running execution log; one entry per batch recording judgement calls, `as any` uses, and any defect found under rule 4.
- **Modify:** `package.json` — add `typecheck:tests`; leave `lint`/`typecheck` untouched until Task 7.
- **Modify:** `.github/workflows/*.yml` — add the gate (Task 7 only).
- **Modify:** ~239 files under `tests/` — the fixes themselves.
- **Reference:** `plans/tests-typecheck-inventory.md` — per-batch file lists, snapshotted at `3d6b8d4a`.

---

### Task 0: Create the tests project file and script

**Files:**
- Create: `tsconfig.tests.json`
- Modify: `package.json` (scripts block)

**Interfaces:**
- Produces: `npm run typecheck:tests` — exits non-zero with `tsc` diagnostics on stdout. Every later task consumes this.

- [ ] **Step 1: Write `tsconfig.tests.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "declaration": false,
    "rootDir": ".",
    "noUncheckedIndexedAccess": false,
    "types": ["node", "vitest/globals"]
  },
  "include": ["tests/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

`rootDir: "."` is required because `tests/` sits outside the base config's `rootDir: "src"`. `declaration: false` is required because `declaration` cannot combine with `noEmit`. `src/` is not in `include` — `tsc` pulls it in automatically as an import dependency, which is what makes cross-module checking (the thing Vitest cannot do) work.

- [ ] **Step 2: Add the script to `package.json`**

Add to `scripts`, directly after the existing `"typecheck"` line. Do **not** modify `lint` yet:

```json
"typecheck:tests": "tsc -p tsconfig.tests.json --noEmit",
```

- [ ] **Step 3: Run it and confirm the expected error count**

Run: `npm run typecheck:tests 2>&1 | grep -cE '^[^ ].*\([0-9]+,[0-9]+\): error TS'`
Expected: `453` (±a few if the branch has moved). If it reports ~690, `noUncheckedIndexedAccess` did not take effect — check the override.

- [ ] **Step 4: Confirm the src gate is untouched**

Run: `npm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git add tsconfig.tests.json package.json plans/tests-typecheck-gate.md plans/tests-typecheck-inventory.md
git commit -m "chore: add tsconfig.tests.json and typecheck:tests script

Tests were never typechecked: tsconfig.json has include:[src], so all
1110 files under tests/ were invisible to tsc. Adds a separate gate so
the two can fail independently. Not yet wired into CI - 453 pre-existing
errors must be fixed first."
```

---

### Task 1: Batch 1 — import interop (18 errors, 12 files)

**Files:**
- Modify: the 12 files listed under "Batch 1" in `plans/tests-typecheck-inventory.md`

**Interfaces:**
- Consumes: `npm run typecheck:tests` from Task 0.

Both causes are the same shape: a CJS package whose `.d.ts` uses ESM `export default` syntax. Under `moduleResolution: NodeNext`, the default import resolves to the module namespace, which has no construct signature. Both packages also export the class as a *named* export, and both named exports are verified present at runtime in ESM and CJS.

- [ ] **Step 1: Fix the ajv imports (5 `.test.ts` files)**

Replace `import Ajv from "ajv";` with:

```ts
import { Ajv } from "ajv";
```

- [ ] **Step 2: Fix the axe imports (7 `tests/e2e/*.spec.ts` files)**

Replace `import AxeBuilder from '@axe-core/playwright';` with:

```ts
import { AxeBuilder } from '@axe-core/playwright';
```

- [ ] **Step 3: Verify the batch is clean**

Run: `npm run typecheck:tests 2>&1 | grep -c 'error TS2351'`
Expected: `0`

- [ ] **Step 4: Verify no runtime regression**

Run: `npx vitest run 2>&1 | tail -5`
Expected: `3 failed | 1092 passed` — and the three must be the known-bad set from Global Constraints.

- [ ] **Step 5: Commit**

```bash
git add tests/
git commit -m "fix(tests): use named ajv/axe imports for NodeNext interop

Both packages ship CJS with ESM-syntax .d.ts, so the default import
resolves to the module namespace and 'new X()' fails to typecheck.
Named exports verified present at runtime in both ESM and CJS."
```

---

### Task 2: Batch 2 — genuine rot (56 errors, 17 files)

**Files:**
- Modify: the 17 files listed under "Batch 2" in `plans/tests-typecheck-inventory.md`
- Modify: `plans/tests-typecheck-log.md` (create on first entry)

This batch is where the real defects are. Three sub-classes:

- `TS2305` (7) — importing a symbol the module does not export. Two known cases: `tests/product-full.test.ts:13` imports `exportDocument` and `tests/product-full.test.ts:40` imports `coerce`; neither exists and neither is called, so both are dead imports to delete under rule 5.
- `TS2339` (20) — reading a property off a type that lacks it. Includes `tests/assuranceRunNoSign.test.ts:18-20` writing `AMC_VAULT_PASSPHRASE` onto an env object literal typed `{ NO_COLOR: string }`; the fix is to type the literal, not to cast.
- `TS2554` (29) — wrong argument count. `tests/amcClientSdk.test.ts:110-113` passes one argument to zero-argument functions.

- [ ] **Step 1: Handle the live-call case first**

`tests/e2e_full_agent.test.ts:192` calls `generateComplianceReport`, which `src/score/crossFrameworkMapping.ts` does not export. The call sits inside a `try` whose comment reads "If generateComplianceReport has a different signature, try alternate" — the test is green because it swallows its own failure. Under rule 5 this is a defect to report, not to delete. Determine whether the function was renamed or removed, then either point the import at the real symbol or record the finding in the log and mark the test `it.skip` with a comment naming the missing API.

- [ ] **Step 2: Delete the dead imports**

Remove `exportDocument` from the `documentAssembler.js` import and `coerce` from the `structuredOutput.js` import in `tests/product-full.test.ts`. Confirm neither identifier appears elsewhere in the file first:

Run: `grep -n 'exportDocument\|coerce' tests/product-full.test.ts`
Expected: only the two import lines.

- [ ] **Step 3: Work the remaining TS2305 / TS2339 / TS2554 sites**

For each, read the real signature in `src/` before editing. Record every judgement call in `plans/tests-typecheck-log.md`.

- [ ] **Step 4: Verify the batch is clean**

Run: `npm run typecheck:tests 2>&1 | grep -cE 'error TS(2305|2339|2554):'`
Expected: `0`

- [ ] **Step 5: Verify no runtime regression, then commit**

Run: `npx vitest run 2>&1 | tail -5` — failing set must equal the known-bad three. If a test newly fails, that is a rule-4 finding: log it and report it, do not paper over it.

```bash
git add tests/ plans/tests-typecheck-log.md
git commit -m "fix(tests): repair stale imports, property access, and call arity

Removes dead imports of symbols that no longer exist and corrects
call sites whose arity drifted from src/. These were invisible because
Vitest transpiles each file in isolation and never resolves cross-module
bindings."
```

---

### Task 3: Batch 3 — invalid literals (115 errors, 93 files)

**Files:**
- Modify: the 93 files listed under "Batch 3" in `plans/tests-typecheck-inventory.md`

This is the payload batch — the class that produced the original `runtime: "wire"` discovery. Every error is a test feeding a value the production union cannot hold. Known shapes: `"medium"` against `"low" | "med" | "high" | "critical"`, `"PATCH"`/`"DELETE"` against `"GET" | "POST"`, `"Agent Resilience"` and `"Evaluation and Improvement"` against `LayerName`.

- [ ] **Step 1: Group the errors by target type**

Run: `npm run typecheck:tests 2>&1 | grep -oE "is not assignable to type '[^']+'" | sort | uniq -c | sort -rn`

Working one target type at a time (all `LayerName` sites, then all `RiskTier` sites) is far more reliable than working file by file, because the correct replacement value is decided once per type rather than 115 times.

- [ ] **Step 2: For each target type, read its real definition in `src/`, then fix its sites**

Rule 1 applies with full force: the union is right and the test is wrong. Rule 4 applies to every single site — after replacing the literal, that test is exercising a different code path than it was a moment ago.

- [ ] **Step 3: Run the suite after each target type, not after the whole batch**

Run: `npx vitest run 2>&1 | tail -5`

93 files is too large a blast radius for one verification step. A per-type cycle keeps any new failure attributable to the type just changed.

- [ ] **Step 4: Verify the batch is clean**

Run: `npm run typecheck:tests 2>&1 | grep -cE "error TS2322: Type '\"[^\"]*\"' is not assignable"`
Expected: `0`

- [ ] **Step 5: Commit per target type, not once for the batch**

```bash
git add tests/ plans/tests-typecheck-log.md
git commit -m "fix(tests): use real <TypeName> values instead of impossible literals

These tests asserted against values the union cannot produce, so they
exercised a code path that does not exist in production."
```

---

### Task 4: Batch 4 — object shape (45 errors, 19 files)

**Files:**
- Modify: the 19 files listed under "Batch 4" in `plans/tests-typecheck-inventory.md`

`TS2353` (excess property) and `TS2741`/`TS2740` (missing property). A missing required property usually means a fixture was written against an older shape; an excess property usually means a field was renamed or dropped. Both are drift signals — read the current interface in `src/` before editing. The `zeroKeyLeaseBudgetDriftBom.test.ts` cluster (fixtures missing `lease` and `streamPassthrough`) belongs here.

- [ ] **Step 1: Fix the sites, reading each target interface in `src/` first**
- [ ] **Step 2: Verify**

Run: `npm run typecheck:tests 2>&1 | grep -cE 'error TS(2353|2741|2740):'`
Expected: `0`

- [ ] **Step 3: Run the suite and commit**

Run: `npx vitest run 2>&1 | tail -5` — failing set must equal the known-bad three.

```bash
git add tests/ plans/tests-typecheck-log.md
git commit -m "fix(tests): align fixture shapes with current src/ interfaces"
```

---

### Task 5: Batch 5 — assignability (144 errors, ~60 files)

**Files:**
- Modify: files matching `TS2345` and non-literal `TS2322` in the inventory

The largest and least uniform batch: argument-type mismatches and non-literal assignment mismatches. Expect a mix of genuine drift and fixtures typed more loosely than the parameter they feed. Prefer typing the fixture correctly over casting it.

- [ ] **Step 1: Split by file, working the highest-count files first**

Run: `npm run typecheck:tests 2>&1 | grep -E 'error TS(2345|2322):' | sed -E 's/\(.*//' | sort | uniq -c | sort -rn | head -20`

- [ ] **Step 2: Fix, running the suite every ~10 files**
- [ ] **Step 3: Verify**

Run: `npm run typecheck:tests 2>&1 | grep -cE 'error TS(2345|2322):'`
Expected: `0`

- [ ] **Step 4: Run the suite and commit**

```bash
git add tests/ plans/tests-typecheck-log.md
git commit -m "fix(tests): correct argument and assignment types in fixtures"
```

---

### Task 6: Batch 6 — casts, implicit any, and the tail (68 errors, 40 files)

**Files:**
- Modify: files matching `TS2352|TS7006|TS2571|TS18047|TS2769|TS2559|TS2698|TS18046|TS2820|TS2739|TS1345|TS2454|TS2578` in the inventory

`TS7006` (implicit `any` parameter) needs real annotations, not `: any`. `TS2578` (unused `@ts-expect-error`) means a suppression outlived the problem it suppressed — delete it. `TS2352` (unsafe cast) usually means the cast was always wrong.

- [ ] **Step 1: Fix the sites**
- [ ] **Step 2: Verify the whole gate is clean**

Run: `npm run typecheck:tests`
Expected: exit 0, no output.

- [ ] **Step 3: Run the suite and commit**

```bash
git add tests/ plans/tests-typecheck-log.md
git commit -m "fix(tests): annotate implicit any, drop stale suppressions and bad casts"
```

---

### Task 7: Wire the gate into CI

**Files:**
- Modify: `package.json` (`lint` script)
- Modify: the GitHub Actions workflow that runs `npm run lint`

Only reachable once Task 6 leaves `npm run typecheck:tests` at exit 0.

- [ ] **Step 1: Confirm both gates are green from a clean state**

Run: `npm run typecheck && npm run typecheck:tests && echo BOTH_GREEN`
Expected: `BOTH_GREEN`

- [ ] **Step 2: Chain the tests gate into `lint`**

Change the `lint` script to:

```json
"lint": "npm run typecheck && npm run typecheck:tests",
```

Keeping them as two named scripts rather than one merged `tsconfig` is deliberate: a contributor who breaks a test's types gets a diagnostic that says `typecheck:tests`, and the `src/` gate keeps its own independent exit status.

- [ ] **Step 3: Confirm CI actually runs `lint`**

Run: `grep -rn 'run lint\|run typecheck' .github/workflows/`

If the workflow calls `npm run typecheck` directly rather than `lint`, add an explicit `npm run typecheck:tests` step there too — otherwise the new gate never executes in CI.

- [ ] **Step 4: Verify the gate actually catches the original defect**

Reintroduce the exact failure that started this work, confirm it is caught, then revert it:

```bash
sed -i '' 's/runtime: "process"/runtime: "wire"/' tests/assuranceAgentResponder.test.ts
npm run typecheck:tests; echo "exit=$?  (MUST be non-zero)"
git checkout tests/assuranceAgentResponder.test.ts
```

A gate that has never been observed failing is not a verified gate. Adjust the `sed` target to any file with a `RuntimeName`-typed field if that specific line has moved.

- [ ] **Step 5: Commit**

```bash
git add package.json .github/workflows/
git commit -m "ci: gate tests/ typechecking in lint

453 type errors across 239 test files were invisible because
tsconfig.json included only src/. Verified the gate fails on a
deliberately reintroduced RuntimeName violation."
```
