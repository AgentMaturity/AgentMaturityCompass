Every row in this log is experimental until a named expert signs it (contract rule 8; decision D-08). An AI agent drafted these corrections; none of them is approved.

# P0-24 citation corrections: review log

This log lists the citation corrections made under plan item P0-24, the official source each one was checked against, and the date that source was read. The "Expert, credential, date" column stays empty until the expert named under D-08 reviews the row. Rows the agent could not settle are marked "needs expert"; the agent did not choose an identifier or wording for them.

Ported strings are copied from candidate branch `amc/regulated-platform-20261003` at `37c1466b` (source commits `ac8aca7f` for the wealth station, `4e53ceb5` for the governance station, `37c1466b` for three EU AI Act classification strings). Question weights stay as they are on main; only the citation-bearing text was ported.

The catalogue records added or changed by P0-24 (`src/domains/packs/catalogueUs.ts`, `catalogueEu.ts`) carry the note `experimental: P0-24 correction, awaiting expert sign-off.`

## Sources read on 2026-10-07

| Source | URL | What it showed |
| --- | --- | --- |
| OMB M-25-21 (PDF, sha256 `0aab0aa4…9e49813`) | https://www.whitehouse.gov/wp-content/uploads/2025/02/M-25-21-Accelerating-Federal-Use-of-AI-through-Innovation-Governance-and-Public-Trust.pdf | Dated April 3, 2025; "rescinds and replaces" M-24-10 |
| Federal Reserve SR 26-2 | https://www.federalreserve.gov/supervisionreg/srletters/SR2602.htm | Dated April 17, 2026; supersedes SR 11-7 (April 4, 2011) and SR 21-8 |
| SR 26-2 attachment | https://www.federalreserve.gov/supervisionreg/srletters/SR2602a1.pdf | Footnote 3: generative AI and agentic AI models are not within the scope of the guidance. Section V "Model Validation and Monitoring" has the subheadings "Conceptual Soundness" and "Outcomes Analysis" |
| EO 14148 (Federal Register API, FR Doc 2025-01901) | https://www.federalregister.gov/api/v1/documents/2025-01901.json | Executive-order notes list EO 13985 (January 20, 2021) and EO 14110 (October 30, 2023) as revoked |
| EEOC AI technical assistance page | https://www.eeoc.gov/laws/guidance/select-issues-assessing-adverse-impact-software-algorithms-and-artificial | HTTP 404 (also 404 on 2026-10-03 per register entry `us-eeoc-ai-ta`) |
| EU AI Act Art. 5 (consolidated text as at 27 July 2026) | https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-5 | Art. 5(1)(c) social scoring applies to any actor; Art. 5(1)(f) prohibits inferring emotions in the workplace and education institutions, except for medical or safety reasons |
| Commission Guidelines on prohibited AI practices | https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-prohibited-artificial-intelligence-ai-practices-defined-ai-act | Published 04 February 2025; non-binding |
| 29 CFR 1607.4 (eCFR versioner API, as of 2026-10-01) | https://www.ecfr.gov/api/versioner/v1/full/2026-10-01/title-29.xml?part=1607&section=1607.4 | §1607.4(D) "Adverse impact and the four-fifths rule" |
| 29 CFR 1630.11 (eCFR versioner API, as of 2026-10-01) | https://www.ecfr.gov/api/versioner/v1/full/2026-10-01/title-29.xml?part=1630&section=1630.11 | Administration of tests |
| 42 U.S.C. 12112 (U.S. Code 2023, govinfo) | https://www.govinfo.gov/content/pkg/USCODE-2023-title42/html/USCODE-2023-title42-chap126-subchapI-sec12112.htm | (b)(5)(A) reasonable accommodation; (b)(6) screening criteria; (b)(7) test administration |
| MITRE ATLAS v2026.09 data file (in-repo table from P0-25, sha256 `935efa93…ddb66688`, retrieved 2026-10-07) | `src/compliance/citations/reference/atlas.json` | AML.T0048 External Harms; AML.T0051 LLM Prompt Injection; AML.T0054 LLM Jailbreak; AML.T0057 LLM Data Leakage |
| NIST AI 100-1 (in-repo table from P0-25, retrieved 2026-10-07) | `src/compliance/citations/reference/nistAiRmf.json` | GOVERN 1.1: "Legal and regulatory requirements involving AI are understood, managed, and documented." |

`www.ilga.gov` did not answer on 2026-10-07 (connection failed), so 820 ILCS 42 has no catalogue record.

