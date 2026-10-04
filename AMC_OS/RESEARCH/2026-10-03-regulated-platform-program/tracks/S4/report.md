# Track S4 — worker report

## Repair round 1 (2026-10-04), answering the monitor's REJECTED verdict

Branch `worktree-wf_5210e2f4-3ea-4`, HEAD 7025a1b4 → code HEAD 4bafa2b4, then this receipt commit (base 8f57ce63 is an ancestor). macOS 26.6.2 arm64, Node v25.5.0, vitest 4.1.11.

On entry the worktree held uncommitted work from an interrupted attempt: `src/domains/deep/shared.ts` and the four station arrays deleted from `deepIndustryPacks.ts`. I kept that direction and finished it. Nothing else in the worktree was dirty.

### Required fixes

1. **Deep questions and pack linkage** (54d4d031).
   - Station questions now live in `src/domains/deep/{education,environment,mobility,technology}.ts`. `deepIndustryPacks.ts` re-exports them and is now 309 lines (was 516).
   - Added 19 hand-written questions. Counts: health 50, education 10, environment 10, mobility 10, governance 50, technology 10, wealth 50; total 190. Sources: 114 verified, 76 unverified (the 76 are the unchanged legacy NIST/Basel/MAR/CER/R155/R156/2022-1426 notes).
   - Every question has `packIds?: string[]`. The legacy groups get per-regime constants. `getDeepQuestionsForPack(packId)` was added.
   - `tests/deepIndustryPacksStations.test.ts` checks four things:
     - the station floors and the >=190 total;
     - every packId is in `listIndustryPackIds()`, with at least one pack in the question's own station;
     - `getDeepQuestionsForPack` returns exactly the questions that list the pack;
     - there is no `Array.from` in `src/domains/deep/*.ts`.
   - Eight packs have no deep question: weave-to-wear, clinical-lifecycle, life-technology, drug-discovery, clinical-trials, specialized-medicine, future-of-work, sustainable-real-estate.
2. **Synthetic HEAD-shape pack** (ccb64212, b71f65b8).
   - `headShapePack()` removes version, lastReviewed and regulatoryReferences. The undated test, the receipt test and `withCurrency` all use it.
   - On a scratch merge with S3, `computePackCurrency(IndustryPack & PackCurrencyFields)` failed `typecheck:tests`, because S3 declares a mutable `RegulatoryReference[]`. The parameter is now `PackWithCurrency = Omit<IndustryPack, keyof PackCurrencyFields> & PackCurrencyFields`.
3. **Test renames to the claimed paths.**
   - `tests/deepIndustryPacks.test.ts` → `tests/deepIndustryPacksStations.test.ts`.
   - `tests/domainAssessment.test.ts` → `tests/domainReportAnnexIII.test.ts`. The domain-report tests moved into this file too.
   - `tests/domainReport.test.ts` → `tests/sectorPacksDocDerived.test.ts`, which now holds only the SECTOR_PACKS checks.
4. **prohibitedFlag** (7fd5b858, d688673b).
   - `parseAnnexIIIPoints` returns `prohibitedFlag`. dance-of-democracy reports points [8] with the flag set.
   - The domain report prints the flagged packs.
   - Field and section names (`euAIActClassification`, `## EU AI Act Classification`) are unchanged.

### Found on the integrated branch and fixed (scratch merge with S3)

- **Annex III parsing** (d688673b). S3 rewrote every classification as prose, and my parser then invented points and missed the flags:
  - "Not listed in Annex III (§8 covers …)" produced [8];
  - lower-case "general-purpose AI" was not detected;
  - S3 has no "PROHIBITED" text, so no pack was flagged.

  The fix: scope-note parentheticals `( … covers … )` are skipped, `General[- ]Purpose AI` is matched, and the flag also fires on a cited `Art. 5(1)(x) … prohibit…`. HEAD parse results are unchanged; dance-of-democracy is still the only pack flagged at HEAD.
- **SECTOR_PACKS totals** (cb7e9e12, 2f01eec5).
  - The doc no longer restates totals: S3 moves the questions to 608 and governance to 75.
  - The test rejects a restated total or a `totalQuestions: N` literal, and checks every "(N packs)" station heading against `getStationSummary`.

### Verification

