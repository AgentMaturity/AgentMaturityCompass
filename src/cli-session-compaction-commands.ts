import type { Command } from "commander";
import { constants, openSync, closeSync, fstatSync, readSync } from "node:fs";
import { compactReleasedSession, inspectSessionCompaction } from "./session/sessionCompactionWorkflow.js";

interface Options {
  list?: boolean; json?: boolean; origins?: string; summaryFile?: string;
  reason?: string; expectHead?: string; drop?: boolean; replace?: boolean; summaryRole?: string;
}
function summaryFile(path: string): string {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    if (!fstatSync(fd).isFile()) throw new Error("Summary must be a regular UTF-8 text file");
    const buffer = Buffer.alloc(1_000_001); let offset = 0;
    while (offset < buffer.length) {
      const count = readSync(fd, buffer, offset, buffer.length - offset, null);
      if (!count) break; offset += count;
    }
    if (offset > 1_000_000) throw new Error("Summary exceeds the one-million-byte limit");
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, offset));
  } finally { closeSync(fd); }
}

export function registerSessionCompactionCommands(session: Command): void {
  session.command("compact <id>")
    .description("List signed history origins, then apply an explicit native summary or drop without rewriting evidence")
    .option("--list", "Read-only: show current origin addresses, byte sizes and expected head")
    .option("--origins <ids>", "Comma-separated original event IDs, in contiguous live order")
    .option("--summary-file <path>", "Explicit UTF-8 summary; AMC does not invoke a summarizer")
    .option("--expect-head <hash>", "Required for edits: exact signed head returned by --list")
    .option("--reason <text>", "Required for edits: why this history is being compacted")
    .option("--summary-role <role>", "user or assistant; range summaries only")
    .option("--replace", "Replace one entry while preserving its role, kind and tool-result outcome")
    .option("--drop", "Remove the selected range from model context, retaining its raw signed evidence")
    .option("--json", "Output the native compaction receipt as JSON")
    .action((id: string, opts: Options) => {
      try {
        if (opts.list) {
          if (opts.origins !== undefined || opts.summaryFile !== undefined || opts.expectHead !== undefined || opts.reason !== undefined || opts.drop || opts.replace || opts.summaryRole !== undefined) throw new Error("--list cannot be combined with edit options");
          const result = inspectSessionCompaction(process.cwd(), id);
          if (opts.json) console.log(JSON.stringify(result, null, 2));
          else {
            console.log(`Session ${id}\nExpected head: ${result.headEventHash}`);
            console.log(`State: ${result.closed ? "closed (read-only)" : result.interrupted ? "interrupted (recover first)" : "open"}; monitor ${result.trustRootAnchored ? "pinned" : "unanchored"}`);
            for (const entry of result.entries) console.log(`${entry.originEventId}  ${entry.role}/${entry.kind}  ${entry.bytes === null ? "pruned" : `${entry.bytes} bytes`}`);
            console.log(result.note);
          }
          return;
        }
        if (!opts.origins || !opts.expectHead || !opts.reason?.trim()) throw new Error("Edits require --origins, --expect-head and --reason; start with --list");
        if (opts.drop && opts.replace) throw new Error("Choose either --drop or --replace");
        if (opts.drop ? opts.summaryFile !== undefined : !opts.summaryFile) throw new Error(opts.drop ? "--drop excludes --summary-file" : "A summary requires --summary-file");
        if (opts.summaryRole !== undefined && opts.summaryRole !== "user" && opts.summaryRole !== "assistant") throw new Error("--summary-role must be user or assistant");
        const result = compactReleasedSession({ workspace: process.cwd(), sessionId: id, expectedHeadHash: opts.expectHead,
          originEventIds: opts.origins.split(",").map(value => value.trim()), reason: opts.reason,
          mode: opts.drop ? "drop" : opts.replace ? "replace" : "summarize",
          ...(opts.summaryFile === undefined ? {} : { replacement: summaryFile(opts.summaryFile) }),
          ...(opts.summaryRole === undefined ? {} : { summaryRole: opts.summaryRole }) });
        if (opts.json) console.log(JSON.stringify(result, null, 2));
        else console.log(`Compacted ${result.replacedBytes} to ${result.replacementBytes} payload bytes (${result.savedBytes} saved).\nOriginal evidence retained; writer released. Receipt: ${result.eventId}\nToken and cost savings were not estimated.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Compaction failed";
        if (opts.json) console.log(JSON.stringify({ ok: false, sessionId: id, error: message }, null, 2));
        else console.error(message);
        process.exitCode = 1;
      }
    });
}
