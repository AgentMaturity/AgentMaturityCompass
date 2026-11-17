# Agent Passport

Agent Passport (`.amcpass`) is a signed, privacy-safe summary of an agent's or workspace's latest AMC results that you can hand to someone else. They can check it offline, with AMC (`amc passport verify`) or without it (the standalone verifier `amc-verify`, docs/STANDALONE_VERIFIER.md), against a key they pinned themselves.

Every passport is **self-issued**: the workspace signs it, with its own key and its own clock, about its own agent. The signature shows who wrote it and that it is unchanged, not that its figures are true. Nobody outside the workspace checked them.

It is designed for continuous recurrence and unified clarity:
- generated from current signed AMC checkpoints
- anchored to transparency and Merkle proof bindings
- safe for ecosystem comparison without sharing prompts, logs, or PII

## What It Is

- A signed credential built from evidence-derived AMC artifacts.
- A compact trust/maturity/risk/value posture summary.
- A checkpoint snapshot for realtime comparative views across teams and ecosystems.

## What It Is Not

- Not a legal certification.
- Not a guarantee of future outcomes.
- Not a raw evidence dump.

## Privacy Model

Passport export is allowlist-only:
- no raw prompts
- no raw model/tool I/O
- no secrets/tokens/keys
- no PII
- no file paths

Identifiers are hashed by policy defaults.

## Status Labels

The status is the issuing workspace's own check, made when the passport was created. It is not an outside verification.

- `VERIFIED`: the workspace's own passport gates passed (integrity, correlation, trust label, assurance certificate, proof bindings). The CLI and console show it as "verified by this workspace's own checks (self-issued)".
- `INFORMATIONAL`: one or more of those gates were not met; for information only.
- `UNTRUSTED`: signature, proof or privacy checks failed.

Reasons are deterministic template IDs (no free-form claims).

A trust signal that nothing measured is `null`, never 0: `trust.integrityIndex` without a trusted run, `trust.correlationRatio` when the run's window carried no receipted trace, and `trust.evidenceCoverage` when neither a run nor a signed forecast measured the evidence mix (a forecast built from no runs measured none). A gate with a minimum above 0 then adds `GATE_FAIL_INTEGRITY_NOT_MEASURED` or `GATE_FAIL_CORRELATION_NOT_MEASURED` instead of a low-value reason.

## Who issued it, when, and on what evidence

Passports made from 2026-11-16 carry an `issuance` block inside the signed `passport.json`:

- `issuerRelationship: "self"` and `selfIssued: true`: the workspace signed it about its own agent.
- `timeBasis: "claimed"`: `generatedTs` and `expiresTs` are the signing machine's own clock; no trusted timestamp vouches for them.
- `statusBasis: "workspace-own-gates"`: what `status.label` means (above).
- `revocationListId`: the signed revocation list that would name this passport if it were revoked (below). It is unique to the issuing workspace: `passports:<workspaceId>:<the first 32 hex characters of the key id of its first revocation-list key>`.
- `revocationListKeyId`: the key id of the key that signs that list. A checker accepts only a list signed by this key, so another issuer's list can never stand in for this one. If the workspace later rotates its revocation-list key, lists signed by the new key are refused for passports made before the rotation (the check fails rather than passes); issue those passports again.

The evidence mix is `trust.evidenceCoverage`: the share of evidence AMC observed itself, the share others attested, and the share that was self-reported (`null` when nothing measured it). `amc passport create` and `amc passport verify` print it in words.

The per-question scores are `maturity.questionScores` (hashed question ids). Older passports named the field `questionScores42`; AMC still reads that name.

Compatibility: an AMC version from before 2026-11-16 does not know the `issuance` block and reports a newer passport as a digest mismatch. Update AMC, or check it with `amc-verify`.

## Revoking a passport

```bash
amc keys revoke --passport ./agent.amcpass --reason "agent retired"   # or the passportId of one under .amc/passport/exports
```

This records the revocation on this machine and publishes `.amc/passport/revocations.signed.json`, a signed revocation list (`amc.revocation-list`, with the list id the passport names). The workspace's revocation-list key signs it; it carries the time it was issued, a sequence number that goes up by one with every change, and the digest of the list before it. Share that file with the people who check your passports. They check it with `amc-verify ... --revocation-list revocations.signed.json` against the revocation-list key their own trust list pins, and pass `--known-sequence <list id>=<n>` with the highest sequence they have seen, so an older copy is reported as a rollback. The admin API route `POST /api/v1/passport/:id/revoke` publishes the same list, and answers 503 when the list could not be published. A `.amcpass` file passed to the command must verify as one this workspace signed; a changed file is refused and nothing is revoked (pass the passport id instead). If the vault is locked, the revocation still holds on this machine, the command says the list was not published, and exits 1.

