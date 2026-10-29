import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { agentToolset } from "../src/agent/agentToolset.js";
import { DEFAULT_AGENT_LOOP_CONFIG } from "../src/agent/loopTypes.js";
import { DEFAULT_RETRY_RUNTIME } from "../src/agent/requestRetry.js";
import { runStep, type LoopLlm } from "../src/agent/stepRunner.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { SessionService } from "../src/session/sessionService.js";
import { extractSpillRef } from "../src/session/spill/spillTypes.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import { defaultToolsConfig, type ToolDefinition } from "../src/toolhub/toolsSchema.js";
import { initToolsConfig, loadVerifiedToolsConfigSnapshot, toolsConfigPath, toolsConfigSigPath } from "../src/toolhub/toolhubValidators.js";
import { PATH_ARGUMENTS } from "../src/toolhub/toolArgumentRoles.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";
import { initWorkspace } from "../src/workspace.js";

// AUTHORED UNEXECUTED: source regressions, not installed or provider acceptance.
const cleanups: Array<() => void> = [];
afterEach(() => { try { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); } finally { vi.unstubAllEnvs(); } });
const refusal = /signed workspace tool policy changed or cannot be verified/;
const read: ToolDefinition = { name: "fs.read", actionClass: "READ_ONLY", allow: { paths: ["./workspace/**"] } };
const write: ToolDefinition = { name: "fs.write", actionClass: "WRITE_LOW", allow: { paths: ["./workspace/**"] } };

function fixture(options: { pinned?: boolean; code?: boolean; extension?: boolean; grants?: ToolDefinition[] } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-pinned-tool-schemas-")));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const workspace = join(root, "project"); mkdirSync(workspace);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-pinned-schema-fixture-only");
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "control-checkpoints"));
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initBudgets(workspace, "default"); writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  const config = defaultToolsConfig(); config.tools.allowedTools = [read, ...(options.grants ?? [])];
  // A signed legacy permissive default cannot override the explicit native pin.
  config.tools.denyByDefault = false;
  const extension: ToolDefinition = { name: "reviewed_extension", actionClass: "READ_ONLY" };
  if (options.extension) config.tools.allowedTools.push(extension);
  initToolsConfig(workspace, config);
  const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
  if (!snapshot.signatureValid || !snapshot.digestSha256) throw new Error("Fixture policy was not signed");
  const pin = snapshot.digestSha256;
  mkdirSync(join(workspace, "workspace"), { recursive: true });
  writeFileSync(join(workspace, "workspace", "review.txt"), "pinned read-only fixture");
  const session = new SessionService(workspace);
  cleanups.push(() => session.disposeWithoutClosing());
  session.open({ agentId: "default", harnessVersion: "pinned-schema-fixture", compositionDigest: "fixture", policyDigest: pin });
  const systemPromptEventId = session.recordSystemPrompt("Synthetic pinned-schema boundary fixture.").eventId;
  session.startTurn({ trigger: "user" }); session.startStep();
  const tools = agentToolset({ workspace, agentId: "default", sessionId: session.sessionId, recorder: session,
    ...(options.pinned === false ? {} : { expectedToolsDigest: pin }),
    ...(options.code ? { mode: "code" as const } : {}),
    ...(options.extension ? { additionalCapabilities: [extension] } : {}) });
  cleanups.push(() => tools.close());
  if (options.extension) tools.registry.define({ name: extension.name, actionClass: extension.actionClass,
    description: "Explicit synthetic extension; no remote transport is started",
    parameters: { type: "object", properties: {} }, body: () => ({ ok: true, output: "extension fixture" }) });
  const prepare = vi.fn((_spec: Parameters<LoopLlm["prepare"]>[0]) => { throw new Error("Unexpected model preparation in refusal fixture"); });
  const step = (signal = new AbortController().signal) => runStep({ session, tools: tools.seam, llm: { prepare },
    route: { providerId: "schema-fixture", model: "schema-fixture", params: {} }, systemPromptEventId,
    config: DEFAULT_AGENT_LOOP_CONFIG, retryRuntime: DEFAULT_RETRY_RUNTIME, acceptContext: () => {}, notify: () => {} }, 1, 1, signal);
  let sequence = 0;
  const call = (toolName: string, args: object) => tools.seam.execute({ callId: `pinned-schema-${++sequence}`, toolName,
    rawArguments: JSON.stringify(args), sessionId: session.sessionId, turn: 1, step: 1, parentToken: null,
    dispatch: "native", signal: new AbortController().signal });
  return { workspace, config, pin, session, tools, prepare, step, call,
    names: () => tools.seam.schemas()?.map(schema => schema.name).sort() ?? [] };
}

