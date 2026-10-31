/**
 * P2-37: Studio native tasks load the agent's signed prompt pack and A4 context plugin into the ACP child's system
 * prompt, only when each verifies; a regulated workspace refuses a start on one that does not. Real signed workspaces;
 * the service test doubles only the child client (as tests/cosProduct10NativeTaskService.test.ts does). The last case
 * runs the real `amc acp` child (dist/cli.js) on the stub provider and reads its signed system/prompt row back.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NATIVE_TASK_SYSTEM_PROMPT_ENV } from "../../src/acp/acpRuntimeContracts.js";
import { contextPluginDraft, nativeDeliveryOf, writeContextPlugin } from "../../src/a4/adaptContextPlugin.js";
import { artifactSigPath } from "../../src/lifecycle/artifactSignature.js";
import * as regulatedProfile from "../../src/leases/regulatedProfile.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { readSignedAgentContextPlugin } from "../../src/prompt/agentContextPluginFile.js";
import { buildPromptPackForApi } from "../../src/prompt/promptPackApi.js";
import { promptLatestPackPath } from "../../src/prompt/promptPolicyStore.js";
import { AMCNativeClient } from "../../src/sdk/nativeAgentClient.js";
import { loadNativeTaskContext, NATIVE_DEFAULT_SYSTEM_PROMPT } from "../../src/studio/nativeTaskContext.js";
import * as projection from "../../src/studio/nativeTaskProjection.js";
import { createNativeTaskService } from "../../src/studio/nativeTaskService.js";
import type { NativeTaskService } from "../../src/studio/nativeTaskTypes.js";
import { closeSqlitePool } from "../../src/storage/sqlitePool.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";

const roots: string[] = [];
beforeEach(() => { vi.stubEnv("AMC_VAULT_PASSPHRASE", "p237-synthetic-only"); vi.stubEnv("AMC_SESSION_STORE", "sqlite"); });
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    closeSqlitePool(`ledger:${resolve(root)}:${join(root, ".amc", "evidence.sqlite")}`);
    lockVault(root); rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});
function workspace(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p237-native-")));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}
/** The plugin Adapt Build writes, signed beside it. */
function writePlugin(root: string): { path: string; text: string } {
  const draft = contextPluginDraft({ workspace: root, agentId: "default", projectId: "p237proj", revisionNo: 3, answers: [], clocks: [] });
  writeContextPlugin(root, draft);
  return { path: draft.path, text: (JSON.parse(draft.bytes) as { text: string }).text };
}
const codeOf = (run: () => unknown): string | null => {
  try { run(); return null; } catch (error) { return (error as { code?: string }).code ?? String(error); }
};

describe("the native-task loader (P2-37)", () => {
  test("loads a signed plugin and a verified pack into the system prompt, the pack text per provider", () => {
    const root = workspace();
    expect(loadNativeTaskContext({ workspace: root, agentId: "default", provider: "stub", regulated: true })).toEqual({ systemPrompt: null, loaded: [], skipped: [] });
    const plugin = writePlugin(root);
    expect(readSignedAgentContextPlugin(root, "default")).toMatchObject({ status: "verified", plugin: { source: "a4:p237proj@r3" } });
    const pluginOnly = loadNativeTaskContext({ workspace: root, agentId: "default", provider: "stub", regulated: true });
    expect(pluginOnly.systemPrompt).toBe(`${NATIVE_DEFAULT_SYSTEM_PROMPT}\n\n${plugin.text}`);
    expect(pluginOnly.loaded).toEqual([expect.stringMatching(/^context-plugin:[0-9a-f]{64}@a4:p237proj@r3$/)]);
    const pack = buildPromptPackForApi({ workspace: root, agentId: "default" });
    const anthropic = loadNativeTaskContext({ workspace: root, agentId: "default", provider: "anthropic", regulated: true });
    expect(anthropic.systemPrompt).toBe(`${pack.providerFiles.anthropic.system}\n\n${plugin.text}`);
    expect(anthropic.loaded[0]).toMatch(/^prompt-pack:[0-9a-f]{64}$/);
    expect(loadNativeTaskContext({ workspace: root, agentId: "default", provider: "openai", regulated: false }).systemPrompt)
      .toBe(`${pack.providerFiles.openai.systemMessage}\n\n${plugin.text}`);
  });

  test("a plugin without its signature, or changed after signing, is not loaded; a regulated workspace refuses the start", () => {
    const root = workspace();
    const plugin = writePlugin(root);
    rmSync(artifactSigPath(plugin.path));
    expect(readSignedAgentContextPlugin(root, "default")).toMatchObject({ status: "unverified", reason: "signature missing" });
    const open = loadNativeTaskContext({ workspace: root, agentId: "default", provider: "stub", regulated: false });
    expect(open).toMatchObject({ systemPrompt: null, loaded: [] });
    expect(open.skipped[0]).toContain("A4 context plugin is not signed or does not verify");
    expect(codeOf(() => loadNativeTaskContext({ workspace: root, agentId: "default", provider: "stub", regulated: true }))).toBe("NATIVE_AGENT_CONTEXT_UNVERIFIED");

    const changed = workspace();
    const signed = writePlugin(changed);
    // A consistent forgery: new text with its own sha256, so only the artifact signature can tell.
    const body = JSON.parse(readFileSync(signed.path, "utf8")) as { text: string; sha256: string };
    body.text = body.text.replace("not stated", "stated by an attacker");
    body.sha256 = sha256Hex(body.text);
    writeFileSync(signed.path, `${JSON.stringify(body, null, 2)}\n`);
    expect(readSignedAgentContextPlugin(changed, "default").status).toBe("unverified");
    expect(codeOf(() => loadNativeTaskContext({ workspace: changed, agentId: "default", provider: "stub", regulated: true }))).toBe("NATIVE_AGENT_CONTEXT_UNVERIFIED");
  });

  test("a prompt pack that does not verify is not loaded, and refuses the start in a regulated workspace", () => {
    const root = workspace();
    buildPromptPackForApi({ workspace: root, agentId: "default" });
    writeFileSync(`${promptLatestPackPath(root, "default")}.sha256`, `${"0".repeat(64)}\n`);
    const open = loadNativeTaskContext({ workspace: root, agentId: "default", provider: "stub", regulated: false });
    expect(open).toMatchObject({ systemPrompt: null, loaded: [] });
    expect(open.skipped[0]).toContain("prompt pack does not verify");
    expect(codeOf(() => loadNativeTaskContext({ workspace: root, agentId: "default", provider: "stub", regulated: true }))).toBe("NATIVE_AGENT_CONTEXT_UNVERIFIED");
  });
});

