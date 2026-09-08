import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { addUser, createSession, createTrackedSession, initUsersConfig } from "../src/auth/authApi.js";
import { createApprovalForIntent } from "../src/approvals/approvalEngine.js";
import { getApprovalInboxItem } from "../src/approvals/approvalInbox.js";
import { listApprovalDecisions } from "../src/approvals/approvalChainStore.js";
import { decideApprovalInStudio } from "../src/approvals/approvalStudioService.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { nativeCsrfTokenForSession, NATIVE_CSRF_HEADER, NATIVE_INTENT_HEADER, NATIVE_INTENT_VALUE } from "../src/studio/nativeAdmission.js";
import { trustConfigPath } from "../src/trust/trustConfig.js";

type Session = ReturnType<typeof createSession>;
const aliases = ["/approvals/ID/approve", "/approvals/ID/deny", "/approvals/requests/ID/decide", "/approvals/requests/ID/cancel"];

describe("actual Studio approval signing requires authenticated browser authority", () => {
  let workspace: string;
  let api: Awaited<ReturnType<typeof startStudioApiServer>> | undefined;
  let owner: Session;
  let viewer: Session;
  let demo: Session;
  let origin: string;
  beforeAll(async () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "native-studio-approval-fixture-only");
    workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-studio-approval-admission-")));
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    const initialized = initUsersConfig({ workspace, username: "owner-display-name", password: "fixture-owner-password" });
    owner = createSession({ workspace, user: initialized.owner });
    viewer = createSession({ workspace, user: addUser({ workspace, username: "viewer", password: "fixture-viewer-password", roles: ["VIEWER"] }) });
    // This is a real, signed, tracked hosted-demo cookie carrying the old broad UI roles.
    // The inner Studio must reduce its effective authority regardless of those signed roles.
    demo = createTrackedSession({ workspace, userId: "local-demo", username: "local-demo", roles: ["OWNER", "APPROVER", "OPERATOR", "VIEWER"], authSource: "WORKSPACE_ROUTER" });
    api = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: "approval-fixture-admin" });
    origin = api.url;
  }, 30_000);
  afterAll(async () => {
    try { await api?.close(); }
    finally { if (workspace) rmSync(workspace, { recursive: true, force: true }); vi.unstubAllEnvs(); }
  });

  function pending(actionClass: "WRITE_LOW" | "WRITE_HIGH" = "WRITE_LOW") {
    const created = createApprovalForIntent({ workspace, agentId: "default", intentId: randomUUID(), toolName: "fs.write",
      actionClass, requestedMode: "EXECUTE", effectiveMode: "EXECUTE", riskTier: actionClass === "WRITE_HIGH" ? "high" : "medium",
      intentPayload: { path: "reviewed.txt", content: "reviewed body" } });
    const approvalRequestId = created.request.approvalRequestId;
    const selection = { workspace, agentId: "default", approvalRequestId };
    expect(getApprovalInboxItem(selection).contextIntegrity.valid).toBe(true);
    return { approvalRequestId, selection };
  }
  function post(path: string, session: Session, overrides: Record<string, string | undefined> = {}, body: unknown = { decision: "APPROVE_EXECUTE", reason: "Reviewed exact request." }) {
    const headers: Record<string, string> = { "content-type": "application/json", origin, cookie: `amc_session=${session.token}`,
      [NATIVE_INTENT_HEADER]: NATIVE_INTENT_VALUE, [NATIVE_CSRF_HEADER]: nativeCsrfTokenForSession(session.payload) };
    for (const [key, value] of Object.entries(overrides)) { if (value === undefined) delete headers[key]; else headers[key] = value; }
    return fetch(origin + path, { method: "POST", headers, body: JSON.stringify(body) });
  }

  it("returns derived proof and effective VIEWER roles for the actual tracked demo session", async () => {
    const response = await fetch(`${origin}/auth/me`, { headers: { cookie: `amc_session=${demo.token}` } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ userId: "local-demo", roles: ["VIEWER"], nativeCsrfToken: nativeCsrfTokenForSession(demo.payload) });
    const denied = await post("/api/v1/tools/init", demo);
    expect(denied.status).toBe(403);
    const cli = await post("/cli/exec", demo, {}, { command: "version" });
    expect(cli.status).toBe(403);
  });

  it.each(aliases)("rejects demo authority on %s before changing the signed request", async alias => {
    const p = pending();
    const response = await post(alias.replace("ID", p.approvalRequestId), demo);
    expect(response.status).toBe(403); expect(await response.json()).toMatchObject({ code: "NATIVE_DEMO_APPROVAL_DENIED" });
    expect(listApprovalDecisions(p.selection)).toEqual([]);
    expect(getApprovalInboxItem(p.selection).status).toBe("PENDING");
  });

  it.each(aliases)("requires proof on %s even for a valid owner cookie", async alias => {
    const p = pending();
    const response = await post(alias.replace("ID", p.approvalRequestId), owner, { [NATIVE_CSRF_HEADER]: undefined });
    expect(response.status).toBe(403); expect(await response.json()).toMatchObject({ code: "NATIVE_CSRF_REQUIRED" });
    expect(listApprovalDecisions(p.selection)).toEqual([]);
    expect(getApprovalInboxItem(p.selection).status).toBe("PENDING");
  });

  it("preserves role checks after a valid proof instead of turning CSRF into signing authority", async () => {
    const p = pending();
    const response = await post(`/approvals/${p.approvalRequestId}/approve`, viewer);
    expect(response.status).toBe(403); expect(await response.text()).toContain("requires role");
    expect(listApprovalDecisions(p.selection)).toEqual([]);
  });

  it("signs the real user ID, separately from the human display name", async () => {
    const p = pending();
    expect(owner.payload.userId).not.toBe(owner.payload.username);
    const response = await post(`/approvals/${p.approvalRequestId}/approve`, owner);
    expect(response.status).toBe(200);
    const decisions = listApprovalDecisions(p.selection);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ userId: owner.payload.userId, username: owner.payload.username, decision: "APPROVE_EXECUTE" });
    expect(getApprovalInboxItem(p.selection).chainIntegrity.valid).toBe(true);
  });

  it("refuses a second display name for one verified identity before recording a decision or satisfying quorum", async () => {
    const p = pending("WRITE_HIGH");
    const first = await post(`/approvals/${p.approvalRequestId}/approve`, owner);
    expect(first.status).toBe(200);
    expect(getApprovalInboxItem(p.selection).quorum).toMatchObject({ required: 2, received: 1, status: "PENDING" });
    const writeAudit = vi.fn<Parameters<typeof decideApprovalInStudio>[0]["writeAudit"]>(() => ({ eventId: "refusal-audit", receiptId: "refusal-receipt" }));
    await expect(decideApprovalInStudio({ ...p.selection,
      actor: { isAdmin: false, username: "renamed-display-name", userId: owner.payload.userId, roles: ["OWNER"] },
      input: { decision: "APPROVE_EXECUTE", reason: "Same identity with a different display name." }, requireExplicitDecision: true, writeAudit
    })).rejects.toMatchObject({ statusCode: 409 });
    // The distinct-user rejection may record its specific refusal audit, but cannot record a decision.
    expect(writeAudit.mock.calls.every(([entry]) => entry.auditType === "APPROVAL_QUORUM_FAILED")).toBe(true);
    expect(listApprovalDecisions(p.selection)).toHaveLength(1);
    expect(getApprovalInboxItem(p.selection).quorum.received).toBe(1);
  });

  it("denies approval signing in read-only mode even to an explicit bootstrap admin", async () => {
    const p = pending();
    const path = trustConfigPath(workspace), original = readFileSync(path);
    try {
      writeFileSync(path, Buffer.concat([original, Buffer.from("\n# unsigned change\n")]));
      const response = await fetch(`${origin}/approvals/${p.approvalRequestId}/approve`, { method: "POST",
        headers: { "content-type": "application/json", "x-amc-admin-token": "approval-fixture-admin", [NATIVE_INTENT_HEADER]: NATIVE_INTENT_VALUE },
        body: JSON.stringify({ decision: "APPROVE_EXECUTE" }) });
      expect(response.status).toBe(403); expect(await response.json()).toMatchObject({ code: "NATIVE_READ_ONLY" });
      expect(listApprovalDecisions(p.selection)).toEqual([]);
    } finally { writeFileSync(path, original); }
  });
});
