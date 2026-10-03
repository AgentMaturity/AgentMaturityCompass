# Track S5 — repair round 1 (2026-10-03, after monitor REJECTED c6b0d19b)

- Branch `worktree-wf_5210e2f4-3ea-5`; base 8f57ce63 is an ancestor; repair commit d7a77cc5 on top of c6b0d19b; receipt commit follows.
- Environment: Darwin 25.6.0 arm64, Node v25.5.0, pnpm 10.33.0, vitest 4.1.11; same worktree, not a fresh clone.

## Fixes (monitor's required list, in order)
1. Path discipline: `git mv src/compliance/regulatoryRegister -> src/compliance/regulatory` (index.ts, feeds.ts, register.json); imports updated in regulatoryAutomation.ts (:14, :148), euAiActClassifier.ts header, globalRegulatory.ts (registerId doc), scripts/check-regulatory-currency.mjs (DEFAULT_REGISTER_PATH), tests and both docs. `tests/euAiAct.test.ts` renamed to `tests/euAiActTimeline.test.ts`; `tests/globalRegulatory.test.ts` folded into `tests/regulatoryCurrency.test.ts` and deleted. `git diff --name-only 8f57ce63..HEAD` now lists only claimed paths (17 paths incl. the two receipts).
2. `getDpiaAssessment()` returns a deep copy and no longer stamps `Date.now()`; template `dpoApproval: false`, `lastReviewDate`/`nextReviewDate: null` (type widened to `number | null`; only tests consume it). New assertion in `tests/regulatoryClaimsHonesty.test.ts` under a fake clock (2030-01-01).
3. Five legacy `GLOBAL_FRAMEWORKS` entries now `mappingStatus: "partial"` (comment says why). `tests/round4Gaps.test.ts` R4-06 'all complete' lock replaced by 'every entry has registerId, >=1 source with retrievedAt and a lastReviewed'; R4-10 now expects `dpoApproval` false and null review dates (was locking `true` and `nextReviewDate > now`).
4. `docs/wave4-regulatory-audit.md:3` banner: "Superseded on 2026-10-03 by `src/compliance/regulatory/register.json`"; historical text unchanged.
5. `scripts/check-regulatory-currency.mjs`: strict `parseArgs` (unknown flag or missing value -> exit 1), `--now` alias of `--as-of`; `--json` prints `entries:[{id,status,verified,lastReviewed,windowDays,currency,sources[{url,retrievedAt}]}]`, `allowedHosts`, `counts`; every source host must be in `policy.officialHosts` (register.json), exported from the register module as `OFFICIAL_SOURCE_HOSTS` / `isOfficialSourceUrl()` (`src/compliance/regulatory/index.ts`). The script reads the same JSON list, so there is one allowlist.
6. `RegulatoryMonitor` takes a public `fetchImpl?: FeedFetch` config option (`regulatoryAutomation.ts:136`, used by `fetchFeedContent` :348-364); the private `_fetchHook` is gone. `tests/regulatoryAutomation.test.ts` injects `fetchImpl` everywhere and stubs the global fetch to reject in beforeEach, so a bypass fails instead of reaching the network.

## Verification
- `pnpm vitest run tests/regulatoryCurrency.test.ts tests/euAiActTimeline.test.ts tests/regulatoryAutomation.test.ts tests/round4Gaps.test.ts tests/regulatoryClaimsHonesty.test.ts tests/complyRiskClassifyDocs.test.ts tests/apiRouters.test.ts` -> Test Files 7 passed (7); Tests 142 passed (142); 0 skipped
- `pnpm vitest run tests/publicBrandSystem.test.ts` (references wave4-regulatory-audit) -> passed
- `pnpm typecheck` exit 0; `pnpm typecheck:tests` exit 0
- `node scripts/check-regulatory-currency.mjs` -> entries=17 verified=11 unverified=6 asOf=2026-10-03, exit 0
- `node scripts/check-regulatory-currency.mjs --now 2027-06-01` -> exit 1 (17 'policy window is 90 days' FAIL lines)
- `node scripts/check-regulatory-currency.mjs --bogus` -> exit 1 'unknown argument'; `--as-of` with no value -> exit 1
- `node scripts/check-regulatory-currency.mjs --json` -> exit 0; planner host check over the JSON prints OK
- `grep -n 'example.com\|globalThis.fetch' tests/regulatoryAutomation.test.ts` -> nothing; `grep -n Superseded docs/wave4-regulatory-audit.md` -> line 3
- `pnpm run check:docs-drift` -> passed (327 files)
- `node scripts/architecture-boundaries-check.mjs` -> only failures 'dist/cli.js is missing' and 'dist/api/index.js is missing' (no build); regulatoryAutomation.ts 802 -> 707; regulatory/index.ts 100, feeds.ts 186 lines (register.json is 440 lines of data; the 400-line cap in the acceptance applies to *.ts)

