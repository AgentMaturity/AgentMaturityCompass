import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { runAssurance } from "../src/assurance/assuranceRunner.js";
import { issueAssuranceCertificate } from "../src/assurance/assuranceCertificates.js";
import { assuranceRunJsonPath, initAssurancePolicy, loadAssurancePolicy, saveAssurancePolicy } from "../src/assurance/assurancePolicyStore.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import type { AssuranceReport } from "../src/types.js";
import { startFakeAgentServer, useFakeAgentEnv, type FakeAgentServer } from "./helpers/fakeAgentServer.js";

/**
 * SH-TRUST-02: `amc assurance cert-issue` rests only on files a workspace writer cannot forge, bound to one another.
 * run.json and findings.json must carry the auditor's signature; the run's report must name the run and agent, derive
 * to exactly run.json's score, and have every graded row in the runner's sealed session. A planted `{}`, a report with
 * another verdict, a byte-edited run.json or a missing report each issue nothing.
 */
let fakeAgent: FakeAgentServer;
let restoreEnv: () => void;
const roots: string[] = [];
beforeAll(async () => { fakeAgent = await startFakeAgentServer(); restoreEnv = useFakeAgentEnv(fakeAgent.baseUrl); });
afterAll(async () => { restoreEnv(); await fakeAgent.close(); });
afterEach(() => { while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true }); });

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-cert-provenance-")), workspace = join(root, "workspace");
  roots.push(root);
  process.env.AMC_HOME = join(root, "home");
  process.env.AMC_VAULT_PASSPHRASE = "cert-provenance-passphrase";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const run = await runAssurance({ workspace, agentId: "default", mode: "supervise", window: "14d", packId: "injection", noSign: true });
  initAssurancePolicy(workspace);
  const policy = loadAssurancePolicy(workspace);
  policy.assurancePolicy.gates = { ...policy.assurancePolicy.gates, minIntegrityIndex: 0, minCorrelationRatio: 0, minObservedShare: 0 };
  saveAssurancePolicy(workspace, policy);
  const reportPath = join(getAgentPaths(workspace, "default").reportsDir, "assurance", `${run.assuranceRunId}.json`);
  return { workspace, runId: run.assuranceRunId, reportPath, runPath: assuranceRunJsonPath(workspace, run.assuranceRunId) };
}

describe("certificate issuance binds run.json, the report and the ledger session", () => {
  test("the genuine run issues; a planted, re-verdicted, orphaned or missing report, or an edited run.json, is refused", async () => {
    const f = await fixture();
    const original = readFileSync(f.reportPath, "utf8");
    const issue = (out: string) => issueAssuranceCertificate({ workspace: f.workspace, runId: f.runId, outFile: out });
    expect((await issue("genuine.amccert")).cert.certId).toMatch(/^cert_/);

    // A hand-written report with nothing to prove is not this run's report.
    writeFileSync(f.reportPath, "{}");
    await expect(issue("planted.amccert")).rejects.toThrow(/does not name this run and agent/);

    // The report derives to another score than the auditor-signed run.json carries.
    const flipped = JSON.parse(original) as AssuranceReport;
    const graded = flipped.packResults[0]!.scenarioResults.find((row) => row.inconclusive !== true)!;
    graded.pass = !graded.pass;
    writeFileSync(f.reportPath, JSON.stringify(flipped));
    await expect(issue("flipped.amccert")).rejects.toThrow(/run.json's score is not the one its assurance report derives to/);

    // A report whose rows are claimed under another agent: not this run's report.
    writeFileSync(f.reportPath, JSON.stringify({ ...(JSON.parse(original) as AssuranceReport), agentId: "someone-else" }));
    await expect(issue("orphan.amccert")).rejects.toThrow(/does not name this run and agent/);

    // No report at all.
    unlinkSync(f.reportPath);
    await expect(issue("missing.amccert")).rejects.toThrow(/sealed assurance report not found/);
    writeFileSync(f.reportPath, original);

    // run.json edited by a workspace writer who has no auditor key: its signature no longer verifies.
    const runOriginal = readFileSync(f.runPath, "utf8");
    const forgedRun = JSON.parse(runOriginal) as { score: { riskAssuranceScore: number | null; status: string; pass: boolean } };
    forgedRun.score = { ...forgedRun.score, riskAssuranceScore: 100, status: "PASS", pass: true };
    writeFileSync(f.runPath, JSON.stringify(forgedRun, null, 2));
    await expect(issue("forged-run.amccert")).rejects.toThrow(/run.json auditor signature invalid/);
    writeFileSync(f.runPath, runOriginal);

    // Everything restored: the run issues again.
    expect((await issue("restored.amccert")).cert.certId).toMatch(/^cert_/);
  }, 180_000);
});
