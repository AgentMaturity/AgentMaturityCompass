# GAP-1005 - Google Vertex AI Evaluation public-methodology boundary

- Gap: `GAP-1005`
- Dimension: Public methodology versioning (`std-public-methodology`)
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: Google Vertex AI Evaluation / Google Cloud Gen AI evaluation service
- Retrieval: live official-source retrieval on 2026-06-24 from `https://cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-overview`, redirected canonical page `https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/evaluation-overview`, console entrypoint `https://console.cloud.google.com/agent-platform/evaluation`, docs links `https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/evaluation-genai-console` and `https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/evaluation-genai-sdk`, and example notebook links `https://github.com/GoogleCloudPlatform/generative-ai/blob/main/gemini/evaluation/quick_start_gen_ai_eval.ipynb`, `https://github.com/GoogleCloudPlatform/generative-ai/blob/main/gemini/evaluation/evaluating_third_party_llms_vertex_ai_gen_ai_eval_sdk.ipynb`, and `https://github.com/GoogleCloudPlatform/generative-ai/blob/main/gemini/evaluation/model_migration_with_gen_ai_eval.ipynb`
- Status: Done - skipped

## Relevance decision

GAP-1005 is relevant to AMC as competitor/source-review context only. The official Google Cloud page now resolves from the older Vertex AI generative AI URL into the Gemini Enterprise Agent Platform documentation for `Gen AI evaluation service overview`. It documents a managed evaluation service for generative model quality, including test-driven evaluation, adaptive rubrics, console workflows, SDK workflows, model comparison, and older EvalTask compatibility.

Those capabilities are useful competitive context for AMC's public methodology expectations, but they do not define AMC score semantics, badge semantics, diagnostic evidence taxonomy, methodology versioning, deprecation policy, migration guidance, or public changelog entries. Google Vertex AI Evaluation docs alone cannot justify a public methodology version bump. The correct AMC closure is to document the no-bloat boundary and keep Google-specific evaluation identifiers out of public methodology code, badge code, scoring docs, API, CLI, Studio, and diagnostic behavior.

Live official-source metadata reviewed:

- Original source URL: `https://cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-overview`.
- Canonical redirected URL: `https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/evaluation-overview`.
- Redirect/header evidence: `HTTP/2 301`, `HTTP/2 301`, and `HTTP/2 200`.
- Header metadata: `last-modified: Tue, 23 Jun 2026 16:11:25 GMT`.
- Page footer: `Last updated 2026-06-23 UTC`.
- Page title: `Gen AI evaluation service overview | Gemini Enterprise Agent Platform | Google Cloud Documentation`.
- Meta description states that Agent Platform's Gen AI evaluation service measures generative model quality using test-driven evaluation and adaptive rubrics.

Official evaluation context reviewed:

- Page headings reviewed: Gen AI evaluation service features, Evaluation dataset generation, Supported interfaces, Use cases, Evaluation workflow, Evaluation metrics, Adaptive rubrics example, Getting started with evaluations, Supported regions, Available notebooks, and What's next.
- Supported interface context includes Google Cloud console through `https://console.cloud.google.com/agent-platform/evaluation` and Python SDK workflows.
- Evaluation dataset generation includes production logs as one path for constructing task-specific evaluation datasets.
- Evaluation workflow context includes Create an evaluation dataset, Define evaluation metrics, Generate model responses, and Run the evaluation.
- Evaluation metrics context includes rubric-based metrics, Adaptive rubrics (recommended), Static rubrics, Computation-based metrics, and Custom function metrics.
- Adaptive rubric validation reports Pass or Fail results, with an example pass rate of 66.7%.
- SDK example context includes `RubricMetric.GENERAL_QUALITY`.
- Interface lifecycle context includes GenAI Client in Agent Platform SDK, marked Recommended and Preview, plus Evaluation module in Agent Platform SDK, marked GA.
- The older `EvalTask` interface is maintained for backward compatibility and documented as no longer under active development for newer adaptive-rubric methods.
- Available notebook context includes Getting Started: Quick Gen AI Evaluation, Evaluating third-party models, and Model migration.
- Model migration context mentions comparing Gemini 2.0 Flash to Gemini 2.5 Flash and highlights predefined adaptive rubric-based metrics, multi-candidate evaluation, in-notebook visualization, and asynchronous batch evaluation.

