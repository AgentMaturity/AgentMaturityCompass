import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, test, vi } from "vitest";
import { handleFleetRoute } from "../src/api/fleetRouter.js";
import { activeFreezeStatus } from "../src/drift/freezeEngine.js";
import { FLEET_AGENT_FROZEN, FREEZE_SCOPE_NOTE, TIME_OVERLAP_NOTE, addObservedAgent, freezeAgentNow, setAgentOwner } from "../src/fleet/fleetActions.js";
import { agentAddFromObserved, fleetStatusExtras, fleetTagOwner, fleetTrustReceipts } from "../src/fleet/fleetCli.js";
import { buildFleetInventory } from "../src/fleet/inventory.js";
import { buildAgentConfig, loadAgentConfig, scaffoldAgent } from "../src/fleet/registry.js";
import { addDelegationEdge } from "../src/fleet/trustComposition.js";
import { openLedger } from "../src/ledger/ledger.js";
import { setMode } from "../src/mode/mode.js";
import { freezeFixture } from "./helpers/freezePublicationFixture.js";

function addAgent(workspace: string, agentId: string): void {
  scaffoldAgent(workspace, buildAgentConfig({
    agentId, agentName: `Agent ${agentId}`, role: "assistant", domain: "general", primaryTasks: ["support"], stakeholders: ["ops"],
    riskTier: "med", templateId: "openai", baseUrl: "https://api.openai.com", routePrefix: "/openai", auth: { type: "none" }
  }));
}

/** A call from an agent AMC saw in its records, under a name nobody registered. */
function observe(workspace: string, agentId: string): void {
  const ledger = openLedger(workspace);
  try {
    ledger.appendEvidence({ sessionId: "fleet-observed", runtime: "gateway", eventType: "llm_request", payload: "{}", inline: true, meta: { agentId } });
  } finally { ledger.close(); }
}

function capture() {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  return {
    text: () => log.mock.calls.map((call) => call.map(String).join(" ")).join("\n"),
    written: () => write.mock.calls.map((call) => String(call[0])).join(""),
    reset: () => { log.mockClear(); write.mockClear(); }
  };
}

function auditRow(workspace: string, eventId: string): { meta: Record<string, unknown>; payload: Record<string, unknown> } {
  const ledger = openLedger(workspace, { readonly: true });
  try {
    const row = ledger.getAllEvents().find((event) => event.id === eventId)!;
    return { meta: JSON.parse(row.meta_json), payload: JSON.parse(row.payload_inline!) };
  } finally { ledger.close(); }
}

function call(workspace: string, method: string, url: string, body: unknown, principal?: string, revalidate: () => boolean = () => true) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
  Object.assign(req, { method, url, headers: { "content-type": "application/json" } });
  const out = { status: 0, body: "", headers: {} as Record<string, string> };
  const fake = {
    headersSent: false,
    setHeader() {},
    writeHead(status: number, headers?: Record<string, string>) { out.status = status; out.headers = headers ?? {}; fake.headersSent = true; return fake; },
    end(text?: string) { out.body = text ?? ""; }
  };
  return handleFleetRoute(url.split("?")[0]!, method, req, fake as unknown as ServerResponse, workspace, revalidate, principal)
    .then((handled) => ({ handled, ...out, json: () => JSON.parse(out.body) }));
}

