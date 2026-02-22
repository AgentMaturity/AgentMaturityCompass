import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { handleApiRoute } from "../src/api/index.js";
import { assuranceReadinessGate } from "../src/assurance/assuranceControlPlane.js";
import { listAssurancePacks } from "../src/assurance/packs/index.js";
import { initWorkspace } from "../src/workspace.js";

interface MockResponseState {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const roots: string[] = [];
const originalCwd = process.cwd();

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-assurance-unify-test-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function mockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(payload.length > 0 ? [Buffer.from(payload, "utf8")] : []) as unknown as IncomingMessage;
  (req as any).method = method;
  (req as any).url = url;
  return req;
}

function mockRes(): { res: ServerResponse; state: MockResponseState } {
  const state: MockResponseState = {
    statusCode: 0,
    headers: {},
    body: ""
  };
  const res = {
    writeHead: (statusCode: number, headers?: Record<string, string>) => {
      state.statusCode = statusCode;
      state.headers = headers ?? {};
      return res;
    },
    end: (chunk?: string | Buffer) => {
      if (chunk !== undefined) {
        state.body += chunk.toString();
      }
    }
  } as unknown as ServerResponse;
  return { res, state };
}

async function callApi(
  workspace: string,
  method: string,
  pathname: string,
  url: string,
  body?: unknown
): Promise<{ handled: boolean; state: MockResponseState; json: any }> {
  const req = mockReq(method, url, body);
  const { res, state } = mockRes();
  const handled = await handleApiRoute(pathname, method, req, res, workspace);
  return {
    handled,
    state,
    json: state.body.length > 0 ? JSON.parse(state.body) : null
  };
}

afterEach(() => {
  process.chdir(originalCwd);
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("assurance unification migration", () => {
  test("pack registry count is 51+ after migration", () => {
    expect(listAssurancePacks().length).toBeGreaterThanOrEqual(51);
  });

  test("legacy pack IDs are all present in the unified registry", () => {
    const ids = new Set(listAssurancePacks().map((pack) => pack.id));
    expect(ids.has("injection")).toBe(true);
    expect(ids.has("exfiltration")).toBe(true);
    expect(ids.has("toolMisuse")).toBe(true);
    expect(ids.has("truthfulness")).toBe(true);
    expect(ids.has("sandboxBoundary")).toBe(true);
    expect(ids.has("notaryAttestation")).toBe(true);
  });

  test("all migrated legacy packs contain scenarios", () => {
    const byId = new Map(listAssurancePacks().map((pack) => [pack.id, pack]));
    for (const id of ["injection", "exfiltration", "toolMisuse", "truthfulness", "sandboxBoundary", "notaryAttestation"]) {
      expect(byId.get(id)).toBeDefined();
      expect(byId.get(id)!.scenarios.length).toBeGreaterThan(0);
    }
  });

  test("GET /api/v1/assurance/packs returns unified pack catalog", async () => {
    const workspace = newWorkspace();
    const out = await callApi(workspace, "GET", "/api/v1/assurance/packs", "/api/v1/assurance/packs");
    expect(out.handled).toBe(true);
    expect(out.state.statusCode).toBe(200);
    expect(out.json.ok).toBe(true);
    expect(out.json.data.count).toBeGreaterThanOrEqual(51);
  });

  test("GET /api/v1/assurance/packs includes migrated legacy IDs", async () => {
    const workspace = newWorkspace();
    const out = await callApi(workspace, "GET", "/api/v1/assurance/packs", "/api/v1/assurance/packs");
    const ids = new Set((out.json.data.packs as Array<{ id: string }>).map((row) => row.id));
    expect(ids.has("toolMisuse")).toBe(true);
    expect(ids.has("truthfulness")).toBe(true);
    expect(ids.has("sandboxBoundary")).toBe(true);
    expect(ids.has("notaryAttestation")).toBe(true);
  });

  test("POST /api/v1/assurance runs selected migrated pack with new runner", async () => {
    const workspace = newWorkspace();
    const out = await callApi(
      workspace,
      "POST",
      "/api/v1/assurance",
      "/api/v1/assurance",
      { scopeType: "WORKSPACE", pack: "toolMisuse", windowDays: 1 }
    );
    expect(out.handled).toBe(true);
    expect(out.state.statusCode).toBe(200);
    expect(out.json.ok).toBe(true);
    expect(out.json.data.run.selectedPacks).toEqual(["toolMisuse"]);
    expect(out.json.data.report.packResults[0].packId).toBe("toolMisuse");
  });

  test("POST /api/v1/assurance rejects unknown packs", async () => {
    const workspace = newWorkspace();
    const out = await callApi(
      workspace,
      "POST",
      "/api/v1/assurance",
      "/api/v1/assurance",
      { scopeType: "WORKSPACE", pack: "does-not-exist" }
    );
    expect(out.handled).toBe(true);
    expect(out.state.statusCode).toBe(400);
    expect(out.json.ok).toBe(false);
  });

  test("GET /api/v1/assurance lists runs from unified history", async () => {
    const workspace = newWorkspace();
    await callApi(
      workspace,
      "POST",
      "/api/v1/assurance",
      "/api/v1/assurance",
      { scopeType: "WORKSPACE", pack: "truthfulness", windowDays: 1 }
    );

    const listed = await callApi(workspace, "GET", "/api/v1/assurance", "/api/v1/assurance");
    expect(listed.handled).toBe(true);
    expect(listed.state.statusCode).toBe(200);
    expect(listed.json.ok).toBe(true);
    expect(listed.json.data.runs.length).toBeGreaterThanOrEqual(1);
  });

  test("GET /api/v1/assurance/:runId returns unified run detail", async () => {
    const workspace = newWorkspace();
    const created = await callApi(
      workspace,
      "POST",
      "/api/v1/assurance",
      "/api/v1/assurance",
      { scopeType: "WORKSPACE", pack: "sandboxBoundary", windowDays: 1 }
    );
    const runId = created.json.data.run.runId as string;

    const detail = await callApi(
      workspace,
      "GET",
      `/api/v1/assurance/${runId}`,
      `/api/v1/assurance/${runId}`
    );
    expect(detail.handled).toBe(true);
    expect(detail.state.statusCode).toBe(200);
    expect(detail.json.ok).toBe(true);
    expect(detail.json.data.run.runId).toBe(runId);
    expect(detail.json.data.report.assuranceRunId).toBe(runId);
  });

  test("readiness gate evaluates against unified runner output", async () => {
    const workspace = newWorkspace();
    const created = await callApi(
      workspace,
      "POST",
      "/api/v1/assurance",
      "/api/v1/assurance",
      { scopeType: "WORKSPACE", pack: "notaryAttestation", windowDays: 1 }
    );
    const runId = created.json.data.run.runId as string;

    const gate = assuranceReadinessGate(workspace);
    expect(gate.latestRunId).toBe(runId);
    expect(["PASS", "FAIL", "ERROR"]).toContain(gate.latestStatus);
  });
});
