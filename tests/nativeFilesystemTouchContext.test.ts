import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toolEvidenceFor, type ToolEvidenceRecord } from "../src/tools/toolEvidence.js";
import type { RecordedToolCall, ToolOutcome } from "../src/tools/toolTypes.js";
import { createSessionTouchedPaths } from "../src/prompt/context/nativeCompositionContext.js";
import { loadInstructionFiles } from "../src/prompt/context/instructionFiles.js";
import { MAX_INSTRUCTION_TOUCH_PATHS } from "../src/prompt/context/touchedInstructions.js";
import { SessionService } from "../src/session/sessionService.js";
import { initWorkspace } from "../src/workspace.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { ToolPipeline, RUN_CODE_TOOL } from "../src/tools/toolPipeline.js";
import { registerCodeTransport } from "../src/codemode/runCodeTool.js";
import { fsTools } from "../src/tools/builtin/fsTools.js";
import { ReadBeforeEditLedger } from "../src/tools/builtin/readBeforeEdit.js";
import { createInstructionsContextPlugin } from "../src/prompt/context/instructionsContext.js";
import { nativeFilesystemTouch } from "../src/prompt/context/nativeFilesystemTouch.js";
import * as pathSafety from "../src/utils/pathSafety.js";
import { sha256Hex } from "../src/utils/hash.js";

