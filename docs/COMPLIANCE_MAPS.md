# Compliance Maps

AMC Compliance Maps are signed control/evidence crosswalks used by the Audit Binder.

They map deterministic AMC evidence checks to control families and framework-like groupings (for example SOC2-like, ISO-like, NIST-like labels).

This is an engineering crosswalk, not legal advice.

These are the audit-binder maps (`amc audit map`). The `amc compliance report` maps (`.amc/compliance-maps.yaml`) bind evidence differently: an event counts only when its `meta.controlIds` names the control (or a declared audit type matches), it belongs to the reported agent, it comes from AMC runtime and it falls inside the window; anything else leaves the category NOT_EVALUATED. See [COMPLIANCE.md](COMPLIANCE.md#evidence-binding-and-not-evaluated).

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

**Status: experimental.** Every family, mapping and crosswalk link below was
drafted and refuted by AI agents. None is signed off by a named expert: the
D-08 sign-off is a placeholder (`familyReview(<id>).expertSignOff` is `null`).
Every compliance surface carries this status and the family's flags as
`familyReview`: the report JSON, the Markdown report, the API and Studio report,
`amc compliance matrix` (JSON and Markdown), the fleet report and the generated
reports in `docs/compliance/`. A report is evidence of conformity for the
controls it evaluates, never proof of compliance.

Measured on 2026-10-18 (macOS arm64, Node 22) with `npx tsx` over
`frameworkChoices()` and `defaultComplianceMapsFile()`: 20 frameworks and 149
built-in mappings. The first twelve families are unchanged; the eight below
them (S6, landed by P1-45) append, so the existing order is stable.

| Framework id | Mappings | Flag |
| --- | --- | --- |
| SOC2 | 5 | |
| NIST_AI_RMF | 4 | |
| ISO_27001 | 5 | |
| ISO_42001 | 11 | ISO/IEC 42005 descoped (below) |
| EU_AI_ACT | 12 | |
| GDPR | 13 | |
| MITRE_ATLAS | 8 | |
| OWASP_API_TOP10 | 10 | |
| HIPAA | 10 | |
| SOX | 9 | |
| FEDRAMP | 10 | |
| PCI_DSS | 4 | |
| DORA | 9 | |
| NIS2 | 9 | |
| HHS_HTI_1 | 6 | At risk (below) |
| NIST_AI_600_1 | 5 | |
| CO_AI_ACT | 4 | Re-verify the final text (below) |
| TX_TRAIGA | 4 | |
| CA_AI_LAWS | 7 | |
| KR_AI_BASIC_ACT | 4 | |

`PCI_DSS` is labelled PCI DSS v4.0.1. The HTI-1 family id is `HHS_HTI_1`
(the rule is HHS's, issued through ASTP/ONC); `ONC_HTI_1`, `onc-hti-1` and
`hti-1` are accepted as input aliases but are not ids, so a maps file that
names `ONC_HTI_1` as a framework fails schema validation. Station tags for the
eight new families are the stations of the matching entries in
`src/compliance/regulatory/register.json`.

**HHS HTI-1 is at risk: an HTI-5 final rule may delete model-card
requirements; re-verify before publishing.** The HTI-5 proposed rule
(90 FR 60970, 2025-12-29) proposes removing the §170.315(b)(11)
source-attribute and intervention risk-management requirements. On
2026-10-18 the eCFR API showed no amendment to §170.315 after 2025-10-01, so
(b)(11) was still in the CFR on that date.

**Colorado (`CO_AI_ACT`) was re-verified on 2026-10-18.** The bill page lists
SB26-189 as law (signed 2026-05-14, Session Laws ch. 131). Every quoted clause
matches the final act text (<https://leg.colorado.gov/bill_files/116432/download>),
and its duties apply from 2027-01-01. Re-verify before publishing.

**ISO/IEC 42005 is descoped** (ruling of 2026-10-04). iso.org returned HTTP
403 to every fetch, and the IEC webstore page gives only the title, a
one-line abstract and the publication date, so no clause text was read. The
name stays as an alias with zero mapped controls and the status
`unverified: source unreachable`: `normalizeFrameworkName("ISO/IEC
42005:2025")` is `null` and `classifyFrameworkString` reports
`descoped-source-unreachable`. The `ISO_42001` categories "ISO 42005 Impact
Assessment" and "ISO 42006 Conformity Evidence" keep their names, so evidence
already bound to them still resolves. The three ISO 42005 categories are listed
in every report as NOT_EVALUATED with the reason "not evaluated: descoped
(licensed text unavailable)". They are never evaluated, and coverage and the
matrix total leave them out. A licensed copy of the standard is Sid's to supply.

### Sourced mappings

A mapping may carry `sources: [{ title, url, retrievedAt }]`. Every mapping of
the eight new families does. `tests/mappingSources.test.ts` fails if one of
them loses its source or cites a host outside the shared official-host list
(`src/compliance/citations/officialHosts.ts`). The one exception is the KLRI
English reference translation for Korea, and only beside the official
law.go.kr record. `tests/frameworkBreadth.test.ts` fails if a family has fewer
than four mappings or a mapping has no `related.questions`. In a control
crosswalk receipt (`controlCrosswalk.ts`), a row with its own sources cites
exactly those, and the receipt fails closed if they are missing from its
citation list.

| Framework | Official text read | Retrieved | Notes |
| --- | --- | --- | --- |
| DORA | Regulation (EU) 2022/2554, OJ L 333, 27.12.2022 — <https://publications.europa.eu/resource/celex/32022R2554> | 2026-10-03 | Applies from 17 January 2025 (Art. 64). Category names are the article headings (Art. 12 and 19 shortened), except Art. 24-25, which carries the Chapter IV title, and Art. 28, whose heading is "General principles". Art. 12 and 30 have no AMC mapping; TLPT (Art. 26) is not covered. |
| NIS2 | Directive (EU) 2022/2555, OJ L 333, 27.12.2022 — <https://publications.europa.eu/resource/celex/32022L2555> | 2026-10-03 | Member States apply it from 18 October 2024 (Art. 41). Maps the Directive, not national transpositions. Art. 21(2)(g), (h) and (j) have no NIS2 mapping. |
| HHS_HTI_1 | 45 CFR 170.315(b)(11), eCFR point-in-time 2026-10-01 — <https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-D/part-170/subpart-C/section-170.315> | 2026-10-03 | Added by HTI-1, 89 FR 1192 (2024-01-09, effective 2024-02-08). At risk from HTI-5 (above). |
| NIST_AI_600_1 | NIST AI 600-1, Generative AI Profile (July 2024) — <https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf> | 2026-10-04 | Voluntary guidance. Categories are the twelve GAI risks (§2.1-§2.12); each mapping cites the suggested action ids it evidences. |
| CO_AI_ACT | Colorado SB26-189 final act — <https://leg.colorado.gov/bill_files/116432/download>; bill page — <https://leg.colorado.gov/bills/sb26-189> | 2026-10-04 | Repeals and reenacts C.R.S. 6-1-1701 to 6-1-1709. Signed 2026-05-14 per the bill page (Session Laws ch. 131); duties apply from 2027-01-01. Re-verified 2026-10-18. AG enforcement (§6-1-1706) is not mapped. |
| TX_TRAIGA | Texas HB 149 (89R) enrolled — <https://capitol.texas.gov/tlodocs/89R/billtext/html/HB00149F.htm> | 2026-10-04 | Bus. & Com. Code ch. 552; takes effect 2026-01-01. Enforced only by the attorney general (§552.101). §552.053-.055 bind governmental entities and are not mapped. |
| CA_AI_LAWS | SB 53 — <https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202520260SB53>; AB 2013 — <https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320240AB2013>; CPPA approved regulations text — <https://cppa.ca.gov/regulations/pdf/ccpa_updates_cyber_risk_admt_appr_text.pdf> | 2026-10-04 | Limited to SB 53 (B&P §22757.12-.13; binds frontier developers), AB 2013 (Civ. Code §3111) and the CCPA ADMT regulations (11 CCR §7200-7222). The rest of the CCPA is not mapped, so the pack string `CCPA/CPRA` stays unresolved. |
| KR_AI_BASIC_ACT | KLRI English reference translation of Act No. 20676 as amended by Act No. 21311 — <https://elaw.klri.re.kr/eng_mobile/viewer.do?hseq=73499&type=part&key=18>; law.go.kr English record — <https://www.law.go.kr/LSW/lsInfoP.do?chrClsCd=010203&lsiSeq=268543&urlMode=engLsInfoR&viewCls=engLsInfoR> | 2026-10-04 | In force 2026-01-22. KLRI is not the official publisher and the Korean text governs; law.go.kr showed only the record header, so the article text comes from KLRI. KLRI is not on the official host list, so P1-45 did not fetch it, and the Art. 31-35 pinpoints are unverified. Needs a reviewer who reads the Korean text. |

Each mapping says what AMC evidence shows and what it does not. AMC observes
the agent, so entity-level duties (a management body's approval, notifying a
CSIRT, authority or attorney general, delivering a consumer notice,
publishing a framework, contract terms) are named as not evidenced. Several
statutes turn on intent (Texas §552.052-.057) or apply only above a threshold
(SB 53 frontier models; Korea Art. 32); the mappings say so.

### Framework names from industry packs

`normalizeFrameworkName` accepts exact ids, the aliases, and versioned or
clause-qualified names as packs cite them (`GDPR Art. 9`, `PCI DSS v4.0.1`,
`SOC 2 Type II`, `EU NIS2 2022/2555`, `ONC 45 CFR §170`). The aliases and
patterns live in `src/compliance/frameworks/aliases.ts`. Patterns are anchored
at the start, so a different instrument (`NIST CSF 2.0`, `ISO/IEC 27701:2019`,
`HITECH Act`, `CCPA/CPRA`) stays unresolved. `classifyFrameworkString` returns
the framework and how it resolved (`exact`, `alias`, `pattern`), or
`sector-standard-not-modelled`, or `descoped-source-unreachable` for an
ISO/IEC 42005 name. On 2026-10-18, after P1-42 landed, the packs cite 224
distinct strings: 32 resolve and 192 do not. The 192 are committed in
`tests/fixtures/packFrameworkStrings.unresolved.json`, and
`tests/packFrameworkAliases.test.ts` fails if the set changes. Regenerate the
fixture with `npm run gen:pack-framework-strings` after a build, and check
that every new string is genuinely unmodelled.

### Clause-level controls and crosswalk links

A built-in mapping covers a category; `src/compliance/frameworks/controls.ts`
lists the clauses under it. Each control quotes one clause of an official text
and links to the built-in mappings whose evidence bears on it. Rows are
validated by `frameworkControlSchema` and each link by `crosswalkLinkSchema`
(`src/compliance/mappingSchema.ts`):

- `sourceUrl`, `retrievedAt` and `verified` on every row. `verified` records
  that the drafting agent string-checked the text against `sourceUrl` on
  `retrievedAt`; it is not an independent review. On 2026-10-18, P1-45 fetched
  every cited source on the official host list again. The URL, fetch time and
  sha256 of each body are recorded in `qualification/2026-10-18-P1-45/`. All
  289 quoted rows match the fetched text. The one paraphrase stays unverified.
  The match ignores spacing and running heads, and allows a quote to span a
  page break.
- `textKind` is `verbatim`, `verbatim-excerpt` or `paraphrase`. A paraphrase
  can never be `verified`, and an unverified row must give `unverifiedReason`.
- `status` is `law`, `proposed` or `guidance`.
- every link has a `relation` and a non-empty `rationale`. `partial` means the
  mapping's evidence addresses part of the clause; `conflicting` means it pulls
  against the clause; `equivalent` means it covers the whole clause, and needs a
  named D-08 expert's `signOffId`. No sign-off exists, so every built-in link is
  `partial`. The former `coverage` label is gone: `partial` stayed `partial`,
  and `supporting` became `partial` with a rationale that names the overlap.
  Each rationale also says what the link does not evidence. 172 rationales
  come from the round-2 research notes; the other 169 were drafted by the
  P1-45 agent and are agent-drafted and unreviewed.
- a title never claims text the row does not quote; where a title names a part
  the row leaves out, it says "not quoted".

**No auto-pass.** Crosswalk links are information only. A result for one
framework never sets a result for another: evidence counts for a mapping only
when `meta.controlIds` names that mapping (`src/compliance/evidenceBinding.ts`).
`tests/crosswalkNoAutoPass.test.ts` binds evidence to every DORA mapping and
checks that every NIS2 category is exactly what it is without that binding.

The rows are hand-maintained since P1-45. Their round-2 research inputs are
identified by the sha256 values in `qualification/2026-10-18-P1-45/inputs.json`.

| Framework | Controls | Verified by the drafter | Linked | Links | Status |
| --- | --- | --- | --- | --- | --- |
| DORA | 56 | 55 | 31 | 48 | law |
| NIS2 | 89 | 89 | 43 | 65 | law |
| NIST_AI_600_1 | 12 | 12 | 7 | 20 | guidance |
| NIST_AI_RMF | 49 | 49 | 43 | 106 | guidance |
| CO_AI_ACT | 11 | 11 | 8 | 14 | law |
| TX_TRAIGA | 10 | 10 | 6 | 9 | law |
| CA_AI_LAWS | 15 | 15 | 9 | 16 | law |
| HHS_HTI_1 | 19 | 19 | 15 | 26 | law |
| HIPAA | 29 | 29 | 22 | 37 | proposed |

Notes on the rows:

- DORA: the one unverified row, `RTS-2025/1190`, paraphrases the TLPT RTS
  article headings.
- NIS2: the Directive rows cite the Publications Office text (https) and the
  Implementing Regulation (EU) 2024/2690 rows the EUR-Lex OJ PDF.
- NIST: the 12 risk rows sit on the `NIST_AI_600_1` risk categories; the 49 AI
  RMF subcategory rows are quoted as NIST AI 600-1 §3 reproduces them and sit
  on the `NIST_AI_RMF` functions.
- HIPAA: every row quotes the Security Rule proposed rule (90 FR 898,
  2025-01-06). The current 45 CFR 164.302-318 text stays the obligation.

Not applied: ISO/IEC 42005 and 42006 (descoped above), NYC Local Law 144 and
the Illinois Human Rights Act AI amendment (no framework family), the FDA rows
(no FDA family), and the research's obligations, calendars and suggested
actions.

### Coverage score

`coverageScore` (`src/compliance/coverageScorer.ts`) gives credit only to a
SATISFIED category with observed or independently reviewed evidence. PARTIAL,
MISSING, NOT_EVALUATED and legacy UNKNOWN earn 0 and stay in the denominator.
A self-reported SATISFIED or PARTIAL counts as not evaluated. The engine leaves
descoped categories out of the score altogether.
UNKNOWN earned 0.25 before S6. The score is `null` (not evaluated) when no
category passed or failed, and `coverageScore` refuses to score a row without
a control id.
