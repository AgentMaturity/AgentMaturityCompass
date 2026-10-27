/** Owned unqualified report INPUTS; actual selectors, file crypto, SQL, route and response paths. */
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import * as freeze from "../../src/drift/freezeEngine.js";
import * as drift from "../../src/drift/driftDetector.js";
import * as alerts from "../../src/drift/alerts.js";
import { handleDriftRoute } from "../../src/api/driftRouter.js";
import { handleFleetRoute } from "../../src/api/fleetRouter.js";
import { getSigningKey, getSigningPublicKeyPem, getPurposeKeyHistory } from "../../src/keys/signingKeys.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { sign } from "node:crypto";
import { sha256Hex } from "../../src/utils/hash.js";
import { openLedger, verifyLedgerIntegrity } from "../../src/ledger/ledger.js";
import * as auth from "../../src/auth/authApi.js";
import { startStudioApiServer } from "../../src/studio/studioServer.js";
import { atFreezeSign, FREEZE_PASS, freezeFixture, ownFreezeCloser, pauseFreezeSign, writeFreezeDecisionInputs } from "../helpers/freezePublicationFixture.js";

const { loadAlertsConfig, signAlertsConfig, verifyAlertsConfigSignature } = alerts;

const incidents = (f: ReturnType<typeof freezeFixture>) => freeze.listIncidents(f.workspace);
async function success(f: ReturnType<typeof freezeFixture>) {
  const result = await drift.runDriftCheckAsync({ workspace: f.workspace }); expect(result.triggered).toBe(true);
  expect(incidents(f).some(item => item.incidentId === result.incidentId && freeze.verifyIncidentSignature(f.workspace, item))).toBe(true);
  expect((await verifyLedgerIntegrity(f.workspace)).ok).toBe(true); return result;
}

test("actual drift selector awaits a real file Sign before incident, ledger or completed result", async () => {
  const f = freezeFixture(); writeFreezeDecisionInputs(f); const paused = pauseFreezeSign(f);
  const pending = drift.runDriftCheckAsync({ workspace: f.workspace }), outcome = pending;
  try {
    await atFreezeSign(paused, pending); expect(incidents(f)).toEqual([]);
    const ledger = openLedger(f.workspace); try { expect(ledger.db.prepare("SELECT COUNT(*) AS n FROM evidence_events WHERE meta_json LIKE '%DRIFT_REGRESSION_DETECTED%'").get()).toEqual({ n: 0 }); } finally { ledger.close(); }
    paused.release.resolve(); const result = await outcome; expect(result).toMatchObject({ triggered: true, previousRunId: "owned-before", currentRunId: "owned-after" });
    expect(freeze.activeFreezeStatus(f.workspace).active).toBe(true); expect((await verifyLedgerIntegrity(f.workspace)).ok).toBe(true);
  } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
});

test.each(["current", "previous", "assurance", "config"] as const)("a changed selected %s dependency refuses before incident publication", async selected => {
  const f = freezeFixture(), inputs = writeFreezeDecisionInputs(f), target = selected === "config" ? f.alertsPath : inputs[selected];
  const before = readFileSync(target), signature = selected === "config" ? readFileSync(target + ".sig") : null, paused = pauseFreezeSign(f);
  const pending = drift.runDriftCheckAsync({ workspace: f.workspace }), outcome = pending.then(() => null, error => error);
  try {
    await atFreezeSign(paused, pending);
    if (selected === "config") { const config = loadAlertsConfig(f.workspace); config.alerts.rules[0]!.freezeActionClasses = ["FINANCIAL"]; writeFileSync(target, JSON.stringify(config)); signAlertsConfig(f.workspace); }
    else { const input = JSON.parse(before.toString()); if (selected === "assurance") input.packResults[0].score0to100 = 89; else input.layerScores[0].avgFinalLevel += 0.01; writeFileSync(target, JSON.stringify(input)); }
    paused.release.resolve(); expect(await outcome).toBeInstanceOf(Error); expect(incidents(f)).toEqual([]);
  } finally { paused.release.resolve(); await Promise.allSettled([pending]); writeFileSync(target, before); if (signature) writeFileSync(target + ".sig", signature); }
  await success(f);
});

