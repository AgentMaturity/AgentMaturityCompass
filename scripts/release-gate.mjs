#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const quick = args.has("--quick");
const outArgIndex = process.argv.indexOf("--out");
const outPath = outArgIndex >= 0 ? resolve(root, process.argv[outArgIndex + 1]) : join(root, ".amc", "release-gate", "latest.json");
const liveUrl = process.env.AMC_RELEASE_GATE_LIVE_URL;

function runStep(id, command, args, options = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: "utf8",
    timeout: options.timeoutMs ?? 120_000
  });
  const passed = result.status === 0;
  return {
    id,
    command: `${command} ${args.join(" ")}`.trim(),
    status: passed ? "passed" : "failed",
    startedAt,
    endedAt: new Date().toISOString(),
    stdout: (result.stdout ?? "").slice(-4000),
    stderr: (result.stderr ?? "").slice(-4000),
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

function cliSmokeStep() {
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
    const help = runStep("cli-smoke-help", "node", [cli, "--help"], { cwd: tmp, timeoutMs: 30_000 });
    const packs = runStep("domain-pack-smoke", "node", [cli, "domain", "pack", "list", "--json"], { cwd: tmp, timeoutMs: 30_000 });
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

function liveHealthStep() {
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
steps.push(runStep("console-js-syntax", "node", ["--check", "src/console/assets/app.js"], {
  remediation: "Fix Studio JavaScript syntax."
}));
steps.push(runStep("openapi-parse", "node", ["-e", "import('yaml').then(YAML=>{const fs=require('fs'); YAML.parse(fs.readFileSync('website/openapi.yaml','utf8'));})"], {
  remediation: "Fix website/openapi.yaml syntax."
}));
steps.push(runStep("typecheck", "npm", ["run", "typecheck"], {
  timeoutMs: 180_000,
  remediation: "Fix TypeScript errors."
}));
if (quick) {
  steps.push(skippedStep("full-test-suite", "Quick mode skips npm test; CI must run the full suite before release."));
} else {
  steps.push(runStep("full-test-suite", "npm", ["test"], {
    timeoutMs: 420_000,
    remediation: "Fix the full Vitest suite before release."
  }));
}
steps.push(runStep("build", "npm", ["run", "build"], {
  timeoutMs: 240_000,
  remediation: "Fix package build and copied Studio assets."
}));
steps.push(runStep("command-inventory", "node", ["dist/cli.js", "commands", "--markdown", "--out", "docs/CLI_COMMAND_INVENTORY.md"], {
  remediation: "Regenerate or fix the live CLI command inventory."
}));
steps.push(runStep("docs-drift-public-naming", "npm", ["run", "check:docs-drift"], {
  remediation: "Fix public docs drift, stale quickscore primary path, or forbidden source-name leakage."
}));
steps.push(runStep("runtime-dependency-audit", "npm", ["run", "audit:runtime"], {
  timeoutMs: 120_000,
  remediation: "Fix runtime dependency advisories at moderate severity or higher."
}));
steps.push(cliSmokeStep());
if (quick) {
  steps.push(skippedStep("install-persona-qa", "Quick mode skips isolated package install persona QA; run npm run qa:install-personas before release."));
} else {
  steps.push(runStep("install-persona-qa", "npm", ["run", "qa:install-personas", "--", "--json", "--out", "tmp/persona-install-qa/latest.json"], {
    timeoutMs: 300_000,
    remediation: "Fix install, one-command score, domain-pack, or persona-specific CLI regressions."
  }));
}
steps.push(liveHealthStep());

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
