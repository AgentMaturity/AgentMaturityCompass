# P0-47 fixture repairs review — 14 October 2026

No actionable acceptance weakening was found in the eleven applied fixture repair files against `7a81b5aa7316471e841f4ae0ea684a64c85ae4a1`. Tracked production under `src/` and `packages/` has no diff. The exact baseline/reviewed file hashes, source hashes, built runtime hashes, removed and added assertion lines, and applied diffs are retained in the JSON.

This is a read-only review, not new execution or whole qualification.

## tests/apiRouters.test.ts

Mock gains the required issues[] field; existing successful route status assertion remains and certificate output now explicitly requires valid false, integrityValid true, status UNTRUSTED. No authentic-certificate claim added.

Source: `src/api/enforceRouter.ts:464-469 and src/trust/verifierReport.ts unsignedArtifactReport`.

## tests/questionScoreExplainability.test.ts

Only obsolete release-gate advice and guide evidence-needed strings are replaced by present P1-07 L4/L5 not-evaluated notices and evidenceNeeded[]. Accepted/rejected IDs, provenance, source qualification, scoring, readiness fields and passport facts remain unchanged.

Source: `src/diagnostic/levelSemantics.ts:48-50,74-75,115-124; questionScoreExplainability.ts:2582-2584; guideGenerator.ts:449-473`.

## tests/enterpriseSsoScim.test.ts, tests/security/api-security.test.ts

Positive fake IdP changes unsupported EdDSA to accepted RSA2048/RS256, while explicit EdDSA rejection is added. Original expiry and nonce negatives, unverified-email/no-session-cookie behavior, roles and SCIM assertions remain. HTTP is refused before literal-loopback development opt-in; ordinary HTTP/private destinations still refused after opt-in. Callback401 replacement403 matches current route and adds reason-body check. Environment opt-ins are test-scoped and restored by finally/afterEach.

Source: `src/identity/oidc/jwtVerify.ts:25-29,130-176; oidcRoutes.ts:89-93; src/workspaces/workspaceRouter.ts:1038-1049`.

## tests/studioNativeTaskService.test.ts

New owned operator home is a unique mkdtemp sibling outside governed workspace, with default0700 permissions and paired cleanup after all service.close promises settle. Current internal consistency UNTRUSTED failed verdict, stale-revision refusal, sealing, retained evidence, restart/resume, archive and dedup assertions remain byte-identical. Prior controlled Node24 diagnostic gave whole file10pass; this read-only review performs no execution.

Source: `src/lifecycle/signedControlJournal.ts:114-127; tests/studioNativeTaskService.test.ts:31-49`.

## tests/jsonlWriterResume.test.ts

The checkpoint root is the unique owned-workspace derived sibling `${workspace}-control-checkpoints`. It is outside the governed path and inherited identically by forked real writer/resumer children. Current signed journal uses real durable checkpoint files; no signing, fsync, key, store or recovery implementation changed. afterEach still disposes services/kills owned children/restores environment and intentionally retains workspaces and checkpoint artifacts. Every prefix, effects, budget, tamper, live/foreign lock, cancelled/complete turn, uncertain dispatch and resume assertion remains unchanged.

Source: `src/lifecycle/signedControlJournal.ts:114-127,311-323,562-578; src/catalog/compiler/activate.ts:72-76,94-96; src/residency/checkEgress.ts:42,122-130`.

## tests/helpers/nativeValidationOperator.ts, tests/nativeManagedRecovery.test.ts, tests/nativeValidationOutcomeSurfaces.test.ts

Exact fixture command still prints validation-outcome and retains explicit success/nonzero exit values. It now writes the expected effect under the one signed nativeSandbox writableDirectories grant validation-out; existing signed argv exact-match denylist admits only that exact command. A second real shell redirection attempts validation-escape at workspace root outside the grant; escaped() false is asserted in both consumers. No sandbox/backend/filesystem mock added: these consumers load current built CLI/SDK/Studio and backend chooses actual Seatbelt on Darwin. Success/nonzero modes require the granted effect plus absence of the outside-grant effect; denied/budget modes retain no-effect/denial assertions. Every existing approval quorum, accounting, output reference, sealed history, cold projection and current UNTRUSTED verifier expectation remains.

Source: `src/sandbox/nativeSandboxBinding.ts:98-103; nativeSandboxPolicy.ts:35-59; seatbeltNativeShell.ts:78-82; built dist equivalents inspected`.

## tests/nativeSandboxPolicyBinding.test.ts

Default pipeline result must fail at authorization with policy_revision_changed, which current guard/policy recheck ordering returns before body. A second test-only composition without authorization binding then exercises and retains both original signed/unsigned shell-body error regexes. backend.run remains not-called after both attempts. Existing synthetic backend seam is unchanged and is explicitly labelled no OS-confinement evidence.

Source: `src/tools/toolPipeline.ts:367-394,410-425; src/actions/authorize.ts:96-110,294-303; src/sandbox/nativeSandboxBinding.ts`.

## tests/compliance/dataResidencyPersistence.test.ts

Old .amc/compliance/residency/legal-holds path and record_hash/prev_record_hash no longer describe production. Replacement requires modern record/detached signature/signedHEAD/journal artifacts, schema/tenant/active record, verified registry digest and positive journal revision. New forged-release, signature corruption and missingrecord+signature mutations must throw typed registry errors and preserve unknown verdict reasons instead of treating tenant unheld. All existing cross-process tenant/policy/hold/release and workspace-free library assertions remain. Deletion assertions are additive.

Source: `src/compliance/dataResidency.ts:432-439; src/residency/legalHoldRegistry.ts:71,109-123,184-214,269-283,375-399`.

## Active freeze mutation

At the review snapshot, `tests/helpers/landedSource.ts` is restored to baseline bytes. The parent confirmed its owned runner and finally restoration. That mutation is excluded from the eleven fixture repairs and cannot remain in a positive candidate. Baseline SHA-256: `dd1f64f3e1358132f00252d9667baff83ddf47897c4824f56711239434e4e111`; observed SHA-256: `dd1f64f3e1358132f00252d9667baff83ddf47897c4824f56711239434e4e111`.

## Limits

Native consumer execution tests are Darwin-specific; denied/budget cases prove no effects, while success/nonzero cases exercise real signed writable grants plus outside-grant failure. No Linux or installed-package claim follows. The legal-hold deletion addition proves refusal, including an unknown/unmapped refusal, rather than a mapped held verdict. This reviewer ran no tests or builds and changed no candidate files.
