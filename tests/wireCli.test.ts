import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { connect, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openLedger, verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * `amc wire` end to end, through the built CLI.
 *
 * The point of this file is the LAST assertion in the first test: after a peer
 * has been served and the server has been asked to stop, the ledger still
 * verifies. Everything the wire writes is signed evidence, so a surface that
 * accepted work and left the ledger unverifiable would have been worse than one
 * that never ran.
 */

const CLI = resolve(process.cwd(), "dist/cli.js");
const PASS = "amc-test-passphrase";
const dirs: string[] = [];
const children: ChildProcess[] = [];
const sockets: Socket[] = [];

function workspace(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-wirecli-")));
  dirs.push(root);
  initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
  return root;
}

/** Unix socket paths cap near 104 bytes, and macOS temp roots are long. */
function shortSocket(): string {
  const dir = realpathSync(mkdtempSync(join("/tmp", "amcc-")));
  dirs.push(dir);
  chmodSync(dir, 0o700);
  return join(dir, "w.sock");
}

interface Started {
  readonly child: ChildProcess;
  readonly facts: { socketPath: string; intakeSessionId: string };
}

function startServer(cwd: string, args: readonly string[]): Promise<Started> {
  const child = spawn(process.execPath, [CLI, "wire", ...args, "--json"], {
    cwd,
    env: { ...process.env, NO_COLOR: "1", AMC_VAULT_PASSPHRASE: PASS }
  });
  children.push(child);

  return new Promise((resolvePromise, reject) => {
    let out = "";
    let err = "";
    const timer = setTimeout(() => reject(new Error(`wire did not start: ${err || out}`)), 30_000);
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
      try {
        const facts = JSON.parse(out) as Started["facts"];
        clearTimeout(timer);
        resolvePromise({ child, facts });
      } catch {
        // The banner is pretty-printed over several lines, so an incomplete
        // read is expected rather than an error.
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => { err += chunk.toString("utf8"); });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`wire exited with ${String(code)}: ${err || out}`));
    });
  });
}

function ask(path: string, message: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolvePromise, reject) => {
    const socket = connect(path);
    sockets.push(socket);
    let seen = "";
    socket.once("error", reject);
    socket.on("data", (chunk: Buffer) => {
      seen += chunk.toString("utf8");
      const at = seen.indexOf("\n");
      if (at !== -1) resolvePromise(JSON.parse(seen.slice(0, at)) as Record<string, unknown>);
    });
    socket.once("connect", () => socket.write(`${JSON.stringify(message)}\n`));
  });
}

function stop(child: ChildProcess): Promise<void> {
  return new Promise((resolvePromise) => {
    child.once("exit", () => resolvePromise());
    child.kill("SIGTERM");
  });
}

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  for (const child of children.splice(0)) if (child.exitCode === null) await stop(child);
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("amc wire", () => {
  it("serves a peer and leaves the ledger verifiable", async () => {
    const root = workspace();
    const socketPath = shortSocket();
    const { child, facts } = await startServer(root, ["--socket", socketPath]);
    expect(facts.socketPath).toBe(socketPath);

    const token = issueLeaseForCli({
      workspace: root, agentId: "wire-peer", ttl: "60m", scopes: "wire:submit",
      routes: "/wire", models: "*", rpm: 500, tpm: 1_000_000, maxCostUsdPerDay: null
    }).token;

    const reply = await ask(socketPath, {
      jsonrpc: "2.0", id: 1, method: "work/accept", lease: token,
      params: { prompt: "summarise the changelog", providerId: "anthropic" }
    });
    expect((reply["result"] as Record<string, unknown>)["receipt"]).toBeTypeOf("string");

    await stop(child);

    // Sealed on the way out. A session with no seal is an ERROR from
    // verifyLedgerIntegrity, not a lifecycle state, because the OPEN/INTERRUPTED
    // verdict is reserved for sessions carrying a session/open row.
    const ledger = openLedger(root);
    const session = ledger.db.prepare(
      "SELECT session_seal_sig FROM sessions WHERE session_id = ?"
    ).get(facts.intakeSessionId) as { session_seal_sig: string | null };
    expect(session.session_seal_sig).toBeTypeOf("string");

    const verdict = await verifyLedgerIntegrity(root);
    expect(verdict.errors).toEqual([]);
    expect(verdict.ok).toBe(true);
  }, 60_000);

  it("refuses a numeric flag it cannot honour instead of ignoring it", async () => {
    const root = workspace();
    // Number.parseInt on a misspelt value yields NaN, which silently becomes
    // "no limit". This repo has already shipped one bound that was decoration
    // for exactly that reason.
    await expect(startServer(root, ["--socket", shortSocket(), "--max-connections", "lots"]))
      .rejects.toThrow(/must be a positive integer/);
  }, 60_000);
});
