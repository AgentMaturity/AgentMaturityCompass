// Authored installed consumer fixture. Execute only through the reviewed runner.
// AMC imports below use public package exports; there are no dist deep imports,
// hand-built signed events, raw SQL, copied persistence implementations or model calls.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "a5987643ef6c26b01f687226fbc6a6709fc182cb";
// Programmed protocol input, NOT observed inference/token usage. Successful
// streams require usage; the real runtime guard remains enabled and unchanged.
const SYNTHETIC_WIRE_USAGE = Object.freeze({ input_tokens: 40, output_tokens: 12, total_tokens: 52 });
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const errorRecord = error => ({ name: error?.name ?? "Error", message: String(error?.message ?? error), stack: error?.stack ?? null });
function plain(path, { directory = false, privatePath = false, maximum = 32 * 1024 * 1024 } = {}) {
  assert.equal(typeof path, "string");
  assert.ok(isAbsolute(path) && resolve(path) === path && !path.includes("\0"));
  assert.equal(realpathSync(path), path, "No aliases or symlink components");
  const info = lstatSync(path);
  assert.ok(!info.isSymbolicLink() && (directory ? info.isDirectory() : info.isFile()));
  if (!directory) { assert.equal(info.nlink, 1); assert.ok(info.size <= maximum); }
  if (privatePath) { assert.equal(info.uid, process.getuid()); assert.equal(info.mode & 0o077, 0); }
  return info;
}
function raw(path, maximum) { plain(path, { maximum }); return readFileSync(path); }
const json = path => JSON.parse(raw(path).toString("utf8"));
function inside(root, path) {
  assert.ok(isAbsolute(path) && resolve(path) === path && !path.includes("\0"));
  const rel = relative(root, path);
  assert.ok(rel && rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel), "Path escaped owned root");
  return path;
}
function put(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}
function putRaw(path, bytes) { writeFileSync(path, bytes, { flag: "wx", mode: 0o600 }); }

const inputPath = process.argv[2];
plain(inputPath, { privatePath: true, maximum: 65536 });
const input = json(inputPath);
assert.equal(input.schemaVersion, 1);
assert.equal(input.source, SOURCE);
assert.ok(["capture", "ranges", "audit"].includes(input.mode));
assert.ok(["sqlite", "jsonl"].includes(input.backend));
plain(input.ownedRoot, { directory: true, privatePath: true });
for (const path of [input.workspace, input.output]) {
  inside(input.ownedRoot, path);
  plain(path, { directory: true, privatePath: true });
}
assert.equal(dirname(inputPath), input.output);
assert.equal(process.version, input.node.version);
assert.match(process.version, /^v22\.\d+\.\d+$/);
assert.equal(process.platform, input.nodePlatform);
assert.equal(process.arch, input.nodeArch);
assert.equal(realpathSync(process.execPath), input.node.path);
assert.equal(sha(raw(input.node.path, 256 * 1024 * 1024)), input.node.sha256);
assert.equal(sha(raw(input.cli)), input.cliSha256);
assert.equal(process.env.AMC_SESSION_STORE, input.backend);
assert.equal(process.env.AMC_EXPECTED_MONITOR_FINGERPRINT, input.monitorFingerprint);
assert.match(input.monitorFingerprint, /^[0-9a-f]{64}$/);
assert.equal(sha(raw(join(input.workspace, ".amc/keys/monitor_ed25519.pub"))), input.monitorFingerprint);
for (const name of ["NODE_OPTIONS", "NODE_PATH", "NPM_TOKEN", "ANTHROPIC_API_KEY", "AWS_ACCESS_KEY_ID", "AMC_NO_SIGN"])
  assert.equal(process.env[name], undefined, "Unexpected inherited setting " + name);

