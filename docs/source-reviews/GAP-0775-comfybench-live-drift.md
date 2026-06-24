# GAP-0775 - ComfyBench live-drift boundary

- Gap: `GAP-0775`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: GitHub `https://github.com/xxyQwQ/ComfyBench`, README `https://github.com/xxyQwQ/ComfyBench/blob/main/README.md`, arXiv `https://arxiv.org/abs/2409.01392`, `requirements.txt`
- Retrieval: `2026-06-21` via GitHub connector fetch on default branch `main`; `LICENSE` path returned 404.
- Status: closed through existing live score and behavior drift receipts; no ComfyBench runner, ComfyUI adapter, or collaborative AI workflow generator added.

## Live source metadata

The live README identifies ComfyBench as an implementation for `ComfyBench: Benchmarking LLM-based Agents in ComfyUI for Autonomously Designing Collaborative AI Systems`, with authors including Xiangyuan Xue, Zeyu Lu, Di Huang, Zidong Wang, Wanli Ouyang, and Lei Bai. It links a project page, arXiv `2409.01392`, and states ComfyBench was accepted by CVPR 2025. The README describes ComfyBench as a benchmark for evaluating agents that design collaborative AI systems in ComfyUI, with performance measured by pass rate and resolve rate. It also describes ComfyAgent generating workflows, converting workflows into equivalent code, learning from existing workflows, and designing new workflows.

Relevant source-review signals include ComfyUI server/API-key configuration, required models and extensions, ComfyAgent execution, inference and evaluation scripts, generated workflow/log/output folders, `result.json`, `summary.txt`, documentation for `3205` nodes, `20` curriculum workflows, `200` task instructions, `10` sample validation tasks, and dependencies such as OpenAI, LangChain, Chroma, OpenCV, Pillow, pandas, PyYAML, and BeautifulSoup. The checked `LICENSE` path returned 404.

These facts are relevant to AMC as live score and behavior drift context only. ComfyUI workflow agents can drift when tools, nodes, models, prompts, provider behavior, workflow compilation, visual-output criteria, latency, or cost changes. They do not justify importing ComfyBench, adding a ComfyUI server adapter, mirroring workflows, or changing AMC scoring semantics. No upstream README prose beyond minimal metadata facts, task instructions, images, workflows, node documentation, configs, code, prompts, model outputs, benchmark rows, figures, tables, or implementation details were copied into AMC.

## Relevance decision

GAP-0775 is relevant to AMC through existing Watch live score and behavior drift receipts because workflow-design agents can degrade after provider, prompt, model, extension, node, dataset, or runtime changes. The accepted AMC primitive is already `runLiveScoreBehaviorDrift` with baseline/live windows, behavior signatures, drift statistics, source refs, signed evidence refs, Watch alerts, and receipt verification.

The source can be retained only as context when the live-drift packet carries AMC-owned baseline rows, live rows, score distributions, behavior signatures, evidence refs, signed evidence refs, row hashes, receipt hash, alert receipt, and no-copy proof. GitHub/README/requirements metadata, pass-rate labels, resolve-rate labels, node counts, workflow counts, or task counts alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distribution comparisons for workflow-design agent behavior. |
| Shield | Relevant through fail-closed checks for missing signed evidence and unsupported workflow, image-generation, or benchmark claims. |
| Watch | Relevant through existing live score and behavior drift alert receipts. |
| Fleet | Collaborative-AI workflow context only; no orchestration or trust topology changed. |
| Enforce | No runtime ComfyUI, model, extension, or workflow policy changed. |
| Vault | No task images, outputs, workflows, node docs, prompts, or secure-storage behavior changed. |
| Passport | No portable proof-bundle field or external benchmark credential changed. |
| Comply | No compliance mapping changed. |

## Product closure

GAP-0775 is closed by documenting the live-source boundary and adding regression coverage over the existing live-drift primitive. The positive path proves that ComfyBench workflow-agent context can be cited only with AMC-owned baseline/live rows, behavior signatures, source refs, signed evidence, Watch alert projection, and receipt verification. The negative path proves GitHub/README/requirements/workflow metadata fails closed.

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, ComfyBench runner, ComfyUI adapter, ComfyAgent workflow generator, node-doc importer, workflow importer, image-task importer, benchmark mirror, methodology version, diagnostic question bank, or scoring behavior changed for GAP-0775.

## Fail-closed rule

GitHub URL, README text, requirements metadata, repository name, arXiv link, project page, CVPR label, ComfyBench labels, ComfyAgent labels, ComfyUI labels, pass-rate labels, resolve-rate labels, node counts, workflow counts, task counts, generated-workflow labels, visual task labels, local backlog metadata, or source identity alone must fail closed for live-drift claims. Passing evidence requires AMC-owned baseline and live sample rows, score distributions, behavior signatures, evidence refs, signed evidence refs, receipt hash, Watch alert or waiver, and CI/lifecycle gate proof.

## No-bloat boundary

No ComfyBench runner, ComfyUI adapter, ComfyAgent workflow generator, node-doc importer, workflow importer, image-task importer, benchmark mirror, arXiv importer, GitHub importer, source-specific drift lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, task instructions, images, workflows, node documentation, configs, code, prompts, model outputs, benchmark rows, figures, tables, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0775ComfyBenchLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
