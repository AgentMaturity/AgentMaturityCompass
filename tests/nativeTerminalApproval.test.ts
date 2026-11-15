import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
import { cliInitiator, createApprovalForIntent, decideApprovalForIntent, verifyApprovalForExecution } from "../src/approvals/approvalEngine.js";
import { approvalRequestBindingDigest, listApprovalDecisions, markApprovalConsumed } from "../src/approvals/approvalChainStore.js";
import { evaluateApprovalQuorum } from "../src/approvals/approvalQuorum.js";
import { getApprovalInboxItem } from "../src/approvals/approvalInbox.js";
import { createNativeInteractiveApprovals } from "../src/setup/nativeInteractiveApprovals.js";
import { describeReportedCall } from "../src/setup/nativeApprovalPreview.js";
import { AGENT_ENV_MARKERS } from "../src/vault/operatorContext.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";

// H-03: the person at the chat terminal sees the call and decides it with one key, where the policy lets one person decide.
const roots: string[] = [];
let tty: PropertyDescriptor | undefined;
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "terminal-approval-fixture-only");
  for (const marker of AGENT_ENV_MARKERS) vi.stubEnv(marker, "");
  tty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
});
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  if (tty === undefined) delete (process.stdin as { isTTY?: boolean }).isTTY; else Object.defineProperty(process.stdin, "isTTY", tty);
  vi.unstubAllEnvs();
});

const WRITE = '{"path":"notes.txt","content":"hello\\n"}';
function fixture(actionClass: "WRITE_LOW" | "WRITE_HIGH" = "WRITE_LOW", rawArguments = WRITE) {
  const workspace = mkdtempSync(join(tmpdir(), "amc-terminal-approval-")); roots.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initActionPolicy(workspace); initToolsConfig(workspace); initBudgets(workspace, "default");
  const approvalId = `apr_${randomUUID()}`;
  const intentPayload = { toolName: "fs.write", rawArguments };
  const created = createApprovalForIntent({ workspace, agentId: "default", intentId: approvalId, toolName: "fs.write", actionClass,
    requestedMode: "EXECUTE", effectiveMode: "EXECUTE", riskTier: "medium", intentPayload, initiator: cliInitiator() });
  return { workspace, approvalId, approvalRequestId: created.request.approvalRequestId, intentHash: sha256Hex(canonicalize(intentPayload)) };
}
const childFixture = () => Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, kill: vi.fn(() => true) }) as unknown as ChildProcess;

async function review(f: ReturnType<typeof fixture>, rawArguments: string, keyAnswer: string | null) {
  const child = childFixture(), logs: string[] = [], errors: string[] = [];
  const key = vi.fn(async (_prompt: string) => keyAnswer), question = vi.fn(async (_prompt: string) => "cancel");
  const helper = createNativeInteractiveApprovals({ child, workspace: f.workspace, entry: "unused-cli.js", question, key,
    log: line => logs.push(line), error: line => errors.push(line) });
  child.emit("message", { type: "amc/native-approval-raised", v: 1, agentId: "default", approvalId: f.approvalId,
    approvalRequestId: f.approvalRequestId, call: { toolName: "fs.write", rawArguments } });
  await vi.waitFor(() => expect(key.mock.calls.length + question.mock.calls.length).toBeGreaterThan(0));
  await helper.close();
  return { child, logs: logs.join("\n"), errors, key, question,
    rows: listApprovalDecisions({ workspace: f.workspace, agentId: "default", approvalRequestId: f.approvalRequestId, includeUncounted: true }) };
}

