# Track S3 — worker report (backfilled by the root session from the structured return; the harness refused the subagent's .md write)

- Status (self-report): **PARTIAL**
- Branch: `worktree-wf_5210e2f4-3ea-3`; HEAD before `8f57ce63d8331f1bef1c2a18fde82a7e8f4511da` → after `7b21996e97e064105c5aa8b275fca943694c1a6f`
- Environment: macOS Darwin 25.6.0, arm64, Node v25.5.0, pnpm 10.33.0, vitest 4.1.11. Acceptance reproduced in a fresh clone (scratchpad/s3/fresh-2c291c8a, pulled to 03ac0803) after pnpm install --frozen-lockfile --prefer-offline. The receipt commit 7b21996e changes no code.
- Receipt path (as reported): AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S3/ready-to-wire.diff (committed with git add -f in 7b21996e). report.md and result.json could not be written because the harness blocks report files from subagents; their content is in notesForMonitor.

## Commits
- 5a19ae6d feat: add regulatory-currency schema and 2026 refresh for industry packs
- bf84996a docs: check sector-pack counts against the registry and document regulatory currency
- 05ae53f1 fix: correct verified industry-pack citations (Section 508, AI Act Art. 5, COPPA 2025, WCAG 2.2, FERC Order 901)
- 2c291c8a fix: correct verified health-pack citations (EHDS chapters, IVDR Art. 56, AI Act Arts. 5(1)(f)/49, ONC (g)(10), Cures Act §4004)
- 03ac0803 docs: state the question-depth floor rationale exactly
- 7b21996e chore: add S3 ready-to-wire diff for public question-count surfaces (600 -> 608)

## Files changed
- `src/domains/industryPackRegulatorySchema.ts (new, 217 lines)`
- `src/domains/packs/catalogueHelpers.ts (new, 79)`
- `src/domains/packs/catalogueEu.ts (new, 196)`
- `src/domains/packs/catalogueUs.ts (new, 85)`
- `src/domains/packs/catalogueIntl.ts (new, 195)`
- `src/domains/packs/regulatoryCatalogue.ts (new, 7)`
- `src/domains/industryPacks.ts (data registry, exempt from the line cap)`
- `tests/industryPacks.test.ts (new)`
- `tests/industryPackRegulatory.test.ts (new)`
- `docs/DOMAIN_PACKS.md`
- `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S3/ready-to-wire.diff (git add -f)`

## Commands run
- `node_modules/.bin/vitest run tests/industryPacks.test.ts tests/industryPackRegulatory.test.ts (RED: schema stubbed, catalogue empty)` → 8 failed, 9 passed (17)
- `node_modules/.bin/vitest run tests/industryPacks.test.ts tests/industryPackRegulatory.test.ts (worktree, then fresh clone scratchpad/s3/fresh-2c291c8a @03ac0803)` → 2 files, 17/17 passed. Stdout: packs=41 questions=608 median=15 min=13 max=18 floor=13 | instruments=267 sourced=119 unverified=148 | frameworkLabels=224 builtIn=26 external=198 | questionRefParts=910 resolved=595 unresolved=315
- `vitest run on 17 regression files: industryPacks-infotainment, logisticsIndustryPack, publicQuestionCountDrift, citationMetadata, executiveBoardPath, domainDocs, domain-packs, industryPackAudit, industryPackEntitlement, domainApply, domain-assessment, majorGaps, domain-registry, mcpServer, mcpTools, receiptsCorrelationRuntimeDashboard, studioVaultModeLoop (fresh clone @03ac0803)` → 1 failed, 133 passed (134). Only failure: publicQuestionCountDrift 'expected 608 to be 600', which is unclaimed and needs the ready-to-wire diff. At base 8f57ce63 the 9-file subset passed 43/43.
- `patch -p1 < ready-to-wire.diff, then vitest run publicQuestionCountDrift, citationMetadata, executiveBoardPath, industryPacks, industryPackRegulatory (scratch clone scratchpad/s3/wirecheck @2c291c8a)` → 5 files, 28/28 passed
- `node scripts/architecture-boundaries-check.mjs (read-only)` → status failed only because dist/cli.js and dist/api/index.js are missing (no build was run). Line counts: new files ≤196 lines; industryPacks.ts is an exempt registry.

