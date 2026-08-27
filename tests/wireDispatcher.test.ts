import { mkdtempSync, rmSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getPublicKeyHistory } from "../src/crypto/keys.js";
import { openLedger } from "../src/ledger/ledger.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import { leaseRevocationPaths, revokeLease, signLeaseRevocations } from "../src/leases/leaseStore.js";
import { initWorkspace } from "../src/workspace.js";
import { createWireDispatcher } from "../src/wire/wireDispatcher.js";
import { MAX_WIRE_LINE_BYTES } from "../src/wire/ndjsonFraming.js";

/**
 * What the wire will and will not do for a peer holding a lease.
 *
 * The whole surface is exercised through `handle(bytes)`, because that is what a
 * socket would call. Nothing here constructs a request object directly: a test
 * that skipped the framing and the envelope would be testing a different program
 * from the one a peer talks to.
 */

const PASS = "test-passphrase-wiredispatch";
const dirs: string[] = [];

function makeWorkspace() {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-wire-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  const ledger = openLedger(dir);
  ledger.startSession({
    sessionId: "intake", runtime: "amc", binaryPath: "test", binarySha256: "abc"
  });
  return { dir, ledger, monitorPublicKeys: getPublicKeyHistory(dir, "monitor") };
}

function lease(workspace: string, opts: { scopes?: string; routes?: string; agentId?: string } = {}) {
  return issueLeaseForCli({
    workspace,
    agentId: opts.agentId ?? "wire-peer",
    ttl: "60m",
    scopes: opts.scopes ?? "wire:submit",
    routes: opts.routes ?? "/wire",
    models: "*",
    rpm: 500,
    tpm: 1_000_000,
    maxCostUsdPerDay: null
  }).token;
}

function dispatcherFor(ws: ReturnType<typeof makeWorkspace>) {
  return createWireDispatcher({
    workspace: ws.dir,
    ledger: ws.ledger,
    intakeSessionId: "intake",
    monitorPublicKeys: ws.monitorPublicKeys
  });
}

/** Send one message and read the single reply back as a parsed object. */
function send(
  dispatcher: ReturnType<typeof createWireDispatcher>,
  message: Record<string, unknown>
): { reply: Record<string, unknown>; close: boolean } {
  const out = dispatcher.handle(Buffer.from(`${JSON.stringify(message)}\n`, "utf8"));
  expect(out.replies).toHaveLength(1);
  return { reply: JSON.parse(out.replies[0]!.toString("utf8")) as Record<string, unknown>, close: out.close };
}

const errorOf = (reply: Record<string, unknown>) => reply["error"] as { code: number; message: string };
const resultOf = (reply: Record<string, unknown>) => reply["result"] as Record<string, unknown>;