## Mutation checks (each restored and re-run green)
- Restore `copy.lastReviewDate = Date.now()` + nextReviewDate in getDpiaAssessment -> regulatoryClaimsHonesty 1 failed | 4 passed
- Template `dpoApproval: true` -> regulatoryClaimsHonesty + round4Gaps 2 failed | 51 passed
- china-pipl `mappingStatus: "complete"` -> round4Gaps 1 failed | 47 passed
- eu-ai-act source url -> https://artificialintelligenceact.eu/ -> script exit 1 ('is not on an official host'); regulatoryCurrency 5 failed
- Remove the `--now` alias -> `--now 2027-06-01` exits 1 as unknown flag; regulatoryCurrency 2 failed | 19 passed
- fetchFeedContent ignores config.fetchImpl -> regulatoryAutomation 4 failed | 18 passed (the stubbed global fetch rejects; no network)

## Not changed in this round (monitor low findings outside the required list)
- appliesFrom is still per classification (`applicationDates`), not per finding; EU_AI_ACT_TIMELINE constants still rely on register parity for their sources.
- RSS changes still carry an estimated effectiveDate (publishedDate + 90 d, flagged `effectiveDateEstimated: true`) and `feed.lastContentHash` is still updated in place.
- Feed contract field remains `contract: live | manual-review-required` (not `fetchContract`); no separate tests/regulatoryFeeds.test.ts was created — feed contract tests stay in tests/regulatoryAutomation.test.ts.
- Single 90-day review window (no per-status windows).

---

# Track S5 — worker report (backfilled by the root session from the structured return; the harness refused the subagent's .md write)

- Status (self-report): **COMPLETE**
- Branch: `worktree-wf_5210e2f4-3ea-5`; HEAD before `8f57ce63d8331f1bef1c2a18fde82a7e8f4511da` → after `082efcd18131b32a804eeb1769ba2fa62c8a4373`
- Environment: Darwin arm64, Node v25.5.0, pnpm 10.33.0 (install --frozen-lockfile --prefer-offline, 2.7s), vitest 4.1.11; run 2026-10-03; base 8f57ce63, final HEAD 082efcd1; worktree clean (git status --porcelain empty); .amc/keys untouched
- Receipt path (as reported): /Users/sid/AgentMaturityCompass/.claude/worktrees/wf_5210e2f4-3ea-5/AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S5/result.json (report.md is missing: the harness refused the Write of a .md report from this subagent, so the full report is in notesForMonitor)

## Commits
- 172de745 feat: add sourced regulatory currency register, currency check and truthful feeds
- b11f43bb feat: encode verified EU AI Act application timeline in the classifier
- 276a6570 docs: date and source the EU AI Act timeline after the Digital Omnibus
- 082efcd1 docs: add S5 track receipt

