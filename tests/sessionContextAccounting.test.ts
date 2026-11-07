import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { openLedger } from "../src/ledger/ledger.js";
import { sha256Hex } from "../src/utils/hash.js";
import { sessionContextAccounting, renderSessionContextAccounting } from "../src/session/sessionContextAccounting.js";
import { sessionTokenCounts } from "../src/session/sessionTokenCounts.js";
import { contextNotification } from "../src/agent/agentDriverSupport.js";

/**
 * SH-LOOP-07: context occupancy is per REQUEST. A turn reports its last measured step's prompt and its peak, never
 * the sum the cost fold reports; an unmeasured step stays null; the window is null unless a signed row recorded it.
 */
let workspace: string;
beforeEach(() => { workspace = mkdtempSync(join(tmpdir(), "amc-context-accounting-")); initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" }); });
afterEach(() => { rmSync(workspace, { recursive: true, force: true }); });

it("reports last and peak prompt tokens per turn, keeps null null, and matches the live notification", () => {
  const session = new SessionService(workspace);
  session.open({ agentId: "default", harnessVersion: "t", compositionDigest: sha256Hex("c"), policyDigest: sha256Hex("p") });
  session.recordSystemPrompt("prompt");
  session.startTurn({ trigger: "user" });
  session.startStep(); session.endStep({ stopReason: "tool_calls", usage: { inputTokens: 100, outputTokens: 5, cacheRead: 20, cacheWrite: null } });
  session.startStep(); session.endStep({ stopReason: "stop", usage: { inputTokens: 140, outputTokens: 5, cacheRead: 30, cacheWrite: null } });
  session.endTurn({ reason: "complete", cancelCause: null }); session.sealTurn();
  session.startTurn({ trigger: "followup" });
  session.startStep(); session.endStep({ stopReason: "stop", usage: null });
  session.endTurn({ reason: "complete", cancelCause: null }); session.sealTurn();
  session.close({ reason: "completed" });
  const ledger = openLedger(workspace, { readonly: true });
  const rows = ledger.getAllEvents().filter(row => row.session_id === session.sessionId);
  ledger.close();
  const accounting = sessionContextAccounting(rows);
  // MUTATION: fold `inputTokens` as a sum and turn 1's last prompt reads 290, not 170.
  expect(accounting.turns[0]).toMatchObject({ turn: 1, steps: 2, measuredSteps: 2, lastPromptTokens: 170, maxPromptTokens: 170, contextWindowTokens: null, ratio: null, compactions: 0 });
  expect(sessionTokenCounts(rows).turns[0]?.tokens.inputTokens).toBe(240); // the cost fold sums; occupancy must not
  // MUTATION: replace null with 0 and this reads 0.
  expect(accounting.turns[1]).toMatchObject({ turn: 2, steps: 1, measuredSteps: 0, lastPromptTokens: null, maxPromptTokens: null });
  expect(renderSessionContextAccounting(accounting).join("\n")).toContain("turn 2: last prompt unmeasured");
  expect(contextNotification(1, 2, { inputTokens: 140, outputTokens: 5, cacheRead: 30, cacheWrite: null }, 1000)).toEqual({ kind: "context", turn: 1, step: 2, promptTokens: 170, contextWindowTokens: 1000, ratio: 0.17 });
  expect(contextNotification(2, 1, null, 1000)).toMatchObject({ promptTokens: null, ratio: null });
});
