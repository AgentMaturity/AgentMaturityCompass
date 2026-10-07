import { execFile, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { createHash, generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { assertFileNotExample, assertNotExample, EXAMPLE_BANNER } from "../src/claims/eligibility/exampleMode.js";
import { assessDomainForAgent, buildDomainReportForAgent, getDomainGaps, getDomainRoadmap } from "../src/domains/domainCliIntegration.js";
import { createIndustryPackLicenseKey } from "../src/domains/industryPackEntitlement.js";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";

/**
 * P0-15: illustrative domain values exist only behind `--example`, stamped
 * `synthetic_example`, never written to `.amc/`, and refused by every signing
 * path that could carry a result.
 */

const CLI = resolve(process.cwd(), "dist/cli.js");
const roots: string[] = [];
const licenseEnv: Record<string, string> = {};
const EXAMPLE = { claimKind: "synthetic_example", banner: EXAMPLE_BANNER };
let workspace = "";

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

function treeHash(root: string): string {
  const hash = createHash("sha256");
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      hash.update(relative(root, full));
      if (statSync(full).isDirectory()) walk(full);
      else hash.update(readFileSync(full));
    }
  };
  if (existsSync(root)) walk(root);
  return hash.digest("hex");
}

function runCli(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    env: { ...process.env, ...licenseEnv, NO_COLOR: "1" },
    encoding: "utf8",
    timeout: 60_000
  });
}

