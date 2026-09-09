import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { initUsersConfig, addUser } from "../../src/auth/authApi.js";
import { openSessionEventStore } from "../../src/persistence/openSessionEventStore.js";
import { loadSessionEventHistory } from "../../src/session/sessionEventHistory.js";
import { lockVault } from "../../src/vault/vault.js";
import { validationOperatorFixture, type OutcomeCase } from "./nativeValidationOperator.js";
import type { NativeTaskView, NativeTaskPoll } from "../../src/studio/nativeTaskTypes.js";

const API = "/api/v1/native-tasks";
type Identity = { username: string; password: string; cookie: string; csrf: string };
export type PublicTaskFixture = Awaited<ReturnType<typeof publicTaskHttpFixture>>;

/** Real built Studio/auth/router/service/ACP processes, with disposable operator inputs. */
export async function publicTaskHttpFixture(mode: OutcomeCase = "success", backend: "sqlite" | "jsonl" = "sqlite") {
  const parent = process.env.AMC_PUBLIC_TRANSPORT_RECEIPTS ?? tmpdir();
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const root = realpathSync(mkdtempSync(join(parent, `public-task-${backend}-${mode}-`)));
  const workspace = join(root, "workspace"), home = join(root, "operator-home");
  mkdirSync(home, { mode: 0o700 });
  const chosen: Record<string, string | undefined> = {
    AMC_HOME: home, AMC_CREDENTIALS_FILE: join(home, "credentials.yaml"),
    AMC_VAULT_PASSPHRASE: "disposable-public-task-transport-fixture", AMC_VAULT_PASSPHRASE_FILE: undefined,
    AMC_VAULT_REMEMBER: "0", AMC_SESSION_STORE: undefined, AMC_EXPECTED_MONITOR_FINGERPRINT: undefined,
    AMC_NO_SIGN: undefined, AMC_NATIVE_VALIDATION_CONFIG: join(workspace, "operator-checks.json"),
    AMC_CONTROL_CHECKPOINT_DIR: join(root, "control-checkpoints"),
    OPENAI_API_KEY: undefined, ANTHROPIC_API_KEY: undefined,
  };
  const prior = Object.fromEntries(Object.keys(chosen).map(key => [key, process.env[key]]));
  const environment = (values: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  };
  environment(chosen);
  let server: Awaited<ReturnType<typeof import("../../src/studio/studioServer.js").startStudioApiServer>> | undefined;
  const observations: Record<string, unknown>[] = [], closures: Record<string, unknown>[] = [];
  const identities = Object.fromEntries(["owner", "other", "viewer", "ada", "grace"].map(name => [name,
    { username: `fixture-${name}`, password: `fixture-${randomUUID()}`, cookie: "", csrf: "" }])) as Record<string, Identity>;
  let closed = false;
  const save = () => writeFileSync(join(root, "http-receipt.json"), JSON.stringify({
    kind: "real-built-Studio-HTTP-with-automated-fixture-identities", backend, mode, workspace,
    node: process.version, platform: process.platform, arch: process.arch, observations, closures,
    limits: ["No human participant or real model", "Not installed-package or release acceptance", "Fixture workspaces retained privately"],
  }, null, 2) + "\n", { mode: 0o600 });
  try {
    const operator = validationOperatorFixture(workspace, mode);
    openSessionEventStore(workspace, backend).close();
    initUsersConfig({ workspace, username: identities.owner!.username, password: identities.owner!.password });
    for (const name of ["other", "viewer", "ada", "grace"] as const) {
      const user = identities[name]!;
      addUser({ workspace, username: user.username, password: user.password,
        roles: name === "other" ? ["OWNER"] : name === "viewer" ? ["VIEWER"] : ["APPROVER"] });
    }
    const built = await import(pathToFileURL(resolve("dist/studio/studioServer.js")).href) as typeof import("../../src/studio/studioServer.js");
    const admin = `local-fixture-${randomUUID()}`;
    server = await built.startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: admin });
    const base = server.url;
    async function login(name: string): Promise<void> {
      const user = identities[name]!;
      const response = await fetch(`${base}/auth/login`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: user.username, password: user.password }), signal: AbortSignal.timeout(15_000) });
      assert.equal(response.status, 200, `Actual fixture login ${name} failed`);
      await response.arrayBuffer();
      const cookie = response.headers.getSetCookie().find(value => value.startsWith("amc_session="));
      assert.ok(cookie, "Actual login must set a session cookie"); user.cookie = cookie.split(";")[0]!;
      const me = await fetch(`${base}/auth/me`, { headers: { cookie: user.cookie }, signal: AbortSignal.timeout(15_000) });
      assert.equal(me.status, 200); const body = await me.json() as { nativeCsrfToken: string };
      assert.match(body.nativeCsrfToken, /^[a-f0-9]{64}$/); user.csrf = body.nativeCsrfToken;
    }
    for (const name of Object.keys(identities)) await login(name);
    async function request(path: string, options: { method?: string; body?: unknown; identity?: string;
      headers?: Record<string, string | undefined> } = {}) {
      const identity = identities[options.identity ?? "owner"];
      const method = options.method ?? (options.body === undefined ? "GET" : "POST");
      const headers: Record<string, string> = { ...(identity ? { cookie: identity.cookie } : {}), "content-type": "application/json" };
      if (method !== "GET") Object.assign(headers, { origin: base, "x-amc-native-intent": "task-workspace-v1",
        ...(identity ? { "x-amc-native-csrf": identity.csrf } : {}) });
      for (const [key, value] of Object.entries(options.headers ?? {})) {
        if (value === undefined) delete headers[key]; else headers[key] = value;
      }
      const response = await fetch(base + path, { method, headers, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }), signal: AbortSignal.timeout(40_000) });
      const text = await response.text();
      const body = JSON.parse(text) as { ok?: boolean; data?: any; code?: string; error?: string };
      observations.push({ at: new Date().toISOString(), method, path, identity: options.identity ?? "owner",
        requestSha256: options.body === undefined ? null : createHash("sha256").update(JSON.stringify(options.body)).digest("hex"),
        status: response.status, cacheControl: response.headers.get("cache-control"), body }); save();
      return { status: response.status, body };
    }
    const taskPath = (id: string, action = "") => `${API}/${id}${action ? `/${action}` : ""}?agentId=default`;
    async function poll(id: string, cursor = 0): Promise<NativeTaskPoll> {
      const response = await request(`${taskPath(id)}&cursor=${cursor}`);
      assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body.data as NativeTaskPoll;
    }
    const decided = new Set<string>();
    async function settle(id: string, decide = true): Promise<NativeTaskView> {
      const deadline = Date.now() + 35_000;
      for (;;) {
        const { task } = await poll(id);
        if (decide) for (const approval of task.approvals) {
          if (decided.has(approval.approvalRequestId)) continue;
          assert.equal(approval.toolName, "bash"); assert.equal(approval.actionClass, "WRITE_HIGH"); assert.equal(approval.required, 2);
          for (const identity of mode === "denied" ? ["ada"] : ["ada", "grace"]) {
            const response = await request(`/approvals/${approval.approvalRequestId}/${mode === "denied" ? "deny" : "approve"}?agentId=default`,
              { identity, body: { decision: mode === "denied" ? "DENY" : "APPROVE_EXECUTE", reason: "Automated fixture reviewer; not a human approval study." } });
            assert.equal(response.status, 200, JSON.stringify(response.body));
          }
          decided.add(approval.approvalRequestId);
        }
        if (["idle", "failed", "closed", "released"].includes(task.state)) return task;
        assert.ok(Date.now() < deadline, `Actual task did not settle: ${JSON.stringify(task)}`);
        await new Promise(done => setTimeout(done, 100));
      }
    }
    async function control(id: string, action: string, revision: number) {
      return request(taskPath(id, action), { body: { expectedRevision: revision } });
    }
    async function restart(): Promise<void> {
      assert.ok(server); const port = server.port;
      await server.close(); closures.push({ kind: "Studio-restart-stop", port, listening: server.server.listening });
      assert.equal(server.server.listening, false); server = undefined;
      server = await built.startStudioApiServer({ workspace, host: "127.0.0.1", port, token: admin });
      assert.equal(server.url, base); save();
    }
    async function close(): Promise<void> {
      if (closed) return; closed = true;
      try {
        if (server) { await server.close(); closures.push({ kind: "Studio-final-stop", port: server.port, listening: server.server.listening }); assert.equal(server.server.listening, false); }
      } finally { save(); lockVault(workspace); environment(prior); }
    }
    return { root, workspace, backend, mode, base, identities, operator, request, poll, settle, control, restart, close,
      taskPath, observations, closures,
      input: (prompt = "Record an automated public transport task.", checks = false) => ({ clientRequestId: randomUUID(),
        agentId: "default", provider: "stub" as const, tools: checks ? "workspace" as const : "none" as const, prompt,
        ...(checks ? { toolsDigest: operator.toolsDigest, validation: { configSha256: operator.sha256, checkIds: ["public"] } } : {}),
        maxSteps: 3, maxTokens: 128 }),
      history: (sessionId: string) => loadSessionEventHistory({ workspace, sessionId, agentId: "default" }),
      jsonlBytes: () => readFileSync(join(workspace, ".amc/jsonl/events.jsonl")),
    };
  } catch (error) {
    try { await server?.close(); } finally { save(); lockVault(workspace); environment(prior); }
    throw error;
  }
}
