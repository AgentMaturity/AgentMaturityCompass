# F1 — Industry operating profiles: domain apply, registry, module map, CLI integration

Boundary: worktree /Users/sid/AgentMaturityCompass/.claude/worktrees/wf_fc54d4b0-c89-1, branch worktree-wf_fc54d4b0-c89-1, base 8f57ce63d8331f1bef1c2a18fde82a7e8f4511da, Darwin 25.6.0 arm64, Node v25.5.0, pnpm 10.33.0 (pnpm install --frozen-lockfile --prefer-offline: Done in 2.7s, exit 0). Everything below was measured in this worktree on 2026-10-03. Not reproduced in a fresh clone (Verify stage owns that).

## Step 1 — measurements at HEAD before any edit
- Stations in src/domains/domainRegistry.ts: 7. Registry assurancePacks ids: 9 distinct.
- Planner's 17 industry packs: 8 reachable through a station, 9 unmapped (hipaaCompliance, pharmaCompliance, financialSOX, legalCompliance, euAiActArticle, globalAIRegulatory, iso42005ImpactAssessment, realtime-voice-safety, sbom-supply-chain); ids verified by grep '^  id:' on the pack files. financialModelRisk is mapped but outside the planner's 17.
- amc domain apply --agent default --domain health --json at HEAD (tsx src/cli.ts, mkdtemp workspace amc-f1-baseline-sQkEnt, exit 0): fields agentId, domain, packsApplied(9), guardrailsGenerated=27, configFileUpdated, guardrailsEnabled(27), complianceFrameworks, assessmentScore{73,L3,3}, dryRun. Files written: AGENTS.md 36,883 bytes, .amc/guardrails.yaml 3,316 bytes.
- Signed-config seams (existing): amc budgets init|sign; amc tools init|sign; amc ops init|sign; amc policy action init + amc fix-signatures; amc policy approval init (defaults only — no CLI re-sign of an edited approval-policy.yaml at HEAD; signApprovalPolicy is called only from policyPacks/packApply.ts, enforce/scopeTemplates.ts, mechanic/executionEngine.ts); amc firewall enable --mode <m> (mode/fail-closed only); amc policy pack apply <builtin>.

