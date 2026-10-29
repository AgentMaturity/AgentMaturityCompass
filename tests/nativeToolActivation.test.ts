import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { agentToolset } from "../src/agent/agentToolset.js";
import { selectSupportedNativeTools } from "../src/agent/nativeToolCapabilities.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { ANTHROPIC_MESSAGES_ENCODER_ID, canonicalToolSchemaBytes, prepareRequest } from "../src/llm/index.js";
import { discoverNativeMcpCatalog, mountNativeMcpServer, nativeMcpToolName } from "../src/mcp/nativeMcpClient.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { parseRequestHeaderMeta } from "../src/session/requestHeaderMeta.js";
import { forkSession } from "../src/session/sessionResume.js";
import { SessionService } from "../src/session/sessionService.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import { loadNativeMcpConfiguration, requireReviewedNativeMcpGrants } from "../src/setup/nativeMcpConfig.js";
import { loadBlobPlaintext } from "../src/storage/blobs/blobStore.js";
import { defaultToolsConfig, type ToolDefinition as Grant } from "../src/toolhub/toolsSchema.js";
import { initToolsConfig, loadVerifiedToolsConfigSnapshot, toolsConfigPath, toolsConfigSigPath } from "../src/toolhub/toolhubValidators.js";
import type { ToolDefinition } from "../src/tools/toolTypes.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import { initWorkspace } from "../src/workspace.js";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  try { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); }
  finally { vi.restoreAllMocks(); vi.unstubAllEnvs(); }
});

const parameters = { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false };
const deferred = (name = "activation_lookup"): ToolDefinition => ({ name, actionClass: "READ_ONLY", exposure: "deferred",
  description: `Reviewed deferred ${name}`, parameters: structuredClone(parameters), body: () => ({ ok: true, output: "deferred result" }) });
interface SearchResult { name: string; description: string; parameters: Record<string, unknown>; schemaDigestSha256: string }
interface Activation { name: string; schemaDigestSha256: string; revision: number; evidenceRef: string }

function fixture(definitions = [deferred()], options: { mode?: "code"; grants?: Grant[] } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-native-tool-activation-")));
  const workspace = join(root, "project"); mkdirSync(workspace);
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-native-activation-fixture");
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "external-control-checkpoints"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(workspace, "default"); writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  const grants: Grant[] = options.grants ?? definitions.map(({ name, actionClass }) => ({ name, actionClass }));
  const config = defaultToolsConfig();
  config.tools.allowedTools = [{ name: "tool_search", actionClass: "READ_ONLY" }, ...grants];
  initToolsConfig(workspace, config);
  const identity = { agentId: "default", harnessVersion: "activation-fixture", compositionDigest: sha256Hex("activation-fixture"), policyDigest: sha256Hex("fixture-policy") };
  const session = new SessionService(workspace);
  cleanups.push(() => session.disposeWithoutClosing());
  session.open(identity);
  const systemPromptEventId = session.recordSystemPrompt("Synthetic native deferred-tool activation fixture.").eventId;
  session.startTurn({ trigger: "user" }); session.recordUserMessage("Find and activate the reviewed lookup tool."); session.startStep();
  const compose = (owner = session) => {
    const tools = agentToolset({ workspace, agentId: "default", sessionId: owner.sessionId, recorder: owner,
      additionalCapabilities: grants, ...(options.mode ? { mode: options.mode } : {}) });
    cleanups.push(() => tools.close());
    for (const definition of definitions) tools.registry.define(definition);
    return tools;
  };
  const tools = compose();
  let sequence = 0, step = 1;
  const call = async (name: string, args: object, target = tools, owner = session) => {
    const callId = `activation-call-${++sequence}`;
    owner.recordToolCall({ toolCallId: callId, toolName: name, args: JSON.stringify(args), dispatch: "native", parentToken: null });
    const result = await target.seam.execute({ callId, toolName: name, rawArguments: JSON.stringify(args),
      sessionId: owner.sessionId, turn: 1, step, parentToken: null, dispatch: "native", signal: new AbortController().signal });
    owner.recordToolResult({ toolCallId: callId, ...result });
    return result;
  };
  const search = async (query: string, limit = 20) => {
    const result = await call("tool_search", { query, limit });
    expect(result.outcome).toBe("OK");
    return (JSON.parse(String(result.content)) as { tools: SearchResult[] }).tools;
  };
  const activate = ({ name, schemaDigestSha256 }: Pick<SearchResult, "name" | "schemaDigestSha256">, target = tools, owner = session) =>
    call("tool_search", { activate: { name, schemaDigestSha256 } }, target, owner);
  const request = () => prepareRequest(session, { model: "activation-fixture", providerId: "anthropic", encoderId: ANTHROPIC_MESSAGES_ENCODER_ID,
    encoderVersion: 1, params: { max_tokens: 128 }, systemPromptEventId, tools: tools.seam.schemas() });
  return { workspace, session, config, tools, identity, compose, call, search, activate, request,
    names: (target = tools) => target.seam.schemas()?.map(schema => schema.name).sort() ?? [],
    nextStep: () => { session.endStep({ stopReason: "tool_use", usage: null }); session.startStep(); step += 1; },
    activationRows: () => session.readEvents().filter(row => JSON.parse(row.meta_json).auditType === "NATIVE_TOOL_ACTIVATED") };
}

