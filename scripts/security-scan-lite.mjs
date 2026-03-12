#!/usr/bin/env node
import { mkdtempSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";
import { scanDirectoryForSecrets } from "../dist/release/releaseSecretScan.js";

const cwd = resolve(process.cwd());
const outPath = resolve(process.argv[2] ?? join(cwd, ".amc", "security-scan-lite.json"));

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function createPluginFixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-plugin-scan-"));
  const contentDir = join(root, "content", "learn", "questions");
  ensureDir(contentDir);
  writeFileSync(
    join(root, "manifest.json"),
    JSON.stringify(
      {
        v: 1,
        plugin: {
          id: "amc.plugin.fixture.clean",
          name: "Fixture Clean Plugin",
          version: "1.0.0",
          description: "Local fixture for CI scan",
          publisher: {
            org: "AMC",
            contact: "ci@example.local",
            website: "https://example.local",
            pubkeyFingerprint: "0".repeat(64)
          },
          compatibility: {
            amcMinVersion: ">=1.0.0",
            nodeMinVersion: ">=20",
            schemaVersions: {
              policyPacks: 1,
              assurancePacks: 1,
              complianceMaps: 1,
              adapters: 1,
              outcomes: 1,
              casebooks: 1,
              transform: 1
            }
          },
          risk: {
            category: "LOW",
            notes: "Fixture",
            touches: ["learn"]
          }
        },
        artifacts: [],
        generatedTs: 0,
        signing: {
          algorithm: "ed25519",
          pubkeyFingerprint: "0".repeat(64)
        }
      },
      null,
      2
    ),
    "utf8"
  );
  writeFileSync(join(contentDir, "AMC-1.1.md"), "# Fixture\n\nNo secrets.\n", "utf8");
  return root;
}

const repoTargets = [
  // Scan shipped/runtime-facing surfaces by default. Raw `src/` contains
  // intentional adversarial fixtures, SDK tests, and example strings that are
  // useful for evals but create false-positive secret failures in this light CI gate.
  "dist",
  "docs",
  "deploy/helm",
  "scripts"
]
  .map((item) => resolve(cwd, item))
  .filter((item) => {
    try {
      return statSync(item).isDirectory();
    } catch {
      return false;
    }
  });

const fixtureDir = createPluginFixture();

const INTENTIONAL_LITE_EXCLUSIONS = [
  {
    targetSuffix: "/dist",
    pathPrefix: "assurance/packs/",
    reason: "intentional adversarial fixture content in compiled assurance packs"
  },
  {
    targetSuffix: "/dist",
    pathPrefix: "lab/",
    reason: "intentional research/adversarial fixture content in compiled lab modules"
  }
];

function shouldIgnoreLiteFinding(target, finding) {
  return INTENTIONAL_LITE_EXCLUSIONS.some((rule) =>
    target.endsWith(rule.targetSuffix) && finding.path.startsWith(rule.pathPrefix)
  );
}

const results = [];
for (const target of repoTargets) {
  const report = scanDirectoryForSecrets(target);
  const findings = report.findings.filter((finding) => !shouldIgnoreLiteFinding(target, finding));
  const hasHigh = findings.some((row) => row.severity === "HIGH");
  results.push({
    target,
    status: hasHigh ? "FAIL" : "PASS",
    findings
  });
}

const fixtureReport = scanDirectoryForSecrets(fixtureDir);
results.push({
  target: fixtureDir,
  status: fixtureReport.status,
  findings: fixtureReport.findings,
  kind: "plugin_fixture"
});

const findings = results.flatMap((row) =>
  row.findings.map((finding) => ({
    ...finding,
    target: row.target
  }))
);
const highFindings = findings.filter((row) => row.severity === "HIGH");

const payload = {
  v: 1,
  generatedTs: Date.now(),
  status: highFindings.length === 0 ? "PASS" : "FAIL",
  summary: {
    scannedTargets: results.length,
    findings: findings.length,
    highFindings: highFindings.length
  },
  targets: results.map((row) => ({
    target: row.target,
    status: row.status,
    findings: row.findings.length,
    kind: row.kind ?? "repo"
  })),
  findings
};

ensureDir(dirname(outPath));
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(JSON.stringify(payload.summary));
if (payload.status !== "PASS") {
  process.exit(1);
}
