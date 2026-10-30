import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compositionSource, createCompositionProvenance, presetCompositionSources, type CompositionSource } from "../src/prompt/context/compositionProvenance.js";
import { composeNativeAgent, composeNativePrompt, type NativeAgent } from "../dist/agent/nativeAgentComposition.js";
import { NO_HOOKS } from "../dist/agent/loopTypes.js";
import { EMPTY_TOOL_SEAM } from "../dist/agent/toolSeam.js";
import { verifyAgentRun } from "../dist/agent/runReport.js";
import { STUB_PROVIDER_ID, STUB_PROVIDER_MODEL, stubProviderRoute, stubProviderTransport } from "../dist/agent/stubProvider.js";
import { AdapterRegistry } from "../dist/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../dist/llm/adapter/llmRuntime.js";
import { agentPromptProfile } from "../dist/prompt/agentPromptProfile.js";
import { PERSONA_SECTION } from "../dist/prompt/assembly/promptTypes.js";
import { renderPrompt } from "../dist/prompt/assembly/interpolate.js";
import { readEventPayload } from "../dist/session/eventPayload.js";
import { readNativeSessionEvents } from "../dist/session/readNativeSessionEvents.js";
import { SessionService } from "../dist/session/sessionService.js";
import { extractEnvelope } from "../dist/session/sessionTypes.js";
import { initWorkspace } from "../dist/workspace.js";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { resolvePreset, savePresets } from "../src/presets/agentPresets.js";

describe("composition digest sources", () => {
  it("canonicalizes source objects while preserving source and nested array order", () => {
    const left = compositionSource("tool", "read", { parameters: { required: ["path", "offset"], type: "object" }, description: "Read" });
    const right = compositionSource("tool", "read", { description: "Read", parameters: { type: "object", required: ["path", "offset"] } });
    expect(left).toEqual(right);
    const policy = compositionSource("policy", "declared-policy", "legacy-declared-digest");
    expect(createCompositionProvenance([left, policy])).toEqual(createCompositionProvenance([right, policy]));
    expect(createCompositionProvenance([left, policy]).digest).not.toBe(createCompositionProvenance([policy, left]).digest);
    expect(left.digest).not.toBe(compositionSource("tool", "read", { description: "Read", parameters: { type: "object", required: ["offset", "path"] } }).digest);
  });

  it.each(["prompt", "tool", "policy", "context", "route", "preset", "override"] as const)("binds changed %s content and source identity", kind => {
    const source = compositionSource(kind, "selected", { value: "before" });
    const original = createCompositionProvenance([source]);
    expect(original.digest).not.toBe(createCompositionProvenance([compositionSource(kind, "selected", { value: "after" })]).digest);
    expect(original.digest).not.toBe(createCompositionProvenance([{ ...source, id: "other" }]).digest);
    expect(original.digest).not.toBe(createCompositionProvenance([{ ...source, kind: kind === "tool" ? "prompt" : "tool" }]).digest);
  });

  it("retains digests and source names without source content or extra fields", () => {
    const secret = "synthetic-secret-never-persist-this-value";
    const source = compositionSource("route", "native-route", { providerId: "stub", params: { authorization: secret } });
    const input = [{ ...source, content: secret }];
    const result = createCompositionProvenance(input);
    input[0].digest = "0".repeat(64);
    expect(result.sources).toEqual([source]);
    expect(Object.keys(result.sources[0]!)).toEqual(["kind", "id", "digest"]);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.sources)).toBe(true);
    expect(Object.isFrozen(result.sources[0])).toBe(true);
  });

  it("refuses invalid source identities and digest claims", () => {
    const source = compositionSource("prompt", "persona", "instructions");
    for (const invalid of [{ ...source, kind: "unknown" }, { ...source, id: "" }, { ...source, digest: "not-a-digest" }, { ...source, digest: "A".repeat(64) }]) {
      expect(() => createCompositionProvenance([invalid as CompositionSource])).toThrow();
    }
    expect(() => compositionSource("prompt", "", "instructions")).toThrow();
    expect(() => compositionSource("prompt", "persona", undefined)).toThrow();
  });

  it("binds the selected preset and each overridden field without retaining raw values", () => {
    const preset = { id: "reviewer", model: "signed-model", persona: "SYNTHETIC PRIVATE PRESET PERSONA" };
    const overrides = [{ field: "persona", presetValue: preset.persona, effectiveValue: "SYNTHETIC PRIVATE OVERRIDE" },
      { field: "tools", presetValue: undefined, effectiveValue: "none" }];
    const sources = presetCompositionSources(preset, overrides);
    expect(sources).toEqual([compositionSource("preset", preset.id, preset),
      compositionSource("override", "reviewer:persona", { presetValue: preset.persona, effectiveValue: overrides[0]!.effectiveValue }),
      compositionSource("override", "reviewer:tools", { presetValue: null, effectiveValue: "none" })]);
    expect(presetCompositionSources(preset, [])).toEqual([sources[0]]);
    expect(JSON.stringify(sources)).not.toContain("SYNTHETIC PRIVATE");
    expect(Object.isFrozen(sources)).toBe(true);
    const before = createCompositionProvenance(sources).digest;
    expect(createCompositionProvenance(presetCompositionSources({ ...preset, model: "another-signed-model" }, overrides)).digest).not.toBe(before);
    expect(createCompositionProvenance(presetCompositionSources(preset, [{ ...overrides[0]!, effectiveValue: "another-override" }, overrides[1]!])).digest).not.toBe(before);
  });
});