## Typecheck
pnpm typecheck exited 0 with no diagnostics, in the worktree and in a fresh clone @03ac0803. pnpm typecheck:tests exited 0 with no diagnostics in both places.

## Acceptance self-report
- [x] Both acceptance test files pass and print packs=41 and the measured question total — `pnpm vitest run tests/industryPacks.test.ts tests/industryPackRegulatory.test.ts` → 17/17 passed. Prints 'packs=41 questions=608 median=15 min=13 max=18 floor=13'. The output goes through process.stdout.write because vitest's agent reporter (AI_AGENT is set) hides console.log from passing tests.
- [x] Every pack has lastReviewed = 2026-10-0x, and every regulatory reference has a source URL or status unverified — `same; tests 'every pack records a lastReviewed date...', 'every catalogued instrument is valid...', 'every regulatory reference attached to a pack carries currency'` → All 41 packs have lastReviewed 2026-10-03. All 267 instruments validate: 119 carry an https url and retrievedAt, 148 are status unverified. Every regulatoryBasis entry resolves to an instrument.
- [x] No file under src/domains/packs exceeds 800 lines; INDUSTRY_PACKS, getIndustryPack and scoreIndustryPack keep their signatures — `wc -l src/domains/packs/*.ts; the 'public functions keep their signatures' test; pnpm typecheck` → File sizes 196/79/195/85/7. INDUSTRY_PACKS is still Record<IndustryPackId, IndustryPack>; getIndustryPack.length=1, scoreIndustryPack.length=2; typecheck exit 0.
- [x] docs/DOMAIN_PACKS.md counts match the test output — `the 'docs/DOMAIN_PACKS.md sector-pack counts match the registry' test` → The table reads environment 6/87, health 9/151, wealth 5/72, education 5/72, mobility 6/84, technology 5/71, governance 5/71, Total 41/608. The test asserts each row against getStationSummary.

## Mutation checks
- Pack lastReviewed required (validatePackRegulatoryCurrency) — mutation: Removed lastReviewed from farm-to-fork in src/domains/industryPacks.ts — RED: 2 failed / 11 passed: 'pack farm-to-fork: lastReviewed is missing' — restored: git checkout -- file, then 13/13 passed
- complianceFrameworks normalization — mutation: Changed 'GS1 EPCIS 2.0' to 'Xyzzy Garbage Framework 7' in freight-3pl-warehouse complianceFrameworks — RED: 2 failed / 11 passed: 'neither normalizes to a built-in framework nor resolves to a catalogued external instrument' — restored: 13/13 passed
- A non-unverified status needs an https url (validator code) — mutation: Replaced the url check with if (false) in industryPackRegulatorySchema.ts — RED: 1 failed / 12 passed: 'a verified status needs a source; unverified does not' — restored: 13/13 passed
- A non-unverified status needs an https url (catalogue data) — mutation: Set the nist-csf-2 url to an empty string in catalogueIntl.ts — RED: 2 failed / 11 passed: 'instrument nist-csf-2: status "current" requires an https source url' — restored: 13/13 passed
- No superseded or repealed citation in a pack — mutation: Changed freight framework 'ISO 9001:2026' back to 'ISO 9001:2015' — RED: 1 failed / 12 passed: 'is superseded (by iso-9001-2026)' — restored: 13/13 passed
- Docs counts match the registry — mutation: Changed the docs/DOMAIN_PACKS.md mobility row from 84 to 78 — RED: 1 failed / 3 passed — restored: 4/4 passed

