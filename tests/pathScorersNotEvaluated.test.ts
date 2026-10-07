import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { handleComplianceRoute } from "../src/api/complianceRouter.js";
import { runRedTeamCiGate } from "../src/ci/redteamGate.js";
import { scoreEUAIActCompliance } from "../src/score/euAIActCompliance.js";
import { scoreGamingResistance } from "../src/score/gamingResistance.js";
import { scoreOWASPLLMCoverage } from "../src/score/owaspLLMCoverage.js";
import { scoreISO42001Coverage, scoreRegulatoryReadiness } from "../src/score/regulatoryReadiness.js";
import { initWorkspace } from "../src/workspace.js";
import { markAsAmcCheckout } from "./helpers/amcCheckout.js";
import { startFakeAgentServer, useFakeAgentEnv, type FakeAgentServer } from "./helpers/fakeAgentServer.js";

/**
 * P0-15: the EU AI Act (10), ISO 42001 (8) and OWASP LLM (10) scorers counted
 * file paths as compliance; `README.md` alone satisfied Art. 11. File presence
 * is not evidence, so all 28 criteria are not evaluated.
 */

const roots: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

/** Every path any of the three scorers used to accept, in an AMC-checkout fixture. */
function fullCheckout(): string {
  const root = tempDir("amc-p015-checkout-");
  markAsAmcCheckout(root);
  const files = [
    "README.md", "docs/AMC_MASTER_REFERENCE.md", "docs/RISK_MANAGEMENT.md", "docs/DATA_GOVERNANCE.md", "docs/QA.md",
    "docs/INCIDENT_RESPONSE_READINESS.md", "docs/FRIA.md", "docs/AI_GOVERNANCE.md", "docs/POLICY.md", "docs/OPERATIONS.md",
    "docs/MONITORING.md", "docs/MANAGEMENT_REVIEW.md", ".amc/audit_log.jsonl", ".amc/evidence.sqlite",
    "src/assurance/packs/injectionPack.ts", "src/score/outputIntegrityMaturity.ts", "src/assurance/packs/ragPoisoningPack.ts",
    "src/assurance/packs/resourceExhaustionPack.ts", "src/assurance/packs/sbomSupplyChainPack.ts",
    "src/assurance/packs/dlpExfiltrationPack.ts", "src/score/mcpCompliance.ts", "src/assurance/packs/governanceBypassPack.ts",
    "src/score/humanOversightQuality.ts", "src/assurance/packs/taintPropagationPack.ts", "src/approvals/index.ts",
    "src/ledger/index.ts", "src/audit/index.ts", "src/incidents/index.ts", "tests/adversarial/x.test.ts"
  ];
  for (const file of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), "fixture\n");
  }
  return root;
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe.each([
  ["an AMC-checkout fixture with every accepted path", fullCheckout],
  ["an empty directory", () => tempDir("amc-p015-empty-")]
])("in %s", (_name, makeRoot) => {
  test("all 28 path criteria are not evaluated with a null score and level", () => {
    const root = makeRoot();
    const eu = scoreEUAIActCompliance(root);
    const iso = scoreISO42001Coverage(root);
    const owasp = scoreOWASPLLMCoverage(root);
    const criteria = [...eu.criteria, ...iso.controls, ...owasp.risks];
    expect(criteria).toHaveLength(28);
    for (const criterion of criteria) {
      expect(criterion.status).toBe("not_evaluated");
      expect(criterion.reason).toMatch(/^file presence is not evidence of /);
    }
    for (const result of [eu, iso, owasp]) {
      expect(result.status).toBe("not_evaluated");
      expect(result.score).toBeNull();
      expect(result.level).toBeNull();
    }
    const readiness = scoreRegulatoryReadiness({ workspace: root, agentId: "default" });
    expect(readiness.status).toBe("not_evaluated");
    expect(readiness.score).toBeNull();
    expect(readiness.level).toBeNull();
    expect(readiness.notEvaluated).toHaveLength(28);
  });
});

