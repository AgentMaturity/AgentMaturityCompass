# GAP-1020 - AgentCPM provider drift

- Gap: `GAP-1020`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `OpenBMB/AgentCPM`
- Retrieval: GitHub API, raw README/LICENSE, repository contents API, commit API, release API, Hugging Face model pages, ModelScope model pages, and arXiv API on 2026-06-24
- Status: Done

## Relevance decision

`GAP-1020` is relevant to AMC because the backlog asks for provider and model drift proof for an agent-evaluation source. The live repository metadata identifies `OpenBMB/AgentCPM` as a Python repository for training and evaluating LLM agents, with public agent/model artifacts and benchmark-facing README claims. That context maps to AMC's existing provider drift receipts: provider version, canary results, drift statistic, signed evidence, replayable eval-pack rows, Watch projection, and CI or lifecycle gate output.

This does not justify adding an AgentCPM runtime, benchmark mirror, model downloader, tool sandbox integration, or AgentDock/AgentRL/AgentToLeaP wrapper. AgentCPM is source-review context only; AMC accepts it only when attached to AMC-owned provider drift evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through benchmark-backed provider/model drift receipts that can affect maturity proof. |
| Shield | Relevant only when canary rows include signed evidence and guardrail/refusal/invalid-action proof. |
| Enforce | Not changed; no runtime enforcement hook or circuit breaker was added for this source. |
| Vault | Not changed; no model, dataset, local file, or private-knowledge-base material was imported. |
| Watch | Relevant through existing Watch alert projection for drift, fail-closed evidence, and waiver state. |
| Fleet | Not changed for this gap; long-horizon agent orchestration context is not a Fleet implementation request here. |
| Passport | Not changed; source metadata is not portable trust proof. |
| Comply | Not changed; no regulatory mapping or clinical/legal claim was added. |

## Product closure

The existing AMC primitive already covers this gap's required acceptance path:

- `runProviderDriftBenchmark` requires comparable baseline/candidate canary rows with provider/model version, sample and trajectory counts, metric evidence, signed evidence, evaluator configuration, observability evidence, and threshold policy.
- `buildProviderDriftEvalPack` turns accepted comparisons into replayable rows with row hashes and source refs.
- `buildProviderDriftWatchAlerts` projects failing drift or missing-evidence states to Watch.
- `buildProviderDriftCiGate` fails closed in CI/lifecycle mode when evidence is incomplete.

The regression uses an AMC-owned synthetic AgentCPM-style long-horizon canary packet and a metadata-only negative packet. No `src/benchmarks`, `src/watch`, or `src/api` implementation changes were needed because the current generic provider drift path already produces the required provider version, canary results, drift statistic, and alert or waiver proof.

## Live source facts

- GitHub repository: `OpenBMB/AgentCPM` at `https://github.com/OpenBMB/AgentCPM`.
- GitHub API: `https://api.github.com/repos/OpenBMB/AgentCPM`.
- Description: end-to-end infrastructure for training and evaluating LLM agents.
- Language: `Python`.
- License: `Apache License 2.0` / `Apache-2.0`.
- Default branch: default branch `main`.
- Repository counts on retrieval: 810 stars, 70 forks, 7 open issues.
- Repository timestamps: created_at `2026-01-08T06:08:33Z`, pushed_at `2026-02-09T13:39:47Z`, updated_at `2026-06-24T08:49:56Z`.
- Current HEAD: `4a43561e790c154292798b3edd50171f71241cec`, message `add report`, HEAD verification `unsigned`.
- README API: `README.md`, size `12066`, README sha `af860ad5bf93c9bf13c97d022c81ade9939a2204`, raw URL `https://raw.githubusercontent.com/OpenBMB/AgentCPM/main/README.md`.
- LICENSE API: `LICENSE`, size `11357`, LICENSE sha `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64`, raw URL `https://raw.githubusercontent.com/OpenBMB/AgentCPM/main/LICENSE`.
- Root contents include `.gitignore`, `.gitmodules`, `AgentCPM-Explore`, `AgentCPM-Report`, `LICENSE`, `README.md`, `README_zh.md`, and `assets`.
- Release API returned no latest release.
- Contents APIs checked:
  - `https://api.github.com/repos/OpenBMB/AgentCPM/contents/AgentCPM-Explore?ref=main`
  - `https://api.github.com/repos/OpenBMB/AgentCPM/contents/AgentCPM-Report?ref=main`
