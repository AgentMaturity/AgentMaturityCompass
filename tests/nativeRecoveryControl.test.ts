import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { SessionService } from "../src/session/sessionService.js";
import { loadSessionEventHistory } from "../src/session/sessionEventHistory.js";
import { resumeSession } from "../src/session/sessionResume.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { TurnCancelCause } from "../src/session/sessionTypes.js";

const OPEN = { agentId: "default", harnessVersion: "native-recovery-control-test",
  compositionDigest: sha256Hex("native-control-composition"), policyDigest: sha256Hex("native-control-policy") };
const claimant = { pid: process.pid, hostId: hostname(), bootId: "native-control-regression", startedAt: Date.now() };
const services: SessionService[] = [];
let workspace: string;
let prior: Record<string, string | undefined>;
beforeEach(() => {
  prior = Object.fromEntries(["AMC_VAULT_PASSPHRASE", "AMC_SESSION_STORE", "AMC_NO_SIGN", "AMC_EXPECTED_MONITOR_FINGERPRINT"].map(key => [key, process.env[key]]));
  process.env.AMC_VAULT_PASSPHRASE = "disposable-native-control-regression";
  for (const key of ["AMC_SESSION_STORE", "AMC_NO_SIGN", "AMC_EXPECTED_MONITOR_FINGERPRINT"]) delete process.env[key];
  const parent = process.env.AMC_RECOVERY_CONTROL_RECEIPTS ?? tmpdir();
  mkdirSync(parent, { recursive: true }); workspace = mkdtempSync(join(parent, "native-control-"));
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
});
afterEach(() => {
  for (const service of services.splice(0).reverse()) service.disposeWithoutClosing();
  lockVault(workspace);
  for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  // Preserve new private fixtures and failed attempts; no retained-output erasure.
});
function open(sessionId?: string) {
  const service = new SessionService(workspace); services.push(service);
  service.open({ ...OPEN, ...(sessionId ? { sessionId } : {}) }); return service;
}
function complete(service: SessionService, cause?: TurnCancelCause, requested = false) {
  service.startTurn({ trigger: "user" }); service.recordUserMessage("Explicit signed control fixture.");
  if (requested && cause) service.recordLoopEvent({ kind: "cancel", cause, keepInbox: false,
    requestedBy: "original-controller", observedHeadEventId: null, phase: "idle" });
  service.endTurn(cause && !requested ? { reason: "cancelled", cause } : { reason: "complete" });
  service.sealTurn();
}
function resume(sessionId: string, extra: Partial<typeof OPEN> = {}) {
  const result = resumeSession({ workspace, sessionId, ...OPEN, ...extra, claimant });
  services.push(result.service); return result;
}
function history() { return loadSessionEventHistory({ workspace }).events; }

describe.each(["sqlite", "jsonl"] as const)("native continuation controls on %s", backend => {
  beforeEach(() => { openSessionEventStore(workspace, backend).close(); });
  test.each(["compositionDigest", "policyDigest"] as const)("changed %s refuses before writer acquisition", field => {
    const service = open(); complete(service); service.releaseWithoutClosing(); const before = history();
    expect(() => resume(service.sessionId, { [field]: sha256Hex(`changed-${field}`) })).toThrow(/original execution settings/);
    expect(history()).toEqual(before);
  });
  test.each(["parent", "hook"] as const)("%s stopped sessions retain the original controller refusal", kind => {
    const service = open(); complete(service, kind === "hook" ? { kind, reason: "original-signed-control" } : { kind });
    service.releaseWithoutClosing(); const before = history();
    expect(() => resume(service.sessionId)).toThrow(/parent or policy control/);
    expect(history()).toEqual(before);
  });
  test("a requested parent stop cannot be erased by a subsequently complete ending", () => {
    const service = open(); complete(service, { kind: "parent" }, true); service.releaseWithoutClosing(); const before = history();
    expect(() => resume(service.sessionId)).toThrow(/parent or policy control/); expect(history()).toEqual(before);
  });
  test("a delegated child cannot become a standalone root-agent writer", () => {
    const childId = randomUUID(), parent = open();
    parent.recordLoopEvent({ kind: "delegation-started", childRunAs: "child", childSessionId: childId,
      governedAs: "default", depth: 1, packetId: "signed-control-fixture-packet" });
    complete(parent); parent.close({ reason: "completed" });
    const child = open(childId); complete(child); child.releaseWithoutClosing(); const before = history();
    expect(() => resume(childId)).toThrow(/retain its parent controller/); expect(history()).toEqual(before);
  });
  test("a parent cannot abandon an unresolved child during continuation", () => {
    const parent = open();
    parent.recordLoopEvent({ kind: "delegation-started", childRunAs: "child", childSessionId: randomUUID(),
      governedAs: "default", depth: 1, packetId: "signed-unresolved-child-fixture" });
    complete(parent); parent.releaseWithoutClosing(); const before = history();
    expect(() => resume(parent.sessionId)).toThrow(/child session has not reached/); expect(history()).toEqual(before);
  });
  test("normal user cancellation can resume without replay under the original controls", () => {
    const service = open(); complete(service, { kind: "user" }); service.releaseWithoutClosing(); const before = history();
    const continued = resume(service.sessionId).service;
    expect(continued.sessionId).toBe(service.sessionId); expect(history().slice(0, before.length)).toEqual(before);
    expect(history().filter(row => row.event_type === "turn/start")).toHaveLength(1);
    complete(continued); continued.close({ reason: "completed" });
    expect(history().filter(row => row.event_type === "turn/start")).toHaveLength(2);
    expect(loadSessionEventHistory({ workspace, requireSealed: true }).sealed).toBe(true);
  });
});
