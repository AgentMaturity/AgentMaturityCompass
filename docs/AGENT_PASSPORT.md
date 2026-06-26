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

## Commands

```bash
amc passport init
amc passport verify-policy
amc passport policy print
amc passport policy apply --file .amc/passport/policy.yaml --reason "policy update"

amc passport create --scope agent --id <agentId> --out ./agent.amcpass
amc passport verify ./agent.amcpass
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
