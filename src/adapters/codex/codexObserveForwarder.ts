/**
 * The command Codex runs for AMC's PostToolUse hook (P2-17, observe only): `node codexObserveForwarder.js <workspace>`.
 * It reads Codex's JSON from stdin (at most 256 KiB), posts it to the Bridge's Codex observation route with the
 * installation's observe lease (.amc/hooks/codex.json, read by piControlClient's reader), and exits 0 with nothing
 * on stdout whatever happens, so it never changes what Codex does. A report AMC could not record goes to stderr only;
 * AMC claims "observed" for recorded reports and nothing for calls Codex did not report.
 */
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

if (process.argv[1]?.endsWith("codexObserveForwarder.js")) {
  readStdin().then((body) => forwardCodexObservation(process.argv[2] ?? "", body)).catch((error: unknown) => {
    process.stderr.write(`AMC did not record this Codex observation: ${error instanceof Error ? error.message : String(error)}\n`);
  }).finally(() => { process.exitCode = 0; });
}
