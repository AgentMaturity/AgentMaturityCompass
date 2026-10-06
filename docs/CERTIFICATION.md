# Certification

AMC certificates (`.amccert`) are signed, portable, and offline-verifiable evidence packages that bind:
- diagnostic run outcomes,
- gate policy thresholds,
- ledger integrity proofs,
- selected assurance evidence and risk indices.

## Issue

```bash
amc certify \
  --agent <agentId> \
  --run <diagnosticRunId> \
  --policy .amc/agents/<agentId>/gatePolicy.json \
  --out ./agent.amccert
```

Issuance flow:
1. exports a verified evidence bundle for the run,
2. enforces gate policy thresholds,
3. embeds run/policy/keys/evidence artifacts,
4. signs `cert.json` with auditor key.

## Verify (Offline)

```bash
amc cert verify ./agent.amccert --pubkey <recorded-auditor.pub> --expect-monitor <recorded-monitor-sha256>
amc cert inspect ./agent.amccert
```

Verification checks:
- certificate signature,
- run hash + run seal signature,
- gate policy signature,
- ledger hash chain/signatures/blob hashes,
- gate policy evaluation on bundled report/evidence.

## Revoke

```bash
amc cert revoke --reason "superseded" --cert ./agent.amccert --out ./agent.amcrevoke
amc cert verify-revocation ./agent.amcrevoke --pubkey <recorded-auditor.pub>
amc cert verify ./agent.amccert --revocation ./agent.amcrevoke --pubkey <recorded-auditor.pub> --expect-monitor <recorded-monitor-sha256>
```

Revocation files are signed by auditor key and can be verified independently.

## What a Cert Proves

- At issuance time, bundled evidence and signatures verified.
- Gate thresholds passed deterministically.
- Maturity and integrity values are tied to immutable evidence in the cert.

## What a Cert Does Not Prove

- It does not prove future behavior after issuance.
- It does not replace runtime monitoring/assurance.
- It does not prove key isolation unless deployment follows security guidance.

