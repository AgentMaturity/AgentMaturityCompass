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
them (S6, introduced by P1-45) append, so the existing order is stable.

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
source-attribute and intervention risk-management requirements; that recorded
proposal reference still requires re-verification. The bounded 2026-10-19
requests did not establish current eCFR text or proposed/final rule status.
All 19 HTI-1 control quotations remain unverified.

**Colorado still needs source-context and applicability review.** The
publisher page and act were captured on 2026-10-19 UTC. The page lists a signed
act dated 2026-05-14. Ten quotations require case conversion and one also
requires a page-footer omission, so none is marked text-verified under the
current policy. These observations do not establish current consolidated law,
commencement or applicability. Re-verify before publishing.

**ISO/IEC 42005 is descoped** (ruling of 2026-10-04). iso.org returned HTTP
403 to every fetch, and the IEC webstore page gives only the title, a
one-line abstract and the publication date, so no clause text was read. The
name stays as an alias with zero mapped controls and the status
`unverified: source unreachable`: `normalizeFrameworkName("ISO/IEC
42005:2025")` is `null` and `classifyFrameworkString` reports
`descoped-source-unreachable`. The `ISO_42001` categories "ISO 42005 Impact
Assessment" and "ISO 42006 Conformity Evidence" keep their names, so evidence
already bound to them still resolves. The three mapping IDs
`iso42005_scope_and_stakeholders`, `iso42005_severity_likelihood_uncertainty`
and `iso42005_mitigation_traceability` stay NOT_EVALUATED with the reason
"not evaluated: descoped (licensed text unavailable)", even if a signed map
renames a display category. The original category fallback also remains
descoped. They are never evaluated, and coverage and the matrix total leave
them out. A licensed copy of the standard is Sid's to supply.

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

| Framework | Declared source | Historical retrieval | Current review notes |
| --- | --- | --- | --- |
| DORA | Regulation (EU) 2022/2554, OJ L 333, 27.12.2022 — <https://publications.europa.eu/resource/celex/32022R2554> | 2026-10-03 | Applies from 17 January 2025 (Art. 64). Category names are the article headings (Art. 12 and 19 shortened), except Art. 24-25, which carries the Chapter IV title, and Art. 28, whose heading is "General principles". Art. 12 and 30 have no AMC mapping; TLPT (Art. 26) is not covered. |
| NIS2 | Directive (EU) 2022/2555, OJ L 333, 27.12.2022 — <https://publications.europa.eu/resource/celex/32022L2555> | 2026-10-03 | Member States apply it from 18 October 2024 (Art. 41). Maps the Directive, not national transpositions. Art. 21(2)(g), (h) and (j) have no NIS2 mapping. |
| HHS_HTI_1 | 45 CFR 170.315(b)(11), eCFR point-in-time 2026-10-01 — <https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-D/part-170/subpart-C/section-170.315> | 2026-10-03 | Added by HTI-1, 89 FR 1192 (2024-01-09, effective 2024-02-08). At risk from HTI-5 (above). |
| NIST_AI_600_1 | NIST AI 600-1, Generative AI Profile (July 2024) — <https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf> | 2026-10-04 | Voluntary guidance. Categories are the twelve GAI risks (§2.1-§2.12); each mapping cites the suggested action ids it evidences. |
| CO_AI_ACT | Colorado SB26-189 final act — <https://leg.colorado.gov/bill_files/116432/download>; bill page — <https://leg.colorado.gov/bills/sb26-189> | 2026-10-04 | Repeals and reenacts C.R.S. 6-1-1701 to 6-1-1709. Signed 2026-05-14 per the bill page (Session Laws ch. 131); duties apply from 2027-01-01. The page and act were captured on 2026-10-19; all 11 quotations still require case/page-context review and remain unverified. Current-law applicability is not approved. AG enforcement (§6-1-1706) is not mapped. |
| TX_TRAIGA | Texas HB 149 (89R) enrolled — <https://capitol.texas.gov/tlodocs/89R/billtext/html/HB00149F.htm> | 2026-10-04 | Bus. & Com. Code ch. 552; takes effect 2026-01-01. Enforced only by the attorney general (§552.101). §552.053-.055 bind governmental entities and are not mapped. |
| CA_AI_LAWS | SB 53 — <https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202520260SB53>; AB 2013 — <https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320240AB2013>; CPPA approved regulations text — <https://cppa.ca.gov/regulations/pdf/ccpa_updates_cyber_risk_admt_appr_text.pdf> | 2026-10-04 | Limited to SB 53 (B&P §22757.12-.13; binds frontier developers), AB 2013 (Civ. Code §3111) and the CCPA ADMT regulations (11 CCR §7200-7222). The rest of the CCPA is not mapped, so the pack string `CCPA/CPRA` stays unresolved. |
| KR_AI_BASIC_ACT | KLRI English reference translation of Act No. 20676 as amended by Act No. 21311 — <https://elaw.klri.re.kr/eng_mobile/viewer.do?hseq=73499&type=part&key=18>; law.go.kr English record — <https://www.law.go.kr/LSW/lsInfoP.do?chrClsCd=010203&lsiSeq=268543&urlMode=engLsInfoR&viewCls=engLsInfoR> | 2026-10-04 | In force 2026-01-22. KLRI is not the official publisher and the Korean text governs; law.go.kr showed only the record header, so the article text comes from KLRI. KLRI is not on the official host list, so P1-45 did not fetch it, and the Art. 31-35 pinpoints are unverified. Needs a reviewer who reads the Korean text. |

