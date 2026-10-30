import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectAcpSessionPageState } from "../src/acp/acpSessionPageState.js";
import { projectSessionUpdates } from "../src/acp/acpProjection.js";
import { SessionService } from "../src/session/sessionService.js";
import { initWorkspace } from "../src/workspace.js";

let workspace: string, writer: SessionService;
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "wp20-page-state");
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-wp20-state-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  writer = new SessionService(workspace);
  writer.open({ agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
  writer.startTurn({ trigger: "user" }); writer.startStep();
  writer.recordApproval({ phase: "request", approvalId: "denied", toolCallId: "call", question: "Run?" });
  writer.recordApproval({ phase: "answer", approvalId: "denied", answer: "deny", answeredBy: "owner" });
  writer.recordApproval({ phase: "request", approvalId: "pending", toolCallId: "call2", question: "Waiting?" });
  writer.recordToolResult({ toolCallId: "call", outcome: "TOOL_OUTCOME_UNKNOWN", exitCode: null, timedOut: true, denied: false, content: "Effect may have happened." });
  writer.recordLoopEvent({ kind: "cancel", cause: { kind: "user" }, keepInbox: true, requestedBy: "owner", observedHeadEventId: null, phase: "running" });
  writer.endStep({ stopReason: "cancelled", usage: null }); writer.endTurn({ reason: "cancelled", cause: { kind: "user" } }); writer.sealTurn();
});
afterEach(() => { writer.disposeWithoutClosing(); rmSync(workspace, { recursive: true, force: true }); vi.unstubAllEnvs(); });
const state = () => projectAcpSessionPageState(workspace, writer.sessionId, writer.readEvents());

describe("WP20 fixed-snapshot status projection", () => {
  it("preserves cancellation, approval decisions, unknown outcomes and unavailable usage", () => {
    expect(state()).toMatchObject({ turn: { number: 1, cancellationRequested: true, lastEnd: { reason: "cancelled" } },
      approvals: { pending: 1, answered: 1, denied: 1, unavailable: 0 }, toolOutcomes: { unknown: 1, unavailable: 0 },
      usage: { status: "unavailable", totals: { inputTokens: { observedTokens: null } } }, validation: { status: "not-requested" } });
    const update = projectSessionUpdates(workspace, writer.readEvents(), 0).updates.find(row => row.sessionUpdate === "tool_call_update");
    expect(update).toMatchObject({ status: "failed", _meta: { "dev.agentmaturity.amc": { outcome: "TOOL_OUTCOME_UNKNOWN" } } });
  });

  it.each(["approval/request", "approval/answer", "turn/end"])("refuses malformed %s evidence rather than treating it as absent", eventType => {
    const rows = writer.readEvents().map(row => row.event_type === eventType ? { ...row, meta_json: "{}" } : row);
    expect(() => projectAcpSessionPageState(workspace, writer.sessionId, rows)).toThrow(/faithfully projected/);
  });

  it("refuses duplicate approval request identities across turns", () => {
    writer.startTurn({ trigger: "user" });
    writer.recordApproval({ phase: "request", approvalId: "denied", toolCallId: "later", question: "Reused identity?" });
    expect(state).toThrow(/faithfully projected/);
  });

  it("refuses an approval answer without a pending matching request", () => {
    writer.startTurn({ trigger: "user" });
    writer.recordApproval({ phase: "answer", approvalId: "unrequested", answer: "allow", answeredBy: "owner" });
    expect(state).toThrow(/faithfully projected/);
  });

  it("preserves an unrecognized tool outcome as unavailable rather than success or zero", () => {
    const rows = writer.readEvents().map(row => row.event_type === "tool/result"
      ? { ...row, meta_json: JSON.stringify({ ...JSON.parse(row.meta_json), outcome: "future-outcome" }) } : row);
    expect(projectAcpSessionPageState(workspace, writer.sessionId, rows).toolOutcomes).toEqual({ unknown: 0, unavailable: 1 });
  });

  it("rejects invalid projection ranges and missing sequence identities", () => {
    const rows = writer.readEvents();
    expect(() => projectSessionUpdates(workspace, rows, -1)).toThrow(/projection range/);
    expect(() => projectSessionUpdates(workspace, rows, 0, { to: rows.length + 1 })).toThrow(/projection range/);
    const tool = rows.find(row => row.event_type === "tool/result")!;
    expect(() => projectSessionUpdates(workspace, [{ ...tool, meta_json: JSON.stringify({ outcome: "TOOL_OUTCOME_UNKNOWN", toolCallId: "call" }) }], 0,
      { includeEventIdentity: true })).toThrow(/sequence identity/);
  });
});
