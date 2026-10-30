import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { sha256Hex } from "../src/utils/hash.js";
import { NativeExtensionManager } from "../src/extensions/nativeExtensionRuntime.js";
import { installNativeExtension, signNativeExtension } from "../src/extensions/nativeExtensionStore.js";
import { discoverNativeMcpCatalog, mountNativeMcpServer, type MountedNativeMcpServer } from "../src/mcp/nativeMcpClient.js";
import { agentToolset } from "../src/agent/agentToolset.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { prepareAcpNativeSession } from "../src/acp/acpNativeSession.js";
import { composeNativePrompt } from "../src/agent/nativeAgentComposition.js";
import { agentPromptProfile } from "../src/prompt/agentPromptProfile.js";
import { bindNativeMcpResourceStatus, projectNativeResourceStatus, type NativeResourceStatus } from "../src/prompt/context/nativeResourceStatus.js";

const directories: string[] = [];
const MCP_SERVER = String.raw`
const input = require('node:readline').createInterface({ input: process.stdin });
input.on('line', line => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  let result;
  if (request.method === 'initialize') result = { protocolVersion: request.params.protocolVersion,
    capabilities: { tools: {} }, serverInfo: { name: 'resource-status-fixture', version: '1' } };
  else if (request.method === 'tools/list') result = { tools: [{ name: 'review', description: 'Review text', inputSchema: { type: 'object' } }] };
  else {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found' } }) + '\n');
    return;
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
});
`;
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function directory(): string {
  const path = realpathSync(mkdtempSync(join(tmpdir(), "amc-resource-status-")));
  directories.push(path);
  return path;
}

function extension() {
  const workspace = directory();
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "native-resource-status-passphrase");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const contentPath = join(workspace, "context.md");
  const content = "PRIVATE_EXTENSION_BODY {{not_a_variable}}";
  writeFileSync(contentPath, content);
  const manifestPath = join(workspace, "extension.json");
  writeFileSync(manifestPath, JSON.stringify({ schemaVersion: 1, id: "reviewer",
    contexts: [{ name: "review", path: "context.md", sha256: sha256Hex(content) }], commands: {} }));
  const digest = sha256Hex(readFileSync(manifestPath));
  signNativeExtension(workspace, manifestPath, digest);
  return { workspace, manifestPath, contentPath, digest, manager: new NativeExtensionManager(workspace) };
}

function mcp() {
  const registry = new ToolRegistry();
  const body = vi.fn(async () => ({ ok: true, output: "never invoked by status" }));
  const toolName = "mcp_fixture_review";
  const define = () => registry.define({ name: toolName, actionClass: "READ_ONLY", description: "Reviewed tool", body }, "owner");
  const remove = define();
  const protocol = { negotiatedVersion: "2025-11-25", mode: "legacy" as const, serverInfo: null };
  const mount: MountedNativeMcpServer = {
    catalog: { serverId: "fixture", digest: "a".repeat(64), protocol, tools: [] },
    toolNames: [toolName], receipt: { serverId: "fixture", catalogDigest: "a".repeat(64), protocol, auth: null },
    serverInstructions: { kind: "mcp-server-instructions", serverId: "fixture", text: "PRIVATE_MCP_INSTRUCTIONS", truncated: false },
    diagnostics: vi.fn(() => "PRIVATE_MCP_DIAGNOSTICS"), close: vi.fn(async () => { remove(); })
  };
  return { registry, mount, body, toolName, remove, define };
}

