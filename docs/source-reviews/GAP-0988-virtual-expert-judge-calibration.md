# GAP-0988 - virtual expert judge-calibration boundary

- Gap: `GAP-0988`
- Dimension: `eval-judge-calibration`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: OpenAlex work page at `https://openalex.org/W7131834192`, OpenAlex API record at `https://api.openalex.org/works/W7131834192`, DOI at `https://doi.org/10.59543/mmhqdg22`, publisher article page at `https://israj.org/index.php/israj/article/view/29`, publisher PDF endpoint at `https://israj.org/index.php/israj/article/download/29/9`, and Crossref API at `https://api.crossref.org/works/10.59543/mmhqdg22`
- Retrieval: `2026-06-24` live source review through OpenAlex API inspection, DOI redirect check, Crossref API inspection, publisher page metadata inspection, PDF endpoint header check, and local backlog metadata.
- Status: closed through existing judge calibration and appeal receipts; no pharmaceutical supply-chain model, virtual-expert panel simulator, fuzzy AHP engine, Z-number engine, CRITIC weighting module, article importer, OpenAlex importer, Crossref importer, DOI resolver, PDF parser, API route, CLI command, Studio panel, Watch monitor, Shield verifier, package dependency, or source-specific calibration subsystem added.
- Linear: `AMC-1267`

## Live source metadata

The OpenAlex record identifies `LLM-Assisted Virtual Expert Weight Elicitation in Pharmaceutical Supply Chains: A Z-Number Multi-Agent Framework` as a `2026` journal article in `Intelligent Systems Research and Applications Journal`, with publication_date `2026-01-10`, DOI `https://doi.org/10.59543/mmhqdg22`, open_access status `hybrid`, referenced_works_count `0`, and cited_by_count `4`. OpenAlex lists the open PDF URL as `https://israj.org/index.php/israj/article/download/29/9`.

Crossref identifies the DOI as a journal article published by Nexora Academic Press, with published and issued dates of `2026-01-10`, matching title metadata, and authors Jamal Musbah and Ibrahim Badi. The DOI redirected to `https://israj.org/index.php/israj/article/view/29`.

The publisher article page exposed Open Journal Systems metadata, journal ISSN `3120-0826`, volume `2`, first page `27`, last page `39`, modified date `2026-03-02`, subject metadata for Multi-Criteria Decision Making, Large Language Models, Z-Numbers, Pharmaceutical Supply Chain, Virtual Expert Agents, Vendor Managed Inventory, and Cognitive Simulation, plus PDF filename `Badi-3-ISRAJ-2026-v2.pdf`. The PDF endpoint returned `HTTP/2 200`, content-type `application/pdf`, and content-length `859845`.

OpenAlex concept metadata included Computer science, Ranking, Pairwise comparison, Expert elicitation, Consistency, Preference elicitation, Artificial intelligence, and Fuzzy logic.

Source-review signals include virtual expert weight elicitation, pairwise comparison, Z-Numbers, consistency checks via Consistency Ratios, aggregation across Agents LLM1, LLM2, and LLM3, CRITIC weights, Vendor Managed Inventory policy ranking, pharmaceutical supply-chain context, safety-first constraints, and appealable scoring posture. These are judge-calibration context only.

No upstream article text, abstract prose beyond short metadata facts, publisher page prose, PDF content, tables, equations, algorithms, prompts, pairwise-comparison matrices, weights, rankings, vendor policies, examples, figures, screenshots, model outputs, generated outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-0988 is relevant to AMC through the existing judge calibration and appeal primitive. The source is about virtual expert weight elicitation, pairwise scoring, consistency, confidence modeling, and ranking stability. Those ideas map to AMC's existing requirement for rubric version, calibration set, disagreement metric, appeal outcome, signed evidence refs, receipt hash, replayability, CI gate, and Watch alerts.

