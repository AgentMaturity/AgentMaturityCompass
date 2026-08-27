import {
  chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync
} from "node:fs";
import { connect, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getPublicKeyHistory } from "../src/crypto/keys.js";
import { openLedger } from "../src/ledger/ledger.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import { initWorkspace } from "../src/workspace.js";
import { MAX_WIRE_LINE_BYTES } from "../src/wire/ndjsonFraming.js";
import { startWireListener, wireSocketPath, type WireListener } from "../src/wire/wireListener.js";

/**
 * The listener, over a real socket.
 *
 * Unix socket paths are limited to about 104 bytes, and macOS temp directories
 * are long enough to exceed that on their own, so the socket lives in a short
 * dedicated directory rather than inside the temp workspace. The directory is
 * created 0700 because that is what the listener requires -- which is itself one
 * of the things under test.
 */

const PASS = "test-passphrase-wirelistener";
const dirs: string[] = [];
const listeners: WireListener[] = [];
const sockets: Socket[] = [];

function makeWorkspace() {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-wl-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  const ledger = openLedger(dir);
  ledger.startSession({ sessionId: "intake", runtime: "amc", binaryPath: "t", binarySha256: "a" });
  return { dir, ledger, monitorPublicKeys: getPublicKeyHistory(dir, "monitor") };
}

/** A short, private directory to bind inside. */
function socketDir(): string {
  const dir = realpathSync(mkdtempSync(join("/tmp", "amcw-")));
  dirs.push(dir);
  chmodSync(dir, 0o700);
  return dir;
}

function leaseFor(workspace: string): string {
  return issueLeaseForCli({
    workspace, agentId: "wire-peer", ttl: "60m", scopes: "wire:submit",
    routes: "/wire", models: "*", rpm: 500, tpm: 1_000_000, maxCostUsdPerDay: null
  }).token;
}

async function serve(ws: ReturnType<typeof makeWorkspace>, extra: Record<string, unknown> = {}) {
  const listener = await startWireListener({
    workspace: ws.dir,
    ledger: ws.ledger,
    intakeSessionId: "intake",
    monitorPublicKeys: ws.monitorPublicKeys,
    socketPath: join(socketDir(), "w.sock"),
    ...extra
  });
  listeners.push(listener);
  return listener;
}

function open(path: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(path);
    sockets.push(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });
}

/** Send one line and wait for one newline-terminated reply. */
function ask(socket: Socket, message: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let seen = "";
    const onData = (chunk: Buffer) => {
      seen += chunk.toString("utf8");
      const at = seen.indexOf("\n");
      if (at === -1) return;
      socket.off("data", onData);
      resolve(JSON.parse(seen.slice(0, at)) as Record<string, unknown>);
    };
    socket.on("data", onData);
    socket.once("error", reject);
    socket.write(`${JSON.stringify(message)}\n`);
  });
}

/** Settle for a condition rather than sampling once, for cross-process ordering. */
async function waitFor(done: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!done() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10));
}

