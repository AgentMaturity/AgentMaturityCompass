/**
 * P2-35 negative fixtures at the A4 router entry (design §5.1, §17 "Unauthorized progression"): every route in the
 * published A4 OpenAPI is driven with the identity it must refuse. The refusal codes are the reason codes the scenario
 * names: A4_AUTH_REQUIRED, DEMO_REFUSED, A4_PREVIEW_DISABLED, ADMIN_TOKEN_REFUSED, NATIVE_READ_ONLY, QUERY_INVALID.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { openA4Store } from "../../src/a4/a4Store.js";
import { a4Endpoints } from "../../src/studio/a4Openapi.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { a4, a4Workspace, requestId } from "./a4Harness.js";

vi.setConfig({ testTimeout: 60_000 });
afterEach(() => cleanupGovernanceFixtures());

const SAMPLE: Record<string, string> = {
  projectId: `a4p_${"0".repeat(32)}`, releaseId: `a4r_${"0".repeat(32)}`, gateId: `a4gate_${"0".repeat(32)}`, revisionNo: "1",
  stage: "aspire", gate: "direction", hypothesisId: "a4h_fixture", executionId: "exec_fixture", approvalRequestId: "apr_fixture", effectId: "release"
};
const routes = Object.entries(a4Endpoints()).flatMap(([template, methods]) => Object.keys(methods).map((method) => ({
  method: method.toUpperCase(), path: template.replace(/\{(\w+)\}/g, (_all, name: string) => {
    const value = SAMPLE[name];
    if (value === undefined) throw new Error(`no sample for {${name}} in ${template}`);
    return value;
  })
})));
const mutations = routes.filter((route) => route.method === "POST");
const reads = routes.filter((route) => route.method === "GET");
/** A path that must not exist after a refused request: proof that nothing under it was created or opened. */
const untouched = (root: string) => join(root, "never-created-workspace");

describe("A4 router admission refusals (P2-35 negative fixtures)", () => {
  test("the route table is the published one: both mutation and read routes exist, POST /projects among them", () => {
    expect(mutations.length).toBeGreaterThan(20);
    expect(reads.length).toBeGreaterThan(15);
    expect(mutations).toContainEqual({ method: "POST", path: "/api/v1/a4/projects" });
  });

  test("no Studio session: 401 A4_AUTH_REQUIRED on every route", async () => {
    const workspace = untouched(a4Workspace().workspace);
    for (const route of routes) {
      const reply = await a4(workspace, "none", route.method, route.path, route.method === "POST" ? {} : undefined);
      expect([route.path, reply.status, reply.body.code]).toEqual([route.path, 401, "A4_AUTH_REQUIRED"]);
    }
    expect(existsSync(workspace)).toBe(false);
  });

  test("demo: 403 DEMO_REFUSED on every POST and every GET, preview on or off", async () => {
    const workspace = untouched(a4Workspace().workspace);
    for (const preview of ["1", "0"]) {
      vi.stubEnv("AMC_A4_PREVIEW", preview);
      for (const route of routes) {
        const reply = await a4(workspace, "demo", route.method, route.path, route.method === "POST" ? {} : undefined);
        expect([route.path, reply.status, reply.body.code]).toEqual([route.path, 403, "DEMO_REFUSED"]);
      }
    }
    expect(existsSync(workspace)).toBe(false);
  });

  test("preview off: 404 A4_PREVIEW_DISABLED on every route for a real user", async () => {
    const { workspace, alice } = a4Workspace();
    vi.stubEnv("AMC_A4_PREVIEW", "0");
    for (const route of routes) {
      const reply = await a4(workspace, alice, route.method, route.path, route.method === "POST" ? {} : undefined);
      expect([route.path, reply.status, reply.body.code]).toEqual([route.path, 404, "A4_PREVIEW_DISABLED"]);
    }
  });

  test("admin token: 403 ADMIN_TOKEN_REFUSED on every mutation route, POST /projects included, before anything is opened", async () => {
    const workspace = untouched(a4Workspace().workspace);
    for (const route of mutations) {
      const body = { clientRequestId: requestId(), name: "admin project", expertise: "novice", expectedHeadSeq: 0 };
      const reply = await a4(workspace, "admin", "POST", route.path, body);
      expect([route.path, reply.status, reply.body.code]).toEqual([route.path, 403, "ADMIN_TOKEN_REFUSED"]);
    }
    expect(existsSync(workspace)).toBe(false);
  });

  test("admin token reads: GET /projects answers, and creates no project", async () => {
    const { workspace } = a4Workspace();
    const reply = await a4(workspace, "admin", "GET", "/api/v1/a4/projects");
    expect(reply.status).toBe(200);
    expect(reply.body.data).toEqual({ projects: [] });
  });

  test("a read-only Studio: 403 NATIVE_READ_ONLY on every mutation route; reads still pass admission", async () => {
    const { workspace, alice } = a4Workspace();
    for (const route of mutations) {
      const reply = await a4(workspace, alice, "POST", route.path, {}, { executionAllowed: false });
      expect([route.path, reply.status, reply.body.code]).toEqual([route.path, 403, "NATIVE_READ_ONLY"]);
    }
    expect((await a4(workspace, alice, "GET", "/api/v1/a4/projects", undefined, { executionAllowed: false })).status).toBe(200);
  });

  test("a session naming a user users.yaml does not hold is refused before any route runs", async () => {
    const { workspace } = a4Workspace();
    const reply = await a4(workspace, { userId: "ghost" }, "POST", "/api/v1/a4/projects", { clientRequestId: requestId(), name: "x", expertise: "novice" });
    expect([reply.status, reply.body.code]).toEqual([401, "A4_PRINCIPAL_UNKNOWN"]);
  });
});

