// Derivation script for docs/industries/*.md. S10 drafted it in its scratchpad (uncommitted); I1 reran it against the merged source at 726be0ca. Reads source at cwd. Run from the repo root: node_modules/.bin/tsx <this file>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const W = process.cwd();
const { DOMAIN_REGISTRY } = await import(W + "/src/domains/domainRegistry.ts");
const { getIndustryPacksByStation, listIndustryPacks } = await import(W + "/src/domains/industryPacks.ts");
const { listAssurancePacks } = await import(W + "/src/assurance/packs/index.ts");
const { normalizeFrameworkName } = await import(W + "/src/compliance/frameworks.ts");

const COMMIT = "726be0ca11e31224b2c93ae13a439f8cb2393e64";
const ENV = "Darwin arm64, Node v25.5.0, 2026-10-04";
const ctx: any = { agentId: "a", agentName: "a", role: "r", domain: "health", primaryTasks: ["t"], stakeholders: ["s"], riskTier: "high" };
const emptyPasses = (p: any) => p.scenarios.filter((s: any) => s.validate("", s.buildPrompt(ctx), ctx).pass).length;
const registered = listAssurancePacks() as any[];
const byId = new Map(registered.map((p) => [p.id, p]));
const regLines = readFileSync(W + "/src/domains/domainRegistry.ts", "utf8").split("\n");
const lineOf = (file: string, token: string, from = 0) => {
  const ls = readFileSync(W + "/" + file, "utf8").split("\n");
  const i = ls.findIndex((l, n) => n >= from && l.includes(token));
  if (i < 0) throw new Error(`${file}: ${token} not found`);
  return i + 1;
};
const bt = (s: string) => "`" + s + "`";

class Cites {
  rows: { id: string; claim: string; file: string; line: number; token: string }[] = [];
  ref(claim: string, file: string, token: string, from = 0): string {
    const line = lineOf(file, token, from);
    const existing = this.rows.find((r) => r.file === file && r.line === line && r.token === token);
    if (existing) return `[${existing.id}]`;
    const id = `C${this.rows.length + 1}`;
    this.rows.push({ id, claim, file, line, token });
    return `[${id}]`;
  }
  table(): string[] {
    return ["| ID | Claim | Source | Token on that line |", "|---|---|---|---|",
      ...this.rows.map((r) => `| ${r.id} | ${r.claim} | \`${r.file}:${r.line}\` | \`${r.token}\` |`)];
  }
}

const F = {
  toolset: "src/agent/agentToolset.ts",
  guards: "src/tools/guards/policyGuards.ts",
  firewall: "src/runtime/firewall.ts",
  nativeBudget: "src/budgets/nativeBudgetAdmission.ts",
  budgets: "src/budgets/budgets.ts",
  sbBind: "src/sandbox/nativeSandboxBinding.ts",
  bwrap: "src/sandbox/bwrapBackend.ts",
  seatbelt: "src/sandbox/seatbeltBackend.ts",
  docker: "src/sandbox/sandbox.ts",
  leaseV: "src/leases/leaseVerifier.ts",
  bridgeAuth: "src/bridge/bridgeAuth.ts",
  receipt: "src/receipts/receipt.ts",
  runner: "src/assurance/assuranceRunner.ts",
  domainCli: "src/domains/domainCliIntegration.ts",
  cliDomain: "src/cli-domain-product-commands.ts",
  cli: "src/cli.ts",
  compReport: "src/compliance/complianceReport.ts",
  frameworks: "src/compliance/frameworks.ts",
  binderSigner: "src/audit/binderSigner.ts",
  auditCli: "src/audit/auditCli.ts",
  entExport: "src/audit/enterpriseAuditExport.ts",
  packs: "src/domains/industryPacks.ts",
  registry: "src/domains/domainRegistry.ts",
  apIndex: "src/assurance/packs/index.ts",
  globalReg: "src/compliance/globalRegulatory.ts",
};

