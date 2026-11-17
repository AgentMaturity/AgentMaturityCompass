/** Lifting a freeze needs a person: every lift path refuses an agent marker or agent mode, and the freeze still holds. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, test, vi } from "vitest";
import { handleDriftRoute } from "../src/api/driftRouter.js";
import { handleFleetRoute } from "../src/api/fleetRouter.js";
import { freezeLiftCli, freezeLiftCliAsync } from "../src/drift/driftCli.js";
import { activeFreezeStatus, createFreezeIncident, liftFreeze, liftFreezeAsync } from "../src/drift/freezeEngine.js";
import { setMode } from "../src/mode/mode.js";
import { spawnOwnedNode } from "./helpers/ownedNodeGroup.js";
import { freezeFixture, type FreezeFixture } from "./helpers/freezePublicationFixture.js";

type Handler = typeof handleFleetRoute | typeof handleDriftRoute;
async function post(handler: Handler, workspace: string, path: string, body: unknown, guard?: () => boolean) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
  Object.assign(req, { method: "POST", url: path, headers: { "content-type": "application/json" } });
  const out = { status: 0, body: "" };
  const fake = { headersSent: false, setHeader() {}, getHeader() { return undefined; },
    writeHead(status: number) { out.status = status; fake.headersSent = true; return fake; }, end(text?: string) { out.body = text ?? ""; } };
  const extra = handler === handleFleetRoute ? [guard, "owner-a"] as const : [guard] as const;
  await (handler as (...args: unknown[]) => Promise<boolean>)(path, "POST", req, fake as unknown as ServerResponse, workspace, ...extra);
  return { status: out.status, json: out.body ? JSON.parse(out.body) : null };
}

const frozen = (f: FreezeFixture) => createFreezeIncident(f.params()).incidentId;
function stillFrozen(f: FreezeFixture, incidentId: string): void {
  expect(activeFreezeStatus(f.workspace, "default").active).toBe(true);
  expect(existsSync(f.liftPath(incidentId))).toBe(false);
}
const input = (f: FreezeFixture, incidentId: string) => ({ workspace: f.workspace, agentId: "default", incidentId, reason: "let me go" });
const routes = [["drift", handleDriftRoute], ["fleet", handleFleetRoute]] as const;

describe("an agent cannot lift a freeze", () => {
  test("with an agent marker, every library and SDK path is refused and the freeze holds", async () => {
    const f = freezeFixture(), incidentId = frozen(f);
    vi.stubEnv("CLAUDECODE", "1");
    expect(() => freezeLiftCli(input(f, incidentId))).toThrow(/needs a person.*CLAUDECODE/);
    expect(() => liftFreeze(input(f, incidentId))).toThrow(/needs a person.*CLAUDECODE/);
    await expect(freezeLiftCliAsync(input(f, incidentId))).rejects.toThrow(/needs a person.*CLAUDECODE/);
    await expect(liftFreezeAsync(input(f, incidentId))).rejects.toThrow(/needs a person.*CLAUDECODE/);
    stillFrozen(f, incidentId);
  }, 60_000);

  test.each(routes)("with an agent marker, POST /api/v1/%s/freeze/lift answers 403 with and without the authority check", async (name, handler) => {
    const f = freezeFixture(), incidentId = frozen(f), path = `/api/v1/${name}/freeze/lift`;
    vi.stubEnv("CODEX_THREAD_ID", "t-1");
    for (const guard of [undefined, () => true]) {
      const answer = await post(handler, f.workspace, path, { agentId: "default", incidentId, reason: "let me go" }, guard);
      expect(answer.status).toBe(403);
      expect(answer.json.error).toContain("needs a person");
    }
    stillFrozen(f, incidentId);
  }, 60_000);

  test("a freeze made by the fleet freeze route cannot be lifted by an agent through any route", async () => {
    const f = freezeFixture();
    const made = await post(handleFleetRoute, f.workspace, "/api/v1/fleet/freeze", { agentId: "default", reason: "unexpected refunds" }, () => true);
    expect(made.status, JSON.stringify(made.json)).toBe(201);
    const incidentId = made.json.data.incidentId as string;
    vi.stubEnv("GEMINI_CLI", "1");
    for (const [name, handler] of routes) {
      expect((await post(handler, f.workspace, `/api/v1/${name}/freeze/lift`, { agentId: "default", incidentId, reason: "x" }, () => true)).status).toBe(403);
    }
    expect(() => liftFreeze(input(f, incidentId))).toThrow(/needs a person/);
    stillFrozen(f, incidentId);
  }, 60_000);

  test("a workspace in agent mode refuses the lift even without a marker", async () => {
    const f = freezeFixture(), incidentId = frozen(f);
    setMode(f.workspace, "agent");
    expect(() => liftFreeze(input(f, incidentId))).toThrow(/needs a person, and this workspace is in agent mode/);
    expect((await post(handleFleetRoute, f.workspace, "/api/v1/fleet/freeze/lift", { agentId: "default", incidentId, reason: "x" }, () => true)).status).toBe(403);
    stillFrozen(f, incidentId);
  }, 60_000);

  test.skipIf(process.platform === "win32")("amc freeze lift in a shell with an agent marker is refused and the freeze holds", async () => {
    const f = freezeFixture(), incidentId = frozen(f);
    const child = spawnOwnedNode([resolve("dist/cli.js"), "freeze", "lift", "--agent", "default", "--incident", incidentId, "--reason", "x"],
      { cwd: f.workspace, env: { ...process.env, CLAUDECODE: "1", NO_COLOR: "1" } });
    const result = await child.wait(30_000);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("needs a person");
    stillFrozen(f, incidentId);
  }, 60_000);
});

describe("a person can lift a freeze", () => {
  test("the sync SDK path lifts it when no agent marker is set", () => {
    const f = freezeFixture(), incidentId = frozen(f);
    expect(freezeLiftCli(input(f, incidentId)).liftPath).toBe(f.liftPath(incidentId));
    expect(activeFreezeStatus(f.workspace, "default").active).toBe(false);
  }, 60_000);

  test.each(routes)("POST /api/v1/%s/freeze/lift lifts it for a person", async (name, handler) => {
    const f = freezeFixture(), incidentId = frozen(f);
    const answer = await post(handler, f.workspace, `/api/v1/${name}/freeze/lift`, { agentId: "default", incidentId, reason: "safe again" }, () => true);
    expect(answer.status, JSON.stringify(answer.json)).toBe(200);
    expect(activeFreezeStatus(f.workspace, "default").active).toBe(false);
  }, 60_000);
});
