# tests/ typecheck remediation — execution log

Judgement calls, casts, and defects found while working `plans/tests-typecheck-gate.md`.
Baseline known-bad set (environmental, worktree `node_modules` lacks `tsx/dist/loader.mjs`):
`amc1473SignedControlLifecycle`, `publicDocsArtifact`, `publicTypographyArtifact`.

Error count: **453 → 385** after Batch 2.

---

## Batch 1 — import interop (18 errors, 12 files)

No judgement calls. `ajv` and `@axe-core/playwright` both ship CJS with an ESM-syntax
`.d.ts`, so under `moduleResolution: NodeNext` the default import resolves to the module
namespace, which has no construct signature. Both export the class as a named export;
verified present at runtime in ESM and CJS before changing anything.

---

## Batch 2 — genuine rot (56 errors, 17 files)

### DEFECT FOUND — `tests/e2e_full_agent.test.ts` Step 6 never tested anything

`generateComplianceReport` does not exist in `src/score/crossFrameworkMapping.ts` and
never did under that name; the real export is `generateFrameworkReport`. The call sat
inside a `try` whose `catch` fabricated the result:

```ts
report = { framework: 'NIST_AI_RMF', coveragePercent: 75, note: 'fallback' };
```

At runtime the missing named import is bound to `undefined`, so `undefined(...)` threw a
`TypeError` on every run, the `catch` swallowed it, and `expect(report).toBeDefined()`
asserted against the hardcoded literal. The test has been green and vacuous.

Compounding it, the argument was also wrong: the test passed `evidenceSet`
(`EvidenceArtifact[]`), but `generateFrameworkReport`'s second parameter is
`{ passedQIDs: string[]; activeModules: string[] }`. Even a corrected import would have
thrown.

**Fix:** call `generateFrameworkReport` with `passedQIDs` derived from the test's own
evidence set and `activeModules: []`, drop the fabricating `catch`, and assert the real
report shape (framework, `coveragePercent` numeric and within 0–100, `coveredControls`
is an array). Per rule 6, this changes what the test asserts — the old assertions were
against a literal and were worth nothing. Verified passing after the change.

### Dead imports removed (rule 5 — never referenced anywhere in the file)

- `tests/product-full.test.ts` — `exportDocument`, `extract as extractStructuredOutput`,
  `coerce`, `ToolFallbackManager`, `runParallel`. None exist in their modules; none were
  called. Vitest tolerated them because esbuild strips types per-file and never resolves
  cross-module bindings.
- `tests/watch/monitorCli.test.ts` — `globalDashboardFeed`, no longer exported by
  `src/watch/continuousMonitor.ts`, never referenced.

Left in place: `assembleDocument` in `product-full.test.ts` is also unused, but it is a
real export producing no type error, so removing it would be scope creep.

### Mechanical, no behaviour change

- **`{ ...process.env, NO_COLOR: "1" }` → annotated `NodeJS.ProcessEnv`** (8 files).
  TypeScript's object spread drops the string index signature, narrowing the result to
  `{ NO_COLOR: string }` and breaking every subsequent `delete env.AMC_*`. Matches the
  idiom already used at `tests/utilsCoreFoundation.test.ts:205`.
- **`scenario.validate(response)` → 3-arg form** (`multiTurnDeepEval.test.ts` ×21,
  `researchExodusPacks.test.ts` ×1). `AssuranceScenarioDefinition.validate` is
  `(response, prompt, context)`; production calls it with all three
  (`assuranceRunner.ts:328`). 55 existing call sites already pass three arguments — the
  fix copies that idiom. These scenarios ignored args 2–3, so the tests passed, but any
  scenario that started reading `prompt` would have silently received `undefined`.
- **OpenAI client mocks given a parameter** (`amcClientSdk.test.ts`,
  `dx/quickstart.test.ts`). `instrumentOpenAIClient<T>(client: T): T` returns the mock's
  own type, so zero-parameter stubs made the instrumented methods zero-arity. Added
  `_body: unknown`; runtime behaviour unchanged.
- **`cb.getState()` → `cb.getState('session-1')`** (`enforce-full.test.ts`).
  `CircuitBreaker.getState(sessionId: string)` returns `'closed'` for any unknown
  session, so the assertion holds and now actually names a session.
- **`alternativeLogic()` return type narrowed** to `{ all: PolicyEvidenceLogic[] }`
  (`amc1475NestedConditionAuthoring.test.ts`). It only ever returns that union member,
  and the narrower type is still assignable at all 29 other call sites.

### Casts used (rule 3)

- `tests/diagnosticAssuranceCoverage.test.ts:48` — `generateReport(reloaded, "md") as string`.
  `generateReport` returns `string | DiagnosticReport`; the `"md"` arm is always a string.
  A cast rather than a runtime guard because `tests/questionScoreExplainability.test.ts:6136`
  already established exactly this idiom for the same call. The underlying wart is the
  union return type in `src/diagnostic/runner.ts:1621`, which would be better as an
  overload — out of scope here.
- `tests/scorePipelineE2E.test.ts:24` — kept the existing
  `new PassThrough() as unknown as IncomingMessage` cast but split out a `reqStream`
  handle so `write`/`end` are called on the real `PassThrough` rather than through the
  `IncomingMessage` view. Net reduction in cast surface.
