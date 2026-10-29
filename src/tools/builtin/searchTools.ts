import { Worker } from "node:worker_threads";
import { z } from "zod";
import { defineTool } from "../toolRegistry.js";
import type { ToolDefinition } from "../toolTypes.js";
import type { SearchWorkerInput, SearchResult } from "./grepWorker.js";
import { insideWorkspace } from "./fsTools.js";

/**
 * Search tools (P4.3).
 *
 * Search returns capped inline results with explicit truncation notices.
 * Callers can narrow a query without retrieving an unbounded source listing.
 *
 * Reporting is the half that makes capping honest. A truncated result that
 * does not say it was truncated is a claim about the codebase that was never
 * checked — the model concludes "there are three matches" when there were four
 * hundred. Every cap here names what it dropped.
 *
 * INDEPENDENT CAPS, BECAUSE ONE IS NOT ENOUGH. A match limit alone is defeated by a
 * single 50 MB minified line; a byte limit alone lets a million one-character
 * matches through. Files walked, matches returned, and bytes emitted are
 * bounded separately. Grep also bounds input bytes. Both tools run the entire
 * walk and matching in a worker, so regex backtracking cannot block cancellation.
 */

const globArgs = z.object({
  pattern: z.string().min(1),
  path: z.string().min(1).optional(),
  includeIgnored: z.boolean().default(false),
  timeoutMs: z.number().int().positive().max(10_000).default(10_000),
  maxResults: z.number().int().positive().max(5_000).default(200)
});

const grepArgs = z.object({
  pattern: z.string().min(1),
  path: z.string().min(1).optional(),
  /** Optional glob narrowing which files are searched. */
  include: z.string().optional(),
  includeIgnored: z.boolean().default(false),
  caseInsensitive: z.boolean().default(false),
  timeoutMs: z.number().int().positive().max(10_000).default(10_000),
  maxScannedBytes: z.number().int().positive().max(100_000_000).default(20_000_000),
  maxResults: z.number().int().positive().max(2_000).default(100),
  maxBytes: z.number().int().positive().max(2_000_000).default(100_000)
});

/** The deadline covers worker startup, the walk, reads and every regex test. */
function searchInWorker(input: SearchWorkerInput, signal?: AbortSignal): Promise<SearchResult> {
  const cancelled = (): SearchResult => ({ ok: false, output: "[amc: search cancelled; results incomplete]" });
  if (signal?.aborted) return Promise.resolve(cancelled());
  const worker = new Worker(new URL("./grepWorker.js", import.meta.url), {
    workerData: input,
    execArgv: [],
    env: {},
    resourceLimits: { maxOldGenerationSizeMb: 128 }
  });
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: SearchResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      void worker.terminate().then(() => resolve(result), () => resolve(result));
    };
    const abort = (): void => finish(cancelled());
    const timer = setTimeout(() => finish({
      ok: false,
      timedOut: true,
      output: `[amc: search exceeded ${input.args.timeoutMs} ms; results incomplete]`
    }), input.args.timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    worker.once("message", (result: SearchResult) => finish(result));
    worker.once("error", (error: Error) => finish({ ok: false, output: `[amc: search failed: ${error.message}; results incomplete]` }));
    worker.once("exit", () => finish({ ok: false, output: "[amc: search worker exited without a result; results incomplete]" }));
  });
}

export function searchTools(): readonly ToolDefinition[] {
  return [
    defineTool({
      name: "glob",
      actionClass: "READ_ONLY",
      description: "List workspace files matching a glob pattern (* within a segment, ** across segments).",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "e.g. **/*.ts" },
          path: { type: "string", description: "workspace-relative directory to search (default workspace root); results remain workspace-relative" },
          maxResults: { type: "integer" },
          includeIgnored: { type: "boolean", description: "include files excluded by repository ignore rules" },
          timeoutMs: { type: "integer", minimum: 1, maximum: 10000, description: "deadline for the entire search, in milliseconds" }
        },
        required: ["pattern"]
      },
      body: (execution) => {
        const args = globArgs.parse(execution.arguments);
        if (args.path !== undefined) args.path = insideWorkspace(execution.workspace, args.path).rel;
        return searchInWorker({ kind: "glob", workspace: execution.workspace, args }, execution.signal);
      }
    }),

    defineTool({
      name: "grep",
      actionClass: "READ_ONLY",
      description: "Search workspace file contents for a regular expression. Results are capped and say so.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "JavaScript regular expression" },
          path: { type: "string", description: "workspace-relative directory to search (default workspace root); results remain workspace-relative" },
          include: { type: "string", description: "glob narrowing which files are searched" },
          includeIgnored: { type: "boolean", description: "include files excluded by repository ignore rules" },
          caseInsensitive: { type: "boolean" },
          timeoutMs: { type: "integer", minimum: 1, maximum: 10000, description: "deadline for the entire search, in milliseconds" },
          maxScannedBytes: { type: "integer", minimum: 1, maximum: 100000000, description: "maximum file-content bytes scanned, excluding bounded ignore metadata" },
          maxResults: { type: "integer" },
          maxBytes: { type: "integer" }
        },
        required: ["pattern"]
      },
      body: (execution) => {
        const args = grepArgs.parse(execution.arguments);
        if (args.path !== undefined) args.path = insideWorkspace(execution.workspace, args.path).rel;
        return searchInWorker({ kind: "grep", workspace: execution.workspace, args }, execution.signal);
      }
    })
  ];
}
