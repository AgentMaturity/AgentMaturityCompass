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

Measured on 2026-10-04 (darwin arm64, Node v25.5.0) with
`npx tsx` over `frameworkChoices()` and `defaultComplianceMapsFile()`:
20 frameworks, 149 built-in mappings. The first twelve are unchanged since
`8f57ce63`; the eight below them were added for the regulated-platform
stations, in the order shown (`frameworkChoices()` appends, so existing order
is stable).

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
| HHS_HTI_1 | 6 |
| NIST_AI_600_1 | 5 |
| CO_AI_ACT | 4 |
| TX_TRAIGA | 4 |
| CA_AI_LAWS | 7 |
| KR_AI_BASIC_ACT | 4 |

`PCI_DSS` is labelled PCI DSS v4.0.1. The HTI-1 family id is `HHS_HTI_1`
(the rule is HHS's, issued through ASTP/ONC); `ONC_HTI_1`, `onc-hti-1` and
`hti-1` are accepted as input aliases but are not ids, so a maps file that
names `ONC_HTI_1` as a framework fails schema validation.

**Not added: ISO/IEC 42005.** Its text is sold by ISO and was not readable:
iso.org returned HTTP 403 to every fetch on 2026-10-03 and 2026-10-04, and the
IEC webstore page (<https://webstore.iec.ch/en/publication/107659>, read
2026-10-04) gives only the title, a one-line abstract and the publication date
(2025-05-28, edition 1.0). A mapping cannot cite a clause nobody read, so
`ISO_42005` has no family; the existing `ISO_42001` category "ISO 42005 Impact
Assessment" is unchanged. Adding it needs a licensed copy of the standard.

### Sourced mappings

A mapping may carry `sources: [{ title, url, retrievedAt }]`. Every mapping of
the eight families above does; `tests/mappingSources.test.ts` fails if one of
them loses its source or cites a host other than the publishers below, and
`tests/frameworkBreadth.test.ts` fails if a family has fewer than four
mappings or a mapping has no `related.questions`. In a control crosswalk
receipt (`controlCrosswalk.ts`) a row with its own sources cites exactly
those, and the receipt fails closed if they are missing from its citation
list.

| Framework | Official text read | Retrieved | Notes |
| --- | --- | --- | --- |
| DORA | Regulation (EU) 2022/2554, OJ L 333, 27.12.2022 — <https://publications.europa.eu/resource/celex/32022R2554> | 2026-10-03 | Applies from 17 January 2025 (Art. 64). Category names are the article headings. Art. 12, 30 have no AMC mapping; TLPT (Art. 26) is not covered. |
| NIS2 | Directive (EU) 2022/2555, OJ L 333, 27.12.2022 — <https://publications.europa.eu/resource/celex/32022L2555> | 2026-10-03 | Member States apply it from 18 October 2024 (Art. 41). Maps the Directive, not national transpositions. Art. 21(2)(g), (h), (j) have no AMC mapping. |
| HHS_HTI_1 | 45 CFR 170.315(b)(11), eCFR point-in-time 2026-10-01 — <https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-D/part-170/subpart-C/section-170.315> | 2026-10-03 | Added by HTI-1, 89 FR 1192 (2024-01-09, effective 2024-02-08) — <https://www.federalregister.gov/documents/2024/01/09/2023-28857/health-data-technology-and-interoperability-certification-program-updates-algorithm-transparency-and>. Proposed rule 90 FR 60970 (2025-12-29) may revise certification criteria; whether it was finalized for (b)(11) is **unverified**. |
| NIST_AI_600_1 | NIST AI 600-1, Generative AI Profile (July 2024) — <https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf> | 2026-10-04 | Voluntary guidance. Categories are the twelve GAI risks (§2.1-§2.12); each mapping cites the suggested action IDs it evidences (MS-2.5-001, MG-4.1-002, MS-2.2-002, MS-1.1-001, MS-2.7-001, MG-4.3-001, GV-6.2-001). |
| CO_AI_ACT | Colorado SB26-189 final act (2026-05-12) — <https://leg.colorado.gov/bill_files/116432/download>; status page — <https://leg.colorado.gov/bills/sb26-189> | 2026-10-04 | Repeals and reenacts C.R.S. 6-1-1701 to 6-1-1709 (the SB24-205 Colorado AI Act). Signed 2026-05-14 per the status page; takes effect 2027-01-01. The signed-act PDF exceeded the fetcher's 10 MB limit, so the final act sent for signature was read. AG enforcement (§6-1-1706) is not mapped. |
| TX_TRAIGA | Texas HB 149 (89R) enrolled — <https://capitol.texas.gov/tlodocs/89R/billtext/html/HB00149F.htm> | 2026-10-04 | Bus. & Com. Code ch. 552; takes effect 2026-01-01. Enforced only by the attorney general (§552.101), with a 60-day cure period (§552.104). §552.053-.055 bind governmental entities and are not mapped. |
| CA_AI_LAWS | SB 53 — <https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202520260SB53>; AB 2013 — <https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320240AB2013>; CPPA approved regulations text — <https://cppa.ca.gov/regulations/pdf/ccpa_updates_cyber_risk_admt_appr_text.pdf> | 2026-10-04 | Limited to SB 53 (B&P §22757.12-.13, chaptered 2025-09-29; binds frontier developers), AB 2013 (Civ. Code §3111, chaptered 2024-09-28) and the CCPA ADMT regulations (11 CCR §7200-7222, OAL-approved 2025-09-22; existing ADMT uses comply by 2027-01-01 under §7200(b)). The rest of the CCPA is not mapped, so the pack string `CCPA/CPRA` stays unresolved. |
| KR_AI_BASIC_ACT | KLRI English translation of Act No. 20676 as amended by Act No. 21311 — <https://elaw.klri.re.kr/eng_mobile/viewer.do?hseq=73499&type=part&key=18>; law.go.kr English record — <https://www.law.go.kr/LSW/lsInfoP.do?chrClsCd=010203&lsiSeq=268543&urlMode=engLsInfoR&viewCls=engLsInfoR> | 2026-10-04 | In force 2026-01-22. KLRI's is a reference translation; the Korean text governs. law.go.kr showed only the record header (act number and dates), so article text comes from KLRI. Art. 33 (confirmation) and Art. 36 (domestic representative) are categories without mappings. |

EUR-Lex (`eur-lex.europa.eu`) answered with a bot challenge on 2026-10-03, so
the EU texts were read from the EU Publications Office, which serves the same
Official Journal documents by CELEX number.

Each mapping says what AMC evidence shows and what it does not: AMC observes
the agent, so entity-level duties (a management body's approval, notifying a
CSIRT, competent authority or attorney general, delivering a consumer notice,
publishing a framework on a website, contract terms) are named as not
evidenced. Several statutes turn on intent (Texas §552.052-.057) or apply only
above a threshold (SB 53 frontier models; Korea Art. 32 compute threshold);
the mappings say so rather than imply the agent's evidence settles it.

### Framework names from industry packs

`normalizeFrameworkName` accepts exact ids, the aliases, and versioned or
clause-qualified names as packs cite them (`GDPR Art. 9`, `PCI DSS v4.0.1`,
`SOC 2 Type II`, `EU NIS2 2022/2555`, `ONC 45 CFR §170`). The aliases and
patterns live in `src/compliance/frameworks/aliases.ts`. Patterns are anchored
at the start, so a different instrument (`NIST CSF 2.0`, `ISO/IEC 27701:2019`,
`HITECH Act`, `CCPA/CPRA`) stays unresolved. `classifyFrameworkString` returns
the framework and how it resolved (`exact`, `alias`, `pattern`) or
`sector-standard-not-modelled`. On 2026-10-04 the 41 packs cite 224 distinct
strings: 31 resolve and 193 do not. The 193 are committed in
`tests/fixtures/packFrameworkStrings.unresolved.json`, and
`tests/packFrameworkAliases.test.ts` fails if the set changes, so a pack edit
that adds a framework string must update the fixture or a family.

On 2026-10-04 nine aliases were added for the regulatory register ids
(`src/compliance/regulatory/register.json`: `eu-dora`, `eu-nis2`,
`us-nist-ai-600-1`, `us-co-sb24-205`, `us-co-sb26-189`) and the official
instrument names (`Regulation (EU) 2022/2554`, `Digital Operational Resilience
Act`, `Directive (EU) 2022/2555`, `Implementing Regulation (EU) 2024/2690`).
No pack string changed resolution: 224 distinct, 31 resolved, 193 unresolved
before and after (measured with `npx tsx` over `listIndustryPacks()`).

### Clause-level controls

A built-in mapping covers a category; `src/compliance/frameworks/controls.ts`
lists the clauses under it. Each control quotes one clause of an official text
and names the built-in mappings whose evidence covers it. Rows are validated by
`frameworkControlSchema` (`src/compliance/mappingSchema.ts`):

- `sourceUrl`, `retrievedAt` and `verified` on every row. `verified` means the
  text was string-checked against `sourceUrl` as read on `retrievedAt`.
- `textKind` is `verbatim`, `verbatim-excerpt` or `paraphrase`. A paraphrase
  can never be `verified`, and an unverified row must give `unverifiedReason`.
- `status` is `law`, `proposed` or `guidance`.
- each mapping's `coverage` is `partial` (its evidence addresses part of the
  clause) or `supporting` (it only overlaps the clause: a mapping written for
  another clause or another framework). No control is fully covered.

