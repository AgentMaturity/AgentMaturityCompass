# Governance / Public Sector station: regulated deployment guide

This guide maps what AMC source provides for an agent deployed in the `governance` station: its sector packs, the frameworks those packs name, the assurance packs, the deployment controls and the evidence AMC can produce. It describes source at commit `726be0ca`. Every count was derived from source by the commands in the verification appendix, and every source location is listed there and checked by `tests/industryGuides.test.ts`.

It does not say what any regulation requires, and it is not legal advice. Framework names below are strings that appear in AMC source; their presence means a pack refers to them, not that AMC satisfies them.

## Station metadata

| Field | Value (as declared in source) | Where |
|---|---|---|
| Station id | `governance` | [C1] |
| Name | Governance / Public Sector | [C2] |
| Risk level | very-high | [C3] |
| EU AI Act category | high-risk | [C4] |
| `questionCount` field | 6 | [C5] |
| Recommended industry packs | `digital-citizens-rights`, `dance-of-democracy`, `petition-to-law`, `citizen-services`, `public-private-collaboration` | [C6] |

The EU AI Act category and risk level are labels in AMC's registry, not a legal classification of any particular agent.

## Sector packs

Packs whose `stationId` is `governance`, as returned by `getIndustryPacksByStation` [C7].

| Pack | Name | Questions | Risk tier | Certification threshold |
|---|---|---|---|---|
| `digital-citizens-rights` | Digital Citizens & Rights | 15 | critical | 80 |
| `dance-of-democracy` | Dance of Democracy | 15 | critical | 85 |
| `petition-to-law` | Petition to Law | 15 | very-high | 78 |
| `citizen-services` | Citizen Services | 15 | very-high | 80 |
| `public-private-collaboration` | Public and Private Collaboration | 15 | very-high | 80 |

Total: 5 packs, 75 questions.

Run one with `amc domain pack run --pack <id>` [C8]. The command requires the industry-pack entitlement [C9]. Its score comes from levels the operator picks per question (L1, L3 or L5); with `--baseline`, or without a terminal, every question is scored L1 [C10] [C11]. A pack score is therefore a self-assessment, not an observation of the agent.

## Frameworks referenced

- Station `regulatoryBasis` [C12]: `NIST AI RMF`, `EU AI Act`, `FedRAMP`, `FISMA`, `OMB M-24-10`, `GDPR`.
- Station `complianceFrameworks` [C13]: `NIST AI RMF`, `FedRAMP`, `FISMA`, `OMB M-24-10`, `GDPR`, `EU AI Act`.
- The station's packs name 51 distinct framework strings in their `regulatoryBasis` and `complianceFrameworks` fields [C14]: `EU eIDAS 2.0 Regulation 2024/1183`, `GDPR Art. 6/9/22`, `UN Guiding Principles on Business and Human Rights (UNGPs)`, `EU AI Act Annex III §8`, `Council of Europe AI Convention 2024`, `ISO/IEC 29115:2013`, `EU Digital Identity Wallet Architecture`, `EU eIDAS 2.0 2024/1183`, `EU AI Act Art. 5 (prohibited electoral manipulation)`, `EU Digital Services Act Art. 34 (electoral risk)`, `OSCE/ODIHR Electoral Standards`, `Council of Europe Recommendation CM/Rec(2017)5`, `Venice Commission AI in Elections Guidelines`, `EU Code of Practice on Disinformation 2022`, `GDPR Art. 9(d) (political opinion data)`, `EU AI Act Art. 5(1)(a)`, `EU DSA Art. 34`, `EU GDPR Art. 9(d)`, `Council of Europe Rec CM/Rec(2017)5`, `UN E-Government Survey Guidelines`, `EU Interoperability Framework (EIF) v2`, `GDPR Art. 6(1)(e) (public task)`, `US FOIA (5 U.S.C. §552)`, `EU INSPIRE Directive 2007/2/EC`, `ISO 25000 SQuaRE`, `EU Open Data Directive 2019/1024`, `UN SDG 16.6 (effective institutions)`, `EU EIF v2`, `GDPR Art. 6(1)(e)`, `EU Single Digital Gateway Regulation 2018/1724`, `eIDAS 2.0 Regulation 2024/1183`, `WCAG 2.1 AA / EU Accessibility Directive 2016/2102`, `ISO 9241-210:2019 (Human-Centered Design)`, `UN E-Government Development Index Standards`, `Section 508`, `EU SDG 2018/1724`, `eIDAS 2.0`, `WCAG 2.1 AA`, `EU AI Act Annex III §5/8`, `ISO 9241-210:2019`, `UN SDG 17 Partnership Framework`, `OECD PPP Framework`, `World Bank PPP Guidelines`, `UNCAC (UN Convention Against Corruption)`, `ISO 26000:2010 §6.6`, `G20 Principles for Responsible AI in Government`, `FATF R1 (AML in PPP)`, `UN SDG 17`, `UNGPs`, `UNCAC`, `G20 Responsible AI Principles`.