describe("amc fleet status --freeze and --inventory, in-process", () => {
  test("plain status runs on; a freeze needs a reason; a freeze prints its scope and lift command and names the terminal user", async () => {
    const f = freezeFixture();
    const out = capture();
    expect(await fleetStatusExtras(f.workspace, { window: "30d" })).toBe(false);
    await expect(fleetStatusExtras(f.workspace, { window: "30d", freeze: "default", reason: "  " })).rejects.toThrow("Say why you are freezing the agent");
    expect(activeFreezeStatus(f.workspace, "default").active).toBe(false);

    expect(await fleetStatusExtras(f.workspace, { window: "30d", freeze: "default", reason: "unexpected\nrefunds" })).toBe(true);
    const text = out.text();
    expect(text).toContain("Agent default is frozen.");
    expect(text).toContain(FREEZE_SCOPE_NOTE);
    expect(text).toContain("amc freeze lift --agent default --incident ");
    const status = activeFreezeStatus(f.workspace, "default");
    expect(status.active).toBe(true);
    const auditId = /signed audit row records who froze it and why \(([^)]+)\)/.exec(text)![1]!;
    const audit = auditRow(f.workspace, auditId);
    expect(audit.meta).toMatchObject({ auditType: FLEET_AGENT_FROZEN, agentId: "default" });
    expect(audit.payload).toMatchObject({ via: "cli", reason: "unexpected refunds" });
    expect(String(audit.payload.frozenBy)).toMatch(/at a terminal/);
    expect(status.incidentIds).toContain(audit.payload.incidentId);

    out.reset();
    expect(await fleetStatusExtras(f.workspace, { window: "30d", freeze: "default", reason: "second look", json: true })).toBe(true);
    const json = JSON.parse(out.text());
    expect(json).toMatchObject({ frozen: true, agentId: "default", scope: FREEZE_SCOPE_NOTE });
    expect(json.actionClasses).toEqual(expect.arrayContaining(["WRITE_LOW", "DEPLOY", "DATA_EXPORT"]));
    expect(json.actionClasses).not.toContain("READ_ONLY");
    expect(json.lift).toContain(`--incident ${json.incidentId}`);

    out.reset();
    expect(await fleetStatusExtras(f.workspace, { window: "7d", inventory: true, json: true })).toBe(true);
    const inventory = JSON.parse(out.text());
    expect(inventory.summary.frozen).toBe(1);
    expect(inventory.agents.find((row: { agentId: string }) => row.agentId === "default").freeze.active).toBe(true);
    expect(inventory.lastSeenKnown).toBe(true);
    expect(inventory.costWindow.until - inventory.costWindow.since).toBe(7 * 86_400_000);

    out.reset();
    expect(await fleetStatusExtras(f.workspace, { window: "30d", csv: true })).toBe(true);
    expect(out.written().split("\r\n")[0]).toMatch(/^agent/i);
    expect(out.text()).toBe("");
    await expect(fleetStatusExtras(f.workspace, { window: "1w", inventory: true })).rejects.toThrow(/not a time window/);
  }, 90_000);

  test("freeze now refuses agent mode, a missing reason and an unregistered agent, and writes nothing", async () => {
    const f = freezeFixture();
    await expect(freezeAgentNow({ workspace: f.workspace, agentId: "default", reason: " \t " })).rejects.toThrow("Say why you are freezing the agent");
    await expect(freezeAgentNow({ workspace: f.workspace, agentId: "ghost", reason: "x" })).rejects.toThrow("Agent ghost is not registered");
    await expect(freezeAgentNow({ workspace: f.workspace, agentId: "../default", reason: "x" })).rejects.toThrow("is not registered");
    setMode(f.workspace, "agent");
    await expect(freezeAgentNow({ workspace: f.workspace, agentId: "default", reason: "x" })).rejects.toThrow("blocked in agent mode");
    setMode(f.workspace, "owner");
    expect(activeFreezeStatus(f.workspace, "default").active).toBe(false);
  }, 60_000);
});

