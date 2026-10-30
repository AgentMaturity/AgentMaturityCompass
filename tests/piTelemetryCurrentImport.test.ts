import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createCurrentPiTelemetryBridge, PI_CURRENT_TELEMETRY_CONTRACT } from "../src/importers/piTelemetryCallbacks.js";
import { runNeutralImport } from "../src/importers/neutralImporter.js";

test("current Pi document imports through the public mapper without inferred maturity", async () => {
  const root = mkdtempSync(join(tmpdir(), "amc-pi-current-import-"));
  const workspace = join(root, "workspace"), inputPath = join(root, "telemetry.json"); mkdirSync(workspace);
  const bridge = createCurrentPiTelemetryBridge({ sourceContract: PI_CURRENT_TELEMETRY_CONTRACT });
  await bridge.telemetryContext.startSpan({ name: "pi.ai.request", attributes: { model: "model", "usage.input": 3, prompt: "PRIVATE" } }, () => "PRIVATE-RESULT");
  writeFileSync(inputPath, bridge.toJSON());
  try {
    const result = runNeutralImport({ workspace, inputPath, mode: "import", retainOriginals: false });
    expect(result.plan.candidates[0]?.sourceFormat).toMatchObject({ name: "pi-callback-telemetry", version: 2, sourceContract: PI_CURRENT_TELEMETRY_CONTRACT, sourceTrust: "SELF_REPORTED" });
    expect(result.plan.normalization?.recordMapping?.counts).toMatchObject({ mapped: 1, unlinkedTraces: 0 });
    expect(result.plan.normalization?.recordMapping?.sources[0]?.sourceRevision).toBe("6c384aa30f619d7b28963f2bab24d8dacbe73cb6");
    const report = JSON.parse(readFileSync(result.diagnosticReportPath!, "utf8"));
    expect(report).toMatchObject({ status: "UNSIGNED", verificationPassed: false, integrityIndex: 0, evidenceCoverage: 0,
      evidenceTrustCoverage: { observed: 0, attested: 0, selfReported: 1 }, questionScores: [], layerScores: [], importProvenance: { evaluationPerformed: false, sourceTrustTier: "SELF_REPORTED" } });
    expect(JSON.stringify(result.plan)).not.toContain("PRIVATE");
  } finally { bridge.close(); rmSync(root, { recursive: true, force: true }); }
});
