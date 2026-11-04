import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { handleApiRoute } from "../src/api/index.js";
import { handleIncidentRoute } from "../src/api/incidentRouter.js";
import { listDomainIds } from "../src/domains/domainRegistry.js";
import { initWorkspace } from "../src/workspace.js";

interface MockResponseState {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const roots: string[] = [];
const originalCwd = process.cwd();

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-incidents-api-test-"));
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

async function callIncidentRoute(
  method: string,
  pathname: string,
  url: string,
  body?: unknown,
  principal?: string
): Promise<{ handled: boolean; state: MockResponseState; json: any }> {
  const req = mockReq(method, url, body);
  const { res, state } = mockRes();
  const handled = await handleIncidentRoute(pathname, method, req, res, process.cwd(), principal);
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

describe("incident API routes", () => {
  test("GET /api/v1/incidents returns empty list for new workspace", async () => {
    const workspace = newWorkspace();
    process.chdir(workspace);

    const out = await callIncidentRoute("GET", "/api/v1/incidents", "/api/v1/incidents?agent=agent-api");
    expect(out.handled).toBe(true);
    expect(out.state.statusCode).toBe(200);
    expect(out.json.ok).toBe(true);
    expect(out.json.data.count).toBe(0);
    expect(out.json.data.incidents).toEqual([]);
  });

  test("POST /api/v1/incidents creates a new incident", async () => {
    const workspace = newWorkspace();
    process.chdir(workspace);

    const out = await callIncidentRoute("POST", "/api/v1/incidents", "/api/v1/incidents", {
      agentId: "agent-api",
      title: "gateway timeout spike",
      severity: "high"
    });

    expect(out.handled).toBe(true);
    expect(out.state.statusCode).toBe(201);
    expect(out.json.ok).toBe(true);
    expect(out.json.data.incidentId).toMatch(/^incident_/);
    expect(out.json.data.agentId).toBe("agent-api");
    expect(out.json.data.state).toBe("OPEN");
  });

  test("GET /api/v1/incidents/:id returns incident details", async () => {
    const workspace = newWorkspace();
    process.chdir(workspace);

    const created = await callIncidentRoute("POST", "/api/v1/incidents", "/api/v1/incidents", {
      agentId: "agent-api",
      title: "drift anomaly",
      severity: "medium"
    });
    const id = created.json.data.incidentId as string;

    const out = await callIncidentRoute("GET", `/api/v1/incidents/${id}`, `/api/v1/incidents/${id}`);
    expect(out.handled).toBe(true);
    expect(out.state.statusCode).toBe(200);
    expect(out.json.ok).toBe(true);
    expect(out.json.data.incidentId).toBe(id);
    expect(out.json.data.title).toBe("drift anomaly");
    expect(out.json.data.transitions).toEqual([]);
  });

  test("PATCH /api/v1/incidents/:id with resolution closes incident", async () => {
    const workspace = newWorkspace();
    process.chdir(workspace);

    const created = await callIncidentRoute("POST", "/api/v1/incidents", "/api/v1/incidents", {
      agentId: "agent-api",
      title: "policy violation",
      severity: "critical"
    });
    const id = created.json.data.incidentId as string;

    const patched = await callIncidentRoute("PATCH", `/api/v1/incidents/${id}`, `/api/v1/incidents/${id}`, {
      resolution: "patched policy and redeployed"
    });
    expect(patched.state.statusCode).toBe(200);
    expect(patched.json.ok).toBe(true);
    expect(patched.json.data.state).toBe("RESOLVED");
    expect(patched.json.data.transitions.length).toBe(1);
  });

  test("PATCH /api/v1/incidents/:id with evidenceId creates causal edge", async () => {
    const workspace = newWorkspace();
    process.chdir(workspace);

    const created = await callIncidentRoute("POST", "/api/v1/incidents", "/api/v1/incidents", {
      agentId: "agent-api",
      title: "slo breach",
      severity: "low"
    });
    const id = created.json.data.incidentId as string;

    const patched = await callIncidentRoute("PATCH", `/api/v1/incidents/${id}`, `/api/v1/incidents/${id}`, {
      evidenceId: "ev-123"
    });
    expect(patched.state.statusCode).toBe(200);
    expect(patched.json.ok).toBe(true);
    expect(patched.json.data.causalEdges.length).toBe(1);
    expect(patched.json.data.causalEdges[0].fromEventId).toBe("ev-123");
  });

  test("GET /api/v1/incidents supports closed filter", async () => {
    const workspace = newWorkspace();
    process.chdir(workspace);

    const created = await callIncidentRoute("POST", "/api/v1/incidents", "/api/v1/incidents", {
      agentId: "agent-api",
      title: "budget exceed",
      severity: "high"
    });
    const id = created.json.data.incidentId as string;
    await callIncidentRoute("PATCH", `/api/v1/incidents/${id}`, `/api/v1/incidents/${id}`, {
      resolution: "throttled non-critical jobs"
    });

    const out = await callIncidentRoute(
      "GET",
      "/api/v1/incidents",
      "/api/v1/incidents?agent=agent-api&status=closed&limit=10"
    );
    expect(out.state.statusCode).toBe(200);
    expect(out.json.ok).toBe(true);
    expect(out.json.data.count).toBe(1);
    expect(out.json.data.incidents[0].state).toBe("RESOLVED");
  });

  test("handleApiRoute dispatches to incident router when registered", async () => {
    const workspace = newWorkspace();
    process.chdir(workspace);

    const req = mockReq("GET", "/api/v1/incidents?agent=agent-dispatch");
    const { res, state } = mockRes();
    const handled = await handleApiRoute("/api/v1/incidents", "GET", req, res);
    expect(handled).toBe(true);
    // Incident router is now wired — should return 200 with incidents list
    expect(state.statusCode).toBe(200);
  });
});

describe("incident API routes refuse bad requests before writing", () => {
  async function createdIncident(): Promise<string> {
    const created = await callIncidentRoute("POST", "/api/v1/incidents", "/api/v1/incidents", { agentId: "agent-api", title: "probe" });
    expect(created.state.statusCode).toBe(201);
    return created.json.data.incidentId as string;
  }

  test("leaves other paths and methods to the next router", async () => {
    process.chdir(newWorkspace());
    expect((await callIncidentRoute("GET", "/api/v1/watch", "/api/v1/watch")).handled).toBe(false);
    const id = await createdIncident();
    expect((await callIncidentRoute("DELETE", `/api/v1/incidents/${id}`, `/api/v1/incidents/${id}`)).handled).toBe(false);
    // A clock action under the wrong method is not a clock route, and not an incident id either.
    expect((await callIncidentRoute("GET", `/api/v1/incidents/${id}/oversight`, `/api/v1/incidents/${id}/oversight`)).handled).toBe(false);
  });

  test("answers 400 to an incident without a title and 404 to an unknown incident", async () => {
    process.chdir(newWorkspace());
    const untitled = await callIncidentRoute("POST", "/api/v1/incidents", "/api/v1/incidents", { agentId: "agent-api" });
    expect(untitled.state.statusCode).toBe(400);
    expect(untitled.json.error).toContain("title required");
    for (const [method, action] of [["GET", ""], ["PATCH", ""], ["GET", "/clocks"], ["POST", "/clock-events"], ["POST", "/oversight"]] as const) {
      const path = `/api/v1/incidents/incident_missing${action}`;
      const out = await callIncidentRoute(method, path, path, {}, "reviewer-a");
      expect(out.state.statusCode, `${method} ${path}`).toBe(404);
    }
  });

  test("lists with a malformed limit as with the default", async () => {
    process.chdir(newWorkspace());
    await createdIncident();
    for (const limit of ["abc", "-1", "0"]) {
      const out = await callIncidentRoute("GET", "/api/v1/incidents", `/api/v1/incidents?agent=agent-api&limit=${limit}`);
      expect(out.state.statusCode, limit).toBe(200);
      expect(out.json.data.count, limit).toBe(1);
      expect(out.json.data.unsigned).toEqual({ count: 0, incidents: [], pinnedPastLimit: 0, rejected: 0, unreadable: false });
      expect(out.json.data.warnings, limit).toBeUndefined();
    }
  });

  test("answers 400 to a bad station, timestamp or clock event, and records nothing", async () => {
    process.chdir(newWorkspace());
    const id = await createdIncident();
    const station = listDomainIds()[0]!;
    const clocks = `/api/v1/incidents/${id}/clocks`, events = `/api/v1/incidents/${id}/clock-events`;
    for (const url of [`${clocks}?station=nowhere`, `${clocks}?station=${station}&now=yesterday`]) {
      const out = await callIncidentRoute("GET", clocks, url);
      expect(out.state.statusCode, url).toBe(400);
    }
    for (const body of [{ station: "nowhere", trigger: "t" }, { station, trigger: "t", notified: "c" }, { station },
      { station, trigger: "t", at: "2026-03-02 10:00" }]) {
      const out = await callIncidentRoute("POST", events, events, body);
      expect(out.state.statusCode, JSON.stringify(body)).toBe(400);
    }
    const listed = await callIncidentRoute("GET", clocks, `${clocks}?station=${station}&now=2026-03-02T10:00:00Z`);
    expect(listed.state.statusCode).toBe(200);
    expect(JSON.stringify(listed.json.data)).not.toContain('"kind":"TRIGGER"');
  });

  test("takes an oversight reviewer only from the authenticated caller", async () => {
    process.chdir(newWorkspace());
    const id = await createdIncident();
    const path = `/api/v1/incidents/${id}/oversight`;
    const anonymous = await callIncidentRoute("POST", path, path, { decision: "approve" });
    expect(anonymous.state.statusCode).toBe(403);
    expect(anonymous.json.error).toContain("authenticated reviewer");
    const impersonated = await callIncidentRoute("POST", path, path, { reviewerId: "reviewer-b", decision: "approve" }, "reviewer-a");
    expect(impersonated.state.statusCode).toBe(403);
    expect(impersonated.json.error).toContain("reviewerId must be the authenticated caller");
    for (const clockIds of ["clock-1", [1]]) {
      const out = await callIncidentRoute("POST", path, path, { decision: "approve", clockIds }, "reviewer-a");
      expect(out.state.statusCode, JSON.stringify(clockIds)).toBe(400);
      expect(out.json.error).toContain("clockIds must be an array");
    }
  });
});
