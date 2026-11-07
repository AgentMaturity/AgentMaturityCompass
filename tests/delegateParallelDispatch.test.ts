import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { SessionService } from "../src/session/sessionService.js";
import { createDriverRunner } from "../src/agent/subagentRunner.js";
import type { SubagentRunContext } from "../src/agent/subagentSpawn.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { ANTHROPIC_CAPABILITIES } from "../src/llm/adapter/providerCapabilities.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport, textStep, toolStepMulti } from "./helpers/agentLoopHarness.js";

/**
 * Parallel delegation from plain `delegate` calls (SH-ORCH-05): two `delegate`
 * calls in ONE model step are dispatched concurrently by the step runner
 * (READ_ONLY tools run in parallel up to `maxParallelToolCalls`), so both
 * children are live at once. Proven with a real driver: the two children
 * rendezvous, which a serial dispatcher could never satisfy.
 */
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); });

function setup(): string {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "delegate-parallel-synthetic-passphrase");
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-delegate-parallel-"))); dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(dir, "default"); writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  const config = loadToolsConfig(dir);
  initToolsConfig(dir, { ...config, tools: { ...config.tools, allowedTools: [...config.tools.allowedTools, { name: "delegate", actionClass: "READ_ONLY" }] } });
  return dir;
}

function llmFor(session: SessionService, scripts: ReturnType<typeof textStep>[]) {
  const scripted = scriptedAdapter(scripts);
  const registry = new AdapterRegistry();
  registry.register({ providerId: LOOP_PROVIDER, baseUrl: "https://fixture.invalid", credentialRef: null, models: [LOOP_MODEL],
    adapter: { ...scripted, capabilities: ANTHROPIC_CAPABILITIES, envelope: input => ({ ...scripted.envelope(input), signal: input.signal }) } });
  return new LlmRuntime({ session, registry, credentials: new FixedCredentials(), transport: silentTransport });
}

describe("two delegate calls in one step", () => {
  test("run concurrently: both children are live before either returns", async () => {
    const workspace = setup();
    const started: string[] = [], outcomes: string[] = [];
    let release!: () => void;
    const bothStarted = new Promise<void>(done => { release = done; });
    let n = 0;
    const runner = createDriverRunner({
      workspace, route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
      systemPrompt: "Delegate.", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture",
      config: { maxStepsPerTurn: 4, maxParallelToolCalls: 10 },
      makeLlm: session => llmFor(session, [
        toolStepMulti([{ id: "d1", name: "delegate", args: '{"runAs":"one","goal":"Count rows."}' },
          { id: "d2", name: "delegate", args: '{"runAs":"two","goal":"Count columns."}' }]),
        textStep("both answered")
      ]),
      grantDelegation: { mintSessionId: () => `grandchild-${++n}`, runner: async (child: SubagentRunContext) => {
        started.push(child.identity.runAs);
        if (started.length === 2) release();
        // A serial dispatcher would never see the second start while the first child waits here.
        const outcome = await Promise.race([bothStarted.then(() => "overlapped"), new Promise<string>(done => setTimeout(() => done("serial"), 3000))]);
        outcomes.push(outcome);
        return { ok: true, text: `${child.identity.runAs}: ${outcome}` };
      } }
    });
    const result = await runner({ childSessionId: "parallel-parent", toolsetAgentId: "default", continuable: false, goal: "Delegate twice.",
      identity: { governedAs: "default", runAs: "child", parent: "default", depth: 1 } });
    expect(result.ok, result.reason).toBe(true);
    expect(started.sort()).toEqual(["one", "two"]);
    expect(outcomes, "the dispatcher ran both delegations at once").toEqual(["overlapped", "overlapped"]);
    expect(result.text).toBe("both answered");
  });
});
