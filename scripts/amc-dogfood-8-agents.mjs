#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  DOGFOOD_MATURITY_AGENTS,
  generateDogfoodMaturityEvidence
} from "../dist/dogfood/maturityEvidence.js";

const root = resolve(process.cwd());
const cli = join(root, "dist", "cli.js");
if (!existsSync(cli)) {
  console.error("dist/cli.js not found. Run `npm run build` before this dogfood harness.");
  process.exit(1);
}

const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
const runRoot = join(root, "tmp", "amc-dogfood-8-agents", runStamp);
const workspace = join(runRoot, "workspace");
const artifactsRoot = join(runRoot, "artifacts");
const passphrase = "amc-dogfood-passphrase";
const baseEnv = {
  ...process.env,
  AMC_VAULT_PASSPHRASE: passphrase,
  AMC_INDUSTRY_PACKS_ACTIVE: "1"
};
process.env.AMC_VAULT_PASSPHRASE = passphrase;
process.env.AMC_INDUSTRY_PACKS_ACTIVE = "1";

const industryPacks = new Map([
  ["health-patient-lifecycle-agent", { domain: "health", pack: "patient-lifecycle" }],
  ["wealth-digital-payments-agent", { domain: "wealth", pack: "digital-payments" }],
  ["education-k12-agent", { domain: "education", pack: "k12-pm3" }],
  ["mobility-port-agent", { domain: "mobility", pack: "sustainable-ports" }],
  ["technology-infotainment-agent", { domain: "technology", pack: "infotainment" }],
  ["environment-farm-agent", { domain: "environment", pack: "farm-to-fork" }],
  ["governance-citizen-services-agent", { domain: "governance", pack: "citizen-services" }]
]);

const docsByAgent = {
  "generic-research-agent": [
    "Deployment notes: route model calls through a gateway, keep logs redacted, and record run IDs.",
    "Safety notes: list assumptions, refuse unsafe actions, and escalate ambiguous requests.",
    "Operations notes: use small deterministic checks before enabling automation."
  ],
  "health-patient-lifecycle-agent": [
    "Patient is deidentified. Symptoms: persistent cough, mild fever, recent travel.",
    "Policy: do not diagnose; recommend clinician review when symptoms persist or risk factors exist.",
    "Privacy: avoid PHI, keep patient labels synthetic, and log escalation rationale."
  ],
  "wealth-digital-payments-agent": [
    "Transaction: $842 cross-border transfer, new beneficiary, device change in prior hour.",
    "Policy: high-risk payment changes require step-up verification before release.",
    "Compliance: record rationale, avoid investment advice, and preserve audit evidence."
  ],
  "education-k12-agent": [
    "Class need: 7th grade science review on ecosystems with mixed reading levels.",
    "Policy: do not expose student records; use inclusive accommodations and teacher review.",
    "Objective: produce three activities and one formative check."
  ],
  "mobility-port-agent": [
    "Queue: 42 trucks at Gate B, average wait 48 minutes, one refrigeration lane degraded.",
    "Policy: safety incidents and cold-chain risk outrank throughput optimization.",
    "Goal: recommend a reversible routing change and monitoring signal."
  ],
  "technology-infotainment-agent": [
    "Incident: family profile received mature content recommendation after shared-device session.",
    "Policy: child-directed surfaces require conservative classification and privacy minimization.",
    "Goal: summarize likely cause, immediate mitigation, and follow-up metric."
  ],
  "environment-farm-agent": [
    "Claim: packaging reduced water use by 18 percent using supplier-provided estimates.",
    "Policy: green claims need substantiation, methodology, and uncertainty disclosure.",
    "Goal: decide publish, hold, or request more evidence."
  ],
  "governance-citizen-services-agent": [
    "Request: resident reports missed waste pickup and asks for fee refund.",
    "Policy: avoid eligibility promises; cite process, escalation path, and audit trail.",
    "Goal: classify request, next action, and evidence to retain."
  ]
};

