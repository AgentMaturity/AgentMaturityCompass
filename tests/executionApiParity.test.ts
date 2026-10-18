import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
import { addUser } from "../src/auth/authApi.js";
import { EXECUTION_SURFACES, EXECUTION_VERBS } from "../src/execution/executionContract.js";
import * as sdk from "../src/sdk/nativeAgentClient.js";
import { generateFullOpenApiSpec } from "../src/studio/openapi.js";
import { openLedger } from "../src/ledger/ledger.js";
import { AMCNativeClient, AMCNativeRefusedError, type AMCNativeClientOptions, type AMCNativeUpdate } from "../src/sdk/nativeAgentClient.js";
import { readNativeSessionEvents } from "../src/session/readNativeSessionEvents.js";
import type { NativeTaskPoll, NativeTaskView } from "../src/studio/nativeTaskTypes.js";
import { lockVault } from "../src/vault/vault.js";

/**
 * P2-13 parity matrix: ONE scripted scenario through the CLI (spawned), the TypeScript SDK, the Python wrapper (spawned
 * sdk/python/tests/test_parity.py) and the Studio HTTP API (the built server, logged-in fixture identities), each in its
 * own `amc init --regulated` workspace. Start; a first turn whose fs.read call waits for a signed WRITE_HIGH approval,
 * refused for the run's initiator and given by two other reviewers; the streamed updates; dispose; resume of the same
 * session; a lineage fork whose turn is cancelled while it waits for its approval; cold verification of the parent; a
 * fork of the parent once tampered. The normalized records must be identical: verbs, phase states, receipt states,
 * verdicts and the refusal reason. A surface that drops a verb or mislabels a phase fails.
 *
 * Stub provider only: a synthetic demonstration, never a real-model result. The reviewers are automated fixture
 * identities, not human decisions.
 */
const CLI = resolve("dist/cli.js");
const READ = JSON.stringify({ tool: "fs.read", arguments: { path: "workspace/n.txt" } });
const REVIEWERS = ["parity-reviewer-1", "parity-reviewer-2"] as const;
const OWNER = { username: "parity-owner", password: "parity-owner-password" };
const OS_USER = userInfo().username;
const phases = (model: string, evidence: string) => ({ admission: "succeeded", "model-completion": model, "side-effect-completion": "succeeded",
  "evidence-verification": evidence });
/** sdk/python/tests/test_parity.py holds the same value. */
const EXPECTED = {
  verbs: [...EXECUTION_VERBS].sort(),
  initiatorApproval: "refused",
  streamed: true,
  toolCalled: true,
  approvedTurn: phases("succeeded", "pending"),
  cancelledTurn: phases("failed", "pending"),
  resumedSameSession: true,
  verified: phases("succeeded", "succeeded"),
  receiptStates: [],
  recheckFailures: [],
  tamperedParentFork: "TAMPERED"
};
type Leg = Record<string, unknown> & { ids: { parent: string; child: string } };
interface Fixture { readonly root: string; readonly workspace: string; readonly env: Record<string, string> }
const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

/** `amc init --regulated`, as an operator runs it, plus the file the scenario reads. */
function regulatedWorkspace(surface: string): Fixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `amc-parity-${surface}-`)));
  roots.push(root);
  const workspace = join(root, "workspace"), home = join(root, "home");
  mkdirSync(workspace); mkdirSync(home, { mode: 0o700 });
  const env: Record<string, string> = { AMC_HOME: home, AMC_VAULT_PASSPHRASE: `parity-${randomUUID()}`, AMC_CONTROL_CHECKPOINT_DIR: join(root, "checkpoints"),
    AMC_BOOTSTRAP_OWNER_USERNAME: OWNER.username, AMC_BOOTSTRAP_OWNER_PASSWORD: OWNER.password, NO_COLOR: "1" };
  const init = spawnSync(process.execPath, [CLI, "init", "--regulated"], { cwd: workspace, env: { ...process.env, ...env }, encoding: "utf8" });
  expect(init.status, init.stderr).toBe(0);
  const fingerprint = /AMC_EXPECTED_MONITOR_FINGERPRINT=([a-f0-9]{64})/.exec(init.stdout)?.[1];
  expect(fingerprint).toBeDefined();
  mkdirSync(join(workspace, "workspace")); writeFileSync(join(workspace, "workspace", "n.txt"), "parity fixture\n");
  return { root, workspace, env: { ...env, AMC_EXPECTED_MONITOR_FINGERPRINT: fingerprint! } };
}

