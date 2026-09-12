/** AUTHORED, UNEXECUTED. Public native composition/inbox gates, not live acceptance. */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { LoopInbox } from "../src/agent/inbox.js";
import { AgentDriver } from "../src/agent/agentDriver.js";
import { recordNativeImageMessage } from "../src/agent/nativeImageMessage.js";
import { loadNativeImageFiles } from "../src/attachments/nativeImageFiles.js";
import { decodeNativeImageInput, MAX_NATIVE_IMAGE_BYTES, NATIVE_IMAGE_INPUT_FORMAT } from "../src/attachments/nativeImageInput.js";
import { runComposedTurn } from "../src/kernel/agentLoopRunner.js";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { foldSurfaceEntries } from "../src/session/surfaceProjection.js";
import * as native from "../src/sdk/nativeAgentClient.js";
import { anthropicAdapter } from "../src/llm/providers/anthropicAdapter.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { anthropicTextStream, okStream, stubUpstream } from "./helpers/llmStubUpstream.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII=", "base64");
const dirs: string[] = [], writers = new Set<SessionService>();
afterEach(() => { for (const writer of writers) writer.disposeWithoutClosing(); writers.clear(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function workspace() {
  const path = mkdtempSync(join(tmpdir(), "amc-public-image-")); dirs.push(path);
  initWorkspace({ workspacePath: path, agentId: "default", trustBoundaryMode: "isolated" }); return path;
}
function writer() {
  const path = workspace(), session = new SessionService(path); writers.add(session);
  session.open({ agentId: "default", harnessVersion: "image-test", compositionDigest: "image-test", policyDigest: "image-test" });
  const system = session.recordSystemPrompt("Image fixture"); return { path, session, system };
}
const image = () => ({ filename: "pixel.png", bytes: Buffer.from(PNG), mediaType: "image/png" as const });
const route = { providerId: "fixture", model: "fixture-model", params: { stream: true, max_tokens: 64 } };

describe("native image public input and durable admission", () => {
  test("the in-process SDK exports its image-capable session path without inventing ACP image support", () => {
    expect(typeof native.openAgentSession).toBe("function"); expect(typeof native.resumeAgentSession).toBe("function");
    expect(native.snapshotNativeImages([image()])[0]!.data).toBe(PNG.toString("base64"));
  });
  test("the real CLI parser accepts ordered repeated --image paths", () => {
    const program = new Command(); registerAgentCommands(program, { log: () => {}, error: () => {}, fail: () => {} });
    const run = program.commands.find(command => command.name() === "agent-loop")!.commands.find(command => command.name() === "run")!;
    const parsed = run.parseOptions(["--provider", "anthropic", "--image", "first.png", "--image", "second.webp"]);
    expect(parsed.unknown).toEqual([]); expect(run.opts().image).toEqual(["first.png", "second.webp"]);
  });
  test("local file input is a snapshot and rejects URL/symlink/directory/oversize/wrong MIME", () => {
    const path = workspace(), file = join(path, "pixel.png"); writeFileSync(file, PNG);
    const captured = loadNativeImageFiles([file]); writeFileSync(file, "changed after admission");
    expect(captured[0]!.bytes).toEqual(PNG);
    expect(() => loadNativeImageFiles(["https://example.invalid/pixel.png"])).toThrow(/local/);
    expect(() => loadNativeImageFiles([path])).toThrow();
    const symlink = join(path, "linked.png"); symlinkSync(file, symlink); expect(() => loadNativeImageFiles([symlink])).toThrow();
    const big = join(path, "big.png"); writeFileSync(big, Buffer.alloc(MAX_NATIVE_IMAGE_BYTES + 1)); expect(() => loadNativeImageFiles([big])).toThrow(/limit/);
    const wrong = join(path, "wrong.jpg"); writeFileSync(wrong, PNG); expect(() => loadNativeImageFiles([wrong])).toThrow(/disagree/);
  });
  test("the inbox commits image bytes before wakeup and a new inbox reconstructs without the sender Buffer", () => {
    const h = writer(), inbox = new LoopInbox(h.session, () => {}), input = image();
    const receipt = inbox.insert("next-turn", "Look", "followup", { wake: false, demotedFrom: null, images: [input] });
    input.bytes.fill(0);
    expect(foldSurfaceEntries(h.session.readEvents()).some(entry => entry.part.kind === "image")).toBe(false);
    const persisted = h.session.readEvents().find(row => row.id === receipt.eventId)!;
    expect(JSON.parse(persisted.meta_json)).toMatchObject({ payloadFormat: NATIVE_IMAGE_INPUT_FORMAT });
    expect(persisted.meta_json).not.toContain(PNG.toString("base64"));
    const payload = readEventPayload(h.path, persisted); expect(payload.status).toBe("ok");
    if (payload.status !== "ok") throw new Error("Missing fixture input");
    expect(decodeNativeImageInput(payload.bytes).images[0]!.data).toBe(PNG.toString("base64"));
    const replayed = new LoopInbox(h.session, () => {});
    h.session.startTurn({ trigger: "user" }); h.session.startStep();
    const [message] = replayed.claim("next-turn"); h.session.recordUserMessage(message!.text); recordNativeImageMessage(h.session, message!);
    const attachment = h.session.readEvents().find(row => row.event_type === "user/attachment")!;
    expect(JSON.parse(attachment.meta_json)).toMatchObject({ sourceInputEventId: receipt.eventId, sourceInputIndex: 0, mimeType: "image/png", bytes: PNG.length });
    expect(readEventPayload(h.path, attachment)).toEqual({ status: "ok", bytes: PNG });
  });
  test("an altered claimed image cannot be substituted for the signed queued input", () => {
    const h = writer(), inbox = new LoopInbox(h.session, () => {});
    inbox.insert("next-turn", "Look", "followup", { wake: false, demotedFrom: null, images: [image()] });
    h.session.startTurn({ trigger: "user" }); h.session.startStep();
    const [message] = inbox.claim("next-turn");
    expect(() => recordNativeImageMessage(h.session, { ...message!, images: [{ ...message!.images![0]!, mediaType: "image/jpeg" }] })).toThrow(/changed/);
    expect(h.session.readEvents().some(row => row.event_type === "user/attachment")).toBe(false);
  });
  test("a real pre-step veto burns the queued image without projecting it or calling the model", async () => {
    const h = writer(); let dispatched = 0;
    const driver = new AgentDriver({ session: h.session, route, systemPromptEventId: h.system.eventId,
      llm: { prepare: () => { dispatched++; throw new Error("A veto must not dispatch"); } },
      hooks: { preStep: async () => ({ kind: "reject", by: "image-fixture-policy" }), turnStopping: async () => {}, notify: () => {} } });
    const receipt = driver.followup("Do not bypass policy", [image()]); await driver.whenIdle();
    expect(dispatched).toBe(0); expect(h.session.readEvents().some(row => row.event_type === "user/attachment")).toBe(false);
    const veto = h.session.readEvents().find(row => row.event_type === "loop/veto")!;
    expect(JSON.parse(veto.meta_json)).toMatchObject({ claimedMessageIds: [receipt.messageId], by: "image-fixture-policy" });
  });
  test("cancelling an unwoken image leaves no model-visible attachment and keeps its signed cancelled input", () => {
    const h = writer(), inbox = new LoopInbox(h.session, () => {});
    inbox.insert("next-turn", "cancel me", "followup", { wake: false, demotedFrom: null, images: [image()] }); inbox.clear();
    expect(new LoopInbox(h.session, () => {}).hasPending).toBe(false);
    expect(h.session.readEvents().some(row => row.event_type === "user/attachment")).toBe(false);
    expect(h.session.readEvents().some(row => row.event_type === "loop/inbox" && JSON.parse(row.meta_json).outcome === "cancelled")).toBe(true);
  });
  test("public composed native input reaches actual adapter HTTP and cold default reconstruction after composition closes its writer", async () => {
    const path = workspace(), file = join(path, "pixel.png"); writeFileSync(file, PNG);
    const upstream = stubUpstream([() => okStream(anthropicTextStream({ text: ["Fixture description"], inputTokens: 10, outputTokens: 3 }))]);
    const outcome = await runComposedTurn({ workspace: path, agentId: "default", systemPrompt: "Fixture prompt", prompt: "Describe",
      images: loadNativeImageFiles([file]), route, routes: [{ providerId: "fixture", adapter: anthropicAdapter,
        baseUrl: "https://image.invalid", credentialRef: null, models: ["fixture-model"] }], transport: upstream.transport,
      credentials: { homeDir: join(path, "no-credentials"), projectDir: null, includeDotenv: false, watch: false } });
    expect(upstream.sent).toHaveLength(1); expect(upstream.sent[0]!.body.toString("utf8")).toContain(PNG.toString("base64"));
    rmSync(file); // The original path is not a reconstruction input.
    const reader = openSessionEventStore(path, undefined, { readOnly: true });
    try {
      const events = reader.readSessionEvents(outcome.sessionId);
      expect(events.some(row => row.event_type === "session/close")).toBe(true);
      expect(events.some(row => row.event_type === "user/attachment")).toBe(true);
    } finally { reader.close(); }
    const result = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./fixtures/nativeSignedImageCold.ts", import.meta.url)), path, outcome.sessionId],
      { encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024 , env: { ...process.env, AMC_VAULT_PASSPHRASE: process.env.AMC_VAULT_PASSPHRASE || "amc-test-passphrase" } });
    expect(result.error).toBeUndefined(); expect(result.status, result.stderr).toBe(0);
    const rows = JSON.parse(result.stdout); expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "reconstructed", bytes: upstream.sent[0]!.body.toString("base64") });
  });
});
