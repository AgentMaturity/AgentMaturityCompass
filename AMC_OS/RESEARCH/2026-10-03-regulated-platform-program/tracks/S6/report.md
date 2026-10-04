# Track S6 — repair round 1 (2026-10-04)

- Status (self-report): **PARTIAL** — 5 of the 6 required fixes done in full; fix 4 done for 5 of 6 families. ISO/IEC 42005 is not added because its clauses could not be read. It needs a root descope or a licensed copy.
- Branch `worktree-wf_5210e2f4-3ea-6`; base `8f57ce63` (ancestor, verified); round-1 head `83d02211`. Repair commits: `f007629b` (src+tests), `d65cff85` (docs), `088ca501` (Texas category headings), then this receipt commit.
- Environment: Darwin 25.6.0 arm64, Node v25.5.0, pnpm 10.33.0, same worktree (not a fresh clone).
- User relay for this run said "Skip linear": no Linear calls were made.

## Required fixes — what was done

| # | Fix | Result |
|---|---|---|
| 1 | PCI DSS label | `frameworks.ts` displayName is now `PCI DSS v4.0.1 (...)`. `grep -n 'PCI DSS v4.0 ' src/compliance/frameworks.ts` prints nothing. A test in frameworkBreadth pins the label. |
| 2 | Pin unknown-framework rejection | `tests/mappingSources.test.ts` asserts that `safeParse({...base, framework:'DORA_X'})` and `'ONC_HTI_1'` both fail. Mutation M7 (`frameworkEnum -> z.string()`) goes RED. |
| 3 | Pin non-empty related.questions | `tests/frameworkBreadth.test.ts` asserts that every mapping of the 8 station families has `related.questions.length > 0` and `sources.length > 0`. Mutation M9 (empty questions on `dora_art10_detection`) goes RED. |
| 4 | Missing families | Added NIST_AI_600_1 (5), CO_AI_ACT (4), TX_TRAIGA (4), CA_AI_LAWS (7) and KR_AI_BASIC_ACT (4). Every mapping cites the official text I read on 2026-10-04 and has non-empty `related.questions`. HHS_HTI_1 is covered by fix 5. **ISO_42005 is not added** (see below). |
| 5 | Rename ONC_HTI_1 -> HHS_HTI_1 | Renamed in the union, the family, the 6 mappings, the pattern, tests and docs. `ONC_HTI_1`, `onc-hti-1` and `hti-1` remain input aliases only. A maps file naming `ONC_HTI_1` as a framework fails the schema (tested). |
| 6 | Claimed test names and fixture | `git mv`: frameworks -> packFrameworkAliases, complianceMapping -> mappingSources, controlCrosswalk -> frameworkBreadth (coverageScorer tests merged in, old file removed). Added `tests/fixtures/packFrameworkStrings.unresolved.json` (193 strings, reason `sector-standard-not-modelled`) and `classifyFrameworkString()`. `git diff --name-only 8f57ce63..HEAD` shows only claimed paths. |

Extra low-severity monitor items also closed:
- Every generated report in `docs/compliance/` now opens with its window end date and age (201-203 days at 2026-10-04).
- `docs/ISO_42001_ALIGNMENT.md` no longer gives iso.org catalogue numbers that could not be checked (44546/44547). For 42005 it cites the IEC webstore page that was actually read.

## Acceptance (planner check 2, run with tsx against src)

```
npx tsx scratchpad/s6r/count.ts
20 false DORA:9:true NIS2:9:true NIST_AI_600_1:5:true ISO_42005:0:true HHS_HTI_1:6:true CO_AI_ACT:4:true TX_TRAIGA:4:true CA_AI_LAWS:7:true KR_AI_BASIC_ACT:4:true 149
```
This prints 20 frameworks, not the planner's 21, and `false` because ISO_42005 is absent. 149 mappings (expected >= 137). The 101 base mappings are unchanged, and frameworkBreadth pins the per-family counts.

## ISO/IEC 42005 — needs a root decision