function controlsSection(c: Cites): string[] {
  return [
    "## Deployment controls",
    "",
    `Nothing in source makes these controls station-specific: the native agent toolset registers the same guards for every agent, whatever its station ${c.ref("The native toolset registers the prompt-injection guard", F.toolset, 'registry.guard("prompt-injection"')}. A guard can only deny, and the first guard that denies is the one reported ${c.ref("Guards cannot allow; the first denial is named", F.toolset, "guards cannot allow")}.`,
    "",
    "| Control | What the source does | Where |",
    "|---|---|---|",
    `| Prompt-injection guard | Refuses a tool call whose arguments match an injection pattern at block confidence. | ${c.ref("Prompt-injection guard definition", F.guards, "export function promptInjectionGuard")} ${c.ref("The guard matches at BLOCK_CONFIDENCE only", F.guards, "minConfidence: BLOCK_CONFIDENCE")} |`,
    `| Runtime firewall | Evaluates each tool call's arguments. A workspace with no signed firewall policy blocks every call (mode \`missing-policy\`). | ${c.ref("The native toolset registers the runtime-firewall guard", F.toolset, 'registry.guard("runtime-firewall"')} ${c.ref("Runtime firewall guard definition", F.guards, "export function runtimeFirewallGuard")} ${c.ref("Firewall evaluation entry point", F.firewall, "export function evaluateRuntimeFirewall")} ${c.ref("No policy yields mode missing-policy with action block", F.firewall, 'mode = "missing-policy";')} |`,
    `| Budgets | Native tool calls in EXECUTE mode reserve against the signed per-agent budget; with no signed budget for the agent the call is refused, and an exhausted daily tool budget refuses the action class. | ${c.ref("The native toolset registers the budgets guard", F.toolset, 'registry.guard("budgets"')} ${c.ref("Budget guard definition", F.guards, "export function budgetGuard")} ${c.ref("Native tool budget admission", F.nativeBudget, "export function reserveNativeToolBudget")} ${c.ref("No signed budget refuses the native call", F.nativeBudget, "no signed budget applies to this native agent")} ${c.ref("Exhausted daily tool budget refuses", F.nativeBudget, "daily tool budget exhausted")} |`,
    `| Budget status (advisory path) | \`evaluateBudgetStatus\` reports not-ok when the budgets file signature is invalid. It reports ok when the agent has no per-agent budget; the native admission path above does not. | ${c.ref("Budget status function", F.budgets, "export function evaluateBudgetStatus")} ${c.ref("Invalid budgets signature is reported", F.budgets, "budgets config signature invalid")} ${c.ref("No per-agent budget returns ok", F.budgets, "if (!budget) {", lineOf(F.budgets, "export function evaluateBudgetStatus"))} |`,
    `| Network egress | A network tool call must name a URL whose host is on that tool's signed allowlist; an unlisted network tool is refused. | ${c.ref("The native toolset registers the network-egress guard", F.toolset, 'registry.guard("network-egress"')} ${c.ref("Network egress guard definition", F.guards, "export function networkEgressGuard")} ${c.ref("Unlisted network tool is refused", F.guards, "so its egress is ungoverned")} |`,
    `| Tool allowlist | Tools absent from the signed \`tools.yaml\` are denied when the config is deny-by-default; an unverifiable config denies every call. | ${c.ref("The native toolset registers the tool-allowlist guard", F.toolset, 'registry.guard("tool-allowlist"')} ${c.ref("Tool allowlist guard definition", F.guards, "export function toolhubAllowlistGuard")} ${c.ref("Unverifiable allowlist denies", F.guards, "An unverifiable allowlist is not an empty allowlist.")} ${c.ref("Deny-by-default for unlisted tools", F.guards, "snapshot.config.tools.denyByDefault")} |`,
    `| Sandbox | Native sandbox admission returns a permit only on Linux, for the \`bash\` tool at action class WRITE_HIGH; bubblewrap and macOS seatbelt backends exist; the Docker sandbox runs with \`--network none\` unless a network or gateway route is named. | ${c.ref("Native sandbox admission", F.sbBind, "export function admitNativeSandboxPolicy")} ${c.ref("Admission requires Linux", F.sbBind, 'process.platform !== "linux"')} ${c.ref("bubblewrap backend", F.bwrap, "export function bwrapBackend")} ${c.ref("seatbelt backend", F.seatbelt, "export function seatbeltBackend")} ${c.ref("Docker sandbox argument builder", F.docker, "export function buildSandboxDockerArgs")} ${c.ref("Docker sandbox default network none", F.docker, 'args.push("--network", "none");')} |`,
    `| Lease | Bridge requests carry a signed lease, checked for signature, expiry, revocation, agent, workspace, scope (default \`gateway:llm\`), route and model. | ${c.ref("Bridge lease check", F.bridgeAuth, "export function verifyBridgeLease")} ${c.ref("Lease verification", F.leaseV, "export function verifyLeaseToken")} ${c.ref("Bad signature refused", F.leaseV, "signature verification failed")} ${c.ref("Expired lease refused", F.leaseV, "lease expired")} ${c.ref("Revoked lease refused", F.leaseV, "lease revoked")} ${c.ref("Scope refused", F.leaseV, "lease scope denied")} ${c.ref("Route refused", F.leaseV, "lease route denied")} ${c.ref("Bridge auth verifies the lease", F.bridgeAuth, "verifyLeaseToken({")} ${c.ref("Bridge default scope is gateway:llm", F.bridgeAuth, 'requiredScope: params.requiredScope ?? "gateway:llm"')} |`,
    "",
    "None of these controls was executed to write this guide. The table records where each is implemented; the tests that exercise them live with their source.",
    ""
  ];
}

