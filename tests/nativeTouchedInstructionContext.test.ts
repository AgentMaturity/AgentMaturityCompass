import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { composeNativePrompt, type NativePrompt } from "../src/agent/nativeAgentComposition.js";
import { agentPromptProfile } from "../src/prompt/agentPromptProfile.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { sha256Hex } from "../src/utils/hash.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { createSessionTouchedPaths, lastRecordedContextSnapshot } from "../src/prompt/context/nativeCompositionContext.js";
import { ContextPluginHost, createContextPreStep, createInstructionsContextPlugin } from "../src/prompt/context/index.js";
import { PromptAssemblyRegistry } from "../src/prompt/assembly/index.js";
import { deriveRecordedRequest } from "../src/llm/request/deriveRequest.js";
import type { PreStepInput } from "../src/agent/loopTypes.js";
import { joinContextSections } from "../src/prompt/assembly/interpolate.js";
import type { EvidenceEvent } from "../src/types.js";
import { loopHarness, ok, StubToolSeam, textStep, toolStep, type LoopHarness } from "./helpers/agentLoopHarness.js";

const runs: { harness: LoopHarness; prompt: NativePrompt }[] = [];
const bareRuns: LoopHarness[] = [];
afterEach(() => {
  for (const { harness, prompt } of runs.splice(0)) {
    prompt.dispose(); harness.finish(); rmSync(harness.dir, { recursive: true, force: true });
  }
  for (const harness of bareRuns.splice(0)) { harness.finish(); rmSync(harness.dir, { recursive: true, force: true }); }
});

it.each(["DENIED", "CANCELLED"] as const)("does not turn a %s filesystem call into an observed directory", async outcome => {
  const tools = new StubToolSeam({ "fs.read": async () => ok("withheld", { outcome, denied: outcome === "DENIED" }) });
  const harness = loopHarness({ scripts: [toolStep("refused", "fs.read", '{"path":"private/x.ts"}'), textStep("done")], tools });
  bareRuns.push(harness);
  harness.driver.followup("Read the file"); await harness.driver.whenIdle();
  expect(createSessionTouchedPaths()(harness.session)).toEqual([]);
});

it("requires the committed argument digest before attributing a touched path", async () => {
  const tools = new StubToolSeam({ "fs.read": async () => ok("read") });
  const harness = loopHarness({ scripts: [toolStep("read", "fs.read", '{"path":"sub/x.ts"}'), textStep("done")], tools });
  bareRuns.push(harness);
  harness.driver.followup("Read the file"); await harness.driver.whenIdle();
  const readPaths = createSessionTouchedPaths();
  expect(readPaths(harness.session)).toEqual([expect.objectContaining({ path: "sub", directory: true })]);
  const forged = { sessionId: harness.sessionId, workspace: harness.dir,
    recordProjectedEvidence: () => undefined,
    readEvents: () => harness.events().map(row => row.event_type === "tool/call" ? { ...row, payload_inline: '{"path":"private/x.ts"}' } : row) };
  expect(createSessionTouchedPaths()(forged)).toEqual([]);
});

it("recovers the latest valid local context snapshot while ignoring ordinary, foreign or unreadable rows", () => {
  const harness = loopHarness({ scripts: [] });
  bareRuns.push(harness);
  harness.session.startTurn({ trigger: "user" });
  harness.session.startStep();
  try {
    const active = joinContextSections([{ name: "context:fixture", text: "ACTIVE RECORDED CONTEXT" }]);
    const cleared = joinContextSections([{ name: "context:cleared",
      text: "Previously supplied runtime context has been cleared; no runtime context contributions are currently available." }]);
    const activeRef = harness.session.recordUserMessage(active);
    const clearedRef = harness.session.recordUserMessage(cleared);
    const ordinaryRef = harness.session.recordUserMessage("A later ordinary user message");
    const rows = harness.events();
    const activeRow = rows.find(row => row.id === activeRef.eventId)!;
    const clearedRow = rows.find(row => row.id === clearedRef.eventId)!;
    const ordinaryRow = rows.find(row => row.id === ordinaryRef.eventId)!;
    const reader = (events: readonly EvidenceEvent[]) => ({
      sessionId: harness.sessionId, workspace: harness.dir,
      readEvents: () => events, recordProjectedEvidence: () => undefined
    });
    expect(lastRecordedContextSnapshot(reader([activeRow, ordinaryRow]))).toBe(active);
    expect(lastRecordedContextSnapshot(reader([activeRow, clearedRow, ordinaryRow]))).toBe(cleared);
    expect(lastRecordedContextSnapshot(reader([activeRow, { ...clearedRow, session_id: "foreign-session" }, ordinaryRow])))
      .toBe(active);
    expect(lastRecordedContextSnapshot(reader([activeRow, { ...clearedRow, payload_sha256: "0".repeat(64) }, ordinaryRow])))
      .toBe(active);
    expect(lastRecordedContextSnapshot(reader([activeRow, { ...clearedRow, event_type: "audit" }, ordinaryRow])))
      .toBe(active);
    expect(lastRecordedContextSnapshot(reader([activeRow, { ...clearedRow, payload_pruned: 1 }, ordinaryRow])))
      .toBe(active);
    expect(lastRecordedContextSnapshot(reader([activeRow, { ...clearedRow,
      payload_inline: null, payload_path: null, canonical_payload_path: null }, ordinaryRow])))
      .toBe(active);
    expect(lastRecordedContextSnapshot(reader([ordinaryRow]))).toBeUndefined();
  } finally {
    harness.session.endStep({ stopReason: "end_turn", usage: null });
    harness.session.endTurn({ reason: "complete" });
    harness.session.sealTurn();
  }
});