The clause text could not be read:
- iso.org (44545.html, 44546.html, OBP) returned HTTP 403 to WebFetch and to curl.
- The IEC webstore page (publication 107659) gives only the title, a one-line abstract, 2025-05-28 and edition 1.0. Its preview PDF redirects to the store home.
- BSI gives a marketing summary only. ANSI returns 403.

Under the rule "an article you cannot quote from the source does not become a mapping", no ISO_42005 family was created. The existing ISO_42001 category "ISO 42005 Impact Assessment" (3 mappings) is unchanged.

**Root:** either record a written descope of ISO_42005 for S6, or supply a licensed copy. Until then S5 must not emit `frameworkRef: ISO_42005`.

## Still needs root ratification (carried from round 1)

- `coverageScorer.ts`: UNKNOWN now earns 0 (was 0.25), and a blank control id throws. The direction follows brief §2 rule 4 and is tested. Existing `amc comply report` scores with UNKNOWN rows will drop.

## Sources read this round (retrievedAt 2026-10-04)

- NIST AI 600-1 PDF: <https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf>. Read with pdftotext from the WebFetch-saved copy. The 12 risk headings §2.1-2.12 and action IDs MS-2.5-001, MG-4.1-002, MS-2.2-002, MS-1.1-001, MS-2.7-001, MG-4.3-001 and GV-6.2-001 were read verbatim.
- Colorado SB26-189 final act PDF (05/12/2026): <https://leg.colorado.gov/bill_files/116432/download>. Sections 6-1-1702 to 1706 were read verbatim. The bill page <https://leg.colorado.gov/bills/sb26-189> gives the signed date 2026-05-14. The signed-act PDF (116489) exceeded WebFetch's 10 MB limit.
- Texas HB 149 enrolled: <https://capitol.texas.gov/tlodocs/89R/billtext/html/HB00149F.htm> (§552.051-.057, .101-.105; effective 2026-01-01).
- California SB 53: <https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202520260SB53> (§22757.12(a)(1)-(10) and (c)(1), §22757.13(c)(1)-(2), quoted; chaptered 2025-09-29).
- California AB 2013: <https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320240AB2013> (Civ. Code §3111 opening and items (a)(1), (7), (9), (12)).
- CPPA approved regulations text: <https://cppa.ca.gov/regulations/pdf/ccpa_updates_cyber_risk_admt_appr_text.pdf> (Art. 11 §7200, 7220, 7221, 7222, read via pdftotext). OAL approval 2025-09-22 per <https://cppa.ca.gov/regulations/ccpa_updates.html>.
- Korea: KLRI English translation <https://elaw.klri.re.kr/eng_mobile/viewer.do?hseq=73499&type=part&key=18> (Arts. 31-36 and addenda; Act 20676 amended by 21311). The law.go.kr English record shows the header only (Law No. 20676, effective 2026-01-22). The law.go.kr Korean page showed Act 21311 (promulgated 2026-01-20) with no article text.
- Unreadable: iso.org (403), webstore.ansi.org (403), IEC preview PDF (redirect).

WebFetch summarises pages with a small model. Every quoted clause was checked against verbatim text: pdftotext output for NIST, Colorado and CPPA, and a verbatim-quote request for SB 53 and AB 2013. The Texas section headings were confirmed with a second verbatim-quote fetch (ch. 552 'Artificial Intelligence Protection'; §552.103 'Investigative Authority' with items (1)-(7)); category names were aligned to those headings in a follow-up commit.

## Commands run (this round)

- `pnpm vitest run tests/frameworkBreadth.test.ts tests/packFrameworkAliases.test.ts tests/mappingSources.test.ts` → 3 files, 90 passed, 0 skipped
- `pnpm vitest run` over the 24 test files that import controlCrosswalk/frameworks/builtInMappings/mappingSchema/coverageScorer (incl. 19 gap10xx boundary tests, gdprAccountabilityMapping, complianceReportReadability) → 24 files, 176 passed
- `pnpm build` (exit 0), then `pnpm vitest run` over the 3 new files, gdprAccountabilityMapping, compliance/complianceMatrix, complianceReportReadability, complyReportFrameworkSelection, 7 gap10*ControlCrosswalkBoundary, apiRouters, federationComplianceIntegrationMerkle, dataResidency, compliance/dataResidencyPersistence and auditBinderComplianceMaps → 19 files, 222 passed
- `pnpm typecheck` → exit 0. `pnpm typecheck:tests` → exit 0, 0 `error TS`
- `node scripts/architecture-boundaries-check.mjs` → exit 0, failures []
- `pnpm run check:docs-drift` → passed (327 files)

