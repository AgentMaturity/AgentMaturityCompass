import { readSync } from "node:fs";
import Database from "better-sqlite3";
import { reserveNativeToolBudget } from "../../src/budgets/nativeBudgetAdmission.js";
import type { ToolExecution } from "../../src/tools/toolTypes.js";

// The parent's extra stdio pipe. Not fd 0: an import that touches process.stdin makes it non-blocking.
const GATE_FD = 4;
const [workspace, sessionId, callId] = process.argv.slice(2) as [string, string, string];
if (!process.send) throw new Error("native budget reserve worker requires an IPC channel");
const send = process.send.bind(process);

// Barrier: pause once, synchronously, at this process's first write-lock acquisition
// other than the ledger's open-time schema_migrations bookkeeping. For an atomic
// admission that is its BEGIN IMMEDIATE (before any usage read); if read and reserve
// were ever split it is the first reservation write (after the read). The parent
// releases both paused workers together with one byte each on GATE_FD, a blocking
// pipe, so readSync waits without polling or sleeping.
const scratch = new Database(":memory:");
const statement = Object.getPrototypeOf(scratch.prepare("SELECT 1")) as { run(this: Database.Statement, ...args: unknown[]): unknown };
scratch.close();
const run = statement.run;
let paused = false;
statement.run = function (this: Database.Statement, ...args: unknown[]) {
  if (!paused && (/^BEGIN (IMMEDIATE|EXCLUSIVE)/i.test(this.source) || (!this.readonly && !this.source.includes("schema_migrations")))) {
    paused = true;
    send({ kind: "paused", callId });
    readSync(GATE_FD, Buffer.alloc(1));
  }
  return run.apply(this, args);
};

// Distinct token and callId per worker so "already reserved" cannot mask a lost race.
const refusal = reserveNativeToolBudget({ workspace, agentId: "default", effectiveMode: "EXECUTE", actionClass: "READ_ONLY",
  token: `token-${callId}`, callId } as ToolExecution, sessionId);
send({ kind: "result", callId, refusal: refusal ?? null }, () => process.disconnect?.());
