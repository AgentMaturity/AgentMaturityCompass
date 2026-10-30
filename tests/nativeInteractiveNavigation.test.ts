import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { loadSessionEventHistory } from "../src/session/sessionEventHistory.js";
import { sha256Hex } from "../src/utils/hash.js";
import { lockVault } from "../src/vault/vault.js";
import { listNativeInteractiveSessions, assertNativeInteractiveSelection, renderNativeInteractiveSession } from "../src/setup/nativeInteractiveNavigation.js";

let workspace: string;
const identity = { agentId: "default", harnessVersion: "navigation-test", compositionDigest: sha256Hex("composition"), policyDigest: sha256Hex("policy") };
beforeEach(() => {
  vi.stubEnv("AMC_SESSION_STORE", undefined); vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-chat-navigation");
  workspace = mkdtempSync(join(tmpdir(), "amc-chat-navigation-"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
});
afterEach(() => { lockVault(workspace); vi.unstubAllEnvs(); rmSync(workspace, { recursive: true, force: true }); });
function session(id: string, backend: "sqlite" | "jsonl" = "jsonl", runtime: "amc" | "claude" = "amc") {
  const service = new SessionService(workspace, openSessionEventStore(workspace, backend));
  service.open({ sessionId: id, runtime, ...identity });
  service.startTurn({ trigger: "user" }); service.recordUserMessage("private prompt must not become a session title");
  service.endTurn({ reason: "complete" }); service.sealTurn();
  return service;
}
it.each(["sqlite", "jsonl"] as const)("browses released %s sessions without acquiring a writer or revealing prompts", backend => {
  const service = session("released", backend); service.releaseWithoutClosing();
  const before = loadSessionEventHistory({ workspace }).headEventHash;
  const listed = listNativeInteractiveSessions(workspace, "default");
  expect(listed).toHaveLength(1); expect(listed[0]).toMatchObject({ sessionId: "released", source: "native", state: "released", canResume: true, turns: 1 });
  expect(renderNativeInteractiveSession(listed[0]!)).toContain("released");
  expect(JSON.stringify(listed)).not.toContain("private prompt");
  expect(assertNativeInteractiveSelection(workspace, "default", listed[0]!)).toEqual(listed[0]);
  expect(loadSessionEventHistory({ workspace }).headEventHash).toBe(before);
});
it("never treats an active writer as released, even after its turn was sealed", () => {
  const service = session("live");
  try {
    const selected = listNativeInteractiveSessions(workspace, "default")[0]!;
    expect(selected).toMatchObject({ state: "active", canResume: false });
    expect(() => assertNativeInteractiveSelection(workspace, "default", selected)).toThrow(/released/);
  } finally { service.releaseWithoutClosing(); }
});
it("shows sealed sessions as inspect/fork only", () => {
  const service = session("sealed"); service.close({ reason: "completed" }); service.disposeWithoutClosing();
  const selected = listNativeInteractiveSessions(workspace, "default")[0]!;
  expect(selected).toMatchObject({ state: "sealed", canResume: false });
  expect(() => assertNativeInteractiveSelection(workspace, "default", selected)).toThrow(/released/);
});
it("keeps imported or foreign runtime history browse-only", () => {
  const service = session("foreign", "jsonl", "claude"); service.releaseWithoutClosing();
  const selected = listNativeInteractiveSessions(workspace, "default")[0]!;
  expect(selected).toMatchObject({ source: "imported", canResume: false });
  expect(() => assertNativeInteractiveSelection(workspace, "default", selected)).toThrow(/Only native history/);
});
it("refuses stale selection when new signed rows have changed the selected session", () => {
  const service = session("changed"); service.releaseWithoutClosing();
  const selected = listNativeInteractiveSessions(workspace, "default")[0]!;
  expect(() => assertNativeInteractiveSelection(workspace, "default", { ...selected, headEventHash: "0".repeat(64) })).toThrow(/changed/);
});
it("refuses another agent's released session without changing the store", () => {
  const service = session("other-agent"); service.releaseWithoutClosing();
  const selected = listNativeInteractiveSessions(workspace, "reviewer")[0]!;
  expect(selected.canResume).toBe(false);
  expect(() => assertNativeInteractiveSelection(workspace, "reviewer", selected)).toThrow(/agent/);
});

it("keeps an active writer explicit while its next turn is still open", () => {
  const service = session("active-turn"); service.startTurn({ trigger: "user" });
  try {
    expect(listNativeInteractiveSessions(workspace, "default")[0]).toMatchObject({ state: "active", canResume: false });
  } finally { service.endTurn({ reason: "complete" }); service.sealTurn(); service.releaseWithoutClosing(); }
});