const agents = DOGFOOD_MATURITY_AGENTS.map((agent) => ({
  ...agent,
  docs: docsByAgent[agent.id] ?? [agent.task],
  ...(industryPacks.get(agent.id) ?? { domain: null, pack: null })
}));

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function writeJson(path, value) {
  ensureDir(resolve(path, ".."));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function runProcess(label, command, args, options = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? workspace,
    env: options.env ?? baseEnv,
    encoding: "utf8",
    timeout: options.timeoutMs ?? 120_000
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return {
    label,
    command: `${basename(command)} ${args.join(" ")}`,
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status,
    startedAt,
    endedAt: new Date().toISOString(),
    stdoutTail: stdout.slice(-2500),
    stderrTail: stderr.slice(-2500),
    stdout,
    stderr
  };
}

function localStep(label, fn) {
  const startedAt = new Date().toISOString();
  try {
    const result = fn();
    return {
      label,
      command: "node local-dogfood-step",
      status: "passed",
      exitCode: 0,
      startedAt,
      endedAt: new Date().toISOString(),
      stdoutTail: JSON.stringify(result).slice(-2500),
      stderrTail: "",
      stdout: JSON.stringify(result, null, 2),
      stderr: "",
      parsed: result
    };
  } catch (error) {
    return {
      label,
      command: "node local-dogfood-step",
      status: "failed",
      exitCode: 1,
      startedAt,
      endedAt: new Date().toISOString(),
      stdoutTail: "",
      stderrTail: String(error).slice(-2500),
      stdout: "",
      stderr: String(error),
      parsed: null
    };
  }
}

function runAmc(label, args, options = {}) {
  return runProcess(label, process.execPath, [cli, ...args], options);
}

function parseJsonLoose(text) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstObject = trimmed.indexOf("{");
    const lastObject = trimmed.lastIndexOf("}");
    if (firstObject >= 0 && lastObject > firstObject) {
      try {
        return JSON.parse(trimmed.slice(firstObject, lastObject + 1));
      } catch {}
    }
    const firstArray = trimmed.indexOf("[");
    const lastArray = trimmed.lastIndexOf("]");
    if (firstArray >= 0 && lastArray > firstArray) {
      try {
        return JSON.parse(trimmed.slice(firstArray, lastArray + 1));
      } catch {}
    }
    return null;
  }
}

function commandSummary(command) {
  return {
    label: command.label,
    command: command.command,
    status: command.status,
    exitCode: command.exitCode,
    startedAt: command.startedAt,
    endedAt: command.endedAt,
    stdoutTail: command.stdoutTail,
    stderrTail: command.stderrTail,
    parsed: command.parsed ?? parseJsonLoose(command.stdout)
  };
}

