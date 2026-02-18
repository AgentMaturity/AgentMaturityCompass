#!/usr/bin/env node
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const workspaceArg = args.find((arg) => arg.startsWith("--workspace="));
const workspace = resolve(workspaceArg ? workspaceArg.slice("--workspace=".length) : process.cwd());

const requiredDocs = [
  "docs/ATTESTATION_EVIDENCE_PATHS.md",
  "docs/INCIDENT_RESPONSE_READINESS.md",
  "docs/EVIDENCE_TRUST.md",
  "docs/EVIDENCE_REQUESTS.md"
];

const recommendedPaths = [
  ".amc/keys",
  ".amc/transparency",
  ".amc/audit",
  ".amc/backups"
];

const artifactHints = [
  { path: ".amc/assurance/certificates", extension: ".amccert", label: "assurance cert" },
  { path: ".amc/agents", extension: ".amcbundle", label: "bundle" },
  { path: ".amc/transparency/proofs", extension: ".amcproof", label: "transparency proof" },
  { path: ".amc/backups", extension: ".amcbackup", label: "backup artifact" }
];

const failures = [];
const warnings = [];

for (const rel of requiredDocs) {
  const full = join(workspace, rel);
  if (!existsSync(full)) {
    failures.push(`Missing required documentation: ${rel}`);
  }
}

for (const rel of recommendedPaths) {
  const full = join(workspace, rel);
  if (!existsSync(full)) {
    warnings.push(`Recommended path missing: ${rel}`);
  }
}

function hasExtensionSomewhere(baseDir, extension, depth = 3) {
  if (!existsSync(baseDir)) {
    return false;
  }

  const visit = (dir, remainingDepth) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(extension)) {
        return true;
      }
      if (entry.isDirectory() && remainingDepth > 0) {
        if (visit(full, remainingDepth - 1)) {
          return true;
        }
      }
    }
    return false;
  };

  return visit(baseDir, depth);
}

for (const hint of artifactHints) {
  const full = join(workspace, hint.path);
  if (!existsSync(full)) {
    continue;
  }
  let isDir = false;
  try {
    isDir = statSync(full).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) {
    continue;
  }
  if (!hasExtensionSomewhere(full, hint.extension)) {
    warnings.push(`No ${hint.label} files found under ${hint.path} (expected *${hint.extension}).`);
  }
}

console.log("AMC incident readiness check");
console.log(`Workspace: ${workspace}`);
console.log(`Mode: ${strict ? "strict" : "standard"}`);
console.log("");

if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) {
    console.log(`- ${f}`);
  }
  console.log("");
}

if (warnings.length > 0) {
  console.log("Warnings:");
  for (const w of warnings) {
    console.log(`- ${w}`);
  }
  console.log("");
}

if (failures.length === 0 && warnings.length === 0) {
  console.log("PASS: incident readiness baseline checks passed.");
  process.exit(0);
}

if (failures.length > 0 || (strict && warnings.length > 0)) {
  console.log("FAIL: incident readiness check did not meet required baseline.");
  process.exit(1);
}

console.log("PASS WITH WARNINGS: baseline met, but improvements are recommended.");
process.exit(0);
