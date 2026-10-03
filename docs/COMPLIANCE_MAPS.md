# Compliance Maps

AMC Compliance Maps are signed control/evidence crosswalks used by the Audit Binder.

They map deterministic AMC evidence checks to control families and framework-like groupings (for example SOC2-like, ISO-like, NIST-like labels).

This is an engineering crosswalk, not legal advice.

## Structure

An audit map defines:

- control families (minimum 9 in builtin v1)
- controls per family (minimum 4 each)
- required evidence kinds
- strong-claim gates (integrity/correlation thresholds)
- deterministic checks (`satisfiedBy`)
- remediation action hints

Each control outputs:

- `PASS`, `FAIL`, or `INSUFFICIENT_EVIDENCE`
- deterministic reason codes
- evidence refs (hashes/ids only)

## Signing and Governance

- `builtin.yaml` and `active.yaml` are both signed.
- Only OWNER can apply a new active map.
- Invalid map signature fails closed for audit endpoints and readiness checks.

## Commands

```bash
amc audit map list
amc audit map show --id builtin
amc audit map apply --file ./active.yaml --reason "activate enterprise map"
amc audit map verify
```

## Extending Safely

When adding map content:

- keep checks deterministic and evidence-bound
- keep reason templates fixed (no model-generated text)
- never require raw prompt/content disclosure
- preserve privacy-safe outputs (hashes, refs, categorical statuses)

## Framework crosswalk (`amc comply report`)

Separate from the audit maps above, `src/compliance/` maps AMC evidence to
framework clauses for `amc comply report --framework <id>`. The built-in set
lives in `src/compliance/builtInMappings.ts`; the framework families and the
name normalizer live in `src/compliance/frameworks.ts`.

Measured at commit `de349bee` (2026-10-03, darwin arm64, Node v25.5.0):
15 frameworks, 125 built-in mappings.

| Framework id | Mappings |
| --- | --- |
| SOC2 | 5 |
| NIST_AI_RMF | 4 |
| ISO_27001 | 5 |
| ISO_42001 | 11 |
| EU_AI_ACT | 12 |
| GDPR | 13 |
| MITRE_ATLAS | 8 |
| OWASP_API_TOP10 | 10 |
| HIPAA | 10 |
| SOX | 9 |
| FEDRAMP | 10 |
| PCI_DSS | 4 |
| DORA | 9 |
| NIS2 | 9 |
| ONC_HTI_1 | 6 |

### Sourced mappings

A mapping may carry `sources: [{ title, url, retrievedAt }]`. Every DORA, NIS2
and ONC_HTI_1 mapping does, and `tests/complianceMapping.test.ts` fails if one
of them loses its source or cites a host other than the official publishers
below. In a control crosswalk receipt (`controlCrosswalk.ts`) a row with its
own sources cites exactly those, and the receipt fails closed if they are
missing from its citation list.

| Framework | Official text read | Retrieved | Notes |
| --- | --- | --- | --- |
| DORA | Regulation (EU) 2022/2554, OJ L 333, 27.12.2022 — <https://publications.europa.eu/resource/celex/32022R2554> | 2026-10-03 | Applies from 17 January 2025 (Art. 64). Category names are the article headings. Art. 12, 30 have no AMC mapping; TLPT (Art. 26) is not covered. |
| NIS2 | Directive (EU) 2022/2555, OJ L 333, 27.12.2022 — <https://publications.europa.eu/resource/celex/32022L2555> | 2026-10-03 | Member States apply it from 18 October 2024 (Art. 41). Maps the Directive, not national transpositions. Art. 21(2)(g), (h), (j) have no AMC mapping. |
| ONC_HTI_1 | 45 CFR 170.315(b)(11), eCFR point-in-time 2026-10-01 — <https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-D/part-170/subpart-C/section-170.315> | 2026-10-03 | Added by HTI-1, 89 FR 1192 (2024-01-09, effective 2024-02-08) — <https://www.federalregister.gov/documents/2024/01/09/2023-28857/health-data-technology-and-interoperability-certification-program-updates-algorithm-transparency-and>. Proposed rule 90 FR 60970 (2025-12-29) may revise certification criteria; whether it was finalized for (b)(11) is **unverified**. |

EUR-Lex (`eur-lex.europa.eu`) answered with a bot challenge on 2026-10-03, so
the EU texts were read from the EU Publications Office, which serves the same
Official Journal documents by CELEX number.

Each mapping says what AMC evidence shows and what it does not: AMC observes
the agent, so entity-level duties (a management body's approval, notifying a
CSIRT or competent authority, contract terms) are named as not evidenced.

### Framework names from industry packs

`normalizeFrameworkName` accepts exact ids, the legacy aliases, and versioned
or clause-qualified names as packs cite them (`GDPR Art. 9`, `PCI DSS v4.0`,
`SOC 2 Type II`, `EU NIS2 2022/2555`, `ONC 45 CFR §170`). Patterns are anchored
at the start, so a different instrument (`NIST CSF 2.0`, `ISO/IEC 27701:2019`,
`HITECH Act`) stays unresolved. At `de349bee` the 41 packs cite 224 distinct
strings: 31 resolve, 193 name instruments AMC has no control mappings for and
are listed by `tests/frameworks.test.ts` with the packs that cite them.

### Coverage score

`coverageScore` weights SATISFIED 1, PARTIAL 0.5, MISSING 0 and UNKNOWN 0
(UNKNOWN means no evidence was evaluated, so it earns nothing; it earned 0.25
before 2026-10-03). It refuses to score a row without a control id.