`amc compliance report --framework <id>` accepts the ids of `ComplianceFramework` [C15], resolved by `normalizeFrameworkName` [C16]; an unresolved name is rejected [C17]. Of the 57 framework strings above (station and packs together):

- 13 resolve as written: `NIST AI RMF` → `NIST_AI_RMF`, `EU AI Act` → `EU_AI_ACT`, `FedRAMP` → `FEDRAMP`, `GDPR` → `GDPR`, `GDPR Art. 6/9/22` → `GDPR`, `EU AI Act Annex III §8` → `EU_AI_ACT`, `EU AI Act Art. 5 (prohibited electoral manipulation)` → `EU_AI_ACT`, `GDPR Art. 9(d) (political opinion data)` → `GDPR`, `EU AI Act Art. 5(1)(a)` → `EU_AI_ACT`, `EU GDPR Art. 9(d)` → `GDPR`, `GDPR Art. 6(1)(e) (public task)` → `GDPR`, `GDPR Art. 6(1)(e)` → `GDPR`, `EU AI Act Annex III §5/8` → `EU_AI_ACT`.
- None resolves only after replacing spaces and hyphens with `_`.
- 44 do not resolve to any `ComplianceFramework` id, so AMC has no built-in compliance map under those names.

Dated entries, where the register has them, are in [the regulatory calendar](../REGULATORY_CALENDAR.md), generated from `GLOBAL_FRAMEWORKS` [C18].

## Assurance packs

### Linked by the station registry

The station's `assurancePacks` field [C19] lists these packs. "Empty-response passes" counts scenarios whose validator passes an empty string; a nonzero count means the pack can pass without the agent producing anything.

| Pack | Title | Scenarios | Empty-response passes |
|---|---|---|---|
| `governanceNISTRMF` | Governance NIST AI RMF Pack | 5 | 0 |

### Registered but not linked

Registered packs [C20] whose title contains one of the station's registry framework strings verbatim, but which the registry does not link. This is a name match, not a recommendation.

| Pack | Title | Scenarios | Empty-response passes |
|---|---|---|---|
| `technologyGDPRSOC` | Technology GDPR/SOC2/ISO27001 Pack | 5 | 0 |
| `euAiActArticle` | EU AI Act Article-Level Assurance Pack | 6 | 0 |

### How each command grades

- `amc domain assurance --agent <id> --domain governance` [C21] runs the linked packs [C22] [C23], but validates every scenario against a fixed response string built into AMC [C24] [C25], not against anything the agent says. Its pass counts describe AMC's validators. They are not evidence about the agent.
- `amc assurance run --agent <id> --pack <packId>` sends each scenario prompt to the agent through its responder and grades the answer; see Evidence outputs below.

## Deployment controls

Nothing in source makes these controls station-specific: the native agent toolset registers the same guards for every agent, whatever its station [C26]. A guard can only deny, and the first guard that denies is the one reported [C27].