describe("one-key approval at the chat terminal", () => {
  it("shows the change, takes y, and records a terminal approval by the OS account that covers only this call", async () => {
    const f = fixture();
    const r = await review(f, WRITE, "y");
    expect(r.logs).toContain("The agent wants to: Write a file");
    expect(r.logs).toContain("New file: notes.txt");
    expect(r.logs).toContain("+hello");
    expect(r.logs).toContain("Allowed once. Recorded as approved at this terminal by");
    expect(r.question).not.toHaveBeenCalled();
    expect(r.child.kill).not.toHaveBeenCalled();
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ decision: "APPROVE_EXECUTE", authentication: "terminal", username: cliInitiator(), roles: ["OWNER"] });
    const verify = (expectedIntentHash: string) => verifyApprovalForExecution({ workspace: f.workspace, approvalId: f.approvalRequestId,
      expectedAgentId: "default", expectedIntentHash, expectedToolName: "fs.write", expectedActionClass: "WRITE_LOW" });
    expect(verify(f.intentHash).ok).toBe(true);
    // A different call cannot spend it, and once used it serves no second call.
    expect(verify(sha256Hex(canonicalize({ toolName: "fs.write", rawArguments: '{"path":"notes.txt","content":"other\\n"}' }))).ok).toBe(false);
    markApprovalConsumed({ workspace: f.workspace, agentId: "default", approvalRequestId: f.approvalRequestId, reason: "ran once" });
    expect(verify(f.intentHash).ok).toBe(false);
  });

  it("records n as a refusal, and any other answer stops the turn with nothing recorded", async () => {
    const denied = await review(fixture(), WRITE, "n");
    expect(denied.rows.map(row => [row.decision, row.authentication])).toEqual([["DENY", "terminal"]]);
    expect(denied.child.kill).not.toHaveBeenCalled();
    const stopped = await review(fixture(), WRITE, null);
    expect(stopped.rows).toEqual([]);
    expect(stopped.child.kill).toHaveBeenCalledWith("SIGINT");
  });

  it("never shows or offers one key for arguments that differ from the signed request", async () => {
    const r = await review(fixture(), '{"path":"notes.txt","content":"something else\\n"}', "y");
    expect(r.logs).toContain("the arguments sent do not match the signed request");
    expect(r.logs).not.toContain("something else");
    expect(r.key).not.toHaveBeenCalled();
    expect(r.question.mock.calls[0]?.[0]).toContain("approve, deny, or cancel");
    expect(r.rows).toEqual([]);
  });

  it("shows an argument the summary does not use, and offers no key when any part of the call is cut short", async () => {
    const extra = '{"path":"notes.txt","content":"hello\\n","mode":"0777"}';
    const shownAll = await review(fixture("WRITE_LOW", extra), extra, "y");
    expect(shownAll.logs).toContain("Other arguments:");
    expect(shownAll.logs).toContain("mode: 0777");
    expect(shownAll.key).toHaveBeenCalled();
    const long = JSON.stringify({ path: "notes.txt", content: Array.from({ length: 130 }, (_, i) => `line ${i}`).join("\n") });
    const cut = await review(fixture("WRITE_LOW", long), long, "y");
    expect(cut.logs).toContain("more lines are not shown here");
    expect(cut.logs).toContain("cannot be allowed with one key");
    expect(cut.key).not.toHaveBeenCalled();
    expect(cut.question.mock.calls[0]?.[0]).toContain("approve, deny, or cancel");
    expect(cut.rows).toEqual([]);
  });

  it("keeps signed-in reviewers where the rule asks for two different people", async () => {
    const f = fixture("WRITE_HIGH");
    const r = await review(f, WRITE, "y");
    expect(r.logs).toContain("Needs 2 approvals");
    expect(r.key).not.toHaveBeenCalled();
    expect(r.rows).toEqual([]);
    const request = getApprovalInboxItem({ workspace: f.workspace, agentId: "default", approvalRequestId: f.approvalRequestId }).request;
    expect(() => decideApprovalForIntent({ workspace: f.workspace, agentId: "default", approvalId: f.approvalRequestId, decision: "APPROVED",
      mode: "EXECUTE", reason: "r", reviewerAuthentication: "terminal", username: "a", userId: "a", userRoles: ["OWNER"],
      expectedRequestDigestSha256: approvalRequestBindingDigest(request) })).toThrow(/cannot be approved from the terminal alone/);
    // A terminal row written by any other means is never counted toward such a request.
    const forged = { v: 1, approvalDecisionId: "d1", approvalRequestId: f.approvalRequestId, agentId: "default", userId: "a", username: "a",
      roles: ["OWNER"], decision: "APPROVE_EXECUTE", reason: "r", authentication: "terminal", decisionTs: Date.now() } as const;
    const quorum = evaluateApprovalQuorum({ request, decisions: [forged, { ...forged, approvalDecisionId: "d2", userId: "b", username: "b" }] as never });
    expect(quorum.received).toBe(0);
  });

  it("refuses a terminal decision to anyone not at an interactive terminal, such as the agent", () => {
    const f = fixture();
    const request = getApprovalInboxItem({ workspace: f.workspace, agentId: "default", approvalRequestId: f.approvalRequestId }).request;
    const decide = () => decideApprovalForIntent({ workspace: f.workspace, agentId: "default", approvalId: f.approvalRequestId, decision: "APPROVED",
      mode: "EXECUTE", reason: "r", reviewerAuthentication: "terminal", username: "a", userId: "a", userRoles: ["OWNER"],
      expectedRequestDigestSha256: approvalRequestBindingDigest(request) });
    vi.stubEnv("CLAUDECODE", "1");
    expect(decide).toThrow(/agent marker CLAUDECODE/);
    vi.stubEnv("CLAUDECODE", "");
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    expect(decide).toThrow(/stdin is not a terminal/);
    expect(listApprovalDecisions({ workspace: f.workspace, agentId: "default", approvalRequestId: f.approvalRequestId, includeUncounted: true })).toEqual([]);
  });
});