On this machine, `amc passport verify` reads the signed list; a list that does not verify, or is older than one this machine already saw, makes the passport fail (`PASSPORT_REVOCATION_LIST_INVALID`) rather than pass.

## Commands

```bash
amc passport init
amc passport verify-policy
amc passport policy print
amc passport policy apply --file .amc/passport/policy.yaml --reason "policy update"

amc passport create --scope agent --id <agentId> --out ./agent.amcpass
amc passport verify ./agent.amcpass --pubkey <recorded-auditor.pub>
amc passport show ./agent.amcpass --format badge
amc passport badge --scope agent --id <agentId>
amc passport export-latest --scope agent --id <agentId> --out ./agent-latest.amcpass
amc keys revoke --passport ./agent.amcpass --reason "<why>"
```

Every passport export (the CLI, the console and the API) also writes `<file>.sigstore.json` beside the passport: a DSSE-signed in-toto statement in a key-based Sigstore bundle whose subject is the sha256 of the whole `.amcpass` file (docs/STANDALONE_VERIFIER.md, "Export statements").

`amc passport issue-token`, `verify-token` and `translate-score` are demos. A trust token is signed with a public demo secret that anyone can use, says so inside the token, and is never reported as verified. The score translations use conversion factors AMC made up as examples: NIST AI RMF and ISO/IEC 42001 have no numeric score.

## Offline Verification

`amc passport verify` checks:
- artifact structure (`passport.json`)
- signature envelope (`passport.sig`)
- transparency/Merkle proof bindings
- PII/secret scanner results

If any critical check fails, verification returns fail and the artifact is treated as untrusted.

## Adapter Capability Receipts

Passport also provides a standalone, portable adapter capability receipt for integration proof:

```bash
amc adapters capabilities --agent <agentId> --adapter <adapterId> --out adapter-capabilities.json --json
```

`amc.adapter-capability-receipt.v1` binds the authoritative adapter declaration to the current runtime/version probe, signed adapter selection, provider-hook state, effective event/control projection, explicit lossiness, verification reasons, receipt hash, and auditor signature. It does not change the `.amcpass` v1 schema and does not imply AEP or provider parity.

Receipt integrity and capability status are deliberately separate. A trusted `partial` or `fail_closed` receipt is valid portable evidence that a limitation exists. Unknown fields, hash mismatch, effective-state mismatch, receipt-ID mismatch, signature tamper, or an untrusted public key makes the receipt itself invalid.

The receipt contains no prompt, tool arguments, model/tool output, stdout/stderr content, cwd, transcript path, raw session identifier, lease token, or secret.

## Harness Companion (SH-TRUST-05)

An AGENT-scoped `.amcpass` also carries `harness/harness.json` with `harness/harness.sig`: what the agent runs with and where its scores come from.

- `model`: the provider template, route and upstream from the agent's signed config, and the models declared for it in the signed adapters config; null when the file is missing or its signature does not verify.
- `tools`: tool names, action classes, MCP server ids and a digest of the signed tools catalogue; null when `tools.yaml` is missing or unverified.
- `policy.signedFiles`: every signed configuration file read for the agent with its sha256 and signature status (`verified`, `missing`, `invalid: ...`).
- `scores.assurance` / `scores.redteam`: the newest sealed assurance report that passes the provenance gate and the newest signed, sealed red-team run (run id, report sha256, ledger session id, score; the score is null unless the run MEASURED something).
- `nativeSessions`: the count of sealed non-runner sessions in the workspace ledger (a workspace count: sessions carry no agent id).
- `unknown`: everything AMC does not record, named rather than guessed.

The companion is a separate member signed with the auditor path and bound to `passport.json` by `passportSha256`; `passport.json` keeps its `v: 1` shape and digest, so a verifier built before this change still verifies a new passport and never looks at the companion. `amc passport verify` checks the companion's signature and binding when it is present (`HARNESS_SIGNATURE_INVALID`, `HARNESS_BINDING_MISMATCH`, `HARNESS_INVALID`) and returns it as `harness`. Compliance results are not in the passport: a compliance report is not a signed artifact.

## Schema Compatibility

Passport schema compatibility can be recorded with a passport schema compatibility report using `amc.passport.compatibility.v1`. The report is a signed-evidence companion for `.amcpass` exchange, not a replacement for `amc passport verify`.

The report binds:
- current Passport schema version (`1`)
- fixture corpus id
- import, export, and round-trip fixture results
- compatibility matrix rows by partner system and schema version
- evidence refs and source citations
- deterministic row and report hashes

Metadata-only claims about a paper, benchmark, partner system, or protocol are not enough. A compatibility claim must include concrete fixture payloads, import/export results, and a compatibility matrix that covers import, export, and round-trip behavior.
