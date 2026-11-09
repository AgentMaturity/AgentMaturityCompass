# Agent Passport

Agent Passport is AMC's shareable maturity credential (`.amcpass`): a deterministic, signed, privacy-safe summary of an agent/workspace posture that can be verified offline.

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

- `VERIFIED`: integrity/correlation/trust gates pass, assurance gate passes, required proof bindings validate.
- `INFORMATIONAL`: artifact is valid but one or more verification gates are not met.
- `UNTRUSTED`: signature/proof/privacy checks fail.

Reasons are deterministic template IDs (no free-form claims).

A trust signal that nothing measured is `null`, never 0: `trust.integrityIndex` without a trusted run, `trust.correlationRatio` when the run's window carried no receipted trace, and `trust.evidenceCoverage` when neither a run nor a signed forecast measured the evidence mix (a forecast built from no runs measured none). A gate with a minimum above 0 then adds `GATE_FAIL_INTEGRITY_NOT_MEASURED` or `GATE_FAIL_CORRELATION_NOT_MEASURED` instead of a low-value reason.

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
```

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

Receipt integrity and capability status are deliberately separate. A trusted `partial` or `fail_closed` receipt is valid portable proof that a limitation exists. Unknown fields, hash mismatch, effective-state mismatch, receipt-ID mismatch, signature tamper, or an untrusted public key makes the receipt itself invalid.

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