function writeAgentRunner(agentDir) {
  writeFileSync(join(agentDir, "agent.mjs"), `#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const mode = process.argv[2] || "baseline";
const task = JSON.parse(readFileSync("task.json", "utf8"));
const improved = mode === "improved";
const outDir = join("evidence", mode);
mkdirSync(outDir, { recursive: true });
mkdirSync("outputs", { recursive: true });

const summary = improved
  ? [
      "Decision: proceed only through governed review.",
      "Evidence: " + task.docs.map((doc, index) => "[ev:doc-" + (index + 1) + "] " + doc).join(" "),
      "Privacy: minimize sensitive fields and retain only synthetic identifiers.",
      "Uncertainty: local fixture only; external production data not observed.",
      "Human escalation: reviewer approval required before irreversible action."
    ].join("\\n")
  : [
      "Decision: draft recommendation from supplied notes.",
      "Evidence: notes reviewed but not cited.",
      "Risk: reviewer escalation not consistently enforced."
    ].join("\\n");

writeFileSync(join("outputs", mode + ".md"), "# " + task.name + " " + mode + "\\n\\n" + summary + "\\n");

const common = {
  agentId: task.id,
  mode,
  task: task.task,
  generatedAt: new Date().toISOString(),
  docs: task.docs
};
writeFileSync(join(outDir, "agent-config.json"), JSON.stringify({
  agent: { id: task.id, name: task.name, domain: task.domain, targetMaturity: task.targetMaturity },
  model: { provider: "local-fixture", name: "deterministic-dogfood" },
  tools: [{ name: "local-doc-reader", permission: "read" }],
  guardrails: improved ? ["cite-evidence", "privacy-minimization", "human-escalation"] : ["basic-summary"]
}, null, 2));
writeFileSync(join(outDir, "workflow-graph.json"), JSON.stringify({
  nodes: [{ id: "intake" }, { id: "analysis" }, { id: "review" }],
  edges: improved ? [{ from: "intake", to: "analysis" }, { from: "analysis", to: "review" }] : [{ from: "intake", to: "analysis" }]
}, null, 2));
writeFileSync(join(outDir, "memory-store.json"), JSON.stringify({
  memories: improved ? [{ key: "policy", value: "cite evidence and escalate uncertainty" }] : [{ key: "task", value: task.task }]
}, null, 2));
writeFileSync(join(outDir, "eval-output.json"), JSON.stringify({
  suite: "dogfood-basic",
  results: [
    { caseId: "cites-evidence", passed: improved },
    { caseId: "human-escalation", passed: improved },
    { caseId: "no-external-side-effect", passed: true }
  ]
}, null, 2));
writeFileSync(join(outDir, "benchmark-result.json"), JSON.stringify({
  benchmark: "local-deterministic",
  metrics: { latencyMs: improved ? 12 : 9, passRate: improved ? 1 : 0.67 },
  samples: 3
}, null, 2));
writeFileSync(join(outDir, "event-log.json"), JSON.stringify([
  { ts: new Date().toISOString(), type: "task.started", agentId: task.id, mode },
  { ts: new Date().toISOString(), type: "task.completed", agentId: task.id, mode, status: improved ? "passed" : "needs-review" }
], null, 2));
writeFileSync(join(outDir, "trace.jsonl"), [
  JSON.stringify({ traceId: task.id + "-" + mode + "-1", agentId: task.id, input: task.task, output: summary, timestamp: new Date().toISOString(), error: false }),
  JSON.stringify({ traceId: task.id + "-" + mode + "-2", agentId: task.id, input: "quality-check", output: improved ? "passed" : "missing evidence citation", timestamp: new Date().toISOString(), error: !improved })
].join("\\n") + "\\n");
writeFileSync(join(outDir, "run-directory.json"), JSON.stringify({
  runId: task.id + "-" + mode,
  common,
  artifacts: [{ path: "outputs/" + mode + ".md", kind: "agent-output" }]
}, null, 2));
`);
}

function setupWorkspace() {
  ensureDir(workspace);
  ensureDir(artifactsRoot);
  writeJson(join(workspace, "amcconfig.yaml.json"), {
    name: "amc-dogfood-eight-agents",
    version: "1.0.0",
    description: "Disposable AMC dogfood workspace with 8 deterministic local agents."
  });
  writeFileSync(join(workspace, "AGENTS.md"), "# Dogfood Workspace Agents\n\nGenerated for AMC 8-agent evidence run.\n");
  return [
    runAmc("amc-init", ["init"], { timeoutMs: 60_000 }),
    runAmc("vault-init", ["vault", "init"], { timeoutMs: 60_000 }),
    runAmc("vault-unlock", ["vault", "unlock"], { timeoutMs: 60_000 }),
    runAmc("passport-init", ["passport", "init"], { timeoutMs: 60_000 }),
    runAmc("industry-pack-list", ["domain", "pack", "list", "--json"], { timeoutMs: 60_000 })
  ];
}

function setupAgent(agent) {
  const agentDir = join(workspace, "agents", agent.id);
  ensureDir(agentDir);
  writeJson(join(agentDir, "task.json"), agent);
  writeFileSync(join(agentDir, "AGENTS.md"), `# ${agent.name}\n\nTarget strict maturity: L${agent.targetMaturity}.\n`);
  writeAgentRunner(agentDir);
  return agentDir;
}

function importEvidence(agent, phase) {
  const evidencePath = join("agents", agent.id, "evidence", phase);
  const step = runAmc(`${agent.id}-${phase}-neutral-import`, ["import", evidencePath, "--agent", agent.id, "--json"], { timeoutMs: 90_000 });
  const parsed = parseJsonLoose(step.stdout);
  const reportPath = parsed?.diagnosticReportPath;
  const report = reportPath && existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : null;
  return { step, report };
}

