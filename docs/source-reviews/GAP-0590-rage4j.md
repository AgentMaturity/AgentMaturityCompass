# GAP-0590 source review: explore-de/rage4j

Date: 2026-06-20
Worktree: `/Users/sid/AgentMaturityCompass-worktrees/gap-0590`
Branch: `agent/gap-0590`

## Relevance decision

Relevant to AMC, but only as a high-level signal for existing question-level test-suite/replayable benchmark corpus proof on the named surfaces Score, Shield, and Watch. It is not a reason to add a standalone subsystem or source-specific importer.

Rationale: the live repository metadata shows a Java LLM-evaluation project with JUnit-oriented tests, evaluator code, persistence/JUnit persistence components, assertion helpers, and small resource/test corpus signals. AMC already has a test-suite question-explainability lens that requires signed dataset, test-case, evaluator, CI, result/export, trace/tool-call, and row-hash proof. GAP-0590 is therefore closed by documenting the source boundary and adding a regression test that rejects repository-metadata-only proof.

## Live source metadata verified

GitHub API source: `https://api.github.com/repos/explore-de/rage4j`

- Repository: `explore-de/rage4j`
- URL: `https://github.com/explore-de/rage4j`
- Visibility: public
- Description: Java LLM evaluation project (treated as metadata only; no upstream prose copied)
- License: MIT (`spdx_id: MIT`), license blob `3b02e3348fda3642f58356b15440269f54bb3b8e`
- Primary language: Java; API language breakdown also included CSS, TypeScript, MDX, Dockerfile
- Default branch: `main`
- Main commit: `b9b089fe4ff340b98f4eb4d6c5cceaf8f8a0a88d`
- Main commit tree: `4729debb1984d957ed946261eb6043e20ba01efe`
- Recursive tree: 360 paths, not truncated
- Root metadata: `README.md` `c5d997bf3348e01a525c67cde4fedd177bf966c3`, `pom.xml` `f520de81ac162d6ec4a26798d568f7ed4cc3eb90`
- Interesting high-level trees:
  - evaluator code: `dev.rage4j.rage4j/src/main/java/dev/rage4j/evaluation` `6e373501a5ba02830931672581efe54d2ce77183`
  - resource corpus signals: `dev.rage4j.rage4j/src/main/resources/axcel` `8626b4573e83603d9e7092ce74579c7ff0adebab`, `dev.rage4j.rage4j/src/main/resources/paireval` `19fe2f6dcb2bec612ecdc7acddf4ec3814d1f530`
  - tests: `dev.rage4j.rage4j/src/test/java/dev/rage4j/evaluation` `a746055e2f24faa9b3c8855d28019e7b6593038d`
  - persistence: `dev.rage4j.rage4j-persist/src/main/java/dev/rage4j/persist` `84961aaf7e90055ec6954cbb6991a05bc0bafbb3`
  - JUnit persistence extension: `dev.rage4j.rage4j-persist-junit5/src/main/java/dev/rage4j/persist/junit5` `726133b7691189d5770001b5dcd542aad229f04b`
  - assertions: `dev.rage4j.rage4j-assert/src/main/java/dev/rage4j/asserts` `058ade5ff8393e3d99810b5b13a73571732b67df`
- Tags/releases observed via API: latest listed tag/release `rage4j-reactor-2.0.0`

## AMC-native closure

- Documented rage4j as a high-level source signal under the existing Question-Level Test-Suite Evaluation Proof boundary in `docs/BENCHMARKS.md`.
- Added regression coverage in `tests/questionScoreExplainability.test.ts` proving that rage4j-style repository metadata alone fails closed and cannot make a Score/Shield/Watch question replayable without concrete corpus/evaluator/CI/result/export/trace evidence.

## Copy/provenance boundary

No upstream code, commands, Maven snippets, Java examples, data rows, generated dialogs, result exports, documentation prose, release prose, screenshots, package metadata, or implementation details were copied into AMC. The source was used only to identify high-level proof requirements and metadata hashes.
