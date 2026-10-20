# Regulated judge calibration inputs

This directory contains `index.json`, an explicit pending publication status, and an empty `display-index.json` for historical documentation data. **No real calibration/model calls were authorized or performed for this status.** There are no actual human-labelled gold sets, approved error thresholds, measured model error rates or publication approval. Credential presence is not inferred or inspected here.

The documentation index is not an authority input. `pnpm gen:judge-calibration` reads both indices and the canonical 119-scenario registry to generate `docs/assurance/JUDGE_CALIBRATION.md`. `pnpm check:judge-calibration` checks identical bytes without writing. The pending-only renderer rejects measured records and approval claims; it never loads a bundle, roster, credential or capability. Public measured-rate publication remains blocked on actual human inputs, an authorized model run and Sid's explicit publication approval.

## Actual signed bundle contract

Use `src/assurance/judges/calibrationContract.ts` as the input schema and `calibrationAuthority.ts` as the admission implementation. Do not create signed-looking example approvals or copy a test fixture's identities into a real bundle.

A real bundle contains a canonical `bundle.json` with its `id`, exact `binding`, and byte references for `gold`, `scenario`, `prompt`, `rubric`, exactly two `labels` files, an optional `adjudication`, and the expert `policy`. Every reference binds a contained relative path, exact byte length and SHA-256. AMC canonical JSON bytes are required; symlinks, hard links, duplicate references, modified bytes and unsafe paths are refused. The binding pins the scenario ID and bytes, domain, provider, gold bytes, exact model, prompt/rubric bytes and temperature.

The gold file contains synthetic case inputs and stable item IDs. It does not manufacture reference labels. Two independent humans supply complete `human-labels` statements over the same binding. Disagreements require a distinct adjudicator, with exact references to both label files, a signature no earlier than either label signature and a rationale for each disputed item. With no disagreement, the current contract requires `adjudication: null`.

A separate domain expert signs `expert-policy`: minimum gold-set size, maximum FPR and FNR, policy validity, and calibration expiry. The implementation currently requires every participating role to be a distinct person; it does not infer permission for role overlap. Shape limits are not an expert-approved sample minimum. Empty positive or negative classes remain unavailable rather than zero error.

Statements use the contract's signer and signature members. The signature covers the SHA-256 of the ASCII domain `amc.assurance.calibration/<kind>/v1`, a zero byte, and canonical unsigned statement bytes. Native trust must admit the key for `independent-attestation`; workspace-owned keys cannot serve as independent reviewers. A signature alone does not prove human engagement, professional credentials or honest conflict disclosure.

Trusted operator composition separately supplies `OperatorCalibrationContext`: the workspace, expected binding, an expert roster and artifact-author provenance. It must not deserialize those maps from a bundle or request body. The default roster is empty. Every source artifact needs explicit author provenance; source authors cannot review themselves. Alias normalization is conservative and transitive, so aliases cannot supply extra independent people.

## Native process and capability limits

1. `authorizeCalibrationBundle(root, context)` verifies exact artifacts, current native trust, independent roster identities, source-author conflicts and expert policy. A ready result contains a process-local authority object.
2. `calibrateOperatorJudge(authority, currentContext)` rechecks those inputs, captures real pinned native judge requests for every gold item, derives predictions from exact boolean responses, and computes the confusion matrix. It reloads trust and artifact state after calls. No injected callback or self-reported live flag substitutes for transport evidence.
3. `calibrationStanding(calibration, currentContext)` rechecks current trust, source bytes, roster/author snapshots and expiry. `admitCapturedJudgeDecision` additionally binds a fresh evaluation call to the same workspace, scenario, judge identity and input digest. A call is consumed once; a calibration call is not an evaluation call.

Authority, calibration and call objects are held in process-local weak maps. JSON serialization, copying visible IDs/digests or casting an object cannot reopen them. There is no persisted capability-import API. After a restart, trusted composition must obtain fresh authority and calibration rather than treating saved record metadata as an admitted capability.

Both actual regulated entrypoints (`LLMJudge.evaluateRegulated` and `AMCJudgeTestRunner.evaluateRegulatedTest`) call the shared strict native path. Legacy adapter scores and AMC metric averages never mint calibration authority. The native client uses fixed provider origins, exact response-model pins and a strict boolean response; it rejects duplicate fields and bounds captured responses. Protected payloads and opted-in protected-data workspaces refuse before scoped residency admission. Public authority/evaluation errors use fixed refusal codes rather than raw paths or provider content.

The eight installed legacy adapters and five separate station-question aspects use system-of-record effect oracles with `judged:null`; their local fixture outcomes are not LLM calibration. Native assurance stays synthetic/NE, production ASR stays null, and explicit one-attempt smoke mode cannot supply a 25-attempt rate.

An admitted judgment cannot excuse an unsafe captured effect or fill a missing effect boundary; callers retain that failure/not-evaluated responsibility. Generic metadata-only diagnostics always remain not evaluated. Simulated or mocked model traffic and synthetic contract tests do not become measured calibration or observed production evidence.

## Statistics and publication

Positive means a reference that is accepted/safe. FPR is FP / (FP + TN): unsafe gold accepted by the judge. FNR is FN / (FN + TP): safe gold rejected. Both classes need actual items. Wilson 95% intervals use z = 1.96 and actual class denominators. The native policy gate compares measured point rates with the signed expert bounds; intervals are reported, not silently substituted for an approved tolerance.

Real human labels/adjudication, a named expert's minimum and tolerances, authorized native model calls, and Sid's approval to publish measured rates remain pending. The pending status index still rejects measured rows and approval claims. Historical display data has a separate generation/check path; actual native origin, human/model facts and publication approval are not established by that path. Keep raw keys, gold contents and signer-private material outside the public documentation output.


## Historical documentation data

A successful `runOperatorCalibration` or fresh `renderOperatorCalibrationReport` returns a private `documentation` projection alongside the complete private report. It uses the same freshly revalidated native snapshot, includes the source-record and projection SHA-256 digests, and omits gold paths and label identities. This ordinary data object is not a calibration capability. Keep its initial copy in the private review packet; never substitute fixture identities or mocked test calls for actual human/model facts.

The display-index shape is `{ "version": 1, "kind": "documentation_display", "rows": [] }`. This branch deliberately keeps `rows` empty. After actual results have been reviewed and Sid has authorized publishing the actual rates, the corresponding historical projections can be placed in that index. The normal generator and `--check` use one deterministic renderer; no additional approval flag or trust importer exists.

The renderer verifies strict fields, class counts, rates, Wilson intervals, chronological metadata, content digests, unique canonical scenario identities and duplicate-free JSON. These checks prove consistency only. A recomputed digest cannot authenticate native origin or establish engaged humans, real provider execution, review, publication approval or current eligibility. Submitted rows are labelled `recorded_display_only`; expired dates remain historical metadata. The source-record hash is a reference, not a public signature or an authority token. Unknown rows and approval fields are refused, while all unsubmitted canonical scenarios remain pending.

Neither generator mode loads credentials, contacts a provider or enters native admission. Read-only checking refuses drift without overwriting the document. Actual public publication remains a separate authorized release action; no measured rows or public rate publication are produced by this change.
