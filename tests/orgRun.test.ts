import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { handleApiRoute } from "../src/api/index.js";
import { loadEpisodeRecord } from "../src/lifecycle/episodeRecord.js";
import { loadLifecycleRunArtifact } from "../src/lifecycle/lifecycleRunArtifact.js";
import { listOrgRuns, loadOrgRun, orgRunRoleDefinitions, parseOrgRoleList, redactOrgRunArtifact, runOrg } from "../src/org/orgRun.js";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-org-run-"));
  roots.push(dir);
  return dir;
}

function mockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(payload.length > 0 ? [Buffer.from(payload, "utf8")] : []) as unknown as IncomingMessage;
  (req as { method?: string; url?: string }).method = method;
  (req as { method?: string; url?: string }).url = url;
  return req;
}

function mockRes(): { res: ServerResponse; state: { statusCode: number; headers: Record<string, string>; body: string } } {
  const state = { statusCode: 0, headers: {} as Record<string, string>, body: "" };
  const res = {
    writeHead: (statusCode: number, headers?: Record<string, string>) => {
      state.statusCode = statusCode;
      state.headers = headers ?? {};
      return res;
    },
    end: (chunk?: string | Buffer) => {
      if (chunk !== undefined) state.body += chunk.toString();
    }
  } as unknown as ServerResponse;
  return { res, state };
}

async function callApi(params: {
  pathname: string;
  method?: string;
  url?: string;
  body?: unknown;
  workspace: string;
}): Promise<{ status: number; json: { ok: boolean; data?: any; error?: string } }> {
  const method = params.method ?? "GET";
  const req = mockReq(method, params.url ?? params.pathname, params.body);
  const { res, state } = mockRes();
  const handled = await handleApiRoute(params.pathname, method, req, res, params.workspace);
  expect(handled).toBe(true);
  return { status: state.statusCode, json: JSON.parse(state.body) as { ok: boolean; data?: any; error?: string } };
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("autonomous org runner", () => {
  test("creates isolated role workspaces with parent and child lifecycle evidence", () => {
    const ws = workspace();
    const out = runOrg({
      workspace: ws,
      orgRunId: "org-test-run",
      roles: parseOrgRoleList("REV_PRODUCT_MANAGER,REV_QA_LEAD"),
      goal: "Complete AMC lifecycle work and write role handoffs.",
      heartbeatPolicy: { intervalMinutes: 5, maxStaleMinutes: 15, plateauAfterHeartbeats: 1 }
    });

    expect(out.artifact.orgRunId).toBe("org-test-run");
    expect(out.artifact.status).toBe("completed");
    expect(out.artifact.summary.roleCount).toBe(2);
    expect(out.artifact.summary.heartbeatCount).toBe(2);
    expect(out.artifact.surfaces.Fleet.status).toBe("complete");
    expect(out.artifact.surfaces.Watch.status).toBe("complete");
    expect(out.signaturePath).toBeTruthy();

    const roleWorkspaces = new Set(out.artifact.roles.map((role) => role.roleWorkspace));
    expect(roleWorkspaces.size).toBe(2);
    for (const role of out.artifact.roles) {
      expect(resolve(role.roleWorkspace).startsWith(resolve(ws))).toBe(true);
      expect(role.publicStateRef.path).toContain("/public/state.json");
      expect(role.privateGraderStateRef.path).toContain("/private/grader-state.json");
      expect(role.privateGraderStateRef.visibility).toBe("private");
      expect((statSync(role.privateGraderStateRef.path).mode & 0o777)).toBe(0o600);
      expect(role.scope.deniedActionClasses).toContain("DEPLOY");
      expect(role.heartbeats[0]?.status).toBe("plateau");
      expect(role.approvalGates.every((gate) => gate.status === "passed")).toBe(true);

      const episode = loadEpisodeRecord({ workspace: ws, selector: role.episodeRecordRef.episodeId, agentId: `org-${role.roleId.toLowerCase()}` });
      expect(episode.lifecycleStage).toBe("org.role.completed");

      const lifecycle = loadLifecycleRunArtifact({ workspace: ws, selector: role.lifecycleArtifactRef.lifecycleRunId, agentId: `org-${role.roleId.toLowerCase()}` });
      expect(lifecycle.stage).toBe("org.role.completed");
      expect(lifecycle.surfaces.Enforce.status).toBe("complete");
    }

    const parentEpisode = loadEpisodeRecord({ workspace: ws, selector: out.artifact.parentEpisodeRecordRef.episodeId, agentId: "org-runner" });
    expect(parentEpisode.lifecycleStage).toBe("org.run.completed");
    const parentLifecycle = loadLifecycleRunArtifact({ workspace: ws, selector: out.artifact.parentLifecycleArtifactRef.lifecycleRunId, agentId: "org-runner" });
    expect(parentLifecycle.stage).toBe("org.run.completed");
    expect(parentLifecycle.evidence.episodeRecords).toHaveLength(3);

    const redacted = redactOrgRunArtifact(out.artifact);
    expect(redacted.workspace).toBe("$WORKSPACE");
    expect(redacted.roles[0]?.privateGraderStateRef.path).toBe("$PRIVATE/grader-state.json");
    expect(redacted.roles[0]?.privateGraderStateRef.sha256).toBeNull();

    expect(listOrgRuns({ workspace: ws })).toHaveLength(1);
    expect(loadOrgRun({ workspace: ws, selector: "org-test-run" }).summary.roleCount).toBe(2);
  });

  test("exposes roles and redacted org runs through the public API", async () => {
    const ws = workspace();

    const roles = await callApi({ pathname: "/api/v1/org/roles", workspace: ws });
    expect(roles.status).toBe(200);
    expect(roles.json.data.total).toBe(70);
    expect(orgRunRoleDefinitions()).toHaveLength(70);

    const created = await callApi({
      pathname: "/api/v1/org/runs",
      method: "POST",
      body: {
        orgRunId: "api-org-run",
        roles: "REV_PRODUCT_MANAGER,REV_TECH_LEAD",
        goal: "Coordinate AMC delivery roles."
      },
      workspace: ws
    });
    expect(created.status).toBe(201);
    expect(created.json.data.summary.roleCount).toBe(2);

    const listed = await callApi({ pathname: "/api/v1/org/runs", workspace: ws });
    expect(listed.status).toBe(200);
    expect(listed.json.data.total).toBe(1);
    expect(listed.json.data.runs[0].workspace).toBe("$WORKSPACE");
    expect(listed.json.data.runs[0].roles[0].privateGraderStateRef.sha256).toBeNull();

    const inspected = await callApi({ pathname: "/api/v1/org/runs/api-org-run", workspace: ws });
    expect(inspected.status).toBe(200);
    expect(inspected.json.data.summary.orgRunId).toBe("api-org-run");
    expect(inspected.json.data.run.roles[0].privateGraderStateRef.path).toBe("$PRIVATE/grader-state.json");
  });
});