- Worktree: `vitest run` over deepIndustryPacksStations, industryPackAudit, domainReportAnnexIII, sectorPacksDocDerived, majorGaps, domain-assessment, domain-registry, domainDocs and lineRatchet. Result: 9 files, 95 tests passed.
- Worktree: `pnpm typecheck` and `pnpm typecheck:tests` both exit 0. `node scripts/docs-drift-check.mjs` exits 0.
- The planner's stale-literal grep on `docs/SECTOR_PACKS.md` exits 1 (no match).
- `grep -c Array.from`: 3 in `deepIndustryPacks.ts` and 0 in every `src/domains/deep/*.ts` file.
- Path audit: `git diff --name-only 8f57ce63...HEAD` prints only claimed paths and this receipt directory.
  - The planner's #9 regex anchors `src/domains/deep/` with `$`, so it prints the five `deep/*.ts` files even though `src/domains/deep/**` is claimed. Corrected regex: `src/domains/deep/[^/]+\.ts`.
- Scratch merge (clone in the scratchpad, not a worktree) of S4 4bafa2b4 with S3 a54b88fc gives 467ed0c7:
  - typecheck 0 and typecheck:tests 0;
  - the same 8 S4 files: 88 passed;
  - docs-drift 0;
  - the currency histogram reports `unverified` for all 41 packs, with nothing missing.
- Architecture check (read-only): the only failures are `dist/*.js is missing`, as before.

### Mutation checks this round (each restored to green)

| Guard | Mutation | Red |
|---|---|---|
| Pack linkage | education-deep-09 packIds → `["not-a-pack"]` | deepIndustryPacksStations 2 failed / 7 passed ("education-deep-09 links unknown pack ids") |
| Station floor | delete mobility-deep-10 | 1 failed ("mobility: expected 9 to be >= 10") |
| Parser swallow | `parseAnnexIIIPoints` returns empty for any input | domainReportAnnexIII 5 failed |
| prohibitedFlag | flag hard-coded false | 3 failed (synthetic, dance-of-democracy, report line) |
| HEAD-shape synthetic | `headShapePack()` → `pack()` on the S3 merge | industryPackAudit 2 failed (`['lastReviewed']` vs full missing list) |
| SECTOR_PACKS base count | 244 → 245 | sectorPacksDocDerived 1 failed |
| No restated station total | `totalQuestions: 71` example restored | sectorPacksDocDerived 1 failed |

### Sources read this round (retrievedAt 2026-10-04)

- AI Act Service Desk: Annex III point 3(d); Art. 9(1)-(2),(6); Art. 10(2)-(3); Art. 12(1)-(2); Art. 13(1),(3)(b)(ii); Art. 14(4)(b),(d),(e); Art. 15(4)-(5); Art. 26(1),(2),(11); Art. 49(1),(3); Art. 50(3)-(4); Art. 72(1)-(2).
- govinfo: 34 CFR §99.31(a)(1)(i)(B) (CFR 2024); 16 CFR §312.10 (CFR 2026).
- EUR-Lex: Data Act Art. 3(1); GDPR Art. 22(1). Art. 22(2)-(3) were not re-read, and the source note says so.
- Commission DSA VLOP page: 45M threshold, systemic risk assessment, annual audit. Article numbers were not read from the DSA text, and the note says so.
- NIST: SP 800-161r1-upd1 publication page.

Not used:
- The EDPB connected-vehicles PDF returned 404.
- The DORA Art. 28 text did not render on EUR-Lex.

The 19 new questions record `retrievedAt` 2026-10-04 through `readOn(…, REPAIR_RETRIEVED_AT)` in `src/domains/deep/shared.ts` (commit 4bafa2b4). The 171 earlier questions keep 2026-10-03.

### Not exercised

- Full vitest suite, the release gate, `pnpm build` and dist.
- The CLI end to end.
- Linux and Windows.
- The planner's `node -e` commands against dist (no build).

---

# Original worker report (backfilled by the root session from the structured return; the harness refused the subagent's .md write)

- Status (self-report): **PARTIAL**
- Branch: `worktree-wf_5210e2f4-3ea-4`; HEAD before `8f57ce63d8331f1bef1c2a18fde82a7e8f4511da` → after `b1ba54c2b73a5736e6530baf47343ec13277b0f6`
- Environment: macOS 26.6.2 arm64, Node v25.5.0, pnpm 10.33.0, vitest 4.1.11; worktree /Users/sid/AgentMaturityCompass/.claude/worktrees/wf_5210e2f4-3ea-4 at b1ba54c2 (base 8f57ce63); measured 2026-10-03
- Receipt path (as reported): NOT WRITTEN: AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S4/report.md and result.json. The harness refused the Write with 'Subagents should return findings as text, not write report files'. I did not work around that refusal through Bash. The full receipt content is in notesForMonitor.

