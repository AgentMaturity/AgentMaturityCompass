# GAP-0915 - MineAnyBuild public-methodology boundary

- Gap: `GAP-0915`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `MineAnyBuild/MineAnyBuild`, `https://github.com/MineAnyBuild/MineAnyBuild`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed the `main` branch, Star 15, Fork 1, Issues 0, Pull requests 0, 22 Commits, README.md, `requirements.txt`, repository folders `assets`, `data_curation`, `docs`, `examples`, and `mineanybuild`, No releases published, Packages 0, Python 86.8%, and Jupyter Notebook 13.2%.
- Status: Done - skipped as public-methodology implementation evidence

## Live source metadata

The live README identifies `MineAnyBuild: Benchmarking Spatial Planning for Open-world AI Agents` as a NeurIPS 2025 Datasets and Benchmarks Track benchmark. Relevant source-review signals include Spatial Planning, open-world AI agents, Minecraft, spatial intelligence, Multimodal Large Language Models, MLLM-based agents, executable architecture building plans, 4,000 curated spatial planning tasks, spatial understanding, spatial reasoning, creativity, spatial commonsense, Mineflayer, Replay Mod, Hugging Face datasets, Google Drive maps, Grabcraft raw HTML data, Proprietary MLLMs, Open-source MLLMs, `internvl.py`, `qwenvl.py`, `llavaov.py`, data curation, JSON parsing, blueprint 3D matrix conversion, and planned MineRL/MineDojo support.

Those facts are useful source-review context, but they do not change AMC public methodology versioning. MineAnyBuild is a benchmark repository for open-world spatial planning, not an AMC scoring-methodology spec. MineAnyBuild benchmark metadata alone cannot justify a public methodology version bump, methodology version, changelog, deprecation notice, or migration guidance because it does not alter AMC scoring semantics, evidence taxonomy, badge semantics, maturity levels, diagnostic question bank, or public methodology contract.

No upstream Python code, notebooks, benchmark tasks, Hugging Face data, Google Drive data, Grabcraft data, maps, Minecraft configs, Replay Mod instructions, examples, JSON schemas, prompts, blueprint matrices, evaluator scripts, metric rows, citation text, README prose beyond minimal metadata facts, screenshots, images, or implementation details were copied into AMC.

## Relevance decision

`GAP-0915` is relevant only as a public-methodology no-op and source-review boundary. MineAnyBuild may be useful benchmark context for Score, Shield, and Watch, but it does not provide an AMC-owned public scoring-methodology change.

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed. No public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed; benchmark metadata is not methodology-versioning proof. |
| Shield | No new safety methodology claim; benchmark metadata remains fail-closed. |
| Watch | No Watch methodology, monitoring, or drift behavior changed. |
| Enforce | No runtime policy changed. |
| Vault | No Minecraft assets, datasets, maps, model outputs, videos, notebook outputs, or benchmark rows stored. |
| Fleet | No multi-agent topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No product code changed. The focused regression documents the live source metadata and asserts that MineAnyBuild metadata remains absent from AMC public methodology semantics and implementation modules.

This closure is a documented skip for implementation: Spatial Planning, open-world AI agents, Minecraft, 4,000 curated spatial planning tasks, spatial understanding, spatial reasoning, creativity, spatial commonsense, Mineflayer, Replay Mod, Hugging Face, Google Drive, Grabcraft, Proprietary MLLMs, Open-source MLLMs, `internvl.py`, `qwenvl.py`, and `llavaov.py` are not public methodology versioning evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, Star 15, Fork 1, Issues 0, Pull requests 0, 22 Commits, folder names, file names, No releases published, Packages 0, Python 86.8%, Jupyter Notebook 13.2%, NeurIPS 2025 Datasets and Benchmarks Track labels, Spatial Planning labels, open-world AI agents labels, Minecraft labels, MLLM-based agents labels, 4,000 curated spatial planning tasks labels, spatial understanding labels, spatial reasoning labels, creativity labels, spatial commonsense labels, Mineflayer labels, Replay Mod labels, Hugging Face labels, Google Drive labels, Grabcraft labels, Proprietary MLLMs labels, Open-source MLLMs labels, `internvl.py` labels, `qwenvl.py` labels, `llavaov.py` labels, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing public methodology evidence requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, evidence-taxonomy change, and scoring-semantics rationale.

## No-bloat boundary

No MineAnyBuild adapter, benchmark runner, Minecraft environment, Mineflayer integration, Replay Mod processor, Hugging Face dataset importer, Google Drive downloader, Grabcraft crawler, map loader, blueprint parser, JSON parser, MLLM inference wrapper, InternVL/QwenVL/LLaVA-OV runner, MineRL/MineDojo integration, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Python code, notebooks, benchmark tasks, Hugging Face data, Google Drive data, Grabcraft data, maps, Minecraft configs, Replay Mod instructions, examples, JSON schemas, prompts, blueprint matrices, evaluator scripts, metric rows, citation text, README prose beyond minimal metadata facts, screenshots, images, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0915MineAnyBuildPublicMethodologyBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; the public-methodology implementation leakage check already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0915MineAnyBuildPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0914CellAgentProviderDriftBoundary.test.ts tests/gap0915MineAnyBuildPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
