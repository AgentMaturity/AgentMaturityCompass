import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-native-cap-test-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("new domain runner caps", () => {
  test("AMC-VOICE-1 is capped when high-risk workspace lacks llm request/response evidence", async () => {
    const workspace = newWorkspace();

    const contextPath = join(workspace, ".amc", "context-graph.json");
    const graph = JSON.parse(readFileSync(contextPath, "utf8")) as Record<string, unknown>;
    graph.riskTier = "high";
    writeFileSync(contextPath, JSON.stringify(graph, null, 2));

    const ledger = openLedger(workspace);
    const sessionId = `voice-cap-${Date.now()}`;
    const baseMeta = { questionId: "AMC-VOICE-1", trustTier: "OBSERVED" };

    ledger.appendEvidence({
      sessionId,
      runtime: "gateway",
      eventType: "metric",
      payload: "voice impersonation block rate = 0.99",
      meta: { ...baseMeta, metricKey: "voice_impersonation_block_rate" },
    });
    ledger.appendEvidence({
      sessionId,
      runtime: "gateway",
      eventType: "metric",
      payload: "voice consent verification rate = 1.0",
      meta: { ...baseMeta, metricKey: "voice_consent_verification_rate" },
    });
    ledger.appendEvidence({
      sessionId,
      runtime: "gateway",
      eventType: "metric",
      payload: "voice session hijack detection rate = 1.0",
      meta: { ...baseMeta, metricKey: "voice_session_hijack_detection_rate" },
    });
    ledger.appendEvidence({
      sessionId,
      runtime: "gateway",
      eventType: "audit",
      payload: JSON.stringify({ ok: true }),
      meta: { ...baseMeta, auditType: "VOICE_DEEPFAKE_FLAGGED" },
    });
    ledger.appendEvidence({
      sessionId,
      runtime: "gateway",
      eventType: "audit",
      payload: JSON.stringify({ ok: true }),
      meta: { ...baseMeta, auditType: "VOICE_CONSENT_VERIFIED" },
    });
    ledger.appendEvidence({
      sessionId,
      runtime: "gateway",
      eventType: "artifact",
      payload: JSON.stringify({ report: true }),
      meta: baseMeta,
      payloadPath: ".amc/reports/realtime-voice-safety-report.json",
    });
    ledger.sealSession(sessionId);
    ledger.close();

    const report = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto",
    });

    const voice = report.questionScores.find((row) => row.questionId === "AMC-VOICE-1");
    expect(voice).toBeTruthy();
    expect(voice!.supportedMaxLevel).toBeLessThanOrEqual(2);
    expect(voice!.flags).toContain("FLAG_MISSING_LLM_EVIDENCE");
  });
});
