# Evidence Bundles

AMC bundles are portable `.amcbundle` TAR.GZ archives that can be verified offline.

## Commands

```bash
amc bundle export --agent <agentId> --run <runId> --out .amc/agents/<agentId>/bundles/<runId>.amcbundle
amc bundle verify .amc/agents/<agentId>/bundles/<runId>.amcbundle --pubkey <recorded-auditor.pub> --expect-monitor <recorded-monitor-sha256>
amc bundle inspect .amc/agents/<agentId>/bundles/<runId>.amcbundle
amc bundle diff <bundleA> <bundleB>
```

## Bundle Contents

- `manifest.json`
- `manifest.sig` (auditor signature)
- `run.json`
- `run.md`
- `context-graph.json`
- `target.json`
- `target.sig`
- `public-keys/monitor.pub`
- `public-keys/auditor.pub`
- `public-keys/key-history.json`
- `evidence/evidence.sqlite` (run-scoped minimized slice)
- `evidence/blobs/*` (referenced blobs)
- `metadata/exportInfo.json`

When the run's agent has A4 Forge projects (preview, `AMC_A4_PREVIEW=1`), `evidence/evidence.sqlite` also holds their
rows as stored and the ledger rows those rows name, and the ledger slice is extended so it stays one unbroken prefix.
`manifest.json` then lists the slice under `a4`: each project's exported head and `containsSyntheticExamples`. A4 rules
and the offline A4 verifier are described in `docs/A4_FORGE.md`; `amc bundle verify` does not check the A4 rules.

## Verification Checks

`amc bundle verify` checks:

1. Manifest signature (auditor public key).
2. File hash/size consistency against manifest.
3. Run signature/hash integrity.
4. Target signature integrity.
5. Ledger hash chain + monitor signatures + run seals + blob hashes (offline).

Any failure exits non-zero with detailed errors.

## Sharing Guidance

- Share bundles without private keys.
- Keep the bundle immutable once exported.
- Use `amc bundle diff` to compare posture shifts between releases.
