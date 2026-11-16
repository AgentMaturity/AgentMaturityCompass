import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, test } from "vitest";
import { handleFleetRoute } from "../src/api/fleetRouter.js";
import { resolveApiRolePolicy } from "../src/api/accessPolicy.js";
import { activeFreezeStatus } from "../src/drift/freezeEngine.js";
import { FLEET_AGENT_FROZEN } from "../src/fleet/fleetActions.js";
import { openLedger } from "../src/ledger/ledger.js";
import { freezeFixture } from "./helpers/freezePublicationFixture.js";

function call(workspace: string, method: string, path: string, body: unknown, principal?: string) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
  Object.assign(req, { method, url: path, headers: { "content-type": "application/json" } });
  const out = { status: 0, body: "" };
  const fake = { headersSent: false, writeHead(status: number) { out.status = status; fake.headersSent = true; return fake; }, end(text?: string) { out.body = text ?? ""; } };
  const res = fake as unknown as ServerResponse;
  return handleFleetRoute(path.split("?")[0]!, method, req, res, workspace, () => true, principal).then((handled) => ({ handled, ...out, json: out.body ? JSON.parse(out.body) : null }));
}

describe("freeze now", () => {
  test("the freeze route is an OWNER write; the inventory is a read for every signed-in person", () => {
    expect(resolveApiRolePolicy("/api/v1/fleet/freeze", "POST").roles).toEqual(["OWNER"]);
    expect(resolveApiRolePolicy("/api/v1/fleet/inventory", "GET").roles).toContain("VIEWER");
  });

  test("a GET never freezes, a request with no named person is refused, and a freeze writes a signed incident and an audit row", async () => {
    const f = freezeFixture();
    const get = await call(f.workspace, "GET", "/api/v1/fleet/freeze?agentId=default&reason=x", undefined, "owner-a");
    expect(get.handled).toBe(false);
    const anonymous = await call(f.workspace, "POST", "/api/v1/fleet/freeze", { agentId: "default", reason: "refunds" });
    expect(anonymous.status).toBe(403);
    expect(activeFreezeStatus(f.workspace, "default").active).toBe(false);

    const frozen = await call(f.workspace, "POST", "/api/v1/fleet/freeze", { agentId: "default", reason: "unexpected refunds" }, "owner-a");
    expect(frozen.status, frozen.body).toBe(201);
    expect(frozen.json.data.scope).toContain("stops only calls that are routed through AMC");
    expect(frozen.json.data.lift).toContain("amc freeze lift");
    const status = activeFreezeStatus(f.workspace, "default");
    expect(status.active).toBe(true);
    expect(status.incidentIds).toContain(frozen.json.data.incidentId);

    const ledger = openLedger(f.workspace, { readonly: true });
    try {
      const row = ledger.getAllEvents().find((event) => event.id === frozen.json.data.auditEventId)!;
      expect(JSON.parse(row.meta_json)).toMatchObject({ auditType: FLEET_AGENT_FROZEN, agentId: "default" });
      expect(JSON.parse(row.payload_inline!)).toMatchObject({ frozenBy: "owner-a", via: "studio", reason: "unexpected refunds", incidentId: frozen.json.data.incidentId });
    } finally { ledger.close(); }
  }, 60_000);

  test("an agent that is not registered is not frozen", async () => {
    const f = freezeFixture();
    const result = await call(f.workspace, "POST", "/api/v1/fleet/freeze", { agentId: "../other", reason: "x" }, "owner-a");
    expect(result.status).toBe(400);
    expect(result.json.error).toContain("is not registered");
  }, 60_000);
});