## What changed (commit 262051c0)
- src/domains/domainRegistry.ts:193-277 — INDUSTRY_ASSURANCE_PACK_IDS (18 = planner's 17 + financialModelRisk), INDUSTRY_ASSURANCE_PACK_STATIONS (stations + one-line rationale + source), getIndustryAssurancePacksForStation, listIndustryAssurancePackStations, listUnmappedIndustryAssurancePacks. assurancePacks untouched (tests/domain-registry.test.ts smoke test requires it).
- src/domains/operatingProfiles/ (new, 9 files, 30-338 lines): types; source register (37 sources, retrievedAt 2026-10-03, verified flag, reason when false); station data A/B; builder (fragments from defaultApprovalPolicy/defaultBudgets/defaultToolsConfig/defaultActionPolicy/defaultRuntimeFirewallPolicy/defaultOpsPolicy, parsed by the real zod schemas); consistency checker; emitter (amc-operating-profiles/<agent>/<station>.operating-profile.json; refuses any target under .amc/); index.
- src/domains/domainApply.ts — resolves/refuses the profile path before any write (:185); emits after guardrails; throws if the profile fails consistency; result gains operatingProfile{station,riskTier,path,written,consistency}; prior fields unchanged.
- src/domains/domainApplyCli.ts — --profile-out <path>; text output gains one "Operating Profile:" line.
- src/domains/index.ts re-exports. Tests: tests/domainRegistry.test.ts (6), tests/operatingProfiles.test.ts (10), tests/domainApply.test.ts (+3). Docs: docs/INDUSTRY_OPERATING_PROFILES.md.

## Commands and exact results
- pnpm vitest run tests/domainApply.test.ts tests/domainRegistry.test.ts tests/operatingProfiles.test.ts tests/domain-registry.test.ts tests/domain-module-map.test.ts tests/domainDocs.test.ts → 6 files, 37 passed, 1.21s.
- pnpm vitest run tests/domainRegistry.test.ts --reporter=verbose → 6 passed; stdout "unmappedIndustryPacks=0".
- pnpm vitest run tests/domainApply.test.ts tests/domainRegistry.test.ts tests/operatingProfiles.test.ts (final) → 3 files, 24 passed.
- pnpm typecheck → exit 0. pnpm typecheck:tests → exit 0.
- node scripts/architecture-boundaries-check.mjs → exit 1 in worktree AND in the clean clone, identical output ("10 file(s) shrank by 174 lines", asks for --update, a generator not run); no complaint about any F1 file.
- pnpm build → exit 0 (three builds; the final one from the restored tree).
- node dist/cli.js domain apply --agent default --domain health --json (temp workspace amc-f1-baseline-gzMYp5) → exit 0; operatingProfile {station: health, riskTier: critical, path: .../amc-operating-profiles/default/health.operating-profile.json, written: true, consistency: {ok: true, violations: []}}; files: .amc/guardrails.yaml 3,316 b and AGENTS.md 36,883 b (same as HEAD) + health.operating-profile.json 41,368 b.
- Profile inspection: top-level keys include toolAllowlist, firewall, approvals, budgets, retention, auditSampling, humanOversight, incidentReportingClocks; 30 sourced entries (24 verified, 6 unverified), 12 distinct sources; clocks hipaa-individual-notice=60 calendar-days, hipaa-secretary-500=60, fda-mdr-30=30, fda-mdr-5day=5 working-days, ind-safety-15=15, ind-fatal-7=7, eu-ai-act-serious-incident=15 (unverified); WRITE_HIGH {2, distinct, APPROVER/OWNER, 15 min} src cfr45_164_312; firewall block; budgets DATA_EXPORT 1, SECURITY 0, DEPLOY 1, WRITE_HIGH 5; retention 2190 days (45 CFR 164.316); assurancePacks healthcarePHI, safetyCriticalSIL (registry) + hipaaCompliance, pharmaCompliance, euAiActArticle (industryMap).
- node dist/cli.js domain apply --agent default --domain wealth (text) → exit 0; prior lines unchanged; new "Operating Profile: ... (tier=high; ...)" line; profile 38,984 b.
- node dist/cli.js domain apply --agent default --domain health --profile-out .amc/operating-profile.json (final dist, workspace amc-f1-baseline-diE0Be) → exit 1, stderr "Refusing to write an operating profile under .../.amc: .amc/** is reserved for signed configs; sign with the existing commands instead."; FILES WRITTEN: none.

## Mutation checks (RED → restore from commit → GREEN, all recorded)
1. pack→station coverage: hipaaCompliance stations [] → "unmappedIndustryPacks=1 (hipaaCompliance)", 3 registry tests fail → restored 24/24.
2. critical WRITE_HIGH: health approval(2,true) → approval(0,false) → 5 domainApply tests throw "Operating profile for health is inconsistent ... requires at least 2 approvals; requires distinct users", 3 operatingProfiles tests fail → restored 24/24.
3. .amc refusal: assertOutsideSignedConfigTree call removed → "apply refuses a profile target under .amc" (promise resolved) and "emit ... refuses any target inside it" fail → restored 24/24.
4. source completeness: source.title check removed → "rejects a setting that lost its source" fails → restored.
5. critical firewall block check disabled → "rejects a critical station whose firewall is not in block mode" fails → restored.
Round A: 11 failed / 13 passed of 24. Round B: 4 failed / 14 passed of 18.

## Sources (retrievedAt 2026-10-03)
Verified (text read): govinfo CFR-2024 XML — 45 CFR 164.404, 164.408, 164.316, 164.312, 164.308; 21 CFR 803.50, 803.53, 11.10, 312.32; 34 CFR 99.32; 16 CFR 312.10, 312.5; 17 CFR 240.17a-4; 31 CFR 1020.320; 49 CFR 573.6; 12 CFR 53.3; CFR-2025 16 CFR 461.3. Pages: ICO breach (72 h), EC AI Act policy page, EC NIS2 page, NIST AI RMF, NIST SP 800-53 r5 landing, CISA incident guidelines (1 h), OMB M-25-21 PDF pp.1-4 (rescinds M-24-10), NERC CIP-008-6 PDF pp.9-12 (R4.2 one hour), NIST SSDF landing, CISA EO 14028 page, FINRA 4530 (30 days), Cal. Civ. 1798.82 (30 calendar days as published), NIST CSF 2.0 page.
Unverified (reason in src/domains/operatingProfiles/operatingProfileSources.ts): EUR-Lex 2024/1689, 2016/679, 2022/2555 (empty content on ELI/OJ-HTML/CELEX forms); eCFR (bot-wall redirect); hhs.gov, nhtsa.gov, unece.org, iso.org, fcc.gov (HTTP 403); ftc.gov rule page, EDPB pages, commission.europa.eu breach page (404); SR 11-7 body (title/date page only); 17 CFR 248.30, 49 CFR 576, NERC CIP-013-2, SOX 302/404 (not fetched). Research digests under research/<station>/digest.json did not exist.

## Not exercised
Fresh-clone reproduction; full suite; release gate; generators; the signing commands themselves against the emitted fragments (fragments parsed by the loaders those commands call instead); runDomainAssurance with the newly mapped packs.

## Ready to wire (outside F1 claims)
1. src/cli.ts: policyApproval.command("sign") calling signApprovalPolicy(process.cwd()).
2. src/cli.ts firewall: expose rule toggles through writeRuntimeFirewallPolicy.
3. src/domains/domainCliIntegration.ts: runDomainAssurance(agentId, domain, { includeIndustryPacks }) using getIndustryAssurancePacksForStation.

## Blockers
None. .amc/** never written beyond the pre-existing guardrails.yaml; no dirty-list path touched.