const packageRoot = resolve(dirname(input.cli), "..");
assert.equal(packageRoot, join(input.ownedRoot, "consumer/node_modules/agent-maturity-compass"));
const receipt = {
  schemaVersion: 1, source: SOURCE, mode: input.mode, backend: input.backend,
  classification: "actual-installed-public-interface-with-scripted-loopback-provider",
  qualityClaim: false, modelInferencePerformed: false,
  tokenUsage: "synthetic-protocol-fixture-input-not-measured",
  syntheticWireUsage: SYNTHETIC_WIRE_USAGE,
  verdict: "unknown", checks: [], subjects: [], errors: [], blockers: [],
  trustBoundary: "same-workspace pre-run key consistency, not independent external anchoring",
  node: { version: process.version, platform: process.platform, arch: process.arch, sha256: input.node.sha256 },
  cli: { path: input.cli, sha256: input.cliSha256 }, publicExports: {},
  cleanup: { sdkClosed: true, endpointClosed: true, processGroupClosure: "external-supervisor-required" },
  startedAt: new Date().toISOString(), signedEvidence: null, ciphertextEvidence: null, rangeEvidence: null,
};
let client = null, endpoint = null;
function check(name, value) { receipt.checks.push({ name, passed: Boolean(value) }); assert.ok(value, name); }
async function publicModule(name) {
  assert.ok(["agent-maturity-compass", "agent-maturity-compass/sdk/native"].includes(name));
  const resolved = fileURLToPath(import.meta.resolve(name));
  inside(packageRoot, resolved);
  receipt.publicExports[name] = { resolved, sha256: sha(raw(resolved)) };
  return import(name);
}
async function sqliteRows() {
  const { openLedger } = await publicModule("agent-maturity-compass");
  const ledger = openLedger(input.workspace, { readonly: true });
  try {
    const events = ledger.getAllEvents();
    assert.ok(Array.isArray(events) && events.length > 0);
    assert.equal(new Set(events.map(row => row.id)).size, events.length);
    // No filter is applied before providing this history to a public spill API.
    return events;
  } finally { ledger.close(); }
}
function observeSignedRows(events, subject) {
  const rows = events.filter(row => row.session_id === subject.sessionId);
  const find = type => rows.filter(row => row.event_type === type);
  const calls = find("tool/call"), results = find("tool/result"), commitments = find("tool/spill-commitment");
  check(subject.name + " actual tool/commitment/result rows", calls.length === 1 && results.length === 1 && commitments.length === 1);
  const call = JSON.parse(calls[0].meta_json), result = JSON.parse(results[0].meta_json), commit = JSON.parse(commitments[0].meta_json);
  check(subject.name + " native fs.read identity", call.toolName === "fs.read" && call.toolCallId === subject.callId);
  check(subject.name + " successful real result", result.toolCallId === subject.callId && result.outcome === "OK" &&
        result.denied === false && result.timedOut === false);
  check(subject.name + " v2 signed full-content reference", result.spilled?.v === 2 &&
        result.spilled.contentSha256 === subject.fixtureSha256 && result.spilled.bytes === subject.fixtureBytes &&
        typeof result.spilled.locator === "string" && result.spilled.unretrievable === null &&
        typeof result.spilled.encodedSha256 === "string" && result.spilled.encodedBytes > 0 && result.spilled.keyVersion > 0);
  assert.deepEqual(commit.spilled, result.spilled);
  check(subject.name + " commitment row precedes result", events.indexOf(commitments[0]) < events.indexOf(results[0]));
  check(subject.name + " signature bytes present (cold verifier is separate)", [...calls, ...commitments, ...results].every(row =>
        typeof row.writer_sig === "string" && row.writer_sig.length > 0 && row.writer_sig !== "unsigned"));
  const endings = find("turn/end").map(row => JSON.parse(row.meta_json));
  check(subject.name + " native complete reason, not merely ACP end_turn", endings.length === 1 && endings[0].reason === "complete");
  return { sessionId: subject.sessionId, call: calls[0], commitment: commitments[0], result: results[0],
           reference: result.spilled, authority: "observed rows; later cold native verifier must authenticate them" };
}
function sseFrames(index, phase, wireName, fixtureRelative) {
  const responseId = "owned_response_" + index;
  if (phase === 0) {
    const item = { type: "function_call", id: "owned_fc_" + index, call_id: "owned_read_" + index,
                   name: wireName, arguments: JSON.stringify({ path: fixtureRelative, maxBytes: 400000 }), status: "completed" };
    return [
      { type: "response.created", response: { id: responseId } },
      { type: "response.output_item.added", output_index: 0, item: { ...item, arguments: "", status: "in_progress" } },
      { type: "response.function_call_arguments.delta", output_index: 0, item_id: item.id, delta: item.arguments },
      { type: "response.function_call_arguments.done", output_index: 0, item_id: item.id, arguments: item.arguments },
      { type: "response.output_item.done", output_index: 0, item },
      { type: "response.completed", response: { id: responseId, status: "completed", output: [item], usage: SYNTHETIC_WIRE_USAGE } },
    ];
  }
  const text = "Scripted fixture complete; inspect retained output separately.";
  const item = { id: "owned_message_" + index, type: "message", role: "assistant", status: "completed",
                 content: [{ type: "output_text", text, annotations: [] }] };
  return [
    { type: "response.created", response: { id: responseId } },
    { type: "response.output_item.added", output_index: 0, item: { ...item, status: "in_progress", content: [] } },
    { type: "response.content_part.added", output_index: 0, item_id: item.id, content_index: 0,
      part: { type: "output_text", text: "", annotations: [] } },
    { type: "response.output_text.delta", output_index: 0, item_id: item.id, content_index: 0, delta: text },
    { type: "response.output_text.done", output_index: 0, item_id: item.id, content_index: 0, text },
    { type: "response.content_part.done", output_index: 0, item_id: item.id, content_index: 0, part: item.content[0] },
    { type: "response.output_item.done", output_index: 0, item },
    { type: "response.completed", response: { id: responseId, status: "completed", output: [item], usage: SYNTHETIC_WIRE_USAGE } },
  ];
}
async function scriptedEndpoint(subjects) {
  const exchanges = [], errors = [], sockets = new Set();
  let expectedSubject = 0, expectedPhase = 0, closePromise = null;
  const server = createServer(async (req, res) => {
    const index = exchanges.length;
    const exchange = { index, classification: "scripted-provider-fixture-no-inference", requestSha256: null,
                       responseSha256: null, subject: expectedSubject, phase: expectedPhase, error: null,
                       usageClassification: "programmed-fixture-input-not-measured", syntheticWireUsage: SYNTHETIC_WIRE_USAGE };
    exchanges.push(exchange);
    try {
      assert.ok(index < subjects.length * 2, "Unexpected retry or extra request");
      assert.equal(req.method, "POST"); assert.equal(req.url, "/v1/responses");
      assert.equal(req.headers.authorization, "Bearer owned-scripted-provider-not-a-real-credential");
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; assert.ok(size <= 2 * 1024 * 1024); chunks.push(chunk); }
      const request = Buffer.concat(chunks);
      putRaw(join(input.output, "provider-request-" + index + ".json"), request);
      exchange.requestSha256 = sha(request);
      const body = JSON.parse(request.toString("utf8"));
      assert.equal(body.model, "scripted-owned-spill"); assert.equal(body.stream, true); assert.equal(body.store, false);
      assert.equal(body.max_output_tokens, 128);
      assert.ok(Array.isArray(body.tools) && body.tools.length === 1);
      const wireName = body.tools[0].name;
      assert.match(wireName, /^[A-Za-z0-9_-]{1,64}$/);
      exchange.offeredWireName = wireName;
      const subject = subjects[expectedSubject];
      const outputs = body.input.filter(item => item.type === "function_call_output");
      assert.equal(outputs.length, expectedPhase);
      if (expectedPhase === 1) {
        assert.equal(outputs[0].call_id, subject.callId);
        const actual = JSON.parse(outputs[0].output);
        assert.equal(actual.type, "amc.tool-result"); assert.equal(actual.version, 1); assert.equal(actual.isError, false);
        assert.equal(typeof actual.output, "string");
        assert.match(actual.output, /amc-spill:v2:/);
        assert.ok(Buffer.byteLength(actual.output) < subject.fixtureBytes, "Provider must see preview, not the full result");
        exchange.previewSha256 = sha(actual.output);
        exchange.previewBytes = Buffer.byteLength(actual.output);
      }
      const frames = sseFrames(index, expectedPhase, wireName, subject.fixtureRelative);
      const wire = frames.map((event, sequence_number) => "event: " + event.type + "\ndata: " +
                    JSON.stringify({ ...event, sequence_number }) + "\n\n").join("");
      putRaw(join(input.output, "provider-response-" + index + ".sse"), wire);
      exchange.responseSha256 = sha(wire);
      if (expectedPhase === 0) expectedPhase = 1;
      else { expectedPhase = 0; expectedSubject += 1; }
      res.writeHead(200, { "content-type": "text/event-stream" }); res.end(wire);
    } catch (error) {
      exchange.error = errorRecord(error); errors.push(exchange.error);
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Owned scripted fixture refused unexpected request" } }));
    }
  });
  server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
  server.requestTimeout = 15000;
  server.headersTimeout = 15000;
  await new Promise((resolve_, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve_); });
  return { origin: "http://127.0.0.1:" + server.address().port, exchanges, errors,
    complete: () => expectedSubject === subjects.length && expectedPhase === 0,
    close: () => {
      closePromise ??= new Promise((resolve_, reject) => {
        server.close(error => {
          if (error) reject(error);
          else if (server.listening) reject(new Error("Endpoint still listening after close callback"));
          else resolve_();
        });
        for (const socket of sockets) socket.destroy();
        server.closeAllConnections();
      });
      return closePromise;
    },
  };
}
async function capture() {
  const directory = join(input.workspace, "workspace/allowed");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const [index, name] of ["A", "B"].entries()) {
    const text = ("OWNED-" + name + "|π|0123456789abcdefghijklmnopqrstuvwxyz\n").repeat(2048);
    const bytes = Buffer.from(text, "utf8"), path = join(directory, name + ".txt");
    assert.ok(bytes.length > 32768 && bytes.length < 400000);
    putRaw(path, bytes);
    receipt.subjects.push({ name, fixturePath: path, fixtureRelative: "workspace/allowed/" + name + ".txt",
                           fixtureBytes: bytes.length, fixtureSha256: sha(bytes), callId: "owned_read_" + index * 2,
                           sessionId: null, turn: null });
  }
  assert.equal(sha(raw(join(input.workspace, ".amc/tools.yaml"))), input.toolsPolicySha256);
  assert.equal(process.env.OPENAI_API_KEY, "owned-scripted-provider-not-a-real-credential");
  endpoint = await scriptedEndpoint(receipt.subjects);
  receipt.cleanup.endpointClosed = false;
  const { AMCNativeClient } = await publicModule("agent-maturity-compass/sdk/native");
  receipt.cleanup.sdkClosed = false;
  client = await AMCNativeClient.start({
    workspace: input.workspace, provider: "openai-responses", model: "scripted-owned-spill",
    baseUrl: endpoint.origin, credential: "OPENAI_API_KEY", tools: "workspace", agentId: "default",
    expectedToolsDigest: input.toolsPolicySha256, credentialsMode: "operator-only",
    command: [input.node.path, input.cli], timeoutMs: 45000, maxTokens: 128, maxSteps: 3,
  });
  for (const subject of receipt.subjects) {
    const session = await client.newSession(); subject.sessionId = session.sessionId;
    const result = await session.prompt("Read only the owned fixture " + subject.fixtureRelative +
                 " using the single offered native file tool. The scripted endpoint is a transport fixture, not a real model.").result;
    subject.turn = result;
    check(subject.name + " SDK completion not task verification", result.sessionId === session.sessionId &&
          result.state === "completed" && result.stopReason === "end_turn" && result.verification === "not-verified");
    const calls = result.updates.filter(e => e.update?.sessionUpdate === "tool_call");
    const updates = result.updates.filter(e => e.update?.sessionUpdate === "tool_call_update");
    check(subject.name + " native tool identity/update", calls.length === 1 && calls[0].update.title === "fs.read" &&
          calls[0].update.toolCallId === subject.callId && calls[0].update.status === "pending");
    check(subject.name + " native completed result update", updates.length === 1 &&
          updates[0].update.toolCallId === subject.callId && updates[0].update.status === "completed");
    check(subject.name + " owned fixture unchanged", sha(raw(subject.fixturePath)) === subject.fixtureSha256);
  }
  await client.close(); client = null; receipt.cleanup.sdkClosed = true;
  await endpoint.close(); receipt.cleanup.endpointClosed = true;
  check("finite wire exchange sequence", endpoint.complete() && endpoint.exchanges.length === receipt.subjects.length * 2 && endpoint.errors.length === 0);
  put(join(input.output, "scripted-provider.json"), { exchanges: endpoint.exchanges, errors: endpoint.errors,
      classification: "scripted loopback response wire; no model quality or provider usage measurement" });
  endpoint = null;
  if (input.backend === "sqlite") {
    const events = await sqliteRows();
    put(join(input.output, "complete-sqlite-events.json"), events);
    const origins = receipt.subjects.map(subject => observeSignedRows(events, subject));
    put(join(input.output, "signed-origins.json"), origins);
    receipt.signedEvidence = { status: "observed-awaiting-separate-cold-verifier", completeRows: "complete-sqlite-events.json", origins: "signed-origins.json" };
  } else {
    receipt.signedEvidence = { status: "raw-row-export-unavailable-through-reviewed-public-entrypoint",
      alternative: "Run actual installed backend-aware CLI cold verifier and spill inventory; keep the original JSONL workspace intact." };
  }
  receipt.ciphertextEvidence = { status: "not-inspected-by-capture-worker", authority: "subsequent native inventory and ciphertext transport receipts" };
  receipt.verdict = "passed";
}
async function ranges() {
  if (input.backend === "jsonl") {
    receipt.verdict = "blocked";
    receipt.code = "PUBLIC_JSONL_HISTORY_LOADER_UNAVAILABLE";
    receipt.blockers.push("Public readSessionSpillRange needs complete genuine rows. Public openLedger is SQLite-only; no deep import or copied JSONL store is substituted.");
    return;
  }
  const { readSessionSpillRange, MAX_SPILL_READ_BYTES } = await publicModule("agent-maturity-compass");
  check("public byte cap present", MAX_SPILL_READ_BYTES === 16384);
  const events = await sqliteRows();
  put(join(input.output, "complete-api-input-events.json"), events);
  const pages = [], negativeBounds = [];
  for (const subject of input.subjects) {
    inside(input.workspace, subject.fixturePath);
    const expected = raw(subject.fixturePath);
    assert.equal(sha(expected), subject.fixtureSha256);
    const base = { workspace: input.workspace, events, locator: subject.entry.locator,
                   options: { expectedMonitorFingerprint: input.monitorFingerprint } };
    const chunks = []; let offset = 0, iterations = 0;
    do {
      assert.ok(iterations++ < 64, "Fixture pagination exceeded its finite bound");
      const page = readSessionSpillRange({ ...base, offset, limit: MAX_SPILL_READ_BYTES });
      const bytes = Buffer.from(page.contentBase64, "base64");
      assert.equal(bytes.toString("base64"), page.contentBase64);
      assert.deepEqual(bytes, expected.subarray(offset, offset + MAX_SPILL_READ_BYTES));
      assert.equal(page.locator, base.locator); assert.equal(page.contentSha256, sha(expected));
      assert.equal(page.totalBytes, expected.length); assert.equal(page.offset, offset); assert.equal(page.returnedBytes, bytes.length);
      assert.equal(page.storage, "encrypted-v2"); assert.equal(page.verification.fullContentVerified, true);
      assert.equal(page.verification.expectedMonitorFingerprint, input.monitorFingerprint);
      assert.equal(page.verification.history, "supplied-references-only");
      assert.deepEqual([...page.eventIds].sort(), [...subject.entry.eventIds].sort());
      assert.deepEqual([...page.sessionIds].sort(), [subject.sessionId]);
      const next = offset + bytes.length < expected.length ? offset + bytes.length : null;
      assert.equal(page.nextOffset, next);
      pages.push({ subject: subject.name, page }); chunks.push(bytes);
      if (next === null) break;
      assert.ok(next > offset); offset = next;
    } while (true);
    check(subject.name + " complete reassembled public API bytes", Buffer.concat(chunks).equals(expected));
    const eof = readSessionSpillRange({ ...base, offset: expected.length, limit: 1 });
    check(subject.name + " EOF is exact empty range", eof.contentBase64 === "" && eof.returnedBytes === 0 && eof.nextOffset === null);
    pages.push({ subject: subject.name, page: eof });
    for (const invalid of [{ offset: -1, limit: 1 }, { offset: 0, limit: 0 },
                           { offset: 0, limit: MAX_SPILL_READ_BYTES + 1 }, { offset: expected.length + 1, limit: 1 }]) {
      let failure = null;
      try { readSessionSpillRange({ ...base, ...invalid }); } catch (error) { failure = errorRecord(error); }
      negativeBounds.push({ subject: subject.name, invalid, failure });
      check(subject.name + " invalid bounds refused " + JSON.stringify(invalid), failure !== null);
    }
  }
  put(join(input.output, "ranges.json"), pages);
  put(join(input.output, "refused-bounds.json"), negativeBounds);
  receipt.rangeEvidence = { status: "exact-bytes-checked", pages: "ranges.json", refusals: "refused-bounds.json",
    boundary: "Each bounded API response decrypts/verifies the complete selected object; this is not streaming I/O." };
  receipt.verdict = "passed";
}
async function audit() {
  // Native spill CLI explicitly records operations in SQLite even for JSONL sessions.
  // This is NOT using that database as JSONL session history.
  assert.ok(Array.isArray(input.auditEventIds) && input.auditEventIds.length === 2 && new Set(input.auditEventIds).size === 2);
  const events = await sqliteRows();
  const rows = input.auditEventIds.map(id => events.find(row => row.id === id));
  check("exact native operation audit records exist", rows.every(Boolean));
  const types = rows.map(row => JSON.parse(row.meta_json).auditType);
  assert.deepEqual(types, ["SESSION_SPILL_ERASURE_INTENDED", "SESSION_SPILL_ERASURE_FINISHED"]);
  check("operation signature bytes present", rows.every(row => row.event_type === "audit" &&
        typeof row.writer_sig === "string" && row.writer_sig !== "unsigned" && row.writer_sig.length > 0));
  check("intent row precedes finished row", events.indexOf(rows[0]) < events.indexOf(rows[1]));
  put(join(input.output, "operation-audit-rows.json"), rows);
  receipt.signedEvidence = { status: "signature-bytes-and-native-identifiers-observed",
    records: "operation-audit-rows.json", cryptographicVerificationAfterErasure: "not-performed",
    boundary: "Presence is not an independent signature/whole-log-verification result. The prior cold session verifier is a separate receipt." };
  receipt.verdict = "passed";
}

