# Attestation Evidence Paths

This guide standardizes where attestation-related evidence lives, how to verify it, and what to collect for audits/incidents.

## Canonical Path Layout

Use these paths as defaults unless policy requires an override.

- `.amc/keys/` — verifier public keys (auditor/notary trust roots)
- `.amc/transparency/` — transparency roots and proof material
- `.amc/transparency/proofs/` — inclusion proofs (`*.amcproof`)
- `.amc/audit/` — audit map/policy state and request workflow artifacts
- `.amc/assurance/certificates/` — assurance certificates (`*.amccert`)
- `.amc/agents/<agentId>/bundles/` — portable run evidence bundles (`*.amcbundle`)
- `.amc/bench/exports/` — bench artifacts (`*.amcbench`)
- `.amc/backups/` — backup + restore-drill artifacts (`*.amcbackup`)

## Minimum Attestation Packet (Release/Audit)

For each release checkpoint, retain at least:

1. Bundle (`.amcbundle`) for the promoted run
2. Cert (`.amccert`) for assurance posture
3. BOM + signature (`amc-bom.json`, `amc-bom.json.sig`)
4. Transparency proof (`.amcproof`) for key issuance records
5. Audit binder export (`.amcaudit`) when external review is required

## Verification Commands

```bash
# bundle + cert
amc bundle verify .amc/agents/<agentId>/bundles/latest.amcbundle
amc assurance cert verify .amc/assurance/certificates/latest.amccert

# bom + signatures
amc bom verify --in ./amc-bom.json --sig ./amc-bom.json.sig --pubkey .amc/keys/auditor_ed25519.pub

# transparency proof
amc transparency merkle verify-proof .amc/transparency/proofs/<entryHash>.amcproof

# audit binder
amc audit binder verify ./exports/latest.amcaudit
```

## Evidence Handling Rules

- Keep raw prompts/tool I/O out of exported evidence unless explicitly approved.
- Prefer hash/ID references over plaintext payloads.
- If trust-critical signatures fail verification, treat posture as untrusted and fail closed.
- Record evidence collection timestamp + operator in incident timelines.

## Operator Checklist

- [ ] All files resolved under canonical paths (or approved policy override)
- [ ] All signatures/proofs verified offline
- [ ] Artifact hashes captured in incident/release notes
- [ ] Export set stored with immutable retention policy