test("an unchanged signed read-only pin still offers and executes its actual read capability", async () => {
  const f = fixture(); const before = readFileSync(toolsConfigPath(f.workspace));
  expect(f.tools.readiness.ready).toBe(true); expect(f.names()).toEqual(["fs.read"]);
  expect(await f.call("fs.read", { path: "workspace/review.txt" })).toMatchObject({ outcome: "OK", content: "pinned read-only fixture" });
  expect((await f.call("fs.write", { path: "workspace/forbidden.txt", content: "not allowed" })).outcome).toBe("DENIED");
  expect(existsSync(join(f.workspace, "workspace", "forbidden.txt"))).toBe(false);
  expect(readFileSync(toolsConfigPath(f.workspace))).toEqual(before);
});

test.each(["wider grants", "same-name wider path", "revoked subset", "misclassified identity", "invalid signature", "unverified bytes"] as const)(
  "%s refuses pinned schema admission before native model preparation, without a no-tools fallback", async change => {
    const f = fixture(); expect(f.names()).toEqual(["fs.read"]);
    switch (change) {
      case "wider grants": f.config.tools.allowedTools.push(write, { name: "bash", actionClass: "WRITE_HIGH" }); break;
      case "same-name wider path": f.config.tools.allowedTools = [{ ...read, allow: { paths: ["./workspace/**", "./additional/**"] } }]; break;
      case "revoked subset": f.config.tools.allowedTools = []; break;
      case "misclassified identity": f.config.tools.allowedTools = [{ ...read, actionClass: "WRITE_LOW" }]; break;
      case "invalid signature": writeFileSync(toolsConfigSigPath(f.workspace), "{}"); break;
      case "unverified bytes": writeFileSync(toolsConfigPath(f.workspace), readFileSync(toolsConfigPath(f.workspace), "utf8") + "\n"); break;
    }
    if (change !== "invalid signature" && change !== "unverified bytes") {
      initToolsConfig(f.workspace, f.config);
      const changed = loadVerifiedToolsConfigSnapshot(f.workspace);
      expect(changed.signatureValid).toBe(true); expect(changed.digestSha256).not.toBe(f.pin);
    } else expect(loadVerifiedToolsConfigSnapshot(f.workspace).signatureValid).toBe(false);
    const changedBytes = readFileSync(toolsConfigPath(f.workspace));
    expect(() => f.names()).toThrow(refusal);
    await expect(f.step()).rejects.toThrow(refusal);
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.session.readEvents().filter(row => ["request/header", "request/tools", "tool/call"].includes(row.event_type))).toEqual([]);
    expect(readFileSync(toolsConfigPath(f.workspace))).toEqual(changedBytes);
  }
);

test("the existing execution digest guard still records a signed denial after an operator widens the policy", async () => {
  const f = fixture(); f.config.tools.allowedTools.push(write); initToolsConfig(f.workspace, f.config);
  expect(() => f.names()).toThrow(refusal);
  const denied = await f.call("fs.write", { path: "workspace/forbidden.txt", content: "must not execute" });
  expect(denied.outcome).toBe("DENIED"); expect(String(denied.content)).toContain("reviewed digest");
  expect(existsSync(join(f.workspace, "workspace", "forbidden.txt"))).toBe(false);
  const rows = f.session.readEvents().filter(row => JSON.parse(row.meta_json).auditType === "TOOL_CALL_DENIED");
  expect(rows).toHaveLength(1);
  expect(JSON.parse(rows[0]!.meta_json).toolName).toBe("fs.write");
  expect(extractEnvelope(rows[0]!.meta_json)?.sessionId).toBe(f.session.sessionId);
  expect(rows[0]!.writer_sig).not.toBe("unsigned");
});

