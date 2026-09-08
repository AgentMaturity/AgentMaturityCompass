#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isolatedInstallEnvironment } from "./packed-install-check.mjs";

const nodeBin = dirname(process.execPath);

const personas = [
  {
    id: "solo-dev",
    name: "Solo Developer",
    agentId: "solo-dev-agent",
    fixture: "node-cli",
    checks: [["history", ["history", "--limit", "5"], "History command must exit successfully after the score command."]]
  },
  {
    id: "platform-engineer",
    name: "Platform Engineer",
    agentId: "platform-agent",
    fixture: "typescript-service",
    checks: [["resource-validate", ["resource", "validate", "--agent", "platform-agent", "--json"], "Resource guardrails validate"]]
  },
  {
    id: "security-lead",
    name: "Security Lead",
    agentId: "security-agent",
    fixture: "security-bot",
    checks: [["assurance-help", ["assurance", "--help"], "Assurance help command must exit successfully."]]
  },
  {
    id: "compliance-officer",
    name: "Compliance Officer",
    agentId: "compliance-agent",
    fixture: "governance-assistant",
    checks: [["comply-help", ["comply", "--help"], "Compliance help command must exit successfully."]]
  },
  {
    id: "ai-product-manager",
    name: "AI Product Manager",
    agentId: "product-agent",
    fixture: "product-copilot",
    checks: [["strategy-compare", ["strategy", "compare", "--file", "strategies.json", "--agent", "product-agent", "--json"], "Strategy comparison returns a recommendation"]]
  },
  {
    id: "qa-engineer",
    name: "QA Engineer",
    agentId: "qa-agent",
    fixture: "test-agent",
    checks: [["eval-help", ["eval", "--help"], "Eval help command must exit successfully."]]
  },
  {
    id: "devops-engineer",
    name: "DevOps Engineer",
    agentId: "devops-agent",
    fixture: "ci-agent",
    checks: [["ci-print", ["ci", "print"], "CI guidance prints without setup"]]
  },
  {
    id: "fleet-operator",
    name: "Fleet Operator",
    agentId: "fleet-agent",
    fixture: "multi-agent-system",
    checks: [
      ["fleet-graph-write", ["fleet", "graph", "write", "--file", "graph.json", "--json"], "Fleet graph writes"],
      ["fleet-graph-validate", ["fleet", "graph", "validate", "--json"], "Fleet graph validates"]
    ]
  },
  {
    id: "data-scientist",
    name: "Data Scientist",
    agentId: "data-agent",
    fixture: "eval-notebook-agent",
    checks: [["neutral-import", ["import", "import-data", "--agent", "data-agent", "--dry-run", "--json"], "Neutral importer detects local traces"]]
  },
  {
    id: "startup-founder",
    name: "Startup Founder",
    agentId: "founder-agent",
    fixture: "support-agent",
    checks: [["guide", ["guide"], "Improvement guide is available"]]
  }
];

export function createPersonaEnvironment(base, temporary) {
  // Packing and every persona get a different home, including npm config/cache.
  const home = mkdtempSync(join(temporary, "home-"));
  const isolated = isolatedInstallEnvironment(base, home);
  isolated.PATH = `${nodeBin}${delimiter}${base.PATH ?? ""}`;
  isolated.USERPROFILE = home;
  isolated.APPDATA = join(home, "AppData", "Roaming");
  isolated.LOCALAPPDATA = join(home, "AppData", "Local");
  isolated.XDG_CONFIG_HOME = join(home, ".config");
  isolated.XDG_CACHE_HOME = join(home, ".cache");
  isolated.XDG_DATA_HOME = join(home, ".local", "share");
  writeFileSync(isolated.npm_config_userconfig, "");
  writeFileSync(isolated.npm_config_globalconfig, "");
  return isolated;
}

function run(command, args, options) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    timeout: options.timeoutMs ?? 60_000
  });
  const stdout = result.stdout ?? "";
  const spawnError = result.error instanceof Error ? result.error.message : result.error ? String(result.error) : "";
  const stderr = [result.stderr ?? "", spawnError].filter(Boolean).join("\n");
  const step = {
    command: `${command} ${args.join(" ")}`,
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status,
    startedAt,
    endedAt: new Date().toISOString(),
    stdout: stdout.slice(-2500),
    stderr: stderr.slice(-2500)
  };
  Object.defineProperty(step, "rawStdout", { value: stdout, enumerable: false });
  Object.defineProperty(step, "rawStderr", { value: stderr, enumerable: false });
  return step;
}