try {
  if (input.mode === "capture") await capture();
  else if (input.mode === "ranges") await ranges();
  else await audit();
} catch (error) {
  receipt.errors.push(errorRecord(error)); receipt.verdict = "failed";
} finally {
  if (client !== null) {
    try { await client.close(); receipt.cleanup.sdkClosed = true; }
    catch (error) { receipt.errors.push({ cleanup: "SDK", ...errorRecord(error) }); receipt.cleanup.sdkClosed = false; }
  }
  if (endpoint !== null) {
    try { await endpoint.close(); receipt.cleanup.endpointClosed = true; }
    catch (error) { receipt.errors.push({ cleanup: "endpoint", ...errorRecord(error) }); receipt.cleanup.endpointClosed = false; }
    try { put(join(input.output, "scripted-provider-failed.json"), { exchanges: endpoint.exchanges, errors: endpoint.errors }); }
    catch (error) { receipt.errors.push({ persistence: "provider", ...errorRecord(error) }); }
  }
  if (!receipt.cleanup.sdkClosed || !receipt.cleanup.endpointClosed || receipt.errors.length) receipt.verdict = "failed";
  receipt.finishedAt = new Date().toISOString();
  put(join(input.output, "worker-receipt.json"), receipt);
  process.stdout.write(JSON.stringify({ verdict: receipt.verdict, receipt: join(input.output, "worker-receipt.json") }) + "\n");
  process.exitCode = receipt.verdict === "passed" ? 0 : receipt.verdict === "blocked" ? 3 : 1;
}