## Commits
- 19918018 feat: report regulatory currency in the signed industry pack audit
- 8d1638fb feat: surface EU AI Act classification and certification rule in domain reports
- b1ba54c2 feat: deep industry questions for all seven stations with cited sources

## Files changed
- `src/domains/industryPackAudit.ts`
- `src/domains/domainAssessmentEngine.ts`
- `src/domains/domainReportBuilder.ts`
- `src/domains/deepIndustryPacks.ts`
- `docs/SECTOR_PACKS.md`
- `tests/industryPackAudit.test.ts`
- `tests/domainAssessment.test.ts`
- `tests/domainReport.test.ts`
- `tests/deepIndustryPacks.test.ts`

## Commands run
- `./node_modules/.bin/vitest run tests/industryPackAudit.test.ts tests/majorGaps.test.ts tests/domain-assessment.test.ts (baseline at 8f57ce63)` → 3 files passed, 53 tests passed
- `./node_modules/.bin/vitest run tests/deepIndustryPacks.test.ts tests/industryPackAudit.test.ts tests/domainAssessment.test.ts tests/domainReport.test.ts (RED, before implementation)` → 4 files failed; 25 failed, 8 passed (33)
- `./node_modules/.bin/vitest run tests/deepIndustryPacks.test.ts tests/industryPackAudit.test.ts tests/domainAssessment.test.ts tests/domainReport.test.ts (final)` → 4 files passed; 33 passed
- `./node_modules/.bin/vitest run tests/majorGaps.test.ts tests/domain-assessment.test.ts tests/domainDocs.test.ts` → 3 files passed; 46 passed
- `./node_modules/.bin/vitest run tests/domain-registry.test.ts` → 1 file passed; 7 passed
- `node scripts/architecture-boundaries-check.mjs (read-only, no --update)` → exit 1. The only failures are 'dist/cli.js is missing' and 'dist/api/index.js is missing' (no build here). The line ratchet lists 10 files that shrank below stale baselines, none of them touched by S4. S4 file sizes: deepIndustryPacks 516, industryPackAudit 454, domainAssessmentEngine 339, domainReportBuilder 209 lines; all under 800 and none tracked in budgets.