afterEach(() => {
  delete process.env["AMC_EVALUATED_AGENT"];
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("accepting work over the wire", () => {
  it("records an acceptance and answers with its receipt", () => {
    const ws = makeWorkspace();
    const { reply } = send(dispatcherFor(ws), {
      jsonrpc: "2.0", id: 1, method: "work/accept",
      lease: lease(ws.dir),
      params: { prompt: "summarise the changelog", providerId: "anthropic" }
    });

    expect(reply["id"]).toBe(1);
    const result = resultOf(reply);
    expect(typeof result["receipt"]).toBe("string");
    expect(typeof result["workSessionId"]).toBe("string");

    // The row was written under the LEASE's agent, not any name the peer chose.
    const row = ws.ledger.db.prepare(
      "SELECT meta_json FROM evidence_events WHERE event_type = 'work/accepted'"
    ).get() as { meta_json: string };
    expect(JSON.parse(row.meta_json).agentId).toBe("wire-peer");
  });

  it("refuses a peer that tries to name the agent itself", () => {
    const ws = makeWorkspace();
    // Silently overriding it would leave the caller believing it attributed the
    // work to someone it did not. There is no member of the envelope for an
    // identity either, so this is the only place it could have been smuggled.
    const { reply } = send(dispatcherFor(ws), {
      jsonrpc: "2.0", id: 1, method: "work/accept",
      lease: lease(ws.dir),
      params: { prompt: "p", providerId: "anthropic", agentId: "someone-else" }
    });
    expect(errorOf(reply).code).toBe(-32602);
    expect(errorOf(reply).message).toContain("taken from the lease");
    // And the refusal is complete: nothing was recorded under either name. A
    // partial write here would leave an acceptance attributed to whichever of
    // the two won, which is the outcome the refusal exists to prevent.
    const rows = ws.ledger.db.prepare(
      "SELECT COUNT(*) AS n FROM evidence_events WHERE event_type = 'work/accepted'"
    ).get() as { n: number };
    expect(rows.n).toBe(0);
  });

  it("describes accepted work as not-started", () => {
    const ws = makeWorkspace();
    const dispatcher = dispatcherFor(ws);
    const accepted = resultOf(send(dispatcher, {
      jsonrpc: "2.0", id: 1, method: "work/accept",
      lease: lease(ws.dir), params: { prompt: "p", providerId: "anthropic" }
    }).reply);

    const { reply } = send(dispatcher, {
      jsonrpc: "2.0", id: "two", method: "work/describe",
      lease: lease(ws.dir), params: { receipt: accepted["receipt"] }
    });
    expect(reply["id"]).toBe("two");
    expect(resultOf(reply)["state"]).toBe("not-started");
  });
});

describe("what a lease must say", () => {
  it("refuses a lease without the wire scope", () => {
    const ws = makeWorkspace();
    const { reply } = send(dispatcherFor(ws), {
      jsonrpc: "2.0", id: 1, method: "work/accept",
      lease: lease(ws.dir, { scopes: "gateway:llm,toolhub:execute" }),
      params: { prompt: "p", providerId: "anthropic" }
    });
    expect(errorOf(reply).code).toBe(-32001);
    expect(errorOf(reply).message).toContain("scope");
  });

  it("refuses a lease whose routes do not cover the method", () => {
    const ws = makeWorkspace();
    // Scoped to describing work only. Without the per-method routePath one wire
    // lease would reach every wire method.
    const { reply } = send(dispatcherFor(ws), {
      jsonrpc: "2.0", id: 1, method: "work/accept",
      lease: lease(ws.dir, { routes: "/wire/work/describe" }),
      params: { prompt: "p", providerId: "anthropic" }
    });
    expect(errorOf(reply).code).toBe(-32001);
    expect(errorOf(reply).message).toContain("route");
  });

  it("refuses a revoked lease", () => {
    const ws = makeWorkspace();
    const token = lease(ws.dir);
    const payload = JSON.parse(
      Buffer.from(token.split(".")[0]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    ) as { leaseId: string };
    revokeLease(ws.dir, payload.leaseId, "test");
    signLeaseRevocations(ws.dir);

    const { reply } = send(dispatcherFor(ws), {
      jsonrpc: "2.0", id: 1, method: "work/accept", lease: token,
      params: { prompt: "p", providerId: "anthropic" }
    });
    expect(errorOf(reply).code).toBe(-32001);
    expect(errorOf(reply).message).toContain("revoked");
  });

  it("refuses EVERY lease when the revocation list will not verify", () => {
    const ws = makeWorkspace();
    const token = lease(ws.dir);
    revokeLease(ws.dir, "some-other-lease", "test");
    signLeaseRevocations(ws.dir);

    // Tampering with this one file makes `revokedLeaseIdSet` return an empty
    // set, i.e. "nothing is revoked" -- which would un-revoke every lease ever
    // revoked. This surface fails closed instead.
    writeFileSync(
      leaseRevocationPaths(ws.dir).file,
      JSON.stringify({ v: 1, updatedTs: 0, revocations: [] })
    );

    const { reply } = send(dispatcherFor(ws), {
      jsonrpc: "2.0", id: 1, method: "work/accept", lease: token,
      params: { prompt: "p", providerId: "anthropic" }
    });
    expect(errorOf(reply).code).toBe(-32001);
    expect(errorOf(reply).message).toContain("revocation list does not verify");
  });

  it("refuses a message that presents no lease at all", () => {
    const ws = makeWorkspace();
    const { reply } = send(dispatcherFor(ws), {
      jsonrpc: "2.0", id: 1, method: "work/accept",
      params: { prompt: "p", providerId: "anthropic" }
    });
    expect(errorOf(reply).code).toBe(-32001);
  });

  it("checks the lease on every message, not once per connection", () => {
    const ws = makeWorkspace();
    const dispatcher = dispatcherFor(ws);
    expect(resultOf(send(dispatcher, {
      jsonrpc: "2.0", id: 1, method: "work/accept",
      lease: lease(ws.dir), params: { prompt: "p", providerId: "anthropic" }
    }).reply)["receipt"]).toBeTypeOf("string");

    // Same connection, second message, no lease. A connection is not a credential.
    const { reply } = send(dispatcher, {
      jsonrpc: "2.0", id: 2, method: "work/accept",
      params: { prompt: "p", providerId: "anthropic" }
    });
    expect(errorOf(reply).code).toBe(-32001);
  });
});

describe("the envelope", () => {
  const ws = () => makeWorkspace();

  it("refuses a notification, which could never learn its own outcome", () => {
    const w = ws();
    const { reply } = send(dispatcherFor(w), {
      jsonrpc: "2.0", method: "work/accept", lease: lease(w.dir), params: {}
    });
    expect(errorOf(reply).code).toBe(-32600);
    expect(reply["id"]).toBeNull();
  });

  it("refuses a null id, which a correlation map would lose", () => {
    const w = ws();
    const { reply } = send(dispatcherFor(w), {
      jsonrpc: "2.0", id: null, method: "work/accept", lease: lease(w.dir), params: {}
    });
    expect(errorOf(reply).code).toBe(-32600);
  });

  it("refuses a wrong or missing jsonrpc version", () => {
    const w = ws();
    for (const version of ["1.0", undefined, 2]) {
      const { reply } = send(dispatcherFor(w), {
        jsonrpc: version, id: 1, method: "work/accept", lease: lease(w.dir), params: {}
      });
      expect(errorOf(reply).code).toBe(-32600);
    }
  });

  it("refuses a member this wire does not define rather than ignoring it", () => {
    const w = ws();
    const { reply } = send(dispatcherFor(w), {
      jsonrpc: "2.0", id: 1, method: "work/accept", lease: lease(w.dir),
      params: {}, meta: { priority: "high" }
    });
    expect(errorOf(reply).code).toBe(-32600);
    // The member name is peer-chosen, so it is not quoted back into the reply.
    expect(errorOf(reply).message).not.toContain("meta");
  });

  it("refuses positional params", () => {
    const w = ws();
    const { reply } = send(dispatcherFor(w), {
      jsonrpc: "2.0", id: 1, method: "work/accept", lease: lease(w.dir), params: ["p"]
    });
    expect(errorOf(reply).code).toBe(-32602);
  });

  it("answers an unknown method rather than dropping it", () => {
    const w = ws();
    const { reply } = send(dispatcherFor(w), {
      jsonrpc: "2.0", id: 1, method: "agent/run", lease: lease(w.dir), params: {}
    });
    // dsh drops what it cannot route, leaving the caller waiting forever.
    expect(errorOf(reply).code).toBe(-32601);
    expect(reply["id"]).toBe(1);
  });

  it("echoes the id with its JSON type intact", () => {
    const w = ws();
    const dispatcher = dispatcherFor(w);
    expect(send(dispatcher, {
      jsonrpc: "2.0", id: "7", method: "agent/run", lease: lease(w.dir), params: {}
    }).reply["id"]).toBe("7");
    expect(send(dispatcher, {
      jsonrpc: "2.0", id: 7, method: "agent/run", lease: lease(w.dir), params: {}
    }).reply["id"]).toBe(7);
  });
});

describe("the stream", () => {
  it("carries content rules through to the wire: a duplicate key is a parse error", () => {
    const ws = makeWorkspace();
    const out = dispatcherFor(ws).handle(Buffer.from(
      `{"jsonrpc":"2.0","id":1,"method":"work/accept","method":"work/describe"}\n`, "utf8"
    ));
    const reply = JSON.parse(out.replies[0]!.toString("utf8")) as Record<string, unknown>;
    expect(errorOf(reply).code).toBe(-32700);
    expect(errorOf(reply).message).toContain("same key twice");
  });

  it("answers several messages in one chunk, in order", () => {
    const ws = makeWorkspace();
    const token = lease(ws.dir);
    const line = (id: number) =>
      `${JSON.stringify({ jsonrpc: "2.0", id, method: "agent/run", lease: token, params: {} })}\n`;
    const out = dispatcherFor(ws).handle(Buffer.from(line(1) + line(2) + line(3), "utf8"));
    expect(out.replies.map((r) => (JSON.parse(r.toString("utf8")) as { id: number }).id)).toEqual([1, 2, 3]);
  });

  it("tells the caller to close when framing desynchronises", () => {
    const ws = makeWorkspace();
    const out = dispatcherFor(ws).handle(
      Buffer.concat([Buffer.alloc(MAX_WIRE_LINE_BYTES + 1, 0x78), Buffer.from("\n")])
    );
    expect(out.close).toBe(true);
    const reply = JSON.parse(out.replies.at(-1)!.toString("utf8")) as Record<string, unknown>;
    expect(errorOf(reply).code).toBe(-32700);
    expect(reply["id"]).toBeNull();
  });
});

describe("refusing to start", () => {
  it("will not build a dispatcher whose every append would throw", () => {
    const ws = makeWorkspace();
    process.env["AMC_EVALUATED_AGENT"] = "1";
    // Otherwise it would accept a connection, authenticate a peer, and fail on
    // the first message that mattered.
    expect(() => dispatcherFor(ws)).toThrow(/AMC_EVALUATED_AGENT/);
  });
});
