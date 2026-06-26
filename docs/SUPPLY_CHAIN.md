# Supply Chain

AMC uses "supply chain" in two places:

- Operational supply-chain agents: supplier risk, procurement, traceability, freight, carrier, 3PL, warehouse, and logistics workflows.
- AMC release supply chain: signed packages, SBOMs, provenance, dependency inventory, and offline verification.

## Operational AI Agent Routing

Use AMC domain aliases when scoring an agent that works in supply-chain or logistics operations:

```bash
amc domain list
amc domain assess --agent <agent-id> --domain supply-chain
amc domain assess --agent <agent-id> --domain logistics
amc domain modules --domain logistics
amc domain pack describe --pack freight-3pl-warehouse
amc score operational-independence <agent-id> --domain logistics --json
```

Routing rules:

| Operations Need | CLI Domain Input | Canonical Domain | Suggested Packs |
|---|---|---|---|
| Supplier risk, procurement, traceability, materials, food systems, energy grids | `supply-chain`, `supply chain`, `scm`, `procurement`, `vendor-risk` | `environment` | `farm-to-fork`, `weave-to-wear`, `material-to-machines`, `source-to-sustenance`, `ubiquity-to-utility` |
| Freight, 3PL, warehouse, carrier, transport, port logistics | `logistics`, `freight`, `3pl`, `warehouse`, `carrier`, `transportation` | `mobility` | `freight-3pl-warehouse`, `sustainable-ports`, `virtual-infrastructure`, `privacy-security-mobility`, `sustainable-communities` |

AMC reports and JSON output use the canonical domain ID after alias resolution. Freight, 3PL, warehouse, and carrier-reliability depth is covered by the `freight-3pl-warehouse` sector pack. Runtime logistics reliability is covered by `amc score operational-independence <agent-id> --domain logistics --json`, which adds carrier reliability, exception closure, WMS/warehouse integrity, SLA breach rate, traceability coverage, and cold-chain integrity metrics to the generic operational independence score.

External anchors:

- [ISO 28000:2022](https://www.iso.org/standard/79612.html) covers security-management requirements with supply-chain relevance.
- [NIST SP 800-161r1-upd1](https://doi.org/10.6028/NIST.SP.800-161r1-upd1) covers cybersecurity supply-chain risk management practices for systems and organizations.
- [GS1 EPCIS 2.0](https://ref.gs1.org/standards/epcis/) defines visibility event data shared within and across enterprises.

## Release Supply Chain Guarantees

AMC release engineering produces signed, offline-verifiable release evidence.

## Artifacts

`amc release pack` includes:
- npm package tarball
- SBOM (`sbom.cdx.json`)
- dependency licenses (`licenses.json`)
- provenance record (`provenance.json`)
- strict secret scan (`secret-scan.json`)
- signed manifest (`manifest.json` + `manifest.sig`)

## What Is Guaranteed

- Artifact hashes are checked against the signed manifest.
- Manifest signatures are Ed25519 and verifiable offline.
- Secret scanning blocks HIGH-risk findings.
- Verification does not require network access.

## What Is Not Guaranteed

- This is not a legal attestation.
- Provenance is an AMC provenance record, not formal SLSA certification.
- License inventory is best-effort from installed dependencies and lockfile metadata.

## Commands

```bash
amc release sbom --out sbom.cdx.json
amc release licenses --out licenses.json
amc release provenance --out provenance.json
amc release pack --out dist/amc-<version>.amcrelease
amc release verify dist/amc-<version>.amcrelease
```