describe("owners, observed agents and trust receipts, in-process", () => {
  test("tag --owner signs the new owner; a bad owner or no option is refused; --env alone sets no owner", async () => {
    const f = freezeFixture();
    addAgent(f.workspace, "billing");
    const out = capture();
    expect(() => fleetTagOwner(f.workspace, "billing", {})).toThrow("Give --env <dev|staging|production>");
    fleetTagOwner(f.workspace, "billing", { env: "staging" });
    expect(out.text()).toBe("");
    expect(loadAgentConfig(f.workspace, "billing").owner ?? null).toBeNull();

    fleetTagOwner(f.workspace, "billing", { owner: "  Priya Shah " });
    expect(out.text()).toContain("Agent billing is now owned by Priya Shah");
    expect(out.text()).toMatch(/Signature: .*agent\.config\.yaml\.sig/);
    expect(loadAgentConfig(f.workspace, "billing").owner).toBe("Priya Shah");

    for (const bad of ["", "   ", "x".repeat(201), "Priya\nShah", "bell\u0007"]) {
      expect(() => setAgentOwner(f.workspace, "billing", bad)).toThrow(/Give the owner as a name or team of up to 200 characters/);
    }
    expect(loadAgentConfig(f.workspace, "billing").owner).toBe("Priya Shah");

    const inventory = await buildFleetInventory(f.workspace);
    const row = inventory.agents.find((agent) => agent.agentId === "billing")!;
    expect(row).toMatchObject({ registered: true, owner: "Priya Shah", agentName: "Agent billing" });
    expect(row.missing).not.toContain("an owner");
    expect(inventory.costByOwner.find((entry) => entry.owner === "Priya Shah")!.agents).toBe(1);
  }, 60_000);

  test("an observed agent is added only when AMC has seen it and nobody registered it, with or without an owner", async () => {
    const f = freezeFixture();
    addAgent(f.workspace, "billing");
    await expect(addObservedAgent(f.workspace, "billing")).rejects.toThrow("Agent billing is already registered.");
    await expect(addObservedAgent(f.workspace, "default")).rejects.toThrow("Agent default is already registered.");
    await expect(addObservedAgent(f.workspace, "ghost")).rejects.toThrow("AMC has not seen an agent called ghost");
    await expect(addObservedAgent(f.workspace, "ghost", "")).rejects.toThrow(/Give the owner/);

    observe(f.workspace, "seen-one");
    observe(f.workspace, "seen-two");
    const before = await buildFleetInventory(f.workspace);
    expect(before.unregistered.map((row) => row.agentId)).toEqual(["seen-one", "seen-two"]);
    expect(before.unregistered[0]).toMatchObject({ registered: false, owner: null, freeze: null, budget: null, missing: [] });
    expect(before.unregistered[0]!.lastSeenTs).toEqual(expect.any(Number));
    expect(before.unregistered[0]!.runtimes.map((entry) => entry.runtime)).toContain("gateway");

    const out = capture();
    await agentAddFromObserved(f.workspace, "seen-one", "Ops Team");
    expect(out.text()).toContain("Agent added: seen-one");
    expect(out.text()).toContain("Owner: Ops Team");
    expect(out.text()).toContain("placeholders for its role, tasks and provider");
    out.reset();
    await agentAddFromObserved(f.workspace, "seen-two");
    expect(out.text()).toContain('No owner yet. Name one: amc fleet tag seen-two --owner "<name>"');

    expect(loadAgentConfig(f.workspace, "seen-one").owner).toBe("Ops Team");
    const after = await buildFleetInventory(f.workspace);
    expect(after.unregistered).toEqual([]);
    expect(after.agents.map((row) => row.agentId)).toEqual(expect.arrayContaining(["billing", "seen-one", "seen-two"]));
    expect(after.summary.withoutOwner).toBeGreaterThanOrEqual(2);
  }, 60_000);

  test("trust-receipts: no delegations says so; a declared delegation prints the overlap note and a count", () => {
    const f = freezeFixture();
    addAgent(f.workspace, "billing");
    const out = capture();
    expect(() => fleetTrustReceipts(f.workspace, "forever")).toThrow(/not a time window/);
    fleetTrustReceipts(f.workspace, "30d");
    expect(out.text()).toContain("No delegations are declared");
    out.reset();
    addDelegationEdge(f.workspace, { fromAgentId: "default", toAgentId: "billing", purpose: "refunds" });
    fleetTrustReceipts(f.workspace, "1h");
    expect(out.text()).toContain(TIME_OVERLAP_NOTE);
    expect(out.text()).toContain("default -> billing: no calls from default in this window");
  }, 60_000);
});

