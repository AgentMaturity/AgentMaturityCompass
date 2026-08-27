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

---

## Batches 3–7 — completion summary

Final state: **`npm run typecheck:tests` exits 0.** 453 → 0 across 239 files.
Suite unchanged throughout at 1092/1095, with only the three environmental
worktree failures.

### Further defects found (tests that were green without testing)

- **`apiRouters.test.ts` export-route table** — the first two of seven rows had
  four elements where the loop destructures five, so `url` received `200` and
  `expectedStatus` received `undefined` (silently falling back to its default).
  Every field after the missing `url` slot was shifted.
- **`newProductModulesBatch2.test.ts`** — `.withPriority(8)` with
  `expect(spec.priority).toBe(8)`, round-tripping a value outside
  `TaskSpec['priority']` (`'low'|'medium'|'high'|'critical'`). The builder
  stores whatever it is handed, so the test agreed with itself and proved
  nothing. Fixing the input made the assertion fail — a genuine rule-4 catch.
- **`valuesObservabilityCorrections.test.ts`** — `mockPolicy` had a completely
  different shape from `transitionClaim`'s parameter, so every gate it checks
  (`minDistinctSessions`, `minEvidenceEvents`, `requireOwnerCoSign`, …) was
  read as `undefined`.
- **`product.test.ts`** — three APIs called against signatures that no longer
  match, with assertions that are only `toBeDefined()`. `withRetry`'s
  `maxRetries` was an excess property, so `DEFAULT_CONFIG.maxAttempts` was used
  and the intended retry counts never applied.
- **69 invented `LayerName` values** — `"Evaluation and Improvement"` has never
  existed anywhere in `src/` in the repo's history.
- **53 bespoke `agentEvaluationDimension` labels** outside the closed union.

### Systemic causes worth remembering

- `Parameters<typeof f>` / `ReturnType<typeof f>` resolve to the **last**
  overload only. `createServer` last-overloads to `(options)` and `spawnSync`
  to the `Buffer`-returning form, so two test helpers were typed wrongly and
  produced 41 errors between them.
- Zod `z.infer` is the **output** type, with defaults applied. Fixtures written
  as schema input but annotated with the output type must supply the
  defaulted fields — or, better, go through `schema.parse` so the defaults stay
  in one place (done for `GatewayConfig`).
- Object spread drops string index signatures, which is why
  `{ ...process.env, NO_COLOR: "1" }` narrowed to `{ NO_COLOR: string }`.

### Casts retained, all deliberate

Partial mock returns in `apiRouters`, tamper fixtures (`gap1637`, `gap1247`,
`gap1644`), metadata-only binders (four PII-scan tests), the `""` sampling
method in five posthoc fixtures, and 19 minimal `DiagnosticReport` doubles
whose `as X` no longer satisfies the overlap rule. Each carries a comment or a
commit-message rationale. The other 90 files using `as DiagnosticReport` were
left on the stricter plain cast.

### Two self-corrections during the sweep

Blanket substitution on a **literal value** twice over-applied, because the
same literal can be valid under one target type and invalid under another
(`"github_repo"` is legal in `ReplayBenchmarkAiAgentBenchmarkSourceCategory`
and illegal in `QuestionScoreObsStudioSourceKind`; `as DiagnosticReport` is
fine in 90 files and not in 19). Both were caught by the gate within one cycle
and reverted. Group by **target type**, never by literal value.