## Mutation checks (this round; each restored to 90/90 green)

| Guard | Mutation | RED |
|---|---|---|
| schema rejects unknown framework (mappingSchema.ts:6) | `frameworkEnum = z.string()` | 1 failed / 89 passed |
| non-empty related.questions | `dora_art10_detection` questions `[]` | 3 failed / 87 passed |
| PCI label | displayName back to `PCI DSS v4.0 (` | 1 failed / 89 passed |
| classifyFrameworkString reason | unresolved -> reason `pattern` | 2 failed / 88 passed |
| unresolved fixture lock | removed `NIST CSF 2.0` from fixture | 1 failed / 89 passed |

## Line budget

- `frameworks.ts` 302 -> 356 (cap 400). It passed 320, so aliases and patterns were split into `src/compliance/frameworks/aliases.ts` (41 lines) as the planner required. The family data alone keeps it above 320.
- `builtInMappings.ts` 2359 -> 2709 (registry-exempt, data-only; boundaries check passes).
- `mappingSchema.ts`, `controlCrosswalk.ts`, `coverageScorer.ts` and `dataResidency.ts` were not changed this round.

## Not exercised

- No fresh clone.
- No `amc comply report --framework <new id>` CLI run (it needs a vault passphrase). The schema parse of the full default maps file is tested.
- No assurance run proves the new requirements pass on real evidence.
- The signed Colorado act PDF itself was not read (size limit); the final act sent for signature was read.
- ISO/IEC 42005 is not covered (see above).

## Ready-to-wire / cross-track

- S5: use `HHS_HTI_1` (not `ONC_HTI_1`) as frameworkRef. NIST_AI_600_1, CO_AI_ACT, TX_TRAIGA, CA_AI_LAWS and KR_AI_BASIC_ACT now exist. ISO_42005 does not.
- S3: a pack edit that adds or removes a framework string must update `tests/fixtures/packFrameworkStrings.unresolved.json`.
- Root: regenerate `docs/compliance` reports at the next release build (root ruling).

---

# Round 1 receipt (kept for history)


- Status (self-report): **PARTIAL**
- Branch: `worktree-wf_5210e2f4-3ea-6`; HEAD before `8f57ce63d8331f1bef1c2a18fde82a7e8f4511da` → after `5045b665762b0b31d590f0099d60228ebee2d2c5`
- Environment: Darwin 25.6.0 arm64, Node v25.5.0, pnpm 10.33.0; worktree /Users/sid/AgentMaturityCompass/.claude/worktrees/wf_5210e2f4-3ea-6 on branch worktree-wf_5210e2f4-3ea-6, base 8f57ce63, head 5045b665; git status --porcelain empty at finish; no .amc/keys changes occurred
- Receipt path (as reported): NOT WRITTEN - harness blocked report file creation; intended path AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S6/{report.md,result.json}; content is in notesForMonitor

## Commits
- de349beed7b9f34787cc60893bc1a6fbe9c36c80 feat: add sourced DORA, NIS2 and HTI-1 crosswalks and resolve pack framework names
- 5045b665762b0b31d590f0099d60228ebee2d2c5 docs: consolidate duplicate compliance reports and date crosswalk sources

