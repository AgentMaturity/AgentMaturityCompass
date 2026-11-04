#!/usr/bin/env node
// P0-31 installed rows without a committed harness: AMC-1513, AMC-1515/1535, AMC-1520, AMC-1523,
// AMC-1532, AMC-1533, AMC-1545. Installs the release-candidate tarball once into a fresh consumer
// outside any checkout and drives only the installed CLI, the installed public SDK export and the
// local fixture servers in ./fixtures.mjs. Keyless: the stub provider or a scripted local
// Ollama-protocol server. Summaries go to <out>/rows/<row>.json; raw logs stay in <out>/logs.
// Example: node run-rows.mjs --tarball rc.tgz --tarball-sha256 H --cli-sha256 H --out NEW_DIR [--rows 1513,1523]
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { arch, platform, release } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { offeredTools, startMcpHttpFixture, startOllamaFixture, toolResults } from "./fixtures.mjs";

const { values } = parseArgs({ options: Object.fromEntries(["tarball", "tarball-sha256", "cli-sha256", "out", "rows"].map((n) => [n, { type: "string" }])) });
for (const key of ["tarball", "tarball-sha256", "cli-sha256", "out"]) if (!values[key]) throw new Error(`--${key} is required`);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const here = dirname(fileURLToPath(import.meta.url));
const tarball = realpathSync(values.tarball);
if (sha(readFileSync(tarball)) !== values["tarball-sha256"]) throw new Error("tarball bytes differ from --tarball-sha256");
const root = resolve(values.out);
if (existsSync(root)) throw new Error("--out must be a new directory");
process.umask(0o077);
for (const dir of ["", "logs", "rows", "w", "consumer", "consumer-home"]) mkdirSync(join(root, dir), { recursive: true });
const NODE = realpathSync(process.execPath);
const NPM = realpathSync(join(dirname(NODE), "../lib/node_modules/npm/bin/npm-cli.js"));
const BASE_ENV = { PATH: `${dirname(NODE)}:/usr/bin:/bin:/usr/sbin:/sbin`, LANG: "C.UTF-8", CI: "1", NO_COLOR: "1" };
for (const key of Object.keys(process.env)) delete process.env[key]; // SDK children must not inherit developer env.
Object.assign(process.env, BASE_ENV, { HOME: join(root, "consumer-home") });

let seq = 0;
const tail = (text, n = 600) => String(text).slice(-n);
function exec(label, file, args, { cwd, env, input, timeoutMs = 120_000 } = {}) {
  const id = `${String(++seq).padStart(3, "0")}-${label.replace(/[^a-z0-9-]/gi, "-")}`;
  const started = Date.now();
  return new Promise((done) => {
    const child = spawn(file, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"], detached: true });
    let stdout = "", stderr = "", timedOut = false;
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.stdin.on("error", () => {});
    if (input !== undefined) child.stdin.write(input);
    child.stdin.end();
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, "SIGKILL"); } catch {} }, timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      writeFileSync(join(root, "logs", `${id}.out`), stdout); writeFileSync(join(root, "logs", `${id}.err`), stderr);
      done({ id, code, signal, timedOut, stdout, stderr, ms: Date.now() - started, pid: child.pid });
    });
    child.on("error", (error) => { stderr += String(error); });
  });
}
const json = (r) => { try { return JSON.parse(r.stdout); } catch { return null; } };

// ---------- install the RC once ----------
const consumer = join(root, "consumer");
writeFileSync(join(consumer, "package.json"), '{"name":"p031-installed-rows","private":true,"type":"module"}\n');
const installEnv = { ...BASE_ENV, HOME: join(root, "consumer-home"), npm_config_cache: join(root, "consumer-home", "npm-cache"),
  npm_config_userconfig: join(root, "consumer-home", "npmrc"), npm_config_globalconfig: join(root, "consumer-home", "npmrc-global") };
writeFileSync(installEnv.npm_config_userconfig, ""); writeFileSync(installEnv.npm_config_globalconfig, "");
const installed = await exec("install", NODE, [NPM, "install", "--no-audit", "--no-fund", "--loglevel=error", tarball], { cwd: consumer, env: installEnv, timeoutMs: 600_000 });
if (installed.code !== 0) throw new Error(`npm install failed: ${tail(installed.stderr)}`);
const pkgRoot = realpathSync(join(consumer, "node_modules", "agent-maturity-compass"));
const CLI = join(pkgRoot, "dist", "cli.js");
if (sha(readFileSync(CLI)) !== values["cli-sha256"]) throw new Error("installed dist/cli.js differs from --cli-sha256");
const YAML = createRequire(join(pkgRoot, "package.json"))("yaml");
const meta = { schema: "p031-installed-rows/v1", startedAt: new Date().toISOString(), node: process.version, npm: JSON.parse(readFileSync(join(dirname(NPM), "../package.json"), "utf8")).version,
  platform: platform(), arch: arch(), osRelease: release(), tarballSha256: values["tarball-sha256"], installedCliSha256: values["cli-sha256"], harnessSha256: {} };
for (const f of ["run-rows.mjs", "fixtures.mjs", "mcp-stdio-fixture.mjs", "chat-pty.py"]) meta.harnessSha256[f] = sha(readFileSync(join(here, f)));

