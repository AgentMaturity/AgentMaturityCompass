/**
 * P2-17 part C: DSH as a provider of AMC's hook control path. Mapping uses DSH 0.2.1-rc.2's exact tool parameters
 * (docs/source-reviews/P2-17-dsh-plugin.md); control denies an unqualified DSH and an unregistered session.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, test } from "vitest";
import { dshActionId } from "../src/adapters/dsh/dshProvider.js";
import { evaluateProviderHookControl } from "../src/bridge/hookControl.js";
import { canonicalToolRequests, HookControlError, hookCallRefusal, hookCall, validateProviderControlResponse } from "../src/bridge/hookProviders.js";
import { controlledWorkspace, removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

const agentId = "dsh-controlled";
const lease = { leaseId: "lease_dsh_fixture", expiresTs: Date.now() + 3_600_000 };
const dsh = { version: "0.2.1-rc.2", sessionId: "dsh-session", callId: "call-1", rootCallId: "call-1", nested: false, nonce: "n".repeat(32) };

afterEach(removeFixtureWorkspaces);

function body(toolName: string, toolInput: Record<string, unknown>, context: Record<string, unknown> = dsh): string {
  return JSON.stringify({ hook_event_name: "tools/pre-execute", tool_name: toolName, tool_input: toolInput, dsh: context });
}

describe("DSH tool mapping (fixed argument schema per tool)", () => {
  const workspace = mkdtempSync(join(tmpdir(), "amc-dsh-mapping-"));
  mkdirSync(join(workspace, ".amc"), { recursive: true });
  mkdirSync(join(workspace, "workspace"), { recursive: true });
  writeFileSync(join(workspace, "workspace", "public.txt"), "x");
  afterAll(() => rmSync(workspace, { recursive: true, force: true }));
  const real = realpathSync.native(workspace);
  const at = (...parts: string[]) => join(real, ...parts);
  // The resolver names a location inside the workspace in the workspace's own spelling.
  const named = (...parts: string[]) => join(workspace, ...parts);
  const map = (toolName: string, input: Record<string, unknown>) => canonicalToolRequests("dsh", toolName, input, workspace, { cwd: "", dsh }).requests;

  test("read, write, edit and web_fetch map with exactly DSH's parameters", () => {
    expect(map("read", { file_path: at("workspace", "public.txt"), offset: 1, limit: 10 })).toEqual([
      expect.objectContaining({ name: "fs.read", args: { path: named("workspace", "public.txt") }, minimumActionClass: "READ_ONLY" })]);
    expect(map("write", { file_path: at("workspace", "out.txt"), content: "x" })).toEqual([
      expect.objectContaining({ name: "fs.write", args: { path: named("workspace", "out.txt") }, minimumActionClass: "WRITE_LOW" })]);
    expect(map("edit", { file_path: at("workspace", "public.txt"), old_string: "a", new_string: "b", replace_all: true })).toEqual([
      expect.objectContaining({ name: "fs.write", minimumActionClass: "WRITE_LOW" })]);
    expect(map("web_fetch", { url: "https://example.com/a" })).toEqual([
      expect.objectContaining({ name: "http.fetch", args: { url: "https://example.com/a", method: "GET" }, minimumActionClass: "NETWORK_EXTERNAL" })]);
  });

  test("an extra key, a missing key or a wrong type maps to nothing", () => {
    const file = at("workspace", "out.txt");
    for (const [tool, input] of [
      ["write", { file_path: file, content: "x", sandbox_permissions: "require_escalated" }],
      ["write", { file_path: file }],
      ["read", { file_path: file, offset: "1" }],
      ["edit", { file_path: file, old_string: "a", new_string: "b", replace_all: "yes" }],
      ["web_fetch", { url: "https://example.com/", method: "POST" }],
      ["read", JSON.parse(`{"file_path":${JSON.stringify(file)},"__proto__":{}}`) as Record<string, unknown>],
    ] as const) expect(map(tool, input as Record<string, unknown>), JSON.stringify(input)).toEqual([]);
  });

  test("shell, search, PTC, subagent and unknown tools map to nothing", () => {
    for (const tool of ["bash", "bash_persistent", "grep", "glob", "run_code", "subagent", "mcp__x__y", "str_replace_editor"]) {
      expect(map(tool, { command: "ls", file_path: at("x") }), tool).toEqual([]);
    }
  });

  test("relative, non-canonical and home paths map to nothing; symlinks resolve to the real target", () => {
    for (const value of ["workspace/out.txt", "~/x", `${real}/workspace/../.amc/x`, `${real}//workspace/x`, `${real}/workspace/`]) {
      expect(map("write", { file_path: value, content: "x" }), value).toEqual([]);
    }
    mkdirSync(at("workspace", "sub"), { recursive: true });
    writeFileSync(join(workspace, ".amc", "probe.txt"), "x");
    symlinkSync(join(workspace, ".amc"), join(workspace, "workspace", "state"));
    expect(map("read", { file_path: at("workspace", "state", "probe.txt") })).toEqual([
      expect.objectContaining({ args: { path: named(".amc", "probe.txt") } })]);
  });

  test("a URL in any but its one canonical spelling maps to nothing", () => {
    for (const url of ["https://EXAMPLE.com/", "https://example.com/%7e", "file:///etc/passwd", "https://example.com/%2f".toLowerCase()]) {
      expect(map("web_fetch", { url }), url).toEqual([]);
    }
  });
});

describe("DSH control decisions", () => {
  test("a call without a valid dsh context is refused", () => {
    const workspace = controlledWorkspace(agentId);
    for (const context of [{}, { ...dsh, nonce: "short" }, { ...dsh, extra: 1 }]) {
      expect(() => evaluateProviderHookControl({ workspace, authenticatedAgentId: agentId, provider: "dsh", lease,
        rawInput: body("read", { file_path: "/tmp/x" }, context) })).toThrow(HookControlError);
    }
  });

  test("the action id comes from DSH's session and call id; a nested call names its root as parent", () => {
    const call = hookCall("dsh", { dsh: { ...dsh, callId: "call-2", nested: true } })!;
    expect(call.actionId).toBe(dshActionId("dsh-session", "call-2"));
    expect(call.parentActionId).toBe(dshActionId("dsh-session", "call-1"));
  });

  test("every call from an unqualified DSH is denied, with a signed DSH response bound to the request", () => {
    const workspace = controlledWorkspace(agentId);
    const result = evaluateProviderHookControl({ workspace, authenticatedAgentId: agentId, provider: "dsh", lease,
      rawInput: body("read", { file_path: join(realpathSync.native(workspace), "workspace", "public.txt") }) });
    expect(result.decision).toBe("deny");
    expect(result.reason).toMatch(/AMC has not qualified DSH 0\.2\.1-rc\.2/);
    expect(validateProviderControlResponse("dsh", result.providerResponse)).toBe(true);
    expect(result.providerResponse).toMatchObject({ decision: "deny" });
  });

  test("the refusal checks the DSH version before anything else", () => {
    expect(hookCallRefusal(hookCall("dsh", { dsh })!, "/w", "read", {})).toMatch(/AMC has not qualified DSH/);
  });

  test("a DSH allow response must bind its request", () => {
    expect(validateProviderControlResponse("dsh", { decision: "allow" })).toBe(false);
    expect(validateProviderControlResponse("dsh", { decision: "allow", requestSha256: "a".repeat(64) })).toBe(true);
    expect(validateProviderControlResponse("dsh", { decision: "deny", requestSha256: "a".repeat(64) })).toBe(false);
  });
});
