import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initActionPolicy } from "../src/governor/actionPolicyEngine.js";
import { initToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { createApprovalForIntent, decideApprovalForIntent, verifyApprovalForExecution } from "../src/approvals/approvalEngine.js";
import { getApprovalInboxItem } from "../src/approvals/approvalInbox.js";
import { inspectApprovalChainIntegrity, listApprovalDecisions } from "../src/approvals/approvalChainStore.js";
import { initUsersConfig, createSession, revokeSessionByToken } from "../src/auth/authApi.js";
import { readNativeApprovalActor } from "../src/setup/nativeApprovalIdentity.js";
import { createNativeInteractiveApprovals } from "../src/setup/nativeInteractiveApprovals.js";
import { getPrivateKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { sha256Hex } from "../src/utils/hash.js";

// Authored only; parent will execute with the deferred combined qualification.
const roots: string[] = [];
let oldPassphrase: string | undefined;
beforeEach(() => { oldPassphrase = process.env.AMC_VAULT_PASSPHRASE; process.env.AMC_VAULT_PASSPHRASE = "native-approvals-fixture-only"; });
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  if (oldPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE; else process.env.AMC_VAULT_PASSPHRASE = oldPassphrase;
  vi.restoreAllMocks();
});
function fixture(agentId = "default") {
  const workspace = mkdtempSync(join(tmpdir(), "amc-native-approval-")); roots.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId, trustBoundaryMode: "isolated" });
  initActionPolicy(workspace); initToolsConfig(workspace); initBudgets(workspace, agentId);
  const approvalId = `apr_${randomUUID()}`;
  const created = createApprovalForIntent({ workspace, agentId, intentId: approvalId,
    toolName: "fs.write", actionClass: "WRITE_LOW", requestedMode: "EXECUTE", effectiveMode: "EXECUTE", riskTier: "medium",
    intentPayload: { toolName: "fs.write", rawArguments: '{"path":"notes.txt"}' } });
  const approvalRequestId = created.request.approvalRequestId;
  const item = getApprovalInboxItem({ workspace, agentId, approvalRequestId });
  return { workspace, approvalId, approvalRequestId, created, item };
}
function signedArtifact(workspace: string, path: string) {
  const digest = sha256Hex(readFileSync(path));
  writeFileSync(`${path}.sig`, JSON.stringify({ digestSha256: digest, signature: signHexDigest(digest, getPrivateKeyPem(workspace, "auditor")), signedTs: Date.now(), signer: "auditor" }));
}
function childFixture() {
  const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, kill: vi.fn(() => true) });
  return child as unknown as ChildProcess;
}