// ---------- workspaces ----------
async function workspace(name, { store = "jsonl" } = {}) {
  const base = join(root, "w", name), ws = join(base, "ws"), home = join(base, "home"), priv = join(base, "private");
  for (const dir of [ws, home, priv, join(base, "tmp"), join(base, "ckpt")]) mkdirSync(dir, { recursive: true });
  const password = randomUUID(), vault = randomUUID();
  writeFileSync(join(priv, "username"), "acceptance-owner\n"); writeFileSync(join(priv, "password"), `${password}\n`); writeFileSync(join(priv, "vault"), `${vault}\n`);
  const env = { ...BASE_ENV, HOME: home, TMPDIR: join(base, "tmp"), AMC_HOME: home, AMC_WORKSPACE_DIR: ws, ...(store === "jsonl" ? { AMC_SESSION_STORE: "jsonl" } : {}),
    AMC_VAULT_REMEMBER: "0", AMC_VAULT_PASSPHRASE: vault, AMC_VAULT_PASSPHRASE_FILE: join(priv, "vault"), AMC_ENABLE_NOTARY: "0",
    AMC_BOOTSTRAP_OWNER_USERNAME_FILE: join(priv, "username"), AMC_BOOTSTRAP_OWNER_PASSWORD_FILE: join(priv, "password"),
    AMC_CONTROL_CHECKPOINT_DIR: join(base, "ckpt") };
  const w = { name, base, ws, env, priv, password, tokenFile: join(priv, "approval-token"),
    amc: (label, args, opts = {}) => exec(`${name}-${label}`, NODE, [CLI, ...args], { cwd: ws, env, ...opts }) };
  w.must = async (label, args, opts) => {
    const r = await w.amc(label, args, opts);
    if (r.code !== 0) throw new Error(`${name} ${label} exited ${r.code}${r.timedOut ? " (timeout)" : ""}: ${tail(r.stderr || r.stdout)}`);
    return r;
  };
  await w.must("bootstrap", ["bootstrap"]);
  await w.must("agent", ["--agent", "default", "--json"]);
  await w.must("firewall", ["firewall", "enable", "--mode", "block", "--json"]);
  w.monitor = sha(readFileSync(join(ws, ".amc", "keys", "monitor_ed25519.pub"))); // pinned before any execution
  return w;
}
async function editSigned(w, file, kind, edit) {
  const path = join(w.ws, ".amc", file), doc = YAML.parse(readFileSync(path, "utf8"));
  edit(doc); writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
  await w.must(`${kind}-sign`, [kind, "sign", "--json"]);
}
const setAllowedTools = (w, tools) => editSigned(w, "tools.yaml", "tools", (doc) => { doc.tools.allowedTools = tools; });
const defaultAllowed = (w) => YAML.parse(readFileSync(join(w.ws, ".amc", "tools.yaml"), "utf8")).tools.allowedTools;
async function login(w) {
  const r = await w.must("owner-login", ["approvals", "login", "--username", "acceptance-owner", "--token-file", w.tokenFile, "--password-stdin", "--json"], { input: `${w.password}\n` });
  const out = json(r); if (out?.ok !== true) throw new Error("owner login refused"); return out;
}
/** Wait for one pending approval, review it and decide it with the authenticated owner session. */
async function decidePending(w, owner, mode, isDone = () => false, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  for (let poll = 1; Date.now() < deadline && !isDone(); poll++) {
    const listing = json(await w.amc(`pending-${poll}`, ["approvals", "list", "--agent", "default", "--status", "pending", "--json"]));
    const pending = listing?.requests?.[0];
    if (pending) {
      const review = json(await w.amc("approval-show", ["approvals", "show", "--agent", "default", pending.approvalRequestId]));
      const decided = await w.amc(`approve-${mode}`, ["approvals", "approve", "--agent", "default", pending.approvalRequestId, "--mode", mode,
        "--reason", "P0-31 installed acceptance", "--username", owner.username, "--user-id", owner.userId, "--roles", owner.roles.join(","),
        "--session-token-file", w.tokenFile, "--expect-request-digest", review.requestDigestSha256]);
      return { approvalId: pending.approvalRequestId, toolName: review.request?.toolName, requiredApprovals: review.request?.requiredApprovals, decisionExit: decided.code };
    }
    await new Promise((done) => setTimeout(done, 300));
  }
  return null;
}
async function waitPending(w, isDone, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  for (let poll = 1; Date.now() < deadline && !isDone(); poll++) {
    const pending = json(await w.amc(`await-pending-${poll}`, ["approvals", "list", "--agent", "default", "--status", "pending", "--json"]))?.requests?.[0];
    if (pending) return pending.approvalRequestId;
    await new Promise((done) => setTimeout(done, 300));
  }
  return null;
}
function events(w) {
  const path = join(w.ws, ".amc", "jsonl", "events.jsonl");
  if (existsSync(path)) return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const Database = createRequire(join(pkgRoot, "package.json"))("better-sqlite3");
  const db = new Database(join(w.ws, ".amc", "evidence.sqlite"), { readonly: true });
  try { return db.prepare("SELECT event_type, payload_inline, meta_json FROM evidence_events ORDER BY rowid").all(); } finally { db.close(); }
}
const metaOf = (row) => { try { return JSON.parse(row.meta_json); } catch { return {}; } };
async function coldVerify(w, sessionId) {
  const r = await w.amc("cold-verify", ["agent-loop", "verify", sessionId, "--json", "--expect-monitor", w.monitor]);
  return { sessionId, exit: r.code, ok: json(r)?.ok === true };
}
const ollamaRun = (w, label, url, prompt, extra = [], opts = {}) => w.amc(label, ["agent-loop", "run", "--provider", "ollama", "--base-url", url, "--model", "fixture",
  "--tools", "workspace", "--json", ...extra, prompt], opts);
