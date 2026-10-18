import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { mintIdempotencyKey } from "../../src/actions/idempotency.js";
import type { ActionRequest } from "../../src/actions/actionJournal.js";
import { getAgentPaths } from "../../src/fleet/paths.js";
import { buildAgentConfig, scaffoldAgent, verifyAgentConfigSignature } from "../../src/fleet/registry.js";
import { executeHttpFetch } from "../../src/toolhub/toolhubExecutors/http.js";
import { ToolPipeline } from "../../src/tools/toolPipeline.js";
import { defineTool, ToolRegistry } from "../../src/tools/toolRegistry.js";
import { toolhubAllowlistGuard } from "../../src/tools/guards/policyGuards.js";
import type { ToolBody, ToolExecution, ToolOutcome } from "../../src/tools/toolTypes.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { PAYMENT_TOOL } from "../helpers/actionFaults.js";
import { checkedChain, createP104Fixture, oracleCounts, signedArtifact, type P104Fixture, type P104Options } from "../helpers/p104Qualification.js";
import type { PaymentBody } from "../fixtures/actions/fakeSystemOfRecord.js";

const KEY = /^amc1_[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const ARGS = { amount: "100", currency: "USD", payee: "owned-recipient" };
const BODY: PaymentBody = { amount: "100", currency: "USD", recipient: "owned-recipient" };
const ARGUMENT_TOOL = "p104.argument-payment";
type Own = (close: () => Promise<void>) => void;

// Reuse the closed signed-workspace fixture; this file only owns its local transport resources.
async function usingFixture(options: P104Options, body: (f: P104Fixture, own: Own) => Promise<void>): Promise<void> {
  const f = createP104Fixture(options), closers: Array<() => Promise<void>> = [];
  let bodyFailed = false, bodyError: unknown;
  try { await body(f, close => closers.push(close)); } catch (error) { bodyFailed = true; bodyError = error; }
  const cleanupErrors: unknown[] = [];
  for (const close of closers.reverse()) { try { await close(); } catch (error) { cleanupErrors.push(error); } }
  f.observations.push({ kind: "idempotency-resource-closure", errors: cleanupErrors.map(String) });
  try { f.finish(!bodyFailed && cleanupErrors.length === 0); } catch (error) { cleanupErrors.push(error); }
  if (cleanupErrors.length) throw new AggregateError(bodyFailed ? [bodyError, ...cleanupErrors] : cleanupErrors, "Owned P104 idempotency cleanup failed");
  if (bodyFailed) throw bodyError;
}

function pipeline(f: P104Fixture, name: string, body: ToolBody): ToolPipeline {
  const registry = new ToolRegistry();
  registry.define(defineTool({ name, actionClass: "FINANCIAL", description: "Owned local idempotency witness", body }));
  registry.guard("signed tools allowlist", toolhubAllowlistGuard(f.workspace, execution => registry.visible(execution.agentId).get(execution.name)));
  return new ToolPipeline({ registry, workspace: f.workspace, journal: () => f.journal,
    authorizationContext: () => ({ sessionId: f.sessionId }),
    record: (execution, outcome) => f.recordings.push({ execution, outcome }) });
}
function call(p: ToolPipeline, name = PAYMENT_TOOL, args: Record<string, unknown> = ARGS, agentId = "default"): Promise<ToolOutcome> {
  return p.execute({ name, agentId, arguments: { ...args }, requestedMode: "EXECUTE", callId: `p104-call-${randomUUID()}` });
}
function boundKey(f: P104Fixture, execution: ToolExecution): string {
  expect(execution.idempotencyKey).toMatch(KEY);
  const key = execution.idempotencyKey!;
  expect(execution.authorization).toBeDefined();
  const record = execution.authorization!.record;
  expect(record.executionId).toBe(execution.executionId);
  expect(record.idempotencyKey).toBe(key);
  const view = f.journal.get(execution.executionId!)!;
  expect(view.intent).toMatchObject({ executionId: execution.executionId, idempotencyKey: key,
    authorizationId: record.authorizationId, argumentsDigest: record.action.argumentsDigest });
  const chain = checkedChain(f, execution.executionId!);
  expect(chain.map(row => row.idempotencyKey)).toEqual(Array(chain.length).fill(key));
  expect(chain.some(row => row.state === "started")).toBe(true);
  const index = f.ledger.db.prepare("SELECT idempotency_key FROM action_executions WHERE execution_id = ?")
    .get(execution.executionId) as { idempotency_key: string };
  expect(index.idempotency_key).toBe(key);
  return key;
}

interface WireObservation {
  method: string; path: string; rawHeaders: string[]; body: PaymentBody; keys: string[];
  result: { status: number; ref: string | null; replayed: boolean };
}
async function origin(f: P104Fixture, header: string, own: Own) {
  const rows: WireObservation[] = [], errors: string[] = [];
  const file = join(f.root, "wire-observations.json");
  const save = (): void => writeFileSync(file, JSON.stringify({ header, rows, errors }, null, 2) + "\n", { mode: 0o600 });
  save();
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.setTimeout(2_000, () => request.destroy(new Error("Owned HTTP request stalled")));
    request.on("error", error => { errors.push(error.message); save(); });
    request.on("data", chunk => chunks.push(Buffer.from(chunk)));
    request.once("end", () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as PaymentBody;
        if (![body.amount, body.currency, body.recipient].every(value => typeof value === "string")) throw new Error("Invalid owned payment body");
        const keys: string[] = [];
        for (let i = 0; i < request.rawHeaders.length; i += 2) {
          if (request.rawHeaders[i]!.toLowerCase() === header.toLowerCase()) keys.push(request.rawHeaders[i + 1]!);
        }
        const result = keys.length === 1 && KEY.test(keys[0]!) ? f.sor.pay(keys[0]!, body, null)
          : { status: 400, ref: null, replayed: false };
        rows.push({ method: request.method ?? "", path: request.url ?? "", rawHeaders: [...request.rawHeaders], body, keys, result });
        save();
        response.writeHead(result.status, { "content-type": "application/json", connection: "close" }).end(JSON.stringify(result));
      } catch (error) {
        errors.push(String(error)); save();
        response.writeHead(400, { connection: "close" }).end("owned fixture rejected request");
      }
    });
  });
  server.on("error", error => { errors.push(error.message); save(); });
  own(() => new Promise<void>((resolve, reject) => {
    if (!server.listening) { resolve(); return; }
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Owned oracle listener did not bind");
  return { url: `http://127.0.0.1:${address.port}/payments`, rows, errors, file };
}
function httpPolicy(header: string): P104Options {
  return { configureTools: config => {
    const tool = config.tools.allowedTools.find(item => item.name === PAYMENT_TOOL)!;
    tool.effects = { repeatable: false, idempotency: { carrier: "http-header", name: header } };
  } };
}
function httpPipeline(f: P104Fixture, endpoint: string, header: string, loseReply = false) {
  const executions: ToolExecution[] = [];
  const p = pipeline(f, PAYMENT_TOOL, async execution => {
    executions.push(execution);
    expect(execution.idempotencyHeader).toBe(header);
    const key = boundKey(f, execution);
    const before = f.journal.get(execution.executionId!)!;
    expect(before.state).toBe("started");
    f.beforeEffects.push({ kind: "actual-http-before-effect", view: before, key });
    const reply = await executeHttpFetch({ url: endpoint, method: "POST", workspace: f.workspace, simulate: false,
      headers: { [header]: "model-exact", [header.toLowerCase()]: "model-lower", [header.toUpperCase()]: "model-upper",
        "Content-Type": "application/json", "X-P104-Marker": "preserved", Connection: "close" },
      body: JSON.stringify(BODY), idempotency: { header: execution.idempotencyHeader!, key } });
    if (reply.status !== 200) throw new Error(`Owned oracle HTTP status ${reply.status}`);
    const result = JSON.parse(reply.body) as { ref: string };
    if (loseReply) throw new Error("Owned provider applied payment before reply was lost");
    return { output: reply.body, effect: "applied", externalRef: result.ref };
  });
  return { pipeline: p, executions };
}

describe("P1-04 durable idempotency", () => {
  test("mints finite unique 128-bit Crockford keys with the required format", () => {
    const keys = Array.from({ length: 1_024 }, () => mintIdempotencyKey());
    expect(keys.every(key => KEY.test(key) && key.length === 31)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("the durable journal rejects reusing one key for a second execution atomically", async () => {
    await usingFixture({}, async f => {
      const key = mintIdempotencyKey();
      const first: ActionRequest = { executionId: `exec_${randomUUID()}`, agentId: "default", toolName: PAYMENT_TOOL,
        actionClass: "FINANCIAL", sessionId: f.sessionId, callId: randomUUID(), parentExecutionId: null, idempotencyKey: key };
      f.journal.request(first);
      const second = { ...first, executionId: `exec_${randomUUID()}`, callId: randomUUID() };
      expect(() => f.journal.request(second)).toThrow(/unique|idempotency/i);
      expect(f.journal.get(second.executionId)).toBeNull();
      expect(checkedChain(f, first.executionId).map(row => row.idempotencyKey)).toEqual([key]);
      expect(f.sor.effects).toEqual([]);
    });
  });

  test.each(["Idempotency-Key", "X-P104-Execution-Key"])("transports the declared %s once, replacing hostile case variants", async header => {
    await usingFixture(httpPolicy(header), async (f, own) => {
      const wire = await origin(f, header, own), governed = httpPipeline(f, wire.url, header);
      const outcome = await call(governed.pipeline);
      expect(outcome).toMatchObject({ ok: true, denied: null, action: { state: "completed" } });
      expect(wire.rows).toHaveLength(1);
      const execution = governed.executions[0]!, key = boundKey(f, execution), received = wire.rows[0]!;
      expect(received.keys).toEqual([key]);
      expect(received.method).toBe("POST"); expect(received.path).toBe("/payments"); expect(received.body).toEqual(BODY);
      const markerValues: string[] = [];
      for (let i = 0; i < received.rawHeaders.length; i += 2) {
        if (received.rawHeaders[i]!.toLowerCase() === "x-p104-marker") markerValues.push(received.rawHeaders[i + 1]!);
      }
      expect(markerValues).toEqual(["preserved"]);
      expect(received.rawHeaders.join(" ")).not.toMatch(/model-(exact|lower|upper)/);
      expect(f.sor.effects).toHaveLength(1); expect(f.sor.effects[0]!.key).toBe(key);
      expect(checkedChain(f, execution.executionId!).map(row => row.state)).toEqual(["requested", "authorized", "started", "completed"]);
      expect(oracleCounts(f)).toMatchObject({ duplicateEffects: 0, effectsWithoutIntent: 0 });
      expect(wire.errors).toEqual([]);
      f.observations.push({ kind: "wire-header", received, executionId: execution.executionId, key });
    });
  });

  test("the real HTTP oracle replays the same key/body and refuses a conflicting body without another effect", async () => {
    const header = "Idempotency-Key";
    await usingFixture(httpPolicy(header), async (f, own) => {
      const wire = await origin(f, header, own), governed = httpPipeline(f, wire.url, header);
      expect((await call(governed.pipeline)).ok).toBe(true);
      const key = boundKey(f, governed.executions[0]!), before = readFileSync(f.oracleFile, "utf8");
      const send = (body: PaymentBody) => executeHttpFetch({ url: wire.url, method: "POST", workspace: f.workspace, simulate: false,
        headers: { "Content-Type": "application/json", Connection: "close" }, body: JSON.stringify(body), idempotency: { header, key } });
      const replay = await send(BODY), conflict = await send({ ...BODY, recipient: "another-owned-recipient" });
      expect(readFileSync(f.oracleFile, "utf8")).toBe(before);
      expect(f.sor.effects).toHaveLength(1); expect(wire.rows).toHaveLength(3);
      expect(replay.status).toBe(200); expect(JSON.parse(replay.body)).toEqual({ status: 200, ref: f.sor.effects[0]!.ref, replayed: true });
      expect(conflict.status).toBe(409); expect(JSON.parse(conflict.body)).toEqual({ status: 409, ref: null, replayed: false });
      expect(wire.rows.every(row => row.keys.length === 1 && row.keys[0] === key)).toBe(true);
      expect(governed.executions).toHaveLength(1); // The two extra calls are explicit transport/oracle probes, not pipeline retries.
      expect(oracleCounts(f)).toMatchObject({ duplicateEffects: 0, effectsWithoutIntent: 0 });
      expect(wire.errors).toEqual([]);
    });
  });

  test("the named argument is overwritten while authorization and intent digests exclude only the carrier", async () => {
    await usingFixture({ configureTools: config => config.tools.allowedTools.push({ name: ARGUMENT_TOOL, actionClass: "FINANCIAL",
      bindingFields: { amount: "amount", currency: "currency", recipient: "payee" },
      effects: { repeatable: false, idempotency: { carrier: "argument", name: "requestKey" } } }) }, async f => {
      const executions: ToolExecution[] = [];
      const p = pipeline(f, ARGUMENT_TOOL, execution => {
        executions.push(execution);
        const key = boundKey(f, execution);
        expect(execution.arguments.requestKey).toBe(key);
        const args = execution.arguments as typeof ARGS & { requestKey: string };
        const result = f.sor.pay(args.requestKey, { amount: args.amount, currency: args.currency, recipient: args.payee }, execution.executionId!);
        return { output: result.ref ?? "", effect: "applied", externalRef: result.ref! };
      });
      for (const args of [{ ...ARGS, requestKey: "model-one" }, { ...ARGS, requestKey: "model-two" }, { ...ARGS }, { ...ARGS, amount: "101" }]) {
        expect((await call(p, ARGUMENT_TOOL, args)).ok).toBe(true);
      }
      expect(executions).toHaveLength(4);
      const records = executions.map(execution => execution.authorization!.record);
      expect(records.slice(0, 3).map(record => record.action.argumentsDigest)).toEqual(Array(3).fill(records[0]!.action.argumentsDigest));
      expect(records[3]!.action.argumentsDigest).not.toBe(records[0]!.action.argumentsDigest);
      expect(records[0]!.action.argumentsDigest).toBe(sha256Hex(canonicalize({ normalizer: "amc.args/v1", arguments: ARGS })));
      expect(records[0]!.agentSuppliedMetadata).toEqual({ requestKey: "model-one" });
      expect(records[1]!.agentSuppliedMetadata).toEqual({ requestKey: "model-two" });
      expect(records[2]!.agentSuppliedMetadata).toBeUndefined();
      expect(new Set(executions.map(execution => execution.idempotencyKey)).size).toBe(4);
      expect(f.sor.effects).toHaveLength(4);
      expect(oracleCounts(f)).toMatchObject({ duplicateEffects: 0, effectsWithoutIntent: 0 });
    });
  });

  test("unknown intent blocks the same agent and a genuine second agent without any extra wire request or effect", async () => {
    const header = "Idempotency-Key", peer = "p104-second-agent";
    await usingFixture(httpPolicy(header), async (f, own) => {
      const config = buildAgentConfig({ agentId: peer, agentName: "Owned second agent", role: "fixture", domain: "engineering",
        primaryTasks: ["local idempotency qualification"], stakeholders: ["owned operator"], riskTier: "med", templateId: "openai",
        baseUrl: "http://127.0.0.1", routePrefix: "/owned", auth: { type: "none" } });
      scaffoldAgent(f.workspace, config);
      expect(verifyAgentConfigSignature(f.workspace, peer).valid).toBe(true);
      signedArtifact(getAgentPaths(f.workspace, peer).agentConfig, f.auditor);
      const wire = await origin(f, header, own), governed = httpPipeline(f, wire.url, header, true);
      const first = await call(governed.pipeline);
      expect(first).toMatchObject({ ok: false, denied: null, action: { state: "outcome_unknown" } });
      expect(first.output).toContain("Owned provider applied payment before reply was lost");
      expect(f.sor.effects).toHaveLength(1); expect(wire.rows).toHaveLength(1);
      const id = first.action!.executionId, before = readFileSync(f.oracleFile, "utf8");
      const sameAgent = await call(governed.pipeline), otherAgent = await call(governed.pipeline, PAYMENT_TOOL, ARGS, peer);
      // Independent wire and transaction-log safety assertions precede diagnostic naming assertions.
      expect(readFileSync(f.oracleFile, "utf8")).toBe(before);
      expect(wire.rows).toHaveLength(1); expect(governed.executions).toHaveLength(1);
      expect(f.sor.effects).toHaveLength(1); expect(oracleCounts(f)).toMatchObject({ duplicateEffects: 0, effectsWithoutIntent: 0 });
      expect(sameAgent).toMatchObject({ ok: false, denied: { stage: "authorization" } });
      expect(sameAgent.denied?.reason.startsWith(`blocked_by_unreconciled:${id}: `)).toBe(true);
      expect(otherAgent).toMatchObject({ ok: false, denied: { stage: "authorization" } });
      expect(otherAgent.denied?.reason.startsWith(`possible_duplicate_of:${id}: `)).toBe(true);
      expect(f.journal.get(id)!.state).toBe("outcome_unknown");
      expect(checkedChain(f, id).map(row => row.state)).toEqual(["requested", "authorized", "started", "outcome_unknown"]);
      expect(f.journal.get(otherAgent.action!.executionId)!.intent).toBeNull();
      expect(checkedChain(f, otherAgent.action!.executionId).map(row => row.state)).toEqual(["requested", "authorized", "denied"]);
      expect(wire.errors).toEqual([]);
      f.observations.push({ kind: "unknown-duplicate-no-extra-effect", first, sameAgent, otherAgent, wireRequests: wire.rows.length,
        effects: f.sor.effects.length, secondAgent: config.id });
    });
  });
});
