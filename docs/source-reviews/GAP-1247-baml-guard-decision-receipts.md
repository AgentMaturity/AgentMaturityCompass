# GAP-1247 - BAML guard decision receipts boundary

- Gap: `GAP-1247`
- Dimension: `security-guard-receipts`
- AMC surfaces requested: Shield, Enforce, Vault
- Source reviewed: `BoundaryML/baml`
- Retrieval: 2026-06-25 live GitHub API, live README, release metadata, and documentation homepage review
- Status: Done

## Source reviewed

- Repository: `https://github.com/BoundaryML/baml`
- Raw README: `https://raw.githubusercontent.com/BoundaryML/baml/canary/README.md`
- Documentation homepage: `https://docs.boundaryml.com/`
- Latest release checked: `https://github.com/BoundaryML/baml/releases/tag/baml-language-0.12.2-nightly.20260625.d`

Live GitHub API metadata at retrieval:

- `full_name`: `BoundaryML/baml`
- `default_branch `canary`
- `license`: `Apache-2.0`
- `language`: `Rust`
- `stargazers_count `8423`
- `forks_count `438`
- `open_issues_count `240`
- `pushed_at `2026-06-25T07:46:55Z`
- `updated_at `2026-06-25T07:28:20Z`
- `archived`: `false`
- `disabled`: `false`
- default branch commit `af193bf04f339ba162b5cb7b632135d1ecd65ba6`
- release `baml-language-0.12.2-nightly.20260625.d`, published `2026-06-25T05:36:23Z`

The public source describes BAML as `BAML: Basically a Made-up Language` and as `The AI framework that adds the engineering to prompt engineering`. The README positions it as a `simple prompting language` for reliable AI workflows and agents, emphasizes `schema engineering`, `full typesafety`, `streaming`, `retries`, `wide model support`, an IDE/playground workflow, and `structured outputs`. The repository topics include `guardrails`, prompt configuration, structured generation/output, playground, and VS Code support.

## Relevance decision

GAP-1247 is relevant to AMC because operators need a compact, signed explanation for guard decisions. BAML is useful source-review context because it highlights typed, structured, testable prompt/LLM workflows and guardrail-adjacent engineering signals. It does not justify a BAML parser, language runtime, prompt compiler, prompt template importer, SDK wrapper, or parity claim.

AMC closure is an AMC-native guard decision receipt primitive:

- decision type for allow, block, redact, step-up, and escalate decisions;
- matched rule;
- input hash;
- output hash;
- signer;
- payload hash;
- signature;
- receipt hash;
- persisted guard-event metadata so existing Score, Watch, Shield, and Enforce readers keep working.

Metadata-only evidence, including BAML repository identity, README labels, docs labels, topic labels, stars, release labels, default-branch commits, or local backlog text, cannot prove a guard decision.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. Score can consume observed guard events, but this gap does not change score weights or methodology semantics. |
| Shield | Relevant. Shield can now verify compact signed receipts explaining guard decisions and matched rules. |
| Enforce | Relevant. Enforce emits the shared receipt and maps decision outcomes into the existing guard event ledger without breaking existing callers. |
| Vault | Relevant. Vault boundary is hash-and-sign preservation without storing raw sensitive inputs or outputs. |
| Watch | Context only. Watch/SIEM readers can continue reading guard events and metadata, but this is not a new Watch monitor. |
| Fleet | Not directly relevant. No fleet topology or routing primitive changed. |
| Passport | Not directly relevant. No external portable trust token semantics changed. |
| Comply | Context only. The signed receipt can support audits, but no compliance mapping changed. |

## Product closure

Added a generic receipt primitive in `src/enforce/evidenceEmitter.ts` and exported it through `src/enforce/index.ts`.

The closure adds:

- `buildGuardDecisionReceipt`;
- `emitGuardDecisionReceipt`;
- `readGuardDecisionReceipts`;
- `verifyGuardDecisionReceipt`;
- receipt payload and verification result types.

The existing `emitGuardEvent` API remains compatible. Existing event decisions still use the guard-event ledger domain:

- receipt `allow` maps to event `allow`;
- receipt `block` maps to event `deny`;
- receipt `redact` maps to event `warn`;
- receipt `step_up` maps to event `stepup`;
- receipt `escalate` maps to event `stepup`.

Signed receipt metadata is stored inside existing `meta_json` with the receipt hash, payload hash, decision, matched rule, input hash, output hash, and signer. This keeps current scoring and SIEM export paths compatible while adding fail-closed verification for guard evidence.

## Fail-closed rule

The following must fail closed:

- BAML repository identity alone;
- BAML README/docs/topic labels alone;
- stars, forks, license, language, branch, release, or commit metadata alone;
- a guard event without signed guard decision receipt metadata;
- receipt with missing decision type;
- receipt with missing matched rule;
- receipt with invalid input hash;
- receipt with invalid output hash;
- receipt with missing or invalid signer;
- payload hash mismatch;
- signature missing or signature verification failure;
- receipt hash mismatch;
- metadata-only source facts pretending to be guard evidence.

## No-bloat boundary

AMC did not add a BAML adapter, BAML runtime, prompt compiler, BAML parser, prompt-template importer, structured-output importer, SDK wrapper, playground clone, VS Code/JetBrains integration, model-client integration, retry/fallback runtime, language server integration, package dependency, API route, CLI command, Studio panel, Watch monitor, methodology version bump, diagnostic question-bank change, source-specific scoring path, or BAML-specific implementation branch.

AMC did not copy upstream code, README prose beyond minimal metadata facts, docs prose beyond minimal labels, examples, prompts, schemas, BAML functions, configs, screenshots, generated outputs, package metadata, workflows, images, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1247BamlGuardDecisionReceiptsBoundary.test.ts --reporter=dot` failed before implementation with missing source-review doc and missing receipt helpers.
- Receipt implementation check: `npx vitest run tests/gap1247BamlGuardDecisionReceiptsBoundary.test.ts --reporter=dot` passed the four receipt/no-bloat behavior tests and failed only because this doc did not yet exist.
- Focused test: `npx vitest run tests/gap1247BamlGuardDecisionReceiptsBoundary.test.ts --reporter=dot` passed, 1 file / 5 tests.
- Related regression: `npx vitest run tests/gap1247BamlGuardDecisionReceiptsBoundary.test.ts tests/evidencePipeline.test.ts tests/receipts.test.ts tests/receiptsCorrelationRuntimeDashboard.test.ts tests/governorToolhubWorkorders.test.ts --reporter=dot` passed, 5 files / 34 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 940 files / 7,751 tests.