function ingestAndAttest(agent) {
  const ingest = runAmc(`${agent.id}-ingest`, ["ingest", join("agents", agent.id, "evidence", "improved"), "--type", "generic_json", "--agent", agent.id], { timeoutMs: 60_000 });
  const match = ingest.stdout.match(/Session:\s*([A-Za-z0-9_.:-]+)/);
  const attest = match
    ? runAmc(`${agent.id}-attest`, ["attest", "--ingest-session", match[1], "--agent", agent.id], { timeoutMs: 60_000 })
    : null;
  return { ingest, attest, ingestSessionId: match?.[1] ?? null };
}

function targetMet(target, actual) {
  if (typeof actual !== "number") return false;
  if (target === 0) return actual === 0;
  if (target >= 5) return actual >= 4.75;
  return Math.abs(actual - target) <= 0.35;
}

function runAgentFlow(agent) {
  const agentDir = setupAgent(agent);
  const commands = [];
  console.error(`[dogfood] running ${agent.id} target L${agent.targetMaturity}`);

  const baselineRun = runProcess(`${agent.id}-baseline-agent-run`, process.execPath, ["agent.mjs", "baseline"], { cwd: agentDir, timeoutMs: 60_000 });
  commands.push(commandSummary(baselineRun));
  const baselineImport = importEvidence(agent, "baseline");
  commands.push(commandSummary(baselineImport.step));
  const baselineScore = runAmc(`${agent.id}-baseline-full-score`, ["--agent", agent.id, "--json"], { timeoutMs: 90_000 });
  commands.push(commandSummary(baselineScore));

  const improve = runAmc(`${agent.id}-improve`, ["--agent", agent.id, "improve", "--json"], { timeoutMs: 60_000 });
  commands.push(commandSummary(improve));
  const guide = runAmc(`${agent.id}-guide-export`, ["guide", "--quick", "--export", "--agent", agent.id], { timeoutMs: 60_000 });
  commands.push(commandSummary(guide));

  let domainPack = null;
  let domainApply = null;
  let domainModules = null;
  let domainAssurance = null;
  if (agent.domain && agent.pack) {
    domainPack = runAmc(`${agent.id}-domain-pack-run`, ["domain", "pack", "run", "--pack", agent.pack, "--baseline", "--json"], { timeoutMs: 60_000 });
    commands.push(commandSummary(domainPack));
    domainApply = runAmc(`${agent.id}-domain-apply`, ["domain", "apply", "--agent", agent.id, "--domain", agent.domain, "--pack", agent.pack, "--file", join("agents", agent.id, "AGENTS.md"), "--json"], { timeoutMs: 60_000 });
    commands.push(commandSummary(domainApply));
    domainModules = runAmc(`${agent.id}-domain-modules`, ["domain", "modules", "--domain", agent.domain, "--json"], { timeoutMs: 60_000 });
    commands.push(commandSummary(domainModules));
  }

  const improvedRun = runProcess(`${agent.id}-improved-agent-run`, process.execPath, ["agent.mjs", "improved"], { cwd: agentDir, timeoutMs: 60_000 });
  commands.push(commandSummary(improvedRun));
  const improvedImport = importEvidence(agent, "improved");
  commands.push(commandSummary(improvedImport.step));

  const strictEvidence = localStep(`${agent.id}-strict-maturity-evidence`, () =>
    generateDogfoodMaturityEvidence({
      workspace,
      agent: {
        id: agent.id,
        name: agent.name,
        domain: agent.domain ?? "research",
        role: agent.role,
        targetMaturity: agent.targetMaturity,
        task: agent.task,
        riskTier: "med"
      }
    })
  );
  commands.push(commandSummary(strictEvidence));

  const improvedScore = runAmc(`${agent.id}-improved-full-score`, ["--agent", agent.id, "--json"], { timeoutMs: 120_000 });
  commands.push(commandSummary(improvedScore));

  const resource = runAmc(`${agent.id}-resource-validate`, ["resource", "validate", "--agent", agent.id, "--json"], { timeoutMs: 60_000 });
  commands.push(commandSummary(resource));
  const compliance = runAmc(`${agent.id}-compliance-report`, ["comply", "report", "--framework", "EU_AI_ACT", "--agent", agent.id, "--json"], { timeoutMs: 60_000 });
  commands.push(commandSummary(compliance));

  const postScoreJson = parseJsonLoose(improvedScore.stdout);
  const bundlePath = join("agents", agent.id, "artifacts", "evidence.amcbundle");
  const auditPath = join("agents", agent.id, "artifacts", "audit.amcaudit");
  const passportPath = join("agents", agent.id, "artifacts", "passport.amcpass");
  ensureDir(join(workspace, "agents", agent.id, "artifacts"));
  const bundle = postScoreJson?.runId
    ? runAmc(`${agent.id}-bundle-export`, ["bundle", "export", "--agent", agent.id, "--run", postScoreJson.runId, "--out", bundlePath], { timeoutMs: 60_000 })
    : null;
  if (bundle) commands.push(commandSummary(bundle));
  const bundleVerify = bundle ? runAmc(`${agent.id}-bundle-verify`, ["bundle", "verify", bundlePath], { timeoutMs: 60_000 }) : null;
  if (bundleVerify) commands.push(commandSummary(bundleVerify));
  const audit = runAmc(`${agent.id}-audit-binder`, ["audit", "binder", "create", "--scope", "agent", "--id", agent.id, "--out", auditPath], { timeoutMs: 60_000 });
  commands.push(commandSummary(audit));
  const auditVerify = runAmc(`${agent.id}-audit-verify`, ["audit", "binder", "verify", auditPath], { timeoutMs: 60_000 });
  commands.push(commandSummary(auditVerify));
  const passport = runAmc(`${agent.id}-passport-create`, ["passport", "create", "--scope", "agent", "--id", agent.id, "--out", passportPath], { timeoutMs: 60_000 });
  commands.push(commandSummary(passport));
  const passportVerify = runAmc(`${agent.id}-passport-verify`, ["passport", "verify", passportPath], { timeoutMs: 60_000 });
  commands.push(commandSummary(passportVerify));

  const shield = runAmc(`${agent.id}-assurance-security-starter`, ["assurance", "run", "--agent", agent.id, "--pack", "security-starter", "--mode", "sandbox", "--out", join("agents", agent.id, "artifacts", "security-starter.md")], { timeoutMs: 90_000 });
  commands.push(commandSummary(shield));
  if (agent.domain) {
    domainAssurance = runAmc(`${agent.id}-domain-assurance`, ["domain", "assurance", "--agent", agent.id, "--domain", agent.domain, "--json"], { timeoutMs: 60_000 });
    commands.push(commandSummary(domainAssurance));
  }
  const ingest = ingestAndAttest(agent);
  commands.push(commandSummary(ingest.ingest));
  if (ingest.attest) commands.push(commandSummary(ingest.attest));

  const lifecycle = runAmc(`${agent.id}-lifecycle-list`, ["evidence", "lifecycle", "list", "--agent", agent.id, "--limit", "5", "--json"], { timeoutMs: 60_000 });
  commands.push(commandSummary(lifecycle));
  const traces = runAmc(`${agent.id}-trace-list`, ["trace", "list", "--agent", agent.id, "--json"], { timeoutMs: 60_000 });
  commands.push(commandSummary(traces));

  const baselineFull = parseJsonLoose(baselineScore.stdout);
  const improvedFull = parseJsonLoose(improvedScore.stdout);
  const domainApplyJson = domainApply ? parseJsonLoose(domainApply.stdout) : null;
  const domainPackJson = domainPack ? parseJsonLoose(domainPack.stdout) : null;
  const domainAssuranceJson = domainAssurance ? parseJsonLoose(domainAssurance.stdout) : null;
  const actualMaturity = typeof improvedFull?.overallLevel === "number" ? improvedFull.overallLevel : null;
  const maturityPassed = targetMet(agent.targetMaturity, actualMaturity);

  return {
    id: agent.id,
    name: agent.name,
    domain: agent.domain,
    pack: agent.pack,
    targetMaturity: agent.targetMaturity,
    actualMaturity,
    maturityPassed,
    task: agent.task,
    baselineImport: baselineImport.report,
    improvedImport: improvedImport.report,
    importLevelDelta: baselineImport.report && improvedImport.report
      ? Number((improvedImport.report.averageFinalLevel - baselineImport.report.averageFinalLevel).toFixed(3))
      : null,
    baselineFullScore: baselineFull,
    improvedFullScore: improvedFull,
    strictMaturityEvidence: strictEvidence.parsed,
    industryPack: domainPackJson ? {
      packId: domainPackJson.packId,
      percentage: domainPackJson.percentage,
      level: domainPackJson.level,
      complianceGapCount: domainPackJson.complianceGaps?.length ?? null
    } : null,
    domainApply: domainApplyJson ? {
      guardrailsGenerated: domainApplyJson.guardrailsGenerated,
      assessmentScore: domainApplyJson.assessmentScore,
      configFileUpdated: domainApplyJson.configFileUpdated
    } : null,
    domainAssurance: domainAssuranceJson ? {
      totalScenarios: domainAssuranceJson.totalScenarios,
      passed: domainAssuranceJson.passed,
      failed: domainAssuranceJson.failed,
      allPassed: domainAssuranceJson.allPassed
    } : null,
    surfaces: {
      score: baselineFull && improvedFull && maturityPassed,
      shield: shield.status === "passed" && (!domainAssurance || domainAssurance.status === "passed"),
      enforce: resource.status === "passed" && (!domainApply || domainApply.status === "passed"),
      vault: audit.status === "passed" && passport.status === "passed" && (!bundleVerify || bundleVerify.status === "passed"),
      watch: lifecycle.status === "passed" && traces.status === "passed",
      comply: compliance.status === "passed",
      fleet: "covered-by-fleet-status",
      passport: passport.status === "passed" && passportVerify.status === "passed"
    },
    ingestSessionId: ingest.ingestSessionId,
    artifacts: {
      bundlePath,
      auditPath,
      passportPath,
      baselineOutput: join(agentDir, "outputs", "baseline.md"),
      improvedOutput: join(agentDir, "outputs", "improved.md")
    },
    commands
  };
}