## Files changed
- `src/compliance/regulatoryRegister/register.json (new)`
- `src/compliance/regulatoryRegister/index.ts (new)`
- `src/compliance/regulatoryRegister/feeds.ts (new)`
- `scripts/check-regulatory-currency.mjs (new)`
- `src/compliance/regulatoryAutomation.ts`
- `src/compliance/euAiActClassifier.ts`
- `src/compliance/globalRegulatory.ts`
- `tests/regulatoryAutomation.test.ts`
- `tests/euAiAct.test.ts (new)`
- `tests/globalRegulatory.test.ts (new)`
- `tests/regulatoryCurrency.test.ts (new)`
- `docs/EU_AI_ACT_COMPLIANCE.md`
- `docs/COMPLIANCE_FRAMEWORKS.md`
- `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S5/result.json (force-added)`

## Commands run
- `pnpm vitest run tests/globalRegulatory.test.ts tests/regulatoryAutomation.test.ts tests/euAiAct.test.ts tests/regulatoryCurrency.test.ts (RED, before implementation)` → Test Files 3 failed | 1 passed (4); Tests 19 failed | 29 passed (48)
- `pnpm vitest run tests/globalRegulatory.test.ts tests/regulatoryAutomation.test.ts tests/euAiAct.test.ts tests/regulatoryCurrency.test.ts (final)` → Test Files 4 passed (4); Tests 49 passed (49)
- `pnpm vitest run <4 focused> tests/round4Gaps.test.ts tests/complyRiskClassifyDocs.test.ts tests/regulatoryClaimsHonesty.test.ts tests/apiRouters.test.ts tests/gap1066FairlyAiPosthocAuditSamplingBoundary.test.ts` → Test Files 9 passed (9); Tests 141 passed (141)
- `pnpm vitest run the 32 other tests that reference the touched docs or modules (gap10xx*, websiteContentValidation, exampleCommandsResolve)` → 31 passed | 1 skipped (32); 133 passed | 1 skipped. The skip was already there before this change: exampleCommandsResolve.test.ts:36 it.skip requires build
- `node scripts/check-regulatory-currency.mjs` → entries=17 verified=11 unverified=6 asOf=2026-10-03; exit 0
- `node scripts/architecture-boundaries-check.mjs` → exit 1. The only failures were 'dist/cli.js is missing' and 'dist/api/index.js is missing' (no build was run). No line budget was exceeded; ratchet notice: regulatoryAutomation.ts 802 -> 712
- `tsc -p tsconfig.json --outDir <scratchpad>/s5/dist, then node import of the emitted regulatoryRegister/index.js, euAiActClassifier.js and regulatoryAutomation.js` → emit exit 0; register.json was copied to the output; import printed {entries:17, annexIII:'2027-12-02', employment applicationDates [Art. 6(2)+Annex III 2027-12-02], liveFeeds:6}

## Typecheck
pnpm typecheck: exit 0, 0 'error TS'. An earlier run caught src/cli.ts(12880,7) TS2741 because cli.ts builds an EuAiActClassification literal; I fixed it by making applicationDates optional. pnpm typecheck:tests: exit 0, 0 'error TS'.

## Acceptance self-report
- [x] The four focused test files all pass — `pnpm vitest run tests/globalRegulatory.test.ts tests/regulatoryAutomation.test.ts tests/euAiAct.test.ts tests/regulatoryCurrency.test.ts` → Test Files 4 passed (4); Tests 49 passed (49)
- [x] Currency script exits 0 and prints entries=N verified=M unverified=K — `node scripts/check-regulatory-currency.mjs` → entries=17 verified=11 unverified=6 asOf=2026-10-03; exit 0
- [x] No DEFAULT_REGULATORY_FEEDS entry claims a live feed without a documented, reachable source URL, and reachability is recorded with a timestamp — `tests/regulatoryAutomation.test.ts 'DEFAULT_REGULATORY_FEEDS contract (no fake feeds)' + probes via node fetch on 2026-10-03` → 6 live official feeds, each recorded at HTTP 200 with reachability.checkedAt (16:22-16:32Z), and the fetch contract is documented in feeds.ts. 5 web-page or non-regulator feeds are manual-review-required, enabled:false, each with a recorded status and a reason. Tests enforce: live means enabled, official, https, rss|api, status 200, no unused selector; non-live means disabled with a reason; the default monitor polls only live feeds.
- [x] Docs cite each instrument with URL and retrievedAt — `tests/globalRegulatory.test.ts 'docs/COMPLIANCE_FRAMEWORKS.md cites every entry with a URL and retrieved date'` → All 17 register entries have a table row in docs/COMPLIANCE_FRAMEWORKS.md with a source URL and retrieved date. docs/EU_AI_ACT_COMPLIANCE.md §5 lists Art. 113/111 sources retrieved 2026-10-03. References in both docs are dated.