test("pinned Code Mode and explicit extension schemas cannot bypass the same snapshot admission", () => {
  const f = fixture({ code: true, extension: true });
  expect(f.names()).toEqual(["fs.read", "reviewed_extension", "run_code"]);
  f.config.tools.allowedTools.push(write); initToolsConfig(f.workspace, f.config);
  expect(() => f.names()).toThrow(refusal);
});

test("un-pinned sessions retain live signed-subset selection and revocation behavior", () => {
  const f = fixture({ pinned: false }); expect(f.names()).toEqual(["fs.read"]);
  f.config.tools.allowedTools.push(write); initToolsConfig(f.workspace, f.config);
  expect(f.names()).toEqual(["fs.read", "fs.write"]);
  f.config.tools.allowedTools = []; initToolsConfig(f.workspace, f.config);
  expect(f.names()).toEqual([]);
});

test("an already cancelled native step remains cancelled before schema admission or model preparation", async () => {
  const f = fixture(); f.config.tools.allowedTools.push(write); initToolsConfig(f.workspace, f.config);
  const controller = new AbortController(); const reason = new Error("fixture caller cancellation"); controller.abort(reason);
  await expect(f.step(controller.signal)).rejects.toBe(reason);
  expect(f.prepare).not.toHaveBeenCalled();
});

// P1-36 re-review pin. The signed policy digest (`expectedToolsDigest`) covers grants (name, action class, paths), not
// schema bytes; each request commits the bytes it offered in its own `request/tools` row, and verification rebuilds an
// old session from those recorded bytes. Changing a native fs schema therefore changes every new request's
// `toolSchemaSha256` without touching any policy pin, so this digest makes that change a reviewed test change.
// P1-36: fs.read gained `offset`/`limit`; fs.edit gained `replaceAll` and `edits`, and `required` is now `["path"]`.
// WP33 (PXA-22): fs.read `maxBytes` states the body's bounds (minimum 1, maximum 10,000,000), now enforced before approval.
// WP34a: fs.read now documents regular-file admission and UTF-8-safe bounded output; arguments remain unchanged.
const FS_TOOL_SCHEMAS_SHA256 = "e4afe883083c1c347c9ce9ffb00be4fe6c701a6f642d32b3a6290457dd047bc3";
const edit: ToolDefinition = { name: "fs.edit", actionClass: "WRITE_LOW", allow: { paths: ["./workspace/**"] } };

test("the offered fs tool schemas are pinned by digest and keep one top-level path argument (P1-36)", () => {
  const f = fixture({ grants: [write, edit] });
  const offered = f.tools.seam.schemas()!.filter(schema => schema.name.startsWith("fs.")).sort((a, b) => a.name.localeCompare(b.name));
  expect(offered.map(schema => schema.name)).toEqual(["fs.edit", "fs.read", "fs.write"]);
  for (const { parameters } of offered) {
    expect(Object.keys(parameters).filter(key => ["oneOf", "anyOf", "allOf"].includes(key))).toEqual([]);
    expect(parameters.required).toContain("path");
    expect(Object.keys(parameters.properties as object).filter(key => (PATH_ARGUMENTS as readonly string[]).includes(key))).toEqual(["path"]);
  }
  expect(sha256Hex(canonicalize(offered))).toBe(FS_TOOL_SCHEMAS_SHA256);
});