it("commits touched-directory instructions with exact digest and execution identity only on the next request", async () => {
  let prompt: NativePrompt;
  const tools = new StubToolSeam({ "fs.read": async () => ok("file bytes") });
  const harness = loopHarness({ scripts: [toolStep("read-sub", "fs.read", '{"path":"sub/x.ts"}'), textStep("done")], tools,
    hooks: { preStep: (input, next) => prompt.preStep(input, next) } });
  mkdirSync(join(harness.dir, "sub"));
  const content = "Never edit this directory without reviewing its tests.\n{{literal}}";
  writeFileSync(join(harness.dir, "sub/AGENTS.md"), content);
  writeFileSync(join(harness.dir, "sub/x.ts"), "export {};\n");
  prompt = composeNativePrompt(agentPromptProfile({ workspace: harness.dir, agentId: "default", now: () => 0 }),
    { sessionId: harness.sessionId, session: harness.session });
  runs.push({ harness, prompt });
  harness.driver.followup("Read sub/x.ts");
  await harness.driver.whenIdle();
  const rows = harness.events();
  const contexts = rows.filter(row => row.event_type === "user/message").map(row => ({ row,
    text: (() => { const read = readEventPayload(harness.dir, row); return read.status === "ok" ? read.bytes.toString("utf8") : ""; })() }));
  const included = contexts.filter(context => context.text.includes(content));
  expect(included).toHaveLength(1);
  expect(included[0]!.text).toContain(sha256Hex(content));
  const call = rows.find(row => row.event_type === "tool/call")!;
  expect(included[0]!.text).toContain(call.id);
  const requests = rows.filter(row => row.event_type === "request/header");
  expect(rows.indexOf(included[0]!.row)).toBeGreaterThan(rows.indexOf(call));
  expect(rows.indexOf(included[0]!.row)).toBeLessThan(rows.indexOf(requests[1]!));
  expect(contexts.find(context => rows.indexOf(context.row) < rows.indexOf(requests[0]!))?.text).not.toContain(content);
  expect(included[0]!.row.writer_sig).not.toBe("");
  harness.finish();
  expect(verifyLedgerIntegrity(harness.dir).ok).toBe(true);
});

it("reobserves previously touched directories across turns and never discovers a sibling until touched", async () => {
  let prompt: NativePrompt;
  const tools = new StubToolSeam({ "fs.read": async () => ok("read") });
  const harness = loopHarness({ scripts: [toolStep("read-sub", "fs.read", '{"path":"sub/x.ts"}'), textStep("first"), textStep("second")], tools,
    hooks: { preStep: (input, next) => prompt.preStep(input, next) } });
  mkdirSync(join(harness.dir, "sub")); mkdirSync(join(harness.dir, "sibling"));
  writeFileSync(join(harness.dir, "sibling/AGENTS.md"), "SIBLING PRIVATE RULE");
  prompt = composeNativePrompt(agentPromptProfile({ workspace: harness.dir, agentId: "default", now: () => 0 }),
    { sessionId: harness.sessionId, session: harness.session });
  runs.push({ harness, prompt });
  harness.driver.followup("Read sub/x.ts"); await harness.driver.whenIdle();
  writeFileSync(join(harness.dir, "sub/AGENTS.md"), "LATE RULE");
  harness.driver.followup("Continue"); await harness.driver.whenIdle();
  const messages = harness.events().filter(row => row.event_type === "user/message").map(row => {
    const read = readEventPayload(harness.dir, row); return read.status === "ok" ? read.bytes.toString("utf8") : "";
  });
  expect(messages.at(-1)).toContain("LATE RULE");
  expect(messages.join("\n")).not.toContain("SIBLING PRIVATE RULE");
});