## Files changed
- `src/compliance/frameworks.ts`
- `src/compliance/builtInMappings.ts`
- `src/compliance/mappingSchema.ts`
- `src/compliance/controlCrosswalk.ts`
- `src/compliance/coverageScorer.ts`
- `tests/frameworks.test.ts (new)`
- `tests/complianceMapping.test.ts (new)`
- `tests/controlCrosswalk.test.ts (new)`
- `tests/coverageScorer.test.ts (new)`
- `docs/COMPLIANCE_MAPS.md`
- `docs/ISO_42001_ALIGNMENT.md`
- `docs/compliance/README.md (new)`
- `docs/compliance/compliance-eu_ai_act.md (content moved from compliance-eu-ai-act.md, blob e9bbb532 identical)`
- `docs/compliance/compliance-iso_42001.md (from compliance-iso-42001.md, blob cc6dd7f9 identical)`
- `docs/compliance/compliance-nist_ai_rmf.md (from compliance-nist-ai-rmf.md, blob c4628f58 identical)`
- `docs/compliance/compliance-soc2.md (from compliance-soc-2.md, blob f0c7bf6d identical)`
- `docs/compliance/compliance-eu-ai-act.md (deleted)`
- `docs/compliance/compliance-iso-42001.md (deleted)`
- `docs/compliance/compliance-nist-ai-rmf.md (deleted)`
- `docs/compliance/compliance-soc-2.md (deleted)`
- `docs/compliance/compliance-nist.md (deleted, was a Moved stub)`

## Commands run
- `npx tsx scratchpad/s6/measure.ts (at 8f57ce63, before edits)` → 12 frameworks (SOX included; brief said 11), 101 mappings, 41 packs, 224 distinct pack framework strings, 222 fail normalizeFrameworkName (only HIPAA, GDPR resolved)
- `RED: pnpm vitest run tests/frameworks.test.ts tests/controlCrosswalk.test.ts tests/complianceMapping.test.ts tests/coverageScorer.test.ts (new tests, src unchanged)` → Test Files 4 failed (4); Tests 44 failed | 16 passed (60)
- `GREEN/final: pnpm vitest run tests/frameworks.test.ts tests/controlCrosswalk.test.ts tests/complianceMapping.test.ts tests/coverageScorer.test.ts` → Test Files 4 passed (4); Tests 60 passed (60); prints unresolvedPackFrameworkStrings=193 resolvedPackFrameworkStrings=31 distinct=224; DORA mappedControls=9; NIS2 mappedControls=9; ONC_HTI_1 mappedControls=6
- `pnpm vitest run (28 regression files: apiRouters, compliance/complianceMatrix, complianceReportReadability, federationComplianceIntegrationMerkle, gap1057/1058/1059/1060/1062/1064/1065/1066/1068/1071/1072/1074/1076/1078/1084/1086/1091/1097/1098, gdprAccountabilityMapping, complyReportFrameworkSelection, dataResidency, compliance/dataResidencyPersistence, auditBinderComplianceMaps)` → Test Files 28 passed (28); Tests 187 passed (187). First run had 1 failure only because dist/cli.js was absent; passed after pnpm build
- `pnpm build (rebuilt at HEAD after final src edit) && pnpm vitest run tests/complyReportFrameworkSelection.test.ts` → build exit 0; 3 passed (3); `node dist/cli.js comply report` lists 15 frameworks incl. DORA, NIS2, ONC_HTI_1
- `AMC_VAULT_PASSPHRASE=<throwaway> npx tsx scratchpad/s6/e2e.ts and e2e2.ts (scratch workspace, empty ledger)` → DORA coverage {satisfied 0, partial 3, missing 6, unknown 0, score 0.1667}; NIS2 same; ONC_HTI_1 {0,2,4,0,0.1667}; initComplianceMaps -> loadComplianceMaps: 125 mappings, 9/9 DORA with sources, signature valid, configTrusted true; YAML holds 30 retrievedAt entries
- `node scripts/architecture-boundaries-check.mjs (check mode)` → "failures": [], exit 0, no files written
- `npx tsx scratchpad/s6/measure.ts (after)` → 15 frameworks, 125 mappings (DORA 9, NIS2 9, ONC_HTI_1 6, others unchanged), 224 strings, 31 resolve, 193 external

## Typecheck
pnpm typecheck: exit 0, no errors. pnpm typecheck:tests: exit 0, 0 'error TS' lines. Both run on the code committed in de349bee; the later commit 5045b665 touches docs only.

