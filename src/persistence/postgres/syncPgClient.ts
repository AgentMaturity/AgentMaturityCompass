/**
 * A synchronous Postgres client (ADR 018 decision 5, option 1).
 *
 * The session-store contract is synchronous on purpose ("model-visible ⊆
 * logged"), and every Postgres driver is asynchronous. So the driver runs in a
 * worker thread and the caller blocks on `Atomics.wait` until the worker has
 * posted the reply. Nothing is written behind the caller's back: a call either
 * returns the server's answer or throws.
 *
 * Failure is typed and closed:
 *  - no `pg` driver installed → {@link PostgresDriverMissingError}, before any
 *    worker starts (AMC does not ship `pg`; it is an optional peer, loaded the
 *    way the PKCS#11 provider loads `pkcs11js`);
 *  - connection string not from a private file, or not `sslmode=verify-full`
 *    → {@link PostgresConfigError}, before any connection is attempted;
 *  - a connection that did not authenticate with SCRAM over TLS, a lost
 *    connection, a demoted primary (SQLSTATE 25006), or no reply within the
 *    timeout → {@link PostgresUnavailableError}. On a timeout the worker is
 *    terminated, which drops the connection and aborts any open transaction;
 *    the next call starts a fresh worker, which is how appends resume after a
 *    failover promotes a new primary.
 */
import { statSync } from "node:fs";
import { createRequire } from "node:module";
import { MessageChannel, receiveMessageOnPort, Worker, type MessagePort } from "node:worker_threads";
import { readUtf8 } from "../../utils/fs.js";

/** Environment variable naming the file that holds the connection string. Never the string itself. */
export const POSTGRES_URL_FILE_ENV = "AMC_POSTGRES_URL_FILE";

const DEFAULT_TIMEOUT_MS = 10_000;

class PostgresDriverMissingError extends Error {
  readonly code = "POSTGRES_DRIVER_MISSING";
  constructor(driverModule: string) {
    super(`the Postgres session store needs the optional "${driverModule}" driver, which is not installed. ` +
      `Install it next to AMC (npm install pg) or use the sqlite or jsonl session store.`);
    this.name = "PostgresDriverMissingError";
  }
}

class PostgresConfigError extends Error {
  readonly code = "POSTGRES_CONFIG";
  constructor(message: string) {
    super(message);
    this.name = "PostgresConfigError";
  }
}

/** The store could not reach a writable primary. Nothing was written by the failed call. */
class PostgresUnavailableError extends Error {
  readonly code = "POSTGRES_UNAVAILABLE";
  constructor(reason: string) {
    super(`Postgres session store unavailable: ${reason}. No row was written; retry after the primary is back or promoted.`);
    this.name = "PostgresUnavailableError";
  }
}

/** A statement the server rejected (constraint, syntax). Carries the SQLSTATE. */
export class PostgresStatementError extends Error {
  constructor(message: string, readonly sqlState: string | null) {
    super(message);
    this.name = "PostgresStatementError";
  }
}

export interface SyncPgOptions {
  /** Module specifier of a `pg`-compatible driver. Tests pass a fake; nothing reads it from env or argv. */
  readonly driverModule?: string;
  /** Per-call reply timeout. */
  readonly timeoutMs?: number;
}

export interface SyncPgResult {
  readonly rows: readonly Record<string, unknown>[];
  readonly rowCount: number;
}

type WorkerReply =
  | { ok: true; rows: Record<string, unknown>[]; rowCount: number | null }
  | { ok: false; unavailable: boolean; message: string; sqlState: string | null };

/**
 * Read the connection string from the file named by `AMC_POSTGRES_URL_FILE`.
 * The file must not be readable by group or others (it holds a password), and
 * the URL must ask for full certificate verification.
 */
export function readPostgresUrl(): string {
  const file = process.env[POSTGRES_URL_FILE_ENV]?.trim();
  if (!file) throw new PostgresConfigError(`set ${POSTGRES_URL_FILE_ENV} to a file holding the connection string`);
  let mode: number;
  try {
    mode = statSync(file).mode;
  } catch {
    throw new PostgresConfigError(`${POSTGRES_URL_FILE_ENV} names a file that cannot be read`);
  }
  if (process.platform !== "win32" && (mode & 0o077) !== 0) {
    throw new PostgresConfigError(`${POSTGRES_URL_FILE_ENV} file must not be readable by group or others (chmod 600)`);
  }
  const url = readUtf8(file).trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new PostgresConfigError("the Postgres connection string is not a URL");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new PostgresConfigError("the Postgres connection string must start with postgres:// or postgresql://");
  }
  if (parsed.searchParams.get("sslmode") !== "verify-full") {
    throw new PostgresConfigError("the Postgres connection string must set sslmode=verify-full (TLS with full certificate verification)");
  }
  return url;
}

let defaultDriverModule = "pg";

/**
 * Replace the driver every store opened without `pg.driverModule` uses (the
 * verifier, read paths). Code-only, like the option: nothing reads it from env
 * or argv. The contract tests point it at their fake driver.
 */
export function setDefaultPostgresDriver(driverModule: string): void {
  defaultDriverModule = driverModule;
}