- `AgentCPM-Explore` contents include `AgentDock`, `AgentRL`, `AgentToLeaP`, `quickstart.py`, `sft`, and `src`.
- `AgentCPM-Report` contents include `README.md`, `UltraRAG`, `agentcpm-report-demo`, `examples`, `prompts`, and `servers`.
- README source facts reviewed as metadata only: `AgentCPM-Explore`, `AgentCPM-Report`, `MiniCPM4.1-8B`, 4B parameters, `AgentDock`, `AgentRL`, `AgentToLeaP`, `GAIA`, `HLE`, `BrowseComp`, `XBench`, `BASE_URL`, `API_KEY`, `MODEL_NAME`, `config.toml`, `docker compose up -d`, `quickstart.py`, `outputs/quickstart_results/`, and `dialog.json`.
- Model pages returned HTTP 200:
  - `https://huggingface.co/openbmb/AgentCPM-Explore`
  - `https://huggingface.co/openbmb/AgentCPM-Report`
  - `https://modelscope.cn/models/OpenBMB/AgentCPM-Explore/`
  - `https://modelscope.cn/models/OpenBMB/AgentCPM-Report/`
- arXiv records reviewed through the arXiv API:
  - `https://arxiv.org/abs/2602.06485`, title `AgentCPM-Explore: Realizing Long-Horizon Deep Exploration for Edge-Scale Agents`, published `2026-02-06T08:24:59Z`.
  - `https://arxiv.org/abs/2602.06540`, title `AgentCPM-Report: Interleaving Drafting and Deepening for Open-Ended Deep Research`, published `2026-02-06T09:45:04Z`.

## Fail-closed rule

AgentCPM repository facts, README claims, Hugging Face pages, ModelScope pages, arXiv records, model names, Docker setup notes, tool-sandbox labels, benchmark names, and `dialog.json` traces are not provider drift proof by themselves. AMC must fail closed unless the submitted provider drift packet includes:

- provider/model version,
- canary results,
- drift statistic or comparable baseline/candidate comparison,
- signed evidence refs,
- replayable eval-pack rows with row hashes,
- evaluator configuration evidence,
- observability trace and metric report evidence,
- threshold policy,
- Watch alert or waiver,
- CI/lifecycle gate result.

## No-bloat boundary

No upstream code, README prose, prompts, configs, benchmark rows, datasets, model weights, Docker files, examples, outputs, tool traces, screenshots, or chain-of-thought content were copied into AMC.

No AgentCPM adapter, AgentDock wrapper, AgentRL runner, AgentToLeaP runner, UltraRAG integration, model downloader, benchmark mirror, quickstart runner, sandbox controller, API route, CLI command, Studio panel, package dependency, or source-specific provider-drift module was added.

## Verification

- TDD expected failure before doc creation: `npx vitest run tests/gap1020AgentCpmProviderDriftBoundary.test.ts --reporter=dot` failed only because this document did not exist; 3 provider-drift primitive tests passed.
- Live source retrieval:
  - `curl -fsSL https://api.github.com/repos/OpenBMB/AgentCPM`
  - `curl -fsSL https://api.github.com/repos/OpenBMB/AgentCPM/readme`
  - `curl -fsSL 'https://api.github.com/repos/OpenBMB/AgentCPM/contents/LICENSE?ref=main'`
  - `curl -fsSL https://api.github.com/repos/OpenBMB/AgentCPM/commits/main`
  - `curl -fsSL 'https://api.github.com/repos/OpenBMB/AgentCPM/contents?ref=main'`
  - `curl -fsSL 'https://api.github.com/repos/OpenBMB/AgentCPM/contents/AgentCPM-Explore?ref=main'`
  - `curl -fsSL 'https://api.github.com/repos/OpenBMB/AgentCPM/contents/AgentCPM-Report?ref=main'`
  - `curl -fsSL 'https://api.github.com/repos/OpenBMB/AgentCPM/releases/latest'`
  - `curl -fsSL https://raw.githubusercontent.com/OpenBMB/AgentCPM/main/README.md`
  - `curl -fsSL 'https://export.arxiv.org/api/query?id_list=2602.06485,2602.06540'`
  - `curl -fsSL -o /dev/null -w ... -L https://huggingface.co/openbmb/AgentCPM-Explore`
  - `curl -fsSL -o /dev/null -w ... -L https://huggingface.co/openbmb/AgentCPM-Report`
  - `curl -fsSL -o /dev/null -w ... -L 'https://modelscope.cn/models/OpenBMB/AgentCPM-Explore/'`
  - `curl -fsSL -o /dev/null -w ... -L 'https://modelscope.cn/models/OpenBMB/AgentCPM-Report/'`
- `npx vitest run tests/gap1020AgentCpmProviderDriftBoundary.test.ts --reporter=dot`: PASS, 1 file / 4 tests.
- `npx vitest run tests/gap1009VoltAgentAwesomeAiAgentPapersProviderDriftBoundary.test.ts tests/gap1020AgentCpmProviderDriftBoundary.test.ts --reporter=dot`: PASS, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: PASS.
- Narrow no-bloat token scan over `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, and `src/api/benchmarkRouter.ts`: PASS, no AgentCPM source identifiers.
- `npm run typecheck`: PASS.
- `npm test -- --reporter=dot`: PASS, 867 files / 7,455 tests.