## Mutation checks
- currency window check in scripts/check-regulatory-currency.mjs + tests/regulatoryCurrency.test.ts and tests/globalRegulatory.test.ts — mutation: register.json eu-ai-act lastReviewed set to 2024-01-01 — RED: The script printed 'FAIL eu-ai-act: lastReviewed 2024-01-01 is 1006 days old; policy window is 90 days' and exited 1. Two tests failed: 'passes on the committed register and prints the counts' and 'validates cleanly as of its review date' (2 failed | 15 passed). — restored: After git checkout of register.json: script exit 0; 17/17 passed
- classifier/register parity in tests/euAiAct.test.ts — mutation: EU_AI_ACT_TIMELINE.annexIIIHighRisk changed from 2027-12-02 to 2026-08-02 in src/compliance/euAiActClassifier.ts — RED: 'every classifier date equals the verified register date of the same id' and 'encodes the post-omnibus high-risk dates' failed: Expected '2027-12-02' Received '2026-08-02' (2 failed | 9 passed) — restored: After git checkout: 11/11 passed
- feed contract in tests/regulatoryAutomation.test.ts — mutation: feeds.ts mitre-atlas (manual-review-required) set to enabled: true — RED: 'a feed that is not a live official source is disabled and says why' and 'the default monitor polls only live feeds' failed (2 failed | 19 passed) — restored: After git checkout: 21/21 passed
- verified-flag consistency check in scripts/check-regulatory-currency.mjs — mutation: condition changed to 'false && entry.verified && unverifiedParts > 0' — RED: 'rejects verified=true over an unverified date' failed (1 failed | 7 passed) — restored: After git checkout: 8/8 passed