describe("what the prompt shows", () => {
  it("shows an edit as a diff, a network call as its host, and never passes terminal controls through", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-terminal-preview-")); roots.push(workspace);
    writeFileSync(join(workspace, "a.txt"), "one\ntwo\n");
    const edit = describeReportedCall(workspace, { toolName: "fs.edit", rawArguments: JSON.stringify({ path: "a.txt", find: "two", replace: "2" }) });
    expect(edit.title).toBe("Edit a file");
    expect(edit.lines).toEqual(expect.arrayContaining(["Change to: a.txt", "-two", "+2"]));
    const fetch = describeReportedCall(workspace, { toolName: "web_fetch", arguments: { url: "https://example.org/x?y=1" } });
    expect(fetch.lines[0]).toBe("Host:    example.org");
    const sneaky = describeReportedCall(workspace, { toolName: "bash", arguments: { command: "ls\u001b[2K\u001b[1Arm -rf ~" } });
    expect(sneaky.lines.join("\n")).not.toContain("\u001b");
  });

  it("lists every argument after a summary, and marks a call with a cut argument as not shown in full", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-terminal-preview-")); roots.push(workspace);
    const fetch = describeReportedCall(workspace, { toolName: "web_fetch", arguments: { url: "https://example.org/", method: "POST", body: "secret=1" } });
    expect(fetch.lines).toEqual(expect.arrayContaining(["  method: POST", "  body: secret=1"]));
    expect(fetch.complete).toBe(true);
    const bash = describeReportedCall(workspace, { toolName: "bash", arguments: { command: "ls", timeoutMs: 5, env: { A: "1" } } });
    expect(bash.lines).toEqual(expect.arrayContaining(["  timeoutMs: 5", '  env: {"A":"1"}']));
    // A url on another tool gets no network summary: every argument is listed as it is.
    const other = describeReportedCall(workspace, { toolName: "custom.post", arguments: { url: "https://example.org/", payload: "x" } });
    expect(other.title).toBe('Call the tool "custom.post"');
    expect(other.lines).toContain("payload: x");
    const hidden = describeReportedCall(workspace, { toolName: "bash", arguments: { command: `${"a".repeat(500)}; curl evil` } });
    expect(hidden.complete).toBe(false);
    expect(hidden.lines.join("\n")).toContain("more characters not shown");
    expect(describeReportedCall(workspace, { toolName: "bash", arguments: { command: "ls" } }).complete).toBe(true);
  });
});