function resolveDriver(driverModule: string): string {
  try {
    return createRequire(import.meta.url).resolve(driverModule);
  } catch {
    throw new PostgresDriverMissingError(driverModule);
  }
}

/**
 * The worker. Plain JS evaluated as a CommonJS worker (as Code Mode does), so it
 * runs the same from `src/` under vitest and from `dist/`.
 *
 * Authentication is checked on the driver's own connection events, which fire
 * before the driver answers them: a server asking for MD5 or a cleartext
 * password has the socket destroyed before the password is sent. A connection
 * with no SCRAM exchange, or not over TLS, is refused.
 */
const WORKER_SOURCE = String.raw`
const { workerData } = require("node:worker_threads");
const { port, shared, driverPath, connectionString } = workerData;
let Client = null;
let loadError = null;
try { ({ Client } = require(driverPath)); } catch (error) { loadError = error; }
let client = null;
function isUnavailable(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  return !/^[0-9A-Z]{5}$/.test(code) || /^(08|53|57P|58)/.test(code) || code === "25006" || error?.amcPolicy === true;
}
async function connect() {
  const c = new Client({ connectionString });
  let auth = "none";
  const refuse = (kind) => () => { auth = kind; c.connection.stream?.destroy?.(); };
  c.connection.on("authenticationSASL", () => { auth = "scram"; });
  c.connection.on("authenticationMD5Password", refuse("md5"));
  c.connection.on("authenticationCleartextPassword", refuse("cleartext"));
  c.on("error", () => { if (client === c) client = null; });
  try {
    await c.connect();
  } catch (error) {
    if (auth === "md5" || auth === "cleartext") throw Object.assign(new Error("server asked for " + auth + " authentication; SCRAM is required"), { amcPolicy: true });
    throw error;
  }
  if (auth !== "scram" || c.connection.stream?.encrypted !== true) {
    await c.end().catch(() => {});
    throw Object.assign(new Error("connection did not authenticate with SCRAM over TLS"), { amcPolicy: true });
  }
  return c;
}
port.on("message", async (request) => {
  let reply;
  try {
    if (request.op === "close") {
      const c = client; client = null;
      if (c) await c.end().catch(() => {});
      reply = { ok: true, rows: [], rowCount: 0 };
    } else {
      if (loadError !== null) throw Object.assign(new Error("the Postgres driver failed to load: " + String(loadError?.message ?? loadError)), { amcPolicy: true });
      if (client === null) client = await connect();
      const result = await client.query(request.sql, request.params);
      reply = { ok: true, rows: result.rows ?? [], rowCount: result.rowCount ?? null };
    }
  } catch (error) {
    const unavailable = isUnavailable(error);
    if (unavailable && client) { const c = client; client = null; c.end().catch(() => {}); }
    reply = { ok: false, unavailable, message: String(error?.message ?? error), sqlState: typeof error?.code === "string" ? error.code : null };
  }
  port.postMessage(reply);
  Atomics.store(shared, 0, 1);
  Atomics.notify(shared, 0);
});
`;

export class SyncPgClient {
  private readonly driverPath: string;
  private readonly timeoutMs: number;
  private worker: Worker | null = null;
  private port: MessagePort | null = null;
  private readonly shared = new Int32Array(new SharedArrayBuffer(4));
  private closed = false;

  constructor(private readonly connectionString: string, options: SyncPgOptions = {}) {
    this.driverPath = resolveDriver(options.driverModule ?? defaultDriverModule);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  query(sql: string, params: readonly unknown[] = []): SyncPgResult {
    if (this.closed) throw new Error("SyncPgClient used after close()");
    const reply = this.call({ op: "query", sql, params });
    if (reply.ok) return { rows: reply.rows, rowCount: reply.rowCount ?? reply.rows.length };
    if (reply.unavailable) throw new PostgresUnavailableError(reply.message);
    throw new PostgresStatementError(reply.message, reply.sqlState);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.worker !== null) {
      try {
        this.call({ op: "close" });
      } catch {
        // Closing a connection that is already gone is not an error worth surfacing.
      }
      this.stopWorker();
    }
  }

  private call(request: Record<string, unknown>): WorkerReply {
    const port = this.ensureWorker();
    Atomics.store(this.shared, 0, 0);
    port.postMessage(request);
    const waited = Atomics.wait(this.shared, 0, 0, this.timeoutMs);
    const message = receiveMessageOnPort(port);
    if (waited === "timed-out" || message === undefined) {
      // The worker's state is unknown: drop it, which drops the connection and
      // aborts any transaction the server still holds open for it.
      this.stopWorker();
      throw new PostgresUnavailableError(`no reply within ${this.timeoutMs} ms`);
    }
    return message.message as WorkerReply;
  }

  private ensureWorker(): MessagePort {
    if (this.worker !== null && this.port !== null) return this.port;
    const { port1, port2 } = new MessageChannel();
    this.worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: { port: port2, shared: this.shared, driverPath: this.driverPath, connectionString: this.connectionString },
      transferList: [port2]
    });
    this.worker.unref();
    this.port = port1;
    return port1;
  }

  private stopWorker(): void {
    const worker = this.worker;
    this.worker = null;
    this.port?.close();
    this.port = null;
    if (worker !== null) void worker.terminate();
  }
}