const directories: string[] = [];
const sessions: SessionService[] = [];
afterEach(() => {
  for (const session of sessions.splice(0)) {
    try {
      session.endStep({ stopReason: "end_turn", usage: null });
      session.endTurn({ reason: "complete" }); session.sealTurn(); session.close({ reason: "completed" });
    } finally { session.disposeWithoutClosing(); }
  }
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function directory(): string {
  const path = realpathSync(mkdtempSync(join(tmpdir(), "amc-filesystem-touch-")));
  directories.push(path);
  return path;
}

function fixture() {
  const workspace = directory();
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  mkdirSync(join(workspace, "nested"));
  writeFileSync(join(workspace, "nested", "file.ts"), "export {};\n");
  const session = new SessionService(workspace);
  session.open({ agentId: "default", harnessVersion: "test", compositionDigest: "fixture", policyDigest: "fixture" });
  session.startTurn({ trigger: "user" }); session.startStep(); sessions.push(session);
  let sequence = 0;
  const execution = (overrides: Partial<RecordedToolCall> = {}): RecordedToolCall => ({
    token: `filesystem-subcall-${++sequence}`, callId: "shared-model-call", rootCallId: "outer-code-call",
    name: "fs.read", agentId: "default", workspace, actionClass: "READ_ONLY",
    requestedMode: "EXECUTE", effectiveMode: "EXECUTE", parentToken: "run-code-parent-token",
    arguments: { path: "nested/./file.ts", privateContent: "PRIVATE_ARGUMENT_CONTENT" }, ...overrides
  });
  const emit = (call: RecordedToolCall, outcome: ToolOutcome = allowed()) => {
    const rows = toolEvidenceFor(call, outcome);
    const audit = rows.find(row => row.eventType === "audit" && row.meta.auditType === "TOOL_CALL_ALLOWED");
    const references = rows.map(row => session.recordProjectedEvidence(row));
    return { rows, audit, references };
  };
  return { workspace, session, execution, emit };
}

const allowed = (extra: Partial<ToolOutcome> = {}): ToolOutcome => ({
  ok: true, exitCode: 0, timedOut: false, denied: null, output: "", bytes: 0, ...extra
});
const touchOf = (rows: readonly ToolEvidenceRecord[]) => rows.flatMap(row => row.meta.nativeFilesystemTouch === undefined ? [] : [row.meta.nativeFilesystemTouch]);

describe("signed filesystem observations for native and CodeMode calls", () => {
  it("discovers nested instructions after a real CodeMode worker dispatches a governed filesystem read", async () => {
    const f = fixture();
    writeFileSync(join(f.workspace, "nested/AGENTS.md"), "Review this directory's tests before editing.");
    const registry = new ToolRegistry();
    for (const tool of fsTools({ ledger: new ReadBeforeEditLedger() })) registry.define(tool);
    let pipeline!: ToolPipeline;
    registerCodeTransport(registry, { pipeline: () => pipeline,
      // The fixture asserts the existing confinement precondition; this test does not qualify an OS sandbox.
      confined: () => true, limits: { wallMs: 4_000, maxResultBytes: 20_000, maxToolCalls: 10 } });
    pipeline = new ToolPipeline({ registry, workspace: f.workspace, mode: "code", record: (execution, outcome) => {
      for (const row of toolEvidenceFor(execution, outcome)) f.session.recordProjectedEvidence(row);
    } });
    const result = await pipeline.execute({ name: RUN_CODE_TOOL, agentId: "default", requestedMode: "EXECUTE",
      arguments: { source: 'return await tools["fs.read"]({ path: "nested/file.ts" });' } });
    expect(result.ok, result.output).toBe(true);
    const audit = f.session.readEvents().find(row => JSON.parse(row.meta_json).nativeFilesystemTouch?.path === "nested");
    expect(audit).toBeDefined();
    expect(JSON.parse(audit!.meta_json).nativeFilesystemTouch.parentToken).toEqual(expect.any(String));
    const touchedPaths = createSessionTouchedPaths()(f.session);
    const context = await createInstructionsContextPlugin({ workspace: f.workspace, workspaceOnly: true })
      .collect({ turn: 1, step: 2, touchedPaths });
    expect(context).toContain("Review this directory's tests before editing.");
    expect(context).toContain(audit!.id);
  });

  it("attributes a successful nested subcall to its own signed audit without retaining arbitrary arguments", () => {
    const f = fixture(), call = f.execution();
    const { audit } = f.emit(call);
    const observation = { version: 1, path: "nested", directory: true,
      toolToken: call.token, parentToken: call.parentToken };
    expect(audit?.meta.nativeFilesystemTouch).toEqual(observation);
    expect(JSON.parse(audit!.payload).nativeFilesystemTouch).toEqual(observation);
    expect(JSON.stringify(audit)).not.toContain("PRIVATE_ARGUMENT_CONTENT");
    expect(JSON.stringify(audit)).not.toContain("file.ts");
    const signed = f.session.readEvents().find(row => JSON.parse(row.meta_json).nativeFilesystemTouch?.toolToken === call.token)!;
    expect(signed.writer_sig).toBeTruthy();
    expect(signed.writer_sig).not.toBe("unsigned");
    expect(createSessionTouchedPaths()(f.session)).toEqual([expect.objectContaining({ path: "nested", directory: true, eventId: signed.id })]);
  });

  it("covers supported filesystem tools and missing write suffixes with bounded normalized relative paths", () => {
    const f = fixture();
    for (const name of ["fs.read", "fs.write", "fs.edit", "glob", "grep"]) {
      const directory = name === "glob" || name === "grep";
      const path = directory ? "nested" : name === "fs.write" ? "new-directory/new-file.ts" : "nested/file.ts";
      const observedPath = name === "fs.write" ? "new-directory" : "nested";
      const call = f.execution({ name, arguments: { path }, actionClass: name === "fs.write" || name === "fs.edit" ? "WRITE_LOW" : "READ_ONLY" });
      const { audit } = f.emit(call);
      expect(audit?.meta.nativeFilesystemTouch).toEqual({ version: 1, path: observedPath, directory: true,
        toolToken: call.token, parentToken: call.parentToken });
      expect(Buffer.byteLength(observedPath)).toBeLessThanOrEqual(4_096);
    }
    const search = f.execution({ name: "grep", arguments: {} });
    expect(f.emit(search).audit?.meta.nativeFilesystemTouch).toEqual({ version: 1, path: ".", directory: true,
      toolToken: search.token, parentToken: search.parentToken });
  });

  it("keeps distinct subcall tokens even when model call IDs collide and ignores repeated observations", () => {
    const f = fixture();
    const first = f.execution(), second = f.execution({ arguments: { path: "other/new.ts" }, name: "fs.write", actionClass: "WRITE_LOW" });
    f.emit(first); f.emit(first); f.emit(second);
    const touched = createSessionTouchedPaths()(f.session);
    expect(touched.map(touch => touch.path)).toEqual(["nested", "other"]);
    expect(touched.every(touch => touch.directory === true)).toBe(true);
  });

  it("emits no observation for denied, failed, simulated or non-filesystem calls", () => {
    const f = fixture();
    const denied = allowed({ ok: false, denied: { stage: "guard", reason: "not allowed", guardLabel: "fixture-policy" } });
    for (const [call, outcome] of [
      [f.execution(), denied], [f.execution(), allowed({ ok: true, denied: denied.denied })],
      [f.execution(), allowed({ ok: false })],
      [f.execution({ effectiveMode: "SIMULATE" }), allowed()],
      [f.execution({ name: "bash" }), allowed()]
    ] as const) {
      expect(touchOf(toolEvidenceFor(call, outcome))).toEqual([]);
    }
  });

  it("refuses missing or invalid paths, escapes, protected metadata and unsafe symlink targets", () => {
    const f = fixture(), outside = directory();
    symlinkSync(outside, join(f.workspace, "outside-link"), "dir");
    symlinkSync(join(outside, "missing"), join(f.workspace, "dangling-link"));
    const paths: unknown[] = [undefined, null, 42, "", "bad\0path", "../outside.ts", join(outside, "private.ts"),
      ".git/config", ".AmC/private", "outside-link/private.ts", "dangling-link"];
    for (const path of paths) {
      const call = f.execution({ arguments: path === undefined ? {} : { path } });
      expect(touchOf(toolEvidenceFor(call, allowed())), String(path)).toEqual([]);
    }
    expect(touchOf(toolEvidenceFor(f.execution({ name: "fs.write", arguments: { path: `nested/${"x".repeat(4_097)}` } }), allowed()))).toEqual([]);
    // This unit policy check bypasses host pathname limits; it does not qualify OS confinement.
    const longDirectory = `nested/${"界".repeat(1_400)}`;
    expect(longDirectory.length).toBeLessThan(4_096);
    expect(Buffer.byteLength(longDirectory, "utf8")).toBeGreaterThan(4_096);
    const canonical = vi.spyOn(pathSafety, "physicalPathWithMissingSuffix").mockReturnValue(join(f.workspace, longDirectory));
    try {
      expect(nativeFilesystemTouch(f.execution({ name: "glob", arguments: { path: "nested" } }), allowed())).toBeUndefined();
    } finally { canonical.mockRestore(); }
  });

  it("requires the signed payload hash and matching observation metadata before collecting a subcall path", () => {
    const f = fixture(), call = f.execution();
    f.emit(call);
    const rows = f.session.readEvents();
    const audit = rows.find(row => JSON.parse(row.meta_json).nativeFilesystemTouch?.toolToken === call.token);
    expect(audit).toBeDefined();
    const originalMeta = JSON.parse(audit!.meta_json);
    const originalPayload = readEventPayload(f.workspace, audit!);
    if (originalPayload.status !== "ok") throw new Error("Committed observation payload unavailable");
    const originalBody = JSON.parse(originalPayload.bytes.toString("utf8"));
    const only = (row: NonNullable<typeof audit>) => ({ sessionId: f.session.sessionId, workspace: f.workspace,
      recordProjectedEvidence: () => undefined, readEvents: () => [row] });
    const signedReader = (meta: Record<string, unknown>, payload: string) => {
      const auditMeta = Object.fromEntries(["auditType", "effectiveMode", "toolName", "toolToken", "parentToken", "nativeFilesystemTouch"]
        .filter(key => Object.hasOwn(meta, key)).map(key => [key, meta[key]]));
      const ref = f.session.recordProjectedEvidence({ eventType: "audit", payload, meta: auditMeta });
      return only(f.session.readEvents().find(row => row.id === ref.eventId)!);
    };
    // Start with a well-shaped simulated receipt so bypassing the envelope guard fails an assertion, not a type access.
    for (const [label, meta] of [
      ["simulated", { ...originalMeta, effectiveMode: "SIMULATE" }],
      ["wrong audit type", { ...originalMeta, auditType: "TOOL_CALL_DENIED" }],
      ["null observation", { ...originalMeta, nativeFilesystemTouch: null }],
      ["array observation", { ...originalMeta, nativeFilesystemTouch: [] }],
      ["scalar observation", { ...originalMeta, nativeFilesystemTouch: "invalid" }],
      ["missing observation", { ...originalMeta, nativeFilesystemTouch: undefined }]
    ] as const) {
      expect(createSessionTouchedPaths()(signedReader(meta, JSON.stringify(originalBody))), label).toEqual([]);
    }
    expect(createSessionTouchedPaths()(only({ ...audit!, session_id: "foreign-session" }))).toEqual([]);
    const originalTouch = originalMeta.nativeFilesystemTouch;
    // Keep payload and metadata equal, so structural refusals cannot borrow the payload-equality guard.
    for (const touch of [
      { ...originalTouch, version: 2 }, { ...originalTouch, directory: false },
      { ...originalTouch, path: "" }, { ...originalTouch, path: null }, { ...originalTouch, path: 42 },
      { ...originalTouch, path: "x".repeat(4_097) }, { ...originalTouch, path: "界".repeat(1_400) },
      { ...originalTouch, toolToken: "" }, { ...originalTouch, toolToken: 42 },
      { ...originalTouch, parentToken: 42 }
    ]) {
      const meta = { ...originalMeta, toolToken: touch.toolToken, parentToken: touch.parentToken, nativeFilesystemTouch: touch };
      const body = { ...originalBody, nativeFilesystemTouch: touch };
      expect(createSessionTouchedPaths()(signedReader(meta, JSON.stringify(body))), JSON.stringify(touch)).toEqual([]);
    }
    for (const [field, value] of [["toolToken", "different-tool-token"], ["parentToken", "different-parent-token"]] as const) {
      const touch = { ...originalTouch, [field]: value };
      expect(createSessionTouchedPaths()(signedReader({ ...originalMeta, nativeFilesystemTouch: touch },
        JSON.stringify({ ...originalBody, nativeFilesystemTouch: touch })))).toEqual([]);
    }
    expect(createSessionTouchedPaths()(signedReader({ ...originalMeta, toolName: "bash" },
      JSON.stringify({ ...originalBody, tool: "bash" })))).toEqual([]);
    const malformed = signedReader(originalMeta, "{malformed authenticated JSON");
    const malformedRow = malformed.readEvents()[0]!;
    const malformedPayload = readEventPayload(f.workspace, malformedRow);
    expect(malformedPayload.status).toBe("ok");
    if (malformedPayload.status !== "ok") throw new Error("Signed malformed fixture payload unavailable");
    expect(sha256Hex(malformedPayload.bytes)).toBe(malformedRow.payload_sha256);
    expect(createSessionTouchedPaths()(malformed), "authenticated malformed JSON must not manufacture a filesystem observation").toEqual([]);
    const alteredMeta = { ...originalMeta, nativeFilesystemTouch: { ...originalMeta.nativeFilesystemTouch, path: "private/forged.ts" } };
    const forged = { sessionId: f.session.sessionId, workspace: f.workspace, recordProjectedEvidence: () => undefined,
      readEvents: () => rows.map(row => row.id === audit!.id ? { ...row, meta_json: JSON.stringify(alteredMeta) } : row) };
    expect(createSessionTouchedPaths()(forged)).toEqual([]);
    const alteredPayload = { ...JSON.parse(originalPayload.bytes.toString("utf8")), nativeFilesystemTouch: alteredMeta.nativeFilesystemTouch };
    const badPayload = { ...forged, readEvents: () => rows.map(row => row.id === audit!.id
      ? { ...row, meta_json: JSON.stringify(alteredMeta), payload_inline: JSON.stringify(alteredPayload) } : row) };
    expect(createSessionTouchedPaths()(badPayload)).toEqual([]);
    const refusedBody = { ...JSON.parse(originalPayload.bytes.toString("utf8")), denied: { reason: "refused" }, outcome: "not-ok" };
    const refused = f.session.recordProjectedEvidence({ eventType: "audit", payload: JSON.stringify(refusedBody), meta: {
      auditType: "TOOL_CALL_ALLOWED", effectiveMode: "EXECUTE", toolName: call.name,
      toolToken: call.token, parentToken: call.parentToken, nativeFilesystemTouch: originalMeta.nativeFilesystemTouch
    } });
    const refusedReader = { ...forged, readEvents: () => f.session.readEvents().filter(row => row.id === refused.eventId) };
    expect(createSessionTouchedPaths()(refusedReader)).toEqual([]);
  });

  it("deduplicates normalized audit and raw native-call paths before applying the path cap", () => {
    const f = fixture();
    const expected: { path: string; directory: true; eventId: string }[] = [];
    for (let index = 0; index < 33; index++) {
      const directory = `directory-${index}`;
      mkdirSync(join(f.workspace, directory));
      writeFileSync(join(f.workspace, directory, "file.ts"), "export {};\n");
      writeFileSync(join(f.workspace, directory, "AGENTS.md"), `Instructions for directory ${index}.`);
      const path = index % 2 === 0
        ? join(f.workspace, directory, "file.ts")
        : `${directory}/./file.ts`;
      const toolCallId = `native-read-${index}`;
      const call = f.session.recordToolCall({
        toolCallId, toolName: "fs.read", dispatch: "native", parentToken: null,
        args: JSON.stringify({ path })
      });
      f.emit(f.execution({
        callId: toolCallId, rootCallId: toolCallId, parentToken: null, arguments: { path }
      }));
      f.session.recordToolResult({
        toolCallId, outcome: "OK", exitCode: 0, timedOut: false, denied: false, content: "file bytes"
      });
      expected.push({ path: directory, directory: true, eventId: call.eventId });
    }
    const touchedPaths = createSessionTouchedPaths()(f.session);
    expect(touchedPaths).toEqual(expected.map(touch => expect.objectContaining(touch)));
    const loaded = loadInstructionFiles({ workspace: f.workspace, workspaceOnly: true, touchedPaths });
    const last = loaded.included.find(file => file.candidate.displayPath === "directory-32/AGENTS.md");
    expect(last?.content).toBe("Instructions for directory 32.");
    expect(last?.candidate.touchEventId).toBe(expected[32]!.eventId);
    expect(loaded.omitted.some(omission => omission.reason === "discovery-limit")).toBe(false);
  });

  it("bounds retained subcall paths and reports incomplete discovery after the limit", () => {
    const f = fixture();
    for (let index = 0; index < MAX_INSTRUCTION_TOUCH_PATHS + 3; index++) {
      f.emit(f.execution({ name: "fs.write", actionClass: "WRITE_LOW", arguments: { path: `directory-${index}/file.ts` } }));
    }
    const touchedPaths = createSessionTouchedPaths()(f.session);
    expect(touchedPaths.length).toBeLessThanOrEqual(MAX_INSTRUCTION_TOUCH_PATHS + 1);
    expect(loadInstructionFiles({ workspace: f.workspace, workspaceOnly: true, touchedPaths }).omitted)
      .toEqual(expect.arrayContaining([expect.objectContaining({ reason: "discovery-limit" })]));
  });
});
