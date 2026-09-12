import { createServer, request as httpRequest, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleStudioApiDelegation, type StudioApiAuthContext } from "../src/studio/apiDelegation.js";
import { handleNativeTasksRoute } from "../src/api/nativeTasksRouter.js";
import { nativeCsrfTokenForSession, NATIVE_CSRF_HEADER, NATIVE_INTENT_HEADER, NATIVE_INTENT_VALUE } from "../src/studio/nativeAdmission.js";
import { NativeTaskServiceError, type NativeTaskConfiguration, type NativeTaskService, type NativeTaskView } from "../src/studio/nativeTaskTypes.js";

const proof = nativeCsrfTokenForSession({ nonce: "tracked-session-nonce-for-admission" });
const requestId = "28e32900-9c63-4bd1-a21a-ce3b3a1f16aa";
const taskId = "task-admission-0001";
const human: StudioApiAuthContext = { isAdmin: false, agentId: null, username: "renamable-user", userId: "stable-user-id",
  roles: new Set(["OPERATOR"]), nativeCsrfToken: proof, sessionAuthSource: "LOCAL_USER" };
const view: NativeTaskView = { taskId, sessionId: "session-1", agentId: "reviewer", revision: 3,
  clientRequestId: requestId, lastClientRequestId: requestId, provider: "stub", model: null, tools: "none", toolsDigest: null,
  maxSteps: 2, maxTokens: 64, state: "idle", archived: false, createdAt: 1, updatedAt: 2, turnEndReason: "complete", error: null,
  validationOutputs: [], validationSelection: null, validation: { status: "not-requested", turn: null, configSha256: null, checks: [] },
  verification: "not-verified", approvals: [], approvalError: null, nextCursor: 2, firstCursor: 0, droppedEvents: 0, canResume: true,
  resumeBlockedReason: null, history: { status: "authenticated", backend: "sqlite", headEventHash: "a".repeat(64), eventCount: 2, message: "Synthetic route dispatch fixture" } };
const configuration: NativeTaskConfiguration = { schemaVersion: "2026-09-08", agentId: "reviewer", demo: false,
  providers: [{ id: "stub", local: true, model: "fixed", credential: null }],
  validation: { ready: false, configSha256: null, checks: [], message: "No operator checks configured." },
  scope: { ready: false, digest: null, approvalRequired: true, tools: [], message: "Review signed tools first." },
  limits: { maxActive: 4, maxSteps: 8, maxTokens: 1024, turnTimeoutMs: 1000, idleTimeoutMs: 1000, lifetimeMs: 5000,
    maxEvents: 512, maxEventBytes: 2_097_152, maxPromptBytes: 16_384 }, boundary: "Native governed execution." };
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });

// Node's fetch rewrites Host to its URL authority. A rebind probe must transmit
// the hostile Host on the wire, rather than merely place it in fetch options.
async function rawHttpResponse(url: string, method: "GET" | "POST", headers: Record<string, string>, body?: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { method, headers }, response => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => {
        const receivedHeaders = new Headers();
        for (let i = 0; i < response.rawHeaders.length; i += 2) receivedHeaders.append(response.rawHeaders[i]!, response.rawHeaders[i + 1]!);
        resolve(new Response(Buffer.concat(chunks).toString("utf8"), { status: response.statusCode ?? 500, headers: receivedHeaders }));
      });
    });
    request.on("error", reject); request.end(body);
  });
}

function fakeService() {
  // Only the process-owning service is replaced. HTTP parsing, role policy, admission and API dispatch are real.
  return {
    configuration: vi.fn<NativeTaskService["configuration"]>(async () => configuration),
    list: vi.fn<NativeTaskService["list"]>(() => [view]),
    start: vi.fn<NativeTaskService["start"]>(async () => view),
    poll: vi.fn<NativeTaskService["poll"]>(() => ({ task: view, events: [], truncated: false })),
    turn: vi.fn<NativeTaskService["turn"]>(async () => view),
    cancel: vi.fn<NativeTaskService["cancel"]>(() => view),
    release: vi.fn<NativeTaskService["release"]>(async () => view),
    resume: vi.fn<NativeTaskService["resume"]>(async () => view),
    archive: vi.fn<NativeTaskService["archive"]>(() => ({ ...view, state: "closed", archived: true, canResume: false })),
    verify: vi.fn<NativeTaskService["verify"]>(async () => view), close: vi.fn<NativeTaskService["close"]>(async () => {})
  } satisfies NativeTaskService;
}