The source declarations and retrieval dates in this table are historical inputs,
not a claim that this review read every instrument. A bounded capture on
2026-10-19 UTC considered 28 exact URLs: eight returned raw HTTP 200 bodies and
20 were unavailable, including redirects that were not followed and the KLRI
refusal before DNS. HTTP 200 or a body hash alone establishes no quotation,
pinpoint, legal or human approval. The new review target is
qualification/2026-10-20-P1-45-solo/; packet assembly and qualification are
separate from these source-text decisions. The six-file
qualification/2026-10-18-P1-45/ packet remains immutable history.

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

- Every row declares sourceUrl, retrievedAt and verified. The current bounded
  source-text policy marks 112 controls verified: 82 match raw text or
  whitespace-only text, and 30 additionally require only NFKC expansion of
  the ﬁ, ﬀ, ﬂ and ﬃ ligatures. Their retrieval date is the actual source UTC
  date, 2026-10-19. The other 178 controls are false with an explicit
  unverifiedReason: 148 cited sources were unavailable and 30 require other
  editorial, page-layout, case or punctuation review. Their original retrieval
  dates remain historical; they are not new successful reads. No casefold,
  punctuation change, hyphen deletion, running-head removal or bracket-span
  omission is accepted silently. The one paraphrase remains unverified.
  Verified records source-text support only, never legal applicability,
  rationale correctness, expert sign-off or compliance. Re-verification and
  human-review state remain in review metadata; no extra native schema fields
  are invented.
- `textKind` is `verbatim`, `verbatim-excerpt` or `paraphrase`. A paraphrase
  can never be `verified`, and an unverified row must give `unverifiedReason`.
- `status` is `law`, `proposed` or `guidance`.
- every link has a `relation` and a non-empty `rationale`. `partial` means the
  mapping's evidence addresses part of the clause; `conflicting` means it pulls
  against the clause; `equivalent` means it covers the whole clause, and needs a
  named D-08 expert's `signOffId`. No sign-off exists, so every built-in link is
  `partial`. The former `coverage` label is gone: `partial` stayed `partial`,
  and `supporting` became `partial` with a rationale that names the overlap.
  Each rationale also says what the link does not evidence. The historical
  review recorded 172 research-origin and 169 agent-drafted rationales. Later
  bounded corrections and three unsupported-link removals leave 338 current
  partial links on 181 controls; no named expert has approved them.
- a title never claims text the row does not quote; where a title names a part
  the row leaves out, it says "not quoted".

**No auto-pass.** Crosswalk links are information only. A result for one
framework never sets a result for another: evidence counts for a mapping only
when `meta.controlIds` names that mapping (`src/compliance/evidenceBinding.ts`).
`tests/crosswalkNoAutoPass.test.ts` binds evidence to every DORA mapping and
checks that every NIS2 category is exactly what it is without that binding.

The rows are hand-maintained since P1-45. Their round-2 research inputs are
identified by the sha256 values in `qualification/2026-10-18-P1-45/inputs.json`.

| Framework | Controls | Current text-verified | Linked | Links | Status |
| --- | --- | --- | --- | --- | --- |
| DORA | 56 | 0 | 31 | 48 | law |
| NIS2 | 89 | 25 | 43 | 65 | law |
| NIST_AI_600_1 | 12 | 10 | 7 | 20 | guidance |
| NIST_AI_RMF | 49 | 49 | 43 | 106 | guidance |
| CO_AI_ACT | 11 | 0 | 8 | 14 | law |
| TX_TRAIGA | 10 | 10 | 6 | 9 | law |
| CA_AI_LAWS | 15 | 5 | 9 | 16 | law |
| HHS_HTI_1 | 19 | 0 | 14 | 25 | law |
| HIPAA | 29 | 13 | 20 | 35 | proposed |

Notes on the rows:

- DORA: all 56 current source-text checks are unverified because the cited
  URLs did not yield usable text in this bounded attempt. RTS-2025/1190 also
  paraphrases the TLPT RTS headings and cannot be verified as a quotation.
- NIS2: the Directive rows cite the Publications Office text (https) and the
  Implementing Regulation (EU) 2024/2690 rows the EUR-Lex OJ PDF.
- NIST: 10 of the 12 risk rows and all 49 RMF subcategory rows have current
  source-text support under the disclosed policy. The two risk rows interrupted
  by source footnotes or a page block remain unverified. The three old R9
  discrepancy strings are present in AI 600-1; comparing a different RMF
  publication does not justify changing those quotations.
- HIPAA: the 29 rows concern the Security Rule proposed rule (90 FR 898,
  2025-01-06), not a new binding-law determination. Thirteen have contiguous
  current text support. Fourteen bracketed quotations and two page-layout
  interruptions remain unverified pending context review. This capture did
  not establish current CFR text or a later final-rule status.

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
