import { copyFileSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import YAML from "yaml";
import { describe, expect, it } from "vitest";
import { openActionJournal, type ActionJournal } from "../../../src/actions/actionJournal.js";
import { loadToolsConfig, signToolsConfig, toolsConfigPath, toolsConfigSigPath } from "../../../src/toolhub/toolhubValidators.js";
import { networkEgressGuard, toolhubAllowlistGuard } from "../../../src/tools/guards/policyGuards.js";
import { toolEvidenceFor } from "../../../src/tools/toolEvidence.js";
import { ToolPipeline } from "../../../src/tools/toolPipeline.js";
import { defineTool, ToolRegistry } from "../../../src/tools/toolRegistry.js";
import type { ActionClass } from "../../../src/types.js";
import { fixturesFor, type L0Fixture } from "./harness.js";
import { newWorkspace } from "./workspaces.js";

/**
 * L0-TOOL-01 and L0-TOOL-04 against the real tool pipeline (P1-14). Each fixture's setup builds a signed tools.yaml in a
 * temp workspace; the call runs through a journaled ToolPipeline with the real guard. The oracle is the denial, the
 * TOOL_CALL_DENIED record, the monitor-signed action_state receipt chain and whether the body ran, never agent text.
 */
type AllowlistSetup = { tool: string; actionClass: ActionClass; listed: string[]; config: string; registered?: false };
type EgressSetup = { tool: string; allowHosts: string[]; url?: string };

/** Adds tools to the signed allowlist of `ws`. */
function signTools(ws: string, tools: Array<{ name: string; actionClass: ActionClass; hosts?: string[] }>): void {
  const config = loadToolsConfig(ws);
  for (const t of tools) {
    config.tools.allowedTools.push({ name: t.name, actionClass: t.actionClass,
      ...(t.hosts ? { allow: { hostAllowlist: t.hosts }, denyByDefault: true } : {}) } as (typeof config.tools.allowedTools)[number]);
  }
  writeFileSync(toolsConfigPath(ws), YAML.stringify(config));
  signToolsConfig(ws);
}

/** Puts the allowlist of `ws` into the state the fixture names, after it was signed. */
function corrupt(ws: string, state: string): void {
  if (state === "signed") return;
  if (state === "edited_after_signing") {
    const config = loadToolsConfig(ws);
    config.tools.allowedTools.push({ name: "fixture.smuggled", actionClass: "WRITE_HIGH" } as (typeof config.tools.allowedTools)[number]);
    writeFileSync(toolsConfigPath(ws), YAML.stringify(config));
  } else if (state === "signature_removed") {
    unlinkSync(toolsConfigSigPath(ws));
  } else if (state === "signed_by_other_workspace") {
    const other = newWorkspace("amc-l0-other-");
    mkdirSync(dirname(toolsConfigPath(other)), { recursive: true });
    copyFileSync(toolsConfigPath(ws), toolsConfigPath(other));
    signToolsConfig(other);
    copyFileSync(toolsConfigSigPath(other), toolsConfigSigPath(ws));
  } else throw new Error(`unknown config state ${state}`);
}

async function run(f: L0Fixture, ws: string, guardLabel: string, guard: ReturnType<typeof toolhubAllowlistGuard>,
  tool: { name: string; actionClass: ActionClass }, args: Record<string, unknown>) {
  let bodyRuns = 0;
  const registry = new ToolRegistry();
  registry.define(defineTool({ name: tool.name, actionClass: tool.actionClass, description: "fixture tool",
    body: () => { bodyRuns += 1; return { output: "ran", effect: "applied" }; } }));
  registry.guard(guardLabel, guard);
  let journal: ActionJournal | undefined;
  const records: ReturnType<typeof toolEvidenceFor> = [];
  const pipeline = new ToolPipeline({ registry, workspace: ws, journal: () => (journal ??= openActionJournal(ws)),
    record: (execution, outcome) => records.push(...toolEvidenceFor(execution, outcome)) });
  const outcome = await pipeline.execute({ name: tool.name, agentId: "default", arguments: args, requestedMode: "EXECUTE" });
  const executionId = outcome.action?.executionId;
  expect(executionId, `${f.ref}: a journaled call has an execution id`).toBeTruthy();
  const chain = journal!.verifyReceiptChain(executionId!);
  const view = journal!.get(executionId!);
  journal!.close();
  return { outcome, bodyRuns, records, chain, view };
}

function assertOutcome(f: L0Fixture, guardLabel: string, r: Awaited<ReturnType<typeof run>>): void {
  const expected = f.envelope.expected;
  expect(r.chain.ok, `${f.ref}: the receipt chain verifies (${r.chain.errors.join("; ")})`).toBe(true);
  const last = r.chain.receipts.at(-1);
  if (expected.result === "allow") {
    expect(r.outcome.ok, JSON.stringify(r.outcome.denied)).toBe(true);
    expect(r.bodyRuns).toBe(1);
    expect(r.view?.state).toBe("completed");
    expect(r.records.some((row) => row.meta?.auditType === "TOOL_CALL_ALLOWED")).toBe(true);
    return;
  }
  expect(r.outcome.ok).toBe(false);
  expect(r.outcome.denied?.stage).toBe("guard");
  expect(r.outcome.denied?.guardLabel).toBe(guardLabel);
  expect(r.bodyRuns, "a denied call never runs its body").toBe(0);
  expect(r.view?.state).toBe("denied");
  expect(last?.reasonCode).toBe(expected.reasonCode);
  const denied = r.records.find((row) => row.meta?.auditType === "TOOL_CALL_DENIED");
  expect(denied?.meta?.denialGuard).toBe(guardLabel);
}

/**
 * A name the registry does not hold, even though the signed allowlist lists it: refused at visibility before any guard or
 * journal sees it. The oracle is the TOOL_CALL_DENIED record the refusal still leaves (P1-78).
 */
async function runUnregistered(f: L0Fixture, ws: string, s: AllowlistSetup): Promise<void> {
  const records: ReturnType<typeof toolEvidenceFor> = [];
  const registry = new ToolRegistry();
  registry.guard("tool-allowlist", toolhubAllowlistGuard(ws));
  const pipeline = new ToolPipeline({ registry, workspace: ws, journal: () => openActionJournal(ws),
    record: (execution, outcome) => records.push(...toolEvidenceFor(execution, outcome)) });
  const outcome = await pipeline.execute({ name: s.tool, agentId: "default", arguments: {}, requestedMode: "EXECUTE", callId: "l0-unregistered" });
  expect(outcome.ok).toBe(false);
  expect(outcome.action, "nothing was journaled for a call that resolved to no tool").toBeUndefined();
  const denied = records.find((row) => row.meta?.auditType === "TOOL_CALL_DENIED");
  expect(denied?.meta).toMatchObject({ toolName: s.tool, agentId: "default", callId: "l0-unregistered", actionClass: null, denialStage: "visibility" });
  expect(`${String(denied?.meta?.denialStage)}_denied`).toBe(f.envelope.expected.reasonCode);
}

describe("L0-TOOL-01 signed tool allowlist (tool-allowlist guard)", () => {
  const fixtures = fixturesFor("tool_allowlist", "L0-TOOL-01");
  it("has fixtures", () => expect(fixtures.length).toBeGreaterThan(1));
  for (const f of fixtures) {
    it(`${f.ref}: ${f.envelope.expected.result} ${f.envelope.expected.reasonCode ?? ""}`, async () => {
      const s = f.envelope.setup as unknown as AllowlistSetup;
      const ws = newWorkspace();
      signTools(ws, s.listed.map((name) => ({ name, actionClass: s.actionClass })));
      corrupt(ws, s.config);
      if (s.registered === false) return runUnregistered(f, ws, s);
      const r = await run(f, ws, "tool-allowlist", toolhubAllowlistGuard(ws), { name: s.tool, actionClass: s.actionClass }, {});
      assertOutcome(f, "tool-allowlist", r);
    });
  }
});

describe("L0-TOOL-04 default-deny network egress (network-egress guard)", () => {
  const fixtures = fixturesFor("egress_guard", "L0-TOOL-04");
  it("has fixtures", () => expect(fixtures.length).toBeGreaterThan(1));
  for (const f of fixtures) {
    it(`${f.ref}: ${f.envelope.expected.result} ${f.envelope.expected.reasonCode ?? ""}`, async () => {
      const s = f.envelope.setup as unknown as EgressSetup;
      const ws = newWorkspace();
      signTools(ws, [{ name: s.tool, actionClass: "NETWORK_EXTERNAL", hosts: s.allowHosts }]);
      const r = await run(f, ws, "network-egress", networkEgressGuard(ws), { name: s.tool, actionClass: "NETWORK_EXTERNAL" },
        s.url === undefined ? {} : { url: s.url });
      assertOutcome(f, "network-egress", r);
    });
  }
});