describe("fleet API: authority recheck, inventory formats and freeze status", () => {
  test("a freeze or a lift whose authority no longer holds is refused with 403 and changes nothing", async () => {
    const f = freezeFixture();
    const refused = await call(f.workspace, "POST", "/api/v1/fleet/freeze", { agentId: "default", reason: "refunds" }, "owner-a", () => false);
    expect(refused.status).toBe(403);
    expect(refused.json().error).toContain("no longer permits");
    expect(activeFreezeStatus(f.workspace, "default").active).toBe(false);

    const missing = await call(f.workspace, "POST", "/api/v1/fleet/freeze", { agentId: "default" }, "owner-a");
    expect(missing.status).toBe(400);
    expect(missing.json().error).toContain("agentId and reason are both needed");

    const frozen = await call(f.workspace, "POST", "/api/v1/fleet/freeze", { agentId: "default", reason: "refunds" }, "owner-a");
    expect(frozen.status, frozen.body).toBe(201);
    const incidentId = frozen.json().data.incidentId as string;

    const status = await call(f.workspace, "GET", "/api/v1/fleet/freeze/status?agentId=default", undefined);
    expect(status.json().data).toMatchObject({ agentId: "default", active: true });

    const liftRefused = await call(f.workspace, "POST", "/api/v1/fleet/freeze/lift", { agentId: "default", incidentId, reason: "cleared" }, "owner-a", () => false);
    expect(liftRefused.status).toBe(403);
    expect(liftRefused.json().error).toContain("no longer permits");
    expect(activeFreezeStatus(f.workspace, "default").active).toBe(true);

    const liftIncomplete = await call(f.workspace, "POST", "/api/v1/fleet/freeze/lift", { agentId: "default" }, "owner-a");
    expect(liftIncomplete.status).toBe(400);
    expect(liftIncomplete.json().error).toBe("Required: agentId, incidentId, reason");
  }, 60_000);

  test("agents are listed and read by id, an unknown agent is 404, a graph needs a body, and other paths are not this router's", async () => {
    const f = freezeFixture();
    addAgent(f.workspace, "billing");
    const list = await call(f.workspace, "GET", "/api/v1/fleet/agents", undefined);
    expect(list.status).toBe(200);
    expect(list.json().data.agents.map((agent: { id: string }) => agent.id)).toContain("billing");
    expect(list.json().data.total).toBe(list.json().data.agents.length);

    const one = await call(f.workspace, "GET", "/api/v1/fleet/agents/billing", undefined);
    expect(one.json().data).toMatchObject({ id: "billing", agentName: "Agent billing" });
    const unknown = await call(f.workspace, "GET", "/api/v1/fleet/agents/ghost", undefined);
    expect(unknown.status).toBe(404);

    const graph = await call(f.workspace, "GET", "/api/v1/fleet/graph", undefined);
    expect(graph.json().data).toEqual({ graph: null, ref: null });
    const validate = await call(f.workspace, "GET", "/api/v1/fleet/graph/validate", undefined);
    expect(validate.json().data.validation).toMatchObject({ valid: false, summary: "No typed multi-agent graph has been written." });
    const noGraph = await call(f.workspace, "POST", "/api/v1/fleet/graph", {}, "owner-a");
    expect(noGraph.status).toBe(400);
    expect(noGraph.json().error).toBe("Required: graph");

    expect((await call(f.workspace, "GET", "/api/v1/other", undefined)).handled).toBe(false);
    expect((await call(f.workspace, "PATCH", "/api/v1/fleet/inventory", undefined)).handled).toBe(false);
  }, 60_000);

  test("inventory answers JSON, a CSV file, JSON with the CSV text, and 400 for a window it does not understand", async () => {
    const f = freezeFixture();
    const json = await call(f.workspace, "GET", "/api/v1/fleet/inventory?window=12h", undefined);
    expect(json.status).toBe(200);
    const data = json.json().data;
    expect(data.costWindow.until - data.costWindow.since).toBe(12 * 3_600_000);
    expect(data.freezeScope).toBe(FREEZE_SCOPE_NOTE);
    expect(data.csv).toBeUndefined();

    const csv = await call(f.workspace, "GET", "/api/v1/fleet/inventory?format=csv", undefined);
    expect(csv.status).toBe(200);
    expect(csv.headers["Content-Type"]).toBe("text/csv; charset=utf-8");
    expect(csv.headers["Content-Disposition"]).toContain("amc-fleet-inventory.csv");
    expect(csv.body.split("\r\n")[0]).toMatch(/^agent/i);

    const included = await call(f.workspace, "GET", "/api/v1/fleet/inventory?include=csv", undefined);
    expect(included.json().data.csv).toBe(csv.body);

    const bad = await call(f.workspace, "GET", "/api/v1/fleet/inventory?window=1w", undefined);
    expect(bad.status).toBe(400);
    expect(bad.json().error).toContain("is not a time window");
  }, 60_000);
});
