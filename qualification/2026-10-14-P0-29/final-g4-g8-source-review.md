# P0-29 final-status review, G4–G8 — 14 October 2026

User directed skipping P0-29. This artifact finishes only the already-started read-only audit. It is unqualified review debt; the parent reported stopping the broad runner with exit130. No status, routing, source, test, tracker or freeze change is applied.

Accepted source target: `5ea5e866a42acd5c8228a712e9b8c1d9f18c745c`. The review read committed Git objects rather than dirty documentation in `/Users/sid/.codex/worktrees/p0-29-qualification/AgentMaturityCompass`.

Scope: 35 final rows (14 implemented,9 deleted,12 relabelled): G4 2,G5 8,G6 12,G7 0,G8 13, including supplemental G8-25b. All24 cited historical commits were inspected as ancestors of main. That establishes provenance only.

At review start,39 source references across34 files matched main blobs/hashes and their stored excerpt ranges. These are subset counts. The full current candidate has202 evidence files,275 snippets and480 named inventory files. Earlier63/160 counts concerned only the38 missing-owner rows.

## Material findings

### review-G8-14 — final status scope defect

The process-local counter disclaimer is present, but it does not dispose of the original six unwired hooks. The second header still claims production bridging, and main-wide grep finds the hook names only in definitions/comments and src/index.ts exports, not runtime callers. A final relabelled disposition is broader than the demonstrated counter clarification; retain as unresolved review debt.

**Proposed treatment:** Reclassify only after scope review to a non-final disposition with an explicit successor or unresolved routing debt. This proposal is not applied and not qualified.

**State:** Unresolved review debt; P0-29 skipped.

Evidence: `src/ops/productionWiring.ts:4-11`; `src/ops/productionWiring.ts:15-33`; `src/ops/productionWiring.ts:134,211,274,310,346,410`; `src/index.ts:1693-1699`; `main-wide git grep of the six exact hook names`.

### review-G8-16 — whole scope consolidation limit

The three named divergent tables now import shared canonical definitions and agree on SELF_REPORTED=0.4. The fourth named evidenceCollector still uses independent literals 0.4 and 1.0. Its present values match, so no current numeric divergence is established, but a claim that all four paths have one imported table is unsupported. Keep complete consolidation acceptance explicit.

**Proposed treatment:** Confirm the three-table remedy narrowly and retain the fourth path as explicit scope debt; do not assert whole-product canonicalization. No current numeric divergence or new assignment is claimed.

**State:** Unresolved scope review debt; P0-29 skipped.

Evidence: `src/score/trustWeights.ts:28-40`; `src/score/evidenceIngestion.ts:27-30`; `src/score/formalSpec.ts:5-31`; `src/score/modelDrift.ts:203-205`; `src/score/evidenceCollector.ts:30-34`; `src/score/evidenceCollector.ts:71-76`.

### review-G6-04 — current absence witness gap

All five literal original secret filenames are absent from accepted main; examples are intentionally different names. The refreshed structured witness has empty paths and retains the five only as historicalPaths. That is inadequate as a current five-member witness until its observation is stated explicitly.

**Proposed treatment:** Preserve historicalPaths and add a truthful current five-member absence witness in a later authorized source-evidence refresh. No deletion, status or routing action follows.

**State:** Citation/absence witness correction debt; P0-29 skipped.

Evidence: `accepted main tree: five historicalPaths in absenceEvidence`; `.gitignore:119-124`.

### review-citations — evidence range scope gap

Some original cited ranges omit the actual current statements that support a narrow remedy. G4-36 needs baseline write persistence at119-137; compose/K8s secret ignores are .gitignore119-124; pickle ignore is115-117; Studio target inheritance is Dockerfile43-59 and80-89. Whole-file blob/hash identity alone cannot make an unrelated line range evidence.

**Proposed treatment:** Retain or correct citation anchors only as unqualified review debt; do not treat the interrupted run as passing qualification.

**State:** Root reported citation corrections will be retained as unqualified review debt.

### review-G5-31 — over specific header claim

No learned-ML implementation is supported in the named generator, but the header says generationMethod is template for every attack while methods return evolutionary at237 and hybrid at299. The narrow no-ML relabel is confirmed; the stronger all-template claim is not.

**Proposed treatment:** Do not repeat the all-template claim in reconciliation evidence. Any product-header correction remains successor work, outside this skipped P0-29 review.

**State:** Unresolved wording debt.