function preserveRaw(source, target) {
  if ("rawStdout" in source) {
    Object.defineProperty(target, "rawStdout", { value: source.rawStdout, enumerable: false });
  }
  if ("rawStderr" in source) {
    Object.defineProperty(target, "rawStderr", { value: source.rawStderr, enumerable: false });
  }
  return target;
}

function requirePassed(step, remediation) {
  return preserveRaw(step, {
    ...step,
    remediation: step.status === "passed" ? null : remediation
  });
}

function parseJsonOutput(step) {
  try {
    return JSON.parse(step.rawStdout ?? step.stdout);
  } catch {
    return null;
  }
}

function writePersonaFixture(dir, persona) {
  writeFileSync(join(dir, "package.json"), `${JSON.stringify({
    name: `amc-${persona.id}-fixture`,
    private: true,
    type: "module",
    description: `${persona.name} local agent fixture`,
    amcFixture: { framework: persona.fixture },
    dependencies: {}
  }, null, 2)}\n`);
  mkdirSync(join(dir, "agents"), { recursive: true });
  writeFileSync(join(dir, "agents", `${persona.agentId}.json`), `${JSON.stringify({
    agentId: persona.agentId,
    persona: persona.name,
    fixture: persona.fixture,
    owner: "local-persona-qa",
    entrypoint: "local"
  }, null, 2)}\n`);
  writeFileSync(join(dir, "agent.js"), `export async function run(input) { return { ok: true, input }; }\n`);
  writeFileSync(join(dir, "strategies.json"), `${JSON.stringify([
    {
      strategyId: "local-safe",
      provider: "local",
      model: "small-safe",
      promptResourceVersion: "prompt-v1",
      temperature: 0.1,
      settings: { maxTokens: 512 },
      toolPolicy: "read-only",
      metrics: { score: 0.82, costUsd: 0.01, latencyMs: 420, risk: 0.08, confidence: 0.76 },
      evidenceRefs: ["episode-local", "eval-local"]
    },
    {
      strategyId: "remote-quality",
      provider: "remote",
      model: "large-reasoner",
      promptResourceVersion: "prompt-v1",
      temperature: 0.2,
      settings: { maxTokens: 2048 },
      toolPolicy: "read-only",
      metrics: { score: 0.9, costUsd: 0.18, latencyMs: 1500, risk: 0.16, confidence: 0.78 },
      evidenceRefs: ["episode-remote", "eval-remote"]
    }
  ], null, 2)}\n`);
  writeFileSync(join(dir, "graph.json"), `${JSON.stringify({
    schemaVersion: "2026-05-22",
    graphId: `${persona.id}-graph`,
    fleetId: "local-fleet",
    createdAt: new Date().toISOString(),
    maxFanOut: 3,
    nodes: [
      {
        nodeId: "orchestrator",
        agentId: `${persona.agentId}-orchestrator`,
        nodeType: "agent",
        role: "orchestrator",
        description: "Routes work to a specialist.",
        inputs: [{ name: "request", schema: "Request" }],
        outputs: [{ name: "ticket", schema: "Ticket" }],
        tools: [{ toolId: "router", permission: "WRITE_LOW", policyRefs: ["policy:routing"] }],
        memoryScopes: ["case-summary"],
        policyRefs: ["policy:routing"],
        permissions: ["READ_ONLY", "WRITE_LOW"]
      },
      {
        nodeId: "specialist",
        agentId: `${persona.agentId}-specialist`,
        nodeType: "agent",
        role: "specialist",
        description: "Handles routed work.",
        inputs: [{ name: "ticket", schema: "Ticket" }],
        outputs: [{ name: "resolution", schema: "Resolution" }],
        tools: [{ toolId: "kb-search", permission: "READ_ONLY", policyRefs: ["policy:kb"] }],
        memoryScopes: ["case-summary"],
        policyRefs: ["policy:kb"],
        permissions: ["READ_ONLY"]
      }
    ],
    edges: [
      {
        edgeId: "handoff",
        from: "orchestrator",
        to: "specialist",
        edgeType: "handoff",
        purpose: "Route a validated ticket.",
        contract: {
          inputSchema: "Ticket",
          outputSchema: "Resolution",
          requiredEvidence: ["signed-handoff"],
          approvalRequired: false
        },
        permissions: ["READ_ONLY"],
        failurePropagation: "degrade"
      }
    ],
    invariants: [
      { invariantId: "signed-handoffs", description: "Handoffs require evidence.", severity: "high", requiredEvidence: ["signed-handoff"] }
    ]
  }, null, 2)}\n`);
  mkdirSync(join(dir, "import-data"), { recursive: true });
  writeFileSync(join(dir, "import-data", "traces.jsonl"), [
    JSON.stringify({
      traceId: `${persona.id}-trace-1`,
      agentId: persona.agentId,
      input: "Summarize local policy",
      output: "Policy summary",
      durationMs: 40,
      timestamp: new Date().toISOString()
    }),
    JSON.stringify({
      event: "handoff",
      fromAgent: "orchestrator",
      toAgent: "specialist",
      traceId: `${persona.id}-handoff-1`,
      message: "telemetry-only handoff"
    })
  ].join("\n"));
}