describe("native approvals retain authenticated authority and exact request binding", () => {
  it("reviews the actual request for a matching nondefault native identity", async () => {
    const f = fixture("reviewer"), child = childFixture();
    let prompted!: () => void; const asked = new Promise<void>(resolve => { prompted = resolve; });
    const question = vi.fn(async () => { prompted(); return "cancel"; });
    const helper = createNativeInteractiveApprovals({ child, workspace: f.workspace, entry: "unused-cli.js", agentId: "reviewer",
      question, log: () => {}, error: () => {} });
    child.emit("message", { type: "amc/native-approval-raised", v: 1, agentId: "reviewer", approvalId: f.approvalId, approvalRequestId: f.approvalRequestId });
    await asked; await helper.close();
    expect(question).toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledWith("SIGINT");
    expect(listApprovalDecisions({ workspace: f.workspace, agentId: "reviewer", approvalRequestId: f.approvalRequestId })).toEqual([]);
  });

  it("refuses an IPC agent outside the parent-pinned identity before asking for approval", async () => {
    const f = fixture(), child = childFixture(), question = vi.fn(async () => "cancel");
    const errors: string[] = [];
    const helper = createNativeInteractiveApprovals({ child, workspace: f.workspace, entry: "unused-cli.js", agentId: "reviewer",
      question, log: () => {}, error: message => errors.push(message) });
    child.emit("message", { type: "amc/native-approval-raised", v: 1, agentId: "default", approvalId: f.approvalId, approvalRequestId: f.approvalRequestId });
    await helper.close();
    expect(question).not.toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledWith("SIGINT");
    expect(errors.join("\n")).toContain("invalid request identity");
    expect(listApprovalDecisions({ workspace: f.workspace, agentId: "default", approvalRequestId: f.approvalRequestId })).toEqual([]);
  });

  it("retains a reviewed digest across legitimate status transitions and rejects later changed request content", () => {
    const f = fixture();
    decideApprovalForIntent({ workspace: f.workspace, agentId: "default", approvalId: f.approvalRequestId,
      decision: "APPROVED", mode: "EXECUTE", reason: "reviewed exact request", username: "reviewer", userId: "reviewer-id", userRoles: ["OWNER"],
      expectedRequestDigestSha256: f.item.requestDigestSha256 });
    const verify = () => verifyApprovalForExecution({ workspace: f.workspace, approvalId: f.approvalRequestId,
      expectedAgentId: "default", expectedIntentId: f.approvalId, expectedToolName: "fs.write", expectedActionClass: "WRITE_LOW" });
    expect(verify().ok).toBe(true);
    const request = JSON.parse(readFileSync(f.created.filePath, "utf8"));
    request.boundHashes.intentHash = sha256Hex("different arguments");
    writeFileSync(f.created.filePath, JSON.stringify(request, null, 2)); signedArtifact(f.workspace, f.created.filePath);
    expect(inspectApprovalChainIntegrity({ workspace: f.workspace, agentId: "default", approvalRequestId: f.approvalRequestId }).reasonCodes).toContain("DECISION_REQUEST_BINDING_INVALID");
    expect(verify().ok).toBe(false);
  });

  it("refuses stale review before writing any decision and never defaults a bound reviewer to owner", () => {
    const f = fixture();
    const decide = (digest: string, actor = true) => decideApprovalForIntent({ workspace: f.workspace, agentId: "default", approvalId: f.approvalRequestId,
      decision: "APPROVED", mode: "EXECUTE", reason: "reviewed", expectedRequestDigestSha256: digest,
      ...(actor ? { username: "reviewer", userId: "reviewer", userRoles: ["OWNER" as const] } : {}) });
    expect(() => decide("0".repeat(64))).toThrow(/changed/);
    expect(() => decide(f.item.requestDigestSha256, false)).toThrow(/reviewer/);
    expect(listApprovalDecisions({ workspace: f.workspace, agentId: "default", approvalRequestId: f.approvalRequestId })).toEqual([]);
  });

  it("uses a real tracked actor and refuses its revoked token without inventing roles", () => {
    const f = fixture();
    const user = initUsersConfig({ workspace: f.workspace, username: "alice", password: "alice-fixture-password" }).owner;
    const session = createSession({ workspace: f.workspace, user });
    const path = join(f.workspace, "reviewer-session.txt"); writeFileSync(path, session.token, { mode: 0o600 });
    expect(readNativeApprovalActor(f.workspace, path)).toMatchObject({ userId: user.userId, username: "alice", roles: user.roles });
    revokeSessionByToken({ workspace: f.workspace, token: session.token });
    expect(() => readNativeApprovalActor(f.workspace, path)).toThrow(/active tracked workspace login/);
  });

  it("ignores stdout and cancels an actual IPC request without injecting a signed yes or no", async () => {
    const f = fixture(), child = childFixture(), question = vi.fn(async () => "cancel");
    let prompted!: () => void; const asked = new Promise<void>(resolve => { prompted = resolve; });
    question.mockImplementation(async () => { prompted(); return "cancel"; });
    const helper = createNativeInteractiveApprovals({ child, workspace: f.workspace, entry: "unused-cli.js", question, log: () => {}, error: () => {} });
    const event = { type: "amc/native-approval-raised", v: 1, agentId: "default", approvalId: f.approvalId, approvalRequestId: f.approvalRequestId };
    child.emit("data", JSON.stringify(event)); expect(question).not.toHaveBeenCalled();
    child.emit("message", event); await asked; await helper.close();
    expect(child.kill).toHaveBeenCalledWith("SIGINT");
    expect(listApprovalDecisions({ workspace: f.workspace, agentId: "default", approvalRequestId: f.approvalRequestId })).toEqual([]);
    expect(child.listenerCount("message")).toBe(0);
  });

  it("close aborts a pending prompt and ignores its late approve response", async () => {
    const f = fixture(), child = childFixture();
    let late!: (value: string) => void, entered!: () => void, signal: AbortSignal | undefined;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const helper = createNativeInteractiveApprovals({ child, workspace: f.workspace, entry: "unused-cli.js",
      question: async (_prompt, suppliedSignal) => { signal = suppliedSignal; entered(); return new Promise<string>(resolve => { late = resolve; }); }, log: () => {}, error: () => {} });
    child.emit("message", { type: "amc/native-approval-raised", v: 1, agentId: "default", approvalId: f.approvalId, approvalRequestId: f.approvalRequestId });
    await started; await helper.close(); late("approve");
    expect(signal?.aborted).toBe(true);
    expect(listApprovalDecisions({ workspace: f.workspace, agentId: "default", approvalRequestId: f.approvalRequestId })).toEqual([]);
  });
});