it("clears the last removed instruction snapshot exactly once when no clock or other context remains", async () => {
  let prompt: NativePrompt;
  const tools = new StubToolSeam({ "fs.read": async () => ok("read") });
  const harness = loopHarness({
    scripts: [toolStep("read-sub", "fs.read", '{"path":"sub/x.ts"}'), textStep("first"), textStep("second"), textStep("third")],
    tools, hooks: { preStep: (input, next) => prompt.preStep(input, next) }
  });
  mkdirSync(join(harness.dir, "sub"));
  writeFileSync(join(harness.dir, "sub/x.ts"), "export {};\n");
  const instruction = "REMOVABLE NESTED INSTRUCTION";
  writeFileSync(join(harness.dir, "sub/AGENTS.md"), instruction);
  prompt = composeNativePrompt(agentPromptProfile({ workspace: harness.dir, agentId: "default", contextPlugins: [
    createInstructionsContextPlugin({ workspace: harness.dir, workspaceOnly: true })
  ] }), { sessionId: harness.sessionId, session: harness.session });
  runs.push({ harness, prompt });
  harness.driver.followup("Read sub/x.ts"); await harness.driver.whenIdle();
  rmSync(join(harness.dir, "sub/AGENTS.md"));
  harness.driver.followup("Continue after removing the instructions"); await harness.driver.whenIdle();
  harness.driver.followup("Continue with no new context"); await harness.driver.whenIdle();
  const rows = harness.events();
  const requests = rows.filter(row => row.event_type === "request/header");
  expect(requests).toHaveLength(4);
  const messages = rows.filter(row => row.event_type === "user/message").map(row => {
    const read = readEventPayload(harness.dir, row);
    return { row, text: read.status === "ok" ? read.bytes.toString("utf8") : "" };
  });
  expect(messages.filter(message => rows.indexOf(message.row) < rows.indexOf(requests[0]!)).map(message => message.text))
    .toEqual(["Read sub/x.ts"]);
  expect(messages.filter(message => message.text.includes(instruction))).toHaveLength(1);
  const clearing = "Previously supplied runtime context has been cleared; no runtime context contributions are currently available.";
  const cleared = messages.filter(message => message.text.includes(clearing));
  expect(cleared).toHaveLength(1);
  expect(cleared[0]!.text).toContain("supersedes earlier runtime-context snapshots");
  expect(cleared[0]!.text).not.toContain(instruction);
  expect(cleared[0]!.row.writer_sig).toBeTruthy();
  expect(cleared[0]!.row.writer_sig).not.toBe("unsigned");
  expect(rows.indexOf(cleared[0]!.row)).toBeGreaterThan(rows.indexOf(requests[1]!));
  expect(rows.indexOf(cleared[0]!.row)).toBeLessThan(rows.indexOf(requests[2]!));
  const reconstructed = deriveRecordedRequest({ workspace: harness.dir, events: rows, headerEventId: requests[2]!.id });
  expect(reconstructed.status).toBe("reconstructed");
  expect(reconstructed.bytes?.toString("utf8")).toContain(clearing);
  const audits = rows.filter(row => row.event_type === "audit").map(row => ({ row, meta: JSON.parse(row.meta_json) }));
  expect(audits.some(audit => audit.meta.phase === "context-delivery" && audit.meta.contextEventId === cleared[0]!.row.id)).toBe(true);
  const clearingSource = audits.find(audit => audit.meta.phase === "context" && audit.meta.turn === 2 && audit.meta.step === 1);
  expect(clearingSource?.meta.sources.map((source: { id: string }) => source.id)).toEqual(["runtime-context-source"]);
  harness.finish();
  expect(verifyLedgerIntegrity(harness.dir).ok).toBe(true);
});

