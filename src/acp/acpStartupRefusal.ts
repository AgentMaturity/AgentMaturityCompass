import { ACP_ERROR } from "./acpErrors.js";
import { NativeMcpConfigError } from "../setup/nativeMcpConfig.js";
import { MAX_WIRE_LINE_BYTES } from "../wire/ndjsonFraming.js";

/** How long a refused process waits for its client's first request before exiting anyway. */
const FIRST_REQUEST_WAIT_MS = 10_000;

export interface AcpStartupRefusal {
  readonly code: typeof ACP_ERROR.startupRefused;
  readonly message: string;
  readonly data: { readonly reason: string };
}

/**
 * A reviewed-MCP refusal keeps its stable code and fixed message (both secret-free by
 * construction). Any other startup failure stays generic: its text may name paths.
 */
export function acpStartupRefusal(error: unknown): AcpStartupRefusal {
  return error instanceof NativeMcpConfigError
    ? { code: ACP_ERROR.startupRefused, message: error.message, data: { reason: error.code } }
    : { code: ACP_ERROR.startupRefused, message: "amc acp refused to start; its stderr names the reason.", data: { reason: "startup-refused" } };
}

/**
 * Answer the client's first request (normally `initialize`) with the coded refusal, then
 * settle. Nothing is written unless a request arrives: an unsolicited frame would be a
 * protocol violation. A terminal is a person, not a client, so it gets stderr only.
 */
export function serveAcpStartupRefusal(error: unknown, io: {
  readonly stdin: NodeJS.ReadableStream & { readonly isTTY?: boolean };
  readonly stdout: NodeJS.WritableStream;
}): Promise<void> {
  if (io.stdin.isTTY) return Promise.resolve();
  return new Promise(resolve_ => {
    let buffered = Buffer.alloc(0);
    const done = (): void => { clearTimeout(timer); io.stdin.off("data", onData); io.stdin.off("end", done); resolve_(); };
    const timer = setTimeout(done, FIRST_REQUEST_WAIT_MS);
    const onData = (chunk: Buffer): void => {
      buffered = Buffer.concat([buffered, chunk]);
      const newline = buffered.indexOf(10);
      if (newline === -1) { if (buffered.length > MAX_WIRE_LINE_BYTES) done(); return; }
      io.stdin.off("data", onData);
      let id: unknown;
      try {
        const frame: unknown = JSON.parse(buffered.subarray(0, newline).toString("utf8"));
        if (frame !== null && typeof frame === "object" && (frame as { jsonrpc?: unknown }).jsonrpc === "2.0") id = (frame as { id?: unknown }).id;
      } catch { /* not a request; nothing to answer */ }
      if (typeof id !== "number" && typeof id !== "string") { done(); return; }
      io.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: acpStartupRefusal(error) }) + "\n", () => done());
    };
    io.stdin.on("data", onData);
    io.stdin.once("end", done);
  });
}
