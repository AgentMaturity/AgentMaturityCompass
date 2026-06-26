# GAP-0757 - HackSynth public-methodology boundary

- Gap: `GAP-0757`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/aielte-research/HackSynth`, README `https://github.com/aielte-research/HackSynth/blob/main/README.md`, arXiv `https://arxiv.org/abs/2412.01778`
- Retrieval: `2026-06-21` via GitHub connector default-branch README, benchmark README, license, requirements, and `run_bench.py` fetches; shell network remains DNS-restricted in this environment.
- Status: skipped as a public-methodology version change; no AMC methodology version bump, diagnostic migration, badge change, HackSynth runner, autonomous-pentest runner, CTF harness, or security-agent evaluator added.

## Live source metadata

The GitHub connector fetched `aielte-research/HackSynth` from default branch `main`. The README identifies the source as `HackSynth: LLM Agent and Evaluation Framework for Autonomous Penetration Testing`, links to arXiv `2412.01778`, and describes an LLM-based autonomous penetration-testing agent with Planner and Summarizer modules. It says the benchmark framing uses PicoCTF and OverTheWire CTF sets with two hundred challenges across domains and difficulties.

Relevant source-review signals include autonomous penetration testing, CTF evaluation, benchmark JSON files, `run_bench.py`, `benchmark.json`, `config.json`, Hugging Face and Neptune.ai account/API-key setup, CUDA-device configuration, Docker/container execution for PicoCTF solvers, OverTheWire solved benchmark generation, command logs, command outputs, planner/summarizer timing, token counts, command-error counts, success flags, AGPLv3 licensing, and security-evaluation dependency surface. These facts are useful as security-agent evaluation context, but they do not define AMC scoring semantics, evidence taxonomy, changelog entries, deprecation notices, migration guidance, validation artifacts, badge behavior, or public comparability rules. No upstream README prose beyond minimal metadata facts, code, command examples, benchmark JSON rows, solver scripts, CTF flags, prompts, configs, API keys, output logs, dependency manifests, license text, or implementation details were copied into AMC.

## Relevance decision

GAP-0757 is relevant to AMC only as public-methodology boundary evidence. HackSynth-style autonomous-pentest benchmarks can inform future Score, Shield, and Watch evidence requirements for security agents, but AMC already has public methodology/versioning primitives and should not treat a security research repository as an AMC methodology source.

The accepted AMC primitive is the existing public methodology manifest and versioning path. This slice intentionally does not change that path because HackSynth repository metadata, README feature lists, CTF benchmark labels, arXiv links, code paths, dependency lists, and runner names do not provide AMC-owned methodology proof. A source citation can be retained only as context; any public methodology claim still requires AMC-owned methodology versioning receipts, validation artifacts, signed evidence refs, row hashes, badge assurance, report-binding proof, changelog entry, deprecation notice, migration guidance, and no-copy proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Background security-agent benchmark context only; no accepted public scoring-methodology proof or version bump. |
| Shield | Relevant as autonomous-pentest and CTF safety context, but no new assurance threshold or attack workflow was added. |
| Watch | Relevant as future benchmark observability context, but no new drift methodology, monitor, or alert was added. |
| Enforce | No runtime pentest policy, command policy, sandbox policy, or enforcement behavior changed. |
| Vault | No API keys, CTF files, benchmark JSON, command logs, prompts, outputs, or secure-storage behavior changed. |
| Fleet | Planner/Summarizer agent context only; no orchestration adapter or fleet topology changed. |
| Passport | No portable proof-bundle field, badge credential, or external proof token changed. |
| Comply | No compliance mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, scoring code, Watch monitor, Shield verifier, Enforce runtime, HackSynth runner, autonomous-pentest evaluator, CTF benchmark harness, PicoCTF/OverTheWire importer, Docker solver wrapper, Neptune integration, Hugging Face integration, CUDA runner, or public methodology docs changed for GAP-0757.

The closure is a no-bloat source-review boundary: HackSynth, autonomous penetration testing, Planner, Summarizer, PicoCTF, OverTheWire, CTF benchmark, benchmark JSON, `run_bench.py`, Hugging Face, Neptune.ai, CUDA, Docker, command logs, token counts, arXiv, repository, and README labels are not accepted as public methodology proof without AMC-owned methodology receipts.

## Fail-closed rule

Repository URL, README URL, repository name, arXiv id, paper title, author list, autonomous-pentest labels, Planner/Summarizer labels, CTF labels, PicoCTF labels, OverTheWire labels, benchmark JSON labels, `run_bench.py` labels, Hugging Face labels, Neptune labels, CUDA labels, Docker labels, command-log labels, token-count labels, success-flag labels, AGPLv3 license labels, local backlog metadata, or source identity alone must fail closed for public methodology claims. Passing evidence requires AMC-owned methodology versioning receipts, versioned scoring rules, changelog rows, deprecation notice, migration guidance, validation artifacts, signed evidence refs, row hashes, badge assurance, report-binding proof, and no-copy proof.

## No-bloat boundary

No HackSynth runner, autonomous-pentest agent, CTF benchmark harness, PicoCTF importer, OverTheWire importer, solver-script importer, Docker wrapper, Neptune integration, Hugging Face integration, CUDA runner, benchmark JSON mirror, command-log importer, token-accounting adapter, Planner/Summarizer clone, arXiv importer, GitHub importer, methodology version bump, badge parameter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Enforce policy module, Vault storage module, Passport field, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, code, command examples, benchmark JSON rows, solver scripts, CTF flags, prompts, configs, API keys, output logs, dependency manifests, license text, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0757HackSynthPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
