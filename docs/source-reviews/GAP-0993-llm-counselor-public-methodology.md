# GAP-0993 - LLM counselor public-methodology boundary

- Gap: `GAP-0993`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: OpenAlex work page at `https://openalex.org/W4415031587`, OpenAlex API record at `https://api.openalex.org/works/W4415031587`, DOI at `https://doi.org/10.1145/3772318.3791821`, ACM landing page at `https://dl.acm.org/doi/10.1145/3772318.3791821`, ACM PDF endpoint at `https://dl.acm.org/doi/pdf/10.1145/3772318.3791821`, Crossref API at `https://api.crossref.org/works/10.1145/3772318.3791821`, arXiv abstract page at `https://arxiv.org/abs/2505.02428`, arXiv PDF endpoint at `https://arxiv.org/pdf/2505.02428`, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through OpenAlex API inspection, DOI redirect check, ACM endpoint header checks, Crossref API inspection, arXiv page header check, and local backlog metadata.
- Status: Done - skipped as public-methodology implementation evidence; no public methodology version bump, badge method change, diagnostic methodology versioning change, counselor-training scorer, therapy simulator, clinical skill evaluator, ACM importer, OpenAlex importer, Crossref importer, DOI resolver, arXiv/PDF importer, dataset mirror, or source-specific public methodology path added.
- Linear: `AMC-1272`

## Live source metadata

OpenAlex identifies `Can LLM-Simulated Practice and Feedback Upskill Human Counselors? A Randomized Study with 90+ Novice Counselors` as a `2026` article with publication_date `2026-04-13`, DOI `https://doi.org/10.1145/3772318.3791821`, open access status `gold`, referenced_works_count `0`, cited_by_count `2`, and locations including the ACM DOI route plus arXiv `2505.02428`.

Crossref identifies DOI `10.1145/3772318.3791821` as a proceedings article in `Proceedings of the 2026 CHI Conference on Human Factors in Computing Systems`, publisher `ACM`, published-online `2026-04-13`, printed `2026-04-13`, page range `1-31`, reference-count `119`, and CC BY license metadata. Crossref author metadata includes Ryan Louie, Raj Sanjay Shah, Ifdita Hasan Orney, Juan Pablo Pacheco, Emma Brunskill, and Diyi Yang.

DOI resolution returned `HTTP/2 302` to `https://dl.acm.org/doi/10.1145/3772318.3791821`. From this environment, the ACM landing page and ACM PDF endpoint returned `HTTP/2 403` with `cf-mitigated: challenge`, so source-review closure uses OpenAlex, DOI, Crossref, arXiv, and endpoint reachability metadata rather than copying or parsing ACM content. The arXiv page at `https://arxiv.org/abs/2505.02428` returned `HTTP/2 200`.

OpenAlex concept and keyword metadata included Active listening, Medical education, Applied psychology, Psychology, Randomized controlled trial, Qualitative research, Dreyfus model of skill acquisition, Clinical Practice, Mental health, and Computer science. The local source signal concerns LLM-simulated practice, novice counselor skill development, behavioral performance evaluation, self-efficacy, qualitative reflections, and structured feedback, but these remain source-review context only.

No ACM article text, abstract prose beyond short metadata facts, ACM page prose, arXiv prose, PDF content, counseling scenarios, participant data, study instruments, behavioral-score rubrics, interview text, prompt text, model outputs, datasets, tables, figures, screenshots, examples, or implementation details were copied into AMC.

## Relevance decision

GAP-0993 is relevant to AMC only as public-methodology context. Counselor-training and LLM-simulated practice studies can remind AMC that user-visible Score, Shield, and Watch claims about human-skill training, clinical-adjacent feedback, simulation, or evaluation quality need methodology version, changelog, deprecation notice, migration guidance, known limitations, evidence taxonomy, signed evidence, replayable eval rows, and fail-closed thresholds.

It does not justify changing AMC public scoring semantics in this slice. The live review found a source-review signal, not an AMC-owned scoring formula, diagnostic question-bank change, badge semantics change, evidence taxonomy change, public API behavior change, CLI behavior change, Studio behavior change, or user-visible methodology behavior change. Counselor-training paper metadata alone cannot justify a public methodology version bump.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant as public-methodology context only; no Score formula, maturity level semantics, evidence taxonomy, or question-bank behavior changed. |
| Shield | Relevant as clinical-adjacent simulation and overtrust context only; no Shield verifier, red-team path, counselor-safety rule, or evidence gate changed. |
| Enforce | No runtime guardrail, clinical policy, therapy-simulation policy, circuit breaker, or enforcement path changed. |
| Vault | No counseling transcript, participant data, prompt, model output, private artifact, API key, or secure-storage behavior changed. |
| Watch | Relevant as transparency context only when Watch claims need methodology clarity; no live monitor or alert behavior changed. |
| Fleet | LLM-simulated practice is context only; no fleet routing, topology, coordination, or multi-agent evidence changed. |
| Passport | No portable proof-bundle field, external token, or passport claim changed. |
| Comply | No medical, mental-health, IRB, EU AI Act, NIST, ISO, SOC 2, or regulatory mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed.

The closure is a no-bloat public-methodology relevance decision. The counselor-training paper stays source-review context only; AMC public methodology should change only when AMC-owned score semantics, evidence taxonomy, limitations, migration guidance, badge assurance, API/CLI behavior, or user-visible methodology semantics actually change.

No public methodology version bump was made.

## Fail-closed rule

OpenAlex reachability, DOI reachability, DOI redirect identity, ACM reachability or challenge metadata, arXiv reachability, Crossref reachability, proceedings metadata, publisher metadata, open access status, publication dates, author metadata, cited-by counts, reference counts, concept labels, Active listening labels, Randomized controlled trial labels, Dreyfus model of skill acquisition labels, Mental health labels, LLM-simulated practice labels, novice counselor labels, feedback labels, self-efficacy labels, qualitative-reflection labels, local backlog metadata, or source identity alone cannot prove AMC public methodology versioning.

Passing public-methodology evidence requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, known limitations, evidence taxonomy, source-review/no-copy boundary, and an actual public scoring, diagnostic, badge, API, CLI, or user-visible methodology semantic change.

## No-bloat boundary

No counselor-training subsystem, therapy simulator, virtual patient simulator, clinical skill scorer, active-listening rubric, novice-counselor benchmark, feedback generator, qualitative-reflection analyzer, self-efficacy scorer, ACM importer, OpenAlex importer, Crossref importer, DOI resolver, arXiv importer, PDF parser, dataset mirror, study-instrument importer, prompt catalog, benchmark-row importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific public methodology path was added.

No ACM article text, abstract prose beyond short metadata facts, ACM page prose, arXiv prose, PDF content, counseling scenarios, participant data, study instruments, behavioral-score rubrics, interview text, prompt text, model outputs, datasets, tables, figures, screenshots, examples, or implementation details were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap0993LlmCounselorPublicMethodologyBoundary.test.ts --reporter=dot` failed before this document existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-0993-llm-counselor-public-methodology.md'`; 1 implementation guard passed.
- Focused regression: `npx vitest run tests/gap0993LlmCounselorPublicMethodologyBoundary.test.ts --reporter=dot` passed, 1 file / 3 tests.
- Paired regression: `npx vitest run tests/gap0992SoilScienceReplayCorpusBoundary.test.ts tests/gap0993LlmCounselorPublicMethodologyBoundary.test.ts --reporter=dot` passed, 2 files / 7 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed; narrow token scan over public-methodology implementation files found no GAP-0993 counselor-training identifiers.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 840 files / 7,354 tests.
