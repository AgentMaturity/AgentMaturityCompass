import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * `amc acp` end to end, through the built CLI on real pipes.
 *
 * The point of this file is that a client can drive AMC through a whole ACP
 * conversation and the ledger still verifies afterwards. Everything below the
 * CLI is covered by tests/acpAgentServer.test.ts with a stub session; here the
 * turn is real, produced by the stub PROVIDER, so the rows are real rows.
 *
 * The other assertion that matters is negative: stdout carries nothing but
 * frames. A single stray line of human-facing output corrupts the stream, and a
 * JSON-RPC peer has no way to resynchronise.
 */

const CLI = resolve(process.cwd(), "dist/cli.js");
const PASS = "amc-test-passphrase";
const dirs: string[] = [];
const children: ChildProcess[] = [];

function workspace(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-acpstdio-")));
  dirs.push(root);
  initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
  return root;
}

interface Client {
  send(message: Record<string, unknown>): void;
  /** Wait for the response with this id. */
  reply(id: number): Promise<Record<string, unknown>>;
  readonly frames: Record<string, unknown>[];
  readonly stderr: () => string;
}

function launch(cwd: string): Client {
  const child = spawn(process.execPath, [CLI, "acp", "--provider", "stub"], {
    cwd,
    env: { ...process.env, NO_COLOR: "1", AMC_VAULT_PASSPHRASE: PASS }
  });
  children.push(child);

  const frames: Record<string, unknown>[] = [];
  let pendingOut = "";
  let errText = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    pendingOut += chunk.toString("utf8");
    for (;;) {
      const at = pendingOut.indexOf("\n");
      if (at === -1) break;
      const line = pendingOut.slice(0, at);
      pendingOut = pendingOut.slice(at + 1);
      // Parsed, not merely counted: a non-frame line on stdout must fail here
      // rather than being skipped as noise.
      frames.push(JSON.parse(line) as Record<string, unknown>);
    }
  });
  child.stderr?.on("data", (chunk: Buffer) => { errText += chunk.toString("utf8"); });

  return {
    frames,
    stderr: () => errText,
    send: (message) => child.stdin?.write(`${JSON.stringify(message)}\n`),
    async reply(id: number): Promise<Record<string, unknown>> {
      const deadline = Date.now() + 30_000;
      for (;;) {
        const found = frames.find((f) => f["id"] === id);
        if (found) return found;
        if (Date.now() > deadline) {
          throw new Error(`no reply to ${id}; stderr: ${errText}`);
        }
        await new Promise((r) => setTimeout(r, 25));
      }
    }
  };
}

afterEach(() => {
  for (const child of children.splice(0)) child.kill("SIGTERM");
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("amc acp on stdio", () => {
  it("runs a whole conversation and leaves the ledger verifiable", async () => {
    const root = workspace();
    const client = launch(root);

    client.send({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: 1, clientCapabilities: {} }
    });
    const initialized = await client.reply(1);
    expect((initialized["result"] as Record<string, unknown>)["protocolVersion"]).toBe(1);

    client.send({ jsonrpc: "2.0", id: 2, method: "session/new", params: { cwd: root, mcpServers: [] } });
    const opened = await client.reply(2);
    const sessionId = (opened["result"] as Record<string, unknown>)["sessionId"] as string;
    expect(sessionId).toBeTypeOf("string");

    client.send({
      jsonrpc: "2.0", id: 3, method: "session/prompt",
      params: { sessionId, prompt: [{ type: "text", text: "hello" }] }
    });
    const answered = await client.reply(3);
    expect((answered["result"] as Record<string, unknown>)["stopReason"]).toBe("end_turn");

    // Content reaches the client only as notifications: PromptResponse has no
    // content field, so an agent that emitted none would look like it said
    // nothing at all.
    const updates = client.frames.filter((f) => f["method"] === "session/update");
    expect(updates.length).toBeGreaterThan(0);
    expect(JSON.stringify(updates)).toContain("agent_message_chunk");

    children.splice(0).forEach((child) => child.kill("SIGTERM"));
    await new Promise((r) => setTimeout(r, 500));

    // The payoff: a real turn, driven entirely over the protocol, and the
    // evidence chain is still sound.
    const verdict = await verifyLedgerIntegrity(root);
    expect(verdict.errors).toEqual([]);
  }, 60_000);

  it("writes nothing but frames to stdout", async () => {
    const root = workspace();
    const client = launch(root);
    client.send({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: 1, clientCapabilities: {} }
    });
    await client.reply(1);
    // Every line parsed as JSON in the reader above, so reaching here at all
    // means no banner, version line or warning was printed. Asserted explicitly
    // so the reason is visible when it breaks.
    expect(client.frames.every((f) => f["jsonrpc"] === "2.0")).toBe(true);
  }, 60_000);

  it("refuses a provider it cannot serve, on stderr and with a non-zero exit", async () => {
    const root = workspace();
    const child = spawn(process.execPath, [CLI, "acp", "--provider", "anthropic"], {
      cwd: root,
      env: { ...process.env, NO_COLOR: "1", AMC_VAULT_PASSPHRASE: PASS }
    });
    children.push(child);
    let err = "";
    child.stderr?.on("data", (chunk: Buffer) => { err += chunk.toString("utf8"); });
    const code = await new Promise<number | null>((r) => child.once("exit", (value) => r(value)));
    // A misconfiguration reported as a frame would be read as a protocol message.
    expect(code).toBe(2);
    expect(err).toContain("--model is required");
  }, 60_000);
});
