import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { openLedger } from "../src/ledger/ledger.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { runComposedTurn } from "../src/kernel/agentLoopRunner.js";
import { startAcpStdio } from "../src/acp/acpStdioMain.js";
import { NATIVE_TASK_LEASE_ENV, NATIVE_TASK_SYSTEM_PROMPT_ENV } from "../src/acp/acpRuntimeContracts.js";
import { openAgentSession } from "../src/agent/agentSession.js";
import { COMPOSITION_FAILED } from "../src/agent/nativeAgentComposition.js";
import { AgentDriver } from "../src/agent/agentDriver.js";
import { readAgentRunSummary } from "../src/agent/runReport.js";
import { STUB_PROVIDER_ID, STUB_PROVIDER_MODEL, stubProviderRoute, stubProviderTransport } from "../src/agent/stubProvider.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { bodyFromChunks, type HttpResponse, type HttpTransport } from "../src/llm/adapter/transport.js";
import { credentialRef } from "../src/credentials/credentialRef.js";
import { SessionService } from "../src/session/sessionService.js";
import { AMCNativeClient } from "../src/sdk/nativeAgentClient.js";
import { createNativeTaskService } from "../src/studio/nativeTaskService.js";
import { NATIVE_DEFAULT_SYSTEM_PROMPT } from "../src/studio/nativeTaskContext.js";
import type { EvidenceEvent } from "../src/types.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, textStep } from "./helpers/agentLoopHarness.js";

/**
 * GAP-WP39: every native surface composes its agent through one path, so the
 * workspace's instruction files, the time context and the governance section
 * reach the model on ACP, Studio native tasks and the SDK exactly as on
 * `amc agent-loop`; a composition that throws never closes as `completed`; and a
 * retry re-sends on the adapter its step pinned.
 */

const RULE = "Never force-push to main without a second reviewer.";
const dirs: string[] = [];
let home = "";

