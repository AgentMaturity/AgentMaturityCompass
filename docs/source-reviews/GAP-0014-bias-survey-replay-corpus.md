# GAP-0014 - Bias survey replayable benchmark corpus

- Gap: `GAP-0014`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Bias in Large Language Models: Origin, Evaluation, and Mitigation`
- Retrieval: live arXiv page, MDPI article page through web retrieval, DOI redirect, OpenAlex API, local backlog metadata, and existing AMC replay-corpus implementation, 2026-06-26
- Status: Done

## Relevance decision

GAP-0014 is relevant to AMC because it asks for a replayable benchmark corpus: versioned manifests, fixed seeds, fixture hashes, score deltas, signed evidence, and CI/lifecycle receipts that let auditors rerun the exact evidence behind Score, Shield, and Watch claims. The bias survey is useful source-review context because it discusses intrinsic and extrinsic LLM bias, data-level, model-level, and output-level bias evaluation methods, pre-model, intra-model, and post-model mitigation strategies, and real-world harms in healthcare and criminal justice.

The source reinforces AMC's existing requirement that benchmark claims must be replayable and evidence-linked. A valid AMC closure must use AMC-owned replay manifests, fixture hashes, fixed seeds, baseline/candidate rows, score deltas, signed evidence refs, CI receipt, Watch alert projection, Shield verification, row hashes, and fail-closed thresholds.

The source does not justify a bias benchmark clone, fairness research subsystem, MDPI scraper, arXiv importer, OpenAlex importer, DOI adapter, copied dataset, copied benchmark row, copied mitigation taxonomy, or source-specific scoring path.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Primary surface. Replay-corpus receipts bind score deltas to deterministic fixture hashes, source refs, signed baseline/candidate evidence, and a manifest hash. |
| Shield | Relevant. Shield can verify replay receipts before accepting bias, fairness, mitigation, or safety-evaluation claims. |
| Enforce | Out of scope. No runtime fairness policy, enforcement gate, circuit breaker, or mitigation workflow changed. |
| Vault | Out of scope. No protected-attribute data store, privacy store, secret store, DLP, or data-residency behavior changed. |
| Watch | Relevant. Watch can project replay-corpus regressions and missing evidence into alertable failures. |
| Fleet | Out of scope. No fleet topology, routing, or multi-agent orchestration changed. |
| Passport | Indirect only. Replay receipts can support exported trust bundles, but no Passport schema changed. |
| Comply | Indirect only. The evidence can support audit review, but no compliance framework mapping changed. |

## Product closure

No product implementation module changed for this Top-100 closure. Existing AMC behavior already covers the gap:

- `runReplayBenchmarkCorpus` emits a replayable manifest with source refs, fixture hashes, fixed seeds, baseline/candidate rows, signed evidence refs, row hashes, score deltas, and manifest hash.
- `buildEvalReplayCorpusEvidenceReceipt` fails closed when Score/Shield/Watch coverage, source refs, signed evidence, manifest hash, fixture hash, score delta, or CI receipt proof is missing.
- The replay-corpus API/CLI path returns manifest, CI receipt, and Watch alert projection.
- Shield verifies replay receipts and Watch projects alertable failures.

Added focused regression coverage in `tests/gap0014BiasSurveyReplayCorpusBoundary.test.ts` and this source-review note.

Live source facts verified:

- DOI: `https://doi.org/10.3390/electronics15091824`
- arXiv page: `https://arxiv.org/abs/2411.10915`
- MDPI article page: `https://www.mdpi.com/2079-9292/15/9/1824`
- OpenAlex work/API: `https://openalex.org/W4404570405` / `https://api.openalex.org/works/W4404570405`
- Source title: `Bias in Large Language Models: Origin, Evaluation, and Mitigation`
- Journal/source: `Electronics`
- Publisher/host: Multidisciplinary Digital Publishing Institute.
- Publication date: 2026-04-24.
- OpenAlex type: preprint.
- OpenAlex volume/issue/pages: volume `15`, issue `9`, page `1824`.
- OpenAlex open-access status: gold.
- OpenAlex indexing: arXiv, Crossref, DataCite.
- arXiv: Submitted on 16 Nov 2024 and last revised 1 May 2026.
- arXiv subjects: Computation and Language; Machine Learning.
- arXiv and MDPI context covers intrinsic and extrinsic bias, data-level, model-level, and output-level evaluation, pre-model, intra-model, and post-model mitigation, and real-world harms in healthcare and criminal justice.
- Retrieval hashes:
  - arXiv page HTTP 200, effective URL `https://arxiv.org/abs/2411.10915`, first-200KB SHA-256 `d60223566ac3cc4e571641640a19f23e7141782ffd1296708fc2e1a4be97f459`.
  - OpenAlex API HTTP 200, effective URL `https://api.openalex.org/works/W4404570405`, first-200KB SHA-256 `25c939dcf0b47706a90fb58f13fb23a0c826884b1fa04f077fb2f7ba451d5101`.
  - DOI HEAD retrieval returned a 302 redirect to the MDPI article page.
  - Shell retrieval of the MDPI article page returned HTTP 403 and first-200KB SHA-256 `349ff5922acdcd5c4f98d24ed92f69bd178c905aa6d9ed3686482873afa72626`; web retrieval could open the article page and verify title, authors, article context, and bias examples. The shell 403 is recorded as access behavior, not as proof content.