## Sources
- Publications Office CELLAR SPARQL endpoint (in-force flags, entry-into-force and application dates, amending and repealing relations for all EU acts in catalogueEu.ts) <https://publications.europa.eu/webapi/rdf/sparql> retrieved 2026-10-03 verified=True
- Regulation (EU) 2024/1689 AI Act, OJ xhtml via CELLAR (Arts. 2(6), 5, 26, 49, 50, 51, 53, 113, Annex III) <https://data.europa.eu/eli/reg/2024/1689/oj> retrieved 2026-10-03 verified=True
- Regulation (EU) 2026/1744 Digital Omnibus on AI, OJ xhtml via CELLAR (Art. 113 dates 2027-12-02 and 2028-08-02; Art. 5(1)(ba)-(bb)) <https://data.europa.eu/eli/reg/2026/1744/oj> retrieved 2026-10-03 verified=True
- Directive (EU) 2022/2555 NIS2, Art. 23 <https://data.europa.eu/eli/dir/2022/2555/oj> retrieved 2026-10-03 verified=True
- Regulation (EU) 2022/2554 DORA, Art. 19 <https://data.europa.eu/eli/reg/2022/2554/oj> retrieved 2026-10-03 verified=True
- Regulation (EU) 2024/886 instant payments (Art. 5c verification of payee) <https://data.europa.eu/eli/reg/2024/886/oj> retrieved 2026-10-03 verified=True
- Regulation (EU) No 536/2014 Clinical Trials (Arts. 4, 37, 41-43, 61) <https://data.europa.eu/eli/reg/2014/536/oj> retrieved 2026-10-03 verified=True
- Regulation (EU) 2024/2847 CRA Art. 71; Regulation (EU) 2023/2854 Data Act Art. 50 <https://data.europa.eu/eli/reg/2024/2847/oj> retrieved 2026-10-03 verified=True
- Regulation (EU) 2023/1230 Machinery Art. 54 and corrigendum OJ L 169, 4.7.2023 (20 January 2027) <https://data.europa.eu/eli/reg/2023/1230/oj> retrieved 2026-10-03 verified=True
- Regulation (EU) 2024/3015 Forced Labour Art. 39; Directive (EU) 2019/882 EAA Art. 31 <https://data.europa.eu/eli/reg/2024/3015/oj> retrieved 2026-10-03 verified=True
- Regulation (EU) 2025/327 EHDS (chapter structure, Arts. 23, 44); Regulation (EU) 2017/746 IVDR (Arts. 25, 56) <https://data.europa.eu/eli/reg/2025/327/oj> retrieved 2026-10-03 verified=True
- Federal Register API, final-rule listings per CFR part (21 CFR 11/211/312/820, 45 CFR 164/170, 16 CFR 312, 28 CFR 35, 34 CFR 99/106/300, 36 CFR 1194, 49 CFR 172/395, 42 CFR 424/482, 31 CFR 1010, 17 CFR 229) <https://www.federalregister.gov/api/v1/documents.json> retrieved 2026-10-03 verified=True
- FDA QMSR final rule FR 2024-01709 (full text; effective 2026-02-02; §820.10, ISO 13485 Clauses 7.3 and 7.5.1) <https://www.federalregister.gov/documents/2024/02/02/2024-01709/medical-devices-quality-system-regulation-amendments> retrieved 2026-10-03 verified=True
- FTC COPPA Rule amendments FR 2025-05904, 90 FR 16918 (school-authorization exception not finalized; compliance 2026-04-22) <https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule> retrieved 2026-10-03 verified=True
- DOJ ADA Title II web rule compliance-date extension IFR 2026-07663 <https://www.federalregister.gov/documents/2026/04/20/2026-07663/extension-of-compliance-dates-for-nondiscrimination-on-the-basis-of-disability-accessibility-of-web> retrieved 2026-10-03 verified=True
- ED Recodification of Title IX Rules FR 2026-19929 <https://www.federalregister.gov/documents/2026/09/29/2026-19929/recodification-of-title-ix-rules> retrieved 2026-10-03 verified=True
- FERC Order No. 887 INSM (FR 2023-01453) and Order No. 901 IBR (FR 2023-23581) <https://www.federalregister.gov/documents/2023/10/30/2023-23581/reliability-standards-to-address-inverter-based-resources> retrieved 2026-10-03 verified=True
- eCFR structure API, 36 CFR Part 1194 (§1194.1-2, Appendices A-D) <https://www.ecfr.gov/api/versioner/v1/structure/current/title-36.json> retrieved 2026-10-03 verified=True
- eCFR full text, 45 CFR 170.315 ((g)(10) standardized API; (d)(2) auditable events) <https://www.ecfr.gov/api/versioner/v1/full/2026-10-01/title-45.xml?part=170&section=170.315> retrieved 2026-10-03 verified=True
- 21st Century Cures Act PL 114-255 (§4003 interoperability, §4004 information blocking; approved 2016-12-13) <https://www.govinfo.gov/content/pkg/PLAW-114publ255/html/PLAW-114publ255.htm> retrieved 2026-10-03 verified=True
- ICH E6(R3) Step 4 guideline (document history, Annex 1 table of contents) <https://database.ich.org/sites/default/files/ICH_E6%28R3%29_Step4_FinalGuideline_2025_0106.pdf> retrieved 2026-10-03 verified=True
- EMA ICH E6 page (EU effective dates 2025-07-23 and 2027-01-15) <https://www.ema.europa.eu/en/ich-e6-good-clinical-practice-scientific-guideline> retrieved 2026-10-03 verified=True
- W3C WCAG 2.2 (2.4.11 Focus Not Obscured (Minimum), 2.4.13 Focus Appearance, 3.2.6 Consistent Help; does not supersede 2.1) <https://www.w3.org/TR/WCAG22/> retrieved 2026-10-03 verified=True
- NIST CSF 2.0 page <https://www.nist.gov/cyberframework> retrieved 2026-10-03 verified=True
- NIST AI RMF page (AI 100-1, AI 600-1) <https://www.nist.gov/itl/ai-risk-management-framework> retrieved 2026-10-03 verified=True
- NIST SP 800-161r1-upd1 <https://csrc.nist.gov/pubs/sp/800/161/r1/upd1/final> retrieved 2026-10-03 verified=True
- PCI SSC document library (v4.0.1 current) <https://www.pcisecuritystandards.org/document_library/> retrieved 2026-10-03 verified=True
- iso.org catalogue listings (ISO 9001:2026, 14001:2026, 14155:2026, ISO/IEC 27701:2025, 27799:2025, 13485:2016, 14971:2019, etc.); page bodies return HTTP 403, so editions come from catalogue titles <https://www.iso.org/standard/9001> retrieved 2026-10-03 verified=False
- CONSORT 2025 published statements (listing level) <https://www.consort-spirit.org/published-statements> retrieved 2026-10-03 verified=False
- FATF R.16 update, June 2025 (listing title only; page returned HTTP 403) <https://www.fatf-gafi.org/en/publications/Fatfrecommendations/update-Recommendation-16-payment-transparency-june-2025.html> retrieved 2026-10-03 verified=False
- OECD Recommendation on AI, OECD/LEGAL/0449, amended 2024-05-03 (listing level) <https://legalinstruments.oecd.org/en/instruments/OECD-LEGAL-0449> retrieved 2026-10-03 verified=False

