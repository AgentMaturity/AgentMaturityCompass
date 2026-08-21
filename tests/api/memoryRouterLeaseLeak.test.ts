import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleMemoryRoute } from "../../src/api/memoryRouter.js";
import { sqlitePoolStats } from "../../src/storage/sqlitePool.js";
import { initWorkspace } from "../../src/workspace.js";


/**
 * All four openLedger sites in memoryRouter closed the ledger as the last
 * statement of a `try` whose only handler emitted a 500 — no `finally`. Any
 * throw between acquire and close skipped the close permanently: Ledger.close()
 * is the sole caller of the pool lease's release(), and the pool holds the
 * connection in its `active` set, so nothing ever reclaimed it.
 *
 * `GET /api/v1/memory/report?window=bogus` reaches it deterministically —
 * parseWindowToMs throws on a malformed window, between acquire and close.
 * In the long-running Studio server each such request leaked one SQLite
 * connection; past the pool's max size, connection reuse died permanently and
 * file descriptors grew without bound.
 */
function fakeRes(): ServerResponse & { statusCode: number } {
  const res = new EventEmitter() as unknown as ServerResponse & { statusCode: number };
  res.statusCode = 0;
  res.writeHead = ((code: number) => {
    res.statusCode = code;
    return res;
  }) as ServerResponse["writeHead"];
  res.setHeader = (() => res) as ServerResponse["setHeader"];
  res.end = (() => res) as ServerResponse["end"];
  return res;
}

function fakeReq(url: string): IncomingMessage {
  const req = new EventEmitter() as unknown as IncomingMessage;
  req.url = url;
  req.method = "GET";
  req.headers = {};
  return req;
}

describe("memory router ledger leases", () => {
  let workspace: string;
  let poolKey: string;

  beforeAll(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-memrouter-"));
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    // Mirrors ledgerPoolKey() in src/ledger/ledger.ts, which is module-private.
    poolKey = `ledger:${resolve(workspace)}:${join(workspace, ".amc", "evidence.sqlite")}`;
  });

  afterAll(() => rmSync(workspace, { recursive: true, force: true }));

  it("returns the lease when the handler throws mid-request", async () => {
    // Warm the pool so stats exist, via a request that succeeds.
    await handleMemoryRoute(
      "/api/v1/memory/report",
      "GET",
      fakeReq("/api/v1/memory/report?window=30d"),
      fakeRes(),
      workspace
    );
    const warm = sqlitePoolStats(poolKey);
    expect(warm, "pool should exist after a successful request").not.toBeNull();
    expect(warm!.active).toBe(0);

    // Six requests that throw between acquire and close.
    for (let i = 0; i < 6; i += 1) {
      await handleMemoryRoute(
        "/api/v1/memory/report",
        "GET",
        fakeReq("/api/v1/memory/report?window=bogus"),
        fakeRes(),
        workspace
      );
    }

    const after = sqlitePoolStats(poolKey);
    expect(after, "pool should still exist").not.toBeNull();
    // Before the fix this climbed 1..6 and never came back down.
    expect(after!.active, "every lease must be returned").toBe(0);
    expect(after!.idle, "the connection must return to the idle pool").toBeGreaterThan(0);
  });
});