function stepWithDuration(id, step, startedMs) {
  return preserveRaw(step, { id, ...step, durationMs: Date.now() - startedMs });
}

function installPackedPackage(dir, tarball, qaEnv, execute) {
  const install = execute("npm", ["install", "--no-audit", "--fund=false", "--package-lock=false", tarball], {
    cwd: dir, env: qaEnv, timeoutMs: 120_000
  });
  return preserveRaw(install, {
    ...install,
    command: `npm install --no-audit --fund=false --package-lock=false ${tarball}`,
    stdout: install.status === "passed"
      ? `${install.stdout}\nPacked tarball installed with npm in an isolated persona workspace.`.trim()
      : install.stdout
  });
}

function personaCommands(persona, amc) {
  return [
    ["version", [amc, "--version"], "Version command must exit successfully."],
    ["help", [amc, "--help"], "Help command must exit successfully."],
    ["full-score", [amc, "--agent", persona.agentId, "--json"], "Full-score command must exit successfully and return its JSON contract."],
    ["domain-packs", [amc, "domain", "pack", "list", "--json"], "Domain catalog JSON is required."],
    ["runtime-create", [amc, "runtime", "create", "--run", `${persona.id}-runtime`, "--agent", persona.agentId, "--json"], "Runtime creation command must exit successfully."],
    ...persona.checks.map(([id, args, remediation]) => [id, [amc, ...args], remediation])
  ];
}

function personaAssertions(persona) {
  return [
    ["amc-bin", "package-install"],
    ["full-score-contract", "full-score"],
    ["domain-pack-count", "domain-packs"],
    ...persona.checks.flatMap(([id]) => id === "strategy-compare" ? [["strategy-recommendation", id]]
      : id === "neutral-import" ? [["import-plan-ready", id]] : [])
  ];
}

function skippedCheck(id, reason, command) {
  return { id, status: "skipped", reason,
    ...(command ? { command, durationMs: null, exitCode: null, startedAt: null, endedAt: null, stdout: "", stderr: "" } : {}) };
}

function plannedPersona(persona, dir, reason) {
  const amc = join(dir, "node_modules", ".bin", "amc");
  return {
    persona, workspace: dir,
    steps: [skippedCheck("package-install", reason, "npm install <packed tarball>"),
      ...personaCommands(persona, amc).map(([id, args]) => skippedCheck(id, reason, args.join(" ")))],
    assertions: personaAssertions(persona).map(([id]) => skippedCheck(id, reason))
  };
}

function checkCounts(checks) {
  const passed = checks.filter((check) => check.status === "passed").length;
  const failed = checks.filter((check) => check.status === "failed").length;
  const skipped = checks.filter((check) => check.status === "skipped").length;
  return { planned: checks.length, executed: passed + failed, passed, failed, skipped };
}