## Not exercised
- 148 catalogue instruments remain 'unverified' (standards, treaties, guidance, statutes not read this run). They resolve and are labelled, but carry no source.
- PSD2 is left unverified: CELLAR reports in-force=1 but end-of-validity 2026-06-18, and no PSD3/PSR act was found in OJ metadata.
- CoE AI Convention CETS 225 ratification status not read (treaty office returned HTTP 403).
- 315 of 910 question regulatoryRef parts do not resolve to a catalogue instrument. Coverage is measured and printed; only superseded or repealed citations are enforced.
- Article-level citations in all 608 questions were not audited one by one. Only the verified fixes listed in notesForMonitor were made.
- Research-digest proposals not added: COPPA 2025 retention and security questions, ADA Title II web rule, CER Directive, NERC CIP-015, FDA CDS and wellness guidance, 42 CFR Part 2, state AI laws. NIST CSF PR.PT-4 is in src/score/domainPacks.ts, which this track does not own.
- docs/SECTOR_PACKS.md (unclaimed) still shows the old EU AI Act classifications.
- No full suite, release gate, generator or build was run. This is source qualification only, not package, platform or deployed release.
- No digests existed for cross-framework, governance, mobility, technology or wealth when checked, so they were not used.

## Blockers
- tests/publicQuestionCountDrift.test.ts (unclaimed) fails with 'expected 608 to be 600' because the depth floor raised the sector total from 600 to 608. Fixing it needs the public-copy updates in ready-to-wire.diff. whitepaper/AMC_WHITEPAPER_v1.md and website/index.html are in the other session's dirty list, so the root session must merge those hunks.
- The harness blocked writing the receipt files report.md and result.json ('Subagents should return findings as text'). Their content is in notesForMonitor and in this structured output. Only ready-to-wire.diff was committed under the receipt dir.

