import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { AMCNativeClient, type AMCNativeSession, type AMCNativeTurn } from "../src/sdk/nativeAgentClient.js";
import { createNativeTaskService } from "../src/studio/nativeTaskService.js";
import { NativeTaskDescriptors, nativeTaskId } from "../src/studio/nativeTaskDescriptors.js";
import * as projection from "../src/studio/nativeTaskProjection.js";
import type { NativeTaskActor, NativeTaskInputPart, NativeTaskService, NativeTaskStartRequest } from "../src/studio/nativeTaskTypes.js";
import { IMAGE_PNG_BASE64 } from "./fixtures/nativeAcpImageRuntime.js";
import { wavBytes } from "./fixtures/nativeSignedAudio.js";

// Control-flow unit tests: only the child client and history projection are doubles.
// Actual descriptor signing/deduplication is retained. These are NOT native runtime,
// writer-resume or evidence acceptance; real signed media projection is covered separately.
const actor: NativeTaskActor = { principalId: "p10:operator", agentId: "default", demo: false };
const capabilities = { promptCapabilities: { image: true, audio: true }, _meta: { "dev.agentmaturity.amc": {
  orderedImageInput: "amc-image-input@2", audioInput: { format: "amc-audio-input@1", encoderId: "gemini-generate-content", encoderVersion: 2, mimeTypes: ["audio/wav"] }
} } };
let root: string, home: string, current: projection.NativeTaskProjection, serial = 0;
const services: NativeTaskService[] = [];
const pending: Array<{ resolve(): void; reject(error: Error): void; cancel: ReturnType<typeof vi.fn>; settled: boolean }> = [];
let runtimeCapabilities: Readonly<Record<string, unknown>>;
function turn(): AMCNativeTurn {
  let resolve!: () => void, reject!: (error: Error) => void;
  const result = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  const cancel = vi.fn(); pending.push({ resolve, reject, cancel, settled: false });
  return { result, cancel } as unknown as AMCNativeTurn;
}
function client() {
  const session = { sessionId: "p10-synthetic-session", prompt: vi.fn<AMCNativeSession["prompt"]>(() => turn()),
    promptParts: vi.fn<AMCNativeSession["promptParts"]>(() => turn()), promptAudioParts: vi.fn<AMCNativeSession["promptAudioParts"]>(() => turn()),
    release: vi.fn(async () => {}) };
  const value = { capabilities: runtimeCapabilities, processClosed: false, session,
    newSession: vi.fn(async () => session), resumeSession: vi.fn(async (_sessionId: string) => session),
    close: vi.fn(async () => { value.processClosed = true; }) };
  return value;
}
const clients: ReturnType<typeof client>[] = [];
function service(): NativeTaskService {
  const result = createNativeTaskService({ workspace: root, credentialsHome: home, credentialsFile: join(home, "credentials.yaml"),
    environment: { HOME: home, PATH: process.env.PATH, AMC_VAULT_PASSPHRASE: "p10-synthetic-only",
      GEMINI_API_KEY: "p10-fake-never-sent", OPENAI_API_KEY: "p10-unrelated-never-sent" } });
  services.push(result); return result;
}
function input(parts: NativeTaskInputPart[] = [{ type: "audio", mimeType: "audio/wav", data: wavBytes().toString("base64") },
  { type: "text", text: "private original prompt  " }, { type: "image", mimeType: "image/png", data: IMAGE_PNG_BASE64 }]): NativeTaskStartRequest {
  return { clientRequestId: randomUUID(), agentId: "default", provider: "gemini-audio", model: "fixture-model", tools: "none",
    input: { format: "amc-audio-input@1", parts } };
}
async function finish(error?: Error): Promise<void> {
  if (!error) current = { ...current, ending: "complete", endingId: `synthetic-ending-${++serial}` };
  for (const task of pending) if (!task.settled) { task.settled = true; if (error) task.reject(error); else task.resolve(); }
  await Promise.resolve(); await Promise.resolve();
}
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "p10-synthetic-only"); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  root = mkdtempSync(join(tmpdir(), "amc-p10-service-")); home = join(root, "operator-home"); mkdirSync(home, { mode: 0o700 }); // the credentials store refuses a group/other-readable home
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  runtimeCapabilities = structuredClone(capabilities); clients.length = 0; pending.length = 0; serial = 0;
  current = { history: { status: "authenticated", backend: "sqlite", headEventHash: "a".repeat(64), eventCount: 1,
      message: "Synthetic unit-test projection, not evidence acceptance" }, storeHeadEventHash: "a".repeat(64),
    validation: { status: "not-requested", turn: null, configSha256: null, checks: [] }, validationOutputs: [], events: [],
    nextCursor: 0, firstCursor: 1, droppedEvents: 0, ending: null, endingId: null, closed: false, approvals: [], approvalError: null };
  vi.spyOn(projection, "readNativeTaskProjection").mockImplementation(() => current);
  vi.spyOn(AMCNativeClient, "start").mockImplementation(async () => {
    const value = client(); clients.push(value); return value as unknown as AMCNativeClient;
  });
});
afterEach(async () => {
  try { await finish(); for (const value of services.splice(0).reverse()) await value.close(); }
  finally { vi.restoreAllMocks(); lockVault(root); rmSync(root, { recursive: true, force: true }); vi.unstubAllEnvs(); }
});