The rows were applied on 2026-10-04 from the round-2 framework mappings
(`AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/round2/frameworks/`)
with the refuters' required fixes, by
`AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/apply/frameworks/gen-controls.py`.
Counts from that run (`apply/frameworks/counts.json`):

| Framework | Controls | Verified | Mapped (partial / supporting only) | Unmapped | Status |
| --- | --- | --- | --- | --- | --- |
| DORA | 56 | 55 | 31 (15 / 16) | 25 | law |
| NIS2 | 89 | 89 | 43 (43 / 0) | 46 | law |
| NIST_AI_600_1 | 12 | 12 | 7 (5 / 2) | 5 | guidance |
| NIST_AI_RMF | 49 | 49 | 43 (33 / 10) | 6 | guidance |
| CO_AI_ACT | 11 | 11 | 8 (5 / 3) | 3 | law |
| TX_TRAIGA | 10 | 10 | 6 (5 / 1) | 4 | law |
| CA_AI_LAWS | 15 | 15 | 9 (7 / 2) | 6 | law |
| HHS_HTI_1 | 19 | 19 | 15 (12 / 3) | 4 | law |
| HIPAA | 29 | 29 | 22 (17 / 5) | 7 | proposed |

Notes on the rows:

- DORA: of the 16 supporting-only controls, 9 have a DORA mapping written for
  another article and 7 have only other frameworks' mappings. The one
  unverified row, `RTS-2025/1190`, paraphrases the TLPT RTS article headings.
  Delegated Regulation (EU) 2024/1502 Art. 7 defers sub-criterion 1.4 to
  16 January 2025; no control row depends on that date.
