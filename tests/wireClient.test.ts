import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getPublicKeyHistory } from "../src/crypto/keys.js";
import { openLedger, type Ledger } from "../src/ledger/ledger.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import { initWorkspace } from "../src/workspace.js";
import { MAX_WIRE_LINE_BYTES } from "../src/wire/ndjsonFraming.js";
import {
  connectWireClient,
  WireRequestError,
  WireTransportError,
  type WireClient
} from "../src/wire/wireClient.js";
import { startWireListener, type WireListener } from "../src/wire/wireListener.js";

/**
 * The client, against a real server and against hostile ones.
 *
 * A well-behaved server cannot exercise the interesting half, so most of this
 * file drives a fake that sends replies AMC would never send. The thing on the
 * other end of a socket is not automatically AMC, and that is the assumption the
 * client must not make.
 *
 * Several tests here exist because an earlier version of this file was GREEN
 * while the behaviour it named was absent -- a drop test that passed on its own
 * deadline rather than on detecting the drop, fields no assertion mentioned, and
 * a request whose contents nothing checked. Each of those is now pinned to
 * something that fails when the behaviour is removed.
 */

const PASS = "test-passphrase-wireclient";
const dirs: string[] = [];
const clients: WireClient[] = [];
const listeners: WireListener[] = [];
const fakes: Server[] = [];
/** Every socket a fake accepted, so teardown can end connections it holds open. */
const accepted: Socket[] = [];

function makeWorkspace() {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-wc-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  const ledger = openLedger(dir);
  ledger.startSession({ sessionId: "intake", runtime: "amc", binaryPath: "t", binarySha256: "a" });
  return { dir, ledger, monitorPublicKeys: getPublicKeyHistory(dir, "monitor") };
}

/** A short, private directory: unix socket paths cap near 104 bytes. */
function socketPath(): string {
  const dir = realpathSync(mkdtempSync(join("/tmp", "amccl-")));
  dirs.push(dir);
  chmodSync(dir, 0o700);
  return join(dir, "w.sock");
}

function leaseFor(workspace: string, scopes = "wire:submit"): string {
  return issueLeaseForCli({
    workspace, agentId: "wire-peer", ttl: "60m", scopes,
    routes: "/wire", models: "*", rpm: 500, tpm: 1_000_000, maxCostUsdPerDay: null
  }).token;
}

async function realServer(ws: ReturnType<typeof makeWorkspace>): Promise<string> {
  const path = socketPath();
  const listener = await startWireListener({
    workspace: ws.dir, ledger: ws.ledger, intakeSessionId: "intake",
    monitorPublicKeys: ws.monitorPublicKeys, socketPath: path
  });
  listeners.push(listener);
  return path;
}

/**
 * A server that answers however the test tells it to, line by line.
 *
 * `halfOpen` is opt-in per test. Node otherwise closes the server side of a
 * connection as soon as it receives FIN, so a fake cannot hold its half open and
 * a test naming that condition never reaches it -- but leaving it on everywhere
 * hangs teardown, since `server.close()` waits for connections that now never
 * end on their own.
 */
async function fakeServer(
  reply: (line: string, socket: Socket) => void,
  onConnection?: (socket: Socket) => void,
  halfOpen = false
): Promise<string> {
  const path = socketPath();
  const server = createServer({ allowHalfOpen: halfOpen }, (socket) => {
    accepted.push(socket);
    onConnection?.(socket);
    let seen = "";
    socket.on("data", (chunk: Buffer) => {
      seen += chunk.toString("utf8");
      for (;;) {
        const at = seen.indexOf("\n");
        if (at === -1) break;
        const line = seen.slice(0, at);
        seen = seen.slice(at + 1);
        reply(line, socket);
      }
    });
    socket.on("error", () => socket.destroy());
  });
  fakes.push(server);
  await new Promise<void>((resolve) => server.listen(path, () => resolve()));
  return path;
}

/** A fake that answers one request with a literal line of the test's choosing. */
async function replyingWith(line: (id: number) => string): Promise<string> {
  return fakeServer((raw, socket) => {
    const id = (JSON.parse(raw) as { id: number }).id;
    socket.write(`${line(id)}\n`);
  });
}