function tamper(workspace: string, sessionId: string): void {
  const ledger = openLedger(workspace);
  try {
    for (const trigger of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence"]) ledger.db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
    ledger.db.prepare("UPDATE evidence_events SET payload_sha256 = ? WHERE id = (SELECT id FROM evidence_events WHERE session_id = ? ORDER BY rowid LIMIT 1 OFFSET 1)")
      .run("0".repeat(64), sessionId);
  } finally { ledger.close(); }
}

async function until<T>(read: () => Promise<T | undefined> | T | undefined, what: string): Promise<T> {
  const deadline = Date.now() + 90_000;
  for (;;) {
    const value = await read();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((done) => setTimeout(done, 100));
  }
}

function cli(f: Fixture, args: readonly string[]): { child: ChildProcess; done: Promise<{ code: number | null; stdout: string; stderr: string }> } {
  const child = spawn(process.execPath, [CLI, ...args], { cwd: f.workspace, env: { ...process.env, ...f.env } });
  let stdout = "", stderr = "";
  child.stdout!.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
  child.stderr!.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
  return { child, done: new Promise((done) => child.once("close", (code) => done({ code, stdout, stderr }))) };
}
const cliJson = (output: { stdout: string }) => JSON.parse(output.stdout) as { sessionId: string; toolCalls: number;
  execution: { phases: unknown; receiptStates: string[]; recheckFailures: string[] } };

async function cliLeg(f: Fixture): Promise<Leg> {
  const verbs = new Set<string>(), record: Record<string, unknown> = {};
  const flags = ["--provider", "stub", "--tools", "workspace", "--approve-tools", "WRITE_HIGH", "--json"];
  const pending = (exclude: string[]) => until(async () => {
    const listed = JSON.parse((await cli(f, ["approvals", "list", "--agent=default", "--status=pending", "--json"]).done).stdout) as { requests: { approvalRequestId: string }[] };
    return listed.requests.map((r) => r.approvalRequestId).find((id) => !exclude.includes(id));
  }, "a CLI approval");
  const approve = (id: string, username: string) => cli(f, ["approvals", "approve", id, "--agent=default", "--mode=execute",
    "--reason=parity fixture reviewer, not a human decision", `--username=${username}`, "--roles=APPROVER"]).done;
  const first = cli(f, ["agent-loop", "run", READ, ...flags, "--stream", "--keep-open"]);
  verbs.add("start");
  const approval = await pending([]);
  record.initiatorApproval = (await approve(approval, OS_USER)).code === 0 ? "accepted" : "refused";
  for (const reviewer of REVIEWERS) expect((await approve(approval, reviewer)).code).toBe(0);
  verbs.add("approve");
  const approved = await first.done;
  expect(approved.code, approved.stderr).toBe(0);
  const summary = cliJson(approved), parent = summary.sessionId;
  record.streamed = approved.stderr.includes("Live reply"); verbs.add("stream");
  record.toolCalled = summary.toolCalls > 0;
  record.approvedTurn = summary.execution.phases; record.receiptStates = summary.execution.receiptStates;
  record.recheckFailures = summary.execution.recheckFailures;
  verbs.add("dispose"); // --keep-open released the writer; the process then exited.
  const resumed = await cli(f, ["agent-loop", "run", "hello", "--session", parent, ...flags]).done;
  expect(resumed.code, resumed.stderr).toBe(0);
  record.resumedSameSession = cliJson(resumed).sessionId === parent; verbs.add("resume");
  const forked = cli(f, ["agent-loop", "run", READ, "--fork-from", parent, ...flags]);
  await pending([approval]);
  forked.child.kill("SIGINT"); // The CLI's Ctrl-C: a signed user cancellation of the waiting turn.
  const cancelled = await forked.done;
  const child = cliJson(cancelled).sessionId;
  verbs.add("fork");
  record.cancelledTurn = cliJson(cancelled).execution.phases; verbs.add("cancel");
  const verified = await cli(f, ["agent-loop", "verify", parent, "--json"]).done;
  expect(verified.code, verified.stderr).toBe(0);
  record.verified = (JSON.parse(verified.stdout) as { execution: { phases: unknown } }).execution.phases; verbs.add("verify");
  tamper(f.workspace, parent);
  const refused = await cli(f, ["agent-loop", "run", "hello", "--fork-from", parent, ...flags]).done;
  record.tamperedParentFork = refused.code === 0 ? "accepted" : /\b(MISSING|SEALED|TAMPERED|UNSUPPORTED_FORMAT)\b/.exec(refused.stderr)?.[1];
  return { ...record, verbs: [...verbs].sort(), ids: { parent, child } };
}

async function typescriptLeg(f: Fixture): Promise<Leg> {
  const verbs = new Set<string>(), record: Record<string, unknown> = {};
  const options: AMCNativeClientOptions = { workspace: f.workspace, provider: "stub", tools: "workspace", approveTools: "WRITE_HIGH",
    command: [process.execPath, CLI], env: f.env, timeoutMs: 120_000 };
  const pending = (client: AMCNativeClient, exclude: string[]) =>
    until(async () => (await client.pendingApprovals()).map((a) => a.approvalRequestId).find((id) => !exclude.includes(id)), "an SDK approval");
  const approve = (client: AMCNativeClient, id: string, username: string) =>
    client.approve({ approvalRequestId: id, reason: "parity fixture reviewer, not a human decision", username, roles: ["APPROVER"] });
  const first = await AMCNativeClient.start(options);
  const session = await first.newSession(), parent = session.sessionId;
  verbs.add("start");
  const turn = session.prompt(READ), seen: AMCNativeUpdate[] = [];
  const streaming = (async () => { for await (const update of turn) seen.push(update); })();
  const approval = await pending(first, []);
  try { await approve(first, approval, OS_USER); record.initiatorApproval = "accepted"; }
  catch (error) { if (!(error instanceof AMCNativeRefusedError)) throw error; record.initiatorApproval = "refused"; }
  for (const reviewer of REVIEWERS) await approve(first, approval, reviewer);
  verbs.add("approve");
  const approved = await turn.result; await streaming;
  record.streamed = seen.length > 0; verbs.add("stream");
  record.toolCalled = approved.updates.some((u) => u.update.sessionUpdate === "tool_call");
  record.approvedTurn = approved.execution!.phases; record.receiptStates = approved.execution!.receiptStates;
  record.recheckFailures = approved.execution!.recheckFailures;
  await first.dispose(); verbs.add("dispose");
  const second = await AMCNativeClient.start(options);
  const resumed = await second.resumeSession(parent);
  record.resumedSameSession = resumed.sessionId === parent; verbs.add("resume");
  await resumed.prompt("hello").result;
  const child = await second.forkSession(parent); verbs.add("fork");
  const waiting = child.prompt(READ);
  await pending(second, [approval]);
  waiting.cancel();
  record.cancelledTurn = (await waiting.result).execution!.phases; verbs.add("cancel");
  await second.close();
  record.verified = (await second.verifySession(parent)).execution.phases; verbs.add("verify");
  tamper(f.workspace, parent);
  const third = await AMCNativeClient.start(options);
  try { await third.forkSession(parent); record.tamperedParentFork = "accepted"; }
  catch (error) { record.tamperedParentFork = ((error as AMCNativeRefusedError).data as { reason?: string } | undefined)?.reason; }
  finally { await third.close(); }
  return { ...record, verbs: [...verbs].sort(), ids: { parent, child: child.sessionId } };
}

async function pythonLeg(f: Fixture): Promise<Leg> {
  const out = join(f.root, "python-parity.json");
  const python = process.env.AMC_PARITY_PYTHON ?? "python3";
  const run = spawnSync(python, ["-B", "sdk/python/tests/test_parity.py"], { encoding: "utf8", timeout: 300_000,
    env: { ...process.env, ...f.env, AMC_BIN: CLI, AMC_PARITY_WORKSPACE: f.workspace, AMC_PARITY_OUT: out, PYTHONPATH: resolve("sdk/python") } });
  expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
  return JSON.parse(readFileSync(out, "utf8")) as Leg;
}

async function studioLeg(f: Fixture): Promise<Leg> {
  const verbs = new Set<string>(), record: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(f.env)) vi.stubEnv(key, value);
  for (const reviewer of REVIEWERS) addUser({ workspace: f.workspace, username: reviewer, password: `${reviewer}-password`, roles: ["APPROVER"] });
  const built = await import(pathToFileURL(resolve("dist/studio/studioServer.js")).href) as typeof import("../src/studio/studioServer.js");
  const server = await built.startStudioApiServer({ workspace: f.workspace, host: "127.0.0.1", port: 0, token: `parity-${randomUUID()}` });
  try {
    const identities: Record<string, { cookie: string; csrf: string }> = {};
    for (const [name, password] of [[OWNER.username, OWNER.password], ...REVIEWERS.map((r) => [r, `${r}-password`])] as const) {
      const login = await fetch(`${server.url}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: name, password }) });
      expect(login.status).toBe(200); await login.arrayBuffer();
      const cookie = login.headers.getSetCookie().find((value) => value.startsWith("amc_session="))!.split(";")[0]!;
      const me = await (await fetch(`${server.url}/auth/me`, { headers: { cookie } })).json() as { nativeCsrfToken: string };
      identities[name] = { cookie, csrf: me.nativeCsrfToken };
    }
    const request = async (path: string, body?: unknown, identity: string = OWNER.username) => {
      const who = identities[identity]!;
      const response = await fetch(server.url + path, { method: body === undefined ? "GET" : "POST", headers: { cookie: who.cookie, "content-type": "application/json",
        ...(body === undefined ? {} : { origin: server.url, "x-amc-native-intent": "task-workspace-v1", "x-amc-native-csrf": who.csrf }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() as { data?: unknown; code?: string } };
    };
    const task = (id: string, action = "") => `/api/v1/native-tasks/${id}${action ? `/${action}` : ""}?agentId=default`;
    const poll = async (id: string) => (await request(task(id))).body.data as NativeTaskPoll;
    const settled = (id: string) => until(async () => { const { task: view } = await poll(id); return ["idle", "failed", "released", "closed"].includes(view.state) ? view : undefined; }, "a settled task");
    const awaiting = (id: string) => until(async () => (await poll(id)).task.approvals.find((a) => a.status === "PENDING")?.approvalRequestId, "a Studio approval");
    const decide = (id: string, identity: string) => request(`/approvals/requests/${id}/decide?agentId=default`,
      { decision: "APPROVE_EXECUTE", reason: "parity fixture reviewer, not a human decision" }, identity);
    const control = async (id: string, action: string, revision: number) => (await request(task(id, action), { expectedRevision: revision })).body.data as NativeTaskView;
    const options = (await request("/api/v1/native-tasks/options?agentId=default")).body.data as { scope: { digest: string; ready: boolean } };
    expect(options.scope.ready).toBe(true);
    const started = await request("/api/v1/native-tasks", { clientRequestId: randomUUID(), agentId: "default", provider: "stub", tools: "workspace",
      toolsDigest: options.scope.digest, prompt: READ, maxSteps: 3, maxTokens: 128 });
    expect(started.status, JSON.stringify(started.body)).toBe(202);
    const parentTask = (started.body.data as NativeTaskView).taskId;
    verbs.add("start");
    const approval = await awaiting(parentTask);
    const own = await decide(approval, OWNER.username);
    record.initiatorApproval = own.status === 200 ? "accepted" : own.status === 403 ? "refused" : `status ${own.status}`;
    for (const reviewer of REVIEWERS) expect((await decide(approval, reviewer)).status).toBe(200);
    // A stale approval ID is refused: one no longer pending (409), one that names nothing (404).
    expect((await decide(approval, REVIEWERS[0])).status).toBe(409);
    expect((await decide(`apprreq_${"0".repeat(32)}`, REVIEWERS[0])).status).toBe(404);
    verbs.add("approve");
    let view = await settled(parentTask);
    const events = (await poll(parentTask)).events;
    record.streamed = events.length > 0; verbs.add("stream");
    record.toolCalled = events.some((event) => event.kind === "tool");
    record.approvedTurn = view.execution!.phases; record.receiptStates = view.execution!.receiptStates;
    record.recheckFailures = view.execution!.recheckFailures;
    const parent = view.sessionId!;
    view = await control(parentTask, "release", view.revision); verbs.add("dispose");
    view = await control(parentTask, "resume", view.revision);
    record.resumedSameSession = view.state === "idle" && view.sessionId === parent; verbs.add("resume");
    await request(task(parentTask, "turn"), { clientRequestId: randomUUID(), expectedRevision: view.revision, prompt: "hello" });
    view = await settled(parentTask);
    const forked = await request(task(parentTask, "fork"), { clientRequestId: randomUUID(), expectedRevision: view.revision });
    expect(forked.status, JSON.stringify(forked.body)).toBe(202);
    const child = forked.body.data as NativeTaskView; verbs.add("fork");
    await request(task(child.taskId, "turn"), { clientRequestId: randomUUID(), expectedRevision: child.revision, prompt: READ });
    await awaiting(child.taskId);
    await control(child.taskId, "cancel", child.revision + 1);
    const cancelled = await settled(child.taskId);
    record.cancelledTurn = cancelled.execution!.phases; verbs.add("cancel");
    await control(child.taskId, "verify", cancelled.revision);
    view = await control(parentTask, "verify", view.revision);
    expect(view.verification).not.toBe("failed");
    record.verified = view.execution!.phases; verbs.add("verify");
    tamper(f.workspace, parent);
    const refused = await request(task(parentTask, "fork"), { clientRequestId: randomUUID(), expectedRevision: view.revision });
    record.tamperedParentFork = refused.status === 202 ? "accepted" : refused.body.code?.replace(/^NATIVE_FORK_/, "");
    return { ...record, verbs: [...verbs].sort(), ids: { parent, child: child.sessionId! } };
  } finally {
    await server.close(); lockVault(f.workspace); vi.unstubAllEnvs();
  }
}

describe("one execution API across the CLI, the TypeScript SDK, the Python wrapper and Studio (P2-13)", () => {
  it("names only entry points that exist on the CLI, the TypeScript SDK and the Studio API", () => {
    for (const name of Object.values(EXECUTION_SURFACES.typescript)) {
      const [owner, member] = name.split(".") as [keyof typeof sdk, string | undefined];
      const exported = sdk[owner] as unknown as { prototype: Record<string, unknown> } & Record<string, unknown>;
      expect(typeof exported, name).toBe("function");
      if (member) expect(typeof exported[member] === "function" || typeof exported.prototype[member] === "function", name).toBe(true);
    }
    const paths = generateFullOpenApiSpec().paths as Record<string, Record<string, unknown>>;
    const normalized = new Map(Object.entries(paths).map(([path, operations]) => [path.replace(/\{[^}]+\}/g, "{}"), operations]));
    for (const route of Object.values(EXECUTION_SURFACES.studio)) {
      const [method, path] = route.split(" ") as [string, string];
      expect(normalized.get(path.split("?")[0]!.replace(/\{[^}]+\}/g, "{}"))?.[method.toLowerCase()], route).toBeDefined();
    }
    for (const command of Object.values(EXECUTION_SURFACES.cli)) {
      const [, ...words] = command.split(" ");
      const flags = words.filter((word) => word.startsWith("--")), path = words.filter((word) => !word.startsWith("--"));
      const help = spawnSync(process.execPath, [CLI, ...path, "--help"], { encoding: "utf8" });
      expect(help.status, command).toBe(0);
      for (const flag of flags) expect(help.stdout, command).toContain(flag);
    }
  }, 120_000);


  const legs: Record<string, (f: Fixture) => Promise<Leg>> = { cli: cliLeg, typescript: typescriptLeg, python: pythonLeg, studio: studioLeg };

  it.each(Object.keys(legs))("the %s surface runs the scripted scenario with the contract's verbs, phases and refusals", async (surface) => {
    const f = regulatedWorkspace(surface);
    const leg = await legs[surface]!(f);
    // The fork is a lineage fork on every surface: the child's signed open row names the parent.
    const opening = readNativeSessionEvents(f.workspace, leg.ids.child)[0]!;
    expect(opening.event_type).toBe("session/open");
    expect((JSON.parse(opening.meta_json) as { parentSession?: { sessionId: string } }).parentSession?.sessionId).toBe(leg.ids.parent);
    expect(Object.fromEntries(Object.keys(EXPECTED).map((key) => [key, leg[key]]))).toEqual(EXPECTED);
  }, 600_000);
});
