import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { loadSessionEventHistory } from "../src/session/sessionEventHistory.js";
import * as payloadReader from "../src/session/eventPayload.js";
import { sha256Hex } from "../src/utils/hash.js";
import { lockVault } from "../src/vault/vault.js";
import { renderNativeInteractiveToolResults } from "../src/setup/nativeInteractiveResults.js";

// Real signed disposable histories. These tests measure presentation contracts,
// not human usability, installed-package acceptance or provider correctness.
describe("native chat recorded tool results", () => {
  let workspace: string;
  beforeEach(() => {
    for (const name of ["AMC_SESSION_STORE", "AMC_EXPECTED_MONITOR_FINGERPRINT", "AMC_NO_SIGN"]) vi.stubEnv(name, undefined);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-native-chat-results");
    workspace = mkdtempSync(join(tmpdir(), "amc-chat-results-"));
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  });
  afterEach(() => { lockVault(workspace); vi.restoreAllMocks(); vi.unstubAllEnvs(); rmSync(workspace, { recursive: true, force: true }); });
  function start(backend: "sqlite" | "jsonl" = "jsonl", spill = false): SessionService {
    const session = new SessionService(workspace, openSessionEventStore(workspace, backend),
      spill ? { maxInlineBytes: 1024, previewHeadBytes: 32, previewTailBytes: 16 } : {});
    session.open({ sessionId: "result-session", agentId: "default", harnessVersion: "synthetic-chat-results",
      compositionDigest: sha256Hex("composition"), policyDigest: sha256Hex("policy") });
    return session;
  }
  function turn(session: SessionService, content: string, outcome: "OK" | "ERROR" | "TOOL_OUTCOME_UNKNOWN" = "OK", calls = 1): void {
    session.startTurn({ trigger: "user" }); session.startStep();
    for (let index = 0; index < calls; index++) {
      const toolCallId = `call-${session.sessionId}-${index}-${content.length}`;
      session.recordToolCall({ toolCallId, toolName: "fs.read", args: "{}", dispatch: "native", parentToken: null });
      session.recordToolResult({ toolCallId, outcome, exitCode: outcome === "OK" ? 0 : outcome === "ERROR" ? 42 : null,
        timedOut: false, denied: false, content });
    }
    session.endStep({ stopReason: "end_turn", usage: null }); session.endTurn({ reason: "complete" }); session.sealTurn();
  }
  function finish(session: SessionService): void { session.close({ reason: "completed" }); session.disposeWithoutClosing(); }

  it.each(["sqlite", "jsonl"] as const)("shows only the latest %s turn and keeps the recorded outcome separate", backend => {
    const session = start(backend); turn(session, "old result"); turn(session, "latest result", "ERROR"); finish(session);
    const before = loadSessionEventHistory({ workspace }).headEventHash;
    const lines = renderNativeInteractiveToolResults(workspace, "result-session").join("\n");
    expect(lines).toContain("turn 2"); expect(lines).toContain("fs.read"); expect(lines).toContain("ERROR");
    expect(lines).toContain("exit 42"); expect(lines).toContain("latest result"); expect(lines).not.toContain("old result");
    expect(loadSessionEventHistory({ workspace }).headEventHash).toBe(before);
  });
  it("escapes terminal controls in results and never turns an unknown outcome into success", () => {
    const session = start(); turn(session, "unsafe\u001b[2J\rtext\u009b", "TOOL_OUTCOME_UNKNOWN"); finish(session);
    const lines = renderNativeInteractiveToolResults(workspace, "result-session").join("\n");
    expect(lines).toContain("TOOL_OUTCOME_UNKNOWN"); expect(lines).not.toContain("\u001b");
    expect(lines).not.toContain("\r"); expect(lines).not.toContain("\u009b"); expect(lines).toContain("unsafe");
  });
  it("labels missing payloads without printing invented or stale result text", () => {
    const session = start(); turn(session, "private result"); finish(session);
    const result = loadSessionEventHistory({ workspace }).events.find(row => row.event_type === "tool/result")!;
    unlinkSync(join(workspace, result.payload_path!));
    const lines = renderNativeInteractiveToolResults(workspace, "result-session").join("\n");
    expect(lines).toContain("payload missing"); expect(lines).not.toContain("private result");
  });
  it("refuses a payload reader's bytes when they do not match the signed commitment", () => {
    const session = start(); turn(session, "authentic result"); finish(session);
    vi.spyOn(payloadReader, "readEventPayload").mockReturnValue({ status: "ok", bytes: Buffer.from("forged result") });
    const lines = renderNativeInteractiveToolResults(workspace, "result-session").join("\n");
    expect(lines).toContain("payload digest mismatch"); expect(lines).not.toContain("forged result");
  });
  it("refuses unauthenticated metadata before reading or presenting its payload", () => {
    const session = start(); turn(session, "must not render"); finish(session);
    const path = join(workspace, ".amc/jsonl/events.jsonl");
    const rows = readFileSync(path, "utf8").trim().split("\n").map(line => JSON.parse(line));
    rows.find(row => row.event_type === "tool/result").writer_sig = "forged";
    writeFileSync(path, rows.map(row => JSON.stringify(row)).join("\n") + "\n");
    const read = vi.spyOn(payloadReader, "readEventPayload");
    const lines = renderNativeInteractiveToolResults(workspace, "result-session").join("\n");
    expect(lines).toContain("Tool results unavailable"); expect(lines).not.toContain("must not render"); expect(read).not.toHaveBeenCalled();
  });
  it("bounds the number and length of displayed results and identifies hidden output", () => {
    const session = start(); turn(session, "long output ".repeat(1000), "OK", 10); finish(session);
    const lines = renderNativeInteractiveToolResults(workspace, "result-session").join("\n");
    expect(lines).toContain("display truncated"); expect(lines).toContain("2 more tool results"); expect(lines.length).toBeLessThan(22_000);
  });
  it("shows an existing spill locator as a preview boundary without decrypting retained output", () => {
    const session = start("jsonl", true); turn(session, "retained output ".repeat(1000)); finish(session);
    const lines = renderNativeInteractiveToolResults(workspace, "result-session").join("\n");
    expect(lines).toContain("retained output"); expect(lines).toContain("session.spill_read"); expect(lines).toContain("preview");
  });
});
