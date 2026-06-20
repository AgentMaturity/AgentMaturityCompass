# GAP-0597 source review: shiragannavar/Testing-RAG

Date: 2026-06-20
Worktree: `/Users/sid/AgentMaturityCompass-worktrees/gap-0597`
Branch: `agent/gap-0597`

## Gap

- Gap: `GAP-0597` / P0 / Agent evaluation and benchmarks
- Dimension: `eval-replay-corpus`
- Surfaces: Score, Shield, Watch
- Source URL: <https://github.com/shiragannavar/Testing-RAG>
- Affected AMC modules reviewed: `src/eval`, `src/diagnostic`, `tests`

## Live source metadata verified

Verified from live GitHub metadata, `git ls-remote`, and a fresh shallow clone on 2026-06-20:

- Repository: `shiragannavar/Testing-RAG`
- URL: <https://github.com/shiragannavar/Testing-RAG>
- Default branch: `main`
- HEAD: `d5bc7cf6bb2a1d5cef9e1aec4893045e99cf23a8`
- Root tree: `e21c3a29059a7d7a470a9b0fa1eaca2191af264b`
- Recursive GitHub tree: 26 entries including directories, not truncated; shallow clone file count: 18 files
- License: Apache-2.0 (`LICENSE@261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64`)
- Repository topics observed from GitHub API: `agent-evaluation`, `evaluation`, `generative-ai`, `ground-truth`, `llm`
- High-level source signals:
  - `README.md@ace3a2dee0f7840c32be1697a8488cc6d3288e11` describes ground-truth generation and RAG evaluation.
  - `eval/rag_checker.py@d78a6e79a780fd1af71dd82feb0d5195444ec91a` contains RAGChecker/Phoenix/LangChain evaluation flow and metrics export/update logic.
  - `groundtruth/ground_generator.py@6ebf301226781bf4190c168d9c99dfad0f84b752` contains document/image-derived ground-truth QA generation code.
  - `eval/checking_inputs.json@8b4dc21968f2b76de5731d8e93190716f8b441d4` is an example RAGChecker input fixture and was treated as upstream data, not copied into AMC.
  - `requirements.txt@f090dca12298704c2213c8fa9ee359bae0d82fe8` pins the Python/RAG evaluation dependency surface.
  - `.github/workflows/create-issues.yml@9faf38c810bdde9dbf95593746bd992e4a7c1e38` is issue-creation automation, not a benchmark CI receipt.

## Relevance decision

Relevant to AMC, but only through existing replayable benchmark corpus primitives. Testing-RAG is an agent/RAG evaluation source signal because it combines ground-truth generation, RAGChecker metric computation, traces/monitoring, and a sample RAGChecker input artifact. That maps to AMC's `benchmark_replay`/agent benchmark replay receipts for Score, Shield, and Watch.

It is **not** a reason to add a standalone Testing-RAG subsystem, import upstream Python, copy its sample input rows, copy README prose, or treat repository metadata as evidence. The repository has useful high-level proof requirements, but an AMC claim must still provide an AMC-owned eval pack, fixture hash, replay command, result/metric artifacts, signed evidence rows, score delta, and CI/lifecycle receipt.

## AMC-native closure

- Added source-review regression coverage in `tests/replayBenchmarkCorpus.test.ts` proving that a Testing-RAG-style RAGChecker eval maps to the existing agent benchmark replay receipt with:
  - reproducible manifest and fixture hash,
  - signed baseline/candidate evidence refs,
  - score delta,
  - row hash,
  - passing CI receipt,
  - rendered replay-corpus markdown.
- Added fail-closed coverage proving a Testing-RAG label plus GitHub metadata alone does not pass without repository snapshot, dataset/fixture, replay command, trace/result/metrics, score delta, and signed evidence proof.
- Updated methodology documentation to name the Testing-RAG-style boundary under replay-corpus claims.

## Copy/provenance boundary

No upstream code, commands, dataset rows, JSON fixtures, README prose, screenshots, workflow scripts, dependency files, or generated metrics were copied into AMC. The source was used only for live metadata, blob/tree identifiers, and high-level relevance mapping.