## Ready-to-wire diff
```
File: AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S3/ready-to-wire.diff (218 lines, 10 files, unified diff against base contents; applies with patch -p1). It updates the public counts: 600→608 sector questions, 844→852 total, mobility 78→84, wealth 70→72.
- tests/publicQuestionCountDrift.test.ts: toBe(600)→toBe(608); '844 total'→'852 total'; station strings '5 diagnostic packs · 70 questions'→'72' and '6 diagnostic packs · 78 questions'→'84'; whitepaper expectations moved to 608 and 852.
- tests/citationMetadata.test.ts: '600 sector-specific diagnostic questions'→'608'; '844 questions (244 default + 600 sector-specific)'→'852 questions (244 default + 608 sector-specific)'.
- tests/executiveBoardPath.test.ts: '600 sector'→'608 sector'.
- docs/EXECUTIVE_OVERVIEW.md: '**600 sector-specific questions**'→'**608 ...**'.
- website/station-mobility.html: 78→84 (meta and label).
- website/station-wealth.html: 70→72 (meta and label).
- website/index.html: '5 packs · 70 questions'→72 and '6 packs · 78 questions'→84. This file is in the other session's dirty list.
- website/docs/compliance.html: '<span>70 questions</span>'→72 and '<span>78 questions</span>'→84.
- website/blog/langchain-scoring-tutorial.html: 'plus 600 sector-specific questions'→608 and '844 total'→'852 total'.
- whitepaper/AMC_WHITEPAPER_v1.md: every '600 sector-specific'→'608 sector-specific' and '844 questions (...)'→'852 questions (244 default + 608 sector-specific)'. This file is in the other session's dirty list.
Verified in scratch clone scratchpad/s3/wirecheck @2c291c8a: after the patch, publicQuestionCountDrift, citationMetadata, executiveBoardPath, industryPacks and industryPackRegulatory passed 28/28.
```

## Notes for monitor
RECEIPT CONTENT (report.md was blocked by the harness, so it is inlined here).

Baseline at 8f57ce63: 41 packs, 600 questions, median 15, min 8 (freight-3pl-warehouse), then digital-payments at 12. 224 distinct complianceFrameworks strings, of which 2 normalized via normalizeFrameworkName (HIPAA, GDPR). 286 distinct regulatoryBasis strings. 593 distinct question regulatoryRefs. 25 distinct euAIActClassification strings. No lastReviewed field and no validator existed, so no existing guard covered the case.