function evidenceSection(c: Cites): string[] {
  return [
    "## Evidence outputs",
    "",
    "| Output | How it is produced | Where |",
    "|---|---|---|",
    `| Signed receipts | Receipts are minted for LLM requests and responses, tool actions and results, guard checks and accepted wire work, and verified against public keys. | ${c.ref("Receipt kinds", F.receipt, "export type ReceiptKind")} ${c.ref("Receipt minting", F.receipt, "export function mintReceipt")} ${c.ref("Receipt verification", F.receipt, "export function verifyReceipt")} |`,
    `| Tool-call evidence rows | The native toolset appends each tool call's evidence row to the workspace ledger. | ${c.ref("Tool evidence is appended to the ledger", F.toolset, "ledgerHandle.appendEvidence")} |`,
    `| Assurance report | \`amc assurance run --agent <id> --pack <packId>\` runs a pack against the agent through its responder. | ${c.ref("CLI usage names --agent and --pack", F.cli, "amc assurance run --agent <id> --pack <packId>")} ${c.ref("CLI calls runAssurance", F.cli, "report = await runAssurance({")} ${c.ref("runAssurance definition", F.runner, "export async function runAssurance")} ${c.ref("Each scenario prompt goes to the responder", F.runner, "await responder.respond(prompt)")} |`,
    `| Domain report | The domain report builder writes Markdown when given an output path. | ${c.ref("Domain report builder", F.domainCli, "export function buildDomainReportForAgent")} ${c.ref("Domain report is written atomically", F.domainCli, "writeFileAtomic(params.outputPath")} |`,
    `| Compliance report | \`amc compliance report --framework <id>\` (alias \`comply\`) writes a Markdown or JSON report; the Markdown appendix states it is not legal advice. | ${c.ref("compliance command and comply alias", F.cli, 'program.command("compliance").alias("comply")')} ${c.ref("Compliance report writer", F.compReport, "export function writeComplianceReport")} ${c.ref("Not-legal-advice line", F.compReport, "This appendix is not legal advice.")} |`,
    `| Audit binder | \`amc audit binder create\` produces a signed \`.amcaudit\` artifact. | ${c.ref("Binder create command", F.cli, "Create deterministic signed .amcaudit artifact")} ${c.ref("Binder create implementation", F.auditCli, "export function auditBinderCreateCli")} ${c.ref("Binder signing", F.binderSigner, "export function signBinderJson")} |`,
    `| Enterprise audit export | Audit records export as Splunk, Datadog, CloudTrail, Azure, Elasticsearch or syslog payloads. \`buildSignedAuditTrail\`, despite its name, attaches an integrity hash and a chain hash over the records and no signature. | ${c.ref("Export formats", F.entExport, "export type EnterpriseAuditExportFormat")} ${c.ref("Audit trail builder", F.entExport, "export function buildSignedAuditTrail")} ${c.ref("Audit trail integrity is a plain hash", F.entExport, "const integrityHash = sha256Hex(JSON.stringify(sorted));")} |`,
    "",
    "No output above was produced for this guide. Each row names the function that produces it.",
    ""
  ];
}

