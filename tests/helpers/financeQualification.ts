import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, closeSync, copyFileSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Test-owned client/oracle only. Never import server.mjs: its crash fault calls process.exit(70).
const financeSourceRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
export const financeSeedPath = resolve(financeSourceRoot, "spec/fixtures/v1/lighthouse-finance/seed.json");
export const financeFaultPath = (mode: string): string => resolve(financeSourceRoot, `spec/fixtures/v1/lighthouse-finance/faults/${mode}.json`);
export function canonical(value: unknown): string {
  const sorted = (item: unknown): unknown => Array.isArray(item) ? item.map(sorted)
    : item !== null && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, sorted(child)])) : item;
  return JSON.stringify(sorted(value));
}
export const hash = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
export const payment = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: "refund", sourceAccountId: "acct-a-op", payeeId: "payee-a-002", amountMinor: 12000,
  currency: "USD", reference: "RF-1002", originalTxnId: "txn-a-1002", ...overrides
});
interface FinanceLogRecord { seq: number; ts: string; kind: string; prevHash: string; hash: string; [key: string]: unknown }
export interface FinanceSnapshot {
  records: FinanceLogRecord[]; commits: FinanceLogRecord[]; posts: FinanceLogRecord[];
  checkpoint: { seq: number; hash: string }; logSha256: string;
}
interface FinanceReply { status: number | null; headers: IncomingHttpHeaders; body: unknown; transportError: string | null }
interface Ready { ready: true; apiSocket: string | null; adminSocket: string; logPath: string; apiOrigin?: string }
interface ChildRun {
  child: ChildProcess; closed: boolean; verified: boolean; code: number | null; signal: NodeJS.Signals | null;
  close: Promise<void>; stdout: string; stderr: string; argv: string[];
}
async function within<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(label)), ms); })]); }
  finally { clearTimeout(timer); }
}
export interface FinanceFixture {
  root: string; runDir: string; seedPath: string; readonly apiSocket: string | undefined; readonly apiBaseUrl: string | undefined;
  token(clientId: string): string;
  request(clientId: string | null, method: string, path: string, options?: { body?: unknown; rawBody?: string; headers?: Record<string, string> }): Promise<FinanceReply>;
  admin(method: string, path: string, body?: unknown): Promise<FinanceReply>;
  snapshot(): FinanceSnapshot; observe(value: unknown): void;
  stop(): Promise<void>; waitForExit(expectedCode: number): Promise<void>; restart(expectedStartupExit?: 1): Promise<void>;
  finish(success: boolean): Promise<void>;
}
async function createFinanceFixture(options: { port?: 0; seed?: unknown; faultsPath?: string } = {}): Promise<FinanceFixture> {
  // /tmp keeps the run directory short enough for Unix socket paths; realpath gives the physical path on every OS.
  const root = realpathSync(mkdtempSync("/tmp/lhf-")); chmodSync(root, 0o700);
  const runDir = join(root, "run"), home = join(root, "home"), seedPath = join(root, "seed.json");
  mkdirSync(home, { mode: 0o700 });
  if (options.seed === undefined) { copyFileSync(financeSeedPath, seedPath); chmodSync(seedPath, 0o600); }
  else writeFileSync(seedPath, `${canonical(options.seed)}\n`, { flag: "wx", mode: 0o600 });
  const observations: unknown[] = [], runs: ChildRun[] = []; let ready: Ready | undefined;
  let tokens: Record<string, string> = {}, finished = false, expectedHistoryRefusal = false;
  const observe = (value: unknown): void => { observations.push(value); };
  const safe = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item !== "string") return item;
    let text = item;
    for (const token of Object.values(tokens)) text = text.replaceAll(token, "[REDACTED]");
    return text;
  }));
  const publish = (success: boolean, cleanupErrors: string[]): void => {
    const record = safe({ root, success, cleanupErrors, observations });
    writeFileSync(join(root, "qualification-observations.json"), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    process.stdout.write(`AMC_P119_FINANCE_OBSERVATION ${JSON.stringify(record)}\n`);
  };
  async function waitForExit(expectedCode: number): Promise<void> {
    const run = runs.at(-1); if (!run) throw new Error("No owned finance child");
    await within(run.close, 5000, "Owned finance child did not naturally close; fixture retained without signals");
    const probes: Array<{ absent: boolean; code?: string }> = []; let absent = false;
    const until = Date.now() + 1000;
    do {
      try { process.kill(run.child.pid!, 0); probes.push({ absent: false }); }
      catch (error) { const code = (error as NodeJS.ErrnoException).code; probes.push({ absent: code === "ESRCH", code }); if (code === "ESRCH") { absent = true; break; } throw error; }
      await new Promise(done => setTimeout(done, 20));
    } while (Date.now() < until);
    observe({ child: { pid: run.child.pid, argv: run.argv, code: run.code, signal: run.signal, streamsClosed: run.closed, probes,
      stdout: run.stdout, stderr: run.stderr } });
    if (!absent || run.signal !== null || run.code !== expectedCode) throw new Error(`Finance child closure mismatch: expected ${expectedCode}, actual ${run.code}/${run.signal}; fixture retained`);
    run.verified = true;
  }
  async function start(expectedStartupExit?: 1): Promise<void> {
    const old = runs.at(-1); if (old && (!old.closed || !old.verified)) throw new Error("Prior finance child closure is not verified");
    ready = undefined; expectedHistoryRefusal = false;
    const argv = [resolve(financeSourceRoot, "examples/lighthouse-finance/service/server.mjs"), "--dir", runDir, "--seed", seedPath,
      ...(options.port === undefined ? [] : ["--port", String(options.port)]),
      ...(options.faultsPath === undefined ? [] : ["--faults", options.faultsPath])];
    const stdoutFd = openSync(join(root, `child-${runs.length + 1}.stdout.log`), "wx", 0o600);
    const stderrFd = openSync(join(root, `child-${runs.length + 1}.stderr.log`), "wx", 0o600);
    const child = spawn(process.execPath, argv, { cwd: root, env: { HOME: home, TMPDIR: root, PATH: process.env.PATH ?? "", LANG: "C", TZ: "UTC" }, stdio: ["ignore", "pipe", "pipe"] });
    let readyResolve!: (value: Ready) => void, readyReject!: (error: Error) => void;
    const readyPromise = new Promise<Ready>((done, reject) => { readyResolve = done; readyReject = reject; });
    // A failed-start caller awaits close rather than readiness; still consume readiness rejection.
    void readyPromise.catch(() => {});
    const run: ChildRun = { child, closed: false, verified: false, code: null, signal: null, close: Promise.resolve(), stdout: "", stderr: "", argv: [process.execPath, ...argv] };
    run.close = new Promise(done => child.once("close", (code, signal) => { run.code = code; run.signal = signal; run.closed = true; closeSync(stdoutFd); closeSync(stderrFd); done(); }));
    runs.push(run);
    child.once("error", error => { observe({ spawnError: error.message }); readyReject(error); });
    child.stdout!.on("data", (chunk: Buffer) => {
      writeSync(stdoutFd, chunk); run.stdout += chunk.toString("utf8");
      if (run.stdout.includes("\n")) {
        try {
          const candidate = JSON.parse(run.stdout.slice(0, run.stdout.indexOf("\n"))) as Ready;
          if (candidate.ready !== true || candidate.adminSocket !== join(runDir, "admin.sock") || candidate.logPath !== join(runDir, "txlog.jsonl")
            || (options.port === undefined ? candidate.apiSocket !== join(runDir, "api.sock") : !/^http:\/\/127\.0\.0\.1:\d+$/.test(candidate.apiOrigin ?? ""))) throw new Error("Unexpected finance child readiness");
          readyResolve(candidate);
        } catch (error) { readyReject(error as Error); }
      }
    });
    child.stderr!.on("data", (chunk: Buffer) => { writeSync(stderrFd, chunk); run.stderr += chunk.toString("utf8"); });
    const accepted = (value: Ready): void => {
      ready = value;
      tokens = JSON.parse(readFileSync(join(runDir, "tokens.json"), "utf8")) as Record<string, string>;
      observe({ ready, pid: child.pid, launcherNode: process.version, launcherExecutable: process.execPath, tokenMode: statSync(join(runDir, "tokens.json")).mode & 0o777,
        rootMode: statSync(root).mode & 0o777, runMode: statSync(runDir).mode & 0o777 });
    };
    if (expectedStartupExit === 1) {
      const outcome = await within(Promise.race([readyPromise.then(value => ({ kind: "ready" as const, value })), run.close.then(() => ({ kind: "closed" as const }))]), 5000,
        "Expected-refusal child neither became ready nor closed; retained without signals");
      if (outcome.kind === "ready") {
        accepted(outcome.value); observe({ unexpectedStartupAcceptance: true });
        await stop();
        throw new Error("Finance provider unexpectedly accepted invalid history; naturally shut down after readiness");
      }
      await waitForExit(1);
      if (run.stdout.trim()) throw new Error("Refused finance startup emitted readiness");
      expectedHistoryRefusal = true; observe({ verifiedExpectedHistoryStartupRefusal: true }); return;
    }
    accepted(await within(Promise.race([readyPromise, run.close.then(() => { throw new Error(`Finance child closed before readiness (${run.code})`); })]), 5000, "Finance readiness not observed; child retained without signals"));
  }
  async function send(channel: "api" | "admin", clientId: string | null, method: string, path: string,
    options: { body?: unknown; rawBody?: string; headers?: Record<string, string> } = {}): Promise<FinanceReply> {
    if (!ready || !path.startsWith("/")) throw new Error("Finance request requires owned ready service and relative path");
    const raw = options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
    const endpoint = channel === "admin" ? { socketPath: ready.adminSocket } : ready.apiSocket ? { socketPath: ready.apiSocket }
      : { hostname: "127.0.0.1", port: Number(new URL(ready.apiOrigin!).port), family: 4 };
    const reply = await new Promise<FinanceReply>(done => {
      let settled = false; let req: ReturnType<typeof httpRequest> | undefined; let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (result: FinanceReply): void => { if (settled) return; settled = true; clearTimeout(timer); done(result); };
      const transport = (reason: string): void => { finish({ status: null, headers: {}, body: null, transportError: reason }); req?.destroy(); };
      timer = setTimeout(() => transport("request_timeout"), 6000);
      req = httpRequest({ ...endpoint, method, path, agent: false, headers: {
        ...(channel === "api" && clientId !== null ? { Authorization: `Bearer ${tokens[clientId] ?? "invalid"}` } : {}),
        ...(raw === undefined ? {} : { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(raw) }), ...options.headers
      } }, res => {
        const chunks: Buffer[] = []; res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("aborted", () => transport("response_aborted")); res.on("error", () => transport("response_error"));
        res.on("end", () => { try { finish({ status: res.statusCode ?? null, headers: res.headers, body: JSON.parse(Buffer.concat(chunks).toString("utf8")), transportError: null }); } catch { transport("invalid_response_json"); } });
      });
      req.on("error", (error: NodeJS.ErrnoException) => transport(error.code ?? "request_error")); req.end(raw);
    });
    observe({ channel, clientId, method, path, ...(raw === undefined ? {} : { bodySha256: hash(raw), bodyBytes: Buffer.byteLength(raw) }), reply });
    return reply;
  }
  function snapshot(): FinanceSnapshot {
    const bytes = readFileSync(join(runDir, "txlog.jsonl"));
    if (bytes.length && bytes.at(-1) !== 10) throw new Error("Independent oracle: truncated provider log");
    const records: FinanceLogRecord[] = []; let head = "GENESIS";
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw new Error("Independent oracle: invalid UTF-8 provider log"); }
    for (const line of text.split("\n").slice(0, -1)) {
      const row = JSON.parse(line) as FinanceLogRecord, { hash: actual, ...body } = row;
      if (line !== canonical(row) || row.seq !== records.length + 1 || row.prevHash !== head || actual !== hash(canonical(body))
        || !["request", "commit", "replay", "reject", "fault", "response", "admin"].includes(row.kind)
        || typeof row.ts !== "string" || !Number.isFinite(Date.parse(row.ts))) throw new Error("Independent oracle: invalid provider log chain");
      head = actual; records.push(row);
    }
    const checkpoint = JSON.parse(readFileSync(join(runDir, "txlog-head.json"), "utf8")) as { seq: number; hash: string };
    if (checkpoint.seq !== records.length || checkpoint.hash !== head) throw new Error("Independent oracle: provider checkpoint mismatch");
    const result = { records, commits: records.filter(row => row.kind === "commit"), posts: records.filter(row => row.kind === "request" && row.channel === "api" && row.method === "POST"), checkpoint, logSha256: hash(bytes) };
    observe({ snapshot: result }); return result;
  }
  async function stop(): Promise<void> {
    const run = runs.at(-1); if (!run) return;
    if (!run.closed) {
      const response = await send("admin", null, "POST", "/admin/shutdown", { body: {} });
      if (response.status !== 200 || response.transportError !== null) throw new Error("Owned finance admin shutdown failed; child retained without signals");
    }
    if (!run.verified) await waitForExit(0);
  }
  const fixture: FinanceFixture = { root, runDir, seedPath, get apiSocket() { return ready?.apiSocket ?? undefined; }, get apiBaseUrl() { return ready?.apiOrigin; },
    token(clientId) { const token = tokens[clientId]; if (!token) throw new Error("Unknown synthetic finance client"); return token; },
    request: (clientId, method, path, opts) => send("api", clientId, method, path, opts), admin: (method, path, body) => send("admin", null, method, path, { body }),
    snapshot, observe, stop, waitForExit, restart: start,
    async finish(success) {
      if (finished) throw new Error("Finance fixture finish called twice"); finished = true;
      const errors: string[] = [];
      try { await stop(); } catch (error) { errors.push((error as Error).message); }
      if (!errors.length) { try { snapshot(); } catch (error) {
        const reason = (error as Error).message;
        if (expectedHistoryRefusal && reason.startsWith("Independent oracle:")) {
          observe({ verifiedHistoryRefusalCapture: { reason, logBase64: readFileSync(join(runDir, "txlog.jsonl")).toString("base64"),
            checkpointBase64: readFileSync(join(runDir, "txlog-head.json")).toString("base64"), retained: true } });
        } else errors.push(reason);
      } }
      publish(success && !errors.length, errors);
      if (success && !errors.length && !expectedHistoryRefusal) rmSync(root, { recursive: true });
      if (errors.length) throw new Error(`Finance cleanup/closure incomplete: ${errors.join("; ")}; retained ${root}`);
    }
  };
  try { await start(); return fixture; }
  catch (error) {
    const cleanupErrors: string[] = [];
    if (ready) { try { await stop(); } catch (cleanup) { cleanupErrors.push((cleanup as Error).message); } }
    observe({ startupError: (error as Error).message }); publish(false, [...cleanupErrors, "Initial startup was not qualified; owned root retained without signals"]);
    if (cleanupErrors.length) throw new AggregateError([error, ...cleanupErrors], "Finance startup and natural closure failed");
    throw error;
  }
}

export async function withFinance(body: (fixture: FinanceFixture) => Promise<void>, options: { port?: 0; seed?: unknown; faultsPath?: string } = {}): Promise<void> {
  const fixture = await createFinanceFixture(options); let failure: unknown;
  try { await body(fixture); } catch (error) { failure = error; fixture.observe({ bodyFailure: { message: (error as Error).message, stack: (error as Error).stack } }); }
  try { await fixture.finish(failure === undefined); } catch (error) {
    failure = failure === undefined ? error : new AggregateError([failure, error], "Finance body and cleanup both failed; both original errors retained");
  }
  if (failure !== undefined) throw failure;
}
