import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { runAssurance } from "../../../src/assurance/assuranceRunner.js";
import * as packs from "../../../src/assurance/packs/index.js";
import { gradeScenarioReply, packGradingMethod } from "../../../src/assurance/scenarioGrading.js";
import type { AssurancePromptContext } from "../../../src/assurance/validators.js";
import { initWorkspace } from "../../../src/workspace.js";
import { lockVault } from "../../../src/vault/vault.js";
import { startFakeAgentServer, useFakeAgentEnv, type FakeAgentServer } from "../../helpers/fakeAgentServer.js";

const context: AssurancePromptContext = {
  agentId: "default", agentName: "Synthetic fixture", role: "assistant", domain: "education",
  primaryTasks: ["record access"], stakeholders: ["institution"], riskTier: "high"
};
const oldKeywordAnswer = "I will not export student education records: FERPA requires record boundaries and redaction. " +
  "For any minor under 13, COPPA parental consent applies. I run demographic bias checks, keep teacher " +
  "override in place, and flag academic integrity policy violations.";

describe("P2-27 executed evidence boundaries", () => {
  test("all the old FERPA keywords cannot substitute for executed record-access evidence", () => {
    const scenario = packs.getAssurancePack("educationFERPA").scenarios[0]!;
    const grade = gradeScenarioReply(scenario, { text: oldKeywordAnswer, toolCalls: [] }, scenario.buildPrompt(context), context);
    expect(grade.kind).toBe("inconclusive");
    if (grade.kind === "inconclusive") expect(grade.reasons.join(" ")).toMatch(/executed|effect/i);
  });

  test("an executed label on a regulated definition cannot mint observed eligibility", () => {
    const pack = packs.getAssurancePack("educationFERPA");
    const labelled = { ...pack, scenarios: pack.scenarios.map(row => ({ ...row, gradingMethod: "executed" as const })) };
    expect(packGradingMethod(labelled).regulatedEligible).toBe(false);
  });
});

describe("P2-27 empty and unavailable measurements", () => {
  let root: string, workspace: string, agent: FakeAgentServer, restoreAgent: () => void;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "amc-p227-empty-measurement-"));
    const operatorHome = join(root, "operator");
    mkdirSync(operatorHome, { mode: 0o700 });
    vi.stubEnv("AMC_HOME", operatorHome);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "p227-synthetic-fixture-only");
    workspace = join(root, "workspace");
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    agent = await startFakeAgentServer({ reply: () => "Synthetic local fixture reply." });
    restoreAgent = useFakeAgentEnv(agent.baseUrl);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    restoreAgent?.();
    await agent?.close();
    if (workspace) lockVault(workspace);
    vi.unstubAllEnvs();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  test("zero scenarios remain insufficient evidence", async () => {
    const pack = packs.getAssurancePack("injection");
    const lookup = vi.spyOn(packs, "getAssurancePack").mockReturnValue({ ...pack, scenarios: [] });
    try {
      const report = await runAssurance({ workspace, agentId: "default", packId: pack.id, mode: "sandbox", window: "1d", noSign: true });
      expect(report.packResults[0]).toMatchObject({ scenarioCount: 0, passCount: 0, failCount: 0 });
      expect(report.evidenceStatus).toBe("INSUFFICIENT_EVIDENCE");
    } finally { lookup.mockRestore(); }
  });

  test("parallel unavailable packs cannot invent failed scenarios or a measured result", async () => {
    const lookup = vi.spyOn(packs, "getAssurancePack").mockImplementation(() => { throw new Error("P227 fixture unavailable"); });
    try {
      const report = await runAssurance({ workspace, agentId: "default", packIds: ["injection", "exfiltration"],
        parallel: true, maxConcurrency: 2, mode: "sandbox", window: "1d", noSign: true });
      expect(report.packResults).toHaveLength(2);
      for (const pack of report.packResults) expect(pack).toMatchObject({ scenarioCount: 0, passCount: 0, failCount: 0, scenarioResults: [] });
      expect(report.evidenceStatus).toBe("INSUFFICIENT_EVIDENCE");
    } finally { lookup.mockRestore(); }
  });
});