## Acceptance self-report
- [x] 4 named test files pass — `pnpm vitest run tests/frameworks.test.ts tests/controlCrosswalk.test.ts tests/complianceMapping.test.ts tests/coverageScorer.test.ts` → Test Files 4 passed (4); Tests 60 passed (60)
- [x] a test prints unresolvedPackFrameworkStrings and lists remaining external ones — `pnpm vitest run tests/frameworks.test.ts --reporter=verbose | grep -E 'unresolvedPack|^external:'` → unresolvedPackFrameworkStrings=193 resolvedPackFrameworkStrings=31 distinct=224, then 193 lines `external: "<string>" citedBy=<pack ids> (no AMC control mappings; official source not catalogued)`. These name instruments AMC has no framework for (ISO 22000, NIST CSF 2.0, FDA 21 CFR 820, MiCA, WCAG 2.1, ...). Each is listed with the packs citing it, NOT with an official source URL; every string naming a supported framework (29 pinned + GDPR/HIPAA) resolves.
- [x] ls docs/compliance shows one canonical file per framework and no duplicate pair — `ls docs/compliance` → README.md SOC2_TYPE_II_CONTROLS_MAPPING.md compliance-eu_ai_act.md compliance-fedramp.md compliance-gdpr.md compliance-hipaa.md compliance-iso_27001.md compliance-iso_42001.md compliance-mitre_atlas.md compliance-nist_ai_rmf.md compliance-owasp.md compliance-pci_dss.md compliance-soc2.md compliance-sox.md eu-ai-act-checklist.md iso-42001-aims-manual.md nist-rmf-profile.md - no hyphen/underscore pair, compliance-nist.md gone; README maps former names to canonical ones
- [x] every added mapping row has a source URL and retrievedAt — `pnpm vitest run tests/complianceMapping.test.ts` → All 24 DORA/NIS2/ONC_HTI_1 mappings carry sources with https URL on publications.europa.eu / www.ecfr.gov / www.federalregister.gov and retrievedAt 2026-10-03; schema rejects a source missing url or retrievedAt; 7 passed

## Mutation checks
- framework alias resolves pack strings (frameworks.ts frameworkNamePatterns) — mutation: deleted [/^soc ?2\b/, "SOC2"] — RED: tests/frameworks.test.ts: 2 failed | 41 passed (SOC 2 Type II -> SOC2; live-pack test) — restored: 43 passed
- coverageScorer refuses empty control id (coverageScorer.ts:12) — mutation: if (false && row.id.trim() === "") — RED: tests/coverageScorer.test.ts: 2 failed | 3 passed ("" and "   " cases) — restored: 5 passed
- UNKNOWN earns no credit (coverageScorer.ts:22) — mutation: re-added + counts.unknown * 0.25 — RED: 1 failed | 4 passed — restored: 5 passed
- crosswalk fails closed when a row's own source is absent from receipt citations (controlCrosswalk.ts:129) — mutation: if (false && ownSourceIds.some(...)) — RED: tests/controlCrosswalk.test.ts: 1 failed | 4 passed — restored: 5 passed
- required assurance packIds are registered packs — mutation: reverted packId sandboxBoundary -> sandbox_boundary — RED: tests/complianceMapping.test.ts: 1 failed | 6 passed (lists fedramp_system_communications, pci_dss_vulnerability_mgmt, dora_art24_25_resilience_testing) — restored: 7 passed
- every added mapping carries sources — mutation: removed sources from dora_art10_detection — RED: 1 failed | 6 passed (DORA has sourced control mappings) — restored: 7 passed