describe("P10 native task media lifecycle", () => {
  test("admission snapshots before await, dispatches audio once, and stores only the signed identity hash", async () => {
    const s = service(), parts: NativeTaskInputPart[] = [{ type: "audio", mimeType: "audio/wav", data: wavBytes().toString("base64") },
      { type: "text", text: "private original prompt  " }, { type: "image", mimeType: "image/png", data: IMAGE_PNG_BASE64 }];
    const request = input(parts), retry = structuredClone(request);
    const starting = s.start(actor, request); parts.splice(0);
    const task = await starting;
    expect(task.state).toBe("running"); expect(clients).toHaveLength(1);
    expect(clients[0]!.session.prompt).not.toHaveBeenCalled(); expect(clients[0]!.session.promptParts).not.toHaveBeenCalled();
    expect(clients[0]!.session.promptAudioParts.mock.calls[0]![0].map(part => part.type)).toEqual(["audio", "text", "image"]);
    expect(AMCNativeClient.start).toHaveBeenCalledWith(expect.objectContaining({ provider: "gemini-audio", credential: "GEMINI_API_KEY", credentialsMode: "operator-only",
      env: expect.objectContaining({ GEMINI_API_KEY: "p10-fake-never-sent" }) }));
    const env = vi.mocked(AMCNativeClient.start).mock.calls[0]![0].env;
    expect(env?.OPENAI_API_KEY).toBeUndefined();
    const descriptor = readFileSync(join(root, ".amc", "studio-native-tasks", `${task.taskId}.json`), "utf8");
    expect(descriptor).not.toContain(IMAGE_PNG_BASE64); expect(descriptor).not.toContain(wavBytes().toString("base64"));
    expect(descriptor).not.toContain("private original prompt"); expect(descriptor).not.toContain("p10-fake-never-sent");
    expect((await s.start(actor, retry)).revision).toBe(1); expect(clients[0]!.session.promptAudioParts).toHaveBeenCalledTimes(1);
    await finish(); expect(s.poll(actor, task.taskId).task.state).toBe("idle");
  });

  test("lost follow-up acknowledgements survive release and observer restart without replay", async () => {
    const s = service(), request = input(), first = await s.start(actor, request); await finish();
    const followup = { clientRequestId: randomUUID(), expectedRevision: 1, input: request.input! };
    await s.turn(actor, first.taskId, followup); await finish();
    await s.release(actor, first.taskId, 2);
    const observer = service(), retained = new NativeTaskDescriptors(root).read(first.taskId)!;
    expect((await observer.turn(actor, first.taskId, followup)).revision).toBe(2);
    expect((await observer.start(actor, request)).revision).toBe(2);
    expect(clients).toHaveLength(1); expect(clients[0]!.session.promptAudioParts).toHaveBeenCalledTimes(2);
    const changed = { ...followup, input: { ...followup.input, parts: [...followup.input.parts].reverse() } };
    await expect(observer.turn(actor, first.taskId, changed)).rejects.toMatchObject({ code: "NATIVE_REQUEST_CONFLICT" });
    expect(new NativeTaskDescriptors(root).read(first.taskId)).toEqual(retained);
    const resumed = await observer.resume(actor, first.taskId, 2);
    expect(resumed.sessionId).toBe(first.sessionId); expect(clients).toHaveLength(2);
    expect(clients[1]!.resumeSession).toHaveBeenCalledWith(first.sessionId);
    expect(clients[1]!.newSession).not.toHaveBeenCalled(); expect(clients[1]!.session.promptAudioParts).not.toHaveBeenCalled();
  });

  test("startup cancellation prevents original attachments reaching any prompt API", async () => {
    const s = service(), request = input();
    const starting = s.start(actor, request);
    s.cancel(actor, nativeTaskId(actor.principalId, request.clientRequestId), 1);
    const task = await starting;
    expect(task.state).not.toBe("running");
    for (const value of clients) {
      expect(value.session.prompt).not.toHaveBeenCalled(); expect(value.session.promptParts).not.toHaveBeenCalled(); expect(value.session.promptAudioParts).not.toHaveBeenCalled();
    }
    await s.start(actor, request); expect(AMCNativeClient.start).not.toHaveBeenCalled();
  });

  test("running cancellation is a request, not a signed completion or replay grant", async () => {
    const s = service(), request = input(), task = await s.start(actor, request);
    expect(s.cancel(actor, task.taskId, 1).state).toBe("cancel-requested"); expect(pending[0]!.cancel).toHaveBeenCalledTimes(1);
    expect(new NativeTaskDescriptors(root).read(task.taskId)?.pendingTurn).toBe(true);
    await s.start(actor, request); expect(clients[0]!.session.promptAudioParts).toHaveBeenCalledTimes(1);
    await finish(new Error("synthetic lost acknowledgement"));
    expect(s.poll(actor, task.taskId).task.state).toBe("failed");
    expect(new NativeTaskDescriptors(root).read(task.taskId)?.pendingTurn).toBe(true);
    await s.release(actor, task.taskId, 1);
    await s.resume(actor, task.taskId, 1);
    expect(clients[1]!.session.promptAudioParts).not.toHaveBeenCalled();
  });

  test("rejects unsupported media before signing an admission, and rechecks negotiation before a new turn", async () => {
    const s = service(), request = input();
    await expect(s.start(actor, { ...request, provider: "gemini" })).rejects.toMatchObject({ code: "NATIVE_INPUT_UNSUPPORTED" });
    expect(new NativeTaskDescriptors(root).list()).toEqual([]); expect(AMCNativeClient.start).not.toHaveBeenCalled();
    const task = await s.start(actor, request); await finish();
    clients[0]!.capabilities = { promptCapabilities: { audio: true, image: true } };
    const before = new NativeTaskDescriptors(root).read(task.taskId);
    await expect(s.turn(actor, task.taskId, { clientRequestId: randomUUID(), expectedRevision: 1, input: request.input! }))
      .rejects.toMatchObject({ code: "NATIVE_INPUT_NOT_NEGOTIATED" });
    expect(new NativeTaskDescriptors(root).read(task.taskId)).toEqual(before);
    expect(clients[0]!.session.promptAudioParts).toHaveBeenCalledTimes(1);
  });

  test("failed initial negotiation creates no session or provider prompt", async () => {
    runtimeCapabilities = { promptCapabilities: { audio: true, image: true } };
    const task = await service().start(actor, input());
    expect(task.state).toBe("failed"); expect(task.sessionId).toBeNull();
    expect(clients[0]!.newSession).not.toHaveBeenCalled(); expect(clients[0]!.session.promptAudioParts).not.toHaveBeenCalled();
    expect(task.history.status).toBe("not-started"); expect(task.verification).toBe("not-verified");
  });

  test("history authentication failure clears prior media, approval and validation views", async () => {
    const s = service(), task = await s.start(actor, input()); await finish();
    vi.mocked(projection.readNativeTaskProjection).mockImplementation(() => { throw new Error("synthetic source mismatch"); });
    await s.release(actor, task.taskId, 1);
    const poll = s.poll(actor, task.taskId);
    expect(poll).toMatchObject({ events: [], truncated: true, task: { history: { status: "unavailable", headEventHash: null },
      approvals: [], validationOutputs: [], verification: "not-verified", canResume: false } });
    await expect(s.resume(actor, task.taskId, 1)).rejects.toMatchObject({ code: "NATIVE_EVIDENCE_UNAVAILABLE" });
    expect(clients).toHaveLength(1);
  });

  test("discovery offers explicit Gemini versions but demo remains text-only stub", async () => {
    const s = service(), options = await s.configuration(actor);
    expect(options.providers.find(provider => provider.id === "gemini-audio")).toMatchObject({ credential: { ref: "GEMINI_API_KEY", configured: true },
      input: { formats: ["text", "amc-image-input@2", "amc-audio-input@1"], audioMimeTypes: ["audio/wav"], modelSupport: "not-probed" } });
    expect(options.providers.find(provider => provider.id === "gemini")?.input?.audioMimeTypes).toEqual([]);
    // The providers the CLI/ACP already route are offered here with honest credential and model semantics; none is probed.
    expect(options.providers.find(provider => provider.id === "deepseek")).toMatchObject({ local: false, model: "required",
      credential: { ref: "DEEPSEEK_API_KEY" }, input: expect.objectContaining({ formats: ["text"] }) });
    expect(options.providers.find(provider => provider.id === "ollama")).toMatchObject({ local: true, model: "required", credential: null,
      input: expect.objectContaining({ formats: ["text", "amc-image-input@2"], audioMimeTypes: [] }) });
    expect(options.providers.find(provider => provider.id === "stub")).toMatchObject({ local: true, model: "fixed", credential: null });
    const demo = { ...actor, demo: true };
    expect((await s.configuration(demo)).providers).toEqual([expect.objectContaining({ id: "stub", input: expect.objectContaining({ formats: ["text"] }) })]);
    await expect(s.start(demo, input())).rejects.toMatchObject({ code: "NATIVE_SCOPE_REFUSED" });
    expect(AMCNativeClient.start).not.toHaveBeenCalled();
  });
});
