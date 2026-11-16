# Assurance Certificates

Assurance certificates (`.amccert`) are signed checkpoint artifacts issued from completed assurance runs.

## Format

Deterministic tar.gz bundle:

- `amc-cert/cert.json`
- `amc-cert/cert.sig`
- `amc-cert/signer.pub`
- `amc-cert/proofs/...` (transparency/merkle roots + inclusion proofs)
- `amc-cert/meta/policy.sha256`
- `amc-cert/meta/run.sha256`
- `amc-cert/meta/findings.sha256`

The certificate includes:
- run binding (`runId`, scope hash)
- status (`PASS|FAIL|INSUFFICIENT_EVIDENCE`)
- risk assurance score/category scores (when evidence gates pass)
- evidence gates (`integrityIndex`, `correlationRatio`, `observedShare`)
- trust bindings (LOCAL_VAULT / NOTARY fingerprint)
- proof bindings to transparency/merkle roots

## Issue + Verify

```bash
amc assurance cert-issue --run <runId>
amc assurance cert-verify .amc/assurance/certificates/latest.amccert
```

## Issuance Rules

Certificates are blocked when evidence gates fail. This prevents false confidence from weak or mostly self-reported evidence.

## Privacy

Certificate content is summary-level and hash-bound. It does not embed raw prompts, full output logs, or secret material.
