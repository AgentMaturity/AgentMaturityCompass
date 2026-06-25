# GAP-0024 - Cua public methodology versioning

- Gap: `GAP-0024`
- Dimension: Public methodology versioning
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: trycua/cua GitHub repository `https://github.com/trycua/cua`, raw README `https://raw.githubusercontent.com/trycua/cua/main/README.md`, raw Cua-Bench README `https://raw.githubusercontent.com/trycua/cua/main/libs/cua-bench/README.md`, and Cua-Bench docs `https://cua.ai/docs/cuabench/guide/getting-started/introduction`
- Retrieval: Live retrieval on 2026-06-25. GitHub API returned `trycua/cua`, MIT license, default branch `main`, 18,959 stars, 1,232 forks, 418 open issues, updated `2026-06-25T16:07:59Z`. Raw README first-200KB SHA-256 `27f2704a777d909ae55f0dc083e2dff1445d3d0de96567e29945c1ac80f426d5`; raw Cua-Bench README first-200KB SHA-256 `d921a990a2673edfd3471bfe5aabdc90af940f9d6f428e837b470f6e9541e617`; Cua-Bench docs first-200KB SHA-256 `a63f2ddff369180781094c1bc734ba953241493398a69ebea7203e43812b2564`
- Status: Done

## Relevance decision

trycua/cua is relevant to AMC because the live repository describes infrastructure to Build, benchmark, and deploy agents that use computers, and the Cua-Bench materials describe benchmark harnesses for computer-use agents in desktop environments. The reviewed source metadata references Cua-Bench, OSWorld, ScreenSpot, Windows Arena, task datasets, setup/test/oracle structure, and verifiable cross-platform environments.

That maps to existing AMC Score, Shield, and Watch public-methodology boundaries. It does not justify a Cua adapter, SDK importer, benchmark runner, desktop sandbox integration, trajectory importer, dataset mirror, parity claim, or copied upstream benchmark content. `GAP-0024` closes by requiring AMC-owned public methodology versioning proof before Cua-style computer-use benchmark evidence can be externally comparable.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant. Score claims that cite Cua-style computer-use benchmarks must carry AMC-owned eval-pack, task dataset manifest, environment image manifest, setup/test/oracle proof, validation table, thresholds, methodology lifecycle proof, signed evidence, and row hashes. |
| Shield | Relevant only when Shield receipts cite Cua-style desktop task, sandbox, trajectory, or benchmark evidence. Missing AMC evidence fails closed. |
| Enforce | Not changed. No runtime guardrail, policy engine, desktop automation, MCP server, or sandbox integration was added. |
| Vault | Not changed. No upstream trajectories, screenshots, task datasets, desktop recordings, credentials, or sandbox artifacts are stored. |
| Watch | Relevant. Watch claims that cite Cua-style trajectories, live desktop benchmark runs, or drift monitoring must use AMC-owned trace/evaluator evidence and signed receipt paths. |
| Fleet | Not changed. Computer-use agent coordination remains covered by existing Fleet primitives and is not expanded here. |
| Passport | Indirectly relevant through badge assurance and methodology hashes; no Passport schema changed. |
| Comply | License and repository facts are source-review context only; no legal, compliance, or OS-policy mapping changed. |

## Product closure

AMC now publishes `2026.06.25-r220` as the current public methodology version for this closure. The new `cua_computer_use_public_methodology` boundary requires live GitHub metadata review, repository and README snapshots, Cua-Bench docs snapshots, task dataset manifest, environment image manifest, setup script and test script hashes, oracle solution proof, run config, trajectory export manifest when claimed, validation table, threshold policy, methodology version, changelog, deprecation notice, and migration guidance, badge-assurance hash, metric owner, sample size, confidence interval, signed evidence refs, row hashes, and no-copy proof.

The methodology-versioning receipt now includes explicit Cua lifecycle audit fields such as `cuaComputerUseLiveGithubMetadataReceipt`, `cuaBenchTaskManifest`, `cuaBenchEnvironmentImageManifest`, `cuaBenchTestScriptOracleProof`, `cuaBenchRunConfig`, `cuaBenchValidationTable`, `cuaBenchThresholdPolicy`, `cuaComputerUseMethodologyVersionProof`, `cuaComputerUseBadgeAssuranceHash`, and `cuaComputerUseNoCopyBoundary`.

## Fail-closed rule

metadata-only trycua/cua evidence fails closed. A repository label, star count, fork count, issue count, README summary, docs page, default branch, license metadata, topic list, OS label, sandbox label, Cua-Bench label, OSWorld label, ScreenSpot label, Windows Arena label, local benchmark command, task filename, trajectory filename, aggregate score, copied README/docs/code/config/task/trajectory content, or source metadata is rejected unless AMC-owned eval-pack manifests, task dataset manifests, environment image manifests, setup script and test script hashes, oracle solution proof, run config, validation table, threshold policy, methodology version, changelog, deprecation notice, migration guidance, badge-assurance hash, metric owner, sample size, confidence interval, signed evidence refs, artifact hashes, row hashes, and no-copy/source-review proof are present.

## No-bloat boundary

No Cua adapter, SDK importer, desktop sandbox integration, benchmark runner, trajectory importer, OSWorld wrapper, ScreenSpot wrapper, Windows Arena wrapper, MCP integration, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, source-specific module, framework compatibility layer, dataset mirror, or parity layer was added. No copied Cua README prose, docs prose beyond minimal metadata facts, screenshots, examples, code, configs, task datasets, benchmark rows, trajectories, generated outputs, or implementation details were added.

## Verification

- TDD red run: `npx vitest run tests/gap0024CuaPublicMethodologyVersioning.test.ts --reporter=dot` failed because this source-review doc did not exist, the current methodology version was still `2026.06.25-r219`, and the Cua public-methodology boundary did not exist.
- Focused verification: `npx vitest run tests/gap0024CuaPublicMethodologyVersioning.test.ts --reporter=dot` passed, 1 file / 3 tests.
- Related public-methodology regression: `npx vitest run tests/gap0024CuaPublicMethodologyVersioning.test.ts tests/gap0015LunaryPublicMethodologyVersioning.test.ts tests/gap0001LangSmithPublicMethodologyBoundary.test.ts tests/gap0620FactCheckingFactualityReview.test.ts tests/gap0629OpenAiEvalsPublicMethodology.test.ts tests/gap0630ChemGraphMetricValidity.test.ts tests/gap0633LmEvaluationHarnessMetricValidity.test.ts tests/gap0638PocketFlowPublicMethodology.test.ts tests/gap0639OpenAiSimpleEvalsMetricValidity.test.ts tests/publicMethodology.test.ts tests/badge/badgeCli.test.ts --reporter=dot` passed, 11 files / 39 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 997 files / 8,002 tests.