## Fail-closed rule

Replay-corpus evidence fails closed when Score/Shield/Watch coverage is missing, source refs are missing, signed evidence refs are absent, replay manifest is absent, fixture hash is absent, fixed seed is absent, baseline/candidate rows are absent, score delta is absent, CI/lifecycle receipt is absent, row hashes are absent, manifest hash is absent, or Watch/Shield consumers cannot verify the receipt.

Metadata-only bias-survey evidence fails closed. Article title, DOI, arXiv page, MDPI page, OpenAlex metadata, publication date, journal label, publisher label, OA status, subject labels, intrinsic/extrinsic bias labels, evaluation-method labels, mitigation-stage labels, healthcare/criminal-justice harm labels, benchmark references, citation lists, or local backlog metadata cannot satisfy AMC replay-corpus proof without AMC-owned fixtures, manifests, signed baseline/candidate evidence, deterministic hashes, score deltas, and CI receipts.

## No-bloat boundary

No bias benchmark clone, fairness research subsystem, protected-attribute dataset, healthcare/legal/hiring bias workflow, MDPI scraper, arXiv importer, OpenAlex importer, DOI adapter, paper parser, citation importer, source-specific API/CLI, Watch monitor, Shield verifier, Passport schema change, public methodology version bump, provider parity claim, copied source prose, copied abstract text, copied figures, copied tables, copied examples, copied taxonomy, copied datasets, copied prompts, copied model outputs, copied benchmark rows, copied screenshots, copied configs, or copied implementation details were added.

The paper remains source-review context only. AMC accepts only signed AMC-native replay-corpus evidence.

## Verification

- Expected-red focused test: `npx vitest run tests/gap0014BiasSurveyReplayCorpusBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-0014-bias-survey-replay-corpus.md` did not exist; 3 replay-corpus/no-bloat tests passed.
- Live source checks:
  - Web channel opened `https://arxiv.org/abs/2411.10915` and verified title, authors, submitted/revised dates, related DOI, subjects, and bias-review context.
  - Web channel opened `https://www.mdpi.com/2079-9292/15/9/1824` and verified the MDPI article page title, authors, source context, and bias examples.
  - Shell retrieval fetched `https://arxiv.org/abs/2411.10915` with HTTP 200 and hash `d60223566ac3cc4e571641640a19f23e7141782ffd1296708fc2e1a4be97f459`.
  - Shell retrieval fetched `https://api.openalex.org/works/W4404570405` with HTTP 200 and hash `25c939dcf0b47706a90fb58f13fb23a0c826884b1fa04f077fb2f7ba451d5101`.
  - Shell DOI HEAD retrieval showed `https://doi.org/10.3390/electronics15091824` redirects to the MDPI article page.
  - Shell retrieval of the MDPI article page returned HTTP 403, recorded as access behavior and not proof content.
- Focused test: `npx vitest run tests/gap0014BiasSurveyReplayCorpusBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired replay-corpus regression: `npx vitest run tests/gap0014BiasSurveyReplayCorpusBoundary.test.ts tests/gap0007ArizePhoenixReplayCorpusBoundary.test.ts tests/replayBenchmarkCorpus.test.ts tests/apiRouters.test.ts tests/providerDriftBenchmark.test.ts tests/gap0968PatronusReplayCorpusBoundary.test.ts --reporter=dot` passed, 6 files / 236 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1017 files / 8083 tests.
