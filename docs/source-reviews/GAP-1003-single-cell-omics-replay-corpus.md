# GAP-1003 - Single-cell omics replay-corpus boundary

- Gap: `GAP-1003`
- Dimension: Replayable benchmark corpus (`eval-replay-corpus`)
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `Benchmarking LLM-based agents for single-cell omics analysis`
- Retrieval: live primary retrieval on 2026-06-24 from `https://openalex.org/W4414991266`, `https://api.openalex.org/works/W4414991266`, `https://doi.org/10.1186/s13059-026-03998-z`, `https://api.crossref.org/works/10.1186/s13059-026-03998-z`, `https://link.springer.com/article/10.1186/s13059-026-03998-z`, `https://github.com/lyyang01/bioagent-benchmark`, `https://api.github.com/repos/lyyang01/bioagent-benchmark`, `https://raw.githubusercontent.com/lyyang01/bioagent-benchmark/main/README.md`, `https://doi.org/10.5281/zenodo.17291196`, `https://doi.org/10.5281/zenodo.18437898`, and `https://doi.org/10.5281/zenodo.18447519`
- Status: Done

## Relevance decision

GAP-1003 is relevant to AMC, but only through the existing replayable benchmark corpus primitive. The paper and its linked code/data artifacts describe an agent benchmark in a high-stakes scientific domain, which reinforces AMC's requirement that benchmark-backed scores must be replayable from AMC-owned manifests, fixture hashes, fixed seeds, score deltas, CI receipts, signed evidence refs, source refs, and row hashes.

The source does not justify a single-cell omics runtime, bioinformatics workflow engine, Zenodo downloader, paper benchmark importer, GitHub repo adapter, dataset mirror, model runner, or source-specific evaluation subsystem. AMC should not copy the article, code, prompts, datasets, workflow outputs, benchmark rows, figures, metrics, or generated results. The product closure is a no-bloat regression boundary over existing replay-corpus receipts.

Live paper metadata reviewed:

- OpenAlex work: `https://openalex.org/W4414991266`.
- OpenAlex API: `https://api.openalex.org/works/W4414991266`.
- DOI: `https://doi.org/10.1186/s13059-026-03998-z`.
- Crossref API: `https://api.crossref.org/works/10.1186/s13059-026-03998-z`.
- Springer article: `https://link.springer.com/article/10.1186/s13059-026-03998-z`.
- Title: `Benchmarking LLM-based agents for single-cell omics analysis`.
- Journal/source: Genome Biology; publisher metadata includes Springer Science and Business Media LLC and BioMed Central.
- publication_date `2026-02-25`; version of record `2026-04-09`.
- License context: CC BY-NC-ND 4.0.
- Crossref reference count 95 and is-referenced-by count 3.
- OpenAlex type `preprint`; Crossref type `journal-article`. The DOI, Crossref, and Springer article page confirm the published article context, so this type mismatch is documented rather than used to skip the gap.
- OpenAlex reports gold open access and primary location in Genome Biology.

Benchmark context reviewed:

- The article describes a benchmarking evaluation system for LLM-based agents in single-cell omics analysis.
- The benchmark context includes 50 diverse real-world single-cell omics analysis tasks.
- The paper describes multidimensional metrics that include cognitive program synthesis, collaboration, execution efficiency, bioinformatics knowledge integration, and task completion quality.
- The Springer metadata identifies Grok3-beta as the strongest tested framework in the reported results.
- The source context includes multi-agent frameworks, self-reflection, RAG, planning, code generation, long-context handling, and context-aware knowledge retrieval.
- These facts are source-review context only. They do not become AMC benchmark rows or scoring rules.

Linked code repository reviewed:

- Repository: `https://github.com/lyyang01/bioagent-benchmark`.
- API: `https://api.github.com/repos/lyyang01/bioagent-benchmark`.
- README: `https://raw.githubusercontent.com/lyyang01/bioagent-benchmark/main/README.md`.
- Remote HEAD for `main`: `1605e6e38bd69307e2f7b68a4367de21043c89b6`.
- Public, not archived, not disabled, not a fork, default branch `main`.
- Metadata: Python, MIT License, 14 stars, 2 forks, 0 open issues, created_at `2025-01-22T09:43:49Z`, pushed_at `2026-03-18T13:54:48Z`, updated_at `2026-04-29T13:57:19Z`.
- `README.md` SHA `de52cef0f31dde081114909e7405fbbd6e4c599e`, size 7,023 bytes.
- Top-level areas reviewed include `src`, `run_workflow`, `run_eval`, `evaluation`, `database`, `prompt`, and `logs`.
- README source context describes workflow execution, evaluation execution, 50 tasks, 17 metrics, model configuration, and external dataset download links. AMC did not copy those instructions, scripts, configs, prompts, logs, or data.

Linked Zenodo records reviewed:

- Dataset DOI `https://doi.org/10.5281/zenodo.17291196`: title `Datasets for the paper "Benchmarking LLM-based agents for single-cell omics analysis"`, resource type Dataset, license `cc-by-4.0`, file `datasets_for_bioagent_benchmark.zip`, 24,437,249,791 bytes, checksum `md5:7176bab7d813011970da733af80dbcca`.
- Software DOI `https://doi.org/10.5281/zenodo.18437898`: title `bioagent-benchmark-v1.0`, resource type Software, license `mit-license`, file `bioagent-benchmark-v1.0.zip`, 19,245,990 bytes, checksum `md5:501697afadcdec419b59278effd8a1a5`.
- Supplementary results DOI `https://doi.org/10.5281/zenodo.18447519`: title `Some supplementary json results for the paper "Benchmarking LLM-based agents for single-cell omics analysis"`, resource type Dataset, license `cc-by-4.0`, file `supplementary_json_results.zip`, 34,277,528 bytes, checksum `md5:2cd0c1d0228fd1fbbbf3885d43bb1456`.
- Zenodo metadata is not replay proof unless AMC owns the replay manifest, fixture hash, fixed seed, score delta, and CI receipt.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing replayable benchmark corpus receipts that bind maturity deltas to replay manifest, fixture hash, fixed seed, score delta, signed evidence, and CI receipt. |
| Shield | Relevant as assurance context only. Paper, repo, and Zenodo metadata cannot replace signed AMC replay evidence for high-stakes scientific agent claims. |
| Enforce | Not changed. No runtime policy, workflow runner, or circuit breaker is added. |
| Vault | Not changed. No biomedical data, Zenodo archive, credential, or storage integration is added. |
| Watch | Relevant through existing regression/CI lifecycle receipts and fail-closed replay alerts. No source-specific monitor is added. |
| Fleet | Not changed. The multi-agent source context does not create AMC orchestration behavior. |
| Passport | Not changed. No external proof bundle adapter is added. |
| Comply | Not changed. This gap does not alter compliance mappings or medical/scientific claims. |

## Product closure