| Control | What the source does | Where |
|---|---|---|
| Prompt-injection guard | Refuses a tool call whose arguments match an injection pattern at block confidence. | [C28] [C29] |
| Runtime firewall | Evaluates each tool call's arguments. A workspace with no signed firewall policy blocks every call (mode `missing-policy`). | [C30] [C31] [C32] [C33] |
| Budgets | Native tool calls in EXECUTE mode reserve against the signed per-agent budget; with no signed budget for the agent the call is refused, and an exhausted daily tool budget refuses the action class. | [C34] [C35] [C36] [C37] [C38] |
| Budget status (advisory path) | `evaluateBudgetStatus` reports not-ok when the budgets file signature is invalid. It reports ok when the agent has no per-agent budget; the native admission path above does not. | [C39] [C40] [C41] |
| Network egress | A network tool call must name a URL whose host is on that tool's signed allowlist; an unlisted network tool is refused. | [C42] [C43] [C44] |
| Tool allowlist | Tools absent from the signed `tools.yaml` are denied when the config is deny-by-default; an unverifiable config denies every call. | [C45] [C46] [C47] [C48] |
| Sandbox | Native sandbox admission returns a permit only on Linux, for the `bash` tool at action class WRITE_HIGH; bubblewrap and macOS seatbelt backends exist; the Docker sandbox runs with `--network none` unless a network or gateway route is named. | [C49] [C50] [C51] [C52] [C53] [C54] |
| Lease | Bridge requests carry a signed lease, checked for signature, expiry, revocation, agent, workspace, scope (default `gateway:llm`), route and model. | [C55] [C56] [C57] [C58] [C59] [C60] [C61] [C62] [C63] |

None of these controls was executed to write this guide. The table records where each is implemented; the tests that exercise them live with their source.

## Evidence outputs

| Output | How it is produced | Where |
|---|---|---|
| Signed receipts | Receipts are minted for LLM requests and responses, tool actions and results, guard checks and accepted wire work, and verified against public keys. | [C64] [C65] [C66] |
| Tool-call evidence rows | The native toolset appends each tool call's evidence row to the workspace ledger. | [C67] |
| Assurance report | `amc assurance run --agent <id> --pack <packId>` runs a pack against the agent through its responder. | [C68] [C69] [C70] [C71] |
| Domain report | The domain report builder writes Markdown when given an output path. | [C72] [C73] |
| Compliance report | `amc compliance report --framework <id>` (alias `comply`) writes a Markdown or JSON report; the Markdown appendix states it is not legal advice. | [C74] [C75] [C76] |
| Audit binder | `amc audit binder create` produces a signed `.amcaudit` artifact. | [C77] [C78] [C79] |
| Enterprise audit export | Audit records export as Splunk, Datadog, CloudTrail, Azure, Elasticsearch or syslog payloads. `buildSignedAuditTrail`, despite its name, attaches an integrity hash and a chain hash over the records and no signature. | [C80] [C81] [C82] |

No output above was produced for this guide. Each row names the function that produces it.

## Known gaps at this commit

- The registry's `questionCount` for this station is 6; the station has 5 packs and 75 questions, so the field equals neither the pack count nor the question total. Use the counts in Sector packs.
- 44 of 57 framework strings do not resolve to a compliance-report framework (see Frameworks referenced).
- An industry pack records frameworks as plain strings, with no source URL, effective date or review date, so a pack cannot show whether its regulatory references are current.
- `amc domain assurance` grades a fixed response, not the agent (see Assurance packs).
- Pack scores from `amc domain pack run` are self-assessments (see Sector packs).

## Verification appendix

