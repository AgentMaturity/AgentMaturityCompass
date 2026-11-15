/**
 * The command Codex runs for AMC's PostToolUse hook (P2-17, observe only): `node codexObserveForwarder.js <workspace>`.
 * It reads Codex's JSON from stdin (at most 256 KiB), posts it to the Bridge's Codex observation route with the
 * installation's observe lease (.amc/hooks/codex.json, read by piControlClient's reader), and exits 0 with nothing
 * on stdout when AMC recorded the report. When AMC did not record it (Studio is stopped, or it answered an error such as
 * HTTP 400), the forwarder says so on stderr, appends one line to `.amc/hooks/codex.lost.jsonl` (time and reason, never
 * the payload) and exits 1. Codex shows exit 1 as a failed hook and carries on: only exit 2 feeds text back to the model
 * (docs/source-reviews/P2-17-codex-hooks.md), so the tool call and the model's turn are unchanged.
 * `amc connect hooks status --provider codex` reads that file. AMC claims "observed" for recorded reports and nothing
 * for calls Codex did not report.
 */
import { closeSync, constants, fstatSync, openSync, writeSync } from "node:fs";
import { join } from "node:path";
import { postToBridge, readPiHookConfig } from "../pi/piControlClient.js";

/** The Bridge's Codex observation route (codexObserveHttp.ts CODEX_OBSERVE_PATH), pinned by a test. */
export const CODEX_FORWARD_PATH = "/bridge/hooks/codex/v1";
const MAX_BYTES = 262_144;
const TIMEOUT_MS = 5_000;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    total += buffer.byteLength;
    if (total > MAX_BYTES) throw new Error("the Codex hook payload exceeds 256 KiB");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Forward one Codex report; throws when AMC did not record it. */
export async function forwardCodexObservation(workspace: string, body: string): Promise<void> {
  const config = readPiHookConfig(workspace, "observe", "codex");
  const answer = await postToBridge(config, CODEX_FORWARD_PATH, body, TIMEOUT_MS) as { observed?: unknown } | null;
  if (answer?.observed !== true) throw new Error("AMC's answer does not say it recorded the observation");
}

/** The hook's local note of reports AMC did not record; `.amc/hooks/` is in the managed .gitignore block. */
export const codexLostObservationsPath = (workspace: string): string => join(workspace, ".amc", "hooks", "codex.lost.jsonl");
const LOST_NOTE_MAX_BYTES = 262_144;

/** Append one lost-observation line (time and reason only). Never throws, never creates a folder, stops at 256 KiB. */
export function noteLostCodexObservation(workspace: string, reason: string, now = Date.now()): void {
  const path = codexLostObservationsPath(workspace);
  let fd: number | null = null;
  try {
    // O_NOFOLLOW: a link planted at this name is refused, never written through.
    fd = openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > LOST_NOTE_MAX_BYTES) return;
    writeSync(fd, `${JSON.stringify({ ts: now, reason: reason.replace(/\s+/g, " ").slice(0, 300) })}\n`);
  } catch { /* no AMC installation here, or the disk refused: stderr and the exit code still say it */ }
  finally { if (fd !== null) closeSync(fd); }
}

/** One hook run: 0 when AMC recorded the report, 1 (with a note and a line on stderr) when it did not. */
export async function runCodexObserveForwarder(workspace: string, read: () => Promise<string> = readStdin,
  stderr: (text: string) => void = (text) => { process.stderr.write(text); }): Promise<0 | 1> {
  try {
    await forwardCodexObservation(workspace, await read());
    return 0;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    noteLostCodexObservation(workspace, reason);
    stderr(`AMC did not record this Codex tool call: ${reason}. The call itself is unaffected. Check: amc connect hooks status --provider codex\n`);
    return 1;
  }
}

if (process.argv[1]?.endsWith("codexObserveForwarder.js")) {
  void runCodexObserveForwarder(process.argv[2] ?? "").then((code) => { process.exitCode = code; });
}
