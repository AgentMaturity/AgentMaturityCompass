# Audit Binder

The AMC Audit Binder is a deterministic, signed, privacy-safe export (`.amcaudit`) for auditor-ready control evidence.

It is an engineering evidence package, not legal advice.

## What It Contains

- Trust and evidence-gate signals (integrity, correlation, trust label, evidence mix)
- Maturity summary (5 dimensions + unknown counts)
- Governance and model/tool control summaries
- Assurance certificate summary and top findings metadata
- Supply-chain integrity summaries (plugins, releases, backups)
- Recurrence/cadence status
- Compliance control-family results from the active signed map
- Proof bindings to transparency and Merkle roots

## What It Does Not Contain

- No raw prompts
- No raw model I/O
- No raw tool payloads
- No secrets
- No PII

AMC enforces allowlist-only export fields and strict PII/secret scanning before artifact creation.

## Verification Model

Each binder includes:

- `binder.json` + `binder.sig` (signature envelope)
- transparency and Merkle root records + signatures
- inclusion proofs for referenced events
- deterministic manifest/hash bindings

Use:

```bash
amc audit binder verify ./workspace.amcaudit --pubkey <recorded-auditor.pub>
```

A tampered binder must fail verification and be treated as untrusted.

## Continuous Recurrence

Audit cache refresh runs on a signed cadence policy and event triggers. This supports continuous recurrence and unified clarity with current control posture rather than one-off point-in-time reporting.