function checkSummary(checks) {
  const counts = checkCounts(checks);
  const failed = checks.filter((check) => check.status === "failed").map((check) => check.id);
  const skipped = checks.filter((check) => check.status === "skipped").map((check) => check.id);
  return `${counts.passed}/${counts.planned} automated checks passed; ${counts.failed} failed; ${counts.skipped} skipped.`
    + (failed.length ? ` Failed: ${failed.join(", ")}.` : "")
    + (skipped.length ? ` Skipped: ${skipped.join(", ")}.` : "");
}

function duration(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateContract(id, value) {
  switch (id) {
    case "full-score-contract": {
      const sla = value?.firstResultSla;
      const valid = object(value) && value.ok === true && Number.isInteger(value.questionCount) && value.questionCount >= 240
        && duration(value.elapsedMs) !== null && object(sla) && duration(sla.elapsedMs) !== null
        && duration(sla.targetMs) !== null && sla.targetMs > 0 && sla.met === true
        && sla.elapsedMs === value.elapsedMs && sla.elapsedMs <= sla.targetMs;
      return { valid, details: valid ? `questions=${value.questionCount}; CLI-reported SLA met=true`
        : "Required full-score JSON, question count, or coherent CLI-reported elapsed/SLA evidence is missing or invalid." };
    }
    case "domain-pack-count": {
      const valid = object(value) && Array.isArray(value.packs) && value.packs.length >= 40;
      return { valid, details: Array.isArray(value?.packs) ? `packs=${value.packs.length}` : "Required packs array is missing or invalid." };
    }
    case "strategy-recommendation": {
      const recommended = value?.run?.recommendedStrategyId;
      const valid = object(value) && typeof recommended === "string" && recommended.trim().length > 0;
      return { valid, details: valid ? `recommended=${recommended}` : "Required run.recommendedStrategyId is missing or empty." };
    }
    case "import-plan-ready": {
      const valid = object(value) && value.plan?.status === "ready";
      return { valid, details: valid ? "plan.status=ready" : "Required plan.status=ready evidence is missing or invalid." };
    }
    default: throw new Error(`Unknown persona assertion: ${id}`);
  }
}

function finalizePersona(result) {
  const checks = [...result.steps, ...result.assertions];
  const counts = checkCounts(checks);
  const install = result.steps.find((step) => step.id === "package-install");
  const scoreStep = result.steps.find((step) => step.id === "full-score");
  const packsStep = result.steps.find((step) => step.id === "domain-packs");
  const score = scoreStep?.status === "passed" ? parseJsonOutput(scoreStep) : null;
  const packs = packsStep?.status === "passed" ? parseJsonOutput(packsStep) : null;
  return {
    ...result,
    status: counts.executed === 0 ? "skipped" : counts.passed === counts.planned ? "passed" : "failed",
    checkCounts: counts, summary: checkSummary(checks),
    measurements: {
      installWallMs: duration(install?.durationMs), scoreCommandWallMs: duration(scoreStep?.durationMs),
      cliReportedDiagnosticMs: duration(score?.elapsedMs),
      cliReportedSla: object(score?.firstResultSla) ? {
        targetMs: duration(score.firstResultSla.targetMs), elapsedMs: duration(score.firstResultSla.elapsedMs),
        met: typeof score.firstResultSla.met === "boolean" ? score.firstResultSla.met : null
      } : null
    },
    evidence: {
      questionCount: Number.isInteger(score?.questionCount) && score.questionCount >= 0 ? score.questionCount : null,
      domainPackCount: Array.isArray(packs?.packs) ? packs.packs.length : null,
      artifactStatus: typeof score?.artifactStatus === "string" ? score.artifactStatus : null,
      evidenceStatus: typeof score?.evidenceStatus === "string" ? score.evidenceStatus : null,
      claimEligible: typeof score?.claimEligible === "boolean" ? score.claimEligible : null
    }
  };
}

export function runPersona(persona, tarball, tmp, { baseEnv = process.env, execute = run } = {}) {
  const qaEnv = createPersonaEnvironment(baseEnv, tmp);
  const dir = join(tmp, "personas", persona.id);
  mkdirSync(dir, { recursive: true });
  writePersonaFixture(dir, persona);
  const result = plannedPersona(persona, dir, "package-install has not passed");
  const startedMs = Date.now();
  result.steps[0] = stepWithDuration("package-install", requirePassed(
    installPackedPackage(dir, tarball, qaEnv, execute), "Packed package installation failed."
  ), startedMs);
  // Even a failed install can leave a bin. Its consumers remain explicitly unrun.
  if (result.steps[0].status !== "passed") return finalizePersona(result);

  const amc = join(dir, "node_modules", ".bin", "amc");
  const binPresent = existsSync(amc);
  result.assertions[0] = { id: "amc-bin", status: binPresent ? "passed" : "failed",
    details: binPresent ? "Installed CLI bin is present." : "Installed CLI bin is missing." };
  if (result.assertions[0].status !== "passed") {
    result.steps = result.steps.map((step) => step.status === "skipped" ? skippedCheck(step.id, "amc-bin failed", step.command) : step);
    result.assertions = result.assertions.map((check) => check.status === "skipped" ? skippedCheck(check.id, "amc-bin failed") : check);
    return finalizePersona(result);
  }

  for (const [index, [id, args, remediation]] of personaCommands(persona, amc).entries()) {
    const started = Date.now();
    result.steps[index + 1] = stepWithDuration(id, requirePassed(
      execute(args[0], args.slice(1), { cwd: dir, env: qaEnv, timeoutMs: 60_000 }), remediation
    ), started);
  }
  for (const [index, [id, dependency]] of personaAssertions(persona).entries()) {
    if (id === "amc-bin") continue;
    const step = result.steps.find((entry) => entry.id === dependency);
    if (step?.status !== "passed") {
      result.assertions[index] = skippedCheck(id, `${dependency} did not pass`);
    } else {
      const { valid, details } = validateContract(id, parseJsonOutput(step));
      result.assertions[index] = { id, status: valid ? "passed" : "failed", details };
    }
  }
  return finalizePersona(result);
}

function markdownCell(value) {
  return String(value ?? "n/a").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

export function renderMarkdownReport(receipt) {
  const lines = [
    "# AMC Automated Installation Contract Report", "",
    `Schema: ${receipt.schemaVersion}`, `Status: ${receipt.status.toUpperCase()}`,
    `Summary: ${receipt.summary}`, `Started: ${receipt.startedAt}`, `Ended: ${receipt.endedAt}`,
    `Personas: ${receipt.personaCount}`, "", "## Automated installation contract checks", "",
    "| Persona | Status | Passed / planned checks | Failed | Skipped | Install wall ms | Score command wall ms | CLI-reported diagnostic ms | Score evidence status |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |"
  ];
  for (const result of receipt.results) {
    const counts = result.checkCounts;
    lines.push(`| ${[
      result.persona.name, result.status, `${counts.passed}/${counts.planned}`, counts.failed, counts.skipped,
      result.measurements.installWallMs, result.measurements.scoreCommandWallMs, result.measurements.cliReportedDiagnosticMs,
      result.evidence.evidenceStatus
    ].map(markdownCell).join(" | ")} |`);
  }
  lines.push("", "## Failed and skipped checks", "");
  const appendChecks = (label, checks) => {
    for (const check of checks.filter((entry) => entry.status !== "passed")) {
      lines.push(`- ${markdownCell(label)}: ${check.status} ${markdownCell(check.id)} — ${markdownCell(check.reason ?? check.details ?? check.remediation ?? check.stderr)}`);
    }
  };
  appendChecks("Setup", [...receipt.setupSteps, ...receipt.setupAssertions]);
  for (const result of receipt.results) appendChecks(result.persona.name, [...result.steps, ...result.assertions]);
  if ([...receipt.setupSteps, ...receipt.setupAssertions, ...receipt.results.flatMap((result) => [...result.steps, ...result.assertions])]
    .every((check) => check.status === "passed")) lines.push("- None.");
  lines.push("", "## Measurement scope", "", receipt.scope,
    "- Command wall times include the child invocation. CLI-reported diagnostic elapsed excludes later evidence writing and output.",
    "- Missing measurements are unavailable. CLI-reported SLA target, elapsed and met fields are retained in JSON.",
    "- A fresh INSUFFICIENT_EVIDENCE score can satisfy the output contract; accepted maturity claims require separate evidence.");
  return `${lines.join("\n")}\n`;
}

function main() {
  const root = process.cwd();
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const keep = args.includes("--keep");
  const outIndex = args.indexOf("--out");
  const outPath = outIndex >= 0 ? resolve(root, args[outIndex + 1]) : join(root, "tmp", "persona-install-qa", "latest.json");
  const reportIndex = args.indexOf("--report");
  const reportPath = reportIndex >= 0
    ? resolve(root, args[reportIndex + 1])
    : outPath.endsWith(".json")
      ? `${outPath.slice(0, -5)}.md`
      : `${outPath}.md`;

  if ((outIndex >= 0 && !args[outIndex + 1]) || (reportIndex >= 0 && !args[reportIndex + 1])) {
    throw new Error("--out and --report require file paths");
  }
  const tmp = mkdtempSync(join(tmpdir(), "amc-install-persona-qa-"));
  const qaEnv = createPersonaEnvironment(process.env, tmp);
  const startedAt = new Date().toISOString();
  const setupSteps = [];
  const setupAssertions = [];
  let tarball = null;

  try {
    const packStarted = Date.now();
    setupSteps.push(stepWithDuration("package-pack", requirePassed(
      run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", tmp], { cwd: root, env: qaEnv, timeoutMs: 120_000 }),
      "Could not pack the built AMC package."
    ), packStarted));
    if (setupSteps[0].status === "passed") {
      const packed = readdirSync(tmp).find((name) => name.endsWith(".tgz"));
      tarball = packed ? join(tmp, packed) : null;
    }
    const ready = setupSteps[0].status === "passed" && tarball !== null && existsSync(tarball);
    setupAssertions.push(setupSteps[0].status !== "passed"
      ? skippedCheck("package-tarball", "package-pack did not pass")
      : { id: "package-tarball", status: ready ? "passed" : "failed",
        details: ready ? "Packed tarball is present." : "npm pack did not produce an installable tarball." });
    const results = personas.map((persona) => ready ? runPersona(persona, tarball, tmp)
      : finalizePersona(plannedPersona(persona, join(tmp, "personas", persona.id), "Package setup did not pass")));
    const checks = results.flatMap((result) => [...result.steps, ...result.assertions]);
    const setupCheckCounts = checkCounts([...setupSteps, ...setupAssertions]);
    const counts = checkCounts(checks);
    const passed = setupCheckCounts.passed === setupCheckCounts.planned && results.every((result) => result.status === "passed");
    const receipt = {
      schemaVersion: "2026-09-08",
      receiptType: "install-persona-qa",
      measurementType: "automated-contract-checks",
      startedAt,
      endedAt: new Date().toISOString(),
      status: passed ? "passed" : "failed",
      summary: `${counts.passed}/${counts.planned} persona checks passed; ${counts.failed} failed; ${counts.skipped} skipped.`
        + ` Setup: ${setupCheckCounts.passed}/${setupCheckCounts.planned} checks passed; ${setupCheckCounts.failed} failed; ${setupCheckCounts.skipped} skipped.`,
      packageTarball: tarball,
      personaCount: personas.length,
      checkCounts: counts,
      setupCheckCounts,
      scope: "Automated command exit and declared JSON contract checks. Human usability, workflow quality and maturity qualification are outside this measurement.",
      reportPath,
      setupSteps,
      setupAssertions,
      results
    };
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`);
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, renderMarkdownReport(receipt), "utf8");
    if (json) {
      process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    } else {
      console.log(`${receipt.status.toUpperCase()} ${receipt.summary}`);
      console.log(`Receipt: ${outPath}`);
      console.log(`Report: ${reportPath}`);
      for (const result of results) {
        console.log(`- ${result.status.toUpperCase()} ${result.persona.name}: ${result.summary}`);
      }
    }
    if (receipt.status !== "passed") {
      process.exitCode = 1;
    }
  } finally {
    if (!keep) {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