async function clientFor(path: string, lease: string, timeoutMs?: number): Promise<WireClient> {
  const client = await connectWireClient({
    socketPath: path, lease, ...(timeoutMs === undefined ? {} : { requestTimeoutMs: timeoutMs })
  });
  clients.push(client);
  return client;
}

const work = { prompt: "p", providerId: "anthropic" } as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The payload of the single acceptance row, as the ledger stored it. */
function acceptedPayload(ledger: Ledger): { request: { prompt: string; providerId: string } } {
  const row = ledger.db.prepare(
    "SELECT payload_inline FROM evidence_events WHERE event_type = 'work/accepted'"
  ).get() as { payload_inline: string };
  return JSON.parse(row.payload_inline) as { request: { prompt: string; providerId: string } };
}

afterEach(async () => {
  for (const client of clients.splice(0)) await client.close().catch(() => undefined);
  for (const socket of accepted.splice(0)) socket.destroy();
  for (const listener of listeners.splice(0)) await listener.close();
  for (const server of fakes.splice(0)) await new Promise<void>((r) => server.close(() => r()));
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("against a real server", () => {
  it("accepts the work the caller actually asked for", async () => {
    const ws = makeWorkspace();
    const client = await clientFor(await realServer(ws), leaseFor(ws.dir));

    const accepted = await client.acceptWork({ prompt: "summarise the changelog", providerId: "anthropic" });
    // Every field of the handle is pinned. Three of these were once returned
    // from `String(undefined)` with no assertion anywhere able to tell.
    expect(accepted.workSessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(accepted.receipt.length).toBeGreaterThan(32);
    expect(accepted.receiptId).toMatch(/^[0-9a-f-]{36}$/);
    expect(accepted.requestSha256).toMatch(/^[0-9a-f]{64}$/);

    // And the request reached the ledger unchanged. Without this the client
    // could ignore its arguments entirely and every test would still pass.
    const payload = acceptedPayload(ws.ledger);
    expect(payload.request.prompt).toBe("summarise the changelog");
    expect(payload.request.providerId).toBe("anthropic");
  });

  it("describes accepted work back", async () => {
    const ws = makeWorkspace();
    const client = await clientFor(await realServer(ws), leaseFor(ws.dir));
    const accepted = await client.acceptWork(work);
    const described = await client.describeWork(accepted.receipt);
    expect(described.workSessionId).toBe(accepted.workSessionId);
    expect(described.state).toBe("not-started");
  });

  it("raises a refusal as an error carrying its code", async () => {
    const ws = makeWorkspace();
    const client = await clientFor(await realServer(ws), leaseFor(ws.dir, "gateway:llm"));
    await expect(client.acceptWork(work)).rejects.toMatchObject({ name: "WireRequestError", code: -32001 });
  });

  it("keeps every answer straight under concurrency", async () => {
    const ws = makeWorkspace();
    const client = await clientFor(await realServer(ws), leaseFor(ws.dir));
    const accepted = await Promise.all(
      Array.from({ length: 25 }, () => client.acceptWork(work))
    );
    expect(new Set(accepted.map((a) => a.workSessionId)).size).toBe(25);
    expect(new Set(accepted.map((a) => a.receipt)).size).toBe(25);
  });

  it("separates a refusal from a transport fault by type", async () => {
    const ws = makeWorkspace();
    const client = await clientFor(await realServer(ws), leaseFor(ws.dir, "gateway:llm"));
    // A caller retries a transport fault and must NOT retry a refusal.
    const error = await client.acceptWork(work).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WireRequestError);
    expect(error).not.toBeInstanceOf(WireTransportError);
  });
});

describe("a slow server is not a hostile one", () => {
  it("survives a reply that arrives after its own deadline", async () => {
    // The regression this file exists for. A timeout used to forget the id, so
    // the server's honest late reply looked like a forgery: the client failed
    // the whole connection and refused to speak again. A server that never
    // replies was always handled; a merely SLOW one killed the client.
    const path = await fakeServer((raw, socket) => {
      const id = (JSON.parse(raw) as { id: number }).id;
      const delay = id === 1 ? 300 : 0;
      setTimeout(() => {
        if (socket.destroyed) return;
        socket.write(`${JSON.stringify({
          jsonrpc: "2.0", id,
          result: { workSessionId: `s${id}`, receipt: `r${id}`, receiptId: `i${id}`, requestSha256: "d" }
        })}\n`);
      }, delay);
    });
    const client = await clientFor(path, "lease", 100);

    await expect(client.acceptWork(work)).rejects.toThrow(/no reply to work\/accept within 100ms/);
    await sleep(400);

    // The connection is still usable, and the late reply was discarded quietly.
    const second = await client.acceptWork(work);
    expect(second.receipt).toBe("r2");
  });

  it("still refuses a reply to an id that was never issued", async () => {
    // The forgiveness above is scoped to abandoned ids only.
    const client = await clientFor(await replyingWith((id) =>
      JSON.stringify({ jsonrpc: "2.0", id: id + 99, result: {} })), "lease");
    await expect(client.acceptWork(work)).rejects.toThrow(/unknown id/);
  });
});

describe("against a server that misbehaves", () => {
  it("matches replies by id rather than arrival order", async () => {
    const held: string[] = [];
    const path = await fakeServer((line, socket) => {
      held.push(line);
      if (held.length < 2) return;
      // Answered deliberately backwards. Pairing by order would hand each
      // caller the other's answer -- misattribution rather than failure.
      for (const raw of [...held].reverse()) {
        const id = (JSON.parse(raw) as { id: number }).id;
        socket.write(`${JSON.stringify({
          jsonrpc: "2.0", id,
          result: { workSessionId: `s${id}`, receipt: `r${id}`, receiptId: `i${id}`, requestSha256: "d" }
        })}\n`);
      }
    });
    const client = await clientFor(path, "lease");
    const [first, second] = await Promise.all([client.acceptWork(work), client.acceptWork(work)]);
    expect(first.receipt).toBe("r1");
    expect(second.receipt).toBe("r2");
  });

  it("refuses a reply with a duplicate key, exactly as the server would", async () => {
    const client = await clientFor(await replyingWith((id) =>
      `{"jsonrpc":"2.0","id":${id},"result":{"receipt":"good","receipt":"evil"}}`), "lease");
    await expect(client.acceptWork(work)).rejects.toThrow(/unusable reply.*same key twice/);
  });

  it("does not crash on `error: null`", async () => {
    // This threw a TypeError out of the socket's data handler -- killing the
    // process AND leaving the caller waiting forever.
    const client = await clientFor(await replyingWith((id) =>
      `{"jsonrpc":"2.0","id":${id},"error":null}`), "lease", 5_000);
    await expect(client.acceptWork(work)).rejects.toThrow(/error is not \{code:number, message:string\}/);
  });

  it("carries out the server's own stream diagnostic instead of discarding it", async () => {
    // AMC's dispatcher answers framing faults with a null id, because a record
    // it could not delimit has no id to quote. The client used to read that as
    // an unknown id -- so AMC's server bricked AMC's client and threw away the
    // message explaining why.
    const client = await clientFor(await replyingWith(() => JSON.stringify({
      jsonrpc: "2.0", id: null, error: { code: -32700, message: "record 1 is over the limit" }
    })), "lease");
    await expect(client.acceptWork(work)).rejects.toThrow(/rejected the stream.*over the limit/);
  });

  it("refuses replies that break the envelope", async () => {
    const cases: ReadonlyArray<readonly [string, (id: number) => string, RegExp]> = [
      ["wrong version", (id) => JSON.stringify({ jsonrpc: "1.0", id, result: {} }), /jsonrpc is not/],
      ["unknown member", (id) => JSON.stringify({ jsonrpc: "2.0", id, result: {}, extra: 1 }), /does not define/],
      ["result and error", (id) =>
        JSON.stringify({ jsonrpc: "2.0", id, result: {}, error: { code: 1, message: "m" } }),
        /exactly one of result or error/],
      ["neither", (id) => JSON.stringify({ jsonrpc: "2.0", id }), /exactly one of result or error/],
      ["float id", (id) => JSON.stringify({ jsonrpc: "2.0", id: id + 0.5, result: {} }), /neither a safe integer/]
    ];
    for (const [, line, expected] of cases) {
      const client = await clientFor(await replyingWith(line), "lease");
      await expect(client.acceptWork(work)).rejects.toThrow(expected);
    }
  });

  it("refuses a fabricated handle instead of coercing one", async () => {
    // `String()` never fails: an object became the receipt "[object Object]", a
    // missing field became "undefined", and -- worst -- String(["s"]) is "s", so
    // a one-element array impersonated the string it contained.
    const junk = [
      { workSessionId: {}, receipt: "r", receiptId: "i", requestSha256: "d" },
      { workSessionId: ["s"], receipt: "r", receiptId: "i", requestSha256: "d" },
      { workSessionId: "s", receipt: 12345, receiptId: "i", requestSha256: "d" },
      { workSessionId: "s", receipt: "r", receiptId: null, requestSha256: "d" },
      { workSessionId: "s", receipt: "r", receiptId: "i" }
    ];
    for (const result of junk) {
      const client = await clientFor(await replyingWith((id) =>
        JSON.stringify({ jsonrpc: "2.0", id, result })), "lease");
      await expect(client.acceptWork(work)).rejects.toThrow(/is not a non-empty string/);
    }
  });

  it("refuses a state outside the union it promises", async () => {
    // The declared type was an `as` cast: a compile-time claim about a value the
    // far end chooses, so "succeeded" arrived typed as one of four states it is
    // not one of.
    const client = await clientFor(await replyingWith((id) =>
      JSON.stringify({ jsonrpc: "2.0", id, result: { workSessionId: "s", state: "succeeded" } })), "lease");
    await expect(client.describeWork("r")).rejects.toThrow(/is not one of not-started, running/);
  });

  it("latches on a reply larger than the record limit", async () => {
    const client = await clientFor(await replyingWith(() => "x".repeat(MAX_WIRE_LINE_BYTES + 1)), "lease");
    await expect(client.acceptWork(work)).rejects.toThrow(/unframeable reply|over the/);
  });

  it("gives up rather than waiting forever on a silent server", async () => {
    const client = await clientFor(await fakeServer(() => undefined), "lease", 150);
    await expect(client.acceptWork(work)).rejects.toThrow(/no reply to work\/accept within 150ms/);
  });

  it("rejects on the DROP, not on the deadline", async () => {
    // The previous version of this test set a 10s timeout against a server that
    // dropped instantly, so it passed with both drop handlers deleted -- it was
    // measuring the deadline. A generous timeout plus an elapsed-time assertion
    // is what makes it about the drop.
    const client = await clientFor(await fakeServer((_line, socket) => socket.destroy()), "lease", 60_000);
    const startedAt = Date.now();
    await expect(client.acceptWork(work)).rejects.toThrow(WireTransportError);
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });
});

describe("lifecycle", () => {
  it("refuses to be used after close, and says so in its own words", async () => {
    const ws = makeWorkspace();
    const client = await clientFor(await realServer(ws), leaseFor(ws.dir));
    await client.close();
    // Not "connection closed before the reply arrived": the caller closed it,
    // and being told the connection dropped sends them looking for a fault.
    await expect(client.acceptWork(work)).rejects.toThrow(/client closed/);
  });

  it("closes against a peer that never closes its half", async () => {
    // `end()` only half-closes. Without the forced destroy this never returned.
    const path = await fakeServer(() => undefined, undefined, true);
    const client = await clientFor(path, "lease");
    const startedAt = Date.now();
    await client.close();
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });

  it("closes repeatedly without accumulating listeners", async () => {
    const ws = makeWorkspace();
    const client = await clientFor(await realServer(ws), leaseFor(ws.dir));
    // Every close() used to add another 'close' listener until Node's own leak
    // detector complained.
    await Promise.all(Array.from({ length: 25 }, () => client.close()));
    await expect(client.acceptWork(work)).rejects.toThrow(/client closed/);
  });

  it("refuses to send when the peer has stopped reading", async () => {
    // Node buffers without bound, and holds those bytes long after the requests
    // that produced them were abandoned.
    const path = await fakeServer(() => undefined, (socket) => socket.pause());
    const client = await clientFor(path, "lease", 50);
    const big = "x".repeat(200_000);
    const attempts = await Promise.allSettled(
      Array.from({ length: 40 }, () => client.acceptWork({ prompt: big, providerId: "p" }))
    );
    const refused = attempts.filter((a) =>
      a.status === "rejected" && /the peer is not reading/.test(String(a.reason)));
    expect(refused.length).toBeGreaterThan(0);
  });

  it("reports a socket that is not there", async () => {
    await expect(connectWireClient({ socketPath: socketPath(), lease: "l" }))
      .rejects.toThrow(WireTransportError);
  });
});
