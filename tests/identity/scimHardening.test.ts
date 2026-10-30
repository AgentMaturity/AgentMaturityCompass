import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { identityInitCli, identityMappingAddCli, scimInitCli } from "../../src/identity/identityCli.js";
import { lockHostVault } from "../../src/identity/hostVault.js";
import { createIdentitySession, resolveIdentitySession } from "../../src/identity/sessionStore.js";
import { parseScimPatchOperations } from "../../src/identity/scim/scimPatch.js";
import {
  applyMembershipRolesFromSource, createWorkspaceRecord, findHostUserById, initHostDb, rolesForUserIdInWorkspace
} from "../../src/workspaces/hostDb.js";
import { startWorkspaceRouter } from "../../src/workspaces/workspaceRouter.js";

const CHECKOUT = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const SCIM = "/host/scim/v2";
const USER_SCHEMA = ["urn:ietf:params:scim:schemas:core:2.0:User"];
const GROUP_SCHEMA = ["urn:ietf:params:scim:schemas:core:2.0:Group"];
const LIST_SCHEMA = ["urn:ietf:params:scim:api:messages:2.0:ListResponse"];
const ERROR_SCHEMA = ["urn:ietf:params:scim:api:messages:2.0:Error"];
const WORKSPACE = "scim-qualification";
const GROUP = "synthetic-scim-viewers";
type Method = "GET" | "POST" | "PATCH";
type HttpResult = { status: number; headers: IncomingHttpHeaders; body: string };
type ErrorFact = { scope: string; name: string; message: string; code: string | null; stack: string | null };
interface Fixture {
  root: string; hostDir: string; home: string; temp: string; passphrase: string;
  secrets: string[]; errors: ErrorFact[]; observations: unknown[]; close: (() => Promise<void> | void)[];
}
interface Host { base: string; token: string }
function redact(f: Fixture, value: string): string {
  for (const secret of f.secrets) if (secret) value = value.replaceAll(secret, "[redacted-owned-secret]");
  return value;
}
function fact(f: Fixture, scope: string, error: unknown): ErrorFact {
  const code = (error as { code?: unknown } | null)?.code;
  return { scope, name: error instanceof Error ? error.name : typeof error,
    message: redact(f, error instanceof Error ? error.message : String(error)),
    code: typeof code === "string" ? code : null,
    stack: error instanceof Error && error.stack ? redact(f, error.stack) : null };
}
async function owned(label: string, body: (f: Fixture) => Promise<void>): Promise<void> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p207-scim-")));
  const passphrase = randomUUID();
  const f: Fixture = { root, hostDir: join(root, "host"), home: join(root, "home"), temp: join(root, "tmp"),
    passphrase, secrets: [passphrase], errors: [], observations: [], close: [] };
  const env = { HOME: f.home, TMPDIR: f.temp, AMC_HOME: join(f.home, ".amc"), AMC_HOST_VAULT_PASSPHRASE: passphrase };
  const previous = new Map(Object.keys(env).map(key => [key, process.env[key]]));
  const cleanupErrors: unknown[] = [];
  let bodyError: unknown, bodyFailed = false;
  try {
    for (const path of [f.hostDir, f.home, f.temp, join(root, "observations")]) mkdirSync(path, { mode: 0o700 });
    Object.assign(process.env, env);
    await body(f);
  } catch (error) { bodyError = error; bodyFailed = true; }
  finally {
    for (const close of f.close.reverse()) {
      try { await close(); } catch (error) { cleanupErrors.push(error); }
    }
    try { lockHostVault(f.hostDir); } catch (error) { cleanupErrors.push(error); }
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    const exactEnvironmentRestored = [...previous].every(([key, value]) => process.env[key] === value);
    try { expect(exactEnvironmentRestored).toBe(true); expect(f.errors).toEqual([]); }
    catch (error) { cleanupErrors.push(error); }
    const evidence = join(root, "observations", "public-evidence.json");
    try {
      const record = { schema: "amc-p207-scim-hardening/1", label, synthetic: true, checkout: CHECKOUT,
        childProcessCreated: false, observations: f.observations, errors: f.errors, exactEnvironmentRestored,
        bodyFailed, bodyError: bodyFailed ? fact(f, "body", bodyError) : null,
        cleanupErrors: cleanupErrors.map(error => fact(f, "cleanup", error)), signalsSent: false, retainedRoot: root };
      writeFileSync(evidence, `${redact(f, JSON.stringify(record, null, 2))}\n`, { flag: "wx", mode: 0o600 });
      // Retain each owned root and all failures; public evidence never includes credentials or vault content.
      console.log(`AMC_P207_SCIM_PUBLIC_EVIDENCE ${evidence}`);
    } catch (error) { cleanupErrors.push(error); console.log(`AMC_P207_SCIM_RETAINED_ROOT ${root}`); }
  }
  if (cleanupErrors.length > 0) throw new AggregateError(bodyFailed ? [bodyError, ...cleanupErrors] : cleanupErrors, "owned SCIM cleanup failed");
  if (bodyFailed) throw bodyError;
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => { server.removeListener("listening", onListen); reject(error); };
    const onListen = () => { server.removeListener("error", onError); resolve(); };
    server.once("error", onError); server.once("listening", onListen); server.listen(0, "127.0.0.1");
  });
  const address = server.address();
  if (!address || typeof address === "string" || address.port <= 0) throw new Error("owned port probe has no positive port");
  return (address as AddressInfo).port;
}
async function pickPort(f: Fixture): Promise<number> {
  const server = createServer();
  const observation = { kind: "port-probe", started: false, closed: false, listening: false };
  f.observations.push(observation);
  server.on("error", error => f.errors.push(fact(f, "port-probe", error)));
  server.on("close", () => { observation.closed = true; });
  try { const port = await listen(server); observation.started = true; return port; }
  finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    observation.listening = server.listening;
    expect(observation.listening).toBe(false);
    if (observation.started) expect(observation.closed).toBe(true);
  }
}

