import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { canonicalize } from "../src/utils/json.js";
import { collectAuditBinderData } from "../src/audit/binderCollector.js";
import { createAuditBinderArtifact } from "../src/audit/binderArtifact.js";
import { verifyAuditBinderFile } from "../src/audit/binderVerifier.js";
import { loadAuditMapBuiltin, loadAuditMapActive, auditMapActivePath } from "../src/audit/auditMapStore.js";
import { loadAuditPolicy, auditPolicySigPath } from "../src/audit/auditPolicyStore.js";
import { scanBinderForPii } from "../src/audit/binderRedaction.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import {
  auditRequestApproveForApi,
  auditRequestCreateForApi,
  auditRequestFulfillForApi
} from "../src/audit/auditApi.js";
import { decideApprovalForIntent } from "../src/approvals/approvalEngine.js";

const roots: string[] = [];
const _originalVaultPassphrase = process.env.AMC_VAULT_PASSPHRASE;

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-audit-binder-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "audit-binder-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

async function pickPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", () => resolvePromise()));
  const address = server.address();
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  if (!address || typeof address === "string") {
    throw new Error("failed to allocate port");
  }
  return address.port;
}

async function httpText(url: string, init?: RequestInit): Promise<{ status: number; body: string }> {
  const response = await fetch(url, init);
  return {
    status: response.status,
    body: await response.text()
  };
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  // Restore vault passphrase to prevent env pollution across tests
  if (_originalVaultPassphrase === undefined) {
    delete process.env.AMC_VAULT_PASSPHRASE;
  } else {
    process.env.AMC_VAULT_PASSPHRASE = _originalVaultPassphrase;
  }
});