## Sources
- AI Act Service Desk - Article 113 (consolidated as of 27 July 2026, incl. Reg (EU) 2026/1744) <https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-113> retrieved 2026-10-03 verified=True
- AI Act Service Desk - Article 111 <https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-111> retrieved 2026-10-03 verified=True
- AI Act Service Desk - Article 5 <https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-5> retrieved 2026-10-03 verified=True
- AI Act Service Desk - Article 50 <https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50> retrieved 2026-10-03 verified=True
- AI Act Service Desk - Annex I <https://ai-act-service-desk.ec.europa.eu/en/ai-act/annex-1> retrieved 2026-10-03 verified=True
- AI Act Service Desk - Annex III <https://ai-act-service-desk.ec.europa.eu/en/ai-act/annex-3> retrieved 2026-10-03 verified=True
- AI Act Service Desk - implementation timeline <https://ai-act-service-desk.ec.europa.eu/en/ai-act/timeline/timeline-implementation-eu-ai-act> retrieved 2026-10-03T16:22:05Z verified=True
- European Commission - AI Act policy page (last updated 2026-08-03) <https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai> retrieved 2026-10-03 verified=True
- EUR-Lex Regulation (EU) 2024/1689 (bot challenge, not read) <https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng> retrieved 2026-10-03 verified=False
- EUR-Lex Regulation (EU) 2026/1744 Digital Omnibus on AI (index entry only; bot challenge) <https://eur-lex.europa.eu/eli/reg/2026/1744/oj/eng> retrieved 2026-10-03T16:24:43Z verified=False
- European Commission - Legal framework of EU data protection (GDPR) <https://commission.europa.eu/law/law-topic/data-protection/legal-framework-eu-data-protection_en> retrieved 2026-10-03 verified=True
- EIOPA - DORA <https://www.eiopa.europa.eu/digital-operational-resilience-act-dora_en> retrieved 2026-10-03 verified=True
- European Commission - NIS2 Directive <https://digital-strategy.ec.europa.eu/en/policies/nis2-directive> retrieved 2026-10-03 verified=True
- European Commission - Cyber Resilience Act <https://digital-strategy.ec.europa.eu/en/policies/cyber-resilience-act> retrieved 2026-10-03 verified=True
- European Commission - Medical devices new regulations <https://health.ec.europa.eu/medical-devices-sector/new-regulations_en> retrieved 2026-10-03 verified=True
- NIST - AI Risk Management Framework (AI RMF 1.0, AI 600-1) <https://www.nist.gov/itl/ai-risk-management-framework> retrieved 2026-10-03 verified=True
- ISO/IEC 42001 (HTTP 403 bot challenge; search index only) <https://www.iso.org/standard/42001> retrieved 2026-10-03 verified=False
- ISO/IEC 42005 (HTTP 403 bot challenge; search index only) <https://www.iso.org/standard/42005> retrieved 2026-10-03 verified=False
- Colorado SB24-205 <https://leg.colorado.gov/bills/sb24-205> retrieved 2026-10-03 verified=True
- Colorado SB25B-004 <https://leg.colorado.gov/bills/sb25b-004> retrieved 2026-10-03 verified=True
- Colorado SB26-189 Automated Decision-Making Technology <https://leg.colorado.gov/bills/sb26-189> retrieved 2026-10-03 verified=True
- CAC - Personal Information Protection Law <https://www.cac.gov.cn/2021-08/20/c_1631050028355286.htm> retrieved 2026-10-03T16:24:47Z verified=True
- CAC - Interim Measures for Generative AI Services <https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm> retrieved 2026-10-03T16:24:46Z verified=True
- Planalto - Lei 13.709/2018 (LGPD) <https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm> retrieved 2026-10-03T16:25:04Z verified=True
- PIB - Government notifies DPDP Rules (14 Nov 2025) <https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190014&reg=3&lang=2> retrieved 2026-10-03T16:24:43Z verified=True
- India Code - DPDP Act 2023 (timed out) <https://www.indiacode.nic.in/handle/123456789/22037?view_type=browse> retrieved 2026-10-03T16:24:42Z verified=False
- PPC Japan - Laws and Policies <https://www.ppc.go.jp/en/legal/> retrieved 2026-10-03 verified=True
- Japanese Law Translation - APPI <https://www.japaneselawtranslation.go.jp/en/laws/view/4241/en> retrieved 2026-10-03T16:24:44Z verified=True

## Not exercised
- No CLI command was run because dist was not built. That covers 'amc comply risk-classify --json', which now carries applicationDates by code path only, and 'amc compliance regulatory-feeds|regulatory-check|regulatory-gap'.
- No live RegulatoryMonitor.checkAllFeeds() run against the real feeds. Parsing was only exercised with injected bodies. Reachability comes from separate node fetch probes run on 2026-10-03 from macOS arm64 / Node 25.
- The full test suite, the release gate and the packed-install check were not run.
- Node 20.0-20.9 was not tested: the JSON import attribute 'with { type: "json" }' needs Node 20.10 or later, while engines says >=20. CI uses Node 22 and 24.
- EUR-Lex (both regulations) and iso.org were not readable: the bot challenge returned HTTP 202 or 403. The EU text was read through the Commission's AI Act Service Desk consolidated text instead. The ISO dates are marked unverified.
- No station research digests existed. The research/education, environment and health directories were empty and there was no cross-framework digest, so none were used as inputs. Station-specific instruments are not in the register yet: FDA/HIPAA, FERPA, UNECE vehicle regulations, environment-specific rules, SEC/FINRA.
- No legal review of any kind.

