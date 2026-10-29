import { spawn, type ChildProcess } from "node:child_process";
import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { terminateTree, waitForTreeExit } from "../exec/processTree.js";

/** Orderly-exit wait after stdin closes, then the SIGTERM-to-SIGKILL grace for the whole group. */
const CLOSE_GRACE_MS = 2_000;

export interface NativeMcpStdioLaunch {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly maxBufferSize: number;
  readonly onStderr: (chunk: Buffer) => void;
}

/**
 * PXB-03: the server leads its own process group (POSIX only; callers keep the
 * SDK transport on Windows), so close() reaches what a wrapper such as npx, uvx
 * or a shell script started. A tree that survives SIGKILL is a close failure.
 */
export class NativeMcpStdioTransport implements Transport {
  onclose?: Transport["onclose"];
  onerror?: Transport["onerror"];
  onmessage?: Transport["onmessage"];
  private child?: ChildProcess;
  private readonly buffer: ReadBuffer;
  private closing?: Promise<void>;

  constructor(private readonly launch: NativeMcpStdioLaunch) {
    this.buffer = new ReadBuffer({ maxBufferSize: launch.maxBufferSize });
  }

  start(): Promise<void> {
    if (this.child) return Promise.reject(new Error("MCP stdio transport already started"));
    return new Promise((resolve, reject) => {
      const child = spawn(this.launch.command, [...this.launch.args], { cwd: this.launch.cwd, env: { ...this.launch.env },
        stdio: ["pipe", "pipe", "pipe"], shell: false, detached: true, windowsHide: true });
      this.child = child;
      child.once("error", error => { reject(error); this.onerror?.(error); });
      child.once("spawn", () => resolve());
      child.once("close", () => this.onclose?.());
      child.stdin?.on("error", error => this.onerror?.(error));
      child.stdout?.on("error", error => this.onerror?.(error));
      child.stderr?.on("data", (chunk: Buffer) => this.launch.onStderr(chunk));
      child.stdout?.on("data", (chunk: Buffer) => {
        try { this.buffer.append(chunk); }
        catch (error) { this.onerror?.(error as Error); void this.close().catch(() => {}); return; }
        for (;;) {
          let message: JSONRPCMessage | null;
          try { message = this.buffer.readMessage(); }
          catch (error) { this.onerror?.(error as Error); continue; }
          if (message === null) break;
          this.onmessage?.(message);
        }
      });
    });
  }

  send(message: JSONRPCMessage): Promise<void> {
    const stdin = this.child?.stdin;
    if (!stdin || this.closing) return Promise.reject(new Error("Not connected"));
    return new Promise(resolve => { if (stdin.write(serializeMessage(message))) resolve(); else stdin.once("drain", resolve); });
  }

  close(): Promise<void> {
    this.closing ??= (async () => {
      const child = this.child;
      if (!child) return;
      try { child.stdin?.end(); } catch { /* Already closed. */ }
      if (child.exitCode === null && child.signalCode === null) {
        await new Promise<void>(resolve => {
          const timer = setTimeout(resolve, CLOSE_GRACE_MS);
          child.once("exit", () => { clearTimeout(timer); resolve(); });
        });
      }
      // The direct child may have exited on EOF while a grandchild keeps the group alive.
      const cancel = terminateTree(child, CLOSE_GRACE_MS);
      try {
        if (!await waitForTreeExit(child, 2 * CLOSE_GRACE_MS)) throw new Error("MCP stdio server process tree did not exit after SIGTERM and SIGKILL");
      } finally { cancel(); this.buffer.clear(); }
    })();
    return this.closing;
  }
}
