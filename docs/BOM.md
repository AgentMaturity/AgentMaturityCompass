# Release BOM (Maturity Bill of Materials)

AMC BOM is a signed, portable maturity manifest tied to a specific run.

## Purpose

- Attach maturity assurance metadata to releases/deployments.
- Provide offline-verifiable integrity and provenance.
- Tie release artifacts to run/cert/bundle evidence.

## Generate, Sign, Verify

```bash
amc bom generate --agent <id> --run <runId> --out amc-bom.json
amc bom sign --in amc-bom.json --out amc-bom.json.sig
amc bom verify --in amc-bom.json --sig amc-bom.json.sig --pubkey <recorded-auditor.pub>
```

`bom verify` admits the signer only when `--pubkey` or a signed trust list pins it for `artifact-seal`. The workspace's own auditor keys and the key in the signature envelope only help find the signer; they never vouch for the BOM. Without a pin it exits 1; `--allow-unpinned` gives an integrity-only exit 2 with `UNTRUSTED:` on stderr.

## Contents

BOM includes:
- agent identity and risk tier
- run id + report hash
- integrity/trust summary
- overall/layer scores
- assurance scores and failure-risk indices snapshot
- active freeze state (if any)
- best-effort git metadata
- referenced bundle/cert identifiers

## CI Integration

`amc ci init` generates workflow steps that verify gate requirements and then emit/sign BOM artifacts for release pipelines.

Any BOM tampering fails `amc bom verify`.
