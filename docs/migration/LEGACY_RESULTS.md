# Results from AMC 1.x

AMC 1.x (releases 1.0.0 to 1.1.1) wrote results that the current claim rules do not allow. AMC now reads every 1.x result it can identify under a legacy label, either self-reported or a synthetic example, and cites the notice that explains why. It never changes, re-signs or deletes the original files, ledger rows or receipts, so their hashes and signatures still verify.

The notice is `AMC-LEGACY-2026-001` version 1 (`src/migration/legacy/notices/AMC-LEGACY-2026-001.json`). When the rules or the wording change, AMC adds a new version and keeps the old one, so every record that cites a version still resolves.

## Why

- **G4, canned assurance replies.** Every 1.x assurance run graded a canned reply that AMC wrote itself, not the agent's answer, and stored the result as `OBSERVED` or `OBSERVED_HARDENED`.
- **G2, operator-chosen tiers.** 1.x let the operator choose the trust tier of imported or manual evidence, so a row stored as `OBSERVED` or `ATTESTED` may only say what the operator typed.
- **G1, self-vouching artifacts.** 1.x verifiers trusted the public key shipped inside a bundle, certificate or passport, so a valid signature showed only that the file matched its own key.

Together these mean a 1.x result cannot show who observed what. AMC therefore never reads a 1.x result as `observed` or `independently_reviewed`.

## How to read the labels

| Label | Meaning |
| --- | --- |
| `Legacy (1.x), self-reported (notice AMC-LEGACY-2026-001 v1)` | AMC 1.x stored this result and nothing in it can be checked. The result is not evaluated and its level is capped at L1. The original level stays in the file. |
| `Legacy (1.x), synthetic example (notice AMC-LEGACY-2026-001 v1)` | AMC 1.x computed this result from values it generated itself, such as a canned assurance reply or seeded dogfood evidence. It is not evidence and has no level. |

Readers apply the label when they read a stored result, before any relabel run, and also for files outside a workspace, such as a 1.x bundle a third party verifies:

- `amc report`, `executive brief`, fleet reports and the transparency report label a 1.x diagnostic run.
- `amc bundle verify`, `amc cert verify` and `amc bundle inspect` label the run a 1.x bundle or certificate carries.
- `amc assurance verify` labels a 1.x assurance run as a synthetic example, even when its seal verifies.

Verifiers print integrity and the claim on separate lines. A valid signature never raises the claim:

```
Bundle verification PASSED
Claim: Legacy (1.x), self-reported (notice AMC-LEGACY-2026-001 v1) · Result: not evaluated · Evidence: sufficient · Enforcement: none · Review: pending · Applicability: applicable
```

JSON output carries `claimKind` (`self_reported` or `synthetic_example`) and `provenance.legacy` with the AMC version, the original tier and the notice.

## Detection rules

| Rule | Detects | Claim |
| --- | --- | --- |
| `R1-assurance-canned-reply` | An assurance report without `evidenceStatus`. AMC 1.x graded its own canned reply. | Synthetic example |
| `R2-dogfood-seeded` | A ledger session seeded by dogfood (`meta.provenance: "dogfood"`, `meta.source: "dogfood-maturity"` or binary `amc-dogfood-agent`) whose events carry no `meta.claimKind`. Since 1.2 every seeded row carries `claimKind: "synthetic_example"`. | Synthetic example |
| `R3-domain-report` | A domain report printing the 1.x "Certification Readiness" line, which was computed from generated scores. Checked only for a file you pass with `--path`. | Synthetic example |
| `R4-operator-tier` | A ledger session whose imported, manual or external events store `meta.trustTier` `OBSERVED` or `OBSERVED_HARDENED`, or `ATTESTED` without a third-party attestation (`keyId`). The original tier is kept. | Self-reported |
| `R5-no-claim-envelope` | Any other 1.x result without a claim envelope: a diagnostic run whose `methodology.amcVersion` is missing or below 1.2.0 (on its own or inside a bundle or certificate), or a compliance report whose categories have no `result`. The level is capped at L1 and the original level is kept. | Self-reported |

A result that carries a claim kind and status dimensions decided its own claim and is never relabelled.

The ledger itself already reads conservatively: since 1.2 the trust tier of every row comes from who produced it (see [EVIDENCE_TRUST.md](../EVIDENCE_TRUST.md)), so seeded rows never count and imported rows read `SELF_REPORTED`. R2 and R4 only record which sessions 1.x stored with a stronger tier.

### What AMC cannot tell apart

Passports (`.amcpass`), assurance certificates, assurance lab runs and trust-certificate JSON record no AMC version and no claim envelope, and their formats did not change after 1.1.1. Nothing in them distinguishes a 1.x file from a current one, so AMC does not label them legacy. Their verifiers already print them self-reported, which is the claim a 1.x file gets. A relabel run lists such a file under `skipped` with that reason when you pass it with `--path`.

AMC runtime sessions in a 1.x ledger look the same as current ones. They are not relabelled; diagnostic runs that 1.x computed from them are (R5).

## Recording relabels: `amc verify --relabel-legacy`

```sh
amc verify --expect-monitor <monitor sha256> --relabel-legacy --dry-run
amc verify --expect-monitor <monitor sha256> --relabel-legacy --path old-report.md --path old.amcbundle
```

The relabel runs after the integrity check, and only when the check does not fail: the ledger verifies and is anchored (exit 0), or you accepted an integrity-only result with `--allow-unanchored` (exit 2). When the check fails it prints `Legacy relabel skipped` and writes nothing, because a record must not cite a store that fails verification as the original. It never runs `--repair`, and it cannot be combined with it.

It scans these workspace locations and nothing else:

- the ledger `.amc/evidence.sqlite`, opened read-only, one entry per session;
- diagnostic runs in `.amc/runs/` and `.amc/agents/<agent>/runs/`;
- assurance reports in `.amc/reports/assurance/` and `.amc/agents/<agent>/reports/assurance/`;
- each file named with `--path`: a `.amcbundle`, a `.amccert`, an `.amcpass`, a JSON run, assurance report, compliance report or trust certificate, or a text domain report.

Bundles and certificates are extracted to temporary folders. The only files it writes are:

- `.amc/migrations/relabel.jsonl`: one JSON line per relabelled result, appended and never rewritten. Each record holds the notice id and version, the artifact (`kind`, `locator` as a workspace path or `ledger-session:<id>`, and `sha256`), the original 1.x claims (`trustTier`, `level`, `label`), the assigned claim (`claimKind`, `legacy: true`, `levelCap`), the rule, the time and the AMC version that wrote it. A session's `sha256` covers its event hashes in ledger order. Each line's `prevHash` is the SHA-256 of the line before it (64 zeros for the first), so an edited line breaks the chain at that line.
- `.amc/migrations/receipts/<UTC timestamp>.json` and its `.sig`: the migration receipt, signed by the auditor key as `MIGRATION_RECEIPT`. It records the notice, start and finish times, the counts scanned and relabelled per kind, the skipped files with reasons, the log head after the run (`relabelLogHead`, which pins the last line) and `originalsDigest`, the SHA-256 over the sorted SHA-256 of every artifact scanned.

A second run records nothing new: a result already recorded under the same notice version, by `sha256`, is skipped. A new notice version records results again under that version. A broken log, or a receipt that cannot be signed, stops the run before it writes anything. `--dry-run` prints what would be recorded and writes nothing.

## Getting observed results again

A legacy label cannot be upgraded. To get observed results, run the assessments again on the current release against the real agent: `amc run` for a diagnostic run, `amc assurance run` for assurance packs, then export new bundles, certificates and passports. The 1.x files stay as history.