## Corrections

Row numbers follow the P0-24 issue table.

| # | Location | Old | New | Source | Retrieved | Status | Expert, credential, date |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `src/score/domainPacks.ts` GOV-2 | `EU AI Act Art.68, OMB M-24-10` | `OMB M-25-21` | M-25-21 PDF | 2026-10-07 | Applied. The issue's parenthetical "(rescinds M-24-10)" is left out: the citation linter reads any M-24-10 mention as a live citation (CIT001); the rescission is recorded in catalogue record `us-omb-m-25-21`. Needs expert: whether an AI Act article belongs here | |
| 2 | `src/score/domainPacks.ts` governance basis; `src/domains/domainRegistry.ts` governance `regulatoryBasis` and `complianceFrameworks`; `src/domains/domainModuleMap.ts` governance mapping | `OMB M-24-10` | `OMB M-25-21` | M-25-21 PDF | 2026-10-07 | Applied | |
| 3 | `src/score/domainPacks.ts` FIN-1 | Text "per SR 11-7"; ref `Federal Reserve SR 11-7 — Model Risk Management`; L5 "SR 11-7 validation report" | Text "Are the traditional models the agent calls inventoried, validated and subject to effective challenge under SR 26-2, with generative or agentic parts governed separately?"; ref `Federal Reserve SR 26-2 — Revised Guidance on Model Risk Management (17 Apr 2026)`; L5 "SR 26-2 validation record" | SR 26-2 letter and attachment | 2026-10-07 | Applied | |
| 4 | `src/score/domainPacks.ts` FIN-2, FIN-3 | `SR 11-7 §IV — Model Validation: Outcomes Analysis`; `SR 11-7 — Model Validation: Conceptual Soundness` | `SR 26-2 §V — Model Validation and Monitoring: Outcomes Analysis`; `SR 26-2 §V — Model Validation and Monitoring: Conceptual Soundness` | SR 26-2 attachment, section V headings | 2026-10-07 | Applied from the attachment's own headings; needs expert confirmation of the section | |
| 5 | `src/score/domainPacks.ts` wealth basis; `src/domains/domainRegistry.ts` wealth `regulatoryBasis` and `complianceFrameworks`; `src/domains/domainModuleMap.ts` wealth | `SR 11-7` | `SR 26-2` | SR 26-2 letter | 2026-10-07 | Applied | |
| 6 | `src/assurance/packs/financialModelRiskPack.ts` description | "SR 11-7 oriented checks for explainability, …" | "SR 26-2 oriented checks (models the agent calls; SR 26-2 excludes generative and agentic AI) for explainability, …" | SR 26-2 attachment, footnote 3 | 2026-10-07 | Applied. The prompt line in the same file belongs to P0-19 and still says SR 11-7 | |
| 7 | `src/domains/industryPacks.ts` WLT-CE-6 | "per SR 11-7 and EBA Guidelines on ESG Risk Management"; ref `SR 11-7; EBA Guidelines on ESG Risk Management (2024)` | Ported from candidate `wealth.ts:189`; ref `SR 26-2` | SR 26-2 letter and attachment | 2026-10-07 | Applied (weight 12 kept; candidate has 10) | |
| 8 | Candidate-only F1 operating profiles | `Federal Reserve SR 11-7 …` | P1-15 replaces it; this issue adds catalogue record `us-sr-26-2` for it to cite | SR 26-2 letter | 2026-10-07 | Record added; file edit belongs to P1-15 | |
| 9 | `src/diagnostic/questionBank.ts` upgradeHints | "EU AI Act, US EO 14110, China GenAI Interim Measures, Canada AIDA, Brazil AI Bill" | "EU AI Act, China GenAI Interim Measures, Canada AIDA, Brazil AI Bill" | EO 14148 record | 2026-10-07 | Applied. Needs expert: AIDA (Bill C-27 lapsed per S9) and the Brazil bill (pending per S9) | |
| 10 | `src/domains/industryPacks.ts` WLT-FW-1, WLT-FW-12 | `EEOC AI Guidance on Title VII`; `EEOC AI guidance (2023); ADA 42 U.S.C. §12112` | Ported from candidate `wealth.ts:38` (ref `29 CFR 1607.4(D)`) and `wealth.ts:48` (ref `42 U.S.C. 12112(b)(5)-(7); 29 CFR 1630.11`) | eCFR 1607.4 and 1630.11; govinfo 42 U.S.C. 12112; EEOC page 404 | 2026-10-07 | Applied; re-verify the EEOC position before publishing | |
| 10a | `src/domains/industryPacks.ts` WLT-FW-11 | Ref `Illinois AIPA §15` | Ported from candidate `wealth.ts:47`: ref `820 ILCS 42/5; 820 ILCS 42/15` (weight 12 kept; candidate has 10) | None read: ilga.gov unreachable | — | Applied as ported; 820 ILCS 42 unverified, no catalogue record. Needs expert: whether Illinois HB 3773 (Public Act 103-0804) joins this ref | |
| 11 | `src/score/domainPacks.ts` HC-1 | `FDA 510(k) §21 CFR 820.30 — Design Controls` | `FDA 21 CFR §820.10 (QMSR, incorporating ISO 13485:2016, from 2 Feb 2026); ISO 13485:2016 Clause 7.3` | Catalogue record `us-qmsr` (FR 2024-01709, read 2026-10-03); alias `FDA 21 CFR §820.10` added | 2026-10-03 | Applied | |
| 12 | `src/domains/industryPackAudit.ts` governance and default anchors | `GOVERN 1.1 — policies & accountability` | `GOVERN 1.1 — legal and regulatory requirements involving AI are understood, managed, and documented` | NIST AI 100-1 table | 2026-10-07 | Applied with the official title. Needs expert: whether another subcategory fits the governance dimension better | |
| 13 | `industryPackAudit.ts` transparency anchor | `MAP 3.4 — documentation & transparency` | — | NIST AI 100-1 table | — | Not applied: needs expert (MAP 3.4 covers operator and practitioner proficiency) | |
| 14 | `industryPackAudit.ts` monitoring anchor | `MEASURE 2.7 — monitoring & logging` | — | NIST AI 100-1 table | — | Not applied: needs expert (MEASURE 2.7 covers security and resilience) | |
| 15 | `industryPackAudit.ts` privacy, security and human-oversight anchors | `MAP 2.3`, `MANAGE 2.2`, `MANAGE 4.1` labels | — | NIST AI 100-1 table | — | Not applied: needs expert | |
| 16 | `src/domains/industryPacks.ts` TECH-CI-9 | "NIST AI RMF GOVERN 1.1 organizational AI risk governance" | Relabelled: GOVERN 1.1 is a register of the legal and regulatory requirements that apply (text and levels reworded to match; ref unchanged). Not merged into TECH-CI-14 | NIST AI 100-1 table | 2026-10-07 | Applied. Needs expert: keep, or drop the NIST half | |
| 17 | `industryPackAudit.ts` ISO/IEC 42001 anchors | `A.5 — Internal organization & AI policy`; `A.5 — AI policy` | — | None (standard is paywalled) | — | Not applied: needs expert with a licensed copy; also recheck A.6, A.6.1, A.6.2, A.7, A.8, A.9. Still in the CIT002 baseline | |
| 18 | `src/score/crossFrameworkMapping.ts` MITRE ATLAS | `AML.T0048` Prompt Injection; `AML.T0051` LLM Jailbreak; `AML.T0054` LLM Data Leakage | `AML.T0051` Prompt Injection; `AML.T0054` LLM Jailbreak; `AML.T0057` LLM Data Leakage | ATLAS v2026.09 data file | 2026-10-07 | Applied from the official technique names. Data leakage moved off T0054 so ids stay unique. Needs expert: names of T0000, T0018, T0025, T0047, T0052, and `AML.T0019`, which is not in v2026.09 (still in the CIT002 baseline) | |
| 19 | `src/compliance/builtInMappings.ts` ATLAS descriptions | `atlas_prompt_injection … (AML.T0048)`; `atlas_llm_jailbreak … (AML.T0051)`; data extraction `(AML.T0025, AML.T0054)` | `(AML.T0051)`; `(AML.T0054)`; `(AML.T0025, AML.T0057)` | ATLAS v2026.09 data file | 2026-10-07 | Applied. `platform/python/amc/watch/prebuilt_policy_packs.py` still cites T0048 and T0051 in remediation text (outside this issue's touch scope) | |
| 20 | `src/compliance/euAiActClassifier.ts` | `emotionRecognition` in the Art. 50(3) limited-risk list | Prohibited list, `Art. 5(1)(f)`, except for medical or safety reasons; `--emotion-recognition` help text says so | AI Act Art. 5 | 2026-10-07 | Applied | |
| 21 | `euAiActClassifier.ts` comment; `src/domains/industryPacks.ts` GOV-DCR-9 | "Social scoring by public authorities"; "Article 5(1)(d) prohibition on AI social scoring by public authorities" | "Social scoring (any actor; Art. 5(1)(c))"; GOV-DCR-9 ported from candidate `governance.ts:33` (Art. 5(1)(c); Commission Guidelines) | AI Act Art. 5; Commission Guidelines page | 2026-10-07 | Applied (weight 12 kept; candidate has 15). The ported question drops the CoE AI Convention Art. 14 remedy part | |
| 22 | `src/domains/industryPacks.ts` health packs | `Annex III §5(a) — Access to essential public services (healthcare…)` | `Art. 6(1) and Annex I (… MDR, … IVDR) …` | AI Act | — | Already on main (slice A, P0-12); no edit | |
| 23 | `src/domains/industryPacks.ts` `euAIActClassification` | Six strings that changed again on the candidate | Ported for cognition-to-intelligence, digital-citizens-rights, dance-of-democracy, petition-to-law, citizen-services, public-private-collaboration | AI Act | — | Applied as ported; needs expert review of all 41 | |
| 24 | `src/domains/industryPacks.ts` petition-to-law | `EU Directive 2003/98` | `EU Open Data Directive 2019/1024` | — | — | Already on main (slice A); no edit | |
| 25 | `src/score/domainPacks.ts` GOV-5; `src/domains/domainModuleMap.ts` | `Executive Order 13985` | — | EO 14148 record | 2026-10-07 | Text not changed: needs expert to name a replacement or remove it. Catalogue record `us-eo-13985` marks it repealed | |
| 26 | `src/compliance/mappingSchema.ts` | Missing space (candidate only) | — | — | — | Main already has the space; no edit | |
| 27 | `usStateAiLaws.ts` (candidate only) | `CA-AB2013-CIV-3111(a)` | — | — | — | File not on main: copy to P1-45 | |
| 28 | `catalogueUs.ts` `us-fsma-pchf` (candidate only) | Latest final rule note | — | — | — | Record not on main: copy to P1-42 | |
| 29 | `register.json` `us-nist-ai-rmf`, `us-nist-ai-600-1`, `us-co-sb24-205`, `us-co-sb26-189`, `br-lgpd`, `in-dpdp` | No `affectedPacks` | — | — | — | Not applied: choosing affected packs is an applicability judgment no source states; needs a proposal and expert confirmation (P0-12 follow-up) | |
| 30 | `certificationRequirements.ts` (candidate only) | Pack source path | — | — | — | File not on main: copy to P1-16 | |

## Catalogue records

| Record | Status | supersededBy | Source | Retrieved |
| --- | --- | --- | --- | --- |
| `us-omb-m-25-21` | in-force | — | M-25-21 PDF | 2026-10-07 |
| `us-omb-m-24-10` | repealed | `us-omb-m-25-21` | M-25-21 PDF | 2026-10-07 |
| `us-sr-26-2` | in-force | — | SR 26-2 letter | 2026-10-07 |
| `us-sr-11-7` | repealed | `us-sr-26-2` | SR 26-2 letter | 2026-10-07 |
| `us-eo-14110` | repealed | none (revoked by EO 14148) | EO 14148 record | 2026-10-07 |
| `us-eo-13985` | repealed | none (revoked by EO 14148) | EO 14148 record | 2026-10-07 |
| `us-eeoc-ai-ta` | repealed | none (withdrawn) | EEOC page (HTTP 404) | 2026-10-07 |
| `us-ugesp-1607-4` | in-force | — | eCFR 29 CFR 1607.4 | 2026-10-07 |
| `us-ada-1630-11` | in-force | — | eCFR 29 CFR 1630.11 | 2026-10-07 |
| `us-ada-12112` | in-force | — | govinfo 42 U.S.C. 12112 | 2026-10-07 |
| `eu-ai-act-prohibited-practices-guidelines` | in-force | — | Commission page | 2026-10-07 |
| `us-qmsr` (alias added) | in-force | — | FR 2024-01709 | 2026-10-03 |

## Citation check

`npm run check:citations` after these corrections: CIT001 0 findings, now zero tolerance; CIT002 3 (two ISO/IEC 42001 A.5 labels, `AML.T0019`), still ratcheted until the expert review; CIT004 620 (was 632). `scripts/citations-baseline.json` was shrunk to these counts.
