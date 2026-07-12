#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const quick = args.has("--quick");
const outArgIndex = process.argv.indexOf("--out");
const outPath = outArgIndex >= 0 ? resolve(root, process.argv[outArgIndex + 1]) : join(root, ".amc", "release-gate", "latest.json");
const liveUrl = process.env.AMC_RELEASE_GATE_LIVE_URL;

function outputTail(current, chunk) {
  return `${current}${chunk.toString()}`.slice(-4000);
}

function killProcessTree(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      encoding: "utf8",
      timeout: 10_000
    });
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    try { child.kill("SIGKILL"); } catch { /* The process already exited. */ }
  }
}

async function runStep(id, command, args, options = {}) {
  const startedAt = new Date().toISOString();
  const timeoutMs = options.timeoutMs ?? 120_000;
  const result = await new Promise((resolveResult) => {
    let stdout = "";
    let stderr = "";
    let spawnError = null;
    let timedOut = false;
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: { ...process.env, ...(options.env ?? {}) },
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout?.on("data", (chunk) => { stdout = outputTail(stdout, chunk); });
    child.stderr?.on("data", (chunk) => { stderr = outputTail(stderr, chunk); });
    child.on("error", (error) => { spawnError = error; });
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child);
    }, timeoutMs);
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolveResult({ status, signal, stdout, stderr, error: spawnError, timedOut });
    });
  });
  const passed = result.status === 0 && !result.error && !result.timedOut;
  const errorDetail = result.timedOut
    ? `TimeoutError: process tree exceeded ${timeoutMs}ms and was terminated.`
    : result.error
      ? `${result.error.name}: ${result.error.message}`
      : result.signal && result.status !== 0
        ? `Process exited from signal ${result.signal}.`
        : "";
  return {
    id,
    command: `${command} ${args.join(" ")}`.trim(),
    status: passed ? "passed" : "failed",
    startedAt,
    endedAt: new Date().toISOString(),
    stdout: result.stdout,
    stderr: [result.stderr, errorDetail].filter(Boolean).join("\n").slice(-4000),
    remediation: passed ? null : options.remediation ?? `Fix ${id} and rerun npm run release:gate.`
  };
}

function skippedStep(id, reason) {
  return {
    id,
    command: null,
    status: "skipped",
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    stdout: "",
    stderr: "",
    remediation: reason
  };
}