const pick = (body, pattern) => offeredTools(body).find((name) => pattern.test(name));
function check(list, name, ok, details = {}) { list.push({ name, ok: Boolean(ok), ...details }); return Boolean(ok); }
/** Live processes whose whole command line is exactly `marker` (the sleeps themselves, not a launcher that names them). */
function processes(marker) {
  const r = spawnSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" });
  return (r.stdout ?? "").split("\n").filter((line) => line.trim().replace(/^\d+\s+/, "") === marker);
}

// ---------- rows ----------
const ROWS = {
  async "AMC-1513"() {
    const checks = [], w = await workspace("r1513");
    const outside = join(root, `outside-${randomUUID()}.txt`);
    const writeScript = (path) => (body) => toolResults(body).length ? { text: "done" } : { toolCall: { name: pick(body, /^amc_fs_write_/), arguments: { path, content: "p031" } } };
    let fx = await startOllamaFixture(writeScript(outside));
    const escape = await ollamaRun(w, "escape-write", fx.url, "write outside");
    const escapeResult = fx.requests.flatMap(toolResults).join("\n"); await fx.close();
    check(checks, "write-outside-workspace-denied", escape.code === 0 && !existsSync(outside) && /"isError":true/.test(escapeResult) && /denied|escape/i.test(escapeResult),
      { exit: escape.code, outsideExists: existsSync(outside), toolResult: tail(escapeResult, 300) });
    fx = await startOllamaFixture(writeScript("workspace/output/inside.txt"));
    const inside = await ollamaRun(w, "inside-write", fx.url, "write inside");
    const insideResult = fx.requests.flatMap(toolResults).join("\n"); await fx.close();
    const insidePath = join(w.ws, "workspace", "output", "inside.txt");
    check(checks, "control-write-inside-scope-succeeds", inside.code === 0 && existsSync(insidePath) && /"isError":false/.test(insideResult), { exit: inside.code, toolResult: tail(insideResult, 200) });
    const marker = `sleep ${2900 + Math.floor(Math.random() * 99)}`;
    let offered = [];
    fx = await startOllamaFixture((body) => { offered = offeredTools(body); const bash = pick(body, /^bash$/);
      return toolResults(body).length || !bash ? { text: "done" } : { toolCall: { name: bash, arguments: { command: `${marker} & ${marker}; wait`, timeoutMs: 600000 } } }; });
    let finished = false, seen = 0;
    const running = ollamaRun(w, "shell-cancel", fx.url, "run a long command", ["--cancel-after", "5000"]).finally(() => { finished = true; });
    while (!finished) { seen = Math.max(seen, processes(marker).length); await new Promise((d) => setTimeout(d, 200)); }
    const cancelled = await running; await fx.close();
    await new Promise((d) => setTimeout(d, 1500));
    const left = processes(marker);
    const shellOffered = offered.includes("bash");
    const row = events(w).filter((e) => metaOf(e).auditType === "NATIVE_SHELL_CONFINEMENT").map(metaOf).at(-1) ?? null;
    if (!shellOffered) {
      check(checks, "shell-refused-not-offered", true, { stderr: tail(cancelled.stderr, 400) });
      return { status: "exception", exception: "native shell not offered on this host; cancellation of a confined process tree not exercised", checks, offered };
    }
    if (row && row.confined !== true) {
      // The boundary could not start (for example no user namespaces for Bubblewrap): the call must fail closed with nothing run.
      // Nothing ran (no marker process ever appeared), the backend stayed the confining one and the row says unconfirmed.
      check(checks, "shell-fails-closed-when-the-boundary-cannot-start", seen === 0 && left.length === 0 && ["bwrap", "seatbelt"].includes(row.backend) && row.failure != null,
        { processesSeenDuringRun: seen, confinement: { platform: row.platform, backend: row.backend, confined: row.confined, enforcementLevel: row.enforcementLevel, failure: row.failure } });
      return { status: checks.every((c) => c.ok) ? "exception" : "failed", exception: `confined shell could not start on this host (${JSON.stringify(row.failure).slice(0, 240)}); cancellation of a confined process tree not exercised`, checks, offered };
    }
    check(checks, "cancel-mid-command-kills-process-tree", JSON.parse(cancelled.stdout || "{}").endings?.[0]?.reason === "cancelled" && seen >= 1 && left.length === 0
      && row?.cancelled === true && row?.treeExitProven === true && row?.confined === true,
      { exit: cancelled.code, ending: json(cancelled)?.endings?.[0] ?? null, processesSeenDuringRun: seen, processesLeft: left.length,
        confinement: row && { platform: row.platform, backend: row.backend, confined: row.confined, enforcementLevel: row.enforcementLevel, cancelled: row.cancelled, treeExitProven: row.treeExitProven, failure: row.failure } });
    return { status: checks.every((c) => c.ok) ? "passed" : "failed", checks, offered };
  },

  async "AMC-1515/1535"() {
    const checks = [];
    for (const transport of ["stdio", "http"]) {
      const w = await workspace(`r1515-${transport}`), owner = await login(w);
      const http = { plain: null, notify: null, strict: null };
      const configFor = async (mode) => {
        const log = join(w.base, `calls-${mode}.log`); writeFileSync(log, "");
        if (transport === "http") http[mode] = await startMcpHttpFixture(mode);
        const server = transport === "stdio"
          ? { id: "p031fixture", command: NODE, args: [join(here, "mcp-stdio-fixture.mjs"), log, mode], timeoutMs: 20_000 }
          : { transport: "streamable-http", id: "p031fixture", url: http[mode].url, origin: http[mode].origin, timeoutMs: 20_000 };
        const path = join(w.base, `mcp-${mode}.json`), config = { schemaVersion: 1, server };
        writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
        const catalog = json(await w.must(`catalog-${mode}`, ["agent-loop", "mcp-catalog", "--config", path, "--json"]));
        config.expectedCatalogDigest = catalog.digest; config.grants = [{ name: "note", actionClass: "WRITE_LOW" }];
        writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
        return { path, toolName: catalog.allowlistNames[0].amcToolName, calls: () => transport === "stdio" ? readFileSync(log, "utf8").split("\n").filter(Boolean).length : http[mode].calls() };
      };
      const configs = { plain: await configFor("plain"), notify: await configFor("notify"), strict: await configFor("strict") };
      await setAllowedTools(w, [{ name: configs.plain.toolName, actionClass: "WRITE_LOW" }]);
      // The native seam requests EXECUTE only (src/agent/pipelineToolSeam.ts:98,156), so no installed surface reaches a
      // SIMULATE MCP call: the strict case shows validation before EXECUTE; SIMULATE ordering stays in-process tested.
      for (const mode of ["plain", "notify", "strict"]) {
        const cfg = configs[mode], callsBefore = cfg.calls();
        const fx = await startOllamaFixture((body) => toolResults(body).length ? { text: "done" }
          : { toolCall: { name: offeredTools(body)[0], arguments: mode === "strict" ? { text: "schema-invalid for the strict tool" } : { text: `p031 ${transport} ${mode}` } } });
        let finished = false;
        const run = ollamaRun(w, `mcp-${mode}`, fx.url, `call the note tool (${mode})`, ["--mcp-config", cfg.path, "--mcp-config-sha256", sha(readFileSync(cfg.path)),
          "--approve-tools", "WRITE_LOW", "--approve-risk", "low"]).finally(() => { finished = true; });
        const decision = await decidePending(w, owner, "execute", () => finished);
        const r = await run; const result = fx.requests.flatMap(toolResults).join("\n"); await fx.close();
        const sessionId = json(r)?.sessionId, cold = sessionId ? await coldVerify(w, sessionId) : null;
        const calls = cfg.calls() - callsBefore;
        const common = { exit: r.code, decision, remoteCalls: calls, toolResult: tail(result, 300), coldVerified: cold?.ok ?? false };
        if (mode === "plain") check(checks, `${transport}: completed remote call is recorded as completed`, r.code === 0 && calls === 1 && /"isError":false/.test(result) && result.includes("remote side effect committed") && cold?.ok, common);
        if (mode === "notify") check(checks, `${transport}: result received after grant disposal is reported executed, not replayed`, r.code === 0 && calls === 1 && result.includes("the remote tool executed and its received result was discarded. It was not replayed.") && cold?.ok, common);
        if (mode === "strict") check(checks, `${transport}: schema-invalid arguments are refused before any remote call`, r.code === 0 && calls === 0 && result.includes("MCP arguments do not match the reviewed tool schema"), common);
      }
      for (const fx of Object.values(http)) await fx?.close();
    }
    return { status: checks.every((c) => c.ok) ? "passed" : "failed", checks,
      note: "SIMULATE is not reachable for a native MCP call from the installed CLI, SDK or ACP (the native seam requests EXECUTE only); validation-before-simulation is covered in-process by tests/reconciliationDefectsMcp.test.ts and tests/reconciliationDefectsMcpHttp.test.ts." };
  },

  async "AMC-1520"() {
    const checks = [], w = await workspace("r1520");
    const dir = join(w.base, "dsh"); mkdirSync(dir);
    const entry = join(dir, "dsh-entry.mjs");
    writeFileSync(entry, "if (process.argv.includes('--version')) console.log('0.1.3-alpha.2'); else console.log('p031 dsh fixture ran');\n");
    const launch = join(dir, "launch.json");
    writeFileSync(launch, JSON.stringify({ executable: { path: NODE, sha256: sha(readFileSync(NODE)) }, entrypoint: { path: entry, sha256: sha(readFileSync(entry)) } }));
    await w.must("dsh-configure", ["adapters", "configure", "--agent", "default", "--adapter", "deepseek-harness", "--route", "/openai", "--model", "fixture-model", "--mode", "SUPERVISE", "--launch-config", launch]);
    const studio = await startStudio(w);
    try {
      const first = await w.amc("dsh-run-approved", ["adapters", "run", "--agent", "default", "--adapter", "deepseek-harness", "--", "one task"]);
      check(checks, "approved launch files spawn the runtime", first.code === 0, { exit: first.code, stderr: tail(first.stderr, 300) });
      appendFileSync(entry, "// changed after approval\n");
      const second = await w.amc("dsh-run-changed", ["adapters", "run", "--agent", "default", "--adapter", "deepseek-harness", "--", "one task"]);
      check(checks, "a changed approved file is refused before spawn", second.code !== 0 && /DSH approved launch artifact changed/.test(second.stderr + second.stdout), { exit: second.code, message: tail(second.stderr || second.stdout, 300) });
    } finally { await studio.stop(); }
    const ledger = await w.amc("ledger-verify", ["session", "verify", "--json", "--expect-monitor", w.monitor]);
    check(checks, "ledger verifies after the refusal", ledger.code === 0 && json(ledger)?.ok === true, { exit: ledger.code });
    return { status: checks.every((c) => c.ok) ? "passed" : "failed", checks,
      note: "Installed check of the launch pin. The spawn-site re-hash itself (between preparation and spawn) is not reachable from outside the process; tests/dshRunnerReverify.test.ts covers it and the P0-31 mutation batch removes the call." };
  },

  async "AMC-1523"() {
    const checks = [], w = await workspace("r1523");
    const when = "2026-09-08T00:00:00.000Z", file = join(w.base, "pi.jsonl");
    writeFileSync(file, [JSON.stringify({ type: "session", version: 3, id: "reply", timestamp: when, cwd: "/fixture" }), "not json",
      JSON.stringify({ type: "message", id: "user", parentId: null, timestamp: when, message: { role: "user", content: "prompt" } }),
      JSON.stringify({ type: "message", id: "reply", parentId: "user", timestamp: when, message: { role: "assistant", content: [{ type: "text", text: "answer" }], stopReason: "stop" } }),
      JSON.stringify({ type: "malformed", id: 123 })].join("\n"));
    const r = await w.amc("import-dry-run", ["import", file, "--agent", "default", "--dry-run"]);
    const out = r.stdout;
    check(checks, "text mode names the format and version", /format pi-session v3/.test(out) && !/format 3\b/.test(out), { line: out.split("\n").find((l) => /format/.test(l)) ?? null });
    check(checks, "text mode prints record counts", /Records: 5 \(1 mapped, 2 retained only, 2 malformed, 0 unsupported\)/.test(out), { line: out.split("\n").find((l) => /Records:/.test(l)) ?? null });
    check(checks, "text mode prints next actions with the reviewed digest", /Next: .*--expected-digest [a-f0-9]{64}/.test(out), { line: tail(out.split("\n").find((l) => /Next: .*--expected-digest [a-f0-9]{64}/.test(l)) ?? "", 200) });
    check(checks, "dry run exits 0 and writes no import", r.code === 0 && !existsSync(join(w.ws, ".amc", "imports", "originals.jsonl")), { exit: r.code });
    return { status: checks.every((c) => c.ok) ? "passed" : "failed", checks };
  },

  async "AMC-1532"() {
    const checks = [], surfaces = {};
    const sdkEntry = realpathSync(fileURLToPath(await resolveSdk()));
    const Native = await import(pathToFileURL(sdkEntry).href);
    for (const surface of ["cli", "sdk", "acp"]) {
      // Default (SQLite) session store: under AMC_SESSION_STORE=jsonl a second session in one process is refused (follow-up).
      const w = await workspace(`r1532-${surface}`, { store: "sqlite" });
      await editSigned(w, "budgets.yaml", "budgets", (doc) => { const a = doc.budgets.perAgent.default; a.daily.maxLlmRequests = 3; a.perMinute.maxLlmRequests = 3; });
      const owner = await login(w);
      const s = surface === "cli" ? cliSurface(w) : surface === "sdk" ? await sdkSurface(w, Native) : await acpSurface(w);
      const result = { surface };
      try {
        const t1 = s.turn("parity approval turn");
        result.approval = await decidePending(w, owner, "execute", t1.isDone);
        result.approved = await t1.done;
        const t2 = s.turn("parity cancel turn");
        result.pendingBeforeCancel = await waitPending(w, t2.isDone);
        await t2.cancel(); result.cancelled = await t2.done;
        result.quota = await s.turn("parity quota turn").done;
      } finally { result.closed = await s.close(); }
      result.cold = [];
      for (const id of new Set([result.approved?.sessionId, result.cancelled?.sessionId].filter(Boolean))) result.cold.push(await coldVerify(w, id));
      const budget = json(await w.amc("budget-status", ["budgets", "status", "--agent", "default"]));
      result.budget = budget?.usage?.daily ? { llmRequests: budget.usage.daily.llmRequests, toolExecutes: budget.usage.daily.toolExecutes?.WRITE_LOW } : null;
      surfaces[surface] = result;
      check(checks, `${surface}: approval gates the same tool and the approved turn completes`, result.approval?.toolName === "fs.read" && result.approval?.requiredApprovals === 1 && result.approved?.state === "completed",
        { toolName: result.approval?.toolName ?? null, approved: result.approved });
      check(checks, `${surface}: a turn held at approval is cancelled`, Boolean(result.pendingBeforeCancel) && result.cancelled?.state === "cancelled", { pendingBeforeCancel: result.pendingBeforeCancel, cancelled: result.cancelled });
      const refusal = events(w).filter((e) => e.event_type === "request/failure").map(metaOf).find((m) => m.amcSession?.sessionId === result.quota?.sessionId) ?? null;
      check(checks, `${surface}: the daily request quota refuses the next request before dispatch`, result.quota?.state === "refused" && refusal?.dispatchAttempted === false && /budget exhausted/.test(refusal?.failure?.message ?? ""),
        { quota: result.quota, ledgerFailure: refusal && { message: refusal.failure?.message, code: refusal.failure?.code, dispatchAttempted: refusal.dispatchAttempted } });
      check(checks, `${surface}: sessions verify cold`, result.cold.length > 0 && result.cold.every((c) => c.ok), { cold: result.cold });
    }
    // Probe, not a parity check: the same second ACP session under AMC_SESSION_STORE=jsonl (follow-up evidence).
    const pw = await workspace("r1532-jsonl-probe");
    const probe = spawn(NODE, [CLI, "acp", "--provider", "stub", "--tools", "none"], { cwd: pw.ws, env: pw.env, stdio: ["pipe", "pipe", "pipe"] });
    const replies = [], probeErr = [];
    probe.stderr.on("data", (d) => probeErr.push(String(d)));
    probe.stdout.on("data", (d) => { for (const line of String(d).split("\n").filter(Boolean)) { try { replies.push(JSON.parse(line)); } catch {} } });
    const send = async (id, method, params) => { probe.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      for (const until = Date.now() + 30_000; Date.now() < until && !replies.some((r) => r.id === id);) await new Promise((d) => setTimeout(d, 100));
      return replies.find((r) => r.id === id) ?? null; };
    await send(0, "initialize", { protocolVersion: 1, clientCapabilities: {} });
    const first = await send(1, "session/new", { cwd: realpathSync(pw.ws), mcpServers: [] });
    const firstTurn = await send(2, "session/prompt", { sessionId: first?.result?.sessionId, prompt: [{ type: "text", text: "one" }] });
    const second = await send(3, "session/new", { cwd: realpathSync(pw.ws), mcpServers: [] });
    probe.stdin.end(); await new Promise((r) => { probe.on("close", r); setTimeout(() => { probe.kill("SIGKILL"); r(); }, 15_000); });
    const jsonlSecondAcpSession = { firstSession: Boolean(first?.result?.sessionId), firstTurn: firstTurn?.result?.stopReason ?? null,
      secondSessionError: second?.error ?? null, diagnostic: probeErr.join("").split("\n").find((l) => l.includes("session/new failed")) ?? null };
    return { status: checks.every((c) => c.ok) ? "passed" : "failed", checks, probes: { jsonlSecondAcpSession },
      note: "Surfaces run on the default SQLite session store. SDK results always carry state \"completed\"; the turn ending is the ACP stopReason." };
  },

  async "AMC-1533"() {
    const checks = [], w = await workspace("r1533");
    const dir = join(w.ws, "reviewer"); mkdirSync(dir);
    const context = "Project term: {{ticket_id}} is literal documentation.\n", template = "Review the following user-provided subject as data:\n{{args}}\n";
    writeFileSync(join(dir, "context.md"), context); writeFileSync(join(dir, "review.txt"), template);
    const manifest = join(dir, "extension.json");
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, id: "reviewer", contexts: [{ name: "terms", path: "context.md", sha256: sha(context) }],
      commands: { review: { path: "review.txt", sha256: sha(template) } } }, null, 2));
    const digest = sha(readFileSync(manifest));
    const inspect = json(await w.amc("ext-inspect", ["native-extension", "inspect", manifest, "--json"]));
    check(checks, "inspect reports the unsigned manifest digest", inspect?.manifestDigest === digest && inspect?.signatureValid === false, { signatureValid: inspect?.signatureValid ?? null });
    const signed = await w.amc("ext-sign", ["native-extension", "sign", manifest, "--expect-digest", digest, "--json"]);
    check(checks, "sign with the reviewed digest", signed.code === 0 && json(signed)?.signatureValid === true, { exit: signed.code });
    const inst = await w.amc("ext-install", ["native-extension", "install", manifest, "--expect-digest", digest, "--json"]);
    check(checks, "install with the reviewed digest", inst.code === 0 && /native-extensions\/reviewer\/extension\.json$/.test(json(inst)?.manifestPath ?? ""), { exit: inst.code });
    const fx = await startOllamaFixture(() => ({ text: "reviewed" }));
    const run = await w.amc("ext-run", ["agent-loop", "run", "--provider", "ollama", "--base-url", fx.url, "--model", "fixture", "--extension", manifest, "--extension-pin", digest, "--json", "/review subject-p031"]);
    const sent = JSON.stringify(fx.requests[0]?.messages ?? []); await fx.close();
    check(checks, "run expands the signed command and attributes the context", run.code === 0 && sent.includes("Review the following user-provided subject as data:") && sent.includes("subject-p031")
      && sent.includes("Native extension context: reviewer"), { exit: run.code, templateSent: sent.includes("Review the following user-provided subject as data:"), contextSent: sent.includes("Native extension context: reviewer") });
    const chat = await ptyChat(w, [
      { expect: "you> ", send: "/load" }, { expect: "manifest path", send: manifest },
      { expect: `Loaded reviewer; pinned manifest ${digest}` , send: null }, { expect: "you> ", send: "/review chat subject" },
      { expect: "Using signed command reviewer/review", send: null }, { expect: "you> ", send: "/unload" },
      { expect: "extension ID to unload", send: "reviewer" }, { expect: "Extension unloaded for future turns.", send: null },
      { expect: "you> ", send: "/exit" }]);
    check(checks, "chat loads, uses and unloads the extension", chat.ok, { matched: chat.matched, error: chat.error ?? null });
    appendFileSync(join(dir, "review.txt"), "tampered\n");
    const tamperedRun = await w.amc("ext-run-tampered", ["agent-loop", "run", "--provider", "stub", "--extension", manifest, "--extension-pin", digest, "--json", "/review x"]);
    const tamperedInspect = await w.amc("ext-inspect-tampered", ["native-extension", "inspect", manifest, "--json"]);
    check(checks, "an edited signed content file is refused", tamperedRun.code !== 0 && /CONTENT_CHANGED|content hash differs/i.test(tamperedRun.stdout + tamperedRun.stderr)
      && tamperedInspect.code !== 0 && /CONTENT_CHANGED|content hash differs/i.test(tamperedInspect.stdout + tamperedInspect.stderr), { runExit: tamperedRun.code, inspectExit: tamperedInspect.code, message: tail(tamperedRun.stderr || tamperedRun.stdout, 200) });
    return { status: checks.every((c) => c.ok) ? "passed" : "failed", checks };
  },

  async "AMC-1545"() {
    const checks = [], jsonlProbe = [];
    // The row runs on the default SQLite store; the same runs under AMC_SESSION_STORE=jsonl are a probe (follow-up evidence).
    for (const store of ["sqlite", "jsonl"]) {
    const list = store === "sqlite" ? checks : jsonlProbe;
    const w = await workspace(`r1545-${store}`, { store });
    await setAllowedTools(w, [...defaultAllowed(w), { name: "delegate", actionClass: "READ_ONLY" }]);
    for (const [stop, delayMs, expected] of [["max-turns:1", 0, "max-turns:1 ceiling reached"], ["timeout-ms:1500", 6000, "timeout-ms:1500 lifetime expired"]]) {
      const before = events(w).length;
      const isChild = (body) => (body.messages ?? []).some((m) => m.role === "user" && String(m.content).includes("CHILD:"));
      const fx = await startOllamaFixture((body) => isChild(body) ? { text: "child report", delayMs }
        : toolResults(body).length ? { text: "parent done" } : { toolCall: { name: pick(body, /delegate/), arguments: { runAs: "child", goal: "CHILD: report back" } } });
      const r = await ollamaRun(w, `delegate-${stop}`, fx.url, "delegate once", ["--delegate", "--delegate-stop", stop], { timeoutMs: 120_000 });
      const delegateResult = fx.requests.flatMap(toolResults).join("\n"); await fx.close();
      const rows = events(w).slice(before), raw = rows.map((e) => `${e.payload_inline ?? ""} ${e.meta_json}`).join("\n");
      const childRequests = fx.requests.filter(isChild).length;
      // The stop is the child's; a parent request after an aborted child request meets the unknown-token-usage budget rule (see follow-ups).
      const parent = json(r);
      check(list, `${store} store: installed delegated run stops on ${stop}`, (stop.startsWith("max-turns") ? r.code === 0 : true) && childRequests >= 1 && raw.includes(expected),
        { exit: r.code, childRequests, recorded: raw.includes(expected), parentEnding: parent?.endings?.[0]?.reason ?? null,
          parentDiagnostics: (parent?.diagnostics ?? []).map((d) => d.guidance?.code ?? d.source), delegateToolResult: tail(delegateResult, 300) });
    }
    }
    return { status: checks.every((c) => c.ok) ? "passed" : "failed", checks, probes: { jsonlStore: jsonlProbe } };
  }
};