## Blockers
- report.md could not be written: the harness blocks .md report files from subagents. result.json was written and committed with git add -f, and the report content is in notesForMonitor.
- mappingStatus 'complete' on the 5 legacy GLOBAL_FRAMEWORKS entries could not be made truthful ('partial') because tests/round4Gaps.test.ts:253-257 (not claimed) asserts 'complete'. The fix is in readyToWireDiff.
- The gate is not wired: package.json and the release gate are forbidden to this track (see readyToWireDiff).
- Lowering the line-budget baseline for regulatoryAutomation.ts (802 -> 712) needs scripts/line-budgets.json, which is not claimed. Running --update would also rewrite baselines for files other sessions are changing, so I did not run it.

## Ready-to-wire diff
```
--- a/tests/round4Gaps.test.ts
+++ b/tests/round4Gaps.test.ts
@@ describe("R4-06 Global Regulatory Coverage"
-  test("all frameworks have complete mapping status", () => {
-    for (const f of GLOBAL_FRAMEWORKS) {
-      expect(f.mappingStatus).toBe("complete");
-    }
-  });
+  test("legacy frameworks do not claim complete mapping", () => {
+    for (const f of GLOBAL_FRAMEWORKS) {
+      expect(f.mappingStatus).toBe("partial");
+      expect(f.registerId).toBeTruthy();
+    }
+  });
--- a/src/compliance/globalRegulatory.ts  (apply together with the test change above)
-    effectiveDate: "...", mappingStatus: "complete", ...   (5 occurrences in GLOBAL_FRAMEWORKS, lines 111/121/130/140/150)
+    effectiveDate: "...", mappingStatus: "partial", ...
--- a/package.json
+++ b/package.json
@@ "scripts": {
+    "check:regulatory-currency": "node scripts/check-regulatory-currency.mjs",
(then add 'pnpm check:regulatory-currency' to scripts/release-gate.mjs step list)
--- a/scripts/line-budgets.json
-    "src/compliance/regulatoryAutomation.ts": 802,
+    "src/compliance/regulatoryAutomation.ts": 712,
```

## Notes for monitor
This is the S5 report. report.md was blocked by the harness, so the content is here.

WHAT CHANGED (file:line at HEAD 082efcd1)

(1) src/compliance/regulatoryRegister/register.json — new data file.
- 17 entries: eu-ai-act, eu-gdpr, eu-dora, eu-nis2, eu-cra, eu-mdr-ivdr, us-nist-ai-rmf, us-nist-ai-600-1, intl-iso-iec-42001, intl-iso-iec-42005, us-co-sb24-205 (superseded), us-co-sb26-189, cn-pipl, cn-genai-interim-measures, br-lgpd, in-dpdp, jp-appi.
- Each entry carries: jurisdiction, instrument, citation, bindingForce, status, stations, agentObligations{ref, summary, verified}, keyDates{id, date, event, verified}, sources{title, url, publisher, retrievedAt, fetched, note}, lastReviewed, verified, openQuestions.
- Review window: 90 days.
- 11 entries are verified and 6 are not. The reason for each unverified entry is in its openQuestions or in its unverified keyDates/obligations:
  - eu-nis2: reporting stages and sector scope were not on the page read.
  - eu-mdr-ivdr: the Regulation (EU) 2023/607 transition dates are not encoded.
  - intl-iso-iec-42001 and intl-iso-iec-42005: iso.org returned 403; the month-level dates come from the search index.
  - br-lgpd: the 2020-09-18 date depends on Lei 14.058/2020, which was not read.
  - in-dpdp: the phase dates are not stated, and India Code timed out.

(2) src/compliance/regulatoryRegister/index.ts — new typed module.
- Exports REGULATORY_REGISTER, getRegisterEntry and getRegisterEntriesForStation.
- Imports the JSON with { type: "json" }; tsc emits the JSON alongside it.

(3) scripts/check-regulatory-currency.mjs — new script.
- Exports checkRegulatoryCurrency, parseRegisterDate and main.
- Fails on: bad schema; no source; a non-https URL; a missing or invalid retrievedAt; a source that was not fetched and has no note; a verified flag that does not match the entry's contents; lastReviewed in the future or more than 90 days old.
- Takes --register, --as-of and --json.