No product module changed for GAP-1003 because AMC already has the relevant replay-corpus primitive in `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, and `src/diagnostic/evalReplayCorpusBoundary.ts`.

The focused regression test `tests/gap1003SingleCellOmicsReplayCorpusBoundary.test.ts` proves:

- A positive AMC-owned replay row passes when it covers Score, Shield, and Watch, includes source refs, fixture hash, expected hash, fixed seed, signed baseline/candidate evidence refs, score delta, and CI-style evidence.
- A metadata-only row fails closed when the article title, DOI, OpenAlex metadata, Crossref metadata, Springer abstract, GitHub metadata, Zenodo file records, and local backlog metadata replace an AMC-owned replay manifest.
- The shared replay implementation modules do not contain the DOI, linked repository, `lyyang01/bioagent-benchmark`, or `single_cell_omics_replay_corpus` identifiers.

## Fail-closed rule

Metadata-only proof must fail closed. Article metadata, DOI resolution, OpenAlex/Crossref records, Springer abstract text, citation counts, article license, linked GitHub metadata, README claims, code repository structure, Zenodo dataset/software/result records, archive names, file sizes, and MD5 checksums do not prove an AMC maturity score.

An eval replay corpus claim can pass only when AMC has its own replay manifest, fixture hash, fixed seed, source refs, signed evidence refs, score delta, row hashes, and CI receipt tied to an AMC lifecycle or regression run.

## No-bloat boundary

No single-cell omics runtime, bioinformatics workflow engine, dataset mirror, Zenodo downloader, paper benchmark importer, GitHub repo adapter, evaluation wrapper, model runner, prompt importer, log importer, result parser, API route, CLI command, Studio panel, dependency, copied paper text, copied code, copied prompts, copied datasets, copied benchmark rows, copied figures, copied workflow outputs, copied metrics, or source-specific subsystem was added.

The paper, repository, and Zenodo records remain source-review signals only.

## Verification

- Expected-red TDD check: `npx vitest run tests/gap1003SingleCellOmicsReplayCorpusBoundary.test.ts --reporter=dot` failed only because this doc did not exist yet; the 3 replay-corpus primitive/boundary assertions passed.
- Live source retrieval:
  - `curl -fsSL https://api.openalex.org/works/W4414991266 | jq '{id,doi,title,publication_year,publication_date,type,language,open_access,primary_location,authorships:[.authorships[]? | {author:.author.display_name,institutions:[.institutions[]?.display_name]}][0:5],concepts:[.concepts[]? | {display_name,score}][0:10],updated_date,created_date}'`
  - `curl -fsSL -I https://doi.org/10.1186/s13059-026-03998-z | sed -n '1,40p'`
  - `curl -fsSL https://api.crossref.org/works/10.1186/s13059-026-03998-z | jq '.message | {DOI,title,containerTitle:."container-title",published:.published,created:.created,issued:.issued,type,publisher,license,URL,subject,referenceCount:."reference-count",isReferencedByCount:."is-referenced-by-count"}'`
  - `curl -fsSL https://doi.org/10.1186/s13059-026-03998-z | rg -n -C 3 'bioagent-benchmark|Zenodo|Benchmarking evaluation system|Grok3|50 diverse|multi-agent|self-reflection|RAG|planning|traceable decisions|executable code'`
  - `gh api repos/lyyang01/bioagent-benchmark --jq '{full_name,html_url,description,private,archived,disabled,fork,default_branch,language,stargazers_count,forks_count,open_issues_count,topics,created_at,pushed_at,updated_at,license}'`
  - `git ls-remote https://github.com/lyyang01/bioagent-benchmark.git HEAD refs/heads/main refs/heads/master`
  - `gh api repos/lyyang01/bioagent-benchmark/contents/README.md --jq '{download_url,sha,size}'`
  - `curl -fsSL https://raw.githubusercontent.com/lyyang01/bioagent-benchmark/main/README.md | rg -n 'Single-cell|omics|benchmark|agent|task|dataset|data|Zenodo|evaluation|workflow|run|metrics|Grok|planning|RAG|reflection|multi-agent|framework'`
  - `gh api repos/lyyang01/bioagent-benchmark/contents --jq '[.[] | {name,type,path,download_url}]'`
  - `curl -fsSL https://zenodo.org/api/records/17291196 | jq '{id,conceptdoi,doi,title:.metadata.title,publication_date:.metadata.publication_date,resource_type:.metadata.resource_type,creators:.metadata.creators,license:.metadata.license,version:.metadata.version,files:[.files[]? | {key,size,checksum}]}'`
  - `curl -fsSL https://zenodo.org/api/records/18437898 | jq '{id,conceptdoi,doi,title:.metadata.title,publication_date:.metadata.publication_date,resource_type:.metadata.resource_type,creators:.metadata.creators,license:.metadata.license,version:.metadata.version,files:[.files[]? | {key,size,checksum}]}'`
  - `curl -fsSL https://zenodo.org/api/records/18447519 | jq '{id,conceptdoi,doi,title:.metadata.title,publication_date:.metadata.publication_date,resource_type:.metadata.resource_type,license:.metadata.license,files:[.files[]? | {key,size,checksum}]}'`
- Final verification will be recorded after focused tests, typecheck, full suite, commit, and push.