- Source commit: `726be0ca11e31224b2c93ae13a439f8cb2393e64`. Measured on Darwin arm64, Node v25.5.0, 2026-10-04.
- Exercised: reading source and running the commands below. Not exercised: no command in this guide was run against an agent, no control was executed, and no regulatory text was consulted.
- `pnpm vitest run tests/industryGuides.test.ts` re-derives every pack, question and scenario count in this guide from source, re-runs the empty-response check, and checks that every row below still points at a line containing its token.
- Pack counts by hand: `node_modules/.bin/tsx -e 'import {getIndustryPacksByStation} from "./src/domains/industryPacks.ts"; const p=getIndustryPacksByStation("governance"); console.log(p.length, p.reduce((n,x)=>n+x.questions.length,0))'`
- Empty-response passes by hand: `node_modules/.bin/tsx -e 'import {getAssurancePack} from "./src/assurance/packs/index.ts"; const c={agentId:"a",agentName:"a",role:"r",domain:"health",primaryTasks:["t"],stakeholders:["s"],riskTier:"high"}; const p=getAssurancePack("hipaaCompliance"); console.log(p.scenarios.filter(s=>s.validate("",s.buildPrompt(c),c).pass).length, p.scenarios.length)'` (substitute the pack id).

| ID | Claim | Source | Token on that line |
|---|---|---|---|
| C1 | Station entry in DOMAIN_REGISTRY | `src/domains/domainRegistry.ts:87` | `governance: {` |
| C2 | Station name | `src/domains/domainRegistry.ts:89` | `name: "Governance / Public Sector"` |
| C3 | Declared risk level | `src/domains/domainRegistry.ts:95` | `riskLevel: "very-high"` |
| C4 | Declared EU AI Act category | `src/domains/domainRegistry.ts:96` | `euAIActCategory: "high-risk"` |
| C5 | Declared questionCount field | `src/domains/domainRegistry.ts:97` | `questionCount: 6` |
| C6 | Declared recommended packs | `src/domains/domainRegistry.ts:93` | `recommendedIndustryPacks:` |
| C7 | Station pack lookup filters INDUSTRY_PACKS by stationId | `src/domains/industryPacks.ts:2490` | `export function getIndustryPacksByStation` |
| C8 | Sector pack run command | `src/cli-domain-product-commands.ts:215` | `Run an industry sector pack` |
| C9 | Pack run checks entitlement | `src/cli-domain-product-commands.ts:230` | `assertIndustryPackAccess(process.cwd());` |
| C10 | Baseline scores every question L1 | `src/cli-domain-product-commands.ts:247` | `Score all questions at L1` |
| C11 | Non-interactive runs default to L1 | `src/cli-domain-product-commands.ts:266` | `Non-interactive: default to L1 baseline` |
| C12 | Station regulatoryBasis | `src/domains/domainRegistry.ts:94` | `regulatoryBasis:` |
| C13 | Station complianceFrameworks | `src/domains/domainRegistry.ts:100` | `complianceFrameworks:` |
| C14 | IndustryPack carries regulatoryBasis as plain strings | `src/domains/industryPacks.ts:72` | `regulatoryBasis: string[];` |
| C15 | ComplianceFramework id union | `src/compliance/frameworks.ts:3` | `export type ComplianceFramework ` |
| C16 | Framework name resolution | `src/compliance/frameworks.ts:324` | `export function normalizeFrameworkName` |
| C17 | CLI rejects an unresolved framework name | `src/cli.ts:12628` | `Unsupported compliance framework` |
| C18 | Register the calendar is generated from | `src/compliance/globalRegulatory.ts:110` | `export const GLOBAL_FRAMEWORKS` |
| C19 | Station assurancePacks | `src/domains/domainRegistry.ts:98` | `assurancePacks:` |
| C20 | Assurance pack registry listing | `src/assurance/packs/index.ts:274` | `export function listAssurancePacks` |
| C21 | Domain assurance command | `src/cli-domain-product-commands.ts:507` | `Run domain-specific assurance packs` |
| C22 | Domain assurance runs the registry's packs | `src/domains/domainCliIntegration.ts:179` | `export function runDomainAssurance` |
| C23 | CLI calls runDomainAssurance | `src/cli-domain-product-commands.ts:517` | `runDomainAssurance(opts.agent, domain)` |
| C24 | Fixed built-in response text | `src/domains/domainCliIntegration.ts:102` | `const SAFE_ASSURANCE_RESPONSE` |
| C25 | Scenarios are validated against the fixed text | `src/domains/domainCliIntegration.ts:202` | `scenario.validate(SAFE_ASSURANCE_RESPONSE` |
| C26 | The native toolset registers the prompt-injection guard | `src/agent/agentToolset.ts:256` | `registry.guard("prompt-injection"` |
| C27 | Guards cannot allow; the first denial is named | `src/agent/agentToolset.ts:252` | `guards cannot allow` |
| C28 | Prompt-injection guard definition | `src/tools/guards/policyGuards.ts:195` | `export function promptInjectionGuard` |
| C29 | The guard matches at BLOCK_CONFIDENCE only | `src/tools/guards/policyGuards.ts:198` | `minConfidence: BLOCK_CONFIDENCE` |
| C30 | The native toolset registers the runtime-firewall guard | `src/agent/agentToolset.ts:257` | `registry.guard("runtime-firewall"` |
| C31 | Runtime firewall guard definition | `src/tools/guards/policyGuards.ts:36` | `export function runtimeFirewallGuard` |
| C32 | Firewall evaluation entry point | `src/runtime/firewall.ts:1054` | `export function evaluateRuntimeFirewall` |
| C33 | No policy yields mode missing-policy with action block | `src/runtime/firewall.ts:1106` | `mode = "missing-policy";` |
| C34 | The native toolset registers the budgets guard | `src/agent/agentToolset.ts:260` | `registry.guard("budgets"` |
| C35 | Budget guard definition | `src/tools/guards/policyGuards.ts:67` | `export function budgetGuard` |
| C36 | Native tool budget admission | `src/budgets/nativeBudgetAdmission.ts:73` | `export function reserveNativeToolBudget` |
| C37 | No signed budget refuses the native call | `src/budgets/nativeBudgetAdmission.ts:36` | `no signed budget applies to this native agent` |
| C38 | Exhausted daily tool budget refuses | `src/budgets/nativeBudgetAdmission.ts:42` | `daily tool budget exhausted` |
| C39 | Budget status function | `src/budgets/budgets.ts:206` | `export function evaluateBudgetStatus` |
| C40 | Invalid budgets signature is reported | `src/budgets/budgets.ts:219` | `budgets config signature invalid` |
| C41 | No per-agent budget returns ok | `src/budgets/budgets.ts:229` | `if (!budget) {` |
| C42 | The native toolset registers the network-egress guard | `src/agent/agentToolset.ts:261` | `registry.guard("network-egress"` |
| C43 | Network egress guard definition | `src/tools/guards/policyGuards.ts:151` | `export function networkEgressGuard` |
| C44 | Unlisted network tool is refused | `src/tools/guards/policyGuards.ts:174` | `so its egress is ungoverned` |
| C45 | The native toolset registers the tool-allowlist guard | `src/agent/agentToolset.ts:262` | `registry.guard("tool-allowlist"` |
| C46 | Tool allowlist guard definition | `src/tools/guards/policyGuards.ts:86` | `export function toolhubAllowlistGuard` |
| C47 | Unverifiable allowlist denies | `src/tools/guards/policyGuards.ts:100` | `An unverifiable allowlist is not an empty allowlist.` |
| C48 | Deny-by-default for unlisted tools | `src/tools/guards/policyGuards.ts:110` | `snapshot.config.tools.denyByDefault` |
| C49 | Native sandbox admission | `src/sandbox/nativeSandboxBinding.ts:33` | `export function admitNativeSandboxPolicy` |
| C50 | Admission requires Linux | `src/sandbox/nativeSandboxBinding.ts:38` | `process.platform !== "linux"` |
| C51 | bubblewrap backend | `src/sandbox/bwrapBackend.ts:106` | `export function bwrapBackend` |
| C52 | seatbelt backend | `src/sandbox/seatbeltBackend.ts:99` | `export function seatbeltBackend` |
| C53 | Docker sandbox argument builder | `src/sandbox/sandbox.ts:49` | `export function buildSandboxDockerArgs` |
| C54 | Docker sandbox default network none | `src/sandbox/sandbox.ts:64` | `args.push("--network", "none");` |
| C55 | Bridge lease check | `src/bridge/bridgeAuth.ts:181` | `export function verifyBridgeLease` |
| C56 | Lease verification | `src/leases/leaseVerifier.ts:40` | `export function verifyLeaseToken` |
| C57 | Bad signature refused | `src/leases/leaseVerifier.ts:53` | `signature verification failed` |
| C58 | Expired lease refused | `src/leases/leaseVerifier.ts:56` | `lease expired` |
| C59 | Revoked lease refused | `src/leases/leaseVerifier.ts:59` | `lease revoked` |
| C60 | Scope refused | `src/leases/leaseVerifier.ts:68` | `lease scope denied` |
| C61 | Route refused | `src/leases/leaseVerifier.ts:73` | `lease route denied` |
| C62 | Bridge auth verifies the lease | `src/bridge/bridgeAuth.ts:215` | `verifyLeaseToken({` |
| C63 | Bridge default scope is gateway:llm | `src/bridge/bridgeAuth.ts:220` | `requiredScope: params.requiredScope ?? "gateway:llm"` |
| C64 | Receipt kinds | `src/receipts/receipt.ts:5` | `export type ReceiptKind` |
| C65 | Receipt minting | `src/receipts/receipt.ts:50` | `export function mintReceipt` |
| C66 | Receipt verification | `src/receipts/receipt.ts:100` | `export function verifyReceipt` |
| C67 | Tool evidence is appended to the ledger | `src/agent/agentToolset.ts:239` | `ledgerHandle.appendEvidence` |
| C68 | CLI usage names --agent and --pack | `src/cli.ts:11051` | `amc assurance run --agent <id> --pack <packId>` |
| C69 | CLI calls runAssurance | `src/cli.ts:11096` | `report = await runAssurance({` |
| C70 | runAssurance definition | `src/assurance/assuranceRunner.ts:350` | `export async function runAssurance` |
| C71 | Each scenario prompt goes to the responder | `src/assurance/assuranceRunner.ts:438` | `await responder.respond(prompt)` |
| C72 | Domain report builder | `src/domains/domainCliIntegration.ts:159` | `export function buildDomainReportForAgent` |
| C73 | Domain report is written atomically | `src/domains/domainCliIntegration.ts:168` | `writeFileAtomic(params.outputPath` |
| C74 | compliance command and comply alias | `src/cli.ts:7049` | `program.command("compliance").alias("comply")` |
| C75 | Compliance report writer | `src/compliance/complianceReport.ts:127` | `export function writeComplianceReport` |
| C76 | Not-legal-advice line | `src/compliance/complianceReport.ts:100` | `This appendix is not legal advice.` |
| C77 | Binder create command | `src/cli.ts:17172` | `Create deterministic signed .amcaudit artifact` |
| C78 | Binder create implementation | `src/audit/auditCli.ts:92` | `export function auditBinderCreateCli` |
| C79 | Binder signing | `src/audit/binderSigner.ts:6` | `export function signBinderJson` |
| C80 | Export formats | `src/audit/enterpriseAuditExport.ts:7` | `export type EnterpriseAuditExportFormat` |
| C81 | Audit trail builder | `src/audit/enterpriseAuditExport.ts:383` | `export function buildSignedAuditTrail` |
| C82 | Audit trail integrity is a plain hash | `src/audit/enterpriseAuditExport.ts:385` | `const integrityHash = sha256Hex(JSON.stringify(sorted));` |
