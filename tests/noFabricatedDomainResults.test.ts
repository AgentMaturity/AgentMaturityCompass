import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

/**
 * P0-15: `amc domain assess|gaps|report|roadmap` printed scores computed from a
 * hash of the agent id, and `amc domain assurance` graded a canned paragraph.
 * Without evidence the answer is "not evaluated" with a reason.
 */

const removedPack = vi.hoisted(() => ({ id: null as string | null }));
vi.mock("../src/assurance/packs/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/assurance/packs/index.js")>();
  return {
    ...actual,
    listAssurancePacks: () => actual.listAssurancePacks().filter((pack) => pack.id !== removedPack.id)
  };
});

const { assessDomainForAgent, runDomainAssurance } = await import("../src/domains/domainCliIntegration.js");
const { initWorkspace } = await import("../src/workspace.js");
const { openLedger } = await import("../src/ledger/ledger.js");
const { canonicalize } = await import("../src/utils/json.js");
const { sha256Hex } = await import("../src/utils/hash.js");
const { questionBank } = await import("../src/diagnostic/questionBank.js");

const CLI = resolve(process.cwd(), "dist/cli.js");
const roots: string[] = [];
const licenseEnv: Record<string, string> = {};

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

function sealedRunWorkspace(sealed: boolean): string {
  const workspace = tempDir("amc-p015-run-");
  process.env.AMC_VAULT_PASSPHRASE = "p015-domain-evidence";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const now = Date.now();
  const base = {
    agentId: "agent-p015",
    runId: "run-observed",
    ts: now,
    windowEndTs: now - 1_000,
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.9,
    evidenceCoverage: 0.8,
    contradictionCount: 0,
    trustLabel: "HIGH TRUST",
    evidenceTrustCoverage: { observed: 0.7, attested: 0.1, selfReported: 0.2 },
    layerScores: [{ layerName: "Strategic Agent Operations", avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
    questionScores: questionBank.slice(0, 5).map((question) => ({ questionId: question.id, finalLevel: 3 })),
    reportJsonSha256: "",
    runSealSig: ""
  };
  const runPath = join(workspace, ".amc", "agents", "agent-p015", "runs", "run-observed.json");
  mkdirSync(dirname(runPath), { recursive: true });
  const hash = sha256Hex(canonicalize(base));
  const ledger = openLedger(workspace);
  const sig = ledger.signRunHash(hash);
  ledger.close();
  const report = sealed ? { ...base, reportJsonSha256: hash, runSealSig: sig } : base;
  writeFileSync(runPath, `${JSON.stringify(report, null, 2)}\n`);
  return workspace;
}

function runCli(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    env: { ...process.env, ...licenseEnv, NO_COLOR: "1" },
    encoding: "utf8",
    timeout: 60_000
  });
}

beforeAll(async () => {
  const { createIndustryPackLicenseKey } = await import("../src/domains/industryPackEntitlement.js");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const env = {
    AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY: publicKey.export({ type: "spki", format: "pem" }).toString()
  } as NodeJS.ProcessEnv;
  licenseEnv.AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY = env.AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY!;
  licenseEnv.AMC_INDUSTRY_PACKS_LICENSE_KEY = createIndustryPackLicenseKey({ expiresAt: "2099-01-01T00:00:00.000Z", env });
});

afterEach(() => {
  removedPack.id = null;
});

