# GAP-0008 - Medical assistant question-level score explainability

- Gap: `GAP-0008`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Reliability of LLMs as medical assistants for the general public: a randomized preregistered study`
- Retrieval: live DOI/Nature article page, OpenAlex work page, local backlog metadata, and existing AMC methodology note, 2026-06-26
- Status: Done

## Relevance decision

GAP-0008 is relevant to AMC because it asks for question-level score explainability: why each L0-L5 question moved, which evidence was accepted, why other evidence was rejected, and what repair hint is needed. The Nature Medicine paper is source-review context for high-risk deployments and public-facing medical-assistant deployments where static benchmark strength can fail to predict human-interaction reliability.

The source reinforces AMC's existing requirement that aggregate score labels are not enough. A valid AMC closure must use AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence refs, reproducible eval pack, regression thresholds, row hash, manifest hash, replayable/fail-closed state, and Passport binding when exported.

The source does not justify a medical assistant subsystem, clinical advice workflow, Nature adapter, paper importer, user-study simulator, healthcare benchmark clone, clinical dataset mirror, DOI/OpenAlex/Crossref adapter, or medical-safety parity claim.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Primary surface. The existing `questionExplainability` receipt explains each question score with accepted evidence IDs, rejected evidence reasons, missing gates, repair hints, score receipt refs, row hashes, replayability, and fail-closed state. |
| Shield | Relevant. Shield reviewers need rejected-evidence reasons and missing gates before accepting high-risk public-facing reliability claims. |
| Enforce | Out of scope. No runtime medical-advice policy, release gate, circuit breaker, or enforcement engine changed. |
| Vault | Out of scope. No clinical data store, PHI store, DLP behavior, or data-residency behavior changed. |
| Watch | Relevant. Watch explain packets can carry the same question-level proof so operators do not rely on aggregate labels. |
| Fleet | Out of scope. No fleet topology, multi-agent scheduler, or user-study simulator changed. |
| Passport | Relevant through existing compact proof binding: Passport can carry `maturity.questionExplainabilityHash`, replayable/fail-closed flags, and row summaries. |
| Comply | Indirect only. The evidence can support audit review for high-risk contexts, but no compliance mapping changed. |

## Product closure

No product implementation module changed in this Top-100 closure. Existing AMC behavior already covers the gap:

- `buildQuestionExplainabilityReport` emits question ID, surfaces, claimed/supported/final levels, accepted evidence IDs, signed evidence refs, rejected evidence reasons, missing gate reasons, repair hints, score receipt refs, deterministic row hashes, replayability, fail-closed status, and manifest hash.
- `buildEvalScoreExplainabilityPack` projects that report into a compact proof pack that stays `fail_closed` unless reproducible eval-pack rows and fail-closed thresholds are present.
- Diagnostic JSON and Markdown include `questionExplainability`.
- Watch explain responses include `questionExplainability`.
- Shield exposes score explainability receipts for review.
- Passport binds `maturity.questionExplainabilityHash`, replayable/fail-closed flags, and a compact row summary.
- `docs/SCORING_METHODOLOGY.md` already includes a high-risk deployment caution: strong question receipts do not replace realistic human-interaction evaluation for public-facing or high-risk reliability claims.

Added focused regression coverage in `tests/gap0008MedicalAssistantQuestionExplainabilityBoundary.test.ts` and this source-review note.

Live source facts verified:

- DOI: `https://doi.org/10.1038/s41591-025-04074-y`
- Nature article page: `https://www.nature.com/articles/s41591-025-04074-y`
- OpenAlex work page: `https://openalex.org/W7128444586`
- Source title: `Reliability of LLMs as medical assistants for the general public: a randomized preregistered study`
- Journal/source: `Nature Medicine`
- Article status: open access.
- Published: 09 February 2026.
- The study involved `1,298 participants` and `ten medical scenarios`.
- The study context included GPT-4o, Llama 3, and Command R+ assistance conditions.
- The Nature page reports that LLMs performed strongly when tested alone, but public participant performance with LLM assistance did not improve against the control group.
- The Nature page describes user interactions as a deployment challenge, says `standard benchmarks` and simulated interactions did not predict observed human-interaction failures, and recommends systematic `human user testing` before public healthcare deployments.

## Fail-closed rule

Question-level score explainability fails closed when question ID is missing, accepted evidence IDs are missing, signed evidence refs are absent, rejected evidence reasons are absent, repair hint is absent, reproducible eval pack proof is absent, regression thresholds are absent, row hash is absent, manifest hash is absent, replayability is false, fail-closed state is unreported, or Passport export lacks the question-explainability binding.

Metadata-only medical-assistant paper evidence fails closed. Article title, DOI, Nature page, OpenAlex page, publication date, open-access status, participant count, scenario count, model names, benchmark findings, public medical-assistant labels, human-interaction findings, user-testing recommendation, or local backlog metadata cannot satisfy AMC question-level proof without AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, reproducible eval-pack rows, thresholds, row hashes, and Passport binding when exported.

## No-bloat boundary

No medical assistant subsystem, clinical advice workflow, healthcare benchmark clone, human-subject simulator, user-study runner, Nature adapter, DOI adapter, OpenAlex adapter, Crossref adapter, paper importer, clinical dataset mirror, model-specific medical benchmark, source-specific API/CLI, Watch monitor, Shield verifier, Passport schema change, public methodology version bump, provider parity claim, copied source prose, copied figures, copied tables, copied methods, copied transcripts, copied datasets, copied prompts, copied model outputs, copied screenshots, copied configs, or copied implementation details were added.

The paper remains source-review context only. AMC accepts only signed AMC-native question-level score explainability evidence.

## Verification

- Expected-red focused test: `npx vitest run tests/gap0008MedicalAssistantQuestionExplainabilityBoundary.test.ts --reporter=dot` first exposed one test assumption mismatch against the existing canonical question repair hint, then failed only because `docs/source-reviews/GAP-0008-medical-assistant-question-explainability.md` did not exist; 3 question-explainability/no-bloat tests passed.
- Live source checks:
  - Web channel opened `https://doi.org/10.1038/s41591-025-04074-y`, which resolved to the Nature article page and showed the title, open-access status, publication date, Nature Medicine citation, participant count, model conditions, and benchmark/human-interaction findings.
  - Web channel opened `https://www.nature.com/articles/s41591-025-04074-y` and showed the same article page.
  - Web channel opened `https://openalex.org/W7128444586`.
- Focused test: `npx vitest run tests/gap0008MedicalAssistantQuestionExplainabilityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired question-explainability regression: `npx vitest run tests/gap0008MedicalAssistantQuestionExplainabilityBoundary.test.ts tests/gap0005BraintrustQuestionExplainabilityBoundary.test.ts tests/questionScoreExplainability.test.ts tests/apiRouters.test.ts tests/passportPublicApiAndCli.test.ts --reporter=dot` passed, 5 files / 101 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: after loopback permissions were restored, `npm test -- --reporter=dot` passed, 1015 files / 8075 tests.