These facts are skipped as public-methodology implementation evidence. They are not copied into AMC as docs prose, sample code, notebooks, APIs, metrics, or runtime behavior.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Not changed. Google evaluation docs do not alter AMC public score semantics or methodology version. |
| Shield | Not changed. External managed-evaluation feature descriptions do not provide AMC assurance evidence. |
| Enforce | Not changed. No Google/Vertex/Gemini evaluation enforcement behavior is added. |
| Vault | Not changed. No Google Cloud credentials, datasets, notebooks, or storage integrations are added. |
| Watch | Not changed. No external evaluation monitor or Google result watcher is added. |
| Fleet | Not changed. Model comparison and third-party model examples do not create AMC fleet orchestration behavior. |
| Passport | Not changed. No portable proof bundle or Google proof adapter is added. |
| Comply | Not changed. This gap does not alter compliance mappings. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed.

No public methodology version bump was made. This source does not create an AMC methodology version, changelog, deprecation notice, or migration guidance change because it does not change public scoring semantics.

The focused regression test `tests/gap1005GoogleVertexEvaluationPublicMethodologyBoundary.test.ts` proves:

- The live official-source metadata and no-bloat decision are documented.
- The public methodology manifest does not include the original URL, canonical URL, Google Vertex AI Evaluation, Gen AI evaluation service overview, or `google_vertex_ai_evaluation_public_methodology`.
- Public methodology, methodology versioning, scoring methodology docs, and badge CLI modules do not contain Google-specific evaluation identifiers or `RubricMetric.GENERAL_QUALITY`.

## Fail-closed rule

Official Google docs, redirect metadata, last-updated timestamps, console/SDK availability, adaptive rubrics, rubric Pass or Fail examples, `RubricMetric.GENERAL_QUALITY`, GenAI Client preview status, EvalTask backward-compatibility notes, model comparison notebooks, third-party model evaluation notebooks, model migration examples, multi-candidate evaluation, in-notebook visualization, and asynchronous batch evaluation cannot prove AMC public methodology versioning.

An AMC public methodology change can pass only when there is an AMC-owned scoring semantic change with explicit methodology version, changelog, deprecation notice, migration guidance, tests, and public documentation. GAP-1005 has none of those triggers.

## No-bloat boundary

No Google/Vertex/Gemini evaluation adapter, SDK wrapper, console integration, rubric importer, notebook runner, EvalTask compatibility layer, metrics mirror, third-party-model evaluation bridge, model-migration workflow, API route, CLI command, Studio panel, dependency, copied docs content, copied notebooks, copied sample code, copied rubrics, copied metric names as implementation behavior, or source-specific subsystem was added.

The Google page remains source-review signal only.

## Verification

- Expected-red TDD check: `npx vitest run tests/gap1005GoogleVertexEvaluationPublicMethodologyBoundary.test.ts --reporter=dot` failed only because this doc did not exist yet; the implementation guard passed.
- Live source retrieval:
  - `curl -fsSL https://cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-overview | rg -n 'Vertex AI|evaluation|Evaluation|Gen AI evaluation|model evaluation|metric|rubric|prompt|judge|autorater|dataset|translation|summarization|question answering|tool|agent|pairwise|pointwise|prebuilt|custom|last updated|Last updated|2026'`
  - `curl -fsSL -I https://cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-overview | sed -n '1,40p'`
  - `curl -fsSL https://cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-overview | rg -n '<title>|meta name=\"description\"|og:title|og:description|datePublished|dateModified|Last updated'`
  - `curl -fsSL https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/evaluation-overview | sed -n '5570,5830p' | rg -n 'Gen AI evaluation|Evaluation|model-based|computation|Custom function metrics|adaptive rubrics|Rubric|Pass|Fail|evaluation-driven|console|SDK|GenAI Client|EvalTask|older interface|backward compatibility|GENERAL_QUALITY|run_inference|evaluate|dataset|metrics|pairwise|pointwise|prebuilt|custom'`
  - `curl -fsSL https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/evaluation-overview | sed -n '5830,5925p' | rg -n 'regions|notebook|Getting Started|third-party|model migration|Gemini 2.0 Flash|Gemini 2.5 Flash|predefined adaptive rubric|multi-candidate|in-notebook visualization|asynchronous batch|console|SDK'`
  - `curl -fsSL https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/evaluation-overview | rg -n '<h1|<h2|<h3' | sed -n '1,80p'`
- Final verification will be recorded after focused tests, typecheck, full suite, commit, and push.