function writeExampleRun(dir: string, runId: string): void {
  const path = join(dir, `${runId}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ runId, agentId: "example-agent", ts: Date.now(), ...EXAMPLE }));
}

beforeAll(() => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const env = {
    AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY: publicKey.export({ type: "spki", format: "pem" }).toString()
  } as NodeJS.ProcessEnv;
  licenseEnv.AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY = env.AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY!;
  licenseEnv.AMC_INDUSTRY_PACKS_LICENSE_KEY = createIndustryPackLicenseKey({ expiresAt: "2099-01-01T00:00:00.000Z", env });
  workspace = tempDir("amc-p015-example-");
  process.env.AMC_VAULT_PASSPHRASE = "p015-example-mode";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
});

afterAll(() => {
  delete process.env.AMC_VAULT_PASSPHRASE;
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("--example on the five domain commands", () => {
  const commands: string[][] = [
    ["domain", "assess", "--agent", "a", "--domain", "health"],
    ["domain", "gaps", "--agent", "a", "--domain", "health"],
    ["domain", "report", "--agent", "a", "--domain", "health", "--output", "example-report.md"],
    ["domain", "assurance", "--agent", "a", "--domain", "health"],
    ["domain", "roadmap", "--agent", "a", "--domain", "health"]
  ];

  test.each(commands)("amc %s %s --example is labelled and writes nothing under .amc/", (...args) => {
    const before = treeHash(join(workspace, ".amc"));
    const text = runCli(workspace, [...args, "--example"]);
    expect(text.status, text.stderr).toBe(0);
    const lines = text.stdout.trim().split("\n");
    expect(lines[0]).toBe(EXAMPLE_BANNER);
    expect(lines.at(-1)).toBe(EXAMPLE_BANNER);
    expect(text.stdout.split(EXAMPLE_BANNER)).toHaveLength(3);
    expect(text.stdout).toContain("synthetic_example");

    const json = runCli(workspace, [...args, "--example", "--json"]);
    expect(json.status, json.stderr).toBe(0);
    const parsed = JSON.parse(json.stdout) as { banner?: string; claimKind?: string; statusDimensions?: { result?: string } };
    expect(parsed.banner).toBe(EXAMPLE_BANNER);
    expect(parsed.claimKind).toBe("synthetic_example");
    expect(parsed.statusDimensions?.result).toBe("not_evaluated");

    expect(treeHash(join(workspace, ".amc"))).toBe(before);
  });

  test("an --output file carries the banner first and last", () => {
    const result = runCli(workspace, ["domain", "report", "--agent", "a", "--domain", "health", "--output", "stamped.md", "--example"]);
    expect(result.status, result.stderr).toBe(0);
    const lines = readFileSync(join(workspace, "stamped.md"), "utf8").trim().split("\n");
    expect(lines[0]).toBe(EXAMPLE_BANNER);
    expect(lines.at(-1)).toBe(EXAMPLE_BANNER);
  });
});

describe("other synthetic producers carry the label", () => {
  test("amc demo run through a gateway (the default vault mode) is labelled in text and --json", async () => {
    // A stand-in gateway that accepts the demo's scripted requests; the CLI runs async so this server can answer.
    const server = createServer((req, res) => {
      req.resume();
      req.on("end", () => { res.setHeader("content-type", "application/json"); res.end("{}"); });
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    const gateway = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    const run = (extra: string[]) => promisify(execFile)(process.execPath, [CLI, "demo", "run", "--gateway", gateway, ...extra], {
      cwd: workspace, env: { ...process.env, NO_COLOR: "1" }, encoding: "utf8", timeout: 60_000
    });
    try {
      const text = await run([]);
      const lines = text.stdout.trim().split("\n");
      expect([lines[0], lines.at(-1)]).toEqual([EXAMPLE_BANNER, EXAMPLE_BANNER]);
      expect(text.stdout).not.toMatch(/full scored report/);
      const json = await run(["--json"]);
      const parsed = JSON.parse(json.stdout.slice(json.stdout.indexOf("{"))) as { banner?: string; claimKind?: string; envelope?: { claimKind?: string }; trustLabel?: string };
      expect(parsed.banner).toBe(EXAMPLE_BANNER);
      expect(parsed.claimKind).toBe("synthetic_example");
      expect(parsed.envelope?.claimKind).toBe("synthetic_example");
      expect(parsed.trustLabel).toBe("DEMO_ONLY");
    } finally {
      await new Promise((done) => server.close(done));
    }
  }, 60_000);

  test("lab-simulate placeholder results carry a synthetic_example envelope", async () => {
    const lab = await import("../src/lab/cognitionLab.js");
    lab.resetLabState();
    const template = lab.getLabTemplates()[0]!;
    const experiment = lab.createLabExperiment({ kind: template.kind, name: "example", description: "example", modelId: "m" });
    const results = lab.simulateExperiment(experiment.experimentId);
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect((result.metadata.envelope as { claimKind?: string } | undefined)?.claimKind).toBe("synthetic_example");
    }
    lab.resetLabState();
  });

  test("amc mirofish run prints the banner first and last, and its JSON is synthetic_example", () => {
    const scenario = join(workspace, "example-scenario.yml");
    writeFileSync(scenario, [
      "name: example", "description: example scenario", "version: 1.0.0", "behavior:", "  autonomy: 0.5", "  errorRate: 0.1",
      "  escalationFrequency: 0.3", "  toolUsage: 0.5", "  responseLatency: 0.3", "  hallucinationRate: 0.05", "  complianceAdherence: 0.8", ""
    ].join("\n"));
    const args = ["mirofish", "run", "--scenario", scenario, "--iterations", "20", "--seed", "7"];
    const text = runCli(workspace, args);
    expect(text.status, text.stderr).toBe(0);
    const lines = text.stdout.trim().split("\n");
    expect([lines[0], lines.at(-1)]).toEqual([EXAMPLE_BANNER, EXAMPLE_BANNER]);
    const json = JSON.parse(runCli(workspace, [...args, "--output", "json"]).stdout) as { banner?: string; envelope?: { claimKind?: string } };
    expect(json.banner).toBe(EXAMPLE_BANNER);
    expect(json.envelope?.claimKind).toBe("synthetic_example");
  });
});

describe("assertNotExample", () => {
  test("refuses a synthetic_example envelope by action name and passes anything else", () => {
    expect(() => assertNotExample({ claimKind: "synthetic_example" }, "certified")).toThrow("synthetic_example results cannot be certified");
    expect(() => assertNotExample({ envelope: { claimKind: "synthetic_example" } }, "signed")).toThrow(/synthetic_example/);
    expect(() => assertNotExample({ claimKind: "observed" }, "certified")).not.toThrow();
    expect(() => assertNotExample(null, "certified")).not.toThrow();
  });
});

describe("example mode in process", () => {
  test("assessment, gaps and roadmap carry illustrative values only with example: true", () => {
    const dir = tempDir("amc-p015-inproc-");
    const example = assessDomainForAgent({ agentId: "a", domain: "health", workspace: dir, example: true });
    expect(example).toMatchObject({ status: "not_evaluated", claimKind: "synthetic_example", banner: EXAMPLE_BANNER });
    expect(typeof example.result?.compositeScore).toBe("number");
    expect(Array.isArray(getDomainGaps("a", "health", { workspace: dir, example: true }))).toBe(true);
    expect(Array.isArray(getDomainRoadmap("a", "health", { workspace: dir, example: true }))).toBe(true);
    expect(getDomainGaps("a", "health", { workspace: dir })).toBeNull();
    expect(getDomainRoadmap("a", "health", { workspace: dir })).toBeNull();
  });

  test("an example report file starts and ends with the banner; a real one says not evaluated", () => {
    const dir = tempDir("amc-p015-report-");
    const examplePath = join(dir, "example.md");
    buildDomainReportForAgent({ agentId: "a", domain: "health", workspace: dir, outputPath: examplePath, example: true });
    const lines = readFileSync(examplePath, "utf8").trim().split("\n");
    expect(lines[0]).toBe(EXAMPLE_BANNER);
    expect(lines.at(-1)).toBe(EXAMPLE_BANNER);
    const real = buildDomainReportForAgent({ agentId: "a", domain: "health", workspace: dir });
    expect(real.reportObject).toBeUndefined();
    expect(real.reportMarkdown).toContain("## Result: Not evaluated");
    expect(real.reportMarkdown).not.toMatch(/No compliance gaps identified|Certification Readiness|Composite Score/);
  });

  test("assertFileNotExample refuses an example JSON or banner-stamped file and ignores missing or unlabelled files", () => {
    const dir = tempDir("amc-p015-file-");
    const example = join(dir, "example.json");
    writeFileSync(example, JSON.stringify(EXAMPLE));
    expect(() => assertFileNotExample(example, "signed")).toThrow("synthetic_example results cannot be signed");
    const stamped = join(dir, "example.md");
    buildDomainReportForAgent({ agentId: "a", domain: "health", workspace: dir, outputPath: stamped, example: true });
    expect(() => assertFileNotExample(stamped, "signed")).toThrow("synthetic_example results cannot be signed");
    const quoted = join(dir, "quoted.md");
    writeFileSync(quoted, `The banner reads "${EXAMPLE_BANNER}" in example output.\n`);
    expect(() => assertFileNotExample(quoted, "signed")).not.toThrow();
    const text = join(dir, "notes.txt");
    writeFileSync(text, "plain text, not JSON");
    expect(() => assertFileNotExample(text, "signed")).not.toThrow();
    expect(() => assertFileNotExample(join(dir, "missing.json"), "signed")).not.toThrow();
  });
});

describe("signing paths refuse a synthetic_example result", () => {
  const runsDir = () => join(workspace, ".amc", "agents", "example-agent", "runs");

  test("amc certify (issueCertificate)", async () => {
    writeExampleRun(runsDir(), "example-certify");
    const { issueCertificate } = await import("../src/assurance/certificate.js");
    await expect(issueCertificate({
      workspace, runId: "example-certify", policyPath: "missing-policy.yaml", outFile: join(workspace, "x.amccert"), agentId: "example-agent"
    })).rejects.toThrow(/synthetic_example results cannot be/);
  });

  test("amc bundle export (exportEvidenceBundle)", async () => {
    writeExampleRun(runsDir(), "example-bundle");
    const { exportEvidenceBundle } = await import("../src/bundles/bundle.js");
    expect(() => exportEvidenceBundle({ workspace, runId: "example-bundle", outFile: join(workspace, "x.amcbundle"), agentId: "example-agent" }))
      .toThrow(/synthetic_example results cannot be/);
  });

  test("amc assurance cert-issue (issueAssuranceCertificate)", async () => {
    // Its own workspace: other collectors read every assurance run, and this fixture is not a valid one.
    const own = tempDir("amc-p015-assurance-");
    initWorkspace({ workspacePath: own, trustBoundaryMode: "isolated" });
    writeExampleRun(join(own, ".amc", "assurance", "runs", "example-assurance"), "run");
    const { assuranceIssueCertCli } = await import("../src/assurance/assuranceCli.js");
    await expect(assuranceIssueCertCli({ workspace: own, runId: "example-assurance" })).rejects.toThrow(/synthetic_example results cannot be/);
  });

  test("amc attest (attestIngestSession)", async () => {
    const ledger = openLedger(workspace);
    ledger.appendEvidence({
      sessionId: "example-ingest",
      runtime: "unknown",
      eventType: "review",
      payload: JSON.stringify(EXAMPLE),
      payloadExt: "json",
      meta: { ...EXAMPLE, source: "import" }
    });
    ledger.close();
    const { attestIngestSession } = await import("../src/ingest/ingest.js");
    expect(() => attestIngestSession({
      workspace, ingestSessionId: "example-ingest", agentId: "example-agent", attestedBy: "auditor", statement: "example"
    })).toThrow(/synthetic_example results cannot be/);
  });

  test("amc passport create (createPassportArtifact)", async () => {
    const agentRuns = join(workspace, ".amc", "agents", "example-passport", "runs");
    writeExampleRun(agentRuns, "example-passport-run");
    const { defaultPassportPolicy } = await import("../src/passport/passportPolicySchema.js");
    const { savePassportPolicy } = await import("../src/passport/passportStore.js");
    savePassportPolicy(workspace, defaultPassportPolicy());
    const { passportCreateCli } = await import("../src/passport/passportCli.js");
    expect(() => passportCreateCli({ workspace, scope: "agent", id: "example-passport", outFile: "x.amcpass" }))
      .toThrow(/synthetic_example results cannot be/);
  });

  test("amc audit binder create (auditBinderCreateCli)", async () => {
    writeExampleRun(join(workspace, ".amc", "agents", "example-binder", "runs"), "example-binder-run");
    const { auditBinderCreateCli } = await import("../src/audit/auditCli.js");
    await expect(auditBinderCreateCli({ workspace, scope: "agent", id: "example-binder" }))
      .rejects.toThrow(/synthetic_example results cannot be/);
  });

  test("amc notary sign (notarySignCli) refuses the banner-stamped Markdown --example --output writes", async () => {
    const inFile = join(workspace, "example-report.md");
    buildDomainReportForAgent({ agentId: "a", domain: "health", workspace: tempDir("amc-p015-md-"), outputPath: inFile, example: true });
    const { notarySignCli } = await import("../src/notary/notaryCli.js");
    expect(() => notarySignCli({ notaryDir: tempDir("amc-p015-notary-"), kind: "report", inFile, outFile: join(workspace, "md.sig") }))
      .toThrow(/synthetic_example results cannot be/);
  });

  test("amc notary sign (notarySignCli) refuses an example payload before loading any key", async () => {
    const inFile = join(workspace, "example-output.json");
    writeFileSync(inFile, JSON.stringify(EXAMPLE));
    const { notarySignCli } = await import("../src/notary/notaryCli.js");
    expect(() => notarySignCli({ notaryDir: tempDir("amc-p015-notary-"), kind: "bundle", inFile, outFile: join(workspace, "x.sig") }))
      .toThrow(/synthetic_example results cannot be/);
  });
});