it("clears instructions removed before recomposing a resumed instruction-only session", async () => {
  let prompt: NativePrompt;
  const tools = new StubToolSeam({ "fs.read": async () => ok("read") });
  const harness = loopHarness({
    scripts: [toolStep("read-before-resume", "fs.read", '{"path":"sub/x.ts"}'), textStep("first"), textStep("resumed"), textStep("still empty")],
    tools, hooks: { preStep: (input, next) => prompt.preStep(input, next) }
  });
  mkdirSync(join(harness.dir, "sub"));
  writeFileSync(join(harness.dir, "sub/x.ts"), "export {};\n");
  const instruction = "INSTRUCTION REMOVED BEFORE RESUME";
  writeFileSync(join(harness.dir, "sub/AGENTS.md"), instruction);
  const profile = () => agentPromptProfile({ workspace: harness.dir, agentId: "default", contextPlugins: [
    createInstructionsContextPlugin({ workspace: harness.dir, workspaceOnly: true })
  ] });
  prompt = composeNativePrompt(profile(), { sessionId: harness.sessionId, session: harness.session });
  const run = { harness, prompt };
  runs.push(run);
  harness.driver.followup("Read sub/x.ts before resuming"); await harness.driver.whenIdle();
  expect(harness.events().filter(row => row.event_type === "request/header")).toHaveLength(2);
  prompt.dispose();
  rmSync(join(harness.dir, "sub/AGENTS.md"));
  prompt = composeNativePrompt(profile(), { sessionId: harness.sessionId, session: harness.session });
  run.prompt = prompt;
  harness.driver.followup("Resume after the final instruction was removed"); await harness.driver.whenIdle();
  prompt.dispose();
  prompt = composeNativePrompt(profile(), { sessionId: harness.sessionId, session: harness.session });
  run.prompt = prompt;
  harness.driver.followup("Continue after the clearing snapshot"); await harness.driver.whenIdle();
  const rows = harness.events();
  const clearing = "Previously supplied runtime context has been cleared; no runtime context contributions are currently available.";
  const messages = rows.filter(row => row.event_type === "user/message").map(row => {
    const read = readEventPayload(harness.dir, row);
    return { row, text: read.status === "ok" ? read.bytes.toString("utf8") : "" };
  });
  expect(messages.filter(message => message.text.includes(instruction))).toHaveLength(1);
  const cleared = messages.filter(message => message.text.includes(clearing));
  expect(cleared).toHaveLength(1);
  expect(cleared[0]!.text).toContain("supersedes earlier runtime-context snapshots");
  expect(cleared[0]!.row.writer_sig).toBeTruthy();
  expect(cleared[0]!.row.writer_sig).not.toBe("unsigned");
  const requests = rows.filter(row => row.event_type === "request/header");
  expect(requests).toHaveLength(4);
  expect(rows.indexOf(cleared[0]!.row)).toBeGreaterThan(rows.indexOf(requests[1]!));
  expect(rows.indexOf(cleared[0]!.row)).toBeLessThan(rows.indexOf(requests[2]!));
  const reconstructed = deriveRecordedRequest({ workspace: harness.dir, events: rows, headerEventId: requests[2]!.id });
  expect(reconstructed.status).toBe("reconstructed");
  expect(reconstructed.bytes?.toString("utf8")).toContain(clearing);
  const delivered = rows.filter(row => row.event_type === "audit").filter(row => {
    const meta = JSON.parse(row.meta_json);
    return meta.phase === "context-delivery" && meta.contextEventId === cleared[0]!.row.id;
  });
  expect(delivered).toHaveLength(1);
  expect(delivered[0]!.writer_sig).toBeTruthy();
  harness.finish();
  expect(verifyLedgerIntegrity(harness.dir).ok).toBe(true);
});

it("keeps empty child context separate from its parent's pending clearing snapshot", async () => {
  let parentAvailable = true;
  const registry = new PromptAssemblyRegistry({ includeHarnessIdentity: false });
  const host = new ContextPluginHost([{
    name: "context:session-local", order: 100,
    collect: async input => input.sessionId === "parent" && parentAvailable ? "PARENT CONTEXT" : ""
  }]);
  const seam = createContextPreStep({ registry, host, sessionId: "parent" });
  const input = (step: number): PreStepInput => ({
    turn: 1, step, target: "next-step", messages: [], signal: new AbortController().signal
  });
  const enter = async () => ({ kind: "enter" as const, messages: [] });
  try {
    const parent = await seam.preStep(input(2), enter);
    expect(parent.kind === "enter" && parent.messages[0]?.text).toContain("PARENT CONTEXT");
    const child = await seam.preStep({ ...input(2), contextSession: {
      sessionId: "child", workspace: "/unused", readEvents: () => [], recordProjectedEvidence: () => undefined
    } }, enter);
    expect(child).toEqual({ kind: "enter", messages: [] });
    parentAvailable = false;
    const clearing = await seam.preStep(input(3), enter);
    expect(clearing.kind === "enter" && clearing.messages[0]?.text).toContain("Previously supplied runtime context has been cleared");
    expect(await seam.preStep(input(4), enter)).toEqual({ kind: "enter", messages: [] });
  } finally {
    seam.dispose();
  }
});