## Typecheck
pnpm typecheck exit 0; pnpm typecheck:tests exit 0 (final run at b1ba54c2's content, macOS 26.6.2 arm64, Node v25.5.0)

## Acceptance self-report
- [x] The four acceptance test files pass — `pnpm vitest run tests/deepIndustryPacks.test.ts tests/industryPackAudit.test.ts tests/domainAssessment.test.ts tests/domainReport.test.ts` → Test Files 4 passed (4); Tests 33 passed (33)
- [x] getDeepIndustryPackStats() lists all 7 stations with counts, and each deep question cites a regulation with a source URL — `./node_modules/.bin/tsx -e 'import { getDeepIndustryPackStats } from "./src/domains/deepIndustryPacks.ts"; console.log(JSON.stringify(getDeepIndustryPackStats()))' < /dev/null` → Stats are keyed by industry for compatibility; each entry carries its station. healthcare/health 50, finance/wealth 50, government/governance 50, education/education 6, environment/environment 5, mobility/mobility 5, technology/technology 5; 171 questions in total. Every question has source {title, https url on an official host, retrievedAt 2026-10-03, verified}. 95 sources are verified and 76 are unverified, each with a note saying why. The deepIndustryPacks test enforces the URL, host allowlist and note requirements.
- [x] docs/SECTOR_PACKS.md base-question count equals the derived number and names the derivation command — `./node_modules/.bin/tsx -e 'import { questionBank } from "./src/diagnostic/questionBank.ts"; console.log(questionBank.length)' < /dev/null ; grep -c 244 docs/SECTOR_PACKS.md` → The command prints 244. The doc states '244-question base AMC rubric' exactly once and prints the command. 138 is gone. 390 is now 600, derived from listIndustryPacks: 41 packs, 600 questions. totalQuestions 37 is now 71. The composite formula is corrected to round(base×0.6 + domain×0.4). tests/domainReport.test.ts guards all of these.

## Mutation checks
- Audit reports a missing lastReviewed (computePackCurrency, src/domains/industryPackAudit.ts:104) — mutation: Removed missing.push("lastReviewed") and dropped 'packAgeDays === null ||' from the undated condition — RED: tests/industryPackAudit.test.ts: 4 failed, 12 passed (16) — restored: git checkout -- src/domains/industryPackAudit.ts; 16 passed
- Certification threshold comparison is inclusive (evaluateCertification, src/domains/domainAssessmentEngine.ts:276) — mutation: compositeScore >= threshold changed to compositeScore > threshold — RED: tests/domainAssessment.test.ts: 1 failed ('a composite exactly at the threshold meets it'), 5 passed — restored: git checkout -- src/domains/domainAssessmentEngine.ts; 6 passed
- Currency block is covered by the audit receipt hash — mutation: Hashed { ...body, currency: null } in both buildIndustryPackAudit and verifyIndustryPackAudit — RED: tests/industryPackAudit.test.ts: 1 failed ('currency is inside the signed receipt'), 15 passed — restored: git checkout -- src/domains/industryPackAudit.ts; 16 passed

## Sources
- EU AI Act Annex III (AI Act Service Desk) <https://ai-act-service-desk.ec.europa.eu/en/ai-act/annex-3> retrieved 2026-10-03 verified=True
- EU AI Act Art. 5 <https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-5> retrieved 2026-10-03 verified=True
- EU AI Act Art. 26 <https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-26> retrieved 2026-10-03 verified=True
- EU AI Act Art. 50 <https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50> retrieved 2026-10-03 verified=True
- EU AI Act Art. 53 <https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-53> retrieved 2026-10-03 verified=True
- EU AI Act Art. 55 <https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-55> retrieved 2026-10-03 verified=True
- EU AI Act Art. 73 <https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-73> retrieved 2026-10-03 verified=True
- Regulation (EU) 2026/1744 Digital Omnibus on AI (title and summary only; amended Art. 113 wording not read in full) <https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32026R1744> retrieved 2026-10-03 verified=False
- 45 CFR 164.502/.504/.506/.508/.514/.522/.528/.308/.310/.312/.404 (govinfo CFR 2024) <https://www.govinfo.gov/content/pkg/CFR-2024-title45-vol2/xml/CFR-2024-title45-vol2-sec164-404.xml> retrieved 2026-10-03 verified=True
- 34 CFR 99.32 (govinfo CFR 2024) <https://www.govinfo.gov/content/pkg/CFR-2024-title34-vol1/xml/CFR-2024-title34-vol1-sec99-32.xml> retrieved 2026-10-03 verified=True
- FERPA school officials FAQ (ED) <https://studentprivacy.ed.gov/faq/under-ferpa-may-educational-agency-or-institution-disclose-education-records-any-its-employees> retrieved 2026-10-03 verified=True
- 16 CFR 312.5 (govinfo CFR 2026) <https://www.govinfo.gov/content/pkg/CFR-2026-title16-vol1/xml/CFR-2026-title16-vol1-sec312-5.xml> retrieved 2026-10-03 verified=True
- FTC COPPA final rule press release <https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-finalizes-changes-childrens-privacy-rule-limiting-companies-ability-monetize-kids-data> retrieved 2026-10-03 verified=True
- 31 CFR 1020.320 (govinfo CFR 2024) <https://www.govinfo.gov/content/pkg/CFR-2024-title31-vol3/xml/CFR-2024-title31-vol3-sec1020-320.xml> retrieved 2026-10-03 verified=True
- 31 CFR 1010.230 (govinfo CFR 2024) <https://www.govinfo.gov/content/pkg/CFR-2024-title31-vol3/xml/CFR-2024-title31-vol3-sec1010-230.xml> retrieved 2026-10-03 verified=True
- Sarbanes-Oxley Act Pub. L. 107-204 <https://www.govinfo.gov/content/pkg/PLAW-107publ204/html/PLAW-107publ204.htm> retrieved 2026-10-03 verified=True
- MiFID II Art. 27 (ESMA ISRB) <https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook/mifid-ii/article-27-obligation-execute-orders> retrieved 2026-10-03 verified=True
- MiFID II Art. 16 (ESMA ISRB) <https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook/mifid-ii/article-16-organisational-requirements> retrieved 2026-10-03 verified=True
- MAR Regulation (EU) 596/2014 (Art. 16 confirmed only via search results) <https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:32014R0596> retrieved 2026-10-03 verified=False
- NIS2 FAQs (European Commission; article numbers not on the page) <https://digital-strategy.ec.europa.eu/en/faqs/directive-measures-high-common-level-cybersecurity-across-union-nis2-directive-faqs> retrieved 2026-10-03 verified=True
- CRA reporting obligations (European Commission) <https://digital-strategy.ec.europa.eu/en/policies/cra-reporting> retrieved 2026-10-03 verified=True
- CER critical infrastructure resilience (DG HOME; Art. 13 number from a EUR-Lex search result) <https://home-affairs.ec.europa.eu/policies/internal-security/counter-terrorism-and-radicalisation/protection/critical-infrastructure-resilience-eu-level_en> retrieved 2026-10-03 verified=False
- UN Regulation No. 155 in OJ (page did not render) <https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ%3AL_202500005> retrieved 2026-10-03 verified=False
- UN Regulation No. 156 (unece.org returned 403) <https://unece.org/sites/default/files/2024-03/R156e%20(2).pdf> retrieved 2026-10-03 verified=False
- Commission Implementing Regulation (EU) 2022/1426 (page did not render) <https://eur-lex.europa.eu/eli/reg_impl/2022/1426/oj/eng> retrieved 2026-10-03 verified=False
- Basel III framework (BCBS) <https://www.bis.org/bcbs/basel3.htm> retrieved 2026-10-03 verified=True
- NIST SP 800-53 Rev. 5 (publication and families only; individual control IDs not fetched) <https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final> retrieved 2026-10-03 verified=False
- EUDR application dates (DG ENV; consulted, not encoded) <https://environment.ec.europa.eu/topics/forests/deforestation/regulation-deforestation-free-products_en> retrieved 2026-10-03 verified=True

## Not exercised
- Full vitest suite, release gate, pnpm build/dist
- CLI end to end: amc domain apply --audit, amc domain report, the dashboard
- S3's real PackCurrencyFields data: currency was tested only on synthetic pack objects with the v1 shape, because no pack carries the fields at HEAD and all 41 audit as 'undated'
- Linux and Windows
- Research digests: research/{education,environment,health}/ existed but were empty and there was no cross-framework digest, so none were used

## Blockers
- The receipt files report.md and result.json were not written or committed: the harness blocks subagents from writing report files. Code, tests and docs are complete and committed, and the worktree is clean (git status --porcelain is empty).

## Ready-to-wire diff
```
--- a/src/domains/index.ts
+++ b/src/domains/index.ts
+export { computePackCurrency, DEFAULT_STALE_AFTER_DAYS, type PackCurrencyFields, type PackRegulatoryReference, type AuditCurrency } from "./industryPackAudit.js";
+export { parseAnnexIIIPoints, type EuAIActClassification, type CertificationOutcome } from "./domainAssessmentEngine.js";
+export { getDeepQuestionsByStation, type RegulationSource } from "./deepIndustryPacks.js";
--- a/src/index.ts (deep industry pack export block near :2353)
+  getDeepQuestionsByStation,
--- a/src/domains/domainApplyCli.ts (:93)
-          const auditReport = buildIndustryPackAudit({ pack, responses, now: Date.now(), frameworkFilter: framework });
+          const auditReport = buildIndustryPackAudit({ pack, responses, now: Date.now(), frameworkFilter: framework, staleAfterDays: opts.staleAfterDays });
(The last hunk needs a --stale-after-days <n> option wired where the CLI command is defined; that is the CLI owner's decision.)
```

## Notes for monitor
RECEIPT CONTENT. The harness blocked writing report.md and result.json, so the receipt is reproduced here.

Changes:

(1) src/domains/industryPackAudit.ts
- :20 schema bumped to amc.industry-pack-audit/2.
- :62-79 PackCurrencyFields v1 declared structurally (version?, lastReviewed?, regulatoryReferences?[{citation, jurisdiction?, url?, effectiveDate?, lastReviewed?, status?}]), matching the S3 contract in map/planner-tracks.json. Nothing is imported from S3.
- :104 computePackCurrency(pack, now, {staleAfterDays=365}):
  - Fields are read defensively. Wrong types, unparseable dates and future dates count as missing.
  - Status priority: undated > stale > unverified > current. No lastReviewed or no references means undated.
  - A non-positive or NaN staleAfterDays throws RangeError.
- :318 buildIndustryPackAudit accepts an optional staleAfterDays.
- :389 currency is inside the hashed body.
- :443 adds a '## Regulatory currency' markdown section.
- At HEAD all 41 packs report 'undated' with missing version, lastReviewed and regulatoryReferences.

(2) src/domains/domainAssessmentEngine.ts
- Additive result fields:
  - euAIActClassification: {domainCategory, packs[{packId, packName, classification, annexIIIPoints, generalPurpose}]}, built from getIndustryPacksByStation (read-only import).
  - certification: {threshold, comparison '>=', compositeScore, meetsThreshold, blockingGaps, ready}.
- :267 evaluateCertification replaces isCertificationReady with the same rule.
- :283 parseAnnexIIIPoints keeps points 1-8 after 'Annex III' and flags GPAI. Every one of the 41 packs' strings parses.

(3) src/domains/domainReportBuilder.ts
- '## EU AI Act Classification' section.
- The executive summary prints 'Certification Threshold: composite >= N and no critical control at L1', 'Threshold Met', and 'Blocking Critical Gaps'.
- Optional now param on renderDomainReportMarkdown and buildDomainReport. Time is computed once, which fixes a possible ms skew between generatedAt and the markdown timestamp.
- No arithmetic defect found. tests/domain-assessment.test.ts is unchanged and green (84 / 161 / 3).

(4) src/domains/deepIndustryPacks.ts
- Every question gains station and source {title, url, retrievedAt, verified, note?}.
- New hand-written questions: education 6, environment 5, mobility 5, technology 5. Each anchors a distinct provision.
- Existing ids and counts unchanged (majorGaps floors hold).
- Finance re-anchoring:
  - Best execution: RTS 28 changed to MiFID II Art. 27(1). ESMA's rulebook text of Art. 27 has no para 6.
  - Market abuse: 'MiFID II/MAR' changed to 'MAR Art. 16'.
  - Client money: 'MiFID II/CASS' (CASS is a UK FCA sourcebook) changed to 'MiFID II Art. 16(8)-(9)'.
  - AML rows cite 31 CFR 1020.320 and 1010.230.
- Government POA&M row: changed to NIST 800-53 CA-5. The CA-5 title is from my knowledge and unverified (the NIST catalog did not render).
- Added getDeepQuestionsByStation. Stats keep their industry keys and add station and unverifiedSources. Removed an unused zod import.
- N = 5 per station.
- Measured counts: health 50, wealth 50, governance 50, education 6, environment 5, mobility 5, technology 5; 171 total. 95 verified, 76 unverified with notes:
  - 50 NIST control IDs not fetched individually.
  - 20 finance: Basel thematic labels and MAR page not rendered.
  - 3 environment and 3 mobility: article or paragraph numbers from search results only, or 403s.

(5) docs/SECTOR_PACKS.md
- Base count stated once ('244-question base AMC rubric') with the derivation command (tsx: questionBank.length gives 244).
- 390 is now 600 and 37 is now 71, both derived.
- Composite formula corrected to round(base×0.6 + domain×0.4); sector packs are not part of the composite.
- Guarded by the tests in tests/domainReport.test.ts.

FINDINGS FOR ROOT (outside S4):
- EUR-Lex shows a consolidated AI Act dated 27/07/2026 with M1 = Regulation (EU) 2026/1744 (Digital Omnibus on AI). From the summary and recitals: Annex III high-risk obligations move to 2 Dec 2027 and Annex I to 2 Aug 2028; Art. 4 is replaced; Art. 5 gains prohibitions on NCII and CSAM generation; Art. 50(2) gets a four-month transitional period for systems on the market before 2 Aug 2026. Packs or docs asserting 2 Aug 2026 high-risk dates need S3 / cross-framework review.
- Pack classification strings (S3's) are inconsistent with their stations:
  - virtual-infrastructure and networked-ecosystems are 'General Purpose AI' in high-risk stations.
  - dance-of-democracy says 'PROHIBITED' under Annex III §8, which is a high-risk area, not Art. 5.
- 147 of the 150 legacy deep questions remain templates. Replacing them is left for later.
- ecfr.gov and federalregister.gov redirect to an unblock page; it was not bypassed and govinfo.gov was used instead.
- The research digest directories were empty, so no digests were used.

Path discipline: every changed path is in the S4 claim; none is in codex-dirty-paths.json (checked by script) or in the unclaimable list. .amc/keys untouched; git status --porcelain is empty at b1ba54c2.