Design:
- New schema in src/domains/industryPackRegulatorySchema.ts: types, status vocabulary, resolver, normalizer, validators, and a non-mutating withRegulatoryCurrency. The floor is 13 (measured median 15 minus 2).
- A 267-instrument catalogue is split across src/domains/packs/*.ts.
- IndustryPack gets optional lastReviewed, regulatoryReferences and complianceFrameworkRefs. INDUSTRY_PACKS = PACK_CONTENT mapped through withRegulatoryCurrency; the type and the getIndustryPack/scoreIndustryPack signatures are unchanged.
- Decomposition into station files was not done (exempt registry; churn-only move). New data lives in new files.

Content refresh (all verified against the sources listed):
- AI Act application dates from Reg. 2026/1744: Annex III 2027-12-02, Annex I 2028-08-02. All 41 classifications were rewritten against the Annex III text.
- FDA QMSR (21 CFR 820, effective 2026-02-02; §820.30 and §820.70 removed): 3 questions remapped.
- ICH E6(R2) to E6(R3), with section numbers from the R3 table of contents.
- EU CTR safety reporting is Arts. 41-43, not Art. 37.
- New editions: ISO 9001:2026, 14001:2026, 14155:2026, 27701:2025, 27799:2025; ISO 29990 to ISO 21001; CONSORT 2025; PCI DSS v4.0.1.
- Repealed: PSI Directive 2003/98, replaced by the Open Data Directive 2019/1024.
- UWWTD now cites the recast 2024/3019.
- Digest leads that I re-verified myself:
  - 36 CFR 1194.21/.22 survive only as Appendix D.
  - AI Act Art. 5(1)(e) is facial-image scraping; the child-vulnerability ban is 5(1)(b).
  - The COPPA school-authorization exception was not finalized.
  - WCAG 2.2 SC 2.4.11 is Focus Not Obscured (Minimum).
  - FERC Order 887 is INSM; the IBR standards came from Order 901.
  - EHDS chapters: Ch. II primary use (Art. 23 MyHealth@EU), Ch. IV secondary use.
  - IVDR performance evaluation is Art. 56.
  - AI Act registration is Art. 49 and the workplace emotion ban is Art. 5(1)(f).
  - 45 CFR 170.315(g)(10) is the API criterion; auditable events are (d)(2).
  - Cures Act information blocking is §4004.
- Depth floor: freight-3pl-warehouse 8→14 (561/2006 and 49 CFR 395; 49 CFR 172; AI Act Annex III §4(b) and Art. 26(2)/(6)/(7); NIS2 Art. 23(4); Machinery Reg 2023/1230 from 2027-01-20 per the corrigendum; Forced Labour Reg 2024/3015 from 2027-12-14). digital-payments 12→14 (Reg 260/2012 Art. 5c via 2024/886; Reg 2023/1113 and FATF R.16). Total is 608.

Final measured state:
- packs=41 questions=608 median=15 min=13 max=18.
- Catalogue: 267 instruments (119 sourced, 148 unverified). By status: in-force 67, in-force-phased 11, adopted-not-yet-applicable 2, current 29, superseded 9, repealed 1.
- Framework labels: 224, of which 26 built-in and 198 external, 0 unresolved.
- Question ref parts: 910, 595 resolved, 315 unresolved (measured, not enforced).

Notes for the monitor:
- Vitest's agent reporter (AI_AGENT is set) hides console.log from passing tests, so the measurements are written with process.stdout.write and appear with the exact acceptance command.
- EUR-Lex HTML is behind an AWS WAF challenge, which I did not bypass. Official EU text was read through Publications Office CELLAR manifestations and SPARQL instead.
- WebFetch summaries were cross-checked against primary text where it mattered: the ICH TOC summary was wrong, and I read the PDF pages directly.
- Status is PARTIAL only because the unclaimed tests/publicQuestionCountDrift.test.ts asserts 600 and needs ready-to-wire.diff. That diff touches whitepaper/AMC_WHITEPAPER_v1.md and website/index.html, which are in the other session's dirty list, so the root session must merge those hunks.
- Also stale and unclaimed: docs/SECTOR_PACKS.md still lists the old EU AI Act classifications.
- Linear item to file (root session): 'Industry packs — regulatory currency schema and 2026 refresh'.
- The worktree is clean (git status --porcelain is empty) and .amc/keys is untouched.