It does not require a new pharmaceutical supply-chain score, virtual-expert panel simulator, fuzzy AHP engine, Z-number engine, CRITIC weighting module, article importer, DOI resolver, PDF parser, Studio panel, appeal UI, or source-specific judge-calibration subsystem. OpenAlex, DOI, Crossref, publisher metadata, PDF reachability, article keywords, local backlog metadata, or source identity alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through calibrated judge receipts, rubric versions, calibration rows, disagreement metrics, and score-facing CI gates. |
| Shield | Relevant because opaque, biased, or contested judge outcomes must fail closed without signed calibration and appeal evidence. |
| Enforce | No runtime policy, virtual-expert routing, supply-chain decision rule, guardrail, or circuit breaker changed. |
| Vault | No prompt, matrix, PDF, private supply-chain artifact, API key, or secure-storage behavior changed. |
| Watch | Relevant through judge-calibration Watch alerts for row-count gaps, judge disagreement, signed-evidence gaps, and appeal outcome gaps. |
| Fleet | Multi-agent virtual-expert context only; no Fleet topology, orchestration, routing, or coordination behavior changed. |
| Passport | No portable proof-bundle schema, external token, or identity claim changed. |
| Comply | No pharmaceutical, clinical, supply-chain, NIST, ISO, SOC 2, EU AI Act, or regulatory mapping changed. |

## Product closure

No product code changed. The focused regression exercises the existing `buildJudgeCalibrationReceipt`, `verifyJudgeCalibrationReceipt`, and `buildJudgeCalibrationWatchAlerts` paths with AMC-owned synthetic fixture data.

The positive path proves virtual-expert source context can be cited only when AMC-owned calibration rows include rubric version, calibration set, disagreement metric, appeal outcome, judge prompt/output hashes, signed evidence refs, source refs, receipt hash, replayability, and a passing CI gate. The negative path fails closed when OpenAlex/DOI/Crossref/publisher metadata, article keywords, virtual-expert labels, pairwise-comparison labels, Z-number labels, consistency labels, and local backlog metadata replace signed judge-calibration evidence.

## Fail-closed rule

Paper title, DOI reachability, DOI redirect, OpenAlex reachability, Crossref reachability, publisher page metadata, PDF reachability, PDF filename, journal metadata, publisher metadata, author metadata, publication date, open-access status, concept labels, Multi-Criteria Decision Making labels, Z-Numbers labels, Pharmaceutical Supply Chain labels, Virtual Expert Agents labels, Vendor Managed Inventory labels, Consistency Ratios labels, CRITIC weights labels, Agents LLM1, LLM2, and LLM3 labels, pairwise comparison labels, safety-first labels, local backlog metadata, or source identity alone must fail closed for judge-calibration claims.

Passing evidence requires AMC-owned rubric version, calibration set, disagreement metric, appeal outcome, judge prompt/output hashes, signed evidence refs, source refs, receipt hash, CI lifecycle proof, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No pharmaceutical supply-chain model, virtual-expert panel simulator, fuzzy AHP engine, Z-number engine, CRITIC weighting module, pairwise-comparison matrix importer, Vendor Managed Inventory policy ranker, safety-first constraint engine, article importer, OpenAlex importer, Crossref importer, DOI crawler, PDF parser, PDF mirror, source metadata cache, benchmark mirror, dataset mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric lens, source-specific scoring path, or source-specific judge-calibration subsystem was added.

No upstream article text, abstract prose beyond short metadata facts, publisher page prose, PDF content, tables, equations, algorithms, prompts, pairwise-comparison matrices, weights, rankings, vendor policies, examples, figures, screenshots, model outputs, generated outputs, or implementation details were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap0988VirtualExpertJudgeCalibrationBoundary.test.ts --reporter=dot` failed before this document existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-0988-virtual-expert-judge-calibration.md'`; 3 judge-calibration primitive tests passed.
- Focused regression: `npx vitest run tests/gap0988VirtualExpertJudgeCalibrationBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0987EpanetAgenticReplayCorpusBoundary.test.ts tests/gap0988VirtualExpertJudgeCalibrationBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 835 files / 7,335 tests.