(4) src/compliance/euAiActClassifier.ts
- :18 EU_AI_ACT_TIMELINE with 9 dates from Art. 113 and Art. 111 as amended by Regulation (EU) 2026/1744 (in force 2026-07-27):
  - 2024-08-01 entry into force
  - 2025-02-02 Chapters I/II, Art. 5
  - 2025-08-02 GPAI and governance
  - 2026-07-27 Omnibus in force; Arts 102-110
  - 2026-08-02 general application, Art. 50
  - 2026-12-02 new Art. 5(1)(ba)/(bb) and Art. 50(2) transition (Art. 111(4))
  - 2027-08-02 legacy GPAI deadline (Art. 111(3))
  - 2027-12-02 Annex III high-risk (Art. 113(c)(i))
  - 2028-08-02 Art. 6(1)/Annex I (Art. 113(c)(ii))
- :97 new optional field applicationDates. It is optional because cli.ts:12880 builds a literal of this type.
- :296 buildApplicationDates.
- Citation fixes: RBI is Art. 5(1)(h) (:150); humanInteraction is Art. 50(1), not the 50(4) deep-fake rule (:260); the social-scoring text follows the enacted 5(1)(c).
- The emotion-recognition finding now mentions Annex III 1(c) and Art. 5(1)(f). Its tier is unchanged.

(5) src/compliance/regulatoryRegister/feeds.ts — DEFAULT_REGULATORY_FEEDS moved here; regulatoryAutomation.ts:140 re-exports it under the same name.
- 6 live feeds, all official and all HTTP 200 on 2026-10-03:
  - AI Act Service Desk RSS (replaces the non-official artificialintelligenceact.eu)
  - digital-strategy RSS
  - EDPB RSS
  - NIST news RSS (the unused selector was removed)
  - Federal Register API v1 (with explicit fields)
  - FCA news RSS (replaces an HTML page whose selector was never applied)
- 5 feeds marked manual-review-required, disabled, each with a reason: ISO (403), OWASP, MITRE ATLAS (/updates returned 404), AI Verify, TC260.

(6) src/compliance/regulatoryAutomation.ts
- New optional RegulatoryFeed fields at :60-64: contract, official, reachability, manualReviewReason.
- Placeholder effective dates are now flagged effectiveDateEstimated: :39, :415 (RSS), :449 (API, false only when the source states a date), :476 (web_scrape).
- :438-452 reads the Federal Register fields effective_on, publication_date and html_url.
- Header and fetch comments corrected.
- File went from 801 to 711 lines.

(7) src/compliance/globalRegulatory.ts
- :90 registerId added; set on all 5 legacy entries.
- Verified article fixes: GenAI Art. 12 is labelling (:125); DPDP Section 10, not 9 (:145); APPI Arts 20/27/28, not 17/23/24 (:152-154).
- EU matrix: Clinical decision support is Art. 6(1) + Annex I MDR, not Annex III 5(a) (:264); predictive policing is 6(d) (:266); student assessment is 3(b) (:267); energy grid is Annex III point 2; Chatbot is Article 50, not 52 (:270).

(8) Docs
- docs/EU_AI_ACT_COMPLIANCE.md §5: dated table with the provision for each row, plus sources and retrievedAt.
- docs/COMPLIANCE_FRAMEWORKS.md: new Regulatory Currency Register section with 17 rows (URL and retrieved date each) and a feeds summary. References are dated, and gdpr-info.eu was replaced with the Commission page.

BEHAVIOUR CHANGES CALLERS WILL SEE
- The default RegulatoryMonitor now polls only the 6 live feeds. Before, 8 feeds were enabled.
- CLI 'compliance regulatory-feeds' will show 5 feeds as disabled.
- The API /api/v1/compliance/regulatory/feeds returns the new fields.

NOTES
- Test-first deviation: scripts/check-regulatory-currency.mjs was written before its test. Its RED was shown by mutations 1 and 4 instead.
- architecture-boundaries-check exits 1 only for the missing dist (no build). The line ratchet shows only a shrink.
- Worktree is clean; nothing under .amc was touched.