async function fixture(options: { auth?: StudioApiAuthContext | null; executionAllowed?: boolean; contextualized?: boolean } = {}) {
  const workspace = mkdtempSync(join(tmpdir(), "amc-native-api-admission-"));
  const service = fakeService();
  const auth = options.auth === undefined ? human : options.auth;
  let executionAllowed = options.executionAllowed ?? true;
  let origin = "";
  const json = (res: ServerResponse, status: number, payload: unknown) => {
    res.statusCode = status; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(payload));
  };
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", "http://fixture.invalid").pathname;
    const operation = options.contextualized === false
      ? handleNativeTasksRoute(pathname, req.method ?? "GET", req, res, { workspace })
      : handleStudioApiDelegation({ pathname, method: req.method ?? "GET", req, res, workspace, token: "fixture-admin",
        clientIp: "127.0.0.1", authenticate: () => auth,
        requireRoles: ({ auth: actor, roles, res: response }) => {
          if (actor.isAdmin || roles.some(role => actor.roles.has(role))) return true;
          json(response, 403, { error: "requires role" }); return false;
        }, json, apiLimiter: () => ({ allowed: true, limit: 240, remaining: 239, resetTs: 1, retryAfterSeconds: 0 }),
        privilegedApiLimiter: () => ({ allowed: true, limit: 600, remaining: 599, resetTs: 1, retryAfterSeconds: 0 }),
        setRateLimitHeaders: () => {}, nativeTaskService: service, nativeAllowedOrigins: [origin],
        nativeExecutionAllowed: () => executionAllowed });
    void operation.then(handled => { if (!handled) json(res, 404, { error: "not found" }); })
      .catch(() => json(res, 500, { error: "unexpected routing failure" }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No fixture port.");
  origin = `http://127.0.0.1:${address.port}`;
  cleanups.push(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); rmSync(workspace, { recursive: true, force: true }); });
  const headers = { origin, [NATIVE_INTENT_HEADER]: NATIVE_INTENT_VALUE, [NATIVE_CSRF_HEADER]: proof };
  const post = (path: string, body: unknown, overrides: Record<string, string | undefined> = {}) => {
    const selected: Record<string, string> = { "content-type": "application/json", ...headers };
    for (const [key, value] of Object.entries(overrides)) { if (value === undefined) delete selected[key]; else selected[key] = value; }
    if (Object.hasOwn(selected, "host")) return rawHttpResponse(origin + path, "POST", selected, JSON.stringify(body));
    return fetch(origin + path, { method: "POST", headers: selected, body: JSON.stringify(body) });
  };
  return { origin, service, headers, post, setReadOnly: () => { executionAllowed = false; } };
}
const startBody = { clientRequestId: requestId, agentId: "reviewer", provider: "stub", tools: "none", prompt: "Summarize this task." };