const accept = (token: string, id: number | string = 1) => ({
  jsonrpc: "2.0", id, method: "work/accept", lease: token,
  params: { prompt: "p", providerId: "anthropic" }
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  for (const listener of listeners.splice(0)) await listener.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("serving the wire on a socket", () => {
  it("answers a request from a connected peer", async () => {
    const ws = makeWorkspace();
    const listener = await serve(ws);
    const reply = await ask(await open(listener.socketPath), accept(leaseFor(ws.dir)));
    expect((reply["result"] as Record<string, unknown>)["receipt"]).toBeTypeOf("string");
  });

  it("gives each connection its own framer", async () => {
    const ws = makeWorkspace();
    const listener = await serve(ws);
    const token = leaseFor(ws.dir);

    // A record left half-sent on one connection. Shared framing state would let
    // the next connection's bytes complete THIS record, splicing two peers'
    // messages into one the ledger would attribute to whichever lease landed
    // last. Each connection therefore gets its own dispatcher.
    const stalled = await open(listener.socketPath);
    stalled.write('{"jsonrpc":"2.0","id":99,"method":"work/acc');

    const reply = await ask(await open(listener.socketPath), accept(token, "clean"));
    expect(reply["id"]).toBe("clean");
    expect((reply["result"] as Record<string, unknown>)["receipt"]).toBeTypeOf("string");
  });

  it("closes the connection once framing desynchronises", async () => {
    const ws = makeWorkspace();
    const listener = await serve(ws);
    const socket = await open(listener.socketPath);

    const ended = new Promise<void>((resolve) => socket.once("end", () => resolve()));
    const reply = ask(socket, { over: "x".repeat(MAX_WIRE_LINE_BYTES + 1) });
    // The refusal is written before the close, so a peer learns why.
    expect(((await reply)["error"] as { code: number }).code).toBe(-32700);
    await ended;
  });

  it("turns away peers past the connection cap", async () => {
    const ws = makeWorkspace();
    const listener = await serve(ws, { maxConnections: 1 });
    await open(listener.socketPath);
    await new Promise((r) => setTimeout(r, 50));
    expect(listener.connections).toBe(1);

    // Accepted at the TCP level and immediately destroyed; each live connection
    // may buffer up to MAX_WIRE_LINE_BYTES before anything is authorised.
    const second = await open(listener.socketPath);
    await new Promise<void>((resolve) => second.once("close", () => resolve()));
    expect(listener.connections).toBe(1);
  });

  it("drops a connection that sits idle", async () => {
    const ws = makeWorkspace();
    const listener = await serve(ws, { idleTimeoutMs: 100 });
    const socket = await open(listener.socketPath);
    await new Promise<void>((resolve) => socket.once("close", () => resolve()));
    // The client sees FIN before the server has finished releasing its side, so
    // the count is settled for rather than sampled the instant the peer notices.
    await waitFor(() => listener.connections === 0);
    expect(listener.connections).toBe(0);
  });
});

describe("choosing where to bind", () => {
  it("refuses a directory other users can enter", async () => {
    const ws = makeWorkspace();
    const shared = realpathSync(mkdtempSync(join("/tmp", "amcw-open-")));
    dirs.push(shared);
    chmodSync(shared, 0o755);
    // /tmp itself is 1777 on every unix, so exempting an operator-chosen path
    // would make the only real access control optional.
    await expect(startWireListener({
      workspace: ws.dir, ledger: ws.ledger, intakeSessionId: "intake",
      monitorPublicKeys: ws.monitorPublicKeys, socketPath: join(shared, "w.sock")
    })).rejects.toThrow(/lets other users enter/);
  });

  it("refuses a path that exists and is not a socket", async () => {
    const ws = makeWorkspace();
    const dir = socketDir();
    const path = join(dir, "w.sock");
    writeFileSync(path, "not a socket");
    // Unlinking whatever happens to be at a path is how a real file gets
    // destroyed by a mistyped argument.
    await expect(startWireListener({
      workspace: ws.dir, ledger: ws.ledger, intakeSessionId: "intake",
      monitorPublicKeys: ws.monitorPublicKeys, socketPath: path
    })).rejects.toThrow(/is not a socket/);
    expect(readFileSync(path, "utf8")).toBe("not a socket");
  });

  it("refuses to displace a listener that is still live", async () => {
    const ws = makeWorkspace();
    const listener = await serve(ws);
    // Unlinking a live server's socket leaves it running and invisible, with
    // peers silently split between two listeners.
    await expect(startWireListener({
      workspace: ws.dir, ledger: ws.ledger, intakeSessionId: "intake",
      monitorPublicKeys: ws.monitorPublicKeys, socketPath: listener.socketPath
    })).rejects.toThrow(/another listener is already/);
  });

  it("reclaims a socket left behind by a crashed process", async () => {
    const ws = makeWorkspace();
    const first = await serve(ws);
    const path = first.socketPath;
    // close() removes the server but the file can outlive an abrupt exit.
    await first.close();
    listeners.length = 0;

    const second = await startWireListener({
      workspace: ws.dir, ledger: ws.ledger, intakeSessionId: "intake",
      monitorPublicKeys: ws.monitorPublicKeys, socketPath: path
    });
    listeners.push(second);
    const reply = await ask(await open(path), accept(leaseFor(ws.dir)));
    expect((reply["result"] as Record<string, unknown>)["receipt"]).toBeTypeOf("string");
  });

  it("leaves the socket itself readable only by its owner", async () => {
    const ws = makeWorkspace();
    const listener = await serve(ws);
    // The second of two locks. The directory is the one that has to hold, since
    // socket-file permission enforcement has varied across platforms -- but a
    // world-writable socket should not be shipped on the platforms where it does.
    expect(statSync(listener.socketPath).mode & 0o777).toBe(0o600);
  });

  it("puts the default socket inside the workspace", () => {
    const ws = makeWorkspace();
    expect(wireSocketPath(ws.dir)).toBe(join(ws.dir, ".amc", "wire", "wire.sock"));
  });
});

describe("refusing to start", () => {
  it("will not listen when every ledger append would throw", async () => {
    const ws = makeWorkspace();
    process.env["AMC_EVALUATED_AGENT"] = "1";
    try {
      const dir = mkdtempSync(join("/tmp", "amcw-"));
      dirs.push(dir);
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      chmodSync(dir, 0o700);
      await expect(startWireListener({
        workspace: ws.dir, ledger: ws.ledger, intakeSessionId: "intake",
        monitorPublicKeys: ws.monitorPublicKeys, socketPath: join(dir, "w.sock")
      })).rejects.toThrow(/AMC_EVALUATED_AGENT/);
    } finally {
      delete process.env["AMC_EVALUATED_AGENT"];
    }
  });
});
