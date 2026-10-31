import { spawnSync } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  activateIndustryPackAccess,
  getIndustryPackEntitlement
} from "../src/domains/industryPackEntitlement.js";
import {
  INDUSTRY_PACK_WEIGHTING_REMOVED_MESSAGE,
  LIFECYCLE_QUESTION_SET_VERSION,
  getQuestionSet
} from "../src/diagnostic/questionSets.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { loadRunReport } from "../src/diagnostic/runReportResolution.js";
import { handleScoreRoute } from "../src/api/scoreRouter.js";
import { unifiedRun } from "../src/unified/unifiedRun.js";
import { openLedger } from "../src/ledger/ledger.js";
import { initWorkspace } from "../src/workspace.js";
import { testIndustryPackLicence, type TestIndustryPackLicence } from "./helpers/industryPackLicence.js";

const LICENCE_ENV_KEYS = [
  "AMC_HOME",
  "AMC_INDUSTRY_PACKS_LICENSE_KEY",
  "AMC_DOMAIN_PACKS_LICENSE_KEY",
  "AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY",
  "AMC_DOMAIN_PACKS_LICENSE_PUBLIC_KEY",
  "AMC_INDUSTRY_PACKS_LICENSE_SECRET",
  "AMC_DOMAIN_PACKS_LICENSE_SECRET"
] as const;

const NOTICE = {
  requested: true,
  applied: false,
  modifiedQuestionCount: 0,
  message: INDUSTRY_PACK_WEIGHTING_REMOVED_MESSAGE
};

const roots: string[] = [];
const DAY_MS = 24 * 60 * 60 * 1000;

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

/** A licence signed by a key pinned in a temp AMC home trust list: since P1-51 the only licence a gate accepts. */
function issueLicence(expiresAt = "2099-01-01T00:00:00.000Z"): TestIndustryPackLicence {
  const licence = testIndustryPackLicence({ expiresAt });
  roots.push(licence.amcHome);
  return licence;
}

/** Licence on: the pinned AMC home and the licence in the environment, checked to be really active. */
function licenceOn(workspace = tempDir("amc-p151-probe-")): void {
  const licence = issueLicence();
  vi.stubEnv("AMC_HOME", licence.amcHome);
  vi.stubEnv("AMC_INDUSTRY_PACKS_LICENSE_KEY", licence.licenseKey);
  expect(getIndustryPackEntitlement(workspace).active).toBe(true);
}

// Lifts one core question above level 0 so its layer mixes unequal levels; any
// weight on the lifecycle questions in that layer would then move the average.
function seedCoreEvidence(workspace: string): void {
  const ledger = openLedger(workspace);
  const now = Date.now();
  for (let i = 0; i < 12; i += 1) {
    const sessionId = `seed-${i}`;
    ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "seed-runtime", binarySha256: "seed-sha" });
    for (const eventType of ["stdout", "audit", "metric", "artifact"] as const) {
      ledger.appendEvidence({
        sessionId,
        runtime: "unknown",
        eventType,
        payload: JSON.stringify({ auditType: "ALIGNMENT_CHECK_PASS", note: "seed evidence" }),
        inline: true,
        ts: now - (i % 7) * DAY_MS,
        meta: { questionId: "AMC-1.8", auditType: "ALIGNMENT_CHECK_PASS", trustTier: "OBSERVED" }
      });
    }
    ledger.sealSession(sessionId);
  }
  ledger.close();
}

function weighted(workspace: string) {
  return getQuestionSet({ version: LIFECYCLE_QUESTION_SET_VERSION, workspace, applyIndustryPackWeights: true });
}