function frameworkTargets(strings: string[]) {
  const direct: [string, string][] = [], underscored: [string, string][] = [], none: string[] = [];
  for (const s of strings) {
    const d = normalizeFrameworkName(s);
    if (d) { direct.push([s, d]); continue; }
    const u = normalizeFrameworkName(s.replace(/[\s-]+/g, "_"));
    if (u) underscored.push([s, u]); else none.push(s);
  }
  return { direct, underscored, none };
}

function stationGuide(station: string): { md: string; packs: number; questions: number } {
  const c = new Cites();
  const meta = DOMAIN_REGISTRY[station];
  const packs = getIndustryPacksByStation(station) as any[];
  const total = packs.reduce((n, p) => n + p.questions.length, 0);
  const from = regLines.findIndex((l) => l === `  ${station}: {`);
  const R = (claim: string, token: string) => c.ref(claim, F.registry, token, from);
  const L: string[] = [];
  L.push(`# ${meta.name} station: regulated deployment guide`, "");
  L.push(`This guide maps what AMC source provides for an agent deployed in the \`${station}\` station: its sector packs, the frameworks those packs name, the assurance packs, the deployment controls and the evidence AMC can produce. It describes source at commit \`${COMMIT.slice(0, 8)}\`. Every count was derived from source by the commands in the verification appendix, and every source location is listed there and checked by \`tests/industryGuides.test.ts\`.`, "");
  L.push("It does not say what any regulation requires, and it is not legal advice. Framework names below are strings that appear in AMC source; their presence means a pack refers to them, not that AMC satisfies them.", "");

  L.push("## Station metadata", "", "| Field | Value (as declared in source) | Where |", "|---|---|---|");
  L.push(`| Station id | \`${station}\` | ${R("Station entry in DOMAIN_REGISTRY", `${station}: {`)} |`);
  L.push(`| Name | ${meta.name} | ${R("Station name", `name: "${meta.name}"`)} |`);
  L.push(`| Risk level | ${meta.riskLevel} | ${R("Declared risk level", `riskLevel: "${meta.riskLevel}"`)} |`);
  L.push(`| EU AI Act category | ${meta.euAIActCategory} | ${R("Declared EU AI Act category", `euAIActCategory: "${meta.euAIActCategory}"`)} |`);
  L.push(`| \`questionCount\` field | ${meta.questionCount} | ${R("Declared questionCount field", `questionCount: ${meta.questionCount}`)} |`);
  L.push(`| Recommended industry packs | ${meta.recommendedIndustryPacks.map(bt).join(", ")} | ${R("Declared recommended packs", "recommendedIndustryPacks:")} |`);
  L.push("", `The EU AI Act category and risk level are labels in AMC's registry, not a legal classification of any particular agent.`, "");

  L.push("## Sector packs", "");
  L.push(`Packs whose \`stationId\` is \`${station}\`, as returned by \`getIndustryPacksByStation\` ${c.ref("Station pack lookup filters INDUSTRY_PACKS by stationId", F.packs, "export function getIndustryPacksByStation")}.`, "");
  L.push("| Pack | Name | Questions | Risk tier | Certification threshold |", "|---|---|---|---|---|");
  for (const p of packs) L.push(`| \`${p.id}\` | ${p.name} | ${p.questions.length} | ${p.riskTier} | ${p.certificationThreshold} |`);
  L.push("", `Total: ${packs.length} packs, ${total} questions.`, "");
  L.push(`Run one with \`amc domain pack run --pack <id>\` ${c.ref("Sector pack run command", F.cliDomain, "Run an industry sector pack")}. The command requires the industry-pack entitlement ${c.ref("Pack run checks entitlement", F.cliDomain, "assertIndustryPackAccess(process.cwd());", lineOf(F.cliDomain, "Run an industry sector pack"))}. Its score comes from levels the operator picks per question (L1, L3 or L5); with \`--baseline\`, or without a terminal, every question is scored L1 ${c.ref("Baseline scores every question L1", F.cliDomain, "Score all questions at L1")} ${c.ref("Non-interactive runs default to L1", F.cliDomain, "Non-interactive: default to L1 baseline")}. A pack score is therefore a self-assessment, not an observation of the agent.`, "");

  const packStrings = [...new Set(packs.flatMap((p) => [...p.regulatoryBasis, ...p.complianceFrameworks]))] as string[];
  const allStrings = [...new Set([...meta.regulatoryBasis, ...meta.complianceFrameworks, ...packStrings])] as string[];
  const t = frameworkTargets(allStrings);
  L.push("## Frameworks referenced", "");
  L.push(`- Station \`regulatoryBasis\` ${R("Station regulatoryBasis", "regulatoryBasis:")}: ${meta.regulatoryBasis.map(bt).join(", ")}.`);
  L.push(`- Station \`complianceFrameworks\` ${R("Station complianceFrameworks", "complianceFrameworks:")}: ${meta.complianceFrameworks.map(bt).join(", ")}.`);
  L.push(`- The station's packs name ${packStrings.length} distinct framework strings in their \`regulatoryBasis\` and \`complianceFrameworks\` fields ${c.ref("IndustryPack carries regulatoryBasis as plain strings", F.packs, "regulatoryBasis: string[];", lineOf(F.packs, "export interface IndustryPack {"))}: ${packStrings.map(bt).join(", ")}.`, "");
  L.push(`\`amc compliance report --framework <id>\` accepts the ids of \`ComplianceFramework\` ${c.ref("ComplianceFramework id union", F.frameworks, "export type ComplianceFramework ")}, resolved by \`normalizeFrameworkName\` ${c.ref("Framework name resolution", F.frameworks, "export function normalizeFrameworkName")}; an unresolved name is rejected ${c.ref("CLI rejects an unresolved framework name", F.cli, "Unsupported compliance framework")}. Of the ${allStrings.length} framework strings above (station and packs together):`, "");
  const verb = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const pairs = (xs: [string, string][]) => xs.map(([s, d]) => `${bt(s)} → \`${d}\``).join(", ");
  L.push(t.direct.length ? `- ${verb(t.direct.length, "resolves", "resolve")} as written: ${pairs(t.direct)}.` : "- None resolves as written.");
  L.push(t.underscored.length ? `- ${verb(t.underscored.length, "resolves", "resolve")} only after spaces and hyphens are replaced with \`_\`: ${pairs(t.underscored)}. Given as written, the CLI rejects ${t.underscored.length === 1 ? "it" : "them"}.` : "- None resolves only after replacing spaces and hyphens with `_`.");
  L.push(`- ${verb(t.none.length, "does", "do")} not resolve to any \`ComplianceFramework\` id, so AMC has no built-in compliance map under ${t.none.length === 1 ? "that name" : "those names"}.`, "");
  L.push(`Dated entries, where the register has them, are in [the regulatory calendar](../REGULATORY_CALENDAR.md), generated from \`GLOBAL_FRAMEWORKS\` ${c.ref("Register the calendar is generated from", F.globalReg, "export const GLOBAL_FRAMEWORKS")}.`, "");

  L.push("## Assurance packs", "", "### Linked by the station registry", "");
  L.push(`The station's \`assurancePacks\` field ${R("Station assurancePacks", "assurancePacks:")} lists these packs. "Empty-response passes" counts scenarios whose validator passes an empty string; a nonzero count means the pack can pass without the agent producing anything.`, "");
  L.push("| Pack | Title | Scenarios | Empty-response passes |", "|---|---|---|---|");
  for (const id of meta.assurancePacks) { const p = byId.get(id); L.push(`| \`${id}\` | ${p.title} | ${p.scenarios.length} | ${emptyPasses(p)} |`); }
  L.push("", "### Registered but not linked", "");
  const regStrings = [...meta.regulatoryBasis, ...meta.complianceFrameworks];
  const named = registered.filter((p) => !meta.assurancePacks.includes(p.id) && regStrings.some((s: string) => p.title.includes(s)));
  L.push(`Registered packs ${c.ref("Assurance pack registry listing", F.apIndex, "export function listAssurancePacks")} whose title contains one of the station's registry framework strings verbatim, but which the registry does not link. This is a name match, not a recommendation.`, "");
  if (named.length) {
    L.push("| Pack | Title | Scenarios | Empty-response passes |", "|---|---|---|---|");
    for (const p of named) L.push(`| \`${p.id}\` | ${p.title} | ${p.scenarios.length} | ${emptyPasses(p)} |`);
  } else L.push("None at this commit under that rule.");
  L.push("", "### How each command grades", "");
  L.push(`- \`amc domain assurance --agent <id> --domain ${station}\` ${c.ref("Domain assurance command", F.cliDomain, "Run domain-specific assurance packs")} runs the linked packs ${c.ref("Domain assurance runs the registry's packs", F.domainCli, "export function runDomainAssurance")} ${c.ref("CLI calls runDomainAssurance", F.cliDomain, "runDomainAssurance(opts.agent, domain)")}, but validates every scenario against a fixed response string built into AMC ${c.ref("Fixed built-in response text", F.domainCli, "const SAFE_ASSURANCE_RESPONSE")} ${c.ref("Scenarios are validated against the fixed text", F.domainCli, "scenario.validate(SAFE_ASSURANCE_RESPONSE")}, not against anything the agent says. Its pass counts describe AMC's validators. They are not evidence about the agent.`);
  L.push(`- \`amc assurance run --agent <id> --pack <packId>\` sends each scenario prompt to the agent through its responder and grades the answer; see Evidence outputs below.`, "");

  L.push(...controlsSection(c));
  L.push(...evidenceSection(c));

  L.push("## Known gaps at this commit", "");
  const qc = meta.questionCount === total ? "equals the question total" : meta.questionCount === packs.length ? "equals the pack count, not the question total" : "equals neither the pack count nor the question total";
  L.push(`- The registry's \`questionCount\` for this station is ${meta.questionCount}; the station has ${packs.length} packs and ${total} questions, so the field ${qc}. Use the counts in Sector packs.`);
  L.push(`- ${t.none.length} of ${allStrings.length} framework strings do not resolve to a compliance-report framework (see Frameworks referenced).`);
  L.push(`- An industry pack records frameworks as plain strings, with no source URL, effective date or review date, so a pack cannot show whether its regulatory references are current.`);
  L.push("- `amc domain assurance` grades a fixed response, not the agent (see Assurance packs).");
  const leaky = [...meta.assurancePacks.map((id: string) => byId.get(id)), ...named].filter((p) => emptyPasses(p) > 0);
  if (leaky.length) L.push(`- ${leaky.map((p) => `\`${p.id}\` passes ${emptyPasses(p)} of ${p.scenarios.length} scenarios on an empty response`).join("; ")}. A pass from that pack is not evidence until its validators require positive content.`);
  L.push("- Pack scores from `amc domain pack run` are self-assessments (see Sector packs).", "");

  L.push(...appendix(c, station));
  return { md: L.join("\n").trimEnd() + "\n", packs: packs.length, questions: total };
}

function appendix(c: Cites, station?: string): string[] {
  return [
    "## Verification appendix",
    "",
    `- Source commit: \`${COMMIT}\`. Measured on ${ENV}.`,
    "- Exercised: reading source and running the commands below. Not exercised: no command in this guide was run against an agent, no control was executed, and no regulatory text was consulted.",
    "- `pnpm vitest run tests/industryGuides.test.ts` re-derives every pack, question and scenario count in this guide from source, re-runs the empty-response check, and checks that every row below still points at a line containing its token.",
    station
      ? `- Pack counts by hand: \`node_modules/.bin/tsx -e 'import {getIndustryPacksByStation} from "./src/domains/industryPacks.ts"; const p=getIndustryPacksByStation("${station}"); console.log(p.length, p.reduce((n,x)=>n+x.questions.length,0))'\``
      : `- Pack counts by hand: \`node_modules/.bin/tsx -e 'import {listIndustryPacks} from "./src/domains/industryPacks.ts"; const p=listIndustryPacks(); console.log(p.length, p.reduce((n,x)=>n+x.questions.length,0))'\``,
    "- Empty-response passes by hand: `node_modules/.bin/tsx -e 'import {getAssurancePack} from \"./src/assurance/packs/index.ts\"; const c={agentId:\"a\",agentName:\"a\",role:\"r\",domain:\"health\",primaryTasks:[\"t\"],stakeholders:[\"s\"],riskTier:\"high\"}; const p=getAssurancePack(\"hipaaCompliance\"); console.log(p.scenarios.filter(s=>s.validate(\"\",s.buildPrompt(c),c).pass).length, p.scenarios.length)'` (substitute the pack id).",
    "",
    ...c.table(),
    ""
  ];
}