async function httpCall(f: Fixture, label: string, url: string, method: Method = "GET",
  options: { bearer?: string; cookie?: string; body?: unknown } = {}): Promise<HttpResult> {
  const text = options.body === undefined ? "" : JSON.stringify(options.body);
  const observation = { kind: "http", label, path: new URL(url).pathname, method, status: 0,
    requestCreated: false, requestClosed: false, responseEnded: false, responseComplete: false,
    responseClosed: false, socketAssigned: false, socketClosed: false };
  f.observations.push(observation);
  let socketClose: Promise<void> | undefined, responseClose: Promise<void> | undefined;
  let resolveRequestClose!: () => void;
  const requestClose = new Promise<void>(resolve => { resolveRequestClose = resolve; });
  const result = new Promise<HttpResult>((resolve, reject) => {
    const req = httpRequest(url, { method, agent: false, headers: {
      connection: "close", ...(options.bearer ? { authorization: `Bearer ${options.bearer}` } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(text ? { "content-type": "application/scim+json", "content-length": String(Buffer.byteLength(text)) } : {})
    } }, res => {
      responseClose = new Promise<void>(done => res.once("close", () => { observation.responseClosed = true; done(); }));
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("error", error => { f.errors.push(fact(f, "client-response", error)); reject(error); });
      res.on("aborted", () => { const error = new Error("owned response aborted"); f.errors.push(fact(f, "client-response", error)); reject(error); });
      res.on("close", () => {
        if (!res.complete) { const error = new Error("owned response closed before completion"); f.errors.push(fact(f, "client-response", error)); reject(error); }
      });
      res.on("end", () => {
        observation.status = res.statusCode ?? 0; observation.responseEnded = true; observation.responseComplete = res.complete;
        resolve({ status: observation.status, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") });
      });
    });
    observation.requestCreated = true;
    req.once("socket", socket => {
      observation.socketAssigned = true;
      socketClose = new Promise<void>(resolve => socket.once("close", () => { observation.socketClosed = true; resolve(); }));
      socket.on("error", error => f.errors.push(fact(f, "client-socket", error)));
    });
    req.on("error", error => { f.errors.push(fact(f, "client-request", error)); reject(error); });
    req.once("close", () => { observation.requestClosed = true; resolveRequestClose(); });
    if (text) req.write(text);
    req.end();
  });
  let value: HttpResult | undefined, bodyError: unknown, bodyFailed = false;
  try { value = await result; } catch (error) { bodyError = error; bodyFailed = true; }
  const cleanupErrors: unknown[] = [];
  try {
    if (observation.requestCreated) await requestClose;
    await responseClose; await socketClose;
    if (!bodyFailed) {
      expect(observation.requestClosed && observation.responseEnded && observation.responseComplete && observation.responseClosed).toBe(true);
      expect(observation.socketAssigned && observation.socketClosed).toBe(true);
    }
  } catch (error) { cleanupErrors.push(error); }
  if (cleanupErrors.length > 0) throw new AggregateError(bodyFailed ? [bodyError, ...cleanupErrors] : cleanupErrors, "owned SCIM request cleanup failed");
  if (bodyFailed) throw bodyError;
  if (!value) throw new Error("owned request returned no result");
  return value;
}
function jsonBody(f: Fixture, response: HttpResult): Record<string, unknown> {
  // Owned secrets contain only UUID/base64url characters, so replacing them retains JSON syntax.
  const value: unknown = JSON.parse(redact(f, response.body));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("owned HTTP response is not a JSON object");
  return value as Record<string, unknown>;
}
function responseView(f: Fixture, response: HttpResult) {
  return { status: response.status, contentType: response.headers["content-type"] ?? null, body: jsonBody(f, response) };
}
function expectedError(detail: string, status = 400) {
  return { status, contentType: "application/scim+json", body: { schemas: ERROR_SCHEMA, status: String(status), detail } };
}
function userView(f: Fixture, response: HttpResult) {
  const b = jsonBody(f, response);
  return { status: response.status, schemas: b.schemas, id: b.id, userName: b.userName, active: b.active,
    displayName: b.displayName ?? null, externalId: b.externalId ?? null };
}
function groupView(f: Fixture, response: HttpResult) {
  const b = jsonBody(f, response);
  const members = Array.isArray(b.members) ? b.members.map((member: unknown) => {
    if (!member || typeof member !== "object" || typeof (member as { value?: unknown }).value !== "string") return "<invalid member>";
    return (member as { value: string }).value;
  }).sort() : null;
  return { status: response.status, schemas: b.schemas, id: b.id, displayName: b.displayName, externalId: b.externalId ?? null, members };
}
async function scim(f: Fixture, host: Host, label: string, path: string, method: Method = "GET", body?: unknown) {
  return httpCall(f, label, `${host.base}${SCIM}${path}`, method, { bearer: host.token, body });
}
async function authRouter(f: Fixture): Promise<Host> {
  initHostDb(f.hostDir); identityInitCli(f.hostDir);
  const configured = scimInitCli({ hostDir: f.hostDir, requireHttps: false, tokenName: "synthetic-scim-token" });
  if (!configured.token?.token) throw new Error("owned SCIM initialization produced no token");
  const token = configured.token.token; f.secrets.push(token);
  const port = await pickPort(f), base = `http://127.0.0.1:${port}`;
  let router: Awaited<ReturnType<typeof startWorkspaceRouter>> | undefined;
  const observation = { kind: "router", port, started: false, closed: false };
  f.observations.push(observation);
  f.close.push(async () => {
    if (router) { await router.close(); observation.closed = true; }
    if (observation.started) expect(observation.closed).toBe(true);
  });
  router = await startWorkspaceRouter({ hostDir: f.hostDir, host: "127.0.0.1", port });
  observation.started = true;
  const unauthenticated = responseView(f, await httpCall(f, "auth-missing-bearer", `${base}${SCIM}/ServiceProviderConfig`));
  const authenticated = responseView(f, await httpCall(f, "auth-valid-bearer", `${base}${SCIM}/ServiceProviderConfig`, "GET", { bearer: token }));
  f.observations.push({ kind: "auth-controls", unauthenticated, authenticated });
  expect(unauthenticated).toEqual(expectedError("missing SCIM bearer token", 401));
  expect(authenticated.status).toBe(200); expect(authenticated.body.patch).toEqual({ supported: true });
  return { base, token };
}
async function createUser(f: Fixture, host: Host, label: string) {
  const data = { userName: `${label}@example.test`, displayName: `Synthetic ${label}`, externalId: `ext-${label}`, active: true };
  const response = await scim(f, host, `create-user-${label}`, "/Users", "POST", data);
  const view = userView(f, response);
  f.observations.push({ kind: "create-user", label, view });
  expect(response.status).toBe(201); expect(view.schemas).toEqual(USER_SCHEMA); expect(view.active).toBe(true);
  expect(view.userName).toBe(data.userName); expect(view.displayName).toBe(data.displayName); expect(view.externalId).toBe(data.externalId);
  if (typeof view.id !== "string" || !view.id) throw new Error("owned SCIM create has no user id");
  return { ...data, id: view.id };
}
async function getUser(f: Fixture, host: Host, userId: string, label: string) {
  return userView(f, await scim(f, host, label, `/Users/${encodeURIComponent(userId)}`));
}
function roles(f: Fixture, target: string, survivor: string) {
  return { target: rolesForUserIdInWorkspace({ hostDir: f.hostDir, userId: target, workspaceId: WORKSPACE }).sort(),
    survivor: rolesForUserIdInWorkspace({ hostDir: f.hostDir, userId: survivor, workspaceId: WORKSPACE }).sort() };
}
async function mappedGroup(f: Fixture, host: Host) {
  createWorkspaceRecord({ hostDir: f.hostDir, workspaceId: WORKSPACE, name: "Synthetic SCIM Qualification" });
  identityMappingAddCli({ hostDir: f.hostDir, providerId: "SCIM", group: GROUP, workspaceId: WORKSPACE, roles: ["VIEWER"] });
  const target = await createUser(f, host, "target"), survivor = await createUser(f, host, "survivor");
  const response = await scim(f, host, "create-mapped-group", "/Groups", "POST", {
    displayName: GROUP, externalId: "synthetic-group-external", members: [{ value: target.id }, { value: survivor.id }]
  });
  const view = groupView(f, response);
  f.observations.push({ kind: "create-group", view });
  expect(response.status).toBe(201); expect(view.schemas).toEqual(GROUP_SCHEMA);
  expect(view.members).toEqual([target.id, survivor.id].sort());
  expect(roles(f, target.id, survivor.id)).toEqual({ target: ["VIEWER"], survivor: ["VIEWER"] });
  applyMembershipRolesFromSource({ hostDir: f.hostDir, userId: target.id, workspaceId: WORKSPACE,
    roles: ["AUDITOR"], sourceType: "MANUAL", sourceId: "synthetic-manual-auditor" });
  const initialRoles = roles(f, target.id, survivor.id);
  expect(initialRoles).toEqual({ target: ["AUDITOR", "VIEWER"], survivor: ["VIEWER"] });
  if (typeof view.id !== "string" || !view.id) throw new Error("owned SCIM create has no group id");
  return { id: view.id, target: target.id, survivor: survivor.id, initialRoles };
}

describe("SCIM parser, filters and deprovisioning", () => {
  test("PATCH False disables a SCIM user and refuses its existing identity session", async () => {
    await owned("active-false-existing-session", async f => {
      const host = await authRouter(f), user = await createUser(f, host, "session-user");
      const session = createIdentitySession({ hostDir: f.hostDir, userId: user.id, authType: "SCIM", ttlMinutes: 5 });
      f.secrets.push(session.token, encodeURIComponent(session.token));
      const cookie = `amc_session=${encodeURIComponent(session.token)}`;
      const beforeDirect = resolveIdentitySession({ hostDir: f.hostDir, token: session.token });
      const beforeHttp = await httpCall(f, "existing-session-before", `${host.base}/host/api/auth/me`, "GET", { cookie });
      const before = { directOk: beforeDirect.ok, directUserId: beforeDirect.session?.user.userId ?? null,
        httpStatus: beforeHttp.status, httpUserId: (jsonBody(f, beforeHttp).user as { userId?: unknown } | undefined)?.userId ?? null };
      f.observations.push({ kind: "existing-session-positive", before });
      expect(before).toEqual({ directOk: true, directUserId: user.id, httpStatus: 200, httpUserId: user.id });
      const patched = userView(f, await scim(f, host, "active-False", `/Users/${user.id}`, "PATCH", {
        Operations: [{ op: "replace", path: "active", value: "False" }]
      }));
      const fetched = await getUser(f, host, user.id, "disabled-user-get");
      const stored = findHostUserById(f.hostDir, user.id);
      const direct = resolveIdentitySession({ hostDir: f.hostDir, token: session.token });
      const afterHttp = await httpCall(f, "existing-session-after", `${host.base}/host/api/auth/me`, "GET", { cookie });
      const after = { patched, fetched, storedDisabled: stored?.disabled ?? null,
        direct: { ok: direct.ok, userId: direct.session?.user.userId ?? null, error: direct.error ?? null }, httpStatus: afterHttp.status };
      f.observations.push({ kind: "deprovisioned-session", after });
      expect(patched.status).toBe(200); expect(patched.active).toBe(false);
      expect(fetched.status).toBe(200); expect(fetched.active).toBe(false); expect(after.storedDisabled).toBe(true);
      expect(after.direct).toEqual({ ok: false, userId: null, error: "user disabled" }); expect(after.httpStatus).toBe(401);
    });
  });

  test("user PATCH validates all values and paths before applying a change", async () => {
    await owned("user-patch-values-paths", async f => {
      const host = await authRouter(f), user = await createUser(f, host, "user-values"), path = `/Users/${user.id}`;
      const successes: unknown[] = [], refusals: unknown[] = [];
      f.observations.push({ kind: "user-patch-rows", successes, refusals });
      const positive = [
        { label: "boolean-false", operation: { op: "replace", path: "active", value: false }, active: false, displayName: user.displayName },
        { label: "mixed-case-true", operation: { op: "replace", path: "AcTiVe", value: "TrUe" }, active: true, displayName: user.displayName },
        { label: "boolean-true", operation: { op: "replace", path: "active", value: true }, active: true, displayName: user.displayName },
        { label: "pathless-supported-object", operation: { op: "replace", value: { active: "False", displayName: "Changed" } }, active: false, displayName: "Changed" },
        { label: "reset-active-true", operation: { op: "replace", path: "active", value: true }, active: true, displayName: "Changed" }
      ];
      for (const row of positive) {
        const patched = userView(f, await scim(f, host, row.label, path, "PATCH", { Operations: [row.operation] }));
        const fetched = await getUser(f, host, user.id, `${row.label}-get`);
        successes.push({ label: row.label, patchStatus: patched.status, patchActive: patched.active, patchDisplayName: patched.displayName,
          getStatus: fetched.status, active: fetched.active, displayName: fetched.displayName });
      }
      const beforeRefusals = await getUser(f, host, user.id, "before-user-refusals");
      const negative = [
        { label: "invalid-active-string", operations: [{ op: "replace", path: "active", value: "yes" }], detail: "invalidValue" },
        { label: "invalid-active-number", operations: [{ op: "replace", path: "active", value: 0 }], detail: "invalidValue" },
        { label: "invalid-active-null", operations: [{ op: "replace", path: "active", value: null }], detail: "invalidValue" },
        { label: "unknown-user-path", operations: [{ op: "replace", path: "unknownAttribute", value: "x" }], detail: "invalidPath" },
        { label: "unknown-pathless-attribute", operations: [{ op: "replace", value: { unknownAttribute: "x" } }], detail: "invalidPath" },
        { label: "later-invalid-operation", operations: [{ op: "replace", path: "displayName", value: "Must not apply" },
          { op: "replace", path: "unknownAttribute", value: "x" }], detail: "invalidPath" }
      ];
      for (const row of negative) {
        const response = responseView(f, await scim(f, host, row.label, path, "PATCH", { Operations: row.operations }));
        const after = await getUser(f, host, user.id, `${row.label}-get`);
        refusals.push({ label: row.label, response, after });
      }
      const removed = userView(f, await scim(f, host, "remove-display-name", path, "PATCH", { Operations: [{ op: "remove", path: "displayName" }] }));
      const afterRemove = await getUser(f, host, user.id, "removed-display-name-get");
      f.observations.push({ kind: "remove-display-name", removed, afterRemove, beforeRefusals });
      expect(successes).toEqual(positive.map(row => ({ label: row.label, patchStatus: 200, patchActive: row.active,
        patchDisplayName: row.displayName, getStatus: 200, active: row.active, displayName: row.displayName })));
      expect(refusals).toEqual(negative.map(row => ({ label: row.label, response: expectedError(row.detail), after: beforeRefusals })));
      expect(removed.status).toBe(200); expect(removed.displayName).toBeNull(); expect(afterRemove.displayName).toBeNull();
    });
  });

  test("a deprovisioning PATCH still applies when the request also carries known attributes AMC does not store", async () => {
    await owned("user-patch-ignored-attributes", async f => {
      const host = await authRouter(f), user = await createUser(f, host, "ignored-attributes");
      const session = createIdentitySession({ hostDir: f.hostDir, userId: user.id, authType: "SCIM", ttlMinutes: 5 });
      f.secrets.push(session.token, encodeURIComponent(session.token));
      const patched = userView(f, await scim(f, host, "active-false-with-name", `/Users/${user.id}`, "PATCH", { Operations: [
        { op: "replace", path: "active", value: false },
        { op: "replace", path: "name.familyName", value: "X" },
        { op: "replace", path: "emails[type eq \"work\"].value", value: "x@example.test" },
        { op: "replace", value: { externalId: "x", title: "T", "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User": { department: "D" } } }
      ] }));
      const direct = resolveIdentitySession({ hostDir: f.hostDir, token: session.token });
      f.observations.push({ kind: "ignored-attributes", patched, directOk: direct.ok });
      expect(patched.status).toBe(200); expect(patched.active).toBe(false);
      expect(direct).toMatchObject({ ok: false, error: "user disabled" });
      // An attribute outside the documented set is still refused, whole request.
      const refused = responseView(f, await scim(f, host, "unknown-with-active", `/Users/${user.id}`, "PATCH", { Operations: [
        { op: "replace", path: "active", value: true }, { op: "replace", path: "nickName2", value: "x" }] }));
      expect(refused).toEqual(expectedError("invalidPath"));
      expect((await getUser(f, host, user.id, "after-unknown")).active).toBe(false);
    });
  });

  test("filtered removal revokes only the removed member's SCIM group grant", async () => {
    await owned("filtered-member-role-revocation", async f => {
      const host = await authRouter(f), group = await mappedGroup(f, host), path = `/Groups/${group.id}`;
      const patched = groupView(f, await scim(f, host, "filtered-target-remove", path, "PATCH", {
        Operations: [{ op: "remove", path: `MEMBERS[value EQ "${group.target}"]` }]
      }));
      const fetched = groupView(f, await scim(f, host, "filtered-group-get", path));
      const afterRoles = roles(f, group.target, group.survivor);
      f.observations.push({ kind: "filtered-removal", target: group.target, survivor: group.survivor, patched, fetched, afterRoles });
      const expected = { status: 200, schemas: GROUP_SCHEMA, id: group.id, displayName: GROUP,
        externalId: "synthetic-group-external", members: [group.survivor] };
      expect(patched.status).toBe(200);
      expect(afterRoles.target).toEqual(["AUDITOR"]);
      expect(afterRoles.survivor).toEqual(["VIEWER"]);
      expect(patched).toEqual(expected); expect(fetched).toEqual(expected);
    });
  });

  test("group PATCH rejects unsupported paths and malformed values without changing grants", async () => {
    await owned("group-patch-validation", async f => {
      const host = await authRouter(f), group = await mappedGroup(f, host), path = `/Groups/${group.id}`;
      const initial = groupView(f, await scim(f, host, "before-group-refusals", path));
      const absent = "synthetic-absent-user";
      const missing = responseView(f, await scim(f, host, "absent-user-control", `/Users/${absent}`));
      f.observations.push({ kind: "missing-user-positive-control", missing });
      expect(missing).toEqual(expectedError("User not found", 404));
      const negative = [
        { label: "unknown-group-path", operation: { op: "replace", path: "unknownAttribute", value: [] }, detail: "invalidPath" },
        { label: "unsupported-member-filter", operation: { op: "remove", path: 'members[display eq "x"]' }, detail: "invalidPath" },
        { label: "filtered-add", operation: { op: "add", path: `members[value eq "${group.target}"]`, value: { value: group.target } }, detail: "invalidPath" },
        { label: "filtered-remove-with-value", operation: { op: "remove", path: `members[value eq "${group.target}"]`, value: { value: group.target } }, detail: "invalidValue" },
        { label: "invalid-member-id-value", operation: { op: "add", path: "members", value: { value: 7 } }, detail: "invalidValue" },
        { label: "absent-member-add", operation: { op: "add", path: "members", value: { value: absent } }, detail: "invalidValue" }
      ];
      const rows: unknown[] = []; f.observations.push({ kind: "group-refusal-rows", initial, initialRoles: group.initialRoles, rows });
      for (const row of negative) {
        const response = responseView(f, await scim(f, host, row.label, path, "PATCH", { Operations: [row.operation] }));
        const after = groupView(f, await scim(f, host, `${row.label}-get`, path));
        rows.push({ label: row.label, response, after, roles: roles(f, group.target, group.survivor) });
      }
      const replaced = groupView(f, await scim(f, host, "replace-single-member-object", path, "PATCH", {
        Operations: [{ op: "replace", path: "members", value: { value: group.survivor } }]
      }));
      const replacedGet = groupView(f, await scim(f, host, "replace-single-member-get", path));
      const replacedRoles = roles(f, group.target, group.survivor);
      const removed = groupView(f, await scim(f, host, "remove-members-without-value", path, "PATCH", {
        Operations: [{ op: "remove", path: "members" }]
      }));
      const removedGet = groupView(f, await scim(f, host, "removed-members-get", path));
      const removedRoles = roles(f, group.target, group.survivor);
      f.observations.push({ kind: "supported-group-controls", replaced, replacedGet, replacedRoles, removed, removedGet, removedRoles });
      expect(rows).toEqual(negative.map(row => ({ label: row.label, response: expectedError(row.detail), after: initial, roles: group.initialRoles })));
      const expectedReplaced = { ...initial, status: 200, members: [group.survivor] };
      expect(replaced).toEqual(expectedReplaced); expect(replacedGet).toEqual(expectedReplaced);
      expect(replacedRoles).toEqual({ target: ["AUDITOR"], survivor: ["VIEWER"] });
      const expectedRemoved = { ...initial, status: 200, members: [] };
      expect(removed).toEqual(expectedRemoved); expect(removedGet).toEqual(expectedRemoved);
      expect(removedRoles).toEqual({ target: ["AUDITOR"], survivor: [] });
    });
  });

  test("user filters reject unsupported expressions and retain supported equality results", async () => {
    await owned("user-filter-contract", async f => {
      const host = await authRouter(f), user = await createUser(f, host, "filter-target");
      await createUser(f, host, "filter-other");
      const filters = [
        { label: "unsupported-contains", filter: 'displayName co "x"', ids: null },
        { label: "username-equality", filter: `USERNAME EQ "${user.userName.toUpperCase()}"`, ids: [user.id] },
        { label: "external-id-equality", filter: `externalId eq "${user.externalId}"`, ids: [user.id] },
        { label: "supported-equality-no-match", filter: 'userName eq "absent@example.test"', ids: [] }
      ];
      const rows: unknown[] = []; f.observations.push({ kind: "user-filter-rows", rows });
      for (const row of filters) {
        const query = new URLSearchParams({ filter: row.filter });
        const response = await scim(f, host, row.label, `/Users?${query}`);
        if (row.ids === null) rows.push({ label: row.label, response: responseView(f, response) });
        else {
          const b = jsonBody(f, response);
          const ids = Array.isArray(b.Resources) ? b.Resources.map((item: unknown) =>
            item && typeof item === "object" ? (item as { id?: unknown }).id : null) : null;
          rows.push({ label: row.label, status: response.status, schemas: b.schemas, totalResults: b.totalResults,
            startIndex: b.startIndex, itemsPerPage: b.itemsPerPage, ids });
        }
      }
      expect(rows).toEqual(filters.map(row => row.ids === null
        ? { label: row.label, response: expectedError("invalidFilter") }
        : { label: row.label, status: 200, schemas: LIST_SCHEMA, totalResults: row.ids.length, startIndex: 1,
          itemsPerPage: row.ids.length, ids: row.ids }));
    });
  });

  test("PATCH parser refuses malformed operations and raw non-string paths while preserving typed compatibility", async () => {
    await owned("patch-parser-wire-and-typed-contract", async f => {
      const host = await authRouter(f), user = await createUser(f, host, "parser-user"), path = `/Users/${user.id}`;
      const initial = await getUser(f, host, user.id, "before-parser-refusals");
      const canary = "synthetic-unsupported-op-canary";
      const malformed = [
        { label: "missing-operations", body: {} },
        { label: "non-array-operations", body: { Operations: {} } },
        { label: "empty-operations", body: { Operations: [] } },
        { label: "null-operation", body: { Operations: [null] } },
        { label: "array-operation", body: { Operations: [[]] } },
        { label: "missing-op", body: { Operations: [{}] } },
        { label: "unsupported-op", body: { Operations: [{ op: canary }] } }
      ];
      const rawPaths = [null, 7, true, {}, []];
      const rows: unknown[] = [], compatibility: unknown[] = [];
      f.observations.push({ kind: "parser-refusal-rows", initial, rows, compatibility });
      for (const row of malformed) {
        const response = await scim(f, host, row.label, path, "PATCH", row.body);
        const after = await getUser(f, host, user.id, `${row.label}-get`);
        rows.push({ label: row.label, response: responseView(f, response), reflectedCanary: response.body.includes(canary), after });
      }
      for (const [index, rawPath] of rawPaths.entries()) {
        const label = `non-string-path-${index}`;
        const response = await scim(f, host, label, path, "PATCH", { Operations: [{ op: "replace", path: rawPath, value: false }] });
        const after = await getUser(f, host, user.id, `${label}-get`);
        rows.push({ label, response: responseView(f, response), reflectedCanary: response.body.includes(canary), after });
      }
      const value = { synthetic: "value-object-preserved" };
      const typed = [
        { label: "omitted-path", operation: { op: "RePlAcE", value }, expectedOp: "replace", expectedPath: null },
        { label: "empty-string-path", operation: { op: "RePlAcE", path: "", value }, expectedOp: "replace", expectedPath: "" },
        { label: "explicit-undefined-path", operation: { op: "RePlAcE", path: undefined, value }, expectedOp: "replace", expectedPath: null },
        { label: "mixed-case-member-id", operation: { op: "ReMoVe", path: 'members[value eq "UserCaseA"]', value },
          expectedOp: "remove", expectedPath: 'members[value eq "UserCaseA"]' }
      ];
      for (const row of typed) {
        try {
          const parsed = parseScimPatchOperations({ Operations: [row.operation] });
          compatibility.push({ label: row.label, count: parsed.length, op: parsed[0]?.op ?? null,
            path: parsed[0]?.path ?? null, pathIsUndefined: parsed[0]?.path === undefined,
            valueSameObject: parsed[0]?.value === value, error: null });
        } catch (error) { compatibility.push({ label: row.label, error: fact(f, "typed-parser", error) }); }
      }
      expect(rows).toEqual([
        ...malformed.map(row => ({ label: row.label, response: expectedError("invalidValue"), reflectedCanary: false, after: initial })),
        ...rawPaths.map((_, index) => ({ label: `non-string-path-${index}`, response: expectedError("invalidPath"), reflectedCanary: false, after: initial }))
      ]);
      expect(compatibility).toEqual(typed.map(row => ({ label: row.label, count: 1, op: row.expectedOp,
        path: row.expectedPath, pathIsUndefined: row.expectedPath === null, valueSameObject: true, error: null })));
    });
  });
});
