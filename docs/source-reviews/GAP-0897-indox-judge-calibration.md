# GAP-0897 - inDox judge-calibration boundary

- Gap: `GAP-0897`
- Dimension: `eval-judge-calibration`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `osllmai/inDox`, `https://github.com/osllmai/inDox`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 19, Fork 2, Issues 25, Pull requests 18, 186 Commits, README.md, CONTRIBUTING.md, LICENSE, AGPL-3.0 license, Releases 50, latest release `v0.1.21-Master` on Mar 29, 2025, Jupyter Notebook 71.0%, Python 28.7%, Other 0.3%, repository folders `.github/ workflows`, `cookbook`, `docs`, and `libs`, and files including `Branch_and_PR_Guidelines.md`.
- Status: completed as `Done`.

## Live source metadata

The live README identifies the Indox Ecosystem as a suite with four components: IndoxArcg, IndoxMiner, IndoxJudge, and IndoxGen. Relevant source-review signals include advanced retrieval, extraction, evaluation, generation, multiple document formats, support for OpenAI, Google, Mistral, HuggingFace, and Ollama, IndoxJudge as an LLM and RAG evaluation framework, Faithfulness, Toxicity, BertScore, safety and bias assessment, multi-model comparison, RAG-specific evaluation metrics, extensible custom metrics, and synthetic data generation.

Those facts are relevant to AMC through judge calibration and appeal-path proof only. They do not allow AMC to claim inDox compatibility, import notebooks, run IndoxJudge, or mirror any inDox metric. For Score, Shield, and Watch, the relevant AMC requirement remains rubric version, calibration set, disagreement metric, appeal outcome, signed evidence refs, source refs, prompt/output hashes, row hashes, CI/Watch gates, and no-copy proof.

No upstream notebooks, Python source, metric implementations, README examples, model-provider tables beyond minimal metadata facts, package install commands, docs prose beyond minimal metadata facts, IndoxJudge prompts, RAG eval rows, synthetic data examples, extraction workflows, document examples, generated outputs, or implementation details were copied into AMC.

## Relevance decision

`GAP-0897` is relevant to AMC through the existing judge-calibration and appeal-path primitive. The source signal is that LLM/RAG evaluation should be bounded by rubric versions, calibration sets, disagreement metrics, and appeal outcomes, not that AMC should add an inDox or IndoxJudge integration.

The closure uses existing AMC judge-calibration receipts only. It does not add an inDox adapter, IndoxJudge runner, notebook importer, RAG evaluation framework, multi-model comparison workflow, or source-specific scoring path.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing judge calibration receipts and rubric-version proof. |
| Shield | Relevant only when signed judge evidence and appeal outcomes are present. |
| Watch | Relevant through existing judge-calibration Watch alerts and CI gates. |
| Enforce | No runtime judge policy, provider policy, or guardrail changed. |
| Vault | No documents, notebooks, prompts, provider configs, or generated outputs stored. |
| Fleet | Evaluation-framework context only; no agent topology changed. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

The focused regression exercises existing `buildJudgeCalibrationReceipt`, `verifyJudgeCalibrationReceipt`, and `buildJudgeCalibrationWatchAlerts` behavior with a synthetic AMC-owned inDox-style calibration packet. The positive path requires rubric version, calibration set, disagreement metric, appeal outcome, signed evidence refs, source refs, prompt/output hashes, receipt hash, replayable proof, and CI pass. The negative path proves that inDox, IndoxJudge, RAG evaluation, Faithfulness, Toxicity, BertScore, safety/bias, multi-model comparison, and source metadata fail closed without signed AMC-owned judge-calibration evidence.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, AGPL-3.0 license metadata, Star 19, Fork 2, Issues 25, Pull requests 18, 186 Commits, Releases 50, `v0.1.21-Master`, Mar 29, 2025 release metadata, Jupyter Notebook 71.0%, Python 28.7%, Other 0.3%, folder names, file names, IndoxArcg labels, IndoxMiner labels, IndoxJudge labels, IndoxGen labels, advanced retrieval labels, extraction labels, evaluation labels, generation labels, document formats labels, OpenAI/Google/Mistral/HuggingFace/Ollama labels, Faithfulness labels, Toxicity labels, BertScore labels, safety and bias assessment labels, multi-model comparison labels, RAG-specific evaluation metrics labels, local backlog metadata, or source identity alone must fail closed for judge calibration. Passing proof requires rubric version, calibration set, disagreement metric, appeal outcome, prompt/output hashes, signed evidence refs, source refs, row hashes, thresholds, and CI/Watch gate proof.

## No-bloat boundary

No inDox adapter, IndoxArcg integration, IndoxMiner integration, IndoxJudge integration, IndoxGen integration, notebook importer, RAG evaluator, Faithfulness metric implementation, Toxicity metric implementation, BertScore implementation, safety/bias evaluator, multi-model comparison workflow, custom metric runner, document parser, synthetic data generator, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream notebooks, Python source, metric implementations, README examples, model-provider tables beyond minimal metadata facts, package install commands, docs prose beyond minimal metadata facts, IndoxJudge prompts, RAG eval rows, synthetic data examples, extraction workflows, document examples, generated outputs, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0897IndoxJudgeCalibrationBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the judge-calibration behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0897IndoxJudgeCalibrationBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0896OdscAgenticAiSummitPublicMethodologyBoundary.test.ts tests/gap0897IndoxJudgeCalibrationBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