test("an unrelated older diagnostic input edit is allowed while the actual selected pair stays fixed", async () => {
  const f = freezeFixture(), inputs = writeFreezeDecisionInputs(f), paused = pauseFreezeSign(f), pending = drift.runDriftCheckAsync({ workspace: f.workspace });
  try { await atFreezeSign(paused, pending); writeFileSync(join(f.paths.runsDir, "owned-null.json"), "null"); const old = JSON.parse(readFileSync(inputs.older, "utf8")); old.layerScores[0].avgFinalLevel = 4; writeFileSync(inputs.older, JSON.stringify(old));
    paused.release.resolve(); expect(await pending).toMatchObject({ triggered: true, previousRunId: "owned-before", currentRunId: "owned-after" }); }
  finally { paused.release.resolve(); await Promise.allSettled([pending]); }
});

test("same-read captured alerts pair cannot approve bytes that change after its verification", () => {
  const f = freezeFixture(), snapshot = alerts.captureVerifiedAlertsConfig(f.workspace), before = readFileSync(f.alertsPath), sig = readFileSync(f.alertsPath + ".sig");
  try { const next = loadAlertsConfig(f.workspace); next.alerts.rules[0]!.freezeActionClasses = ["FINANCIAL"]; writeFileSync(f.alertsPath, JSON.stringify(next)); signAlertsConfig(f.workspace);
    expect(() => snapshot.assertCurrent()).toThrow("alerts configuration changed"); expect(snapshot.config.alerts.rules[0]!.freezeActionClasses).not.toEqual(["FINANCIAL"]); }
  finally { writeFileSync(f.alertsPath, before); writeFileSync(f.alertsPath + ".sig", sig); }
  expect(() => alerts.captureVerifiedAlertsConfig(f.workspace)).not.toThrow();
});

test("actual native SQL refusal after publishing preserves the incident, completed stages and cause", async () => {
  const f = freezeFixture(); writeFreezeDecisionInputs(f); const ledger = openLedger(f.workspace);
  ledger.db.exec("CREATE TRIGGER deny_owned_drift BEFORE INSERT ON evidence_events WHEN instr(NEW.meta_json, 'DRIFT_REGRESSION_DETECTED') > 0 BEGIN SELECT RAISE(ABORT, 'owned drift append refused'); END");
  try {
    const error = await drift.runDriftCheckAsync({ workspace: f.workspace }).then(() => null, failure => failure);
    expect(error).toMatchObject({ code: "DRIFT_PARTIAL", phase: "drift-audit", completed: ["incident", "ledger-open", "ledger-start", "ledger-close"] });
    expect(error.cause).toMatchObject({ code: "SQLITE_CONSTRAINT_TRIGGER" }); expect(error.cause.message).toContain("owned drift append refused");
    expect(existsSync(error.incidentPath)).toBe(true); expect(freeze.verifyIncidentSignature(f.workspace, JSON.parse(readFileSync(error.incidentPath, "utf8")))).toBe(true);
    expect(error.incidentId).toBe(incidents(f)[0]!.incidentId);
  } finally {
    ledger.db.exec("DROP TRIGGER deny_owned_drift");
    // Explicit owned-fixture repair for the fresh control: seal only the actual surviving incomplete session, without adding the failed audit.
    const open = ledger.db.prepare("SELECT session_id FROM sessions WHERE binary_path='amc-drift-check' AND session_final_event_hash IS NULL").all() as Array<{ session_id: string }>;
    for (const row of open) ledger.sealSession(row.session_id);
    ledger.close();
  }
  await success(f);
});