## Sources
- Regulation (EU) 2022/2554 (DORA), OJ L 333, 27.12.2022 - EU Publications Office (article headings; Art. 5, 6, 8-12, 17, 19, 24, 25, 28, 30 text; Art. 64 applies from 17 January 2025) <https://publications.europa.eu/resource/celex/32022R2554> retrieved 2026-10-03 verified=True
- Directive (EU) 2022/2555 (NIS 2), OJ L 333, 27.12.2022 - EU Publications Office (Art. 20, 21(2)(a)-(j), 23(4) 24h/72h/one month, Art. 41 apply from 18 October 2024) <https://publications.europa.eu/resource/celex/32022L2555> retrieved 2026-10-03 verified=True
- 45 CFR 170.315(b)(11) Decision support interventions - eCFR point-in-time 2026-10-01 (read via eCFR versioner API) <https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-D/part-170/subpart-C/section-170.315> retrieved 2026-10-03 verified=True
- HTI-1 final rule, 89 FR 1192, published 2024-01-09, effective 2024-02-08 (Federal Register API metadata) <https://www.federalregister.gov/documents/2024/01/09/2023-28857/health-data-technology-and-interoperability-certification-program-updates-algorithm-transparency-and> retrieved 2026-10-03 verified=True
- ASTP/ONC Deregulatory Actions proposed rule, 90 FR 60970, 2025-12-29 (pending; finalization for (b)(11) unverified) <https://www.federalregister.gov/documents/2025/12/29/2025-23896/health-data-technology-and-interoperability-astponc-deregulatory-actions-to-unleash-prosperity> retrieved 2026-10-03 verified=True
- Regulation (EU) 2024/1689 (EU AI Act) - title check only <https://publications.europa.eu/resource/celex/32024R1689> retrieved 2026-10-03 verified=True
- NIST AI RMF page / NIST AI 100-1 / NIST AI 600-1 - reachability only (HTTP 200), nothing encoded <https://www.nist.gov/itl/ai-risk-management-framework> retrieved 2026-10-03 verified=False
- ISO/IEC 42001:2023, 42005:2025, 42006:2025 catalogue pages - bot challenge, unverified <https://www.iso.org/standard/81230.html> retrieved 2026-10-03 verified=False

## Not exercised
- Receipt files AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S6/report.md and result.json: NOT written or committed - the harness refused the Write ('Subagents should return findings as text, not write report files'); I did not route around that guard. Full receipt content is in notesForMonitor.
- No fresh-clone reproduction; all runs in this worktree (Darwin 25.6.0 arm64, Node v25.5.0, pnpm 10.33.0).
- Full suite, release gate, generators: not run (program rule).
- CLI `amc comply report --framework DORA` blocked by required AMC_VAULT_PASSPHRASE; same engine path exercised in-process in a scratch workspace with a throwaway passphrase and an empty ledger. No mapping observed reaching SATISFIED against real evidence.
- The 10 corrected packIds were checked against listAssurancePacks(); no assurance run executed to show those requirements now pass.
- docs/compliance generated reports were not regenerated; README marks them Feb/Mar 2026 snapshots.
- 193 external pack strings have no official URL catalogued (listed with citing packs only).
- ISO/IEC 42001/42005/42006 iso.org pages: unverified (bot challenge, WebFetch HTTP 403).
- HTI-1 (b)(11): whether proposed rule 90 FR 60970 (2025-12-29) was finalized for this criterion is unverified; eCFR point-in-time 2026-10-01 still contains it.
- Not added: NIST AI 600-1 (no pack cites it; time box), Colorado AI Act (no pack cites it; current effective date not verified from legislature), separate ISO/IEC 42005 (already an ISO_42001 category; text paywalled).
- Research digests: research/ had only empty education/, environment/, health/ dirs at last check; none cited.

