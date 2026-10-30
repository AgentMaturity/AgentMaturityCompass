import { rmSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentDriver } from "../src/agent/agentDriver.js";
import { NO_HOOKS } from "../src/agent/loopTypes.js";
import { composeNativePrompt, type NativePrompt } from "../src/agent/nativeAgentComposition.js";
import { createRedactingSession } from "../src/dataflow/redactingSession.js";
import { agentPromptProfile } from "../src/prompt/agentPromptProfile.js";
import { compositionSource, createCompositionProvenance } from "../src/prompt/context/compositionProvenance.js";
import { createSessionTouchedPaths } from "../src/prompt/context/nativeCompositionContext.js";
import { loadInstructionFiles } from "../src/prompt/context/instructionFiles.js";
import { createContextPreStep } from "../src/prompt/context/contextPreStep.js";
import { ContextPluginHost } from "../src/prompt/context/contextHost.js";
import { PromptAssemblyRegistry } from "../src/prompt/assembly/promptRegistry.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { sha256Hex } from "../src/utils/hash.js";
import { LOOP_MODEL, LOOP_PROVIDER, loopHarness, ok, StubToolSeam, textStep, toolStep, toolStepMulti, type LoopHarness } from "./helpers/agentLoopHarness.js";

const runs: { harness: LoopHarness; prompt?: NativePrompt }[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const { harness, prompt } of runs.splice(0)) {
    prompt?.dispose();
    try { harness.finish(); } finally { rmSync(harness.dir, { recursive: true, force: true }); }
  }
});

describe("authenticated touched-call pairing", () => {
  it.each(["fs.read", "echo"])("does not pair a denied directory with a successful %s sharing its call ID", async firstTool => {
    const tools = new StubToolSeam({
      "fs.read": async request => JSON.parse(request.rawArguments).path === "denied/private.ts"
        ? ok("Policy refused the read", { outcome: "DENIED", denied: true }) : ok("Read permitted"),
      echo: async () => ok("Echo permitted")
    });
    const harness = loopHarness({ scripts: [toolStepMulti([
      { id: "duplicate", name: firstTool, args: '{"path":"allowed/file.ts"}' },
      { id: "duplicate", name: "fs.read", args: '{"path":"denied/private.ts"}' }
    ]), textStep("done")], tools });
    runs.push({ harness });
    harness.driver.followup("Read only the permitted file");
    await harness.driver.whenIdle();
    expect(harness.events().filter(row => row.event_type === "tool/result").map(row => JSON.parse(row.meta_json).outcome))
      .toEqual(["OK", "DENIED"]);
    expect(createSessionTouchedPaths()(harness.session)).toEqual([]);
  });

  it("reports overlong authenticated touch paths through the loader's explicit discovery limit", async () => {
    const path = `${"./".repeat(2_050)}nested/file.ts`;
    expect(path.length).toBeGreaterThan(4_096);
    const harness = loopHarness({ scripts: [toolStep("long-path", "fs.read", JSON.stringify({ path })), textStep("done")],
      tools: new StubToolSeam({ "fs.read": async () => ok("Read permitted") }) });
    runs.push({ harness });
    harness.driver.followup("Read the normalized nested path");
    await harness.driver.whenIdle();
    const touchedPaths = createSessionTouchedPaths()(harness.session);
    const load = loadInstructionFiles({ workspace: harness.dir, workspaceOnly: true, touchedPaths });
    expect(load.omitted).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "discovery-limit" })]));
  });
});

function contextBoundary(turn: number, signal: AbortSignal) {
  return { turn, step: 1, target: "next-turn" as const, signal,
    messages: [{ messageId: `message-${turn}`, text: "hello", origin: "followup" as const }] };
}

describe("overlapping inherited context collection", () => {
  it("settles an aborted boundary while another session's collector remains blocked", async () => {
    let releaseFirst!: () => void, enterFirst!: () => void;
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
    const firstEntered = new Promise<void>(resolve => { enterFirst = resolve; });
    const host = new ContextPluginHost([{ name: "fixture:shared-host", order: 100, collect: async input => {
      if (input.turn === 1) { enterFirst(); await firstGate; return "FIRST SESSION"; }
      return await new Promise<string>((_resolve, reject) => {
        input.signal!.addEventListener("abort", () => reject(input.signal!.reason), { once: true });
      });
    } }]);
    const seam = createContextPreStep({ host, registry: new PromptAssemblyRegistry() });
    const firstInput = contextBoundary(1, new AbortController().signal);
    const first = seam.preStep(firstInput, async () => ({ kind: "enter", messages: firstInput.messages }));
    await firstEntered;
    const controller = new AbortController(), secondInput = contextBoundary(2, controller.signal);
    const second = seam.preStep(secondInput, async () => ({ kind: "enter", messages: secondInput.messages }));
    const settled = second.then(() => "fulfilled", () => "rejected");
    await Promise.resolve();
    controller.abort(new Error("Second session cancelled"));
    try {
      const result = await Promise.race([settled, new Promise<string>(resolve => { setTimeout(() => resolve("still-waiting"), 50); })]);
      expect(result).toBe("rejected");
    } finally { releaseFirst(); await Promise.allSettled([first, second]); seam.dispose(); }
  });

  it("keeps each overlapping boundary's own output when refreshes settle together", async () => {
    let releaseFirst!: () => void, enterFirst!: () => void;
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
    const firstEntered = new Promise<void>(resolve => { enterFirst = resolve; });
    const host = new ContextPluginHost([{ name: "fixture:shared-host", order: 100, collect: async input => {
      if (input.turn === 1) { enterFirst(); await firstGate; }
      return input.turn === 1 ? "FIRST SESSION" : "SECOND SESSION";
    } }]);
    const seam = createContextPreStep({ host, registry: new PromptAssemblyRegistry() });
    const firstInput = contextBoundary(1, new AbortController().signal);
    const first = seam.preStep(firstInput, async () => ({ kind: "enter", messages: firstInput.messages }));
    await firstEntered;
    releaseFirst();
    const secondInput = contextBoundary(2, new AbortController().signal);
    const second = seam.preStep(secondInput, async () => ({ kind: "enter", messages: secondInput.messages }));
    try {
      const [left, right] = await Promise.all([first, second]);
      expect(left.kind).toBe("enter"); expect(right.kind).toBe("enter");
      if (left.kind !== "enter" || right.kind !== "enter") throw new Error("Unexpected context rejection");
      expect(left.messages.at(-1)!.text).toContain("FIRST SESSION");
      expect(left.messages.at(-1)!.text).not.toContain("SECOND SESSION");
      expect(right.messages.at(-1)!.text).toContain("SECOND SESSION");
      expect(right.messages.at(-1)!.text).not.toContain("FIRST SESSION");
    } finally { seam.dispose(); }
  });
});

