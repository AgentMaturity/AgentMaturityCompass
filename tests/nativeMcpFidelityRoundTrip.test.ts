import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { runNeutralImport } from "../src/importers/neutralImporter.js";
import { nativeMcpToolName } from "../src/mcp/nativeMcpClient.js";
import { projectNativeMcpResult } from "../src/mcp/nativeMcpResources.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { readNativeSessionEvents } from "../src/session/readNativeSessionEvents.js";
import { SessionService } from "../src/session/sessionService.js";
import { initToolsConfig, loadVerifiedToolsConfigSnapshot } from "../src/toolhub/toolhubValidators.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
function workspace(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0).reverse()) rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

test("MCP structured content, binary losses and untrusted provenance survive native recording and neutral import", () => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "wp21-fidelity-fixture-passphrase");
  const source = workspace("amc-mcp-fidelity-source-");
  const destination = workspace("amc-mcp-fidelity-import-");
  initToolsConfig(destination);
  const before = loadVerifiedToolsConfigSnapshot(destination);
  expect(before.signatureValid).toBe(true);

  const blob = Buffer.from("synthetic report attachment");
  const catalog = { serverId: "roundtrip", digest: sha256Hex("reviewed synthetic catalog") };
  const remoteResult = {
    content: [
      { type: "text", text: "Synthetic report with an omitted attachment." },
      { type: "resource", resource: { uri: "fixture://documents/report", mimeType: "application/octet-stream", blob: blob.toString("base64") } }
    ],
    structuredContent: { report: { title: "Synthetic report", rows: [{ label: "sample", count: 2 }] } }
  };
  const projected = projectNativeMcpResult(remoteResult, catalog, canonicalize);
  const expectedLosses = [{ path: "content[1].resource.blob", reason: "binary-not-retained", byteLength: blob.byteLength, sha256: sha256Hex(blob) }];
  const expectedProvenance = { serverId: catalog.serverId, catalogDigest: catalog.digest, trust: "untrusted-external",
    byteLength: Buffer.byteLength(canonicalize(remoteResult)), contentSha256: sha256Hex(canonicalize(remoteResult)) };
  expect(projected).toMatchObject({ structuredContent: remoteResult.structuredContent, amcLosses: expectedLosses, amcProvenance: expectedProvenance });
  expect(projected.content).toEqual([remoteResult.content[0], {
    type: "resource", resource: { uri: "fixture://documents/report", mimeType: "application/octet-stream",
      byteLength: blob.byteLength, sha256: sha256Hex(blob), dataOmitted: true }
  }]);
  const output = JSON.stringify(projected);
  expect(output).not.toContain(blob.toString("base64"));

  const session = new SessionService(source);
  let sessionId: string;
  try {
    session.open({ agentId: "default", harnessVersion: "wp21-fidelity-fixture",
      compositionDigest: sha256Hex("fixture composition"), policyDigest: sha256Hex("fixture policy") });
    sessionId = session.sessionId;
    session.startTurn({ trigger: "user" });
    session.startStep();
    session.recordToolCall({ toolCallId: "mcp-roundtrip-call", toolName: nativeMcpToolName(catalog.serverId, "lookup"),
      dispatch: "native", parentToken: null, args: JSON.stringify({ query: "synthetic report" }) });
    session.recordToolResult({ toolCallId: "mcp-roundtrip-call", outcome: "OK", exitCode: 0,
      timedOut: false, denied: false, content: output });
    session.endStep({ stopReason: "end_turn", usage: null });
    session.endTurn({ reason: "complete" });
    session.sealTurn();
    session.close({ reason: "completed" });
  } finally { session.disposeWithoutClosing(); }

  const row = readNativeSessionEvents(source, sessionId).find(event => event.event_type === "tool/result");
  expect(row).toBeDefined();
  const payload = readEventPayload(source, row!);
  expect(payload.status).toBe("ok");
  if (payload.status !== "ok") throw new Error("Native MCP result payload is unavailable");
  expect(payload.bytes.toString("utf8")).toBe(output);
  expect(row!.payload_sha256).toBe(sha256Hex(output));

  // This portable event log imports as external evidence, never as resumable native history.
  const inputPath = join(source, "mcp-result-export.jsonl");
  writeFileSync(inputPath, JSON.stringify({ event_type: "tool/result", ts: row!.ts,
    toolCallId: "mcp-roundtrip-call", output: payload.bytes.toString("utf8") }) + "\n");
  const imported = runNeutralImport({ workspace: destination, inputPath, agentId: "default", mode: "import", retainOriginals: false });
  expect(imported.applied).toBe(true);
  expect(imported.plan.normalization).toMatchObject({ sourceTrust: "SELF_REPORTED", evaluation: "NOT_EVALUATED" });
  const normalized = JSON.parse(readFileSync(imported.normalizedPath!, "utf8")) as {
    artifacts: Array<{ data: Array<{ output: string }>; traces: Array<{ output: unknown }> }>;
  };
  const retained = normalized.artifacts[0]!.data[0]!.output;
  expect(retained).toBe(output);
  expect(normalized.artifacts[0]!.traces[0]!.output).toBe(output);
  expect(JSON.parse(retained)).toMatchObject({ structuredContent: remoteResult.structuredContent,
    amcLosses: expectedLosses, amcProvenance: expectedProvenance });

  const report = JSON.parse(readFileSync(imported.diagnosticReportPath!, "utf8")) as {
    verificationPassed: boolean;
    importProvenance: { evaluationPerformed: boolean; sourceTrustTier: string };
  };
  expect(report).toMatchObject({ verificationPassed: false,
    importProvenance: { evaluationPerformed: false, sourceTrustTier: "SELF_REPORTED" } });
  const after = loadVerifiedToolsConfigSnapshot(destination);
  expect(after.signatureValid).toBe(true);
  expect(after.digestSha256).toBe(before.digestSha256);
  expect(after.config?.tools.allowedTools.some(tool => tool.name === nativeMcpToolName(catalog.serverId, "lookup"))).toBe(false);
  expect(readNativeSessionEvents(destination, sessionId)).toEqual([]);
});