async function cliSmokeStep() {
  const tmp = mkdtempSync(join(tmpdir(), "amc-release-gate-"));
  try {
    const cli = join(root, "dist", "cli.js");
    if (!existsSync(cli)) {
      return {
        id: "cli-smoke",
        command: `node ${cli} --help`,
        status: "failed",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        stdout: "",
        stderr: "dist/cli.js missing",
        remediation: "Run npm run build before release smoke checks."
      };
    }
    const help = await runStep("cli-smoke-help", "node", [cli, "--help"], { cwd: tmp, timeoutMs: 30_000 });
    const packs = await runStep("domain-pack-smoke", "node", [cli, "domain", "pack", "list", "--json"], { cwd: tmp, timeoutMs: 30_000 });
    const passed = help.status === "passed" && packs.status === "passed" && packs.stdout.includes("\"packId\"");
    return {
      id: "cli-and-domain-smoke",
      command: "node dist/cli.js --help && node dist/cli.js domain pack list --json",
      status: passed ? "passed" : "failed",
      startedAt: help.startedAt,
      endedAt: packs.endedAt,
      stdout: `${help.stdout}\n${packs.stdout}`.slice(-4000),
      stderr: `${help.stderr}\n${packs.stderr}`.slice(-4000),
      remediation: passed ? null : "Fix CLI startup or domain pack catalog output."
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function liveHealthStep() {
  if (!liveUrl) {
    return skippedStep("live-deploy-health", "Set AMC_RELEASE_GATE_LIVE_URL to verify deployed health.");
  }
  return runStep("live-deploy-health", "node", ["-e", `
const url = process.argv[1];
const controller = new AbortController();
setTimeout(() => controller.abort(), 10000);
fetch(url, { signal: controller.signal }).then((res) => {
  if (!res.ok) throw new Error('HTTP ' + res.status);
  console.log('live health ok ' + res.status);
}).catch((error) => { console.error(error.message); process.exit(1); });
`, liveUrl], {
    timeoutMs: 15_000,
    remediation: "Check deployment, DNS, TLS, and health endpoint before release."
  });
}

const steps = [];
steps.push(await runStep("console-js-syntax", "node", ["--check", "src/console/assets/app.js"], {
  remediation: "Fix Studio JavaScript syntax."
}));
steps.push(await runStep("openapi-parse", "node", ["-e", "import('yaml').then(YAML=>{const fs=require('fs'); YAML.parse(fs.readFileSync('website/openapi.yaml','utf8'));})"], {
  remediation: "Fix website/openapi.yaml syntax."
}));
steps.push(await runStep("typecheck", "npm", ["run", "typecheck"], {
  timeoutMs: 600_000,
  remediation: "Fix TypeScript errors."
}));
steps.push(await runStep("build", "npm", ["run", "build"], {
  timeoutMs: 600_000,
  remediation: "Fix package build and copied Studio assets."
}));
steps.push(await runStep("gap-0626-adversarial-regression", "npx", ["vitest", "run", "tests/gap0626AdversarialRegression.test.ts"], {
  timeoutMs: 180_000,
  remediation: "Fix GAP-0626 synthetic adversarial regression fixture, expected DENIED decision, or Score/Shield/Watch rerun output."
}));
if (quick) {
  steps.push(skippedStep("full-test-suite", "Quick mode skips the full Vitest suite; CI must run it before release."));
} else {
  steps.push(await runStep("full-test-suite", "npx", ["vitest", "run", "--reporter=dot"], {
    timeoutMs: 900_000,
    remediation: "Fix the full Vitest suite before release."
  }));
}
steps.push(await runStep("command-inventory", "node", ["dist/cli.js", "commands", "--markdown", "--out", "docs/CLI_COMMAND_INVENTORY.md"], {
  remediation: "Regenerate or fix the live CLI command inventory."
}));
steps.push(await runStep("architecture-boundaries", "node", ["scripts/architecture-boundaries-check.mjs"], {
  timeoutMs: 120_000,
  remediation: "Fix CLI/API/Studio boundary drift and rerun npm run check:architecture-boundaries."
}));
steps.push(await runStep("docs-drift-public-naming", "npm", ["run", "check:docs-drift"], {
  remediation: "Fix public docs drift, stale quickscore primary path, or forbidden source-name leakage."
}));
steps.push(await runStep("runtime-dependency-audit", "npm", ["run", "audit:runtime"], {
  timeoutMs: 120_000,
  remediation: "Fix runtime dependency advisories at moderate severity or higher."
}));
steps.push(await cliSmokeStep());
if (quick) {
  steps.push(skippedStep("install-persona-qa", "Quick mode skips isolated package install persona QA; run npm run qa:install-personas before release."));
} else {
  steps.push(await runStep("install-persona-qa", "npm", ["run", "qa:install-personas", "--", "--json", "--out", "tmp/persona-install-qa/latest.json"], {
    timeoutMs: 600_000,
    remediation: "Fix install, one-command score, domain-pack, or persona-specific CLI regressions."
  }));
}
steps.push(await liveHealthStep());

const failed = steps.filter((step) => step.status === "failed");
const receipt = {
  schemaVersion: "2026-05-23",
  receiptType: "release-gate",
  createdAt: new Date().toISOString(),
  workspace: root,
  quick,
  status: failed.length === 0 ? "passed" : "failed",
  summary: failed.length === 0 ? "Release gate passed." : `${failed.length} release gate check(s) failed.`,
  steps,
  remediations: failed.map((step) => ({ id: step.id, remediation: step.remediation }))
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

if (json) {
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
} else {
  console.log(`${receipt.status.toUpperCase()} ${receipt.summary}`);
  console.log(`Receipt: ${outPath}`);
  for (const step of steps) {
    console.log(`- ${step.status.toUpperCase()} ${step.id}`);
  }
}

if (failed.length > 0) {
  process.exit(1);
}