describe("GET …/verify takes no trust input (P1-63)", () => {
  async function project(workspace: string, who: { userId: string }): Promise<string> {
    const created = await a4(workspace, who, "POST", "/api/v1/a4/projects", { clientRequestId: requestId(), name: "verify fixture", expertise: "practitioner" });
    expect(created.status).toBe(201);
    return created.body.data!.projectId as string;
  }

  test("?trustList= is 400 QUERY_INVALID for the owner and the admin token; a body is 400 INPUT_INVALID; the plain read answers", async () => {
    const { workspace, alice } = a4Workspace();
    const projectId = await project(workspace, alice);
    const path = `/api/v1/a4/projects/${projectId}/verify`;
    for (const who of [alice, "admin"] as const) {
      const reply = await a4(workspace, who, "GET", `${path}?trustList=/tmp/attacker-trust.json`);
      expect([reply.status, reply.body.code]).toEqual([400, "QUERY_INVALID"]);
    }
    const withBody = await a4(workspace, alice, "GET", path, { trustList: "/tmp/attacker-trust.json" });
    expect([withBody.status, withBody.body.code]).toEqual([400, "INPUT_INVALID"]);
    const plain = await a4(workspace, alice, "GET", path);
    expect(plain.status).toBe(200);
    expect(plain.body.data).toMatchObject({ schema: "amc.a4-verify/v1", projectId, section: "integrity" });
  });

  test("a non-member without OWNER or AUDITOR is 403 A4_NOT_A_MEMBER on verify", async () => {
    const { workspace, alice } = a4Workspace();
    const projectId = await project(workspace, alice);
    const { addUser } = await import("../../src/auth/authApi.js");
    const viewer = addUser({ workspace, username: "outsider", roles: ["VIEWER"], password: "p235-outsider-password" });
    const reply = await a4(workspace, { userId: viewer.userId }, "GET", `/api/v1/a4/projects/${projectId}/verify`);
    expect([reply.status, reply.body.code]).toEqual([403, "A4_NOT_A_MEMBER"]);
    // The store saw one project only: the refusal recorded nothing.
    const store = openA4Store(workspace);
    try {
      expect(store.readChain(projectId).map((link) => link.kind)).toEqual(["CREATED"]);
    } finally {
      store.close();
    }
  });
});
