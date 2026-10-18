# P0-18 independent static crypto/admission review

Current source is 072ccaaad2d4cd7890ed97dc830302d50ca91b31 on codex/p0-18-current-qualification. All 23 design source pins match this worktree. The 14-case design has no blocking contradiction with the current loader, admission and provenance code. This review ran no product code or tests and makes no whole-issue acceptance claim.

## writer-payload-before-guard

An elevated producer refusal prevents the evidence row but can have payload filesystem effects. A no-new-row assertion is appropriate; an unconditional zero-effects claim is not. For the bounded writeguard control, use an explicit harmless inline payload and initialize writer/session before the measured interval, or retain every actual payload effect. Keep refusal row snapshots and filesystem inventories separate. Evidence: /Users/sid/.codex/worktrees/p0-18-qualification/AgentMaturityCompass/src/ledger/ledger.ts:502, /Users/sid/.codex/worktrees/p0-18-qualification/AgentMaturityCompass/src/ledger/ledger.ts:519, /Users/sid/.codex/worktrees/p0-18-qualification/AgentMaturityCompass/src/ledger/ledger.ts:527, /Users/sid/.codex/worktrees/p0-18-qualification/AgentMaturityCompass/src/ledger/ledger.ts:716.

## own-key-reader-nonvacuity

Cold-reading the writer-refused self_attested rows cannot exercise reader own-key exclusion because they already declare SELF_REPORTED. Retain actual writer refusals, and add a clearly labelled local bound ATTESTED projection carrying a genuinely verified monitor/auditor signature and a real signed list naming that key. readerTrustFor(workspace) must downgrade it. Do not append or rewrite this projection, and do not claim it is a stored historical row. Evidence: /Users/sid/.codex/worktrees/p0-18-qualification/AgentMaturityCompass/src/ingest/ingest.ts:182, /Users/sid/.codex/worktrees/p0-18-qualification/AgentMaturityCompass/src/ingest/ingest.ts:194, /Users/sid/.codex/worktrees/p0-18-qualification/AgentMaturityCompass/src/claims/evidenceProvenance.ts:153, /Users/sid/.codex/worktrees/p0-18-qualification/AgentMaturityCompass/src/claims/evidenceProvenance.ts:199.

## dedup-distinct-time

Equal-timestamp copies are tied by input order. Reversing rows need not choose the same ID when both copy timestamps are equal. Require distinct actual copy timestamps before the reversed-order assertion, or record a deliberately supplied owned duplicate timestamp greater than the genuine copy timestamp. The real ledger signature must cover that row; do not silently infer elapsed time. Evidence: /Users/sid/.codex/worktrees/p0-18-qualification/AgentMaturityCompass/src/claims/evidenceProvenance.ts:218.

## Verified static contracts

- Default loader and separately admitted root: Use the owned process AMC_HOME/HOME for the actual no-argument loader in both initializer and cold reader. Empty/default missing list gives an empty pinned context, not a missing-root error. Root fingerprints are operator inputs, not trust-list-root purpose entries or values learned from the artifact.
- Independent key fingerprint encoding: Record root and attester public PEM plus independent Node-canonical PEM SHA256 before list/attestation signatures. This is not the SHA256 of DER SPKI bytes. Carried root PEM must match an independently recorded root ID.
- Signed list domain and attested digest bytes: Independent checks must use the same domain and encoding but independent crypto/canonical observer code. A signature over the 64-character digest text or list digest is a different message.
- Entry admission at verifier time: These attestation fixtures check current loaded context.asOf. Entry validTo is exclusive; list expiry is separate. Keep explicitPins empty and both allow flags false. The loader does not reject future issuedAt; no signing-time authenticity or complete timestamp-policy claim follows.
- Workspace own-key exclusions: Always pass workspace to the actual reader closure. Current-key fixtures do not prove every rotation/history scenario. Public-key history reads do not initialize signing keys.
- Bundle binding and actor-label scope: The attester signs bundle entries, not attestedBy or statement. Root-signed subject text is list metadata, not authenticated human identity. Genuine bound review copy may read ATTESTED while the stamped audit reads SELF_REPORTED. The five-minute future skew is inclusive; the proposed +1ms refusal does not by itself test all boundaries.
- Deduplication and window scope: Only rows classified ATTESTED with valid bound entries are deduplicated. Other rows pass through, including unrelated/self-reported controls. This helper check does not qualify full diagnostic/compliance window selection or regulatory eligibility.
- Reader and metadata caches: Use fresh objects for adversarial metadata variants and a fresh cold reader per signed-list variant. Record actual loader errors separately from tier downgrade. This is evaluation-local caching, not live revocation monitoring.
- Read-only connection and measured effects: Close initializer writers and process before cold reads. Inventory files and raw rows before open and after close. WAL/SHM are possible real effects; do not claim nonexistent zero-effects. Payload reads use the actual reader and must preserve setup/read errors.

## Planned case mapping

- loaded-trust-ingest-cold: Compatible with current source within the stated scope. Runtime was not executed.
- missing-root: Compatible with current source within the stated scope. Runtime was not executed.
- foreign-root-envelope: Compatible with current source within the stated scope. Runtime was not executed.
- list-tamper: Compatible with current source within the stated scope. Runtime was not executed.
- own-key-refusal: Compatible writer control; add meaningful reader projection as described. Runtime was not executed.
- wrong-purpose: Compatible with current source within the stated scope. Runtime was not executed.
- revoked: Compatible with current source within the stated scope. Runtime was not executed.
- expired-entry: Compatible with current source within the stated scope. Runtime was not executed.
- unpinned-attester: Compatible with current source within the stated scope. Runtime was not executed.
- forged-attestation: Compatible with current source within the stated scope. Runtime was not executed.
- bound-subject-matrix: Compatible with current source within the stated scope. Runtime was not executed.
- dedup-window: Compatible with distinct actual copy timestamps. Runtime was not executed.
- writeguard-effects: Compatible no-new-row contract with explicit side-effect boundary. Runtime was not executed.
- legacy-synthetic-caps: Compatible with current source within the stated scope. Runtime was not executed.

## Limits and preservation

- No runtime, build, install, AMC module imports, tests, new qualification packet edits, or source changes were performed. Node standard-library commands were used only for metadata, hashing and these two private documents.
- Root reported 144/144 old baseline cases and freeze0; this static review did not independently execute or certify them.
- The 14 planned cases do not alone qualify all six recovered mutation duties, source-literal inventory, Studio/API/outcomes behavior, full suite, Node24, legal truth, authenticated people, independent assessment, or G0.
- The recovered spec uses evidence-attestation/1.2.0 while current accepted implementation uses independent-attestation/2.0.0. These are preserved scope/wording drifts, not policy choices made here.
- Generic production reservation1496, shared CLI/registry/REPL1588, D-15 constraints and all prior held/paused/unresolved work remain unchanged. Lack of a named source reservation is not clearance.

The new author-owned file was not present at this review capture. Earlier Graphify queries were reused as stale navigation only. The explicit source inputs, design, recovered spec, routing record, reservation and graph hashes are recorded in the JSON. Only this private review pair was written.