- NIS2: the Directive rows were read from the Publications Office text and the
  Implementing Regulation (EU) 2024/2690 rows from the EUR-Lex OJ PDF. The
  refuter could not re-fetch that PDF on 2026-10-04 (HTTP 202, empty body), so
  those rows rest on the copy read by the author. IR Art. 15 (repeal of
  Regulation 2018/151) has no row.
- NIST: the 12 risk rows sit on the NIST_AI_600_1 risk categories; the 49 AI
  RMF subcategory rows are quoted as NIST AI 600-1 §3 reproduces them and sit on
  the NIST_AI_RMF functions. The suggested actions are not carried.
- HIPAA: every row quotes the Security Rule NPRM (90 FR 898, 2025-01-06), a
  proposed rule. The current 45 CFR 164.302-318 text stays the obligation.
- HHS_HTI_1: the HTI-5 proposed rule would revise or remove several of these
  criteria; whether it was finalized is unverified.

Not applied: ISO/IEC 42005 and 42006 (descoped above; their 132 round-2 rows
are all unverified clause headings), NYC Local Law 144 (4 rows) and the
Illinois Human Rights Act AI amendment (2 rows, both unverified paraphrases),
because neither is a framework family and adding a family is outside this
change, the 13 FDA rows (no FDA family), the obligations-for-agents files, the
calendars and the gap notes.

### Coverage score

`coverageScore` weights SATISFIED 1, PARTIAL 0.5, MISSING 0 and UNKNOWN 0
(UNKNOWN means no evidence was evaluated, so it earns nothing; it earned 0.25
before 2026-10-03). It refuses to score a row without a control id.