// ---------- surfaces for AMC-1532 ----------
const APPROVAL_FLAGS = ["--tools", "workspace", "--approve-tools", "WRITE_LOW", "--approve-risk", "low"];
function cliSurface(w) {
  return {
    turn(prompt) {
      let finished = false, child = null;
      const done = new Promise((resolveDone) => {
        const run = spawn(NODE, [CLI, "agent-loop", "run", "--provider", "stub", ...APPROVAL_FLAGS, "--json", prompt], { cwd: w.ws, env: w.env, stdio: ["ignore", "pipe", "pipe"] });
        child = run; let out = "", err = "";
        run.stdout.on("data", (d) => { out += d; }); run.stderr.on("data", (d) => { err += d; });
        run.on("close", (code) => {
          finished = true; writeFileSync(join(root, "logs", `${String(++seq).padStart(3, "0")}-${w.name}-cli-turn.err`), err);
          let parsed = null; try { parsed = JSON.parse(out); } catch {}
          const reason = parsed?.endings?.[0]?.reason;
          resolveDone({ exit: code, sessionId: parsed?.sessionId ?? null, state: reason === "complete" ? "completed" : reason === "cancelled" ? "cancelled" : code !== 0 ? "refused" : String(reason),
            detail: tail(JSON.stringify(parsed?.diagnostics ?? []) + err, 300) });
        });
      });
      return { done, isDone: () => finished, cancel: async () => { child?.kill("SIGINT"); } };
    },
    close: async () => "n/a"
  };
}
async function sdkSurface(w, Native) {
  const client = await Native.AMCNativeClient.start({ workspace: w.ws, provider: "stub", agentId: "default", tools: "workspace", approveTools: "WRITE_LOW", approveRisk: "low",
    credentialsMode: "operator-only", credentialsHome: w.env.AMC_HOME, maxTokens: 128, maxSteps: 3, timeoutMs: 60_000, env: w.env });
  return {
    turn(prompt) {
      // One new session per turn, as the CLI opens one per run; the stub only calls a tool in a fresh history.
      let finished = false, turn = null, session = null;
      const opened = client.newSession().then((s) => { session = s; turn = s.prompt(prompt); return turn.result; });
      // The SDK result is always state "completed" (the prompt request finished); the turn's ending is its ACP stopReason.
      const done = opened.then((r) => ({ state: r.stopReason === "end_turn" ? "completed" : r.stopReason === "cancelled" ? "cancelled" : String(r.stopReason), sessionId: session.sessionId, detail: tail(r.text ?? "", 200) }),
        (e) => ({ state: /cancel/i.test(String(e?.message ?? e)) ? "cancelled" : "refused", sessionId: session?.sessionId ?? null, detail: tail(`${e?.code ?? ""} ${e?.message ?? e} ${JSON.stringify(e?.data ?? {})}`, 300) }))
        .finally(() => { finished = true; });
      return { done, isDone: () => finished, cancel: async () => { await turn?.cancel(); } };
    },
    close: async () => { try { await client.close(); return { closed: true }; } catch (e) { return { error: tail(String(e), 200) }; } }
  };
}
async function acpSurface(w) {
  const child = spawn(NODE, [CLI, "acp", "--provider", "stub", ...APPROVAL_FLAGS], { cwd: w.ws, env: w.env, stdio: ["pipe", "pipe", "pipe"] });
  let buffer = "", err = "", next = 0; const waiting = new Map();
  child.stderr.on("data", (d) => { err += d; });
  child.stdout.on("data", (d) => { buffer += d; let i; while ((i = buffer.indexOf("\n")) >= 0) { const line = buffer.slice(0, i); buffer = buffer.slice(i + 1);
    let m; try { m = JSON.parse(line); } catch { continue; } if (m.id !== undefined && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } } });
  const call = (method, params) => new Promise((res) => { const id = next++; waiting.set(id, res); child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`); });
  await call("initialize", { protocolVersion: 1, clientCapabilities: {} });
  return {
    turn(prompt) {
      // One new ACP session per turn, as the CLI opens one per run.
      let finished = false, sessionId = null;
      const done = call("session/new", { cwd: realpathSync(w.ws), mcpServers: [] }).then((created) => {
        sessionId = created.result?.sessionId;
        if (!sessionId) throw new Error(`ACP session/new failed: ${JSON.stringify(created.error)}`);
        return call("session/prompt", { sessionId, prompt: [{ type: "text", text: prompt }] });
      }).then((m) => ({
        state: m.result?.stopReason === "end_turn" ? "completed" : m.result?.stopReason === "cancelled" ? "cancelled" : m.error ? "refused" : String(m.result?.stopReason),
        sessionId, detail: tail(JSON.stringify(m.error ?? m.result), 300) }), (e) => ({ state: "refused", sessionId, detail: tail(String(e), 300) })).finally(() => { finished = true; });
      return { done, isDone: () => finished, cancel: async () => { child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId } })}\n`); } };
    },
    close: async () => { child.stdin.end(); const code = await new Promise((r) => { child.on("close", r); setTimeout(() => { child.kill("SIGTERM"); }, 15_000); });
      writeFileSync(join(root, "logs", `${String(++seq).padStart(3, "0")}-${w.name}-acp.err`), err); return { exit: code }; }
  };
}
async function resolveSdk() {
  const bridge = join(consumer, "resolve-native.mjs");
  writeFileSync(bridge, 'export const nativeUrl = import.meta.resolve("agent-maturity-compass/sdk/native");\n');
  return (await import(pathToFileURL(bridge).href)).nativeUrl;
}