describe("Studio's native task start hands the composed prompt to the child (P2-37)", () => {
  const services: NativeTaskService[] = [];
  afterEach(async () => { for (const service of services.splice(0)) await service.close(); });
  function service(root: string): NativeTaskService {
    const home = join(root, "operator-home"); mkdirSync(home, { mode: 0o700 });
    const result = createNativeTaskService({ workspace: root, credentialsHome: home, credentialsFile: join(home, "credentials.yaml"),
      environment: { HOME: home, PATH: process.env.PATH, AMC_VAULT_PASSPHRASE: "p237-synthetic-only", [NATIVE_TASK_SYSTEM_PROMPT_ENV]: "ambient never passed" } });
    services.push(result); return result;
  }
  function doubleChild() {
    vi.spyOn(projection, "readNativeTaskProjection").mockImplementation(() => ({ history: { status: "authenticated", backend: "sqlite", headEventHash: "a".repeat(64),
      eventCount: 1, message: "synthetic" }, storeHeadEventHash: "a".repeat(64), validation: { status: "not-requested", turn: null, configSha256: null, checks: [] },
      validationOutputs: [], events: [], nextCursor: 0, firstCursor: 1, droppedEvents: 0, ending: null, endingId: null, closed: false, approvals: [], approvalError: null }) as never);
    const session = { sessionId: "p237-synthetic-session", prompt: vi.fn(() => ({ result: Promise.resolve(), cancel: vi.fn() })), release: vi.fn(async () => {}) };
    return vi.spyOn(AMCNativeClient, "start").mockImplementation(async () => ({ capabilities: {}, processClosed: false, session,
      newSession: vi.fn(async () => session), close: vi.fn(async () => {}) }) as unknown as AMCNativeClient);
  }
  const request = () => ({ clientRequestId: randomUUID(), agentId: "default", provider: "stub" as const, tools: "none" as const, prompt: "hello" });
  const actor = { principalId: "p237:operator", agentId: "default", demo: false };

  test("the child's environment carries the plugin, never an ambient value", async () => {
    const root = workspace();
    const plugin = writePlugin(root);
    const start = doubleChild();
    await service(root).start(actor, request());
    const env = start.mock.calls[0]![0].env!;
    expect(env[NATIVE_TASK_SYSTEM_PROMPT_ENV]).toBe(`${NATIVE_DEFAULT_SYSTEM_PROMPT}\n\n${plugin.text}`);
  });

  test("in a regulated workspace an unsigned plugin refuses the start before any child is spawned", async () => {
    const root = workspace();
    rmSync(artifactSigPath(writePlugin(root).path));
    vi.spyOn(regulatedProfile, "regulatedLeaseProfile").mockReturnValue({ regulated: true, maxLeaseTtlMs: null, verified: true });
    const start = doubleChild();
    const task = await service(root).start(actor, request());
    expect(task).toMatchObject({ state: "failed", sessionId: null });
    expect(task.error).toContain("A4 context plugin is not signed or does not verify");
    expect(start).not.toHaveBeenCalled();
  });
});

describe("the real ACP child records the composed prompt, and Review finds it (P2-37)", () => {
  test("a stub native session's signed system/prompt row carries the plugin text; nativeDeliveryOf reads it", async () => {
    const root = workspace();
    const plugin = writePlugin(root);
    const client = await AMCNativeClient.start({ workspace: root, provider: "stub", agentId: "default", tools: "none", command: [process.execPath, resolve("dist/cli.js")],
      env: { AMC_VAULT_PASSPHRASE: "p237-synthetic-only", AMC_SESSION_STORE: "sqlite", [NATIVE_TASK_SYSTEM_PROMPT_ENV]: `${NATIVE_DEFAULT_SYSTEM_PROMPT}\n\n${plugin.text}` },
      timeoutMs: 60_000 });
    let sessionId: string;
    try {
      const session = await client.newSession();
      sessionId = session.sessionId;
      await session.prompt("hello").result;
    } finally {
      await client.close();
    }
    const ledger = openLedger(root, { readonly: true });
    try {
      expect(nativeDeliveryOf(ledger, "default", plugin.text)).toMatchObject({ status: "loaded", sessionId });
      expect(nativeDeliveryOf(ledger, "default", `${plugin.text} and more`)).toEqual({ status: "not_found" });
      expect(nativeDeliveryOf(ledger, "another-agent", plugin.text)).toEqual({ status: "not_found" });
    } finally {
      ledger.close();
    }
  }, 120_000);
});
