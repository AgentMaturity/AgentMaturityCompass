/**
 * P2-17: DSH control installation, session registration and AMC's DSH transport answer check, end to end on a control
 * workspace with a stand-in DSH package on disk. The allow path needs a qualified DSH version, so this file qualifies
 * 0.2.1-rc.2 by mocking dshVersions.ts; production qualifies none (tests/dshHookControl.test.ts covers that denial).
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("../src/adapters/dsh/dshVersions.js", () => ({
  QUALIFIED_DSH_VERSIONS: ["0.2.1-rc.2", "0.2.1-rc.4"],
  dshVersionRefusal: (version: string) => (["0.2.1-rc.2", "0.2.1-rc.4"].includes(version) ? null : `AMC has not qualified DSH ${version}; control denies the call.`),
}));

const { dshControlAnswer } = await import("../src/adapters/dsh/dshControlClient.js");
const { dshActionId } = await import("../src/adapters/dsh/dshIdentity.js");
const { getHookIntegrationStatus, installHookIntegration, removeHookIntegration } = await import("../src/adapters/hookIntegration.js");
const { handleHookControlRequest } = await import("../src/bridge/hookControlRoute.js");
const { HookControlError } = await import("../src/bridge/hookProviders.js");
const { getPurposeKeyHistory } = await import("../src/keys/signingKeys.js");
const { sha256Hex } = await import("../src/utils/hash.js");
const { controlledWorkspace, removeFixtureWorkspaces } = await import("./helpers/piHookFixtures.js");

const agentId = "dsh-controlled";
const lease = { leaseId: "lease_dsh_fixture", expiresTs: Date.now() + 3_600_000 };
const sessionId = "2b0f8f0e-9a1b-4c1d-8e2f-3a4b5c6d7e8f";
const pluginSha256 = sha256Hex(readFileSync(resolve("packages", "dsh-amc-plugin", "index.mjs")));

afterEach(removeFixtureWorkspaces);

/** A stand-in DSH install: @deepseek-ai/dsh and the @deepseek-ai/dsh-tools it resolves, under one node_modules. */
function fakeDsh(version = "0.2.1-rc.2"): string {
  const root = mkdtempSync(join(tmpdir(), "amc-fake-dsh-"));
  const dsh = join(root, "node_modules", "@deepseek-ai", "dsh");
  const tools = join(root, "node_modules", "@deepseek-ai", "dsh-tools");
  for (const [dir, name] of [[dsh, "@deepseek-ai/dsh"], [tools, "@deepseek-ai/dsh-tools"]] as const) {
    mkdirSync(join(dir, "dist"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version }));
    writeFileSync(join(dir, "dist", "index.js"), `export const name = ${JSON.stringify(name)};\n`);
  }
  return dsh;
}

function installed(dshDir = fakeDsh()): { workspace: string; dshDir: string } {
  const workspace = controlledWorkspace(agentId);
  installHookIntegration({ workspace, provider: "dsh", agentId, mode: "control", dshPackageDir: dshDir });
  return { workspace, dshDir };
}

const route = (workspace: string, body: Record<string, unknown>) =>
  handleHookControlRequest({ workspace, authenticatedAgentId: agentId, provider: "dsh", lease, rawInput: JSON.stringify(body) });
const register = (workspace: string, dsh: Record<string, unknown> = {}) =>
  route(workspace, { hook_event_name: "session_start", dsh: { version: "0.2.1-rc.2", sessionId, pluginSha256, ...dsh } });

function call(workspace: string, toolInput: Record<string, unknown>, version = "0.2.1-rc.2") {
  const rawInput = JSON.stringify({ hook_event_name: "tools/pre-execute", tool_name: "read", tool_input: toolInput,
    dsh: { version, sessionId, callId: "call-1", rootCallId: "call-1", nested: false, nonce: "n".repeat(32) } });
  return { rawInput, result: handleHookControlRequest({ workspace, authenticatedAgentId: agentId, provider: "dsh", lease, rawInput }) as unknown as Record<string, unknown> };
}

const publicFile = (workspace: string) => join(realpathSync.native(workspace), "workspace", "public.txt");

