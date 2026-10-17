import type { Readable } from "node:stream";
import { unconfinedShellWarning } from "../sandbox/nativeShellGate.js";
import { AMCNativeProtocolError } from "./nativeAgentErrors.js";

export function forwardNativeShellWarnings(
  stderr: Readable,
  isStopped: () => boolean,
  onError: (error: AMCNativeProtocolError) => void
): void {
  // Match only the fixed public shell warning; keep every other diagnostic private.
  // The cursor retains no diagnostic text. -1 skips the rest of a contaminated line.
  const shellWarning = unconfinedShellWarning("darwin", "cli-flag") + "\n";
  const shellWarningBytes = Buffer.from(shellWarning, "utf8");
  let shellWarningAt = 0;
  stderr.on("data", (chunk: Buffer) => {
    if (isStopped()) return;
    for (const byte of chunk) {
      if (shellWarningAt >= 0 && byte === shellWarningBytes[shellWarningAt]) {
        shellWarningAt += 1;
        if (shellWarningAt === shellWarningBytes.length) {
          shellWarningAt = 0;
          try {
            if (!process.stderr.write(shellWarning)) {
              onError(new AMCNativeProtocolError("native shell warning output is backpressured"));
              return;
            }
          } catch { onError(new AMCNativeProtocolError("native shell warning output failed")); return; }
        }
      } else {
        shellWarningAt = byte === 10 ? 0 : -1;
      }
    }
  });
  stderr.resume();
}
