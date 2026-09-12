import { createServer, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { handleStudioApiDelegation, type StudioApiAuthContext } from "../src/studio/apiDelegation.js";
import { nativeCsrfTokenForSession, NATIVE_CSRF_HEADER, NATIVE_INTENT_HEADER, NATIVE_INTENT_VALUE } from "../src/studio/nativeAdmission.js";
import { nativeTaskInputCapabilities } from "../src/studio/nativeTaskInput.js";
import { nativeTaskSchemas } from "../src/studio/nativeTaskOpenapi.js";
import type { NativeTaskConfiguration, NativeTaskService, NativeTaskView } from "../src/studio/nativeTaskTypes.js";
import { IMAGE_PNG_BASE64 } from "./fixtures/nativeAcpImageRuntime.js";
import { wavBytes } from "./fixtures/nativeSignedAudio.js";

// Actual HTTP, authentication delegation, CSRF and parsing; process service is a
// dispatch double. Original-byte validation and signed projection have separate regressions.
const proof = nativeCsrfTokenForSession({ nonce: "p10-tracked-session-nonce" });
const requestId = "0ebd57dd-e8c0-48d0-99af-b888d5141001", taskId = "task-p10-route";
const human: StudioApiAuthContext = { isAdmin: false, agentId: null, username: "p10-display-name", userId: "p10-stable-user",
  roles: new Set(["OPERATOR"]), nativeCsrfToken: proof, sessionAuthSource: "LOCAL_USER" };
const view: NativeTaskView = { taskId, sessionId: "route-unit-session", agentId: "default", revision: 1,
  clientRequestId: requestId, lastClientRequestId: requestId, provider: "gemini-audio", model: "fixture-model", tools: "none", toolsDigest: null,
  maxSteps: 2, maxTokens: 64, state: "idle", archived: false, createdAt: 1, updatedAt: 2, turnEndReason: null, error: null,
  validationSelection: null, validationOutputs: [], validation: { status: "not-requested", turn: null, configSha256: null, checks: [] },
  verification: "not-verified", approvals: [], approvalError: null, nextCursor: 0, firstCursor: 1, droppedEvents: 0, canResume: false,
  resumeBlockedReason: null, history: { status: "not-started", backend: null, headEventHash: null, eventCount: 0, message: "Synthetic routing fixture" } };
const configuration: NativeTaskConfiguration = { schemaVersion: "2026-09-08", agentId: "default", demo: false,
  providers: [{ id: "gemini-audio", local: false, model: "required", credential: { ref: "GEMINI_API_KEY", configured: false, source: null }, input: nativeTaskInputCapabilities("gemini-audio") }],
  validation: { ready: false, configSha256: null, checks: [], message: "No operator checks configured." },
  scope: { ready: false, digest: null, approvalRequired: true, tools: [], message: "Review signed tools first." },
  limits: { maxActive: 4, maxSteps: 8, maxTokens: 1024, turnTimeoutMs: 120000, idleTimeoutMs: 900000, lifetimeMs: 3600000,
    maxEvents: 512, maxEventBytes: 2097152, maxPromptBytes: 16384 }, boundary: "No model contacted in routing fixture." };
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function fakeService() {
  return {
    configuration: vi.fn<NativeTaskService["configuration"]>(async () => configuration), list: vi.fn<NativeTaskService["list"]>(() => [view]),
    start: vi.fn<NativeTaskService["start"]>(async () => view), turn: vi.fn<NativeTaskService["turn"]>(async () => view),
    poll: vi.fn<NativeTaskService["poll"]>(() => ({ task: view, events: [], truncated: false })),
    cancel: vi.fn<NativeTaskService["cancel"]>(() => view), release: vi.fn<NativeTaskService["release"]>(async () => view),
    resume: vi.fn<NativeTaskService["resume"]>(async () => view), verify: vi.fn<NativeTaskService["verify"]>(async () => view),
    archive: vi.fn<NativeTaskService["archive"]>(() => view), close: vi.fn<NativeTaskService["close"]>(async () => {})
  } satisfies NativeTaskService;
}
async function fixture(auth: StudioApiAuthContext | null = human) {
  const workspace = mkdtempSync(join(tmpdir(), "amc-p10-http-")), service = fakeService();
  let origin = "", executionAllowed = true;
  const json = (res: ServerResponse, status: number, value: unknown) => { res.statusCode = status; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(value)); };
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", "http://fixture.invalid").pathname;
    void handleStudioApiDelegation({ pathname, method: req.method ?? "GET", req, res, workspace, token: "p10-fixture-admin",
      clientIp: "127.0.0.1", authenticate: () => auth,
      requireRoles: ({ auth: actor, roles, res: response }) => {
        if (actor.isAdmin || roles.some(role => actor.roles.has(role))) return true;
        json(response, 403, { error: "requires role" }); return false;
      }, json, apiLimiter: () => ({ allowed: true, limit: 240, remaining: 239, resetTs: 1, retryAfterSeconds: 0 }),
      privilegedApiLimiter: () => ({ allowed: true, limit: 600, remaining: 599, resetTs: 1, retryAfterSeconds: 0 }),
      setRateLimitHeaders: () => {}, nativeTaskService: service, nativeAllowedOrigins: [origin], nativeExecutionAllowed: () => executionAllowed
    }).then(handled => { if (!handled) json(res, 404, { error: "not found" }); }).catch(() => json(res, 500, { error: "routing fixture failure" }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing fixture port");
  origin = `http://127.0.0.1:${address.port}`;
  cleanups.push(async () => {
    server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    rmSync(workspace, { recursive: true, force: true });
  });
  const rawPost = (path: string, body: string, overrides: Record<string, string | undefined> = {}) => {
    const headers: Record<string, string> = { "content-type": "application/json", origin, [NATIVE_CSRF_HEADER]: proof, [NATIVE_INTENT_HEADER]: NATIVE_INTENT_VALUE };
    for (const [name, value] of Object.entries(overrides)) { if (value === undefined) delete headers[name]; else headers[name] = value; }
    return fetch(origin + path, { method: "POST", headers, body });
  };
  return { origin, service, rawPost, post: (path: string, body: unknown, headers?: Record<string, string | undefined>) => rawPost(path, JSON.stringify(body), headers),
    readOnly: () => { executionAllowed = false; } };
}
const start = () => ({ clientRequestId: requestId, agentId: "default", provider: "gemini-audio", model: "fixture-model", tools: "none",
  input: { format: "amc-audio-input@1", parts: [{ type: "audio", mimeType: "audio/wav", data: wavBytes().toString("base64") },
    { type: "text", text: "" }, { type: "image", mimeType: "image/png", data: IMAGE_PNG_BASE64 }, { type: "text", text: " after  " }] } });

describe("P10 native media HTTP admission", () => {
  test("strict create/turn routes carry exact ordered input and the authenticated principal", async () => {
    const f = await fixture(), body = start();
    expect((await f.post("/api/v1/native-tasks", body)).status).toBe(202);
    expect(f.service.start).toHaveBeenCalledWith({ principalId: "session:LOCAL_USER:p10-stable-user", agentId: "default", demo: false }, body);
    const turn = { clientRequestId: requestId, expectedRevision: 1, input: body.input };
    expect((await f.post(`/api/v1/native-tasks/${taskId}/turn?agentId=default`, turn)).status).toBe(202);
    expect(f.service.turn).toHaveBeenCalledWith(expect.anything(), taskId, turn);
    expect(f.service.turn.mock.calls[0]![2].input?.parts).toEqual(body.input.parts);
  });

  test("structured media retains existing intent, cookie proof and origin requirements", async () => {
    const f = await fixture();
    for (const headers of [{ [NATIVE_INTENT_HEADER]: undefined }, { [NATIVE_CSRF_HEADER]: undefined },
      { [NATIVE_CSRF_HEADER]: "0".repeat(64) }, { origin: undefined }, { origin: "https://attacker.invalid" }]) {
      expect((await f.post("/api/v1/native-tasks", start(), headers)).status).toBe(403);
    }
    expect(f.service.start).not.toHaveBeenCalled();
  });

  test("unknown input fields and unsafe JSON keys are rejected, never sanitized into a different signed request", async () => {
    const f = await fixture(), body = start();
    const invalid = [
      { ...body, prompt: "not prepended" }, { ...body, principalId: "forged" },
      { ...body, input: { ...body.input, parts: [{ ...body.input.parts[0], uri: "https://unowned.invalid/a.wav" }] } },
      { ...body, input: { ...body.input, parts: [{ ...body.input.parts[0], filename: "local.wav" }] } },
      { ...body, input: { ...body.input, parts: [{ ...body.input.parts[0], sha256: "a".repeat(64) }] } },
      { ...body, input: { ...body.input, parts: [{ type: "resource_link", uri: "file:///private" }] } },
      { ...body, input: { ...body.input, format: "amc-audio-input@2" } }
    ];
    for (const value of invalid) expect((await f.post("/api/v1/native-tasks", value)).status).toBe(400);
    const raw = JSON.stringify(body).replace('"input":{', '"input":{"constructor":"must not vanish",');
    expect((await f.rawPost("/api/v1/native-tasks", raw)).status).toBe(400);
    expect((await f.rawPost("/api/v1/native-tasks", JSON.stringify(body).slice(0, -1))).status).toBe(400);
    expect(f.service.start).not.toHaveBeenCalled();
  });

  test("follow-ups cannot mutate validation, model or authority, and require an exact revision", async () => {
    const f = await fixture(), path = `/api/v1/native-tasks/${taskId}/turn?agentId=default`;
    const turn = { clientRequestId: requestId, expectedRevision: 1, input: start().input };
    for (const body of [{ ...turn, expectedRevision: 0 }, { ...turn, expectedRevision: 1.5 }, { ...turn, model: "other" },
      { ...turn, validation: { configSha256: "a".repeat(64), checkIds: ["new-check"] } }, { ...turn, workspace: "/other" }]) {
      expect((await f.post(path, body)).status).toBe(400);
    }
    expect(f.service.turn).not.toHaveBeenCalled();
    expect((await f.post("/api/v1/native-tasks?agentId=default", start())).status).toBe(400);
    expect((await f.post(path + "&agentId=other", turn)).status).toBe(400);
  });

  test("read-only mode refuses new media execution but keeps revision-bound cancellation and cleanup", async () => {
    const f = await fixture(); f.readOnly();
    expect((await f.post("/api/v1/native-tasks", start())).status).toBe(403);
    expect((await f.post(`/api/v1/native-tasks/${taskId}/turn`, { clientRequestId: requestId, expectedRevision: 1, input: start().input })).status).toBe(403);
    expect((await f.post(`/api/v1/native-tasks/${taskId}/resume`, { expectedRevision: 1 })).status).toBe(403);
    expect((await f.post(`/api/v1/native-tasks/${taskId}/cancel`, { expectedRevision: 1 })).status).toBe(202);
    expect((await f.post(`/api/v1/native-tasks/${taskId}/release`, { expectedRevision: 1 })).status).toBe(200);
    expect(f.service.start).not.toHaveBeenCalled(); expect(f.service.turn).not.toHaveBeenCalled(); expect(f.service.resume).not.toHaveBeenCalled();
  });

  test("demo cannot acquire the live audio provider through create or follow-up", async () => {
    const f = await fixture({ ...human, userId: "p10-demo", roles: new Set(["VIEWER"]), sessionAuthSource: "WORKSPACE_ROUTER" });
    expect((await f.post("/api/v1/native-tasks", start())).status).toBe(403);
    expect((await f.post(`/api/v1/native-tasks/${taskId}/turn`, { clientRequestId: requestId, expectedRevision: 1, input: start().input })).status).toBe(403);
    expect(f.service.start).not.toHaveBeenCalled(); expect(f.service.turn).not.toHaveBeenCalled();
  });

  test("options and OpenAPI discover media without contacting a provider or inventing model support", async () => {
    const f = await fixture(), response = await fetch(`${f.origin}/api/v1/native-tasks/options?agentId=default`);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ data: { nativeCsrfToken: proof, providers: [{
      input: { formats: ["text", "amc-image-input@2", "amc-audio-input@1"], modelSupport: "not-probed", maxPromptFrameBytes: 262144 }
    }] } });
    const schemas = nativeTaskSchemas();
    expect(schemas.NativeTaskStart).toMatchObject({ properties: { input: { $ref: "#/components/schemas/NativeTaskStructuredInput" } } });
    expect(schemas.NativeTaskTurn).toMatchObject({ oneOf: [{ required: ["prompt"] }, { required: ["input"] }] });
    expect(schemas.NativeTaskEvent).toMatchObject({ properties: { attachment: { properties: { sha256: expect.anything(), byteLength: expect.anything() } } } });
    expect(f.service.start).not.toHaveBeenCalled(); expect(f.service.turn).not.toHaveBeenCalled();
  });
});
