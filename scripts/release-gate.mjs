#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

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
      cwd: options.cwd ?? process.cwd(),
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

async function cliSmokeStep(root, execute) {
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
    const help = await execute("cli-smoke-help", "node", [cli, "--help"], { cwd: tmp, timeoutMs: 30_000 });
    const packs = await execute("domain-pack-smoke", "node", [cli, "domain", "pack", "list", "--json"], { cwd: tmp, timeoutMs: 30_000 });
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

async function liveHealthStep(liveUrl, execute) {
  if (!liveUrl) {
    return skippedStep("live-deploy-health", "Set AMC_RELEASE_GATE_LIVE_URL to verify deployed health.");
  }
  return execute("live-deploy-health", "node", ["-e", `
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

/** Run registered checks; dependency omissions remain explicit in the receipt. */
export async function releaseGate({
  root = process.cwd(), quick = false, liveUrl = process.env.AMC_RELEASE_GATE_LIVE_URL,
  execute = runStep
} = {}) {
  const temporary = mkdtempSync(join(tmpdir(), "amc-release-gate-artifacts-"));
  const inventoryPath = join(temporary, "CLI_COMMAND_INVENTORY.md");
  const steps = [];
  const step = (id, command, args, options = {}) => execute(id, command, args, { cwd: root, ...options });
  try {
    steps.push(await step("console-js-syntax", "node", ["--check", "src/console/assets/app.js"], {
      remediation: "Fix Studio JavaScript syntax."
    }));
    steps.push(await step("openapi-parse", "node", ["-e", "import('yaml').then(YAML=>{const fs=require('fs'); YAML.parse(fs.readFileSync('website/openapi.yaml','utf8'));})"], {
      remediation: "Fix website/openapi.yaml syntax."
    }));
    steps.push(await step("typecheck", "npm", ["run", "typecheck"], {
      timeoutMs: 600_000, remediation: "Fix TypeScript errors."
    }));
    const build = await step("build", "npm", ["run", "build"], {
      timeoutMs: 600_000, remediation: "Fix package build and copied Studio assets."
    });
    steps.push(build);
    const builtStep = (id, command, args, options = {}) => build.status === "passed"
      ? step(id, command, args, options)
      : skippedStep(id, "Build failed; this check cannot qualify stale or missing build output.");

    steps.push(quick
      ? skippedStep("packed-install", "Quick mode skips fresh installed-package and cold evidence verification; run the full release gate.")
      : await builtStep("packed-install", "node", ["scripts/packed-install-check.mjs", "--no-build"], {
        timeoutMs: 600_000,
        remediation: "Fix the fresh installed package and native evidence verification. Packing uses --ignore-scripts to avoid recursive prepack."
      }));
    steps.push(await builtStep("gap-0626-adversarial-regression", "npx", ["vitest", "run", "tests/gap0626AdversarialRegression.test.ts"], {
      timeoutMs: 180_000,
      remediation: "Fix GAP-0626 synthetic adversarial regression fixture, expected DENIED decision, or Score/Shield/Watch rerun output."
    }));
    let testReportPath = null;
    if (!quick && build.status === "passed") {
      const reports = join(root, "tmp", "release-gate");
      mkdirSync(reports, { recursive: true });
      testReportPath = join(mkdtempSync(join(reports, "vitest-")), "results.json");
    }
    const suite = quick
      ? skippedStep("full-test-suite", "Quick mode skips the full Vitest suite; CI must run it before release.")
      : await builtStep("full-test-suite", "npx", ["vitest", "run", "--reporter=dot", "--reporter=json",
        ...(testReportPath ? [`--outputFile.json=${testReportPath}`] : [])], {
        timeoutMs: 900_000, remediation: "Fix the full Vitest suite before release."
      });
    if (testReportPath) {
      const produced = existsSync(testReportPath);
      let valid = false;
      let sha256 = null;
      let counts = null;
      if (produced) {
        const bytes = readFileSync(testReportPath);
        sha256 = createHash("sha256").update(bytes).digest("hex");
        try {
          const report = JSON.parse(bytes.toString("utf8"));
          const count = (value) => Number.isFinite(value) ? value : null;
          counts = {
            total: count(report?.numTotalTests), passed: count(report?.numPassedTests),
            failed: count(report?.numFailedTests), pending: count(report?.numPendingTests),
            todo: count(report?.numTodoTests), failedSuites: count(report?.numFailedTestSuites),
            pendingSuites: count(report?.numPendingTestSuites),
            files: Array.isArray(report?.testResults) ? report.testResults.length : null
          };
          // This mandatory profile permits no skipped/todo tests. Vitest's JSON
          // success excludes unhandled errors, so process success is also required below.
          valid = report?.success === true
            && Object.values(counts).every((value) => Number.isInteger(value) && value >= 0)
            && counts.passed > 0 && counts.total === counts.passed
            && counts.failed === 0 && counts.pending === 0 && counts.todo === 0
            && counts.failedSuites === 0 && counts.pendingSuites === 0 && counts.files > 0
            && report.testResults.every((file) => file?.status === "passed" && file.message === "");
        } catch { /* Malformed reports cannot qualify successful execution. */ }
      }
      if (suite.status === "passed" && !valid) {
        suite.status = "failed";
        suite.stderr = "Vitest exited successfully without a valid JSON report of passing tests and zero failed, pending, todo, or errored suites.";
        suite.remediation = "Fix structured Vitest reporting and execute every mandatory test before qualifying the full suite.";
      }
      suite.artifact = { path: testReportPath, produced, valid, sha256, counts, temporary: false, retained: true };
    }
    steps.push(suite);
    const inventory = await builtStep("command-inventory", "node", ["dist/cli.js", "commands", "--markdown", "--out", inventoryPath], {
      remediation: "Fix live CLI command inventory generation. The gate never rewrites tracked docs."
    });
    const produced = existsSync(inventoryPath) && readFileSync(inventoryPath, "utf8").trim().length > 0;
    if (inventory.status === "passed" && !produced) {
      inventory.status = "failed";
      inventory.stderr = "CLI exited successfully without producing a nonempty command inventory.";
      inventory.remediation = "Fix CLI command inventory output before qualifying this build.";
    }
    steps.push({ ...inventory, artifact: { path: inventoryPath, produced, temporary: true, retained: false } });
    steps.push(await step("architecture-boundaries", "node", ["scripts/architecture-boundaries-check.mjs"], {
      timeoutMs: 120_000,
      remediation: "Fix CLI/API/Studio boundary drift and rerun npm run check:architecture-boundaries."
    }));
    steps.push(await step("docs-drift-public-naming", "npm", ["run", "check:docs-drift"], {
      remediation: "Fix public docs drift, stale quickscore primary path, or forbidden source-name leakage."
    }));
    steps.push(await step("runtime-dependency-audit", "npm", ["run", "audit:runtime"], {
      timeoutMs: 120_000, remediation: "Fix runtime dependency advisories at moderate severity or higher."
    }));
    steps.push(build.status === "passed"
      ? await cliSmokeStep(root, step)
      : skippedStep("cli-and-domain-smoke", "Build failed; CLI smoke cannot use stale or missing build output."));
    steps.push(quick
      ? skippedStep("install-persona-qa", "Quick mode skips isolated package install persona QA; run the full release gate before release.")
      : await builtStep("install-persona-qa", "npm", ["run", "qa:install-personas", "--", "--json", "--out", "tmp/persona-install-qa/latest.json"], {
        timeoutMs: 600_000,
        remediation: "Fix install, one-command score, domain-pack, or persona-specific CLI regressions."
      }));
    steps.push(await liveHealthStep(liveUrl, step));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }

  const passed = steps.filter((step) => step.status === "passed").length;
  const failed = steps.filter((step) => step.status === "failed");
  const skipped = steps.filter((step) => step.status === "skipped");
  const counts = { executed: passed + failed.length, passed, failed: failed.length, skipped: skipped.length, total: steps.length };
  const partial = skipped.length > 0;
  return {
    schemaVersion: "2026-09-08", receiptType: "release-gate", createdAt: new Date().toISOString(),
    workspace: root, quick,
    // Preserve the process/check result contract; qualification carries completeness.
    status: failed.length === 0 ? "passed" : "failed",
    qualification: failed.length > 0 ? "failed" : partial ? "partial" : "complete",
    partial, counts,
    summary: `${passed}/${counts.executed} executed checks passed; ${failed.length} failed; ${skipped.length} skipped.`
      + (partial ? ` Acceptance is incomplete: ${skipped.map((step) => step.id).join(", ")}.` : " All registered checks were executed."),
    scope: "Registered checks only. Packed-install covers keyless native evidence by default; real-provider, platform-matrix and publication results require their own evidence.",
    steps,
    remediations: [...failed, ...skipped].map((step) => ({ id: step.id, status: step.status, remediation: step.remediation }))
  };
}

async function main() {
  const root = process.cwd();
  const args = process.argv.slice(2);
  const outArgIndex = args.indexOf("--out");
  if (outArgIndex >= 0 && (!args[outArgIndex + 1] || args[outArgIndex + 1].startsWith("--"))) {
    throw new Error("--out requires a file path");
  }
  const outPath = outArgIndex >= 0 ? resolve(root, args[outArgIndex + 1]) : join(root, ".amc", "release-gate", "latest.json");
  const receipt = await releaseGate({ root, quick: args.includes("--quick") });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  if (args.includes("--json")) {
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } else {
    console.log(`${receipt.qualification.toUpperCase()} ${receipt.summary}`);
    console.log(`Receipt: ${outPath}`);
    for (const step of receipt.steps) console.log(`- ${step.status.toUpperCase()} ${step.id}`);
  }
  if (receipt.status === "failed") process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
