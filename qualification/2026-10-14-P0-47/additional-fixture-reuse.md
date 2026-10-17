# P0-47 additional fixture diagnosis — 14 October 2026

Read-only analysis of 30 failures in the actual full report at `7a81b5aa7316471e841f4ae0ea684a64c85ae4a1`. The full run remains unsuccessful: 23,060 passed, 51 failed, 0 pending and 0 todo across 23,111 tests. This proposal is unapplied and unexecuted; it is not qualification.

The four prior bounded API/score/OIDC proposals remain in `/private/tmp/p0-47-fullrun-failure-preflight-20261014.json` and `.md`. The separately controlled native-home diagnostic is in `/private/tmp/p0-47-native-fixture-diagnosis-20261014.json` and `.md`.

## jsonlWriterResume

beforeEach puts AMC_CONTROL_CHECKPOINT_DIR inside governed workspace; loadActiveCompiledPolicy calls readSignedControlJournal, whose pending/checkpoint path calls controlCheckpointDir and throws for this layout. assertStorageAdmission wraps this as registry_unverifiable active_policy_unverifiable. First three worker stderr traces show identical admission exception. Missing residency registry is not established as cause.

Proposed treatment: Change only checkpoint root to owned sibling ${workspace}-control-checkpoints; retained workspaces/checkpoints, service disposal and child SIGKILL cleanup preserved.

Preserved assertions: Every recovery, prefix, lock, cancellation, tamper, budget, new-turn and closed-session assertion remains byte-identical.

Evidence limit: source-and-raw-log confirmed; proposed change unexecuted here.

## nativeManagedRecovery/nativeValidationOutcomeSurfaces

The shared signed operator fixture has no nativeSandbox.writableDirectories and writes validation-effect at workspace root. Current nativeSandboxBinding selects Seatbelt on Darwin; nativeShellSandboxPolicy defaults writableRoots to []; Seatbelt denies file-write except signed grants and privateTmp. Success and nonzero cases consequently leave effect() null. The home and checkpoint fixture layout is already outside workspace.

Proposed treatment: Use exact signed writableDirectories [validation-out], write/read the same effect within it, and probe a separate outside-grant write. Add escaped()==false assertions to both consumers.

Preserved assertions: Existing success/nonzero/denied/budget, approval quorum, ledger, accounting, output-event, cold-inspection and current verifier verdict assertions are preserved. No copied NativeTaskService or verifier-schema production.

Evidence limit: strong source-backed fixture diagnosis; controlled before/after still required.

## nativeSandboxPolicyBinding

Current default ToolPipeline binds authorization before guards. The test guard changes policy; authorizationDenial/recheckAuthorization then returns policy_revision_changed before the shell body, with empty output. Test expects the later shell-body error.

Proposed treatment: Assert default authorization denial and retained backend-not-called; add a separate authorizeClasses empty composition to exercise the shell body admission check, retaining both original output regexes.

Preserved assertions: Both signed and unsigned mutations remain rejected by default composition and by body defense; no production policy bypass. P0-33 pipeline differs only recording/latch behavior outside this tested authorization ordering.

Evidence limit: source-backed earlier-authority denial; proposed change unexecuted here.

## dataResidencyPersistence

Current issueLegalHold(workspace) delegates to issueScopedLegalHold; legalHoldRegistryRoot is .amc/residency/legal-holds. Existing test asks for old .amc/compliance/residency/legal-holds and record_hash/prev_record_hash, failing file existence. Current records are amc.legal-hold/v1 with detached signatures, signed HEAD and journal.

Proposed treatment: Use existing legalHoldRegistryRoot/readLegalHoldRegistry APIs to assert modern signed files, registryDigest and journalRevision; retain all other tests and add actual record/signature/deletion tamper refusal checks and deletion-gate integration.

Preserved assertions: Durable cross-process holds/releases and tenant/policy assertions remain. Integrity coverage increases; typed checkpoint refusal difference in preserved P0-33 is not imported.

Evidence limit: current source confirms stale persisted-format assertion; proposed change unexecuted here.

## Production compatibility

The session service, signed control journal, sandbox binding, shell policy, Seatbelt backend, compliance residency API, JSONL worker and public HTTP fixture are byte-equal to the preserved P0-33 versions. Activation, egress/registry, tool pipeline and legal-hold registry differ; the JSON records their exact hashes. Their inspected current behavior already supports the proposed tests. No differing production source is proposed for copying.

The native effect correction needs controlled same-case before/after proof because a missing effect alone cannot establish every downstream consequence. All six proposed test files preserve current production verdict schemas.

## Artifacts

Combined proposal: `/private/tmp/p0-47-additional-fixture-reuse-proposal-20261014.patch`. JSON contains exact per-file diffs, baseline/proposal hashes, dependency hashes and actual failure messages. No candidate files were changed.

An independent read-only review confirmed compatibility of the sandbox and legal-hold test additions. The active-hold deletion check proves refusal; an unmapped fixture can be refused with `unknown/tenant_unmapped`, so it does not establish a mapped `held` verdict.
