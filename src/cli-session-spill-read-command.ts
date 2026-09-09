import type { Command } from "commander";
import type { SessionSpillRange } from "./session/spill/spillRead.js";

function decimal(value: string, option: string): number {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${option} requires a whole byte count, for example --offset 0 --limit 4096.`);
  }
  return Number(value);
}

/** Escape terminal controls while keeping ordinary multiline text readable. */
function terminalText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,
    character => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export function registerSessionSpillReadCommand(session: Command): void {
  session.command("spill-read")
    .description("Read a bounded byte range of retained output against its signed origin")
    .argument("<locator>", "complete amc-spill locator from a preview or inventory")
    .option("--workspace <path>", "workspace containing the signed origin and retained object")
    .option("--offset <bytes>", "zero-based byte offset", "0")
    .option("--limit <bytes>", "bytes to return, at most 16384", "4096")
    .option("--expect-monitor <sha256>", "monitor fingerprint obtained out of band")
    .option("--json", "return exact bytes as base64 with origin and range metadata")
    .action(async (locator: string, opts: {
      workspace?: string; offset: string; limit: string; expectMonitor?: string; json?: boolean;
    }) => {
      try {
        const offset = decimal(opts.offset, "--offset"), limit = decimal(opts.limit, "--limit");
        const { resolve, join } = await import("node:path");
        const { lstatSync } = await import("node:fs");
        const { openSessionEventStore, readSessionStoreMarker, resolveSessionStoreBackend } = await import("./persistence/openSessionEventStore.js");
        const { readSessionSpillRange } = await import("./session/spill/spillRead.js");
        const workspace = resolve(opts.workspace ?? process.cwd());
        let markerPresent = false;
        try {
          const stat = lstatSync(join(workspace, ".amc", "session-store.json"));
          markerPresent = true;
          if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Session-store marker must be a regular file; restore the recorded backend before reading output.");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        const marker = readSessionStoreMarker(workspace);
        if (markerPresent && marker === null) {
          throw new Error("Invalid session-store marker; restore the workspace's recorded backend before reading output.");
        }
        const requested = process.env.AMC_SESSION_STORE?.trim().toLowerCase();
        if (requested && requested !== "sqlite" && requested !== "jsonl") throw new Error("AMC_SESSION_STORE must be sqlite or jsonl; unset it to use the recorded workspace backend.");
        const backend = resolveSessionStoreBackend(workspace);
        if (marker !== null && backend !== marker) throw new Error(`Workspace uses ${marker}; unset the conflicting AMC_SESSION_STORE before reading output.`);
        const store = openSessionEventStore(workspace, backend, { readOnly: true });
        let page: SessionSpillRange;
        try {
          page = readSessionSpillRange({ workspace, events: store.readAllEvents(), locator, offset, limit,
            options: opts.expectMonitor === undefined ? {} : { expectedMonitorFingerprint: opts.expectMonitor } });
        } finally { store.close(); }
        if (opts.json) { console.log(JSON.stringify(page, null, 2)); return; }
        console.log(`Retained output: ${page.storage}; ${page.returnedBytes} bytes at offset ${page.offset} of ${page.totalBytes}.`);
        console.log(`Full content matches its authenticated origin: ${page.contentSha256}`);
        console.log(page.verification.expectedMonitorFingerprint === null
          ? "Trust is unanchored. Use --expect-monitor with an independently obtained fingerprint to pin identity."
          : "Monitor identity matches the supplied fingerprint.");
        console.log("This reads authenticated references; it does not verify the whole session chain. Text is decoded as UTF-8; use --json for exact bytes.");
        console.log(`Origins: ${terminalText(page.eventIds.join(", "))}`);
        console.log(terminalText(Buffer.from(page.contentBase64, "base64").toString("utf8")));
        console.log(page.nextOffset === null ? "End of retained output." : `Continue with --offset ${page.nextOffset} --limit ${limit}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (opts.json) console.log(JSON.stringify({ ok: false, error: message }));
        else console.error(`Retained output was not read: ${terminalText(message)}`);
        process.exitCode = 1;
      }
    });
}