const fixtures: { dir: string; session: SessionService; composed?: NativeAgent }[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const fixture of fixtures.splice(0)) {
    fixture.composed?.dispose();
    try { fixture.session.close({ reason: "completed" }); } catch { fixture.session.disposeWithoutClosing(); }
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

const schema = { name: "fixture_echo", description: "Echo fixture input", parameters: { type: "object", properties: { text: { type: "string" } } } };
const route = { providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL, params: { max_tokens: 64 } };
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "amc-composition-provenance-"));
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  const session = new SessionService(dir);
  const entry: (typeof fixtures)[number] = { dir, session };
  fixtures.push(entry);
  const registry = new AdapterRegistry();
  registry.register(stubProviderRoute());
  const profile = agentPromptProfile({ workspace: dir, agentId: "default", persona: "You serve {{agent_id}}.",
    contextPlugins: [{ name: "fixture-context", order: 10, collect: async () => "Keep {{agent_id}} literal in runtime data." }] });
  const init = { session, open: { agentId: "default", harnessVersion: "test", compositionDigest: "declared-composition-fixture", policyDigest: "declared-policy-fixture" },
    prompt: { profile }, route, tools: () => ({ ...EMPTY_TOOL_SEAM, schemas: () => [schema] }),
    makeLlm: (boundSession: SessionService) => new LlmRuntime({ session: boundSession, registry, transport: stubProviderTransport(), credentials: {
      resolve: () => null, describe: () => ({ configured: false, source: null, writable: false }),
      set: async () => { throw new Error("fixture never writes credentials"); }, unset: async () => false
    } }) };
  const compose = () => { entry.composed = composeNativeAgent(init); return entry.composed; };
  return { ...entry, init, compose };
}

function provenanceRows(session: SessionService) {
  return session.readEvents().filter(row => JSON.parse(row.meta_json).auditType === "NATIVE_COMPOSITION_PROVENANCE");
}