beforeEach(() => {
  // The host may carry a real licence; every case starts from none.
  for (const key of LICENCE_ENV_KEYS) {
    vi.stubEnv(key, undefined);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  while (roots.length > 0) {
    rmSync(roots.pop() as string, { recursive: true, force: true });
  }
});

describe("industry pack weighting never depends on payment", () => {
  const unweighted = getQuestionSet({ version: LIFECYCLE_QUESTION_SET_VERSION }).questions;

  function expectBaseline(set: ReturnType<typeof getQuestionSet>): void {
    expect(set.questions).toEqual(unweighted);
    expect(set.questions.every((question) => (question.scoringWeight ?? 1) === 1)).toBe(true);
    expect(set.info.domainPackWeighting).toEqual(NOTICE);
    // Exactly the notice keys: no licence-state field survives.
    expect(Object.keys(set.info.domainPackWeighting ?? {}).sort()).toEqual(Object.keys(NOTICE).sort());
  }

  test("A1: no licence gives the unweighted questions and the removal notice", () => {
    expectBaseline(weighted(tempDir("amc-p044-a1-")));
  });

  test("A2: a valid licence changes nothing", () => {
    const baseline = weighted(tempDir("amc-p044-base-"));
    licenceOn();
    const licensed = weighted(tempDir("amc-p044-a2-"));
    expect(licensed.questions).toEqual(baseline.questions);
    expect(licensed.info).toEqual(baseline.info);
    expectBaseline(licensed);
  });

  test("A3: a valid licence in the legacy variable changes nothing", () => {
    const { licenseKey, amcHome } = issueLicence();
    vi.stubEnv("AMC_HOME", amcHome);
    vi.stubEnv("AMC_DOMAIN_PACKS_LICENSE_KEY", licenseKey);
    expect(getIndustryPackEntitlement(tempDir("amc-p044-a3p-")).active).toBe(true);
    expectBaseline(weighted(tempDir("amc-p044-a3-")));
  });

  test("A4: a forged licence changes nothing", () => {
    const { licenseKey } = issueLicence();
    const { amcHome: otherHome } = issueLicence();
    vi.stubEnv("AMC_HOME", otherHome);
    vi.stubEnv("AMC_INDUSTRY_PACKS_LICENSE_KEY", licenseKey);
    expectBaseline(weighted(tempDir("amc-p044-a4-")));
  });

  test("A5: an expired licence changes nothing", () => {
    const { licenseKey, amcHome } = issueLicence("2000-01-01T00:00:00.000Z");
    vi.stubEnv("AMC_HOME", amcHome);
    vi.stubEnv("AMC_INDUSTRY_PACKS_LICENSE_KEY", licenseKey);
    expectBaseline(weighted(tempDir("amc-p044-a5-")));
  });

  test("A6: a workspace activated with a valid key changes nothing", () => {
    const workspace = tempDir("amc-p044-a6-");
    const { licenseKey, amcHome } = issueLicence();
    vi.stubEnv("AMC_HOME", amcHome);
    expect(activateIndustryPackAccess({ workspace, licenseKey }).active).toBe(true);
    expectBaseline(weighted(workspace));
  });

  test("A7: a valid licence without the flag adds no weighting block", () => {
    licenceOn();
    const set = getQuestionSet({ version: LIFECYCLE_QUESTION_SET_VERSION, workspace: tempDir("amc-p044-a7-") });
    expect(set.info.domainPackWeighting).toBeUndefined();
    expect(set.questions).toEqual(unweighted);
  });

  test("B1: lifecycle layer scores are identical with and without a licence", async () => {
    async function run(applyIndustryPackWeights: boolean) {
      const workspace = tempDir("amc-p044-b1-");
      initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
      seedCoreEvidence(workspace);
      return runDiagnostic({
        workspace,
        window: "14d",
        targetName: "default",
        claimMode: "auto",
        questionSetVersion: LIFECYCLE_QUESTION_SET_VERSION,
        applyIndustryPackWeights
      });
    }

    const unlicensed = await run(true);
    licenceOn();
    const licensed = await run(true);
    const flagOff = await run(false);

    expect(unlicensed.layerScores.some((layer) => layer.avgFinalLevel > 0)).toBe(true);
    expect(licensed.layerScores).toEqual(unlicensed.layerScores);
    expect(flagOff.layerScores).toEqual(unlicensed.layerScores);
    expect(unlicensed.questionSet?.domainPackWeighting?.applied).toBe(false);
    expect(licensed.questionSet?.domainPackWeighting?.applied).toBe(false);
  }, 60_000);

  // P1-51: the same inputs give the same result with the licence on and off wherever a score is computed.
  function seededWorkspace(prefix: string): string {
    const workspace = tempDir(prefix);
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    seedCoreEvidence(workspace);
    return workspace;
  }

  test("D1: the score API route gives identical layer scores with the licence on and off", async () => {
    async function post() {
      const body = JSON.stringify({ questionSetVersion: LIFECYCLE_QUESTION_SET_VERSION, applyIndustryPackWeights: true });
      const req = Object.assign(Readable.from([Buffer.from(body)]), { method: "POST", url: "/api/v1/score/run", headers: {} }) as unknown as IncomingMessage;
      let payload = "";
      const res = { writeHead: () => res, end: (chunk?: string) => { payload += chunk ?? ""; } } as unknown as ServerResponse;
      expect(await handleScoreRoute("/api/v1/score/run", "POST", req, res, seededWorkspace("amc-p151-d1-"))).toBe(true);
      return (JSON.parse(payload) as { data: { layerScores: unknown; questionSet: { domainPackWeighting?: { applied: boolean } } } }).data;
    }
    const off = await post();
    licenceOn();
    const on = await post();
    expect(on.layerScores).toEqual(off.layerScores);
    expect(on.questionSet.domainPackWeighting?.applied).toBe(false);
  }, 120_000);

  test("D2: unified run gives identical module scores and overall grade with the licence on and off", async () => {
    async function run() {
      const report = await unifiedRun({ workspace: seededWorkspace("amc-p151-d2-"), agentId: "default", window: "14d",
        questionSetVersion: LIFECYCLE_QUESTION_SET_VERSION, applyIndustryPackWeights: true });
      return { overall: [report.overallScore, report.overallGrade],
        modules: report.modules.map(({ name, score, grade, status }) => ({ name, score, grade, status })) };
    }
    const off = await run();
    licenceOn();
    expect(await run()).toEqual(off);
  }, 240_000);

  test("D3: amc run gives identical layer scores with the licence on and off", () => {
    const cli = resolve("dist/cli.js");
    function run(env: Record<string, string>) {
      const workspace = seededWorkspace("amc-p151-d3-");
      const result = spawnSync(process.execPath, [cli, "run", "--score-only", "--question-set", LIFECYCLE_QUESTION_SET_VERSION,
        "--industry-pack-weights", "--json"], { cwd: workspace, encoding: "utf8", timeout: 120_000,
        env: { ...process.env, AMC_HOME: tempDir("amc-p151-d3-home-"), NO_COLOR: "1", ...env } });
      expect(result.status, result.stderr).toBe(0);
      const { runId, questionSet } = JSON.parse(result.stdout) as { runId: string; questionSet: { domainPackWeighting?: { applied: boolean } } };
      expect(questionSet.domainPackWeighting?.applied).toBe(false);
      return loadRunReport(workspace, runId).layerScores;
    }
    const off = run({});
    const licence = issueLicence();
    expect(getIndustryPackEntitlement(tempDir("amc-p151-d3p-"), { ...licence.env } as NodeJS.ProcessEnv).active).toBe(true);
    expect(run(licence.env)).toEqual(off);
  }, 240_000);

  test("C1: scoring code never reads the Industry Packs entitlement", () => {
    const files = ["src/diagnostic", "src/score", "src/unified"].flatMap((dir) =>
      readdirSync(dir, { recursive: true })
        .map(String)
        .filter((relative) => relative.endsWith(".ts"))
        .map((relative) => join(dir, relative))
    );
    files.push("src/api/scoreRouter.ts");
    const offenders = files.filter((file) => readFileSync(file, "utf8").includes("industryPackEntitlement"));
    expect(offenders).toEqual([]);
  });
});