describe("native Studio authenticated API admission", () => {
  it("strict transport query contracts refuse duplicates and ignored authority fields before dispatch", async () => {
    const f = await fixture();
    for (const suffix of ["agentId=reviewer&agentId=other", "agentId=reviewer&workspace=other", "cursor=0"]) {
      expect((await fetch(`${f.origin}/api/v1/native-tasks/options?${suffix}`)).status).toBe(400);
    }
    expect(f.service.configuration).not.toHaveBeenCalled();
    for (const suffix of ["agentId=reviewer&agentId=other", "agentId=reviewer&cursor=0&cursor=1", "agentId=reviewer&env=other"]) {
      expect((await fetch(`${f.origin}/api/v1/native-tasks/${taskId}?${suffix}`)).status).toBe(400);
    }
    expect(f.service.poll).not.toHaveBeenCalled();
    for (const action of ["turn", "cancel", "release", "resume", "verify", "archive"] as const) {
      const body = { expectedRevision: 3, ...(action === "turn" ? { clientRequestId: requestId, prompt: "Never dispatched" } : {}) };
      expect((await f.post(`/api/v1/native-tasks/${taskId}/${action}?agentId=reviewer&agentId=other`, body)).status).toBe(400);
      expect(f.service[action]).not.toHaveBeenCalled();
    }
    for (const suffix of ["agentId=reviewer", "workspace=other"]) expect((await f.post(`/api/v1/native-tasks?${suffix}`, startBody)).status).toBe(400);
    expect(f.service.start).not.toHaveBeenCalled();
  });
  it("accepts only named public-check IDs and a reviewed digest, never browser commands or config paths", async () => {
    const f = await fixture();
    const selected = { ...startBody, tools: "workspace", toolsDigest: "a".repeat(64),
      validation: { configSha256: "b".repeat(64), checkIds: ["public_unit", "types"] } };
    expect((await f.post("/api/v1/native-tasks", selected)).status).toBe(202);
    expect(f.service.start).toHaveBeenLastCalledWith(expect.anything(), selected);
    f.service.start.mockClear();
    for (const validation of [
      { ...selected.validation, command: "browser-command-must-never-run" },
      { ...selected.validation, configPath: "/browser/chosen/file" },
      { ...selected.validation, checkIds: ["public_unit", "public_unit"] },
      { ...selected.validation, checkIds: [] },
      { ...selected.validation, checkIds: ["bad id"] },
      { ...selected.validation, configSha256: "not-a-digest" }
    ]) expect((await f.post("/api/v1/native-tasks", { ...selected, validation })).status).toBe(400);
    expect((await f.post("/api/v1/native-tasks", { ...startBody, validation: selected.validation })).status).toBe(400);
    expect(f.service.start).not.toHaveBeenCalled();
  });
  it("carries stable verified principal and explicit agent, without trusting a display name", async () => {
    const f = await fixture();
    const response = await f.post("/api/v1/native-tasks", startBody);
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(f.service.start).toHaveBeenCalledWith({ principalId: "session:LOCAL_USER:stable-user-id", demo: false, agentId: "reviewer" }, startBody);
    expect(await response.json()).toMatchObject({ ok: true, data: { taskId } });
  });

  it.each([
    ["intent", { [NATIVE_INTENT_HEADER]: undefined }, "NATIVE_INTENT_REQUIRED"],
    ["proof", { [NATIVE_CSRF_HEADER]: undefined }, "NATIVE_CSRF_REQUIRED"],
    ["wrong proof", { [NATIVE_CSRF_HEADER]: "0".repeat(64) }, "NATIVE_CSRF_REQUIRED"],
    ["origin", { origin: undefined }, "NATIVE_ORIGIN_REQUIRED"],
    ["hostile origin", { origin: "https://attacker.invalid" }, "NATIVE_ORIGIN_DENIED"],
    ["opaque origin", { origin: "null" }, "NATIVE_ORIGIN_DENIED"],
    ["forwarded host spoof", { host: "attacker.invalid", "x-forwarded-host": "127.0.0.1" }, "NATIVE_HOST_DENIED"]
  ] satisfies Array<[string, Record<string, string | undefined>, string]>)("refuses missing or false %s before service dispatch", async (_label, headers, code) => {
    const f = await fixture();
    const response = await f.post("/api/v1/native-tasks", startBody, headers);
    expect(response.status).toBe(403); expect(await response.json()).toMatchObject({ code });
    expect(f.service.start).not.toHaveBeenCalled();
  });

  it("allows authenticated config reads without mutation proof, but rejects rebinding Host", async () => {
    const f = await fixture();
    const response = await fetch(`${f.origin}/api/v1/native-tasks/options?agentId=reviewer`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { nativeCsrfToken: proof, executionBlocked: false } });
    const denied = await rawHttpResponse(`${f.origin}/api/v1/native-tasks/options`, "GET", { host: "attacker.invalid", "x-forwarded-host": new URL(f.origin).host });
    expect(denied.status).toBe(403); expect(f.service.configuration).toHaveBeenCalledTimes(1);
  });

  it("requires explicit intent for an originless admin client and uses its stable principal", async () => {
    const f = await fixture({ auth: { ...human, isAdmin: true, userId: "bootstrap-admin", nativeCsrfToken: null } });
    expect((await f.post("/api/v1/native-tasks", startBody, { origin: undefined, [NATIVE_CSRF_HEADER]: undefined, [NATIVE_INTENT_HEADER]: undefined })).status).toBe(403);
    expect((await f.post("/api/v1/native-tasks", startBody, { origin: undefined, [NATIVE_CSRF_HEADER]: undefined })).status).toBe(202);
    expect(f.service.start).toHaveBeenCalledTimes(1);
    expect(f.service.start.mock.calls[0]?.[0].principalId).toBe("bootstrap-admin");
  });

  it.each([
    ["unauthenticated", null, 401],
    ["ordinary viewer", { ...human, roles: new Set(["VIEWER"]) }, 403],
    ["agent token", { ...human, agentId: "reviewer", roles: new Set(["AGENT"]) }, 403]
  ] satisfies Array<[string, StudioApiAuthContext | null, number]>)("refuses %s execution before native service", async (_label, auth, status) => {
    const f = await fixture({ auth }); expect((await f.post("/api/v1/native-tasks", startBody)).status).toBe(status);
    expect(f.service.start).not.toHaveBeenCalled();
  });

  it("lets demo VIEWER use stub without tools while rejecting live and tool spending", async () => {
    const f = await fixture({ auth: { ...human, userId: "local-demo", roles: new Set(["VIEWER"]), sessionAuthSource: "WORKSPACE_ROUTER" } });
    expect((await f.post("/api/v1/native-tasks", startBody)).status).toBe(202);
    for (const input of [{ ...startBody, provider: "openai-responses", model: "explicit-model" }, { ...startBody, tools: "workspace", toolsDigest: "a".repeat(64) }]) {
      const denied = await f.post("/api/v1/native-tasks", input);
      expect(denied.status).toBe(403); expect(await denied.json()).toMatchObject({ code: "NATIVE_DEMO_EXECUTION_DENIED" });
    }
    expect(f.service.start).toHaveBeenCalledTimes(1);
    f.service.poll.mockReturnValue({ task: { ...view, provider: "openai-responses" }, events: [], truncated: false });
    for (const action of ["resume", "turn"]) {
      const denied = await f.post(`/api/v1/native-tasks/${taskId}/${action}?agentId=reviewer`, { expectedRevision: 3, ...(action === "turn" ? { clientRequestId: requestId, prompt: "Continue" } : {}) });
      expect(denied.status).toBe(403);
    }
    expect(f.service.resume).not.toHaveBeenCalled(); expect(f.service.turn).not.toHaveBeenCalled();
  });

  it("blocks new execution in read-only mode while allowing revision-bound cleanup and verification", async () => {
    const f = await fixture(); f.setReadOnly();
    expect((await f.post("/api/v1/native-tasks", startBody)).status).toBe(403);
    for (const action of ["turn", "resume"]) {
      expect((await f.post(`/api/v1/native-tasks/${taskId}/${action}?agentId=reviewer`, { expectedRevision: 3, ...(action === "turn" ? { clientRequestId: requestId, prompt: "Continue" } : {}) })).status).toBe(403);
    }
    for (const action of ["cancel", "release", "verify", "archive"] as const) {
      expect((await f.post(`/api/v1/native-tasks/${taskId}/${action}?agentId=reviewer`, {})).status).toBe(400);
      expect(f.service[action]).not.toHaveBeenCalled();
      expect((await f.post(`/api/v1/native-tasks/${taskId}/${action}?agentId=reviewer`, { expectedRevision: 3 })).status).toBe(action === "cancel" ? 202 : 200);
      expect(f.service[action]).toHaveBeenCalledWith({ principalId: "session:LOCAL_USER:stable-user-id", agentId: "reviewer", demo: false }, taskId, 3);
    }
    expect(f.service.start).not.toHaveBeenCalled(); expect(f.service.turn).not.toHaveBeenCalled(); expect(f.service.resume).not.toHaveBeenCalled();
  });

  it("lists archives only by an explicit canonical query and rejects ambiguous selections", async () => {
    const f = await fixture();
    for (const suffix of ["", "&includeArchived=false", "&includeArchived=true"]) {
      expect((await fetch(`${f.origin}/api/v1/native-tasks?agentId=reviewer${suffix}`)).status).toBe(200);
      expect(f.service.list).toHaveBeenLastCalledWith({ principalId: "session:LOCAL_USER:stable-user-id", agentId: "reviewer", demo: false }, suffix.endsWith("=true"));
    }
    f.service.list.mockClear();
    for (const suffix of ["includeArchived=1", "includeArchived=TRUE", "includeArchived=", "includeArchived=true&includeArchived=false",
      "agentId=other", "unexpected=true"]) {
      expect((await fetch(`${f.origin}/api/v1/native-tasks?agentId=reviewer&${suffix}`)).status).toBe(400);
    }
    expect(f.service.list).not.toHaveBeenCalled();
  });

  it("archives through the existing owner, intent, CSRF and strict revision boundary", async () => {
    const f = await fixture();
    const path = `/api/v1/native-tasks/${taskId}/archive?agentId=reviewer`;
    for (const headers of [{ [NATIVE_INTENT_HEADER]: undefined }, { [NATIVE_CSRF_HEADER]: undefined }, { origin: "https://attacker.invalid" }]) {
      expect((await f.post(path, { expectedRevision: 3 }, headers)).status).toBe(403);
    }
    for (const body of [{}, { expectedRevision: 0 }, { expectedRevision: 3, principalId: "other" }, { expectedRevision: 3, deleteEvidence: true }]) {
      expect((await f.post(path, body)).status).toBe(400);
    }
    expect(f.service.archive).not.toHaveBeenCalled();
    const response = await f.post(path, { expectedRevision: 3 });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { taskId, state: "closed", archived: true, canResume: false } });
    expect(f.service.archive).toHaveBeenCalledWith({ principalId: "session:LOCAL_USER:stable-user-id", agentId: "reviewer", demo: false }, taskId, 3);
    expect(f.service.verify).not.toHaveBeenCalled();
  });

  it.each([
    ["unauthenticated", null, 401],
    ["ordinary viewer", { ...human, roles: new Set(["VIEWER"]) }, 403],
    ["agent token", { ...human, agentId: "reviewer", roles: new Set(["AGENT"]) }, 403]
  ] satisfies Array<[string, StudioApiAuthContext | null, number]>)("refuses %s archival before native service", async (_label, auth, status) => {
    const f = await fixture({ auth });
    expect((await f.post(`/api/v1/native-tasks/${taskId}/archive?agentId=reviewer`, { expectedRevision: 3 })).status).toBe(status);
    expect(f.service.archive).not.toHaveBeenCalled();
  });

  it.each(["workspace", "command", "env", "baseUrl", "credentialRef", "mcpConfig", "principalId"])("rejects caller-supplied authority field %s", async field => {
    const f = await fixture();
    expect((await f.post("/api/v1/native-tasks", { ...startBody, [field]: "attacker-choice" })).status).toBe(400);
    expect(f.service.start).not.toHaveBeenCalled();
  });

  it.each(["Reviewer", "reviewer.alias", "../reviewer", "reviewer/other"])("refuses noncanonical agent ID %s instead of silently changing its identity", async agentId => {
    const f = await fixture();
    expect((await f.post("/api/v1/native-tasks", { ...startBody, agentId })).status).toBe(400);
    expect(f.service.start).not.toHaveBeenCalled();
  });

  it("preserves explicit agent/cursor and refuses malformed cursors without polling", async () => {
    const f = await fixture();
    expect((await fetch(`${f.origin}/api/v1/native-tasks/${taskId}?agentId=reviewer&cursor=17`)).status).toBe(200);
    expect(f.service.poll).toHaveBeenCalledWith({ principalId: "session:LOCAL_USER:stable-user-id", demo: false, agentId: "reviewer" }, taskId, 17);
    for (const cursor of ["-1", "1e3", "01", "9007199254740992"]) expect((await fetch(`${f.origin}/api/v1/native-tasks/${taskId}?agentId=reviewer&cursor=${cursor}`)).status).toBe(400);
    expect(f.service.poll).toHaveBeenCalledTimes(1);
  });

  it("exposes only declared public service errors, never arbitrary credential/process messages", async () => {
    const f = await fixture();
    f.service.start.mockRejectedValueOnce(new NativeTaskServiceError("REVISION_CONFLICT", 409, "Refresh task state."));
    const conflict = await f.post("/api/v1/native-tasks", startBody);
    expect(conflict.status).toBe(409); expect(await conflict.json()).toMatchObject({ code: "NATIVE_REVISION_CONFLICT" });
    f.service.start.mockRejectedValueOnce(Object.assign(new Error("private-provider-key=secret"), { statusCode: 403, code: "NATIVE_FAKE" }));
    const failure = await f.post("/api/v1/native-tasks", startBody);
    expect(failure.status).toBe(500); expect(await failure.text()).not.toMatch(/secret|NATIVE_FAKE/);
  });

  it("does not execute when the generic API is called without the checked Studio context", async () => {
    const f = await fixture({ contextualized: false });
    expect((await f.post("/api/v1/native-tasks", startBody)).status).toBe(503);
    expect(f.service.start).not.toHaveBeenCalled();
  });
});
