import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  activateIndustryPackAccess,
  createIndustryPackLicenseKey
} from "../src/domains/industryPackEntitlement.js";
import {
  INDUSTRY_PACK_WEIGHTING_REMOVED_MESSAGE,
  LIFECYCLE_QUESTION_SET_VERSION,
  getQuestionSet
} from "../src/diagnostic/questionSets.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { openLedger } from "../src/ledger/ledger.js";
import { initWorkspace } from "../src/workspace.js";

const LICENCE_ENV_KEYS = [
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

function issueLicence(expiresAt = "2099-01-01T00:00:00.000Z"): { licenseKey: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const licenseKey = createIndustryPackLicenseKey({
    expiresAt,
    env: {
      AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString()
    } as NodeJS.ProcessEnv
  });
  return { licenseKey, publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString() };
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
    const { licenseKey, publicKeyPem } = issueLicence();
    vi.stubEnv("AMC_INDUSTRY_PACKS_LICENSE_KEY", licenseKey);
    vi.stubEnv("AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY", publicKeyPem);
    const licensed = weighted(tempDir("amc-p044-a2-"));
    expect(licensed.questions).toEqual(baseline.questions);
    expect(licensed.info).toEqual(baseline.info);
    expectBaseline(licensed);
  });

  test("A3: a valid licence in the legacy variable changes nothing", () => {
    const { licenseKey, publicKeyPem } = issueLicence();
    vi.stubEnv("AMC_DOMAIN_PACKS_LICENSE_KEY", licenseKey);
    vi.stubEnv("AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY", publicKeyPem);
    expectBaseline(weighted(tempDir("amc-p044-a3-")));
  });

  test("A4: a forged licence changes nothing", () => {
    const { licenseKey } = issueLicence();
    const { publicKeyPem: otherPublicKey } = issueLicence();
    vi.stubEnv("AMC_INDUSTRY_PACKS_LICENSE_KEY", licenseKey);
    vi.stubEnv("AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY", otherPublicKey);
    expectBaseline(weighted(tempDir("amc-p044-a4-")));
  });

  test("A5: an expired licence changes nothing", () => {
    const { licenseKey, publicKeyPem } = issueLicence("2000-01-01T00:00:00.000Z");
    vi.stubEnv("AMC_INDUSTRY_PACKS_LICENSE_KEY", licenseKey);
    vi.stubEnv("AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY", publicKeyPem);
    expectBaseline(weighted(tempDir("amc-p044-a5-")));
  });

  test("A6: a workspace activated with a valid key changes nothing", () => {
    const workspace = tempDir("amc-p044-a6-");
    const { licenseKey, publicKeyPem } = issueLicence();
    vi.stubEnv("AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY", publicKeyPem);
    expect(activateIndustryPackAccess({ workspace, licenseKey }).active).toBe(true);
    expectBaseline(weighted(workspace));
  });

  test("A7: a valid licence without the flag adds no weighting block", () => {
    const { licenseKey, publicKeyPem } = issueLicence();
    vi.stubEnv("AMC_INDUSTRY_PACKS_LICENSE_KEY", licenseKey);
    vi.stubEnv("AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY", publicKeyPem);
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
    const { licenseKey, publicKeyPem } = issueLicence();
    vi.stubEnv("AMC_INDUSTRY_PACKS_LICENSE_KEY", licenseKey);
    vi.stubEnv("AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY", publicKeyPem);
    const licensed = await run(true);
    const flagOff = await run(false);

    expect(unlicensed.layerScores.some((layer) => layer.avgFinalLevel > 0)).toBe(true);
    expect(licensed.layerScores).toEqual(unlicensed.layerScores);
    expect(flagOff.layerScores).toEqual(unlicensed.layerScores);
    expect(unlicensed.questionSet?.domainPackWeighting?.applied).toBe(false);
    expect(licensed.questionSet?.domainPackWeighting?.applied).toBe(false);
  }, 60_000);

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
