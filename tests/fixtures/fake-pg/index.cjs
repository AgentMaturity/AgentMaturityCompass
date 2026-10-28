/**
 * A `pg`-shaped driver backed by a SQLite file, for the Postgres session-store
 * contract tests. It is NOT Postgres: it runs the store's SQL (which keeps to
 * the subset both share) with `$n` placeholders rebound, `FOR UPDATE` dropped
 * and `BEGIN` taken as `BEGIN IMMEDIATE`, so writers still serialise.
 *
 * Connection-string query parameters drive the cases a real server would:
 *   fakeSqlite=<path>   the database file
 *   fakeAuth=scram|md5|cleartext|trust   which authentication the "server" asks for
 *   fakeTls=off         the socket is not TLS
 * Marker files next to the database simulate failures:
 *   <path>.down               every connect and query fails like a lost primary
 *   <path>.drop-after-commit  the next COMMIT lands, then the reply is lost
 *   <path>.hang               queries never answer
 */
const Database = require("better-sqlite3");
const { EventEmitter } = require("node:events");
const { existsSync, unlinkSync } = require("node:fs");

function lost(message) {
  return Object.assign(new Error(message), { code: "ECONNRESET" });
}

class Client extends EventEmitter {
  constructor({ connectionString }) {
    super();
    const url = new URL(connectionString);
    this.file = url.searchParams.get("fakeSqlite");
    this.auth = url.searchParams.get("fakeAuth") ?? "scram";
    this.connection = new EventEmitter();
    this.connection.stream = { encrypted: url.searchParams.get("fakeTls") !== "off", destroy() {} };
    this.db = null;
  }

  checkUp() {
    if (existsSync(`${this.file}.down`)) throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
  }

  async connect() {
    this.checkUp();
    const event = { scram: "authenticationSASL", md5: "authenticationMD5Password", cleartext: "authenticationCleartextPassword" }[this.auth];
    if (event) this.connection.emit(event);
    if (this.auth === "md5" || this.auth === "cleartext") throw lost("Connection terminated unexpectedly");
    this.db = new Database(this.file);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
  }

  async query(text, params = []) {
    if (existsSync(`${this.file}.hang`)) await new Promise(() => {});
    this.checkUp();
    const bound = [];
    let sql = text.replace(/\s+FOR UPDATE\b/gi, "").replace(/\$(\d+)/g, (_, n) => {
      bound.push(params[Number(n) - 1]);
      return "?";
    });
    if (/^\s*BEGIN\b/i.test(sql)) sql = "BEGIN IMMEDIATE";
    try {
      const statement = this.db.prepare(sql);
      if (statement.reader) {
        const rows = statement.all(...bound);
        return { rows, rowCount: rows.length };
      }
      const info = statement.run(...bound);
      if (/^\s*COMMIT\s*$/i.test(sql) && existsSync(`${this.file}.drop-after-commit`)) {
        unlinkSync(`${this.file}.drop-after-commit`);
        throw lost("Connection terminated unexpectedly");
      }
      return { rows: [], rowCount: info.changes };
    } catch (error) {
      if (error.code === "ECONNRESET") throw error;
      const code = String(error.code ?? "");
      error.code = code.startsWith("SQLITE_CONSTRAINT") ? "23505" : code === "SQLITE_BUSY" ? "55P03" : "42000";
      throw error;
    }
  }

  async end() {
    this.db?.close();
    this.db = null;
  }
}

module.exports = { Client };
