import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveApiRolePolicy } from "../src/api/accessPolicy.js";
import { handleEvidenceRoute } from "../src/api/evidenceRouter.js";
import type { ApprovalRequestRecord } from "../src/approvals/approvalChainStore.js";
import { homedir } from "node:os";
import { approvalCallField, approvalCallFor, listAuditSessions, sessionAuditExport } from "../src/evidence/sessionAudit.js";
import { redactSecrets } from "../src/shield/redaction/redactSecrets.js";
import { buildSessionExport, verifySessionExport } from "../src/observability/sessionExport.js";
import { renderSessionExportHtml } from "../src/observability/sessionExportHtml.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { SessionService } from "../src/session/sessionService.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

/** UX-04/UX-05: a CLI session's actions are listed for the console, exported for an auditor, and shown to an approver. */
describe("session audit for the console", () => {
  let workspace: string;
  const defaultArgs = '{"path":"hello.txt","content":"hi\\n"}';
  const args = defaultArgs;
  beforeEach(() => {
    for (const name of ["AMC_SESSION_STORE", "AMC_EXPECTED_MONITOR_FINGERPRINT", "AMC_NO_SIGN"]) vi.stubEnv(name, undefined);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-session-audit");
    workspace = mkdtempSync(join(tmpdir(), "amc-session-audit-"));
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  });
  afterEach(() => { lockVault(workspace); vi.unstubAllEnvs(); rmSync(workspace, { recursive: true, force: true }); });

  function chat(args: string = defaultArgs, toolName = "fs.write", result = "wrote hello.txt"): string {
    const s = new SessionService(workspace, openSessionEventStore(workspace, "sqlite"));
    s.open({ sessionId: "cli-chat-0001", agentId: "default", harnessVersion: "audit-test", compositionDigest: sha256Hex("c"), policyDigest: sha256Hex("p") });
    s.startTurn({ trigger: "user" }); s.startStep();
    s.recordToolCall({ toolCallId: "call-1", toolName, args, dispatch: "native", parentToken: null });
    s.recordApproval({ phase: "request", approvalId: "appr-1", toolCallId: "call-1", toolName: "fs.write", actionClass: "WRITE_LOW", question: "write hello.txt?" });
    s.recordApproval({ phase: "answer", approvalId: "appr-1", answer: "allow", answeredBy: "owner", approvalRequestId: null, reason: "ok" });
    s.recordToolResult({ toolCallId: "call-1", outcome: "OK", exitCode: 0, timedOut: false, denied: false, content: result });
    s.endStep({ stopReason: "end_turn", usage: null }); s.endTurn({ reason: "complete" }); s.sealTurn();
    s.disposeWithoutClosing(); // a chat closed with /exit: not sealed
    return "cli-chat-0001";
  }

  it("lists a CLI chat's action with who approved it, and says it is not sealed", () => {
    chat();
    const { sessions } = listAuditSessions(workspace);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ sessionId: "cli-chat-0001", sealed: false, actions: [{ tool: "fs.write", outcome: "OK", approvedBy: "owner" }] });
  });

  it("exports the signed record that verify-export accepts, and refuses bad or unknown ids", () => {
    const id = chat();
    const file = sessionAuditExport(workspace, id, "json");
    expect(file.status).toBe(200);
    if (file.status !== 200) return;
    expect(file.fileName).toBe("amc-session-cli-chat.json");
    const doc = JSON.parse(file.body) as { content: unknown; monitorKeyFingerprint: string };
    expect(doc.content).toBeNull();
    expect(file.body).not.toContain("wrote hello.txt");
    const verdict = verifySessionExport(doc, { expectedFingerprint: doc.monitorKeyFingerprint });
    expect(verdict.ok).toBe(true);
    expect(verdict.tail).toBe("unproven");
    expect(sessionAuditExport(workspace, "../../etc/passwd", "json").status).toBe(400);
    expect(sessionAuditExport(workspace, "no-such-session-x", "html").status).toBe(404);
    const html = sessionAuditExport(workspace, id, "html");
    expect(html.status === 200 && html.body.startsWith("<!doctype html>")).toBe(true);
  });

  it("shows a waiting approval the exact recorded call only when it is the call the signed request binds", () => {
    chat();
    const intentHash = sha256Hex(canonicalize({ toolName: "fs.write", rawArguments: args }));
    const request = { intentId: "appr-1", toolName: "fs.write", actionClass: "WRITE_LOW", boundHashes: { intentHash } } as unknown as ApprovalRequestRecord;
    const shown = approvalCallFor(workspace, request, "PENDING");
    expect("lines" in shown && shown.title).toBe("Write a file");
    expect("lines" in shown && shown.lines.join("\n")).toContain("hello.txt");
    const other = { ...request, boundHashes: { intentHash: sha256Hex("something else") } } as unknown as ApprovalRequestRecord;
    expect(approvalCallFor(workspace, other, "PENDING")).toMatchObject({ unavailable: expect.stringContaining("does not match") });
    expect(approvalCallFor(workspace, request, "APPROVED")).toMatchObject({ unavailable: expect.stringContaining("decided") });
    expect(approvalCallFor(workspace, { ...request, intentId: "elsewhere" } as ApprovalRequestRecord, "PENDING"))
      .toMatchObject({ unavailable: expect.stringContaining("no agent session") });
  });

  it("security: the call goes only to someone who may decide this request or who raised it, with no host path and secrets redacted", () => {
    const secret = `ghp_${"A1b2C3d4E5".repeat(4).slice(0, 36)}`;
    expect(redactSecrets(secret, () => "X").findings.length).toBeGreaterThan(0);
    const secretArgs = JSON.stringify({ path: "notes.txt", content: `token ${secret}\nworkspace ${workspace}\nhome ${homedir()}\n` });
    chat(secretArgs);
    const intentHash = sha256Hex(canonicalize({ toolName: "fs.write", rawArguments: secretArgs }));
    const request = { intentId: "appr-1", toolName: "fs.write", actionClass: "WRITE_LOW", boundHashes: { intentHash },
      rolesAllowed: ["APPROVER", "OWNER"], initiator: "native:operator1" } as unknown as ApprovalRequestRecord;
    const who = (roles: string[], userId: string | null = "someone", isAdmin = false) => approvalCallField(workspace, request, "PENDING", { isAdmin, userId, roles });
    expect(who(["VIEWER"])).toEqual({});
    expect(who(["OPERATOR"])).toEqual({});
    expect(who(["AUDITOR"]), "a deciding role this request does not allow").toEqual({});
    expect(who(["OPERATOR"], "operator1").call).toBeDefined();
    const shown = who(["APPROVER"]);
    expect(shown.call && "lines" in shown.call).toBe(true);
    const text = JSON.stringify(shown);
    expect(text).not.toContain(secret);
    expect(text).toMatch(/REDACTED:/);
    expect(text).not.toContain(workspace);
    expect(text).not.toContain(homedir());
    expect(shown.call && "complete" in shown.call && shown.call.complete).toBe(false);
  });

  it("security: a secret in a shell command is redacted on the approval screen", () => {
    const secret = `ghp_${"Z9y8X7w6V5".repeat(4).slice(0, 36)}`;
    const bashArgs = JSON.stringify({ command: `curl -H 'Authorization: token ${secret}' https://example.com` });
    chat(bashArgs, "bash");
    const request = { intentId: "appr-1", toolName: "bash", actionClass: "WRITE_HIGH", rolesAllowed: ["OWNER"],
      boundHashes: { intentHash: sha256Hex(canonicalize({ toolName: "bash", rawArguments: bashArgs })) } } as unknown as ApprovalRequestRecord;
    const shown = approvalCallField(workspace, request, "PENDING", { isAdmin: false, userId: "owner", roles: ["OWNER"] });
    const text = JSON.stringify(shown);
    expect(text).toContain("Command:");
    expect(text).not.toContain(secret);
  });

  const KEY_BODY = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj";
  const PEM = `-----BEGIN PRIVATE KEY-----\n${KEY_BODY}\nMoreKeyMaterialLine2abcdefghijklmnopqrstuvwx\n-----END PRIVATE KEY-----`;
  const asked = (toolName: string, raw: string) => approvalCallField(workspace, { intentId: "appr-1", toolName, actionClass: "WRITE_HIGH",
    rolesAllowed: ["OWNER"], boundHashes: { intentHash: sha256Hex(canonicalize({ toolName, rawArguments: raw })) } } as unknown as ApprovalRequestRecord,
    "PENDING", { isAdmin: false, userId: "owner", roles: ["OWNER"] });

  it("security: the shared redactor removes a private key's whole body, and an unterminated one to the end", () => {
    expect(redactSecrets(`before\n${PEM}\nafter`, () => "[X]").redacted).toBe("before\n[X]\nafter");
    expect(redactSecrets(`-----BEGIN RSA PRIVATE KEY-----\n${KEY_BODY}`, () => "[X]").redacted).toBe("[X]");
  });

  it("security: a private key across lines in fs.write content or a bash heredoc shows no key body on the approval screen", () => {
    const write = JSON.stringify({ path: "id_key", content: `${PEM}\n` });
    chat(write);
    expect(JSON.stringify(asked("fs.write", write))).not.toContain(KEY_BODY);
  });

  it("security: a key in a bash heredoc is redacted before the command is split into lines", () => {
    const heredoc = JSON.stringify({ command: `cat > id_key <<'EOF'\n${PEM}\nEOF` });
    chat(heredoc, "bash");
    const text = JSON.stringify(asked("bash", heredoc));
    expect(text).toContain("Command:");
    expect(text).not.toContain(KEY_BODY);
    expect(text).not.toContain("MoreKeyMaterial");
  });

  it("security: a token a display cut would split is not partly shown", () => {
    const token = `ghp_${"Q1w2E3r4T5".repeat(4).slice(0, 36)}`;
    const long = JSON.stringify({ command: `echo ${"a".repeat(390)}${token}` });
    chat(long, "bash");
    const text = JSON.stringify(asked("bash", long));
    expect(text).not.toContain("ghp_");
  });

  it("security: a private key in a tool result shows no key body in the export's timeline or HTML", () => {
    const id = chat(defaultArgs, "fs.write", `read:\n${PEM}\n`);
    const doc = buildSessionExport({ workspace, sessionId: id, includeContent: true, decryptContent: true });
    expect(JSON.stringify(doc.content)).not.toContain(KEY_BODY);
    expect(renderSessionExportHtml(doc)).not.toContain(KEY_BODY);
  });

  it("the new routes are reads: every human role may call them, and no write method is handled", async () => {
    for (const path of ["/api/v1/evidence/sessions", "/api/v1/evidence/sessions/cli-chat-0001/export"]) {
      expect(resolveApiRolePolicy(path, "GET").roles).toContain("VIEWER");
      expect(resolveApiRolePolicy(path, "POST").roles).not.toContain("VIEWER");
    }
    chat();
    const res = { writeHead: vi.fn(), end: vi.fn(), setHeader: vi.fn(), statusCode: 200 } as unknown as ServerResponse;
    for (const method of ["POST", "PUT", "DELETE"]) {
      const req = { url: "/api/v1/evidence/sessions/cli-chat-0001/export", method } as IncomingMessage;
      await handleEvidenceRoute("/api/v1/evidence/sessions/cli-chat-0001/export", method, req, res, workspace);
    }
    expect((res.end as ReturnType<typeof vi.fn>).mock.calls.join("")).not.toContain("amc.session-export");
  });
});