describe("native composition records signed provenance", () => {
  it("records rendered prompt sections, offered schemas, route and declared policy in the session spine", async () => {
    const f = fixture();
    f.compose();
    const row = provenanceRows(f.session).find(event => JSON.parse(event.meta_json).phase === "compose");
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.meta_json);
    expect(meta).toMatchObject({ version: 1, phase: "compose", sources: expect.arrayContaining([
      compositionSource("prompt", PERSONA_SECTION, "You serve default."),
      compositionSource("tool", schema.name, schema),
      compositionSource("route", "native-route", route),
      compositionSource("policy", "declared-policy", f.init.open.policyDigest),
      compositionSource("policy", "declared-composition", f.init.open.compositionDigest)
    ]) });
    expect(meta.digest).toBe(createCompositionProvenance(meta.sources).digest);
    expect(row!.writer_sig).not.toBe("unsigned");
    expect(extractEnvelope(row!.meta_json)).toMatchObject({ sessionId: f.session.sessionId, surface: { op: "none" } });
    expect(readEventPayload(f.dir, row!)).toMatchObject({ status: "ok", bytes: Buffer.from("") });
    expect(row!.meta_json).not.toContain("You serve default.");
    expect(row!.meta_json).not.toContain(f.init.open.policyDigest);
    const events = f.session.readEvents();
    expect(events.findIndex(event => event.id === row!.id)).toBeGreaterThan(events.findIndex(event => event.event_type === "system/prompt"));
    const sessionId = f.session.sessionId;
    f.session.close({ reason: "completed" });
    const verified = await verifyAgentRun(f.dir, sessionId);
    expect(verified.ok, JSON.stringify(verified)).toBe(true);
  });

  it("records an unavailable catalog without blocking composition and still refuses before a model request", async () => {
    const f = fixture();
    f.init.tools = () => ({ ...EMPTY_TOOL_SEAM, schemas: () => { throw new Error("catalognotadmitted"); } });
    let composed: NativeAgent | undefined;
    expect(() => { composed = f.compose(); }).not.toThrow();
    const row = provenanceRows(f.session).find(event => JSON.parse(event.meta_json).phase === "compose");
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.meta_json);
    expect(meta.sources.filter((source: CompositionSource) => source.kind === "tool")).toEqual([
      compositionSource("tool", "offered-tools:not-evaluated", { status: "not-evaluated" })
    ]);
    expect(meta.digest).toBe(createCompositionProvenance(meta.sources).digest);
    expect(row!.writer_sig).not.toBe("unsigned");
    expect(row!.meta_json).not.toContain("catalognotadmitted");
    composed!.driver.followup("hello");
    await composed!.driver.whenIdle();
    const events = f.session.readEvents();
    expect(events.some(event => event.event_type === "request/header")).toBe(false);
    expect(events.some(event => event.event_type === "turn/end" && JSON.parse(event.meta_json).reason === "error")).toBe(true);
  });

  it("binds each delivered runtime context to its actual literal text and boundary", async () => {
    const f = fixture();
    const composed = f.compose();
    composed.driver.followup("hello");
    await composed.driver.whenIdle();
    const rows = provenanceRows(f.session).filter(event => JSON.parse(event.meta_json).phase === "context");
    expect(rows.length).toBeGreaterThan(0);
    const meta = JSON.parse(rows[0]!.meta_json);
    expect(meta).toMatchObject({ phase: "context", turn: 1, step: 1, sources: expect.arrayContaining([
      compositionSource("context", "fixture-context", "Keep {{agent_id}} literal in runtime data.")
    ]) });
    expect(meta.digest).toBe(createCompositionProvenance(meta.sources).digest);
    const events = f.session.readEvents();
    const firstRequest = events.findIndex(event => event.event_type === "request/header");
    expect(firstRequest).toBeGreaterThan(events.findIndex(event => event.id === rows[0]!.id));
    expect(extractEnvelope(rows[0]!.meta_json)?.surface).toEqual({ op: "none" });
    expect(rows[0]!.writer_sig).not.toBe("unsigned");
  });

  it("refuses composition when its signed provenance cannot be recorded", () => {
    const f = fixture();
    const record = f.session.recordProjectedEvidence.bind(f.session);
    vi.spyOn(f.session, "recordProjectedEvidence").mockImplementation(row => {
      if (row.meta.auditType === "NATIVE_COMPOSITION_PROVENANCE") throw new Error("provenance storage unavailable");
      return record(row);
    });
    expect(f.compose).toThrow("provenance storage unavailable");
    const events = readNativeSessionEvents(f.dir, f.session.sessionId);
    expect(events.some(row => row.event_type === "request/header")).toBe(false);
    const close = events.find(row => row.event_type === "session/close");
    expect(JSON.parse(close!.meta_json).reason).toBe("composition_failed");
  });

  it("stops before a model request when runtime-context provenance cannot be recorded", async () => {
    const f = fixture();
    const composed = f.compose();
    const record = f.session.recordProjectedEvidence.bind(f.session);
    vi.spyOn(f.session, "recordProjectedEvidence").mockImplementation(row => {
      if (row.meta.auditType === "NATIVE_COMPOSITION_PROVENANCE" && row.meta.phase === "context") throw new Error("context provenance storage unavailable");
      return record(row);
    });
    composed.driver.followup("hello");
    await composed.driver.whenIdle();
    const events = f.session.readEvents();
    expect(events.some(row => row.event_type === "request/header")).toBe(false);
    expect(events.some(row => row.event_type === "user/message")).toBe(false);
    const ending = events.find(row => row.event_type === "turn/end");
    expect(JSON.parse(ending!.meta_json).reason).toBe("error");
  });

  it("inherited pre-step hooks record only the child's context and discover the child's committed touches", async () => {
    const f = fixture();
    mkdirSync(join(f.dir, "nested"));
    const rule = "CHILD DIRECTORY RULE: retain {{literal}} exactly.";
    writeFileSync(join(f.dir, "nested/AGENTS.md"), rule);
    writeFileSync(join(f.dir, "nested/file.txt"), "fixture bytes");
    const collectedSessionIds: (string | undefined)[] = [];
    const profile = agentPromptProfile({ workspace: f.dir, agentId: "default", amcHome: join(f.dir, "empty-home"), now: () => 0,
      extraContextPlugins: [{ name: "fixture:writer", order: 950, collect: async input => {
        collectedSessionIds.push(input.sessionId);
        return "Writer identity is bound to the current native driver.";
      } }] });
    f.session.open(f.init.open);
    const inherited = composeNativePrompt(profile, { session: f.session });
    const systemPrompt = renderPrompt(inherited.registry.assemble({ sessionId: f.session.sessionId }));
    f.session.recordSystemPrompt(systemPrompt);
    const parentEventIds = f.session.readEvents().map(event => event.id);
    const childSession = new SessionService(f.dir);
    let child: NativeAgent | undefined;
    try {
      child = composeNativeAgent({ ...f.init, session: childSession,
        prompt: { text: systemPrompt, hooks: { ...NO_HOOKS, preStep: inherited.preStep } },
        tools: () => ({ ...EMPTY_TOOL_SEAM,
          schemas: () => [{ name: "fs.read", description: "Read fixture file", parameters: { type: "object", properties: { path: { type: "string" } } } }],
          execute: async () => ({ outcome: "OK", content: "fixture bytes", exitCode: null, timedOut: false, denied: false }) }) });
      child.driver.followup(JSON.stringify({ tool: "fs.read", arguments: { path: "nested/file.txt" } }));
      await child.driver.whenIdle();
      const events = childSession.readEvents();
      const audits = provenanceRows(childSession).filter(event => JSON.parse(event.meta_json).phase === "context");
      expect(audits.length).toBeGreaterThanOrEqual(2);
      for (const audit of audits) expect(extractEnvelope(audit.meta_json)?.sessionId).toBe(childSession.sessionId);
      expect(collectedSessionIds.length).toBeGreaterThanOrEqual(2);
      expect(new Set(collectedSessionIds)).toEqual(new Set([childSession.sessionId]));
      expect(f.session.readEvents().map(event => event.id)).toEqual(parentEventIds);
      const contexts = events.filter(event => event.event_type === "user/message").map(event => {
        const payload = readEventPayload(f.dir, event);
        return { id: event.id, text: payload.status === "ok" ? payload.bytes.toString("utf8") : "" };
      });
      const included = contexts.find(context => context.text.includes(rule));
      expect(included).toBeDefined();
      const callIndex = events.findIndex(event => event.event_type === "tool/call");
      expect(callIndex).toBeGreaterThanOrEqual(0);
      expect(events.findIndex(event => event.id === included!.id)).toBeGreaterThan(callIndex);
      const requests = events.filter(event => event.event_type === "request/header");
      expect(events.findIndex(event => event.id === included!.id)).toBeLessThan(events.findIndex(event => event.id === requests[1]!.id));
    } finally {
      child?.dispose();
      inherited.dispose();
      try { childSession.close({ reason: "completed" }); } catch { childSession.disposeWithoutClosing(); }
    }
  });
});

