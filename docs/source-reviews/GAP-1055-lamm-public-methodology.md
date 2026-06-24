# GAP-1055 - LAMM public methodology

- Gap: `GAP-1055`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `OpenGVLab/LAMM`
- Retrieval: GitHub CLI/API, repository contents API, branch API, commit API, release/tag API, raw README headers, raw README skim, arXiv abs/API headers, and local backlog metadata on 2026-06-25.
- Status: Done - skipped

## Relevance decision

`OpenGVLab/LAMM` is relevant to AMC as source-review context only. The source describes the NeurIPS 2023 Datasets and Benchmarks Track LAMM work and related multimodal large language model evaluation assets. It is useful background for agent-evaluation research, but it does not change AMC's public scoring methodology, methodology version, evidence taxonomy, maturity levels, badge semantics, diagnostic question bank, public limitations, deprecation notices, migration guidance, API, CLI, or Studio behavior.

No public methodology version bump is warranted. LAMM benchmark metadata alone cannot justify an AMC public methodology version bump because it is source metadata about a multimodal benchmark/ecosystem, not an AMC-owned methodology change with versioned score semantics, public changelog, migration guidance, deprecation notice, or badge impact.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Contextual only; it does not change scoring semantics, score thresholds, or methodology versioning. |
| Shield | Contextual only; it does not add safety methodology, red-team semantics, or Shield scoring rules. |
| Enforce | Not in scope; no runtime policy enforcement or circuit breaker changed. |
| Vault | Not in scope; no dataset, checkpoint, model output, config, credential, or storage behavior changed. |
| Watch | Contextual only; no observability, alerting, or drift methodology changed. |
| Fleet | Contextual only; no multi-agent orchestration or fleet methodology changed. |
| Passport | Not in scope; no trust-token or proof-bundle semantics changed. |
| Comply | Not in scope; no compliance mapping or regulatory methodology changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed.

This gap is closed as a documented no-op boundary. The regression test verifies that LAMM source metadata does not enter the public methodology manifest and that implementation modules do not contain source-specific identifiers.

## Live source facts

- Repository: `https://github.com/OpenGVLab/LAMM`
- GitHub API: `https://api.github.com/repos/OpenGVLab/LAMM`
- README API: `https://api.github.com/repos/OpenGVLab/LAMM/readme`
- Default-branch README: `https://raw.githubusercontent.com/OpenGVLab/LAMM/main/README.md`
- Project page: `https://openlamm.github.io/`
- arXiv record: `https://arxiv.org/abs/2306.06687`
- arXiv API: `https://export.arxiv.org/api/query?id_list=2306.06687`
- arXiv PDF: `https://arxiv.org/pdf/2306.06687v3`
- Latest GitHub release: `https://github.com/OpenGVLab/LAMM/releases/tag/llama1_lamm`
- Repository identity: `OpenGVLab/LAMM`.
- Repository description: `[NeurIPS 2023 Datasets and Benchmarks Track] LAMM: Multi-Modal Large Language Models and Applications as AI Agents`.
- arXiv title: `LAMM: Language-Assisted Multi-Modal Instruction-Tuning Dataset, Framework, and Benchmark`.
- primary language `Python`; language API returned Python, Shell, and Cython.
- Stars `317`; Forks `16`; Watchers API total `7`; watchers_count `317`; open issues `9`.
- default branch `main`; main branch protected `true`.
- latest main commit `ea571363883ceba58a0f724ef197ed7205e07465`; commit date `2024-03-29T08:27:38Z`; verification reason `valid`.
- Repository created at `2023-06-08T08:21:38Z`; pushed at `2024-04-16T11:30:23Z`; updated at `2026-05-19T12:12:05Z`.
- README sha `1805668101d78b7b360d609512d3af0850062d2c`; size `5700`.
- licenseInfo `null`; README states `CC BY NC 4.0`.
- release tag `llama1_lamm`; release name `efficientllama1 / vicuna based framework`; published_at `2023-09-05T19:07:25Z`.
- Git tag `llama1_lamm` points to commit `e9237c4f18707b22f7a8280e0380e70fba01e6c8`.
- Repository contents API showed `.gitignore`, `README.md`, `ckpt`, `data`, `docs`, `images`, `requirements`, and `src`.
- Branch API showed `main` plus `ChEF_moe`, `ChEF_v2`, `dev_wj`, `dev-readme`, and `multi-image`.
- GitHub repo returned HTTP/2 200.
- raw README returned HTTP/2 200 with content-length: 5700.
- arXiv returned HTTP/2 200 with content-length: 49968.
- arXiv API totalResults `1`; entry id `http://arxiv.org/abs/2306.06687v3`; published `2023-06-11T14:01:17Z`; updated `2023-11-06T07:02:19Z`; primary category `cs.CV`.
- arXiv metadata listed authors including Zhenfei Yin, Jiong Wang, Jianjian Cao, Zhelun Shi, Dingning Liu, Mukai Li, Lu Sheng, Lei Bai, Xiaoshui Huang, Zhiyong Wang, Jing Shao, and Wanli Ouyang.
- README source signal referenced Ch3Ef, ChEF, Octavius, DepictQA, MP5, 2D and 3D tasks, evaluation code, command-line demo tooling, Hugging Face/OpenDataLab datasets, checkpoints, leaderboard, and research-use license limits.