afterAll(() => {
  delete process.env.AMC_VAULT_PASSPHRASE;
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("domain assessment without evidence", () => {
  test("an empty workspace is not evaluated and carries no numeric composite", () => {
    const workspace = tempDir("amc-p015-empty-");
    const assessment = assessDomainForAgent({ agentId: "a", domain: "health", workspace });
    expect(assessment.status).toBe("not_evaluated");
    expect(assessment.statusDimensions.result).toBe("not_evaluated");
    expect(assessment.reasons.length).toBeGreaterThan(0);
    expect(assessment.result).toBeUndefined();
    expect(JSON.stringify(assessment)).not.toMatch(/compositeScore|certificationReadiness/);
  });

  test("the agent id no longer decides the output", () => {
    const workspace = tempDir("amc-p015-ids-");
    const strip = (agentId: string) => {
      const { agentId: _ignored, ...rest } = assessDomainForAgent({ agentId, domain: "health", workspace });
      return JSON.stringify(rest).replaceAll(`"${agentId}"`, "\"<agent>\"");
    };
    expect(strip("a")).toBe(strip("b"));
  });

  test("a sealed run evaluates the base part with the run's claim kind; the domain rubric stays not evaluated", () => {
    const workspace = sealedRunWorkspace(true);
    const assessment = assessDomainForAgent({ agentId: "agent-p015", domain: "health", workspace });
    expect(assessment.base.status).toBe("evaluated");
    expect(assessment.base.runId).toBe("run-observed");
    expect(assessment.base.claimKind).toBe("observed");
    expect(assessment.claimKind).toBe("observed");
    expect(assessment.domainRubric.status).toBe("not_evaluated");
    expect(assessment.status).toBe("not_evaluated");
    expect(assessment.statusDimensions.result).toBe("not_evaluated");
  });

  test("an unsealed run file is not evidence for the base part", () => {
    const workspace = sealedRunWorkspace(false);
    const assessment = assessDomainForAgent({ agentId: "agent-p015", domain: "health", workspace });
    expect(assessment.base.status).toBe("not_evaluated");
    expect(assessment.base.reasons.join(" ")).toMatch(/not sealed/);
  });
});

describe("domain assurance without an agent", () => {
  test("grades nothing and never passes", () => {
    const run = runDomainAssurance("a", "health");
    expect(run.status).toBe("not_evaluated");
    expect(run.allPassed).toBe(false);
    expect(run.passed + run.failed).toBe(0);
    expect(run.reasons.join(" ")).toContain("no agent was invoked");
  });

  test("an unregistered pack id is a not-evaluated row naming the id, and the run is not a pass", () => {
    removedPack.id = "healthcarePHI";
    const run = runDomainAssurance("a", "health");
    const row = run.packRuns.find((pack) => pack.packId === "healthcarePHI");
    expect(row?.status).toBe("not_evaluated");
    expect(row?.reason).toContain("healthcarePHI");
    expect(row?.passRate).toBeNull();
    expect(run.allPassed).toBe(false);
  });
});

describe("domain CLI commands", () => {
  const commands: string[][] = [
    ["domain", "assess", "--agent", "a", "--domain", "health"],
    ["domain", "gaps", "--agent", "a", "--domain", "health"],
    ["domain", "report", "--agent", "a", "--domain", "health", "--output", "report.md"],
    ["domain", "assurance", "--agent", "a", "--domain", "health"],
    ["domain", "roadmap", "--agent", "a", "--domain", "health"]
  ];

  test.each(commands)("amc %s %s prints not evaluated, never a verdict", (...args) => {
    const workspace = tempDir("amc-p015-cli-");
    for (const json of [false, true]) {
      const result = runCli(workspace, json ? [...args, "--json"] : args);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(result.status, output).toBe(0);
      expect(output).not.toContain("Certification Readiness");
      expect(output).not.toContain("all checks passed");
      expect(output.toLowerCase()).toMatch(/not.evaluated/);
      if (json) {
        const parsed = JSON.parse(result.stdout) as { status?: string; claimKind?: string; statusDimensions?: unknown };
        expect(parsed.status).toBe("not_evaluated");
        expect(parsed.claimKind).toBeDefined();
        expect(parsed.statusDimensions).toBeDefined();
      }
    }
  });

  test("a bad domain is an argument error", () => {
    const result = runCli(tempDir("amc-p015-bad-"), ["domain", "assess", "--agent", "a", "--domain", "not-a-domain"]);
    expect(result.status).toBe(1);
  });
});
