# GAP-0755 - Object detection provider-drift unavailable-source boundary

- Gap: `GAP-0755`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog OpenAlex `W7133353378`, DOI `10.1016/j.imavis.2026.105944`, and title `All you need for object detection: From pixels, points, and prompts to Next-Gen fusion and multimodal LLMs/VLMs in autonomous vehicles`
- Retrieval: `2026-06-21` via browser search and direct DOI attempt; exact-title and DOI searches did not surface a reachable primary source in this environment, and direct DOI opening was blocked by browser safety constraints. Shell network remains DNS-restricted in this environment.
- Status: closed through existing provider/model drift benchmark receipts; no object-detection pipeline, sensor-fusion stack, autonomous-vehicle subsystem, or multimodal VLM benchmark runner added.

## Live source metadata

The local backlog identifies a paper titled `All you need for object detection: From pixels, points, and prompts to Next-Gen fusion and multimodal LLMs/VLMs in autonomous vehicles`, DOI `10.1016/j.imavis.2026.105944`, OpenAlex work `W7133353378`, improvement dimension provider and model drift benchmark, category `Agent evaluation and benchmarks`, and concepts including benchmarking, object detection, artificial intelligence, sensor fusion, categorization, and scalability. The backlog abstract snippet frames the source around autonomous vehicles and multimodal LLM/VLM approaches. Browser verification on `2026-06-21` could not reach a primary publisher page or OpenAlex page: exact-title and DOI searches did not surface a reachable primary source in this environment, and the direct DOI URL was blocked.

These metadata facts are relevant to AMC only as provider/model drift benchmark context for multimodal perception agents. Provider or model changes can alter detection behavior, multimodal prompting, refusal behavior, latency, and cost. That does not justify copying the paper, importing AV datasets, adding a sensor-fusion pipeline, or claiming object-detection benchmark parity. No upstream paper prose, abstract text beyond local backlog metadata, datasets, images, point clouds, prompts, model outputs, benchmark rows, figures, tables, code, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0755 is relevant to AMC through existing provider/model drift benchmark receipts because multimodal perception agents need recurring canaries across provider versions. The accepted AMC primitive is already `runProviderDriftBenchmark` with provider version, canary result, drift statistic, alert or waiver, eval-pack, Watch alert, and CI gate evidence.

The source can be retained only as context when the provider-drift packet carries AMC-owned evaluator config, generated test data, metric ids, trajectory counts, trace exports, metric reports, pipeline config, source refs, signed evidence refs, row hashes, Watch alerts or waivers, and no-copy proof. DOI/OpenAlex/title metadata, object-detection labels, AV labels, sensor-fusion labels, pixel/point/prompt labels, or multimodal LLM/VLM labels alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider/model canary comparisons for multimodal perception score deltas. |
| Shield | Relevant through fail-closed checks for missing signed evidence, evaluator proof, generated test data, trace exports, and metric reports. |
| Watch | Relevant through provider-drift Watch alerts and CI/lifecycle gates when provider changes affect behavior, latency, or cost. |
| Enforce | No runtime object-detection policy, sensor-fusion policy, or autonomous-vehicle enforcement behavior changed. |
| Vault | No images, point clouds, vehicle data, prompts, outputs, or secure-storage behavior changed. |
| Fleet | Multimodal perception context only; no AV fleet topology or orchestrator changed. |
| Passport | No portable proof-bundle field or external benchmark credential changed. |
| Comply | AV safety context only; no compliance mapping changed. |

## Product closure

GAP-0755 is closed by documenting the unavailable-source boundary and adding regression coverage over the existing provider-drift primitive. The positive path proves that multimodal object-detection context can be cited only with AMC-owned canary rows, provider/model versions, evaluator proof, observability proof, source refs, signed evidence, eval-pack rows, Watch alerts or waivers, and CI gate proof. The negative path proves DOI/OpenAlex/title/object-detection metadata fails closed.

No `src/benchmarks/providerDriftBenchmark.ts`, `src/api/benchmarkRouter.ts`, `src/api/watchRouter.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, object-detection pipeline, sensor-fusion stack, autonomous-vehicle subsystem, VLM benchmark runner, image/point-cloud dataset importer, methodology version, diagnostic question bank, or scoring behavior changed for GAP-0755.

## Fail-closed rule

OpenAlex work ID, DOI, title, object-detection labels, pixels labels, points labels, prompts labels, sensor-fusion labels, autonomous-vehicle labels, multimodal LLM/VLM labels, benchmarking labels, scalability labels, local backlog metadata, or source identity alone must fail closed for provider/model drift claims. Passing evidence requires AMC-owned provider/model versions, canary rows, evaluator config hash, generated test data hash, metric ids, trajectory counts, trace exports, metric reports, pipeline config, source refs, signed evidence refs, row hashes, Watch alerts or waivers, and CI/lifecycle gate proof.

## No-bloat boundary

No object-detection pipeline, sensor-fusion stack, autonomous-vehicle subsystem, VLM benchmark runner, image dataset importer, point-cloud dataset importer, prompt importer, output importer, benchmark mirror, paper importer, Elsevier importer, OpenAlex importer, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose, abstract text beyond local backlog metadata, datasets, images, point clouds, prompts, model outputs, benchmark rows, figures, tables, code, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0755ObjectDetectionProviderDriftUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