describe("read-only live native resource projection", () => {
  it("returns unknown resources after disposing a standalone prompt", () => {
    const observed = { extensions: [], mcp: [], skills: null };
    const prompt = composeNativePrompt(agentPromptProfile({ workspace: directory(), agentId: "default", contextPlugins: [] }),
      { resourceStatus: () => observed });
    expect(prompt.resourceStatus()).toEqual(observed);
    prompt.dispose();
    expect(prompt.resourceStatus()).toEqual({ extensions: null, mcp: null, skills: null });
  });

  it("keeps unbound hosts unknown rather than claiming empty live inventories", () => {
    expect(projectNativeResourceStatus({})).toMatchObject({ extensions: null, mcp: null, skills: null });
  });

  it("distinguishes a bound empty host from an unobserved host", () => {
    const status = projectNativeResourceStatus({ extensions: new NativeExtensionManager(directory()), mcp: [], skillRoots: [] });
    expect(status.extensions).toEqual([]);
    expect(status.mcp).toEqual([]);
    expect(status.skills).toMatchObject({ entries: [], problems: [], loaded: null, completeness: "unknown" });
  });

  it("follows actual extension load and unload without activating installed copies", () => {
    const f = extension();
    installNativeExtension(f.workspace, f.manifestPath, f.digest);
    const read = () => projectNativeResourceStatus({ extensions: f.manager });
    expect(read().extensions).toEqual([]);
    f.manager.load(f.manifestPath);
    expect(read().extensions).toEqual([{ id: "reviewer", manifestPath: f.manifestPath, manifestDigest: f.digest,
      state: "loaded", failureCode: null, execution: "not-evaluated" }]);
    expect(JSON.stringify(read())).not.toContain("PRIVATE_EXTENSION_BODY");
    f.manager.unload("reviewer");
    expect(read().extensions).toEqual([]);
  });

  it("reports changed loaded bytes as unavailable without changing the runtime load", () => {
    const f = extension();
    f.manager.load(f.manifestPath);
    writeFileSync(f.contentPath, "changed after admission");
    const signature = readFileSync(`${f.manifestPath}.sig`, "utf8");
    const status = projectNativeResourceStatus({ extensions: f.manager });
    expect(status.extensions?.[0]).toMatchObject({ id: "reviewer", state: "unavailable", execution: "not-evaluated" });
    expect(status.extensions?.[0]?.failureCode).toBeTruthy();
    expect(f.manager.list()).toHaveLength(1);
    expect(readFileSync(`${f.manifestPath}.sig`, "utf8")).toBe(signature);
    expect(JSON.stringify(status)).not.toContain("changed after admission");
  });

  it("keeps a loaded extension's reviewed digest even after a replacement is signed", () => {
    const f = extension();
    f.manager.load(f.manifestPath);
    writeFileSync(f.manifestPath, `${readFileSync(f.manifestPath, "utf8")}\n`);
    const replacement = sha256Hex(readFileSync(f.manifestPath));
    signNativeExtension(f.workspace, f.manifestPath, replacement);
    expect(projectNativeResourceStatus({ extensions: f.manager }).extensions?.[0])
      .toMatchObject({ manifestDigest: f.digest, state: "unavailable" });
  });

  it("tracks this mount's exact live registrations across close and same-name replacement", () => {
    const f = mcp();
    const source = bindNativeMcpResourceStatus(f.mount, f.registry, "owner");
    const read = () => projectNativeResourceStatus({ mcp: [source] });
    expect(read().mcp?.[0]).toMatchObject({ serverId: "fixture", catalogDigest: "a".repeat(64), state: "registered" });
    f.remove();
    expect(read().mcp?.[0]?.state).toBe("unavailable");
    f.define();
    expect(read().mcp?.[0]?.state).toBe("unavailable");
    expect(f.body).not.toHaveBeenCalled();
    expect(f.mount.close).not.toHaveBeenCalled();
    expect(f.mount.diagnostics).not.toHaveBeenCalled();
    expect(JSON.stringify(read())).not.toContain("PRIVATE_MCP");
  });

  it("observes the real stdio MCP mount's registration disposal", async () => {
    const workspace = directory();
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "native-resource-status-passphrase");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const toolset = agentToolset({ workspace, agentId: "default", sessionId: "resource-status-mcp" });
    const server = { id: "fixture", command: process.execPath, args: ["-e", MCP_SERVER], timeoutMs: 2_000 };
    let mount: MountedNativeMcpServer | undefined;
    try {
      const catalog = await discoverNativeMcpCatalog(server, workspace);
      mount = await mountNativeMcpServer({ server, workspace, agentId: "default", toolset,
        expectedCatalogDigest: catalog.digest, grants: [{ name: "review", actionClass: "READ_ONLY" }] });
      const source = bindNativeMcpResourceStatus(mount, toolset.registry, "default");
      expect(projectNativeResourceStatus({ mcp: [source] }).mcp?.[0]?.state).toBe("registered");
      await mount.close();
      expect(projectNativeResourceStatus({ mcp: [source] }).mcp?.[0]?.state).toBe("unavailable");
    } finally { try { await mount?.close(); } finally { toolset.close(); } }
  });

  it("does not borrow another agent's MCP registrations", () => {
    const f = mcp();
    const source = bindNativeMcpResourceStatus(f.mount, f.registry, "other-agent");
    expect(projectNativeResourceStatus({ mcp: [source] }).mcp?.[0]?.state).toBe("unavailable");
  });

  it("fails closed for an empty grant set instead of treating every([]) as a live mount", () => {
    const f = mcp();
    const source = bindNativeMcpResourceStatus({ ...f.mount, toolNames: [] }, f.registry, "owner");
    expect(projectNativeResourceStatus({ mcp: [source] }).mcp?.[0]?.state).toBe("unavailable");
  });

  it("does not confuse registered MCP grants with execution approval", () => {
    const f = mcp();
    f.registry.guard("independent-policy", () => "not approved", "owner");
    const source = bindNativeMcpResourceStatus(f.mount, f.registry, "owner");
    expect(projectNativeResourceStatus({ mcp: [source] }).mcp?.[0]).toMatchObject({ state: "registered", execution: "not-evaluated" });
    expect(f.body).not.toHaveBeenCalled();
  });

  it("re-reads layered skills while keeping discovered text distinct from loaded context", () => {
    const shared = directory(), local = directory();
    const write = (root: string, body: string, disabled = false) => {
      mkdirSync(join(root, "review"), { recursive: true });
      writeFileSync(join(root, "review", "SKILL.md"), `---\nname: review\ndescription: Review code\n${disabled ? "disable-model-invocation: true\n" : ""}---\n${body}`);
    };
    write(shared, "PRIVATE_SHARED_BODY");
    write(local, "PRIVATE_LOCAL_BODY", true);
    const read = () => projectNativeResourceStatus({ skillRoots: [shared, local] });
    const initial = read();
    expect(initial.skills).toMatchObject({ loaded: null, completeness: "unknown", entries: [{ name: "review", state: "discovered",
      sourcePath: join(local, "review", "SKILL.md"), modelInvocation: false }] });
    expect(JSON.stringify(initial)).not.toContain("PRIVATE_");
    write(local, "NEW_LOCAL_BODY");
    expect(read().skills?.catalogDigest).not.toBe(initial.skills?.catalogDigest);
    writeFileSync(join(local, "review", "SKILL.md"), "invalid skill");
    expect(read().skills?.entries).toEqual([]);
    expect(read().skills?.problems).toEqual([{ name: "review", sourcePath: join(local, "review", "SKILL.md"), state: "unavailable" }]);
  });

  it("binds ACP status to the actual session's skill roots without a model request", async () => {
    const workspace = directory(), home = directory();
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "native-resource-status-passphrase");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    mkdirSync(join(workspace, ".amc", "skills", "local"), { recursive: true });
    writeFileSync(join(workspace, ".amc", "skills", "local", "SKILL.md"), "---\nname: local\ndescription: A local skill\n---\nPRIVATE_LOCAL_BODY");
    mkdirSync(join(home, "skills", "shared"), { recursive: true });
    writeFileSync(join(home, "skills", "shared", "SKILL.md"), "---\nname: shared\ndescription: A shared skill\n---\nPRIVATE_SHARED_BODY");
    const prepare = vi.fn((): never => { throw new Error("Status must not invoke the model"); });
    const session = await prepareAcpNativeSession({
      session: { workspace, sessionId: "resource-status-session", agentId: "default", tools: "none", systemPrompt: "Review carefully.",
        makeLlm: () => ({ prepare }), route: { providerId: "fixture", model: "fixture", params: {} },
        harnessVersion: "test", compositionDigest: "c".repeat(64), policyDigest: "p".repeat(64) },
      credentialsHome: home, signal: new AbortController().signal, onApprovalRaised: () => {}, initiator: "test-operator"
    });
    try {
      const status = (session as typeof session & { resourceStatus?(): NativeResourceStatus }).resourceStatus?.();
      expect(status).toMatchObject({ extensions: null, mcp: [], skills: { loaded: null, entries: [{ name: "local", state: "discovered" }] } });
      expect(status?.skills?.entries.map(skill => skill.name)).toEqual(["local"]);
      expect(prepare).not.toHaveBeenCalled();
    } finally { await session.close(); }
    expect(session.resourceStatus?.()).toEqual({ extensions: null, mcp: null, skills: null });
  });
});