// ---------- Studio (for AMC-1520) and pty chat (for AMC-1533) ----------
async function startStudio(w) {
  const port = 20000 + Math.floor(Math.random() * 20000), dashboard = port + 1;
  const env = { ...w.env, AMC_STUDIO_PORT: String(port), AMC_HOST_PORT: String(port), AMC_GATEWAY_PORT: String(port + 2), AMC_PROXY_PORT: String(port + 3),
    AMC_TOOLHUB_PORT: String(port + 4), AMC_METRICS_PORT: String(port + 5), AMC_BIND: "127.0.0.1", AMC_HOST_BIND: "127.0.0.1" };
  const child = spawn(NODE, [CLI, "studio", "start", "--workspace", w.ws, "--bind", "127.0.0.1", "--port", String(port), "--dashboard-port", String(dashboard)], { cwd: w.ws, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let log = ""; child.stdout.on("data", (d) => { log += d; }); child.stderr.on("data", (d) => { log += d; });
  const deadline = Date.now() + 60_000;
  for (;;) {
    try { const r = await fetch(`http://127.0.0.1:${port}/console/native-tasks`); if (r.status === 200) break; } catch {}
    if (Date.now() > deadline || child.exitCode !== null) throw new Error(`Studio did not become ready: ${tail(log)}`);
    await new Promise((d) => setTimeout(d, 300));
  }
  return { stop: async () => { try { process.kill(-child.pid, "SIGTERM"); } catch {} await new Promise((r) => { if (child.exitCode !== null) r(); else { child.on("close", r); setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} r(); }, 20_000); } });
    writeFileSync(join(root, "logs", `${String(++seq).padStart(3, "0")}-${w.name}-studio.log`), log); } };
}
async function ptyChat(w, steps) {
  const script = join(w.base, "chat-script.json");
  writeFileSync(script, JSON.stringify({ argv: [NODE, CLI, "agent-loop", "chat", "--provider", "stub"], cwd: w.ws, env: w.env, steps, timeoutSeconds: 60 }));
  const r = await exec(`${w.name}-chat-pty`, "/usr/bin/env", ["python3", "-I", join(here, "chat-pty.py"), script], { cwd: w.base, env: BASE_ENV, timeoutMs: 120_000 });
  try { return JSON.parse(r.stdout); } catch { return { ok: false, error: tail(r.stderr || r.stdout) }; }
}

// ---------- main ----------
const selected = values.rows ? values.rows.split(",").map((r) => r.startsWith("AMC-") ? r : `AMC-${r}`) : Object.keys(ROWS);
const summary = { ...meta, rows: {} };
for (const name of selected) {
  const started = Date.now();
  let result;
  try { result = await ROWS[name](); }
  catch (error) { result = { status: "failed", error: tail(error?.stack ?? String(error), 1200) }; }
  result = { row: name, ...result, durationMs: Date.now() - started };
  summary.rows[name] = result.status;
  writeFileSync(join(root, "rows", `${name.replace("/", "-")}.json`), `${JSON.stringify({ ...meta, ...result }, null, 2)}\n`);
  console.log(`${name}: ${result.status}`);
}
summary.finishedAt = new Date().toISOString();
writeFileSync(join(root, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary.rows));