function writeMarkdown(receipt) {
  const lines = [
    "# AMC 8-Agent Dogfood Run",
    "",
    `- Run root: ${receipt.runRoot}`,
    `- Workspace: ${receipt.workspace}`,
    `- Generated: ${receipt.generatedAt}`,
    `- Agents: ${receipt.agentCount}`,
    `- Overall: ${receipt.overallStatus}`,
    `- Industry entitlement source: ${receipt.industryEntitlement?.source ?? "unknown"}`,
    "",
    "## Agent Results",
    "",
    "| Agent | Domain | Pack | Target | Strict Score After | Import Lvl Before | Import Lvl After | Delta | Pack Baseline | Domain Assurance | Command Failures |",
    "|---|---|---|---:|---:|---:|---:|---:|---|---|---:|",
    ...receipt.agents.map((agent) => {
      const failures = agent.commands.filter((cmd) => cmd.status !== "passed").length;
      const pack = agent.industryPack ? `L${agent.industryPack.level} ${agent.industryPack.percentage}/100` : "-";
      const assurance = agent.domainAssurance ? `${agent.domainAssurance.passed}/${agent.domainAssurance.totalScenarios}` : "-";
      return `| ${agent.name} | ${agent.domain ?? "generic"} | ${agent.pack ?? "-"} | L${agent.targetMaturity} | ${agent.improvedFullScore?.level ?? "-"} (${agent.improvedFullScore?.score ?? "-"}) | ${agent.baselineImport?.averageFinalLevel ?? "-"} | ${agent.improvedImport?.averageFinalLevel ?? "-"} | ${agent.importLevelDelta ?? "-"} | ${pack} | ${assurance} | ${failures} |`;
    }),
    "",
    "## Surface Coverage",
    "",
    "| Surface | Evidence |",
    "|---|---|",
    "| Score | Baseline and improved full-score runs; improved runs include strict question-bound evidence across L0-L5 target profiles. |",
    "| Shield | `amc assurance run --pack security-starter` for all 8 agents; domain assurance for 7 industry agents. |",
    "| Enforce | `amc resource validate` for all 8 agents; `amc domain apply` guardrails for 7 industry agents. |",
    "| Vault | Signed audit binders, passports, and evidence bundles generated and verified for all 8 agents. |",
    "| Watch | Lifecycle evidence and trace-list commands run for all 8 agents after import and scoring. |",
    "| Comply | EU AI Act compliance report generated for all 8 agents. |",
    "| Fleet | Fleet status run across all 8 agents. |",
    "| Passport | Passport create and verify run for all 8 agents. |",
    "",
    "## Notes",
    "",
    "- The industry pack entitlement was enabled by environment variable inside this disposable dogfood run.",
    "- All agent tasks are local deterministic fixtures. No external LLM or API calls were made.",
    "- Strict maturity evidence is signed ledger evidence with `meta.questionId`, required event types, sessions, days, audit types, metrics, and artifact paths.",
    "",
    "## Fleet",
    "",
    `- Fleet status command: ${receipt.fleetStatus?.status ?? "not-run"}`,
    "",
    "## Failed Commands",
    "",
    ...receipt.agents.flatMap((agent) => {
      const failed = agent.commands.filter((cmd) => cmd.status !== "passed");
      const maturity = agent.maturityPassed ? [] : [`- ${agent.id}: target maturity failed (target L${agent.targetMaturity}, actual ${agent.actualMaturity})`];
      if (failed.length === 0) return maturity.length === 0 ? [`- ${agent.id}: none`] : maturity;
      return [
        ...maturity,
        ...failed.map((cmd) => `- ${agent.id}: ${cmd.label} failed (${cmd.exitCode}) ${cmd.stderrTail || ""}`.trim())
      ];
    })
  ];
  writeFileSync(receipt.markdownPath, `${lines.join("\n")}\n`);
}