// A separate stdio JSON-RPC process: no shared SDK server, network or provider credentials.
const SERVER = String.raw`
const fs = require('node:fs');
const readline = require('node:readline');
const [statePath, logPath] = process.argv.slice(1);
readline.createInterface({input:process.stdin}).on('line', line => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  let result;
  if (request.method === 'initialize') result = {protocolVersion:request.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'activation-fixture',version:'1'}};
  else if (request.method === 'tools/list') result = {tools:state.tools};
  else if (request.method === 'tools/call') {
    fs.appendFileSync(logPath, JSON.stringify({name:request.params.name,arguments:request.params.arguments})+'\n');
    result = {content:[{type:'text',text:'remote activation result'}]};
  } else result = {};
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\n');
});
`;

describe("native deferred-schema activation", () => {
  test("reviewed MCP discovery activates the next signed native request and policy narrowing still prevents execution", async () => {
    const name = nativeMcpToolName("activation", "lookup");
    const f = fixture([], { grants: [{ name, actionClass: "READ_ONLY" }] });
    const statePath = join(f.workspace, "remote-state.json"), logPath = join(f.workspace, "remote-calls.jsonl");
    writeFileSync(statePath, JSON.stringify({ tools: [{ name: "lookup", description: "Reviewed remote lookup", inputSchema: parameters }] }));
    const server = { id: "activation", command: process.execPath, args: ["-e", SERVER, statePath, logPath], timeoutMs: 2_000 };
    const discovered = await discoverNativeMcpCatalog(server, f.workspace);
    const configPath = join(f.workspace, "reviewed-mcp.json");
    writeFileSync(configPath, JSON.stringify({ schemaVersion: 1, server, expectedCatalogDigest: discovered.digest,
      grants: [{ name: "lookup", actionClass: "READ_ONLY" }] }));
    const reviewed = requireReviewedNativeMcpGrants(loadNativeMcpConfiguration(configPath), f.workspace, "READ_ONLY");
    expect(reviewed.capabilities.map(capability => capability.name)).toEqual([name]);
    const mounted = await mountNativeMcpServer({ server, workspace: f.workspace, agentId: "default", toolset: f.tools,
      expectedCatalogDigest: discovered.digest, grants: [{ name: "lookup", actionClass: "READ_ONLY" }] });
    cleanups.push(() => mounted.close());
    expect(f.names()).toEqual(["tool_search"]);
    const initial = JSON.parse(f.request().toBytes().toString("utf8"));
    expect(initial.tools.map((schema: { name: string }) => schema.name)).toEqual(["tool_search"]);
    const found = (await f.search("lookup")).find(schema => schema.name === name)!;
    expect(found).toBeDefined(); expect(found.schemaDigestSha256).toBe(sha256Hex(canonicalize(parameters)));
    expect(f.names()).toEqual(["tool_search"]); expect(existsSync(logPath)).toBe(false);
    const result = await f.activate(found);
    expect(result.outcome).toBe("OK");
    const activation = (JSON.parse(String(result.content)) as { activation: Activation }).activation;
    expect(activation).toMatchObject({ name, schemaDigestSha256: found.schemaDigestSha256, revision: 1 });
    const rows = f.activationRows(); expect(rows).toHaveLength(1);
    const row = rows[0]!, meta = JSON.parse(row.meta_json);
    expect(activation.evidenceRef).toBe(row.id);
    expect(meta).toMatchObject({ auditType: "NATIVE_TOOL_ACTIVATED", toolName: name, schemaDigestSha256: found.schemaDigestSha256,
      loadoutRevision: activation.revision, sessionId: f.session.sessionId, agentId: "default" });
    expect(meta.catalogDigestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(extractEnvelope(row.meta_json)?.sessionId).toBe(f.session.sessionId);
    expect(row.writer_sig).not.toBe("unsigned"); expect(row.writer_sig).toBeTruthy();
    expect(existsSync(logPath)).toBe(false);
    f.nextStep();
    const offered = f.tools.seam.schemas()!;
    const next = JSON.parse(f.request().toBytes().toString("utf8"));
    expect(next.tools.map((schema: { name: string }) => schema.name)).toContain(name);
    const events = f.session.readEvents(), toolRows = events.filter(event => event.event_type === "request/tools");
    expect(toolRows).toHaveLength(2);
    const committed = toolRows[1]!;
    expect(committed.writer_sig).not.toBe("unsigned");
    const bytes = loadBlobPlaintext(f.workspace, committed.payload_path!).bytes;
    expect(bytes.equals(canonicalToolSchemaBytes(offered))).toBe(true);
    const header = events.filter(event => event.event_type === "request/header").at(-1)!;
    expect(parseRequestHeaderMeta(header.meta_json)).toMatchObject({ toolSchemaEventId: committed.id, toolSchemaSha256: sha256Hex(bytes) });
    expect((await f.call(name, { query: "reviewed execution" })).outcome).toBe("OK");
    const calls = () => readFileSync(logPath, "utf8").trim().split("\n").map(line => JSON.parse(line));
    expect(calls()).toEqual([{ name: "lookup", arguments: { query: "reviewed execution" } }]);
    f.config.tools.allowedTools = [{ name: "tool_search", actionClass: "READ_ONLY" }];
    initToolsConfig(f.workspace, f.config);
    expect(f.names()).not.toContain(name);
    expect((await f.call(name, { query: "revoked execution" })).outcome).toBe("DENIED");
    expect(calls()).toHaveLength(1);
  });

  test("search remains bounded and rejects mixed, missing and malformed activation arguments", async () => {
    const f = fixture();
    const found = (await f.search("activation_lookup", 1))[0]!;
    expect(found.name).toBe("activation_lookup");
    const invalid = [{}, { activate: { name: found.name } }, { activate: { name: found.name, schemaDigestSha256: "A".repeat(64) } },
      { activate: { name: found.name, schemaDigestSha256: "0".repeat(63) } }, { query: "lookup", activate: found },
      { activate: { name: found.name, schemaDigestSha256: found.schemaDigestSha256 }, limit: 1 },
      { query: "lookup", limit: 21 }, { activate: { name: found.name, schemaDigestSha256: found.schemaDigestSha256, extra: true } }];
    for (const args of invalid) expect((await f.call("tool_search", args)).outcome).not.toBe("OK");
    expect(f.names()).toEqual(["tool_search"]); expect(f.activationRows()).toEqual([]);
    expect((await f.call("tool_search", { query: "activation_lookup" })).outcome).toBe("OK");
  });

  test("guessed names, mismatched digests, hidden/code-only tools and absent signed grants cannot load schemas", async () => {
    const hidden = { ...deferred("activation_hidden"), exposure: "hidden" as const };
    const codeOnly = { ...deferred("activation_code_only"), parameters: undefined };
    const ungranted = deferred("activation_ungranted");
    const f = fixture([deferred(), hidden, codeOnly, ungranted], { grants: [
      { name: "activation_lookup", actionClass: "READ_ONLY" }, { name: hidden.name, actionClass: "READ_ONLY" },
      { name: codeOnly.name, actionClass: "READ_ONLY" }
    ] });
    const schema = { name: "activation_lookup", schemaDigestSha256: sha256Hex(canonicalize(parameters)) };
    expect((await f.activate(schema)).outcome).not.toBe("OK");
    const found = (await f.search("activation_lookup")).find(entry => entry.name === schema.name)!;
    expect((await f.activate({ ...found, schemaDigestSha256: "0".repeat(64) })).outcome).not.toBe("OK");
    for (const name of [hidden.name, codeOnly.name, ungranted.name]) {
      expect((await f.search(name)).some(entry => entry.name === name)).toBe(false);
      expect((await f.activate({ ...schema, name })).outcome).not.toBe("OK");
    }
    expect(f.names()).toEqual(["tool_search"]); expect(f.activationRows()).toEqual([]);
  });

  test.each(["restriction", "changed schema"] as const)("a %s after successful search refuses activation", async change => {
    const f = fixture([], { grants: [{ name: "activation_lookup", actionClass: "READ_ONLY" }] });
    const remove = f.tools.registry.define(deferred());
    const found = (await f.search("activation_lookup"))[0]!;
    if (change === "restriction") f.tools.registry.restrict({ deny: new Set([found.name]) }, "default");
    else {
      remove();
      f.tools.registry.define({ ...deferred(), parameters: { ...parameters, required: [] } });
    }
    const result = await f.activate(found);
    expect(result.outcome).toBe("ERROR");
    expect(JSON.parse(String(result.content))).toMatchObject({ error: { code: change === "restriction" ? "UNAUTHORIZED" : "STALE_ACTIVATION" } });
    expect(f.names()).toEqual(["tool_search"]); expect(f.activationRows()).toEqual([]);
  });

  test("an activation audit writer failure leaves the deferred schema absent", async () => {
    const f = fixture(); const found = (await f.search("activation_lookup"))[0]!;
    const record = f.session.recordProjectedEvidence.bind(f.session);
    vi.spyOn(f.session, "recordProjectedEvidence").mockImplementation(row => {
      if (row.meta?.auditType === "NATIVE_TOOL_ACTIVATED") throw new Error("synthetic activation audit write failure");
      return record(row);
    });
    const result = await f.activate(found);
    expect(result.outcome).toBe("ERROR");
    expect(JSON.parse(String(result.content))).toMatchObject({ error: { code: "EVIDENCE_UNAVAILABLE" } });
    expect(f.names()).toEqual(["tool_search"]); expect(f.activationRows()).toEqual([]);
  });

  test.each(["global", "scoped"] as const)("a %s conditional activation survives step disposal but a false admission revokes it", async layer => {
    const name = "activation_conditional";
    const f = fixture([], { grants: [{ name, actionClass: "READ_ONLY" }] });
    let available = true;
    const body = vi.fn(() => ({ ok: true, output: "conditional body must not run during activation" }));
    f.tools.registry.define({ ...deferred(name), available: () => available, body }, layer === "scoped" ? "default" : undefined);
    const prepare = (step: number) => f.tools.registry.prepareStep({ agentId: "default", turn: 1, step, signal: new AbortController().signal });
    let dispose = await prepare(1);
    try {
      const found = (await f.search(name)).find(schema => schema.name === name)!;
      expect(found).toBeDefined(); expect((await f.activate(found)).outcome).toBe("OK");
      expect(f.names()).toContain(name); expect(f.activationRows()).toHaveLength(1);
      dispose();
      expect(f.names()).not.toContain(name);

      f.nextStep(); dispose = await prepare(2);
      expect(f.names()).toContain(name);
      expect(f.activationRows()).toHaveLength(1);
      dispose();

      available = false;
      f.nextStep(); dispose = await prepare(3);
      expect(f.names()).not.toContain(name);
      expect((await f.call(name, { query: "unavailable" })).outcome).toBe("DENIED");
      dispose();

      available = true;
      f.nextStep(); dispose = await prepare(4);
      expect(f.names()).not.toContain(name);
      expect((await f.activate(found)).outcome).not.toBe("OK");
      const rediscovered = (await f.search(name)).find(schema => schema.name === name)!;
      expect((await f.activate(rediscovered)).outcome).toBe("OK");
      expect(f.names()).toContain(name); expect(f.activationRows()).toHaveLength(2);
      expect(body).not.toHaveBeenCalled();
    } finally { dispose(); }
  });

  test("the composition loadout admits at most 20 schemas and repeated activation consumes no additional slot", async () => {
    const definitions = Array.from({ length: 21 }, (_, index) => deferred(`activation_slot_${String(index).padStart(2, "0")}`));
    const f = fixture(definitions);
    let first: SearchResult | undefined;
    for (const [index, definition] of definitions.entries()) {
      const found = (await f.search(definition.name)).find(schema => schema.name === definition.name)!;
      const result = await f.activate(found);
      if (index === 20) {
        expect(result.outcome).toBe("ERROR");
        expect(JSON.parse(String(result.content))).toMatchObject({ error: { code: "LOADOUT_LIMIT" } });
        continue;
      }
      expect(result.outcome).toBe("OK");
      const activation = (JSON.parse(String(result.content)) as { activation: Activation }).activation;
      expect(activation.revision).toBe(index + 1);
      if (index === 0) first = found;
    }
    expect(f.names()).toHaveLength(21); expect(f.names()).not.toContain(definitions[20]!.name);
    await f.search(first!.name);
    const repeated = await f.activate(first!); expect(repeated.outcome).toBe("OK");
    expect((JSON.parse(String(repeated.content)) as { activation: Activation }).activation).toMatchObject({
      name: first!.name, schemaDigestSha256: first!.schemaDigestSha256, revision: 21
    });
    expect(f.names()).toHaveLength(21); expect(f.activationRows()).toHaveLength(21);
  });

  test("new compositions and verified session forks do not inherit searched tools or the parent's loadout", async () => {
    const f = fixture(); const found = (await f.search("activation_lookup"))[0]!;
    expect((await f.activate(found)).outcome).toBe("OK");
    const fresh = f.compose();
    expect(f.names(fresh)).toEqual(["tool_search"]);
    expect((await f.activate(found, fresh)).outcome).not.toBe("OK");
    const fork = forkSession({ workspace: f.workspace, parentSessionId: f.session.sessionId,
      claimant: { pid: process.pid, hostId: "activation-fixture", bootId: "activation-fixture", startedAt: Date.now() }, ...f.identity });
    cleanups.push(() => fork.service.disposeWithoutClosing());
    fork.service.startTurn({ trigger: "user" }); fork.service.startStep();
    const child = f.compose(fork.service);
    expect(f.names(child)).toEqual(["tool_search"]);
    expect((await f.activate(found, child, fork.service)).outcome).not.toBe("OK");
    expect(f.names()).toContain(found.name);
  });

  test("Code Mode keeps deferred capabilities behind its transport after search and activation attempts", async () => {
    const f = fixture([deferred()], { mode: "code" });
    // Native direct calls cannot bypass Code Mode's existing dispatch boundary.
    expect(f.names()).not.toContain("activation_lookup");
    const result = await f.call("tool_search", { activate: { name: "activation_lookup", schemaDigestSha256: sha256Hex(canonicalize(parameters)) } });
    expect(result.outcome).not.toBe("OK");
    expect(f.names()).not.toContain("activation_lookup"); expect(f.activationRows()).toEqual([]);
  });

  test("host-seeded discovery cannot activate a registered tool outside the signed native catalog", async () => {
    const f = fixture([], { grants: [] }), definition = deferred("activation_host_seeded");
    f.tools.registry.define(definition);
    expect(f.names()).toEqual(["tool_search"]);
    // Seed registry discovery after native identity synchronization to isolate native catalog membership.
    f.tools.registry.rememberDiscovery("default", [{ name: definition.name, parameters: definition.parameters! }]);
    expect((await f.activate({ name: definition.name, schemaDigestSha256: sha256Hex(canonicalize(definition.parameters)) })).outcome).not.toBe("OK");
    expect(f.names()).toEqual(["tool_search"]); expect(f.activationRows()).toEqual([]);
  });

  test("a reused native toolset reads the current fork identity and clears both activation and remembered discovery", async () => {
    const definitions = [deferred("activation_dynamic_active"), deferred("activation_dynamic_remembered")];
    const f = fixture(definitions);
    let current = f.session;
    const tools = agentToolset({ workspace: f.workspace, agentId: "default", get sessionId() { return current.sessionId; },
      additionalCapabilities: definitions.map(({ name, actionClass }) => ({ name, actionClass })),
      recorder: {
        assertWritable: () => current.assertDispatchFence(),
        recordProjectedEvidence: row => current.recordProjectedEvidence(row)
      } });
    cleanups.push(() => tools.close());
    for (const definition of definitions) tools.registry.define(definition);
    const search = async (name: string) => {
      const result = await f.call("tool_search", { query: name, limit: 20 }, tools, current);
      expect(result.outcome).toBe("OK");
      return (JSON.parse(String(result.content)) as { tools: SearchResult[] }).tools.find(schema => schema.name === name)!;
    };
    const active = await search(definitions[0]!.name);
    expect((await f.activate(active, tools, current)).outcome).toBe("OK");
    const remembered = await search(definitions[1]!.name);
    expect(remembered).toBeDefined(); expect(f.names(tools)).toContain(active.name);
    const fork = forkSession({ workspace: f.workspace, parentSessionId: f.session.sessionId,
      claimant: { pid: process.pid, hostId: "activation-dynamic-fixture", bootId: "activation-dynamic-fixture", startedAt: Date.now() }, ...f.identity });
    cleanups.push(() => fork.service.disposeWithoutClosing());
    current = fork.service; current.startTurn({ trigger: "user" }); current.startStep();
    expect(f.names(tools)).toEqual(["tool_search"]);
    expect((await f.activate(active, tools, current)).outcome).not.toBe("OK");
    expect((await f.activate(remembered, tools, current)).outcome).not.toBe("OK");
    const fresh = await search(remembered.name);
    expect((await f.activate(fresh, tools, current)).outcome).toBe("OK");
    expect(f.names(tools)).toEqual([remembered.name, "tool_search"].sort());
    const childRows = current.readEvents().filter(row => JSON.parse(row.meta_json).auditType === "NATIVE_TOOL_ACTIVATED");
    expect(childRows).toHaveLength(1);
    expect(JSON.parse(childRows[0]!.meta_json)).toMatchObject({ sessionId: current.sessionId, toolName: remembered.name });
    expect(extractEnvelope(childRows[0]!.meta_json)?.sessionId).toBe(current.sessionId);
    expect(childRows[0]!.writer_sig).not.toBe("unsigned"); expect(f.activationRows()).toHaveLength(1);
  });

  test("a changed signed policy digest revokes activation even when its eligible catalog is unchanged and unpinned", async () => {
    const f = fixture(), found = (await f.search("activation_lookup"))[0]!;
    expect((await f.activate(found)).outcome).toBe("OK");
    const before = loadVerifiedToolsConfigSnapshot(f.workspace), catalogDigest = f.tools.registry.catalogDigest("default");
    f.config.tools.allowedTools.push({ name: "activation_unimplemented_policy_entry", actionClass: "READ_ONLY" });
    initToolsConfig(f.workspace, f.config);
    const after = loadVerifiedToolsConfigSnapshot(f.workspace);
    expect(after.signatureValid).toBe(true); expect(after.digestSha256).not.toBe(before.digestSha256);
    const capabilities = [{ name: found.name, actionClass: "READ_ONLY" as const }];
    expect(selectSupportedNativeTools(after, capabilities)).toEqual(selectSupportedNativeTools(before, capabilities));
    expect(f.tools.registry.catalogDigest("default")).toBe(catalogDigest);
    expect(f.names()).toEqual(["tool_search"]);
    expect((await f.activate(found)).outcome).not.toBe("OK");
    const fresh = (await f.search(found.name)).find(schema => schema.name === found.name)!;
    expect(fresh).toEqual(found);
    expect((await f.activate(fresh)).outcome).toBe("OK"); expect(f.names()).toContain(found.name);
    expect(f.activationRows()).toHaveLength(2);
  });

  test("observing an invalid policy signature clears activation and restoring the original signature cannot revive it", async () => {
    const f = fixture(), found = (await f.search("activation_lookup"))[0]!;
    const configBytes = readFileSync(toolsConfigPath(f.workspace)), signatureBytes = readFileSync(toolsConfigSigPath(f.workspace));
    expect((await f.activate(found)).outcome).toBe("OK");
    writeFileSync(toolsConfigSigPath(f.workspace), "{}");
    expect(loadVerifiedToolsConfigSnapshot(f.workspace).signatureValid).toBe(false);
    expect(f.names()).not.toContain(found.name);
    writeFileSync(toolsConfigPath(f.workspace), configBytes); writeFileSync(toolsConfigSigPath(f.workspace), signatureBytes);
    expect(loadVerifiedToolsConfigSnapshot(f.workspace).signatureValid).toBe(true);
    expect(f.names()).toEqual(["tool_search"]);
    expect((await f.activate(found)).outcome).not.toBe("OK");
    const fresh = (await f.search(found.name)).find(schema => schema.name === found.name)!;
    expect((await f.activate(fresh)).outcome).toBe("OK"); expect(f.names()).toContain(found.name);
    expect(f.activationRows()).toHaveLength(2);
  });

  test("an activation writer that returns no signed evidence reference cannot publish a schema", async () => {
    const name = "activation_missing_reference", f = fixture([], { grants: [{ name, actionClass: "READ_ONLY" }] });
    const tools = agentToolset({ workspace: f.workspace, agentId: "default", sessionId: f.session.sessionId,
      additionalCapabilities: [{ name, actionClass: "READ_ONLY" }], recorder: {
        recordProjectedEvidence: row => row.meta.auditType === "NATIVE_TOOL_ACTIVATED" ? undefined : f.session.recordProjectedEvidence(row)
      } });
    cleanups.push(() => tools.close()); tools.registry.define(deferred(name));
    const result = await f.call("tool_search", { query: name, limit: 20 }, tools);
    expect(result.outcome).toBe("OK");
    const found = (JSON.parse(String(result.content)) as { tools: SearchResult[] }).tools.find(schema => schema.name === name)!;
    const activation = await f.activate(found, tools);
    expect(activation.outcome).toBe("ERROR");
    expect(JSON.parse(String(activation.content))).toMatchObject({ error: { code: "EVIDENCE_UNAVAILABLE" } });
    expect(f.names(tools)).toEqual(["tool_search"]); expect(f.activationRows()).toEqual([]);
  });

  test("native public refusals distinguish empty search and stale activation without disclosing unauthorized tool names", async () => {
    const body = vi.fn(() => ({ ok: true, output: "public refusal fixture must not execute" }));
    const eligible = { ...deferred("activation_public_eligible"), body };
    const hidden = { ...deferred("activation_public_hidden_private"), exposure: "hidden" as const, body };
    const ungranted = { ...deferred("activation_public_ungranted_private"), body };
    const f = fixture([eligible, hidden, ungranted], { grants: [
      { name: eligible.name, actionClass: "READ_ONLY" }, { name: hidden.name, actionClass: "READ_ONLY" }
    ] });
    const empty = await f.call("tool_search", { query: "zzqvnoindexedtermf9d34", limit: 20 });
    expect(empty.outcome).toBe("OK"); expect(JSON.parse(String(empty.content))).toEqual({ tools: [] });
    const digest = sha256Hex(canonicalize(parameters)), names = ["activation_public_unknown_private", hidden.name, ungranted.name];
    const refusals: string[] = [];
    for (const name of names) {
      const result = await f.activate({ name, schemaDigestSha256: digest });
      expect(result.outcome).toBe("ERROR");
      const output = String(result.content), parsed = JSON.parse(output);
      expect(parsed).toEqual({ error: { code: "UNAUTHORIZED", message: expect.any(String) } });
      for (const privateName of names) expect(output).not.toContain(privateName);
      refusals.push(output);
    }
    expect(new Set(refusals).size).toBe(1);
    const undiscovered = await f.activate({ name: eligible.name, schemaDigestSha256: digest });
    expect(undiscovered.outcome).toBe("ERROR");
    expect(JSON.parse(String(undiscovered.content))).toEqual({ error: { code: "STALE_ACTIVATION", message: expect.any(String) } });
    const found = (await f.search(eligible.name)).find(schema => schema.name === eligible.name)!;
    const staleDigest = await f.activate({ ...found, schemaDigestSha256: "0".repeat(64) });
    expect(staleDigest.outcome).toBe("ERROR");
    expect(JSON.parse(String(staleDigest.content))).toEqual({ error: { code: "STALE_ACTIVATION", message: expect.any(String) } });
    expect(f.names()).toEqual(["tool_search"]); expect(f.activationRows()).toEqual([]);
    expect(body).not.toHaveBeenCalled();
  });
});