test("real loopback alert failure leaves the signed incident and sealed ledger effects truthful", async () => {
  const f = freezeFixture(); writeFreezeDecisionInputs(f); const received: string[] = [];
  const server = createServer((req, res) => { const chunks: Buffer[] = []; req.on("data", chunk => chunks.push(Buffer.from(chunk))); req.on("end", () => { received.push(Buffer.concat(chunks).toString()); res.writeHead(503); res.end("owned failure"); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); ownFreezeCloser(() => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }));
  const address = server.address(); if (address === null || typeof address === "string") throw new Error("owned alert server has no TCP address");
  const config = loadAlertsConfig(f.workspace); config.alerts.channels = [{ type: "webhook", name: "owned", url: `http://127.0.0.1:${address.port}/owned`, secretRef: "vault:alerts/local-dev" }];
  config.alerts.rules[0]!.actions.push("ALERT_OWNER"); writeFileSync(f.alertsPath, JSON.stringify(config)); signAlertsConfig(f.workspace);
  const error = await drift.runDriftCheckAsync({ workspace: f.workspace }).then(() => null, failure => failure);
  expect(error).toMatchObject({ code: "DRIFT_PARTIAL", phase: "alert" }); expect(error.completed).toContain("ledger-seal"); expect(error.completed).toContain("ledger-close");
  expect(error.cause).toBeInstanceOf(Error); expect(received).toHaveLength(1); expect(JSON.parse(received[0]!).incidentId ?? JSON.parse(received[0]!).runId).toBe("owned-after");
  expect(incidents(f).some(item => item.incidentId === error.incidentId && freeze.verifyIncidentSignature(f.workspace, item))).toBe(true);
  expect((await verifyLedgerIntegrity(f.workspace)).ok).toBe(true);
  config.alerts.channels = []; config.alerts.rules[0]!.actions = ["FREEZE_EXECUTE", "CREATE_INCIDENT"]; writeFileSync(f.alertsPath, JSON.stringify(config)); signAlertsConfig(f.workspace); await success(f);
});

async function routed(handler: typeof handleFleetRoute | typeof handleDriftRoute, workspace: string, path: string, body: unknown, guard?: () => boolean) {
  const req = Readable.from([JSON.stringify(body)]) as IncomingMessage; req.method = "POST"; req.url = path;
  const headers = new Map<string, unknown>(); let payload = "";
  const response = { statusCode: 0, headersSent: false, setHeader(name: string, value: unknown) { headers.set(name, value); }, getHeader(name: string) { return headers.get(name); },
    writeHead(this: { statusCode: number; headersSent: boolean }, status: number) { this.statusCode = status; this.headersSent = true; return this; }, end(bytes: string) { payload = String(bytes); } } as unknown as ServerResponse;
  expect(await handler(path, "POST", req, response, workspace, guard)).toBe(true);
  return { status: response.statusCode, body: JSON.parse(payload) };
}

test.each(["fleet", "drift"] as const)("actual %s lift route preserves legacy fallback and uses checked signing only through its trusted callback", async route => {
  const f = freezeFixture(), incident = freeze.createFreezeIncident(f.params()), spy = vi.spyOn(f.provider, "sign"), handler = route === "fleet" ? handleFleetRoute : handleDriftRoute;
  const path = `/api/v1/${route}/freeze/lift`, body = { agentId: "default", incidentId: incident.incidentId, reason: "owned route clear", revalidateAuthority: true, roles: ["OWNER"] };
  expect((await routed(handler, f.workspace, path, body)).status).toBe(200); expect(spy).not.toHaveBeenCalled();
  expect((await routed(handler, f.workspace, path, body, () => true)).status).toBe(200); expect(spy).toHaveBeenCalledTimes(1);
  spy.mockClear(); const before = readFileSync(f.liftPath(incident.incidentId)); expect((await routed(handler, f.workspace, path, body, () => false)).status).toBe(403);
  expect(spy).not.toHaveBeenCalled(); expect(readFileSync(f.liftPath(incident.incidentId))).toEqual(before);
});

test.each(["fleet", "drift"] as const)("actual %s trusted lift revalidation refuses a lost caller during real Sign without replacing its target", async route => {
  const f = freezeFixture(), incident = freeze.createFreezeIncident(f.params()), paused = pauseFreezeSign(f); let current = true;
  const pending = routed(route === "fleet" ? handleFleetRoute : handleDriftRoute, f.workspace, `/api/v1/${route}/freeze/lift`, { agentId: "default", incidentId: incident.incidentId, reason: "late caller" }, () => current);
  try { await atFreezeSign(paused, pending); current = false; paused.release.resolve(); expect((await pending).status).toBe(403); expect(existsSync(f.liftPath(incident.incidentId))).toBe(false); }
  finally { paused.release.resolve(); await Promise.allSettled([pending]); }
  expect((await routed(route === "fleet" ? handleFleetRoute : handleDriftRoute, f.workspace, `/api/v1/${route}/freeze/lift`, { agentId: "default", incidentId: incident.incidentId, reason: "fresh" }, () => true)).status).toBe(200);
});

test("real Studio request loses its tracked owner during Sign and cannot publish a freeze", async () => {
  const f = freezeFixture(); writeFreezeDecisionInputs(f);
  const owner = auth.initUsersConfig({ workspace: f.workspace, username: "owner", password: "owned-freeze-owner-password" }).owner;
  const session = auth.createSession({ workspace: f.workspace, user: owner });
  const server = await startStudioApiServer({ workspace: f.workspace, host: "127.0.0.1", port: 0, token: "owned-freeze-admin" }); ownFreezeCloser(server.close);
  const paused = pauseFreezeSign(f), pending = fetch(server.url + "/agents/default/drift/check", { method: "POST", headers: { "content-type": "application/json", cookie: `amc_session=${session.token}` }, body: "{}", signal: AbortSignal.timeout(20_000) });
  const outcome = pending.then(async response => ({ status: response.status, body: await response.json() }));
  try { await atFreezeSign(paused, outcome); auth.revokeSessionByToken({ workspace: f.workspace, token: session.token }); paused.release.resolve();
    const refused = await outcome; expect(incidents(f)).toEqual([]); expect(refused.status).toBe(401); }
  finally { paused.release.resolve(); await Promise.allSettled([outcome]); }
  const fresh = await fetch(server.url + "/agents/default/drift/check", { method: "POST", headers: { "content-type": "application/json", "x-amc-admin-token": "owned-freeze-admin" }, body: "{}", signal: AbortSignal.timeout(20_000) });
  expect(fresh.status, await fresh.text()).toBe(200); expect(incidents(f).length).toBeGreaterThan(0);
});

test("actual Studio handoff retains its published incident through a genuine post-forecast native I/O failure", async () => {
  const f = freezeFixture(); writeFreezeDecisionInputs(f);
  const { driftCheckForStudio } = await import("../../src/drift/studioDriftCheck.js");
  const error = await driftCheckForStudio({ workspace: f.workspace, agentId: "default", against: "previous", beforePublish() {}, recompute() {},
    forecast() { renameSync(join(f.root, "owned-absent-source"), join(f.root, "owned-target")); }
  }).then(() => null, failure => failure);
  expect(error).toMatchObject({ code: "DRIFT_PARTIAL", phase: "studio-effects", completed: ["incident", "drift-check"], cause: { code: "ENOENT" } });
  expect(existsSync(error.incidentPath)).toBe(true); expect(freeze.verifyIncidentSignature(f.workspace, JSON.parse(readFileSync(error.incidentPath, "utf8")))).toBe(true);
  const fresh = await driftCheckForStudio({ workspace: f.workspace, agentId: "default", against: "previous", beforePublish() {}, recompute() {}, forecast() {} });
  expect(fresh.triggered).toBe(true);
});


test("a raw-valid split artifact signature cannot authenticate the actual alerts decision pair", async () => {
  const f = freezeFixture(); writeFreezeDecisionInputs(f); rotatePurposeKeys({ workspace: f.workspace, purposes: ["artifact-seal"], passphrase: FREEZE_PASS });
  const alias = f.alertsPath + ".sig", original = readFileSync(alias), bytes = readFileSync(f.alertsPath), sidecar = JSON.parse(original.toString());
  const wrong = getSigningPublicKeyPem(f.workspace, "artifact-seal"); expect(getPurposeKeyHistory(f.workspace, "config-signature")).not.toContain(wrong);
  sidecar.signature = sign(null, Buffer.from(sha256Hex(bytes), "hex"), getSigningKey(f.workspace, "artifact-seal")).toString("base64");
  try {
    writeFileSync(alias, JSON.stringify(sidecar)); expect(verifyAlertsConfigSignature(f.workspace).valid).toBe(false);
    expect(() => alerts.captureVerifiedAlertsConfig(f.workspace)).toThrow("signature verification failed");
    expect(await drift.runDriftCheckAsync({ workspace: f.workspace })).toMatchObject({ triggered: false, incidentId: null }); expect(incidents(f)).toEqual([]);
  } finally { writeFileSync(alias, original); }
  await success(f);
});
