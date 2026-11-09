# Evidence Bundles

AMC bundles are portable `.amcbundle` TAR.GZ archives that can be verified offline.

## Commands

```bash
amc bundle export --agent <agentId> --run <runId> --out .amc/agents/<agentId>/bundles/<runId>.amcbundle [--attest]
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
- `evidence/evidence.sqlite` (the ledger slice the run needs; see "What the evidence slice holds" below)
- `evidence/blobs/*` (referenced blobs)
- `metadata/exportInfo.json`

When the exporting process runs with `AMC_A4_PREVIEW=1` and the run's agent has A4 Forge projects, the bundle also
holds `a4/<projectId>.json` for each one: an `amc.a4-record/v1` record of the project rows as stored and the ledger
rows they name. Each project's chain is verified before it is exported, and one that does not verify refuses the export.
`a4/index.json` names each project's exported head and `containsSyntheticExamples`, and `manifest.json` lists it and
the records with every other file. A project is the agent's by the receipt signed for its first audit row, never by an
editable column. `evidence/evidence.sqlite` is unchanged by the slice; with the flag set, `amc certify`'s internal
bundle carries it too, so a project that does not verify also refuses certification. A4 rules and the offline A4
verifier are described in `docs/A4_FORGE.md`; `amc bundle verify` does not check the A4 rules.

With `--attest`, the bundle also holds `attestations/aibom.cdx.json` (the agent's CycloneDX AIBOM, [AIBOM.md](AIBOM.md))
and `attestations/control-results.sigstore.json` (an in-toto statement about the run, DSSE-signed with the
`artifact-seal` key in a Sigstore bundle, [ATTESTATIONS.md](ATTESTATIONS.md)). Both are written before the manifest is
gathered, so `manifest.json` lists them and the manifest signature covers them.

## What the evidence slice holds

The ledger is one hash chain across every session, so the slice is a prefix of it: every row up to the newest row the
run's evidence names, extended to the newest row of every session that prefix touches, with the blobs of all those rows.
A session that ran through the window, such as a running Studio's gateway session, therefore brings every row up to its
newest one, which can be well after the window, and the rows of other sessions in between. Treat a bundle as carrying
the workspace's evidence up to the export, not only the run window, and share it only with parties who may see that.
Retention bounds how far back it reaches.

Decision (LIVE-INTEGRITY-09, closed 2026-11-09): the slice is not trimmed further. Each extension is what verification
needs. A sealed session cut short no longer matches its seal. An unsealed session cut at the window would end long
before the export, and a bundle verifies as of its admitted export time (so a session that was open at export reads as
open), so the cut session would read as interrupted (`missing seal`) once the export came more than 15 minutes after
the window. Verifying as of the newest copied row instead would fail a tool session that paused for more than 15
minutes before the window ended and wrote again before the export; only the gateway heartbeats every 5 minutes. Keeping
the export-time rule and the full tails is the safe choice.

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