beforeEach(() => {
  process.env["AMC_VAULT_PASSPHRASE"] ??= "native-agent-composition-pass";
  home = realpathSync(mkdtempSync(join(tmpdir(), "amc-wp39-home-")));
  dirs.push(home);
  // One user scope for every surface, so only the workspace's own AGENTS.md is in view.
  vi.stubEnv("AMC_HOME", home);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function workspace(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-wp39-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(dir, "default");
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  writeFileSync(join(dir, "AGENTS.md"), `# House rules\n\n${RULE}\n`);
  return dir;
}

function rows(dir: string, sessionId: string): EvidenceEvent[] {
  const ledger = openLedger(dir);
  try { return ledger.getAllEvents().filter(event => event.session_id === sessionId); } finally { ledger.close(); }
}

function text(dir: string, row: EvidenceEvent): string {
  const read = readEventPayload(dir, row);
  if (read.status !== "ok") throw new Error(`payload ${read.status}`);
  return read.bytes.toString("utf8");
}

/** What a surface's session recorded: its system prompt and every user-role message. */
function recorded(dir: string, sessionId: string): { systemPrompt: string; userMessages: string[]; closeReason: unknown } {
  const all = rows(dir, sessionId);
  const prompt = all.find(row => row.event_type === "system/prompt");
  const close = all.find(row => row.event_type === "session/close");
  return {
    systemPrompt: prompt === undefined ? "" : text(dir, prompt),
    userMessages: all.filter(row => row.event_type === "user/message").map(row => text(dir, row)),
    closeReason: close === undefined ? undefined : (JSON.parse(close.meta_json) as { reason?: unknown }).reason
  };
}

/** One prompt over a real in-memory ACP stdio connection, on the stub provider. */
async function acpTurn(dir: string, systemPrompt: string, leaseToken?: string): Promise<string> {
  const stdin = new EventEmitter();
  const frames: { id?: number; result?: { sessionId?: string }; error?: unknown }[] = [];
  const handle = startAcpStdio({ workspace: dir, agentId: "default", providerId: STUB_PROVIDER_ID, systemPrompt, tools: "none",
    credentialsMode: "operator-only", credentialsHome: join(dir, "empty-home"), ...(leaseToken === undefined ? {} : { leaseToken }),
    stdin, stdout: { write: bytes => { frames.push(JSON.parse(bytes.toString("utf8")) as (typeof frames)[number]); return true; } },
    stderr: { write: () => true } });
  const call = async (id: number, method: string, params: unknown) => {
    stdin.emit("data", Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"));
    await vi.waitFor(() => expect(frames.find(frame => frame.id === id)).toBeDefined(), { timeout: 10_000 });
    const frame = frames.find(candidate => candidate.id === id)!;
    expect(frame.error, method).toBeUndefined();
    return frame;
  };
  try {
    await call(1, "initialize", { protocolVersion: 1, clientCapabilities: {} });
    const sessionId = (await call(2, "session/new", { cwd: dir, mcpServers: [] })).result!.sessionId!;
    await call(3, "session/prompt", { sessionId, prompt: [{ type: "text", text: "hello" }] });
    return sessionId;
  } finally { await handle.close(); }
}

async function agentLoopTurn(dir: string, persona: string, sessionId = randomUUID()): Promise<string> {
  const outcome = await runComposedTurn({ workspace: dir, agentId: "default", sessionId, prompt: "hello",
    promptProfile: { persona },
    route: { providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL, params: { max_tokens: 256, stream: true } },
    routes: [stubProviderRoute()], transport: stubProviderTransport(),
    credentials: { homeDir: join(dir, "empty-home"), env: {}, watch: false, projectDir: null } });
  return outcome.sessionId;
}

function sdkSession(dir: string, systemPrompt: string, route = { providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL }) {
  const registry = new AdapterRegistry();
  registry.register(stubProviderRoute());
  return openAgentSession({ workspace: dir, agentId: "default", tools: "none", systemPrompt,
    makeLlm: session => new LlmRuntime({ session, credentials: new FixedCredentials(), registry, transport: stubProviderTransport() }),
    route: { ...route, params: { max_tokens: 256, stream: true } },
    harnessVersion: "test", compositionDigest: "c".repeat(64), policyDigest: "p".repeat(64) });
}

async function sdkTurn(dir: string, systemPrompt: string): Promise<string> {
  const session = sdkSession(dir, systemPrompt);
  try {
    const result = await session.prompt("hello");
    expect(result.ok, result.ok ? "" : result.reason).toBe(true);
  } finally { await session.close(); }
  return session.sessionId;
}

/** What Studio hands the `amc acp` child for a native task, captured before any process starts. */
async function studioChild(dir: string): Promise<{ systemPrompt: string; leaseToken?: string }> {
  const operatorHome = join(dir, "operator-home");
  mkdirSync(operatorHome, { mode: 0o700 });
  const start = vi.spyOn(AMCNativeClient, "start").mockRejectedValue(new Error("fixture: no child process is started"));
  const service = createNativeTaskService({ workspace: dir, credentialsHome: operatorHome,
    environment: { HOME: operatorHome, PATH: process.env.PATH, AMC_VAULT_PASSPHRASE: process.env["AMC_VAULT_PASSPHRASE"] } });
  try {
    await service.start({ principalId: "wp39-operator", agentId: "default", demo: true },
      { clientRequestId: randomUUID(), agentId: "default", provider: "stub", tools: "none", prompt: "hello" });
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  } finally { await service.close(); }
  const env = start.mock.calls[0]![0].env ?? {};
  // `amc acp` (src/acp/acpCli.ts): Studio's composed prompt when it sent one, else the child's default.
  const lease = env[NATIVE_TASK_LEASE_ENV];
  return { systemPrompt: env[NATIVE_TASK_SYSTEM_PROMPT_ENV] ?? NATIVE_DEFAULT_SYSTEM_PROMPT, ...(lease ? { leaseToken: lease } : {}) };
}

describe("one composition for every native surface", () => {
  it("an ACP turn carries the workspace AGENTS.md context", async () => {
    const dir = workspace();
    const sessionId = await acpTurn(dir, NATIVE_DEFAULT_SYSTEM_PROMPT);
    const { userMessages, systemPrompt } = recorded(dir, sessionId);
    expect(userMessages[0]).toBe("hello");
    const context = userMessages.slice(1).join("\n");
    expect(context).toContain(RULE);
    expect(context).toContain("AGENTS.md");
    // The governance section tells the model how that snapshot works; the caller's prompt is the persona.
    expect(systemPrompt).toContain("How this deployment is governed");
    expect(systemPrompt).toContain(NATIVE_DEFAULT_SYSTEM_PROMPT);
  }, 30_000);

  it("agent-loop, ACP, Studio and the SDK record identical prompt sections and the same context", async () => {
    const dir = workspace();
    const studio = await studioChild(dir);
    const persona = studio.systemPrompt;
    const surfaces = {
      "agent-loop": await agentLoopTurn(dir, persona),
      acp: await acpTurn(dir, persona),
      studio: await acpTurn(dir, studio.systemPrompt, studio.leaseToken),
      sdk: await sdkTurn(dir, persona)
    };
    const seen = Object.fromEntries(Object.entries(surfaces).map(([surface, sessionId]) => [surface, recorded(dir, sessionId)]));
    const reference = seen["agent-loop"]!;
    expect(reference.systemPrompt).toContain(persona);
    for (const [surface, record] of Object.entries(seen)) {
      // The rendered system prompt IS its sections, in order: identity, governance, persona.
      expect(record.systemPrompt, surface).toBe(reference.systemPrompt);
      expect(record.userMessages.slice(1).join("\n"), surface).toContain(RULE);
      expect(record.closeReason, surface).toBe("completed");
    }
  }, 60_000);
});

describe("a composition that throws is not a completed session", () => {
  it("agent-loop: an unknown route rejects and closes the session composition_failed", async () => {
    const dir = workspace();
    const sessionId = randomUUID();
    await expect(runComposedTurn({ workspace: dir, agentId: "default", sessionId, prompt: "hello",
      route: { providerId: "no-such-provider", model: "m", params: {} },
      routes: [stubProviderRoute()], transport: stubProviderTransport(),
      credentials: { homeDir: join(dir, "empty-home"), env: {}, watch: false, projectDir: null } })).rejects.toThrow(/no route is registered/);
    const record = recorded(dir, sessionId);
    expect(record.closeReason).toBe(COMPOSITION_FAILED);
    expect(rows(dir, sessionId).some(row => row.event_type === "turn/start")).toBe(false);
  }, 30_000);

  it("SDK/ACP session: an unknown route refuses to open and closes composition_failed", async () => {
    const dir = workspace();
    const sessionId = randomUUID();
    const registry = new AdapterRegistry();
    registry.register(stubProviderRoute());
    expect(() => openAgentSession({ workspace: dir, agentId: "default", tools: "none", sessionId, systemPrompt: "s",
      makeLlm: session => new LlmRuntime({ session, credentials: new FixedCredentials(), registry, transport: stubProviderTransport() }),
      route: { providerId: "no-such-provider", model: "m", params: {} },
      harnessVersion: "test", compositionDigest: "c".repeat(64), policyDigest: "p".repeat(64) })).toThrow(/no route is registered/);
    expect(recorded(dir, sessionId).closeReason).toBe(COMPOSITION_FAILED);
  }, 30_000);

  it("a prompt hole closes composition_failed on the SDK path", async () => {
    const dir = workspace();
    const sessionId = randomUUID();
    const registry = new AdapterRegistry();
    registry.register(stubProviderRoute());
    expect(() => openAgentSession({ workspace: dir, agentId: "default", tools: "none", sessionId, systemPrompt: "Hi {{nobody_set_this}}.",
      makeLlm: session => new LlmRuntime({ session, credentials: new FixedCredentials(), registry, transport: stubProviderTransport() }),
      route: { providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL, params: {} },
      harnessVersion: "test", compositionDigest: "c".repeat(64), policyDigest: "p".repeat(64) })).toThrow(/nobody_set_this/);
    expect(recorded(dir, sessionId).closeReason).toBe(COMPOSITION_FAILED);
  }, 30_000);
});

describe("the route is pinned per step, not per retry (D11)", () => {
  it("a registry replacement during the retry backoff does not change the step's adapter", async () => {
    const dir = workspace();
    const session = new SessionService(dir);
    session.open({ agentId: "default", harnessVersion: "test", compositionDigest: "c", policyDigest: "p" });
    const systemPrompt = session.recordSystemPrompt("s");
    const registry = new AdapterRegistry();
    const route = (adapter: ReturnType<typeof scriptedAdapter>) => ({ providerId: LOOP_PROVIDER, adapter,
      baseUrl: "https://api.anthropic.invalid", credentialRef: credentialRef("AMC_LOOP_TEST_KEY"), models: [LOOP_MODEL] });
    registry.register(route(scriptedAdapter([textStep("answered by the pinned adapter")])));
    let dispatches = 0;
    const transport: HttpTransport = async (): Promise<HttpResponse> => (dispatches += 1) === 1
      ? { status: 429, headers: { "content-type": "application/json", "retry-after": "1" }, body: bodyFromChunks(["{}"]) }
      : { status: 200, headers: { "content-type": "text/event-stream" }, body: bodyFromChunks([]) };
    const driver = new AgentDriver({ session, systemPromptEventId: systemPrompt.eventId,
      llm: new LlmRuntime({ session, credentials: new FixedCredentials(), registry, transport }),
      route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 64 } },
      retryRuntime: {
        // The operator hot-swaps the route while this step waits to retry.
        sleep: async () => { registry.replace(route({ ...scriptedAdapter([textStep("answered by the replacement")]), id: "replacement" })); },
        random: () => 0.5
      } });
    driver.followup("hello");
    await driver.whenIdle();
    const summary = readAgentRunSummary(dir, session.sessionId, driver.status);
    session.close({ reason: "completed" });
    expect(dispatches).toBe(2);
    expect(summary.assistantText).toEqual(["answered by the pinned adapter"]);
  }, 30_000);
});