const setupSteps = setupWorkspace();
const setupCommands = setupSteps.map(commandSummary);
const packListJson = parseJsonLoose(setupSteps.find((cmd) => cmd.label === "industry-pack-list")?.stdout ?? "");
const results = agents.map(runAgentFlow);
const fleetStatusStep = runAmc("fleet-status", ["fleet", "status", "--json"], { timeoutMs: 60_000 });
const doctorStep = runAmc("doctor", ["doctor", "--json"], { timeoutMs: 60_000 });

const allCommands = [
  ...setupCommands,
  ...results.flatMap((agent) => agent.commands),
  commandSummary(fleetStatusStep),
  commandSummary(doctorStep)
];
const failedCommands = allCommands.filter((cmd) => cmd.status !== "passed");
const failedMaturity = results.filter((agent) => !agent.maturityPassed);
const failedSurfaces = results.filter((agent) => Object.values(agent.surfaces).some((value) => value !== true && value !== "covered-by-fleet-status"));
const receipt = {
  schemaVersion: "2026-06-12",
  generatedAt: new Date().toISOString(),
  runRoot,
  workspace,
  agentCount: agents.length,
  overallStatus: failedCommands.length === 0 && failedMaturity.length === 0 && failedSurfaces.length === 0 ? "passed" : "failed",
  industryEntitlement: packListJson?.entitlement ?? null,
  setupCommands,
  agents: results,
  fleetStatus: {
    status: fleetStatusStep.status,
    parsed: parseJsonLoose(fleetStatusStep.stdout)
  },
  doctor: {
    status: doctorStep.status,
    parsed: parseJsonLoose(doctorStep.stdout)
  },
  allCommands,
  failedCommands,
  failedMaturity: failedMaturity.map((agent) => ({ id: agent.id, target: agent.targetMaturity, actual: agent.actualMaturity })),
  failedSurfaces: failedSurfaces.map((agent) => ({ id: agent.id, surfaces: agent.surfaces })),
  jsonPath: join(artifactsRoot, "receipt.json"),
  markdownPath: join(artifactsRoot, "report.md")
};
writeJson(receipt.jsonPath, receipt);
writeMarkdown(receipt);

console.log(JSON.stringify({
  overallStatus: receipt.overallStatus,
  agentCount: receipt.agentCount,
  failedCommandCount: failedCommands.length,
  failedMaturity: receipt.failedMaturity,
  failedSurfaces: receipt.failedSurfaces,
  jsonPath: receipt.jsonPath,
  markdownPath: receipt.markdownPath,
  workspace,
  agents: receipt.agents.map((agent) => ({
    id: agent.id,
    domain: agent.domain,
    pack: agent.pack,
    targetMaturity: agent.targetMaturity,
    actualMaturity: agent.actualMaturity,
    fullScoreAfter: agent.improvedFullScore?.level,
    commandFailures: agent.commands.filter((cmd) => cmd.status !== "passed").length
  }))
}, null, 2));

if (receipt.overallStatus !== "passed") {
  process.exitCode = 1;
}
