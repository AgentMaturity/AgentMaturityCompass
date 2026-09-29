#!/usr/bin/env node
// Fresh tarball consumer; only public installed AMC exports and CLI commands.
// Example: node scripts/installed-crash-recovery-check.mjs --artifact FILE
// --artifact-sha256 HASH --cli-sha256 HASH --source COMMIT --source-tree DIR --out NEW_DIR
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { hostname } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { runOwnedCommand } from "./lib/ownedProcessCommand.mjs";

const { values } = parseArgs({ options: Object.fromEntries(["artifact", "artifact-sha256", "cli-sha256", "source", "source-tree", "out", "npm"].map(name => [name, { type: "string" }])) });
for (const key of ["artifact", "artifact-sha256", "cli-sha256", "source", "source-tree", "out"]) assert.ok(values[key], `--${key} is required`);
assert.match(process.version, /^v22\./, "qualification requires Node 22");
assert.notEqual(process.platform, "win32", "this acceptance runner requires POSIX process-group cleanup");
for (const key of ["artifact-sha256", "cli-sha256"]) assert.match(values[key], /^[a-f0-9]{64}$/);
assert.match(values.source, /^[a-f0-9]{40}$/);
const sha = value => createHash("sha256").update(value).digest("hex");
const artifact = realpathSync(values.artifact), sourceTree = realpathSync(values["source-tree"]);
assert.equal(sha(readFileSync(artifact)), values["artifact-sha256"], "artifact bytes changed");
const git = args => execFileSync("git", ["-C", sourceTree, ...args], { encoding: "utf8" }).trim();
assert.equal(git(["rev-parse", "HEAD"]), values.source);
assert.equal(git(["status", "--porcelain", "--untracked-files=no"]), "", "source must be committed and tracked-clean");
const runner = fileURLToPath(import.meta.url), helper = fileURLToPath(new URL("./lib/installedCrashMcpServer.mjs", import.meta.url));
const sourceFiles = {};
for (const [relative, path] of [["scripts/installed-crash-recovery-check.mjs", runner], ["scripts/lib/installedCrashMcpServer.mjs", helper],
  ["scripts/lib/ownedProcessCommand.mjs", fileURLToPath(new URL("./lib/ownedProcessCommand.mjs", import.meta.url))]]) {
  const committed = execFileSync("git", ["-C", sourceTree, "show", `${values.source}:${relative}`]);
  assert.deepEqual(readFileSync(path), committed, `orchestration differs from committed ${relative}`);
  sourceFiles[relative] = sha(committed);
}
const root = resolve(values.out);
assert.ok(!existsSync(root), "--out must be a new directory; previous evidence is retained");
process.umask(0o077);
mkdirSync(root, { recursive: true, mode: 0o700 });
for (const directory of ["consumer", "workspace", "home", "tmp", "npm-cache", "private", "logs"]) mkdirSync(join(root, directory), { mode: 0o700 });
const workspace = join(root, "workspace"), consumer = join(root, "consumer"), runId = randomUUID();
const secretValues = [randomUUID(), randomUUID()], [passphrase, password] = secretValues;
const tokenFile = join(root, "private", "approval-token");
writeFileSync(join(root, "private", "vault"), passphrase);
writeFileSync(join(root, "private", "owner-password"), password);
writeFileSync(join(root, "private", "owner-username"), "crash-owner");
const npm = realpathSync(values.npm ?? join(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"));
const env = {
  HOME: join(root, "home"), XDG_CONFIG_HOME: join(root, "home"), TMPDIR: join(root, "tmp"),
  PATH: `${dirname(process.execPath)}${process.platform === "win32" ? ";" : ":"}/usr/bin:/bin`, CI: "1", NO_COLOR: "1",
  npm_config_cache: join(root, "npm-cache"), AMC_HOME: join(root, "home"), AMC_WORKSPACE_DIR: workspace,
  AMC_CONTROL_CHECKPOINT_DIR: join(root, "private", "checkpoints"), AMC_SESSION_STORE: "jsonl", AMC_VAULT_REMEMBER: "0",
  AMC_VAULT_PASSPHRASE: passphrase, AMC_VAULT_PASSPHRASE_FILE: join(root, "private", "vault"),
  AMC_BOOTSTRAP_OWNER_USERNAME_FILE: join(root, "private", "owner-username"),
  AMC_BOOTSTRAP_OWNER_PASSWORD_FILE: join(root, "private", "owner-password"), AMC_ENABLE_NOTARY: "0"
};
// SDK children inherit process.env; remove developer/provider credentials before
// importing the installed package, then supply this disposable operator context.
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, env);
const scrub = text => secretValues.reduce((result, secret) => result.split(secret).join("[REDACTED_FIXTURE_SECRET]"), String(text));
const receipt = {
  schemaVersion: "amc-installed-crash-recovery/v1", ok: false, startedAt: new Date().toISOString(), runId,
  sourceCommit: values.source, sourceFiles, artifactSha256: values["artifact-sha256"], expectedCliSha256: values["cli-sha256"],
  runtime: { node: process.version, executable: realpathSync(process.execPath), nodeSha256: sha(readFileSync(process.execPath)), npmSha256: sha(readFileSync(npm)), platform: process.platform, arch: process.arch },
  checks: [], commands: [],
  limits: ["Explicit deterministic stub provider and operator-trusted local stdio MCP tool; no live model or OS sandbox claim.",
    "Monitor pin is captured locally before execution; it proves workspace-key consistency, not independent trust anchoring.",
    "Artifact/source build correspondence is supplied by the release receipt; this runner independently pins artifact, installed CLI, and committed orchestration bytes.",
    "Private fixture credentials and raw workspace evidence remain under the mode-0700 output directory; publish only reviewed redacted receipts."]
};
const save = () => writeFileSync(join(root, "receipt.json"), scrub(JSON.stringify(receipt, null, 2)) + "\n");
const check = (name, details = {}) => { receipt.checks.push({ name, ok: true, ...details }); save(); };
const wait = ms => new Promise(done => setTimeout(done, ms));
const lines = path => existsSync(path) ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
const clients = [], commandRuns = new Set(), writerPids = new Set(), shutdown = new AbortController();
const effectsPath = join(root, "private", "effects.jsonl"), processLog = join(root, "private", "mcp-processes.jsonl");
let cli, Native, sessionId, monitor;
const stopForSignal = signal => {
  receipt.interruptedBy = signal; receipt.ok = false; process.exitCode = 1;
  shutdown.abort(new Error(`Acceptance interrupted by ${signal}`));
  // Close only SDK clients started by this runner. The finally block awaits
  // their idempotent closure and verifies observed writer/helper process exits.
  for (const client of clients) void client.close().catch(() => {});
};
const onSigint = () => stopForSignal("SIGINT"), onSigterm = () => stopForSignal("SIGTERM");
process.on("SIGINT", onSigint); process.on("SIGTERM", onSigterm);
async function command(label, args, { cwd = workspace, input, timeoutMs = 60_000, install = false } = {}) {
  const running = runOwnedCommand(process.execPath, install ? args : [cli, ...args], { cwd, env, input, timeoutMs, signal: shutdown.signal });
  commandRuns.add(running);
  const { stdout, stderr, ...result } = await running.finally(() => commandRuns.delete(running));
  if (existsSync(tokenFile)) secretValues.push(readFileSync(tokenFile, "utf8").trim());
  writeFileSync(join(root, "logs", `${label}.stdout`), scrub(stdout)); writeFileSync(join(root, "logs", `${label}.stderr`), scrub(stderr));
  receipt.commands.push({ label, args, ...result }); save();
  assert.equal(result.cleanupError, undefined, `${label}: ${result.cleanupError}`);
  assert.equal(result.stopReason, undefined, `${label}: ${result.stopReason}`);
  assert.equal(result.signal, null, `${label} was interrupted`); assert.equal(result.code, 0, `${label}: ${scrub(stderr).slice(-1200)}`);
  try { return JSON.parse(stdout); } catch { return stdout; }
}
const dead = pid => { try { process.kill(pid, 0); return false; } catch (error) { if (error.code === "ESRCH") return true; throw error; } };
async function until(label, condition, timeoutMs = 15_000, cleanup = false) {
  const deadline = Date.now() + timeoutMs;
  for (;;) { if (!cleanup) shutdown.signal.throwIfAborted(); const result = await condition(); if (result) return result; assert.ok(Date.now() < deadline, `${label} timed out`); await wait(50); }
}
function history() { return Native.loadSessionEventHistory({ workspace, sessionId, agentId: "default", expectedMonitorFingerprint: monitor }); }
function owner() {
  const rows = history().events, first = JSON.parse(rows[0].meta_json).amcSessionWriter;
  const current = JSON.parse(rows.at(-1).meta_json).amcSessionWriter;
  assert.equal(current.hostId, hostname()); assert.equal(current.state, "active");
  assert.ok(Number.isSafeInteger(current.pid) && current.pid > 0 && current.pid !== process.pid);
  writerPids.add(current.pid); return { first, current };
}
async function start(options) {
  const client = await Native.AMCNativeClient.start({ ...options, startupSignal: shutdown.signal }); clients.push(client); return client;
}
try {
  save(); writeFileSync(join(consumer, "package.json"), '{"name":"amc-installed-crash-consumer","private":true,"type":"module"}\n');
  await command("00-install", [npm, "install", "--no-audit", "--no-fund", "--loglevel=error", artifact], { cwd: consumer, install: true, timeoutMs: 300_000 });
  // The public native SDK has an ESM-only export. Resolve with import conditions
  // from the fresh consumer, rather than applying CommonJS require conditions.
  const resolveBridge = join(consumer, "resolve-native.mjs");
  writeFileSync(resolveBridge, 'export const nativeUrl = import.meta.resolve("agent-maturity-compass/sdk/native");\n');
  const { nativeUrl } = await import(pathToFileURL(resolveBridge).href);
  const entry = realpathSync(fileURLToPath(nativeUrl));
  const packageRoot = realpathSync(join(consumer, "node_modules", "agent-maturity-compass"));
  assert.ok(entry.startsWith(packageRoot + sep), "public export must resolve inside this fresh installed package");
  cli = join(packageRoot, "dist", "cli.js"); assert.equal(sha(readFileSync(cli)), values["cli-sha256"]);
  receipt.installed = { publicNativeExport: entry, publicNativeExportSha256: sha(readFileSync(entry)), cliSha256: sha(readFileSync(cli)) }; save();
  Native = await import(pathToFileURL(entry).href);
  const YAML = createRequire(join(packageRoot, "package.json"))("yaml");
  await command("01-bootstrap", ["bootstrap"]);
  await command("02-initialize", ["--agent", "default", "--json"]);
  await command("03-firewall", ["firewall", "enable", "--mode", "block", "--json"]);
  const budgetPath = join(workspace, ".amc", "budgets.yaml"), budgets = YAML.parse(readFileSync(budgetPath, "utf8"));
  budgets.budgets.perAgent.default.daily.maxLlmRequests = 20; budgets.budgets.perAgent.default.perMinute.maxLlmRequests = 20;
  budgets.budgets.perAgent.default.daily.maxToolExecutes.WRITE_LOW = 2;
  writeFileSync(budgetPath, JSON.stringify(budgets, null, 2) + "\n"); await command("04-budget-sign", ["budgets", "sign", "--json"]);
  const login = await command("05-owner-login", ["approvals", "login", "--username", "crash-owner", "--token-file", tokenFile, "--password-stdin", "--json"], { input: password + "\n" });
  assert.equal(login.ok, true); assert.deepEqual(login.roles, ["OWNER"]);
  const configPath = join(root, "private", "mcp.json");
  const config = { schemaVersion: 1, server: { id: "crashfixture", command: process.execPath, args: [helper, effectsPath, processLog, runId], timeoutMs: 120_000 } };
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  const catalog = await command("06-mcp-catalog", ["agent-loop", "mcp-catalog", "--config", configPath, "--json"]);
  assert.equal(catalog.grantsCreated, false); assert.deepEqual(catalog.tools.map(tool => tool.name), ["append_once"]);
  const toolName = catalog.allowlistNames[0].amcToolName;
  config.expectedCatalogDigest = catalog.digest; config.grants = [{ name: "append_once", actionClass: "WRITE_LOW" }];
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  const toolsPath = join(workspace, ".amc", "tools.yaml"), toolsConfig = YAML.parse(readFileSync(toolsPath, "utf8"));
  toolsConfig.tools.allowedTools = [{ name: toolName, actionClass: "WRITE_LOW" }];
  writeFileSync(toolsPath, JSON.stringify(toolsConfig, null, 2) + "\n"); await command("07-tools-sign", ["tools", "sign", "--json"]);
  monitor = sha(readFileSync(join(workspace, ".amc", "keys", "monitor_ed25519.pub")));
  writeFileSync(join(root, "private", "pre-execution-monitor.pub"), readFileSync(join(workspace, ".amc", "keys", "monitor_ed25519.pub")));
  env.AMC_EXPECTED_MONITOR_FINGERPRINT = monitor; process.env.AMC_EXPECTED_MONITOR_FINGERPRINT = monitor;
  receipt.preExecutionMonitorSha256 = monitor;
  const options = { workspace, provider: "stub", agentId: "default", tools: "workspace", approveTools: "WRITE_LOW", approveRisk: "low",
    credentialsMode: "operator-only", credentialsHome: env.AMC_HOME, expectedToolsDigest: sha(readFileSync(toolsPath)),
    mcpConfig: configPath, mcpConfigSha256: sha(readFileSync(configPath)), maxTokens: 128, maxSteps: 3, timeoutMs: 60_000, env };
  const firstClient = await start(options), session = await firstClient.newSession(); sessionId = session.sessionId;
  const initialOwner = owner().current, note = `installed-crash-${runId}`;
  const turn = session.prompt(note), turnSettlement = turn.result.then(result => ({ result }), error => ({ error: String(error) }));
  let poll = 0;
  const pending = await until("signed approval", async () => {
    const listing = await command(`08-pending-${++poll}`, ["approvals", "list", "--agent", "default", "--status", "pending", "--json"]);
    assert.equal(listing.integrity.valid, true); return listing.requests[0];
  });
  const approvalId = pending.approvalRequestId;
  const review = await command("09-review", ["approvals", "show", "--agent", "default", approvalId]);
  assert.equal(review.status, "PENDING");
  for (const field of ["requestIntegrity", "chainIntegrity", "contextIntegrity"]) assert.equal(review[field].valid, true);
  assert.equal(review.request.toolName, toolName); assert.equal(review.request.requiredApprovals, 1);
  assert.equal(lines(effectsPath).length, 0);
  await command("10-approve", ["approvals", "approve", "--agent", "default", approvalId, "--mode", "execute", "--reason", "Explicit local crash-recovery acceptance",
    "--username", login.username, "--user-id", login.userId, "--roles", login.roles.join(","), "--session-token-file", tokenFile, "--expect-request-digest", review.requestDigestSha256]);
  await until("durable real effect before ACK", () => lines(processLog).some(row => row.kind === "effect-durable-ack-withheld" && row.runId === runId));
  const effectsBefore = readFileSync(effectsPath), effectRows = lines(effectsPath);
  assert.equal(effectRows.length, 1); assert.equal(effectRows[0].text, note); assert.equal(effectRows[0].runId, runId);
  const before = history(), calls = before.events.filter(row => row.event_type === "tool/call");
  assert.equal(calls.length, 1); assert.equal(before.events.filter(row => row.event_type === "tool/result").length, 0);
  const callId = JSON.parse(calls[0].meta_json).toolCallId;
  const capturedOwner = owner().current;
  assert.equal(capturedOwner.pid, initialOwner.pid); assert.equal(capturedOwner.token, initialOwner.token);
  const eventsPath = join(workspace, ".amc", "jsonl", "events.jsonl"), prefix = readFileSync(eventsPath);
  // Kill only the original writer authenticated by the locally pinned signed
  // history, after the fixture's durable effect and before any tool/result.
  process.kill(capturedOwner.pid, "SIGKILL"); await until("original ACP writer exit", () => dead(capturedOwner.pid)); writerPids.delete(capturedOwner.pid);
  assert.ok((await turnSettlement).error, "the unacknowledged turn must fail with the killed writer"); await firstClient.close();
  const spentBefore = await command("11-budget-before-resume", ["budgets", "status", "--agent", "default"]);
  assert.equal(spentBefore.usage.daily.toolPending.WRITE_LOW, 1);
  assert.equal(Native.inspectJsonlSessionRecovery({ workspace, sessionId, agentId: "default", expectedMonitorFingerprint: monitor }).eligible, true);
  check("real-approved-effect-before-ack-and-authenticated-writer-kill", { sessionId, approvalId, toolName, callId, killedPid: capturedOwner.pid,
    effects: 1, toolResultsBeforeKill: 0, originalPrefixSha256: sha(prefix), effectSha256: sha(effectsBefore), pendingWriteLow: 1 });
  const resumedClient = await start(options), resumed = await resumedClient.resumeSession(sessionId); owner();
  assert.equal(resumed.sessionId, sessionId);
  assert.deepEqual(readFileSync(eventsPath).subarray(0, prefix.length), prefix); assert.deepEqual(readFileSync(effectsPath), effectsBefore);
  const recovered = history(), unknown = recovered.events.filter(row => row.event_type === "tool/result" && JSON.parse(row.meta_json).outcome === "TOOL_OUTCOME_UNKNOWN");
  assert.equal(unknown.length, 1); assert.equal(JSON.parse(unknown[0].meta_json).toolCallId, callId);
  assert.equal(recovered.events.filter(row => row.event_type === "request/header").length, 1);
  const spentAfter = await command("12-budget-after-resume", ["budgets", "status", "--agent", "default"]);
  assert.deepEqual(spentAfter.usage.daily, spentBefore.usage.daily);
  check("resume-preserves-original-prefix-uncertain-outcome-and-reservation", { unknownToolOutcomes: 1, automaticModelCalls: 0, effectCount: 1 });
  const result = await resumed.prompt("Explicit new turn after the interrupted tool; report the recorded history.").result;
  assert.equal(result.state, "completed"); assert.ok(result.text.length > 0);
  const verified = await resumed.closeAndVerify(); assert.equal(verified.report.ok, true);
  const final = Native.loadSessionEventHistory({ workspace, sessionId, agentId: "default", expectedMonitorFingerprint: monitor, verifyPayloads: true, requireSealed: true });
  assert.equal(final.events.filter(row => row.event_type === "session/open").length, 1);
  assert.equal(final.events.filter(row => row.event_type === "request/header").length, 2);
  assert.equal(final.events.filter(row => row.event_type === "tool/call").length, 1);
  assert.deepEqual(readFileSync(effectsPath), effectsBefore);
  const cold = await command("13-cold-native-verification", ["agent-loop", "verify", sessionId, "--json"]); assert.equal(cold.ok, true);
  const ledger = await command("14-cold-ledger-verification", ["session", "verify", "--json"]); assert.equal(ledger.ok, true); assert.deepEqual(ledger.errors, []);
  const finalBudget = await command("15-final-budget", ["budgets", "status", "--agent", "default"]);
  assert.equal(finalBudget.usage.daily.toolPending.WRITE_LOW, 1);
  check("new-explicit-turn-without-side-effect-replay-and-cold-verification", { finalModelCalls: 2, finalToolCalls: 1, effectCount: 1,
    pendingWriteLow: 1, payloads: final.verification.payloads, historySha256: final.historySha256 });
  receipt.ok = true;
} catch (error) { receipt.error = scrub(error.stack ?? String(error)); process.exitCode = 1; }
finally {
  shutdown.abort(new Error("Acceptance cleanup"));
  await Promise.allSettled([...commandRuns]);
  for (const client of clients.reverse()) {
    try { await client.close(); } catch (error) { receipt.ok = false; receipt.clientClosureError = scrub(error); process.exitCode = 1; }
  }
  try {
    const helperPids = [...new Set(lines(processLog).filter(row => row.kind === "started" && row.runId === runId).map(row => row.pid))];
    await until("all owned processes closed", () => [...writerPids, ...helperPids].every(dead), 10_000, true);
    receipt.closedProcesses = { writerPids: [...writerPids], helperPids, allObservedGone: true };
  } catch (error) { receipt.ok = false; receipt.processClosureError = scrub(error); process.exitCode = 1; }
  if (receipt.interruptedBy) { receipt.ok = false; process.exitCode = 1; }
  process.off("SIGINT", onSigint); process.off("SIGTERM", onSigterm);
  receipt.endedAt = new Date().toISOString(); save();
  console.log(JSON.stringify({ ok: receipt.ok, receipt: join(root, "receipt.json"), checks: receipt.checks.length }));
}