const SECRET = "person@example.invalid";
const TOKEN = "TOK_EMAIL_REDACTED_FIXTURE";
const SOURCE_CONTEXT = `Protected contact: ${SECRET}`;

function redactedContextRun() {
  const harness = loopHarness({ scripts: [textStep("done")] });
  const session = createRedactingSession(harness.session, {
    redact: text => ({ text: text.replaceAll(SECRET, TOKEN), findings: [], declaredFields: [] })
  });
  const profile = agentPromptProfile({ workspace: harness.dir, agentId: "default", contextPlugins: [
    { name: "fixture:protected-context", order: 100, collect: async () => SOURCE_CONTEXT }
  ] });
  const prompt = composeNativePrompt(profile, { session, sessionId: harness.sessionId });
  runs.push({ harness, prompt });
  const driver = new AgentDriver({ session, llm: harness.llm, tools: harness.tools,
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
    systemPromptEventId: harness.systemPromptEventId, hooks: { ...NO_HOOKS, preStep: prompt.preStep } });
  return { harness, driver };
}

describe("context source and delivered-byte commitments", () => {
  it("links delivered-context provenance to the actual tokenized signed user row", async () => {
    const { harness, driver } = redactedContextRun();
    driver.followup("hello");
    await driver.whenIdle();
    const rows = harness.events();
    const delivered = rows.find(row => {
      if (row.event_type !== "user/message") return false;
      const payload = readEventPayload(harness.dir, row);
      return payload.status === "ok" && payload.bytes.toString("utf8").includes(TOKEN);
    });
    expect(delivered).toBeDefined();
    const payload = readEventPayload(harness.dir, delivered!);
    expect(payload.status).toBe("ok");
    if (payload.status !== "ok") throw new Error("Committed context payload unavailable");
    expect(payload.bytes.toString("utf8")).not.toContain(SECRET);
    expect(delivered!.payload_sha256).toBe(sha256Hex(payload.bytes));
    const audit = rows.find(row => {
      const meta = JSON.parse(row.meta_json);
      return meta.auditType === "NATIVE_COMPOSITION_PROVENANCE" && meta.phase === "context-delivery";
    });
    expect(audit).toBeDefined();
    const meta = JSON.parse(audit!.meta_json);
    expect(meta).toMatchObject({ phase: "context-delivery", contextEventId: delivered!.id,
      payloadSha256: delivered!.payload_sha256, digestEncoding: "payload-bytes-sha256", turn: 1, step: 1,
      sources: [{ kind: "context", id: "delivered-runtime-context", digest: delivered!.payload_sha256 }] });
    expect(meta.digest).toBe(createCompositionProvenance(meta.sources).digest);
    const sourceAudit = rows.find(row => JSON.parse(row.meta_json).phase === "context");
    expect(JSON.parse(sourceAudit!.meta_json)).toMatchObject({ sourceStage: "pre-redaction", sources: expect.arrayContaining([
      compositionSource("context", "fixture:protected-context", SOURCE_CONTEXT),
      compositionSource("prompt", "runtime-context-source", payload.bytes.toString("utf8").replaceAll(TOKEN, SECRET))
    ]) });
    expect(rows.indexOf(audit!)).toBeGreaterThan(rows.indexOf(delivered!));
    expect(rows.indexOf(audit!)).toBeLessThan(rows.findIndex(row => row.event_type === "request/header"));
    expect(audit!.writer_sig).not.toBe("unsigned");
  });

  it("stops before dispatch when delivered-context provenance cannot be committed", async () => {
    const { harness, driver } = redactedContextRun();
    const record = harness.session.recordProjectedEvidence.bind(harness.session);
    vi.spyOn(harness.session, "recordProjectedEvidence").mockImplementation(row => {
      if (row.meta.auditType === "NATIVE_COMPOSITION_PROVENANCE" && row.meta.phase === "context-delivery") {
        throw new Error("Delivered context provenance storage unavailable");
      }
      return record(row);
    });
    driver.followup("hello");
    await driver.whenIdle();
    const rows = harness.events();
    expect(rows.some(row => {
      if (row.event_type !== "user/message") return false;
      const payload = readEventPayload(harness.dir, row);
      return payload.status === "ok" && payload.bytes.toString("utf8").includes(TOKEN);
    })).toBe(true);
    expect(rows.some(row => row.event_type === "request/header")).toBe(false);
    expect(rows.some(row => row.event_type === "turn/end" && JSON.parse(row.meta_json).reason === "error")).toBe(true);
  });
});