## Fail-closed rule

Reject any public-methodology claim that depends only on source metadata. The following are insufficient to alter AMC public methodology:

- Repository existence, owner, stars, forks, watchers, topics, language, branch state, protected status, commit SHA, commit date, release tag, Git tag, README SHA, repo contents, arXiv title, arXiv authors, arXiv version, NeurIPS track labels, project-page labels, dataset labels, checkpoint labels, leaderboard labels, MLLM labels, 2D/3D task labels, ChEF/Ch3Ef labels, or README license text.
- Any copied upstream source code, README prose, configs, dataset rows, benchmark outputs, checkpoints, prompts, model outputs, figures, images, videos, citations, tables, result files, or implementation details.

Any public methodology change still requires methodology version, changelog, deprecation notice, migration guidance, evidence taxonomy impact, score-semantics impact, and badge impact analysis. This source provides none of those AMC-owned change requirements, so it is skipped as public-methodology implementation evidence.

## No-bloat boundary

AMC did not add a LAMM runner, importer, adapter, MLLM benchmark mirror, ChEF integration, Ch3Ef integration, dataset mirror, checkpoint mirror, leaderboard scraper, model loader, arXiv importer, project-page scraper, multimodal evaluation subsystem, API route, CLI command, Studio panel, Watch panel, badge semantics change, question-bank change, public methodology version bump, copied source code, copied README prose, copied docs prose, copied configs, copied datasets, copied benchmark rows, copied examples, copied prompts, copied model outputs, copied figures, copied images, copied videos, or copied result files.

## Verification

- Expected red: `npx vitest run tests/gap1055LammPublicMethodologyBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1055-lamm-public-methodology.md` did not exist; the implementation leakage check passed.
- Live source retrieval:
  - `gh repo view OpenGVLab/LAMM --json nameWithOwner,description,createdAt,updatedAt,pushedAt,isArchived,isFork,isPrivate,defaultBranchRef,stargazerCount,forkCount,watchers,primaryLanguage,licenseInfo,repositoryTopics,url,homepageUrl`
  - `gh api repos/OpenGVLab/LAMM`
  - `gh api repos/OpenGVLab/LAMM/branches`
  - `gh api repos/OpenGVLab/LAMM/readme`
  - `gh api repos/OpenGVLab/LAMM/languages`
  - `gh api repos/OpenGVLab/LAMM/tags`
  - `gh api repos/OpenGVLab/LAMM/releases/latest`
  - `gh api 'repos/OpenGVLab/LAMM/contents?ref=main'`
  - `curl -sSIL https://github.com/OpenGVLab/LAMM`
  - `curl -sSIL https://raw.githubusercontent.com/OpenGVLab/LAMM/main/README.md`
  - `curl -sSIL https://arxiv.org/abs/2306.06687`
  - `curl -sSL 'https://export.arxiv.org/api/query?id_list=2306.06687'`
- Focused: `npx vitest run tests/gap1055LammPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired public-methodology boundary regression: `npx vitest run tests/gap1055LammPublicMethodologyBoundary.test.ts tests/gap1041AdaptJobRecPublicMethodologyBoundary.test.ts --reporter=dot`
- Static whitespace: `git diff --check -- . ':(exclude)AMC_OS'`
- No-bloat scan: `rg -n "OpenGVLab/LAMM|OpenLAMM|LAMM:|Language-Assisted Multi-Modal|lamm_public_methodology" src/methodology/publicMethodology.ts src/diagnostic/methodologyVersioning.ts docs/SCORING_METHODOLOGY.md src/badge/badgeCli.ts`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot`
