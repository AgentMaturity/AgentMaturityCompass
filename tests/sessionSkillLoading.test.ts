import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openAgentSession, type AgentSession } from "../src/agent/agentSession.js";
import { credentialRef } from "../src/credentials/credentialRef.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { deriveRecordedRequest } from "../src/llm/request/deriveRequest.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { sha256Hex } from "../src/utils/hash.js";
import { initWorkspace } from "../src/workspace.js";
import { acpRouteFor } from "../src/acp/acpStdioMain.js";
import { decodeNativeAudioInput } from "../src/attachments/nativeAudioInput.js";
import { decodeNativeOrderedInput } from "../src/attachments/nativeOrderedInput.js";
import { audioInput, audioResponse } from "./fixtures/nativeSignedAudio.js";
import { imageInput } from "./fixtures/nativeAcpImageRuntime.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport, textStep } from "./helpers/agentLoopHarness.js";

const dirs: string[] = [], sessions: AgentSession[] = [];
afterEach(() => {
  for (const session of sessions.splice(0)) { try { session.close(); } catch { /* Already settled. */ } }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function workspace() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-session-skills-"))); dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  const skillDir = join(dir, ".agents", "skills", "review"); mkdirSync(skillDir, { recursive: true });
  const raw = "---\nname: review\ndescription: Review the change\n---\nPreserve {{workspace_secret}} and $(touch NEVER_RUN) literally.\n";
  writeFileSync(join(skillDir, "SKILL.md"), raw);
  return { dir, raw, skillDir };
}
function sessionAt(dir: string, audio = false) {
  const registry = new AdapterRegistry();
  let requests = 0;
  if (audio) {
    const route = acpRouteFor({ workspace: dir, agentId: "default", providerId: "gemini-audio", model: "fixture-model", systemPrompt: "Session fixture" });
    if ("error" in route) throw new Error(route.error);
    registry.register({ ...route, credentialRef: null });
  } else registry.register({ providerId: LOOP_PROVIDER, adapter: scriptedAdapter([textStep("first"), textStep("second")]),
    baseUrl: "https://api.anthropic.invalid", credentialRef: credentialRef("AMC_LOOP_TEST_KEY"), models: [LOOP_MODEL] });
  const session = openAgentSession({ workspace: dir, agentId: "default", tools: "none",
    systemPrompt: "You are a careful assistant.", harnessVersion: "3.2.0", compositionDigest: "session-skill-fixture", policyDigest: "session-skill-fixture",
    route: audio ? { providerId: "gemini-audio", model: "fixture-model", params: { generationConfig: { maxOutputTokens: 64 } } }
      : { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
    makeLlm: own => new LlmRuntime({ session: own, registry, credentials: new FixedCredentials(), transport: async request => {
      requests++; return audio ? audioResponse(`skill-${requests}`) : silentTransport(request);
    } }) });
  sessions.push(session);
  return { session, requests: () => requests };
}
function payloads(dir: string, session: AgentSession, type: string) {
  return session.readEvents().filter(event => event.event_type === type).map(event => {
    const payload = readEventPayload(dir, event); if (payload.status !== "ok") throw new Error("Missing fixture payload");
    return { event, bytes: payload.bytes };
  });
}

describe("DXC-30: shared native sessions resolve operator skills before enqueue", () => {
  it("pins literal, attributed skill context in the request and clears it on a later plain turn", async () => {
    const { dir, raw } = workspace(), { session } = sessionAt(dir);
    expect(await session.prompt("/review inspect src/app.ts")).toMatchObject({ ok: true });
    const events = session.readEvents(), header = events.find(event => event.event_type === "request/header")!;
    const request = deriveRecordedRequest({ workspace: dir, events, headerEventId: header.id });
    expect(request.status, request.detail ?? undefined).toBe("reconstructed");
    expect(request.recordedDigest).toBe(request.derivedDigest);
    expect(request.bytes!.toString("utf8")).toContain(sha256Hex(raw));
    expect(request.bytes!.toString("utf8")).toContain("{{workspace_secret}}");
    expect(request.bytes!.toString("utf8")).toContain("$(touch NEVER_RUN)");
    const first = payloads(dir, session, "user/message");
    expect(first[0]?.bytes.toString()).toBe("inspect src/app.ts");
    expect(first.at(-1)?.bytes.toString()).toContain("# Skill: review");
    expect(await session.prompt("Continue normally")).toMatchObject({ ok: true });
    expect(payloads(dir, session, "user/message").at(-1)?.bytes.toString()).not.toContain("# Skill: review");
  });

  it("refuses unknown or malformed skills before any turn or provider request", async () => {
    const { dir, skillDir } = workspace(), { session, requests } = sessionAt(dir);
    expect(await session.prompt("/missing request")).toMatchObject({ ok: false, reason: expect.stringContaining("missing") });
    writeFileSync(join(skillDir, "SKILL.md"), "malformed");
    expect(await session.prompt("/review request")).toMatchObject({ ok: false, reason: expect.stringContaining("frontmatter") });
    expect(requests()).toBe(0);
    expect(session.readEvents().filter(event => event.event_type === "turn/start")).toEqual([]);
    expect(await session.prompt("Ordinary prompt")).toMatchObject({ ok: true });
  });

  it("uses the skill description for a bare slash invocation", async () => {
    const { dir } = workspace(), { session } = sessionAt(dir);
    expect(await session.prompt("/review")).toMatchObject({ ok: true });
    expect(payloads(dir, session, "user/message")[0]?.bytes.toString()).toBe("Review the change");
  });

  it("replaces only the leading text in ordered image input and preserves every later part", async () => {
    const { dir } = workspace(), { session } = sessionAt(dir, true);
    const image = imageInput();
    expect(await session.promptParts!([{ type: "text", text: "/review inspect this" }, { type: "image", image },
      { type: "text", text: "" }, { type: "text", text: "retain suffix" }])).toMatchObject({ ok: true });
    const inbox = payloads(dir, session, "loop/inbox")[0]!;
    const parts = decodeNativeOrderedInput(inbox.bytes);
    expect(parts.map(part => part.type)).toEqual(["text", "image", "text", "text"]);
    expect(parts[0]).toEqual({ type: "text", text: "inspect this" });
    expect(parts[2]).toEqual({ type: "text", text: "" });
    expect(parts[3]).toEqual({ type: "text", text: "retain suffix" });
    if (parts[1]?.type !== "image") throw new Error("Expected original image");
    expect(parts[1].image.data).toBe(image.bytes.toString("base64"));
  });

  it("preserves original audio and following text around a leading skill command", async () => {
    const { dir } = workspace(), { session } = sessionAt(dir, true), audio = audioInput();
    expect(await session.promptAudioParts!([{ type: "text", text: "/review listen carefully" }, { type: "audio", audio },
      { type: "text", text: "suffix" }])).toMatchObject({ ok: true });
    const parts = decodeNativeAudioInput(payloads(dir, session, "loop/inbox")[0]!.bytes);
    expect(parts.map(part => part.type)).toEqual(["text", "audio", "text"]);
    expect(parts[0]).toEqual({ type: "text", text: "listen carefully" });
    expect(parts[2]).toEqual({ type: "text", text: "suffix" });
    if (parts[1]?.type !== "audio") throw new Error("Expected original audio");
    expect(parts[1].audio.data).toBe(audio.bytes.toString("base64"));
  });

  it("does not interpret a suffix after media as a slash command", async () => {
    const { dir } = workspace(), { session } = sessionAt(dir, true);
    expect(await session.prompt("/review initial task")).toMatchObject({ ok: true });
    expect(await session.promptParts!([{ type: "image", image: imageInput() }, { type: "text", text: "/missing literal suffix" }])).toMatchObject({ ok: true });
    const inbox = payloads(dir, session, "loop/inbox").find(row => JSON.parse(row.event.meta_json).payloadFormat === "amc-image-input@2")!;
    const parts = decodeNativeOrderedInput(inbox.bytes);
    expect(parts[1]).toEqual({ type: "text", text: "/missing literal suffix" });
    expect(payloads(dir, session, "user/message").at(-1)?.bytes.toString()).not.toContain("# Skill: review");
  });

  it("validates the original leading part before replacing a command, retaining field refusals", async () => {
    const { dir } = workspace(), { session, requests } = sessionAt(dir, true);
    const invalid = [{ type: "text", text: "/review task", extra: "must refuse" }, { type: "image", image: imageInput() }];
    await expect(session.promptParts!(invalid as Parameters<NonNullable<AgentSession["promptParts"]>>[0])).rejects.toThrow(/Unsupported ordered input part|field/);
    expect(requests()).toBe(0);
    expect(session.readEvents().filter(event => event.event_type === "turn/start")).toEqual([]);
  });
});