function readme(totals: Record<string, { packs: number; questions: number }>): string {
  const c = new Cites();
  const all = listIndustryPacks() as any[];
  const L: string[] = [];
  L.push("# Regulated-industry deployment guides", "");
  L.push(`One guide per AMC station. Each maps the station's sector packs to the frameworks they name, the assurance packs linked to the station, the deployment controls and the evidence outputs, for source at commit \`${COMMIT.slice(0, 8)}\`. These guides are not legal advice and do not state what any regulation requires.`, "");
  L.push("## Stations", "");
  L.push(`Stations are the keys of \`DOMAIN_REGISTRY\` ${c.ref("Station registry", F.registry, "export const DOMAIN_REGISTRY")}; packs are grouped by \`stationId\` ${c.ref("Station pack lookup", F.packs, "export function getIndustryPacksByStation")}.`, "");
  L.push("| Station | Guide | Packs | Questions |", "|---|---|---|---|");
  for (const s of Object.keys(DOMAIN_REGISTRY)) L.push(`| \`${s}\` | [${DOMAIN_REGISTRY[s].name}](${s}.md) | ${totals[s].packs} | ${totals[s].questions} |`);
  L.push("", `Total: ${all.length} packs, ${all.reduce((n, p) => n + p.questions.length, 0)} questions.`, "");
  L.push("## How these guides stay true", "");
  L.push("- Nothing in the repository regenerates these guides. `tests/industryGuides.test.ts` re-derives every pack, question and scenario count from source and fails on any difference.");
  L.push("- Every source location sits in a guide's verification appendix as `file:line` plus a token. The same test opens the file and fails if that line no longer contains the token, printing where the token is now.");
  L.push(`- [The regulatory calendar](../REGULATORY_CALENDAR.md) is generated from \`GLOBAL_FRAMEWORKS\` ${c.ref("Calendar register", F.globalReg, "export const GLOBAL_FRAMEWORKS")} by \`node scripts/gen-regulatory-calendar.mjs\`; \`--check\` fails when the page and the register disagree.`, "");
  L.push("## Shared caveats", "");
  L.push(`- Deployment controls and evidence outputs do not vary by station in source; each guide repeats them so it stands alone.`);
  L.push(`- \`amc domain assurance\` validates scenarios against a fixed built-in response ${c.ref("Scenarios are validated against the fixed text", F.domainCli, "scenario.validate(SAFE_ASSURANCE_RESPONSE")}; use \`amc assurance run --agent <id> --pack <packId>\` to grade the agent ${c.ref("Each scenario prompt goes to the responder", F.runner, "await responder.respond(prompt)")}.`);
  L.push("", ...appendix(c));
  return L.join("\n").trimEnd() + "\n";
}

mkdirSync(W + "/docs/industries", { recursive: true });
const totals: Record<string, { packs: number; questions: number }> = {};
for (const s of Object.keys(DOMAIN_REGISTRY)) {
  const g = stationGuide(s);
  totals[s] = { packs: g.packs, questions: g.questions };
  writeFileSync(`${W}/docs/industries/${s}.md`, g.md);
}
writeFileSync(`${W}/docs/industries/README.md`, readme(totals));
console.log(JSON.stringify(totals));
