# GAP-0029 - Psychometrics replayable benchmark corpus

- Gap: `GAP-0029`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Evaluating General-Purpose AI with Psychometrics`
- Retrieval: live arXiv page, DOI/ACM redirect behavior, OpenAlex API, local backlog metadata, and existing AMC replay-corpus implementation, 2026-06-26
- Status: Done

## Relevance decision

GAP-0029 is relevant to AMC because it asks for a replayable benchmark corpus: versioned manifests, fixed seeds, fixture hashes, score deltas, signed evidence, and CI/lifecycle receipts that let auditors rerun the evidence behind Score, Shield, and Watch claims. The psychometrics paper is useful source-review context because it challenges task-oriented evaluation, argues for construct-oriented evaluation, discusses reliability and validity concerns in benchmarks, and frames latent constructs as a basis for understanding general-purpose AI performance.

The source reinforces AMC's existing requirement that score deltas must be replayable and evidence-linked. A valid AMC closure must use AMC-owned replay manifests, fixture hashes, fixed seeds, baseline/candidate rows, score deltas, signed evidence refs, CI receipt, Watch alert projection, Shield verification, row hashes, and fail-closed thresholds.

The source does not justify a psychometrics benchmark clone, construct-validity scoring subsystem, ACM scraper, arXiv importer, OpenAlex importer, DOI adapter, copied test forms, copied benchmark items, or source-specific replay path.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Primary surface. Replay-corpus receipts bind score deltas to deterministic fixture hashes, source refs, signed baseline/candidate evidence, and a manifest hash. |
| Shield | Relevant. Shield can verify replay receipts before accepting reliability, validity, construct, or psychometric evaluation claims. |
| Enforce | Out of scope. No runtime policy, release gate, circuit breaker, or psychometric enforcement workflow changed. |
| Vault | Out of scope. No test-form storage, private response store, secret store, DLP, or data-residency behavior changed. |
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

Added focused regression coverage in `tests/gap0029PsychometricsReplayCorpusBoundary.test.ts` and this source-review note.

Live source facts verified:

- DOI: `https://doi.org/10.1145/3769688`
- arXiv page: `https://arxiv.org/abs/2310.16379`
- ACM DOI target: `https://dl.acm.org/doi/10.1145/3769688`
- OpenAlex work/API: `https://openalex.org/W4387963810` / `https://api.openalex.org/works/W4387963810`
- Source title: `Evaluating General-Purpose AI with Psychometrics`
- Journal/source: `Communications of the ACM`
- Publisher/host: Association for Computing Machinery.
- Publication date: 2026-04-14.
- OpenAlex type: preprint.
- OpenAlex volume/issue/pages: volume `69`, issue `5`, pages `92-102`.
- OpenAlex open-access status: hybrid.
- OpenAlex indexing: arXiv, Crossref, DataCite.
- arXiv: Submitted on 25 Oct 2023 and last revised 29 Dec 2023.
- arXiv subjects: Artificial Intelligence; Computers and Society.
- arXiv/OpenAlex context covers task-oriented evaluation, construct-oriented evaluation, reliability and validity, psychometrics, latent constructs, and explaining item-level or input-level performance differences.
- Retrieval hashes:
  - arXiv page HTTP 200, effective URL `https://arxiv.org/abs/2310.16379`, first-200KB SHA-256 `d73407bf3e8805a5cc5f5fb6ee4a4dd3e842f37abaea2c85679f46e304a6ba3f`.
  - OpenAlex API HTTP 200, effective URL `https://api.openalex.org/works/W4387963810`, first-200KB SHA-256 `17cc41c9f195de6ba83f00ddfb2ed309c01d848bbb4e0cdeb0df9afa707a0a81`.
  - DOI HEAD retrieval returned a 302 redirect to the ACM article page, then a Cloudflare challenge response at the ACM target.
  - ACM article shell retrieval returned HTTP 403 and first-200KB SHA-256 `56ad8dd1cf56bf6b29528f008be3422629a675c391af3fd9f9f0f674d460a58f`; this is recorded as access behavior, not as proof content.

## Fail-closed rule

Replay-corpus evidence fails closed when Score/Shield/Watch coverage is missing, source refs are missing, signed evidence refs are absent, replay manifest is absent, fixture hash is absent, fixed seed is absent, baseline/candidate rows are absent, score delta is absent, CI/lifecycle receipt is absent, row hashes are absent, manifest hash is absent, or Watch/Shield consumers cannot verify the receipt.

Metadata-only psychometrics evidence fails closed. Article title, DOI, ACM target, arXiv page, OpenAlex metadata, publication date, journal label, publisher label, OA status, subject labels, psychometrics labels, construct-validity labels, reliability/validity claims, task-oriented evaluation labels, construct-oriented evaluation labels, latent-construct labels, benchmark critique, or local backlog metadata cannot satisfy AMC replay-corpus proof without AMC-owned fixtures, manifests, signed baseline/candidate evidence, deterministic hashes, score deltas, and CI receipts.

## No-bloat boundary

No psychometrics benchmark clone, construct-validity scorer, latent-construct model, test-form generator, item-response-theory module, ACM scraper, arXiv importer, OpenAlex importer, DOI adapter, paper parser, citation importer, source-specific API/CLI, Watch monitor, Shield verifier, Passport schema change, public methodology version bump, provider parity claim, copied source prose, copied abstract text, copied figures, copied tables, copied examples, copied test forms, copied datasets, copied prompts, copied model outputs, copied benchmark rows, copied screenshots, copied configs, or copied implementation details were added.

The paper remains source-review context only. AMC accepts only signed AMC-native replay-corpus evidence.

## Verification

- Expected-red focused test: `npx vitest run tests/gap0029PsychometricsReplayCorpusBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-0029-psychometrics-replay-corpus.md` did not exist; 3 replay-corpus/no-bloat tests passed.
- Live source checks:
  - Web channel found the arXiv, ACM DOI, OpenAlex, and repository records and verified current search/source metadata.
  - Shell retrieval fetched `https://arxiv.org/abs/2310.16379` with HTTP 200 and hash `d73407bf3e8805a5cc5f5fb6ee4a4dd3e842f37abaea2c85679f46e304a6ba3f`.
  - Shell retrieval fetched `https://api.openalex.org/works/W4387963810` with HTTP 200 and hash `17cc41c9f195de6ba83f00ddfb2ed309c01d848bbb4e0cdeb0df9afa707a0a81`.
  - Shell DOI HEAD retrieval showed `https://doi.org/10.1145/3769688` redirects to the ACM article page, which returned a Cloudflare challenge response.
  - Shell ACM article retrieval returned HTTP 403, recorded as access behavior and not proof content.
- Focused test: `npx vitest run tests/gap0029PsychometricsReplayCorpusBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired replay-corpus/API regression: `npx vitest run tests/gap0029PsychometricsReplayCorpusBoundary.test.ts tests/gap0014BiasSurveyReplayCorpusBoundary.test.ts tests/gap0007ArizePhoenixReplayCorpusBoundary.test.ts tests/replayBenchmarkCorpus.test.ts tests/apiRouters.test.ts tests/providerDriftBenchmark.test.ts --reporter=dot` passed, 6 files / 236 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1018 files / 8087 tests.