## Blockers
- Receipt report.md/result.json could not be written: the Write tool refused it as a subagent report file. The orchestrator or root session needs to write and commit the receipt from notesForMonitor (git add -f under AMC_OS/).
- Out-of-claim defect (complianceEngine.ts, other session's file): a requires_no_audit requirement passes vacuously on an empty ledger, so a mapping with zero evidence scores PARTIAL (0.5 credit). Observed: dora_art9_protection_prevention PARTIAL with zero events; every new framework scored 0.1667 on an empty ledger. Not fixed here.

## Ready-to-wire diff
```
None. All changes are inside S6 claimed paths.
```

## Notes for monitor
RECEIPT CONTENT (the file could not be written; please persist it as tracks/S6/report.md).

MEASURE at 8f57ce63: 12 frameworks (incl. SOX; the brief said 11), 101 mappings (SOC2 5, NIST_AI_RMF 4, ISO_42001 11, ISO_27001 5, EU_AI_ACT 12, GDPR 13, MITRE_ATLAS 8, OWASP_API_TOP10 10, HIPAA 10, SOX 9, FEDRAMP 10, PCI_DSS 4); 41 packs cite 224 distinct framework strings; 222 failed normalizeFrameworkName. Also found: 10 of 17 required assurance packIds in builtInMappings were not registered ids (sandbox_boundary, circuit_breaker_reliability, approval_theater, sbom_supply_chain, delegation_trust_chain, stepup_approval_bypass, pii_detection_leakage, context_leakage, excessive_agency, agent_identity_spoofing). complianceEngine.ts:269 matches exact ids, so those requirements could never pass.

CHANGES (file:line at 5045b665):
- frameworks.ts:1 adds DORA|NIS2|ONC_HTI_1. :193-243 adds the 3 families, with official headings as category names. :248-261 anchored frameworkNamePatterns for versioned or clause-qualified names. :286 adds aliases nis-2 and onc-hti-1. :291 falls back to the patterns. NIST CSF 2.0, ISO/IEC 27701, HITECH, ISO 27799 and CCPA/CPRA are asserted to stay null. I reused the existing enum ids so S3 can normalize pack strings to those ids.
- builtInMappings.ts:14-33 holds the source constants. :2050-2353 adds 24 mappings (DORA 9, NIS2 9, ONC_HTI_1 6), each with sources {title,url,retrievedAt 2026-10-03}. Each description names what AMC evidence does not show (management-body approval, CSIRT or authority notification, contracts, TLPT, HR security, national transposition). The 10 broken packIds are corrected to registered ids with thresholds unchanged. related.packs is untouched.
- mappingSchema.ts:46-50 adds complianceMappingSourceSchema. :63 adds optional sources (min 1), so existing signed maps still parse.
- controlCrosswalk.ts:83 adds mappingSourceCitations(). :126-131 and :141: a row with its own sources cites only those, and fails closed with <id>:sourceCitations:unlisted when they are missing from the receipt. Mappings without sources behave as before (the 19 gap tests are green).
- coverageScorer.ts:11-14 throws on a blank or whitespace control id. :21-22 makes UNKNOWN weigh 0 (was 0.25). The zod id.min(1) does not cover whitespace or direct callers; the RED run proved that.
- docs/compliance: the canonical name is what `amc comply report` writes (compliance-<id lowercase>.md, src/cli.ts:12623). The 4 hyphenated reports were git mv'd onto the underscore names with blob hashes identical. The 4 Moved stubs and compliance-nist.md were removed. README.md indexes every file and maps former names. COMPLIANCE_MAPS.md has a new crosswalk section: counts measured at de349bee, a dated sources table, normalization and scoring rules. ISO_42001_ALIGNMENT.md has a dated references table with the ISO pages marked unverified.

EUR-Lex returned HTTP 202 with an empty body (bot challenge), so the EU texts were read from publications.europa.eu by CELEX number. iso.org returned a challenge or 403.

FOR ROOT SESSION: (1) Write and commit the receipt (git add -f). (2) Engine defect (complianceEngine.ts:375-383): a vacuous requires_no_audit pass on an empty ledger gives PARTIAL. (3) S3: pack strings resolve when given as enum ids or in the patterned forms. 193 external strings stay unresolved by design; the list is printed by tests/frameworks.test.ts. (4) Linear: 'Framework crosswalk breadth' can cite commits de349bee and 5045b665.

The 193 external strings start with "21 CFR Part 11" (life-technology), "21st Century Cures Act" (digital-health-record), "5AMLD/6AMLD" (blockchain), and so on. Full list: run `pnpm vitest run tests/frameworks.test.ts --reporter=verbose | grep '^external:'`.