async function getRoute(workspace: string, url: string): Promise<{ status: number; data: Record<string, unknown> }> {
  const req = Readable.from([]) as unknown as IncomingMessage;
  Object.assign(req, { method: "GET", url });
  let status = 0;
  let body = "";
  const res = {
    writeHead: (code: number) => { status = code; return res; },
    end: (chunk?: string | Buffer) => { body += chunk?.toString() ?? ""; }
  } as unknown as ServerResponse;
  expect(await handleComplianceRoute(url.split("?")[0]!, "GET", req, res, workspace)).toBe(true);
  return { status, data: (JSON.parse(body) as { data: Record<string, unknown> }).data };
}

describe("CLI and API report not evaluated", () => {
  test("amc score eu-ai-act, owasp-llm and regulatory-readiness --json", () => {
    const cwd = tempDir("amc-p015-cli-");
    for (const args of [["eu-ai-act"], ["owasp-llm"], ["regulatory-readiness", "--agent", "default"]]) {
      const run = spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), "score", ...args, "--json"], {
        cwd, env: { ...process.env, NO_COLOR: "1" }, encoding: "utf8", timeout: 60_000
      });
      expect(run.status, run.stderr).toBe(0);
      expect(JSON.parse(run.stdout)).toMatchObject({ status: "not_evaluated", score: null, level: null });
    }
  });

  test("/api/v1/regulatory/{eu-ai-act,owasp-llm,readiness} in an AMC checkout", async () => {
    const root = fullCheckout();
    for (const url of ["/api/v1/regulatory/eu-ai-act", "/api/v1/regulatory/owasp-llm", "/api/v1/regulatory/readiness?agentId=default"]) {
      const { status, data } = await getRoute(root, url);
      expect(status, url).toBe(200);
      expect(data, url).toMatchObject({ status: "not_evaluated", score: null, level: null });
    }
  });
});

describe("EU AI Act technical documentation", () => {
  test("README.md alone no longer satisfies Art. 11", () => {
    const root = tempDir("amc-p015-readme-");
    writeFileSync(join(root, "README.md"), "# my agent\n");
    const eu = scoreEUAIActCompliance(root);
    const art11 = eu.criteria.find((criterion) => criterion.id === "Art. 11");
    expect(art11?.status).toBe("not_evaluated");
    expect(JSON.stringify(eu)).not.toMatch(/"hasTechnicalDocumentation":true/);
  });

  test("the operator-declared risk class stays, labelled self-reported", () => {
    const root = tempDir("amc-p015-class-");
    mkdirSync(join(root, ".amc"));
    writeFileSync(join(root, ".amc/eu_ai_act_classification.json"), JSON.stringify({ riskClass: "high" }));
    const eu = scoreEUAIActCompliance(root);
    expect(eu.riskClassification).toBe("high");
    expect(eu.riskClassificationClaimKind).toBe("self_reported");
  });
});

describe("gaming resistance", () => {
  let fakeAgent: FakeAgentServer | undefined;
  let restoreEnv: (() => void) | undefined;

  beforeAll(async () => {
    fakeAgent = await startFakeAgentServer();
    restoreEnv = useFakeAgentEnv(fakeAgent.baseUrl);
  });

  afterAll(async () => {
    restoreEnv?.();
    await fakeAgent?.close();
  });

  test("is not evaluated and the red-team gate does not pass on it", async () => {
    const workspace = tempDir("amc-p015-gate-");
    markAsAmcCheckout(workspace);
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const report = scoreGamingResistance(workspace);
    expect(report.status).toBe("not_evaluated");
    expect(report.score).toBeNull();
    const gate = await runRedTeamCiGate({
      workspace,
      agentId: "default",
      plugins: ["injection"],
      strategies: ["direct"],
      thresholds: { minScore0to100: 0, maxVulnerabilities: 999, maxCritical: 999, maxHigh: 999, minGamingResistanceScore0to100: 0 }
    });
    expect(gate.passed).toBe(false);
    expect(gate.reasons.join(" ")).toMatch(/gaming resistance is not measured/i);
  });
});
