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
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

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
const nodeBin = dirname(process.execPath);

if ((outIndex >= 0 && !args[outIndex + 1]) || (reportIndex >= 0 && !args[reportIndex + 1])) {
  throw new Error("--out and --report require file paths");
}

const personas = [
  {
    id: "solo-dev",
    name: "Solo Developer",
    agentId: "solo-dev-agent",
    fixture: "node-cli",
    checks: [["history", ["history", "--limit", "5"], "Run history is readable after first score"]]
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
    checks: [["assurance-help", ["assurance", "--help"], "Assurance commands are discoverable"]]
  },
  {
    id: "compliance-officer",
    name: "Compliance Officer",
    agentId: "compliance-agent",
    fixture: "governance-assistant",
    checks: [["comply-help", ["comply", "--help"], "Compliance commands are discoverable"]]
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
    checks: [["eval-help", ["eval", "--help"], "Eval commands are discoverable"]]
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

function env(tmp) {
  const npmCache = join(tmp, "npm-cache");
  return {
    ...process.env,
    PATH: `${nodeBin}:${process.env.PATH ?? ""}`,
    npm_config_cache: npmCache,
    NPM_CONFIG_CACHE: npmCache
  };
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

function personaFeedback(persona, steps, fullScore) {
  const failed = steps.filter((step) => step.status !== "passed");
  const install = steps.find((step) => step.id === "package-install");
  const elapsed = fullScore?.elapsedMs ?? null;
  if (failed.length > 0) {
    return `${persona.name}: blocked by ${failed.map((step) => step.id).join(", ")}.`;
  }
  const speed = typeof elapsed === "number" && elapsed < 2000 ? "fast first score" : "acceptable first score";
  const installNote = install?.durationMs && install.durationMs > 45_000 ? "install was slower than ideal" : "install was straightforward";
  return `${persona.name}: ${installNote}; ${speed}; role-specific command worked.`;
}

function stepWithDuration(id, step, startedMs) {
  return preserveRaw(step, {
    id,
    ...step,
    durationMs: Date.now() - startedMs
  });
}

function installPackedPackage(dir, tarball, qaEnv) {
  const install = run("npm", ["install", "--no-audit", "--fund=false", "--package-lock=false", tarball], {
    cwd: dir,
    env: qaEnv,
    timeoutMs: 120_000
  });
  return preserveRaw(install, {
    ...install,
    command: `npm install --no-audit --fund=false --package-lock=false ${tarball}`,
    stdout: install.status === "passed"
      ? `${install.stdout}\nPacked tarball installed with npm in an isolated persona workspace.`.trim()
      : install.stdout
  });
}

function runPersona(persona, tarball, tmp, qaEnv) {
  const dir = join(tmp, "personas", persona.id);
  mkdirSync(dir, { recursive: true });
  writePersonaFixture(dir, persona);
  const steps = [];

  let t0 = Date.now();
  steps.push(stepWithDuration("package-install", requirePassed(
    installPackedPackage(dir, tarball, qaEnv),
    "Packed package extraction or dependency linking failed."
  ), t0));

  const amc = join(dir, "node_modules", ".bin", "amc");
  if (!existsSync(amc)) {
    steps.push({
      id: "amc-bin",
      command: amc,
      status: "failed",
      exitCode: 1,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: 0,
      stdout: "",
      stderr: "amc bin missing after install",
      remediation: "Ensure package.json bin points to a packed executable."
    });
    return { persona, workspace: dir, steps, rating: 0, feedback: `${persona.name}: install did not expose amc.` };
  }

  const commonCommands = [
    ["version", [amc, "--version"], "Version prints."],
    ["help", [amc, "--help"], "Help prints."],
    ["full-score", [amc, "--agent", persona.agentId, "--json"], "One-command full score returns JSON."],
    ["domain-packs", [amc, "domain", "pack", "list", "--json"], "Domain pack catalog lists 40 packs."],
    ["runtime-create", [amc, "runtime", "create", "--run", `${persona.id}-runtime`, "--agent", persona.agentId, "--json"], "Runtime run manager works."]
  ];

  for (const [id, commandArgs, remediation] of commonCommands) {
    t0 = Date.now();
    steps.push(stepWithDuration(id, requirePassed(
      run(commandArgs[0], commandArgs.slice(1), { cwd: dir, env: qaEnv, timeoutMs: 60_000 }),
      remediation
    ), t0));
  }

  for (const [id, commandArgs, remediation] of persona.checks) {
    t0 = Date.now();
    steps.push(stepWithDuration(id, requirePassed(
      run(amc, commandArgs, { cwd: dir, env: qaEnv, timeoutMs: 60_000 }),
      remediation
    ), t0));
  }

  const fullScore = parseJsonOutput(steps.find((step) => step.id === "full-score") ?? { stdout: "" });
  const packs = parseJsonOutput(steps.find((step) => step.id === "domain-packs") ?? { stdout: "" });
  const strategy = parseJsonOutput(steps.find((step) => step.id === "strategy-compare") ?? { stdout: "" });
  const importPlan = parseJsonOutput(steps.find((step) => step.id === "neutral-import") ?? { stdout: "" });

  const assertions = [];
  assertions.push({
    id: "full-score-contract",
    status: fullScore?.ok === true && fullScore?.questionCount >= 240 && fullScore?.firstResultSla?.met === true ? "passed" : "failed",
    details: fullScore ? `questions=${fullScore.questionCount}; firstResult=${fullScore.firstResultSla?.met}` : "full score JSON missing"
  });
  assertions.push({
    id: "domain-pack-count",
    status: Array.isArray(packs?.packs) && packs.packs.length >= 40 ? "passed" : "failed",
    details: `packs=${packs?.packs?.length ?? 0}`
  });
  if (strategy) {
    assertions.push({
      id: "strategy-recommendation",
      status: typeof strategy?.run?.recommendedStrategyId === "string" || typeof strategy?.recommendedStrategyId === "string" ? "passed" : "failed",
      details: JSON.stringify({ recommended: strategy?.run?.recommendedStrategyId ?? strategy?.recommendedStrategyId ?? null })
    });
  }
  if (importPlan) {
    assertions.push({
      id: "import-plan-ready",
      status: importPlan?.plan?.status === "ready" || importPlan?.status === "ready" ? "passed" : "failed",
      details: JSON.stringify({ status: importPlan?.plan?.status ?? importPlan?.status ?? null })
    });
  }

  const failed = steps.filter((step) => step.status !== "passed").length + assertions.filter((step) => step.status !== "passed").length;
  const total = steps.length + assertions.length;
  const rating = Math.round(((total - failed) / total) * 100) / 10;
  return {
    persona,
    workspace: dir,
    steps,
    assertions,
    rating,
    feedback: personaFeedback(persona, steps, fullScore)
  };
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function extractFirstScore(result) {
  return parseJsonOutput(result.steps.find((step) => step.id === "full-score") ?? { stdout: "" });
}

function extractPacks(result) {
  return parseJsonOutput(result.steps.find((step) => step.id === "domain-packs") ?? { stdout: "" });
}

function roleWorkflowSummary(result) {
  const commonIds = new Set(["package-install", "version", "help", "full-score", "domain-packs", "runtime-create"]);
  const roleSteps = result.steps.filter((step) => !commonIds.has(step.id));
  return roleSteps.map((step) => `${step.id}:${step.status}`).join(", ") || "none";
}

function renderMarkdownReport(receipt) {
  const lines = [
    "# AMC Install Persona QA Report",
    "",
    `Status: ${receipt.status.toUpperCase()}`,
    `Summary: ${receipt.summary}`,
    `Started: ${receipt.startedAt}`,
    `Ended: ${receipt.endedAt}`,
    `Personas: ${receipt.personaCount}`,
    `Average rating: ${receipt.averageRating}/10`,
    "",
    "## Ease-of-use feedback",
    "",
    "| Persona | Rating | Install | First score | Packs | Role workflow | Feedback |",
    "| --- | ---: | ---: | ---: | ---: | --- | --- |"
  ];

  for (const result of receipt.results) {
    const install = result.steps.find((step) => step.id === "package-install");
    const fullScore = extractFirstScore(result);
    const packs = extractPacks(result);
    lines.push([
      markdownCell(result.persona.name),
      `${result.rating}/10`,
      install?.durationMs != null ? `${install.durationMs}ms` : "n/a",
      fullScore?.elapsedMs != null ? `${fullScore.elapsedMs}ms` : "n/a",
      Array.isArray(packs?.packs) ? String(packs.packs.length) : "n/a",
      markdownCell(roleWorkflowSummary(result)),
      markdownCell(result.feedback)
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push(
    "",
    "## Failed checks",
    "",
    ...receipt.results.flatMap((result) => {
      const failedSteps = result.steps.filter((step) => step.status !== "passed");
      const failedAssertions = (result.assertions ?? []).filter((assertion) => assertion.status !== "passed");
      if (failedSteps.length === 0 && failedAssertions.length === 0) {
        return [`- ${result.persona.name}: none`];
      }
      return [
        `- ${result.persona.name}: ${[
          ...failedSteps.map((step) => step.id),
          ...failedAssertions.map((assertion) => assertion.id)
        ].join(", ")}`
      ];
    }),
    "",
    "## Coverage",
    "",
    "- Clean npm install of the packed tarball and CLI bin exposure.",
    "- CLI version and help startup.",
    "- One-command full score JSON with 240-question contract and first-result SLA.",
    "- Domain pack catalog count.",
    "- Runtime run creation for each local persona agent.",
    "- Role-specific workflow command for each persona."
  );

  return `${lines.join("\n")}\n`;
}

function main() {
  const tmp = mkdtempSync(join(tmpdir(), "amc-install-persona-qa-"));
  const qaEnv = env(tmp);
  const startedAt = new Date().toISOString();
  const setupSteps = [];
  let tarball = null;

  try {
    setupSteps.push(requirePassed(
      run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", tmp], { cwd: root, env: qaEnv, timeoutMs: 120_000 }),
      "Could not pack the built AMC package."
    ));
    if (setupSteps[0].status === "passed") {
      const packed = readdirSync(tmp).find((name) => name.endsWith(".tgz"));
      tarball = packed ? join(tmp, packed) : null;
    }
    if (!tarball || !existsSync(tarball)) {
      throw new Error("npm pack did not produce an installable tarball");
    }

    const results = personas.map((persona) => runPersona(persona, tarball, tmp, qaEnv));
    const failedPersonas = results.filter((result) => result.rating < 10);
    const averageRating = Math.round((results.reduce((sum, result) => sum + result.rating, 0) / results.length) * 10) / 10;
    const receipt = {
      schemaVersion: "2026-05-26",
      receiptType: "install-persona-qa",
      startedAt,
      endedAt: new Date().toISOString(),
      status: failedPersonas.length === 0 ? "passed" : "failed",
      summary: failedPersonas.length === 0
        ? `All ${personas.length} install personas passed.`
        : `${failedPersonas.length} of ${personas.length} install personas failed.`,
      packageTarball: tarball,
      personaCount: personas.length,
      averageRating,
      reportPath,
      setupSteps,
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
      console.log(`Average rating: ${averageRating}/10`);
      console.log(`Receipt: ${outPath}`);
      console.log(`Report: ${reportPath}`);
      for (const result of results) {
        console.log(`- ${result.rating === 10 ? "PASS" : "FAIL"} ${result.persona.name}: ${result.rating}/10`);
      }
    }
    if (receipt.status !== "passed") {
      process.exit(1);
    }
  } finally {
    if (!keep) {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}

main();