describe("signed preset composition provenance through the CLI", () => {
  it("records the selected signed preset and explicit flags after parsing effective values", async () => {
    const f = fixture();
    const preset = { id: "reviewer", description: "Signed reviewer", providerId: "anthropic", model: "signed-model",
      tools: "echo", persona: "SYNTHETIC SIGNED PERSONA", maxTokens: 128, maxSteps: 8, approveTools: "READ_ONLY",
      delegate: { enabled: true, scope: ["READ_ONLY"], maxDepth: 2 } };
    savePresets(f.dir, [preset]);
    const selected = resolvePreset(f.dir, preset.id);
    expect(selected.ok).toBe(true);
    if (!selected.ok) return;
    vi.spyOn(process, "cwd").mockReturnValue(f.dir);
    const output: string[] = [];
    const fail = vi.fn();
    const program = new Command().exitOverride().configureOutput({ writeErr: () => {} });
    registerAgentCommands(program, { log: line => output.push(line), error: () => {}, fail });
    await program.parseAsync(["agent-loop", "run", "hello", "--preset", preset.id, "--provider", STUB_PROVIDER_ID,
      "--model", STUB_PROVIDER_MODEL, "--tools", "none", "--persona", "SYNTHETIC OVERRIDE PERSONA",
      "--max-tokens", "64", "--max-steps", "1", "--approve-tools", "WRITE_LOW", "--no-delegate",
      "--credentials-home", join(f.dir, "empty-home"), "--json"], { from: "user" });
    expect(fail).not.toHaveBeenCalled();
    const summary = JSON.parse(output.at(-1)!);
    const row = readNativeSessionEvents(f.dir, summary.sessionId).find(event => {
      const meta = JSON.parse(event.meta_json);
      return meta.auditType === "NATIVE_COMPOSITION_PROVENANCE" && meta.phase === "compose";
    });
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.meta_json);
    const overrides = [
      { field: "providerId", presetValue: preset.providerId, effectiveValue: STUB_PROVIDER_ID },
      { field: "model", presetValue: preset.model, effectiveValue: STUB_PROVIDER_MODEL },
      { field: "persona", presetValue: preset.persona, effectiveValue: "SYNTHETIC OVERRIDE PERSONA" },
      { field: "maxTokens", presetValue: preset.maxTokens, effectiveValue: 64 },
      { field: "maxSteps", presetValue: preset.maxSteps, effectiveValue: 1 },
      { field: "tools", presetValue: preset.tools, effectiveValue: "none" },
      { field: "approveTools", presetValue: preset.approveTools, effectiveValue: "WRITE_LOW" },
      { field: "delegate.enabled", presetValue: true, effectiveValue: false }
    ];
    expect(meta.sources).toEqual(expect.arrayContaining([
      compositionSource("preset", preset.id, selected.preset),
      ...overrides.map(({ field, ...values }) => compositionSource("override", `${preset.id}:${field}`, values))
    ]));
    expect(meta.sources.filter((source: CompositionSource) => source.kind === "override")).toHaveLength(overrides.length);
    expect(row!.meta_json).not.toContain(preset.persona);
    expect(row!.meta_json).not.toContain("SYNTHETIC OVERRIDE PERSONA");
  });

  it("records inherited preset fields without labelling defaults as explicit overrides", async () => {
    const f = fixture();
    const preset = { id: "local-reviewer", description: "Signed local reviewer", providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL,
      tools: "none", maxTokens: 64, maxSteps: 1 };
    savePresets(f.dir, [preset]);
    vi.spyOn(process, "cwd").mockReturnValue(f.dir);
    const output: string[] = [];
    const fail = vi.fn();
    const program = new Command().exitOverride().configureOutput({ writeErr: () => {} });
    registerAgentCommands(program, { log: line => output.push(line), error: () => {}, fail });
    await program.parseAsync(["agent-loop", "run", "hello", "--preset", preset.id,
      "--credentials-home", join(f.dir, "empty-home"), "--json"], { from: "user" });
    expect(fail).not.toHaveBeenCalled();
    const summary = JSON.parse(output.at(-1)!);
    const row = readNativeSessionEvents(f.dir, summary.sessionId).find(event => {
      const meta = JSON.parse(event.meta_json);
      return meta.auditType === "NATIVE_COMPOSITION_PROVENANCE" && meta.phase === "compose";
    });
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.meta_json);
    expect(meta.sources).toContainEqual(compositionSource("preset", preset.id, preset));
    expect(meta.sources.filter((source: CompositionSource) => source.kind === "override")).toEqual([]);
  });
});