describe("audit binder + compliance maps", () => {
  test("binder collector is deterministic and exported binder verifies offline", async () => {
    const ws = workspace();
    const policy = loadAuditPolicy(ws);
    const map = loadAuditMapActive(ws);

    const one = await collectAuditBinderData({
      workspace: ws,
      scope: { type: "WORKSPACE", id: "workspace" },
      policy,
      map,
      nowTs: 1_700_000_000_000
    });
    const two = await collectAuditBinderData({
      workspace: ws,
      scope: { type: "WORKSPACE", id: "workspace" },
      policy,
      map,
      nowTs: 1_700_000_000_000
    });

    expect(canonicalize(one.binder)).toBe(canonicalize(two.binder));

    const created = await createAuditBinderArtifact({
      workspace: ws,
      scopeType: "WORKSPACE",
      scopeId: "workspace",
      outFile: ".amc/audit/binders/exports/workspace/workspace/latest.amcaudit",
      nowTs: 1_700_000_000_000
    });
    const verify = verifyAuditBinderFile({
      file: created.outFile,
      workspace: ws
    });
    expect(verify.ok, JSON.stringify(verify.errors)).toBe(true);
  });

  test("audit policy/map tampering fails closed for audit API", async () => {
    const ws = workspace();
    const port = await pickPort();
    const server = await startStudioApiServer({
      workspace: ws,
      host: "127.0.0.1",
      port,
      token: "audit-admin-token"
    });
    try {
      writeFileSync(auditPolicySigPath(ws), "tampered\n");
      writeFileSync(`${auditMapActivePath(ws)}.sig`, "tampered\n");

      const res = await httpText(`${server.url}/audit/policy`, {
        headers: {
          "x-amc-admin-token": "audit-admin-token"
        }
      });
      expect(res.status).toBe(503);
      expect(res.body).toContain("AUDIT_ENDPOINTS_UNAVAILABLE");
    } finally {
      await server.close();
    }
  });

  test("binder privacy scanner fails on email-like free text", () => {
    const pii = scanBinderForPii({
      v: 1,
      generatedTs: 1,
      suspicious: "alice@example.com"
    });
    expect(pii.status).toBe("FAIL");
    expect(pii.findings.some((row) => row.type === "EMAIL")).toBe(true);
  });

  test("builtin compliance map has >=9 families, >=4 controls each, and control results are deterministic", async () => {
    const ws = workspace();
    const builtin = loadAuditMapBuiltin(ws);
    expect(builtin.auditMap.controlFamilies.length).toBeGreaterThanOrEqual(9);
    for (const family of builtin.auditMap.controlFamilies) {
      expect(family.controls.length).toBeGreaterThanOrEqual(4);
    }

    const policy = loadAuditPolicy(ws);
    const first = await collectAuditBinderData({
      workspace: ws,
      scope: { type: "WORKSPACE", id: "workspace" },
      policy,
      map: builtin,
      nowTs: 1_700_000_100_000
    });
    const second = await collectAuditBinderData({
      workspace: ws,
      scope: { type: "WORKSPACE", id: "workspace" },
      policy,
      map: builtin,
      nowTs: 1_700_000_100_000
    });

    const statuses = first.binder.sections.controls.families.flatMap((family) =>
      family.controls.map((control) => control.status)
    );
    expect(statuses.every((status) => status === "PASS" || status === "FAIL" || status === "INSUFFICIENT_EVIDENCE")).toBe(true);
    expect(canonicalize(first.binder.sections.controls)).toBe(canonicalize(second.binder.sections.controls));
  });

  test("auditor request -> owner approval -> fulfill export; lease-auth denied on audit endpoints", async () => {
    const ws = workspace();
    const request = auditRequestCreateForApi({
      workspace: ws,
      scopeType: "WORKSPACE",
      scopeId: "workspace",
      requestedItems: ["control:ACCESS_CONTROL.SSO_SCIM"],
      requesterUserId: "auditor-user"
    });
    const approval = auditRequestApproveForApi({
      workspace: ws,
      requestId: request.request.requestId,
      actorUserId: "owner-1",
      actorUsername: "owner-1",
      actorRoles: ["OWNER"],
      reason: "owner approved"
    });

    decideApprovalForIntent({
      workspace: ws,
      agentId: "default",
      approvalId: approval.approvalRequestId,
      decision: "APPROVED",
      mode: "EXECUTE",
      reason: "auditor quorum",
      userId: "auditor-2",
      username: "auditor-2",
      userRoles: ["AUDITOR"]
    });

    const fulfilled = await auditRequestFulfillForApi({
      workspace: ws,
      requestId: request.request.requestId,
      outFile: ".amc/audit/binders/exports/workspace/workspace/requested.amcaudit"
    });
    expect(fulfilled.request.status).toBe("FULFILLED");
    expect(fulfilled.export.sha256).toMatch(/^[a-f0-9]{64}$/);

    const port = await pickPort();
    const server = await startStudioApiServer({
      workspace: ws,
      host: "127.0.0.1",
      port,
      token: "audit-admin-token"
    });
    try {
      const lease = issueLeaseForCli({
        workspace: ws,
        agentId: "default",
        ttl: "30m",
        scopes: "gateway:llm,toolhub:intent,toolhub:execute",
        routes: "/openai",
        models: "*",
        rpm: 30,
        tpm: 10000
      });
      const denied = await httpText(`${server.url}/audit/requests`, {
        headers: {
          "x-amc-agent-id": "default",
          "x-amc-lease": lease.token
        }
      });
      expect([401, 403]).toContain(denied.status);
    } finally {
      await server.close();
    }
  });

  test("audit console pages serve without CDN refs or obvious secret patterns", async () => {
    const ws = workspace();
    const port = await pickPort();
    const server = await startStudioApiServer({
      workspace: ws,
      host: "127.0.0.1",
      port,
      token: "audit-admin-token"
    });
    try {
      for (const page of ["/console/audit.html", "/console/auditBinder.html", "/console/auditRequests.html"]) {
        const res = await httpText(`${server.url}${page}`);
        expect(res.status).toBe(200);
        expect(res.body).not.toMatch(/https?:\/\/cdn|unpkg|jsdelivr/i);
        expect(res.body).not.toMatch(/BEGIN PRIVATE KEY|Bearer\s+[A-Za-z0-9._-]{8,}|lease_[A-Za-z0-9_-]{8,}/i);
      }
    } finally {
      await server.close();
    }
  });
});
