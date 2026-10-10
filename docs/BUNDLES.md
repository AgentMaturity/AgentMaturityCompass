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

When the exporting process runs with `AMC_A4_PREVIEW=1` and the run's agent has A4 Forge projects, the bundle also
holds `a4/<projectId>.json` for each one: an `amc.a4-record/v1` record of the project rows as stored and the ledger
rows they name. Each project's chain is verified before it is exported, and one that does not verify refuses the export.
`manifest.json` lists the records with every other file and names the slice under `a4`: each project's exported head
and `containsSyntheticExamples`. `evidence/evidence.sqlite` is unchanged by the slice. A4 rules and the offline A4
verifier are described in `docs/A4_FORGE.md`; `amc bundle verify` does not check the A4 rules.

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