describe("DSH control installation", () => {
  test("install writes a signed manifest and a 0600 lease, prints the profile entry, and binds the plugin, transport and DSH", () => {
    const workspace = controlledWorkspace(agentId);
    const result = installHookIntegration({ workspace, provider: "dsh", agentId, mode: "control", dshPackageDir: fakeDsh() });
    expect(result.applied).toBe(true);
    expect(result.limitations.join("\n")).toMatch(/DSH profile plugin entry: .*dsh-amc-plugin.*dshControlClient\.js/);
    const manifest = JSON.parse(readFileSync(join(workspace, ".amc", "hooks", "dsh.json"), "utf8")) as Record<string, unknown>;
    expect(manifest).toMatchObject({ provider: "dsh", mode: "control", pluginSha256, qualifiedDshVersions: ["0.2.1-rc.2", "0.2.1-rc.4"] });
    expect(getHookIntegrationStatus({ workspace, provider: "dsh" }).state).toBe("installed");
  });

  test("observe mode is refused", () => {
    const workspace = controlledWorkspace(agentId);
    expect(() => installHookIntegration({ workspace, provider: "dsh", agentId, mode: "observe" })).toThrow(/control mode only/);
  });

  test("a changed DSH on disk shows as drift", () => {
    const { workspace, dshDir } = installed();
    writeFileSync(join(dshDir, "dist", "index.js"), "export const tampered = true;\n");
    expect(getHookIntegrationStatus({ workspace, provider: "dsh" }).state).toBe("drifted");
  });

  test("remove revokes the lease and removes the installation's files", () => {
    const { workspace } = installed();
    expect(removeHookIntegration({ workspace, provider: "dsh" }).applied).toBe(true);
    for (const file of ["dsh.json", "dsh.json.sig", "dsh.lease"]) expect(existsSync(join(workspace, ".amc", "hooks", file)), file).toBe(false);
    expect(getHookIntegrationStatus({ workspace, provider: "dsh" }).state).toBe("not-installed");
  });
});

describe("DSH session registration and control", () => {
  test("an unregistered session is denied", () => {
    const { workspace } = installed();
    expect(call(workspace, { file_path: publicFile(workspace) }).result).toMatchObject({ decision: "deny",
      reason: expect.stringMatching(/no AMC registration/) });
  });

  test("a registered session of a qualified DSH gets AMC's allow for a mapped read, and the transport accepts only that answer", () => {
    const { workspace } = installed();
    expect(register(workspace)).toMatchObject({ registered: true, provider: "dsh", record: { qualified: true, dshVersion: "0.2.1-rc.2" } });
    const { rawInput, result } = call(workspace, { file_path: publicFile(workspace) });
    expect(result).toMatchObject({ decision: "allow", provider: "dsh" });
    const keys = getPurposeKeyHistory(workspace, "receipt");
    const expected = { agentId, actionId: dshActionId(sessionId, "call-1"), callId: "call-1", requestSha256: sha256Hex(Buffer.from(rawInput, "utf8")) };
    expect(dshControlAnswer(result, expected, keys)).toEqual({ decision: "allow" });
    expect(() => dshControlAnswer(result, { ...expected, requestSha256: "0".repeat(64) }, keys)).toThrow(/not bound/);
    expect(() => dshControlAnswer(result, { ...expected, callId: "call-2" }, keys)).toThrow(/not bound/);
    expect(() => dshControlAnswer({ ...result, decision: "deny" }, expected, keys)).toThrow(/not bound/);
    const forged = { ...result, providerResponse: { ...(result.providerResponse as object), extra: 1 } };
    expect(() => dshControlAnswer(forged, expected, keys)).toThrow(/not bound/);
  });

  test("a registration naming another plugin module, or a DSH version other than the one on disk, is refused", () => {
    const { workspace } = installed();
    expect(() => register(workspace, { pluginSha256: "0".repeat(64) })).toThrow(HookControlError);
    expect(() => register(workspace, { version: "0.2.1-rc.4" })).toThrow(/reports DSH 0\.2\.1-rc\.4/);
    expect(() => register(workspace, { sessionId: "not-a-uuid" })).toThrow(/schema/);
  });

  test("once DSH on disk changes after registration, the session is not governed", () => {
    const { workspace, dshDir } = installed();
    register(workspace);
    writeFileSync(join(dshDir, "dist", "index.js"), "export const tampered = true;\n");
    expect(call(workspace, { file_path: publicFile(workspace) }).result).toMatchObject({ decision: "deny",
      reason: expect.stringMatching(/changed after this session registered/) });
  });

  test("a call naming another qualified DSH version than its session registered is denied", () => {
    const { workspace } = installed();
    register(workspace);
    expect(call(workspace, { file_path: publicFile(workspace) }, "0.2.1-rc.4").result).toMatchObject({ decision: "deny",
      reason: expect.stringMatching(/registered DSH 0\.2\.1-rc\.2/) });
  });

  test("registration needs a signed installation", () => {
    const workspace = controlledWorkspace(agentId);
    expect(() => register(workspace)).toThrow(/signed DSH control installation/);
  });
});