Evidence: `src/shield/dynamicAttackGenerator.ts:5-8`; `src/shield/dynamicAttackGenerator.ts:237`; `src/shield/dynamicAttackGenerator.ts:299`.

### review-provenance-text — mixed old new main labels

Several row evidence strings retain main tree55a5f121d while structured absenceEvidence names current main5ea5e866a. Preserve the old assertion as history and distinguish current witnesses; do not read the old label as current qualification.

**Proposed treatment:** A later authorized evidence refresh should label historical and current observations separately.

**State:** Unqualified provenance clarification debt.

## Per-row source verdicts

Every confirmation below is limited to the stated named remedy or relabel. No new behavior test or release qualification ran.

- **G4-36 (implemented) — confirmed narrowly:** The source scans all TS files, rejects new over-cap files and growth above a recorded budget, and --update persists lowered budgets. This implements the named descending-ratchet replacement; it does not compel monolith decomposition or resume G4. Evidence: `scripts/architecture-boundaries-check.mjs:65-105`; `scripts/architecture-boundaries-check.mjs:119-137`.
- **G4-40 (deleted) — confirmed named deletion:** Both explicitly named dead CLI files are absent from the accepted main tree. This is repository absence only. Evidence: `accepted main tree: src/cli-watch-commands.ts`; `accepted main tree: src/cli-new-commands.ts.fragment`.
- **G5-11 (implemented) — confirmed narrowly:** The seven-value enum is replaced by a nonempty alphanumeric identifier schema. Registry resolution separately checks membership through getAssurancePack. This fixes rejection of the registry own ids by the old fixed enum; it is an alternative to generating an enum, not proof of every consumer or arbitrary id admission. Evidence: `src/assurance/assuranceSchema.ts:9-25`; `src/assurance/packs/index.ts:296-305`.
- **G5-21 (relabelled) — confirmed named relabel:** The main whitepaper explicitly says its v1 filename is historical for link stability and header version 2.0 is authoritative. No rename or technical version qualification is claimed. Evidence: `whitepaper/AMC_WHITEPAPER_v1.md:4-10`.
- **G5-22 (relabelled) — confirmed named relabel:** The buried Unreleased block is explicitly labelled historical and shipped; the block is retained rather than deleted. This supports relabelled, not removed. Evidence: `CHANGELOG.md:589-598`.
- **G5-29 (relabelled) — confirmed named relabel:** The quickstart headline and introductory task distinction replace the contradictory two/five minute claims. No measured time-to-value is established. Evidence: `docs/QUICKSTART.md:1-9`.
- **G5-31 (relabelled) — confirmed narrowly with wording debt:** The generator rejects a learned-ML description and uses templates, string heuristics and randomized combinations. The historical redteam path resolves to the shield implementation. However, its header claim that every generationMethod is template is inaccurate: evolutionary and hybrid branches exist; do not reproduce that stronger claim. Evidence: `src/shield/dynamicAttackGenerator.ts:1-9`; `src/shield/dynamicAttackGenerator.ts:194-245`; `src/shield/dynamicAttackGenerator.ts:277-301`.
- **G5-32 (relabelled) — confirmed named relabel:** The named profiler header describes robust z-score/MAD statistics and explicitly says not machine learning. No new model capability is built or qualified. Evidence: `src/watch/behavioralProfiler.ts:1-16`.
- **G5-33 (relabelled) — confirmed named relabel:** The named framework header says English-only scaffold, locale list as schema intent, and no current CLI/report t() path. This confirms that file relabel, not multilingual product support or public-copy completeness. Evidence: `src/i18n/i18nFramework.ts:1-7`.
- **G5-34 (implemented) — confirmed narrowly:** The named LLM/PII/BOM/OTel packages are outside default dependencies and in explicit unused-reserved optional extras. This confirms removal from default installation declarations, not package installation execution. Evidence: `platform/python/pyproject.toml:14-41`; `platform/python/pyproject.toml:43-55`.
- **G6-02 (deleted) — confirmed named deletion:** test_model.pkl is absent from the accepted tree. Its ignore rule is at current .gitignore:115-117, outside the candidate cited 98-110 range. Existing local copies and historical exposure are unaffected. Evidence: `accepted main tree: test_model.pkl`; `.gitignore:115-117`.
- **G6-03 (implemented) — confirmed narrowly:** Kustomization does not include secret.yaml; the real secret path is absent and ignored while the example remains separate. This removes deployment of the committed known placeholder file, not operator deployment qualification. Evidence: `deploy/k8s/kustomization.yaml:3-14`; `.gitignore:119-124`; `accepted main tree: deploy/k8s/secret.yaml`.
- **G6-04 (deleted) — confirmed named deletion with witness debt:** All five literal original secret filenames are absent from accepted main; examples are intentionally different names. The refreshed structured witness has empty paths and retains the five only as historicalPaths. That is inadequate as a current five-member witness until its observation is stated explicitly. Evidence: `accepted main tree: five historicalPaths in absenceEvidence`; `.gitignore:119-124`.
- **G6-05 (implemented) — confirmed narrowly:** The full main Dockerfile has no baked AMC_VAULT_PASSPHRASE ENV. Studio bootstrap requires readable runtime secrets, and production defaultPassphrase throws without a credential. VITEST fallback and operator provisioning remain separate acceptance. Evidence: `Dockerfile:1-89`; `docker/entrypoint.sh:34-52`; `src/vault/vault.ts:126-144`.
- **G6-06 (implemented) — confirmed narrowly:** Plain Compose builds root Dockerfile studio target with read-only/tmpfs/cap-drop/no-new-privileges controls. Runtime user is 10001 and studio inherits runtime; divergent deploy/compose/Dockerfile is absent. No container or deployment ran in this review. Evidence: `deploy/compose/docker-compose.yml:11-46`; `Dockerfile:43-59`; `Dockerfile:80-89`; `accepted main tree: deploy/compose/Dockerfile`.
- **G6-11 (relabelled) — confirmed named relabel:** All four named original members are disposed of narrowly: watch output signed:false, AgentBus contentDigest, identity provenanceTag explicitly noncryptographic, and selfModelCalibration absent. This does not add authenticity proof. Evidence: `src/watch/outputAttestation.ts:12-32`; `src/watch/agentBus.ts:16-35`; `src/diagnostic/identityStability.ts:43-50`; `accepted main tree: src/diagnostic/selfModelCalibration.ts`.
- **G6-12 (relabelled) — confirmed named relabel:** The named module explicitly says it is not a ZK proof system, describes broken toy protocols and denies a privacy guarantee. This is non-production documentation, not repaired/vetted cryptography. Evidence: `src/vault/zkPrivacy.ts:1-32`.
- **G6-13 (implemented) — confirmed narrowly:** The composite action fixes version 1.2.0, downloads its archive and SHA256SUMS, checks sha256sum, then installs the archive; moving curl|sh execution is gone. Published assets and installation execution were not checked. Evidence: `action.yml:24-31`.
- **G6-14 (implemented) — confirmed narrowly:** The consumer template uses the same versioned archive and checksum path instead of moving curl|sh. This confirms template source only, not downstream execution or public archive availability. Evidence: `.github/workflows/amc-score.yml:48-55`.
- **G6-19 (implemented) — confirmed narrowly:** All three named extraction wrappers call extractValidatedTarGzipArchive with explicit archive limits. The shared helper inspects before tar and validates the extracted tree afterward. No extraction or malicious-archive test ran here. Evidence: `src/audit/binderArtifact.ts:50-73`; `src/audit/binderVerifier.ts:30-54`; `src/passport/passportArtifact.ts:27-50`; `src/security/safeTarArchive.ts:154-199`.
- **G6-25 (deleted) — confirmed named deletion:** All three named internal/competitive root documents are absent and the actual filename family is ignored. Historical publication is not erased; other internal docs are outside this named deletion set. Evidence: `accepted main tree: three absenceEvidence paths`; `.gitignore:91-97`.
- **G6-26 (deleted) — confirmed named deletion:** All four original temp dump files are absent and .tmp-* is ignored. This does not delete or inspect current local runtime dumps. Evidence: `accepted main tree: four absenceEvidence paths`; `.gitignore:115-117`.
- **G8-04 (implemented) — confirmed narrowly:** The release bundle passes an OS-tmpdir cache path to npm. This prevents this writer from creating its cache in the worktree; it does not prove old local cache data moved or was removed. Evidence: `src/release/releaseBundle.ts:120-130`.
- **G8-07 (relabelled) — confirmed named relabel:** Enterprise IAM declares itself an embedder toolkit, identifies AMC real authorization paths and denies that its mere presence means AMC RBAC is enabled. Missing runtime wiring is not implemented. Evidence: `src/auth/enterpriseIam.ts:20-31`.
- **G8-08 (implemented) — confirmed narrowly:** The judge wrapper delegates to ProductionLLMJudgeEngine, which makes a real client request and throws without an API key. No hardcoded default score remains in that named transport path; no external judge call was made. Evidence: `src/eval/llmJudgeEngine.ts:350-365`; `src/eval/llmApiIntegration.ts:312-336`; `src/eval/llmApiIntegration.ts:339-353`.
- **G8-09 (deleted) — confirmed named deletion:** The named unused llmJudgeCli.ts is absent from main. No claim is made that its command was wired or local copies removed. Evidence: `accepted main tree: src/eval/llmJudgeCli.ts`.
- **G8-10 (relabelled) — confirmed named relabel:** The adapter is documented as a standalone embedder handler with a prototype in-memory store, explicitly not mounted by AMC, and directs operators to identity/scim. This is a boundary relabel, not server consolidation. Evidence: `src/integrations/scimAdapter.ts:1-16`.
- **G8-14 (relabelled) — partial final status defect:** The process-local counter disclaimer is present, but it does not dispose of the original six unwired hooks. The second header still claims production bridging, and main-wide grep finds the hook names only in definitions/comments and src/index.ts exports, not runtime callers. A final relabelled disposition is broader than the demonstrated counter clarification; retain as unresolved review debt. Evidence: `src/ops/productionWiring.ts:4-11`; `src/ops/productionWiring.ts:15-33`; `src/ops/productionWiring.ts:134,211,274,310,346,410`; `src/index.ts:1693-1699`; `main-wide git grep of the six exact hook names`.
- **G8-15 (relabelled) — confirmed narrowly:** Caller supplied module outputs now use self_reported and 0.4, not observed at 0.7. The separately retained guard-ledger path is not part of that narrow relabel and its provenance was not qualified here. Evidence: `src/score/evidenceCollector.ts:14-42`.
- **G8-16 (implemented) — confirmed narrowly with scope debt:** The three named divergent tables now import shared canonical definitions and agree on SELF_REPORTED=0.4. The fourth named evidenceCollector still uses independent literals 0.4 and 1.0. Its present values match, so no current numeric divergence is established, but a claim that all four paths have one imported table is unsupported. Keep complete consolidation acceptance explicit. Evidence: `src/score/trustWeights.ts:28-40`; `src/score/evidenceIngestion.ts:27-30`; `src/score/formalSpec.ts:5-31`; `src/score/modelDrift.ts:203-205`; `src/score/evidenceCollector.ts:30-34`; `src/score/evidenceCollector.ts:71-76`.
- **G8-21 (implemented) — confirmed narrowly:** Self-attestation remains SELF_REPORTED. Promotion requires a signature over the bound bundle digest from a key admitted for independent-attestation; own workspace keys and absent trust lists are refused. The API loads operator trust rather than accepting it from the request. This proves the source guard path, not content truth or a fresh runtime test. Evidence: `src/ingest/ingest.ts:139-195`; `src/claims/evidenceProvenance.ts:112-128`; `src/api/evidenceRouter.ts:394-412`.
- **G8-24 (deleted) — confirmed named deletion:** All six literal scratch script paths are absent and internal/ is ignored. No local authored scratch or historical object was removed. Evidence: `accepted main tree: six absenceEvidence paths`; `.gitignore:140-144`.
- **G8-29 (deleted) — confirmed named deletion:** The duplicate original pickle finding has the same current named-path absence as G6-02. Its distinct historical ID is retained. Evidence: `accepted main tree: test_model.pkl`; `.gitignore:115-117`.
- **G8-30 (deleted) — confirmed named deletion:** The three named internal documents are absent with corrected filename-family ignores, as for G6-25. Distinct historical ID and exposure limits remain. Evidence: `accepted main tree: three absenceEvidence paths`; `.gitignore:91-97`.
- **G8-25b (implemented) — confirmed supplemental path fix:** Scanner resolves the root and uses nodeRelative(rootPath, fullPath), with slash normalization, instead of slicing the root string. This confirms only the supplemental filename bug; it does not dispose of original G8-25 QA-service scope. Evidence: `src/release/releaseSecretScan.ts:113-141`.

## Preservation and next boundary

Keep G8-14 proposed reclassification, G8-16 scope limits, citation anchors and G6-04 current absence-witness correction as unresolved debt. Do not resume P0-29, turn this review into a passing receipt or alter successor assignments without a later authorized continuation. G4/G7 pause boundaries and original authored candidate remain preserved.