test("signed path globs still deny line-range reads and multi-edits outside the grant (P1-36)", async () => {
  const f = fixture({ grants: [edit] });
  writeFileSync(join(f.workspace, "outside.txt"), "a\n");
  expect(await f.call("fs.read", { path: "workspace/review.txt", limit: 1 }))
    .toMatchObject({ outcome: "OK", content: "     1\tpinned read-only fixture\n[amc: lines 1-1 of 1]" });
  expect(await f.call("fs.edit", { path: "workspace/review.txt", edits: [{ find: "pinned", replace: "Pinned" }] })).toMatchObject({ outcome: "OK" });
  expect(readFileSync(join(f.workspace, "workspace", "review.txt"), "utf8")).toBe("Pinned read-only fixture");
  const deniedRead = await f.call("fs.read", { path: "outside.txt", offset: 1 });
  const deniedEdit = await f.call("fs.edit", { path: "outside.txt", edits: [{ find: "a", replace: "b" }] });
  expect([deniedRead.outcome, deniedEdit.outcome]).toEqual(["DENIED", "DENIED"]);
  expect(String(deniedEdit.content)).toContain("not in allowlist");
  expect(readFileSync(join(f.workspace, "outside.txt"), "utf8")).toBe("a\n");
});

// WP34a uses the same canonical-schema review process as the fs pin above.
const SPILL_READ_TOOL_SCHEMA_SHA256 = "ef96e1c0bd8cea81d5ae476c6d8853ad22241d3e4c2b3920d5d2ba411f9a4137";
const spillRead: ToolDefinition = { name: "session.spill_read", actionClass: "READ_ONLY" };

test("the signed native spill reader schema is pinned and reads only its own session locators", async () => {
  const f = fixture({ grants: [spillRead] });
  const offered = f.tools.seam.schemas()!.filter(schema => schema.name === "session.spill_read");
  expect(offered).toHaveLength(1);
  expect(sha256Hex(canonicalize(offered))).toBe(SPILL_READ_TOOL_SCHEMA_SHA256);
  f.session.recordToolCall({ toolCallId: "long-log", toolName: "grep", args: "{}", dispatch: "native", parentToken: null });
  const spilled = f.session.recordToolResult({ toolCallId: "long-log", outcome: "OK", exitCode: null, timedOut: false,
    denied: false, content: "FIRST-LINE\n" + "log detail\n".repeat(5_000) + "FINAL-LINE\n" });
  const locator = extractSpillRef(f.session.readEvents().find(event => event.id === spilled.eventId)!.meta_json)!.locator;
  expect(locator).toBeTypeOf("string");
  const read = await f.call("session.spill_read", { locator, offset: 0, limit: 11 });
  expect(read.outcome).toBe("OK");
  expect(JSON.parse(String(read.content))).toMatchObject({ content: "FIRST-LINE\n", encoding: "utf8", sessionIds: [f.session.sessionId] });
  const other = new SessionService(f.workspace);
  cleanups.push(() => other.disposeWithoutClosing());
  other.open({ agentId: "default", harnessVersion: "spill-boundary-fixture", compositionDigest: "fixture", policyDigest: f.pin });
  other.startTurn({ trigger: "user" }); other.startStep();
  other.recordToolCall({ toolCallId: "foreign-log", toolName: "grep", args: "{}", dispatch: "native", parentToken: null });
  const foreign = other.recordToolResult({ toolCallId: "foreign-log", outcome: "OK", exitCode: null, timedOut: false,
    denied: false, content: "foreign private log\n".repeat(5_000) });
  const foreignLocator = extractSpillRef(other.readEvents().find(event => event.id === foreign.eventId)!.meta_json)!.locator;
  expect(foreignLocator).toBeTypeOf("string");
  const refused = await f.call("session.spill_read", { locator: foreignLocator, limit: 10 });
  expect(refused.outcome).toBe("ERROR");
  expect(String(refused.content)).toContain("current session");
  expect(String(refused.content)).not.toContain("foreign private log");
});

test("a native session without a signed spill reader grant cannot invoke it", async () => {
  const f = fixture();
  expect(f.names()).not.toContain("session.spill_read");
  expect((await f.call("session.spill_read", { locator: "amc-spill:invalid" })).outcome).toBe("DENIED");
});
