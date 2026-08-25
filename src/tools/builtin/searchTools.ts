import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { defineTool } from "../toolRegistry.js";
import type { ToolDefinition } from "../toolTypes.js";
import { forMatching, globToRegExp, walkWorkspace } from "./workspaceWalk.js";

/**
 * Search tools (P4.3).
 *
 * BOUNDED, NOT SPILLED. dsh sends over-cap search output to a spill store.
 * AMC has one (`src/session/spill/`) and ADR-0010 records what is wrong with
 * it: it writes plaintext protected only by file mode while evidence blobs are
 * encrypted, nothing outside that directory knows it exists so retention, DSAR
 * and export all miss it, and a spill write can precede its signed commitment.
 * The ADR's own conclusion is that these must be closed "before spill carries
 * regulated content". Grep results over a customer's source code are exactly
 * that, so this phase caps and reports instead of spilling.
 *
 * Reporting is the half that makes capping honest. A truncated result that
 * does not say it was truncated is a claim about the codebase that was never
 * checked — the model concludes "there are three matches" when there were four
 * hundred. Every cap here names what it dropped.
 *
 * THREE CAPS, BECAUSE ONE IS NOT ENOUGH. A match limit alone is defeated by a
 * single 50 MB minified line; a byte limit alone lets a million one-character
 * matches through. Files walked, matches returned, and bytes emitted are
 * bounded separately.
 */

const MAX_FILES_WALKED = 20_000;
const MAX_FILE_BYTES = 2_000_000;
const MAX_LINE_CHARS = 400;

const globArgs = z.object({
  pattern: z.string().min(1),
  maxResults: z.number().int().positive().max(5_000).default(200)
});

const grepArgs = z.object({
  pattern: z.string().min(1),
  /** Optional glob narrowing which files are searched. */
  include: z.string().optional(),
  maxResults: z.number().int().positive().max(2_000).default(100),
  maxBytes: z.number().int().positive().max(2_000_000).default(100_000)
});

/** A file is treated as binary when its first bytes contain a NUL. */
function looksBinary(bytes: Buffer): boolean {
  return bytes.subarray(0, 8_000).includes(0);
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
          maxResults: { type: "integer" }
        },
        required: ["pattern"]
      },
      body: (execution) => {
        const args = globArgs.parse(execution.arguments);
        const matcher = globToRegExp(args.pattern);
        const walked = walkWorkspace(execution.workspace, {
          maxFiles: MAX_FILES_WALKED,
          maxFileBytes: Number.MAX_SAFE_INTEGER
        });

        const matches = walked.files.filter((path) => matcher.test(forMatching(path)));
        const shown = matches.slice(0, args.maxResults);
        const lines = [...shown];
        if (matches.length > shown.length) {
          lines.push(`[amc: ${matches.length - shown.length} more matches not shown; narrow the pattern]`);
        }
        if (walked.truncated) {
          lines.push(`[amc: the walk stopped at ${MAX_FILES_WALKED} files; results are incomplete]`);
        }
        if (shown.length === 0 && !walked.truncated) {
          lines.push(`[amc: no files match ${args.pattern}]`);
        }
        return { output: lines.join("\n") };
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
          include: { type: "string", description: "glob narrowing which files are searched" },
          maxResults: { type: "integer" },
          maxBytes: { type: "integer" }
        },
        required: ["pattern"]
      },
      body: (execution) => {
        const args = grepArgs.parse(execution.arguments);
        let pattern: RegExp;
        try {
          pattern = new RegExp(args.pattern);
        } catch (error: unknown) {
          throw new Error(`invalid search pattern: ${error instanceof Error ? error.message : String(error)}`);
        }
        const include = args.include === undefined ? null : globToRegExp(args.include);

        const walked = walkWorkspace(execution.workspace, {
          maxFiles: MAX_FILES_WALKED,
          maxFileBytes: MAX_FILE_BYTES
        });

        const lines: string[] = [];
        let emittedBytes = 0;
        let matchCount = 0;
        let hitResultCap = false;
        let hitByteCap = false;

        for (const relativePath of walked.files) {
          if (hitResultCap || hitByteCap) break;
          if (include && !include.test(forMatching(relativePath))) continue;
          let bytes: Buffer;
          try {
            bytes = readFileSync(join(execution.workspace, relativePath));
          } catch {
            continue;
          }
          if (looksBinary(bytes)) continue;

          const fileLines = bytes.toString("utf8").split("\n");
          for (let index = 0; index < fileLines.length; index += 1) {
            const line = fileLines[index] ?? "";
            if (!pattern.test(line)) continue;
            matchCount += 1;
            if (matchCount > args.maxResults) {
              hitResultCap = true;
              break;
            }
            // One very long line would otherwise blow the byte budget on its
            // own, so each line is clipped before it is counted.
            const clipped = line.length > MAX_LINE_CHARS
              ? `${line.slice(0, MAX_LINE_CHARS)}[amc: line clipped]`
              : line;
            const rendered = `${relativePath}:${index + 1}:${clipped}`;
            const size = Buffer.byteLength(rendered, "utf8");
            if (emittedBytes + size > args.maxBytes) {
              hitByteCap = true;
              break;
            }
            emittedBytes += size;
            lines.push(rendered);
          }
        }

        if (hitResultCap) {
          lines.push(`[amc: stopped at ${args.maxResults} matches; more exist — narrow the pattern]`);
        }
        if (hitByteCap) {
          lines.push(`[amc: stopped at ${args.maxBytes} bytes of output; more matches exist]`);
        }
        if (walked.truncated) {
          lines.push(`[amc: the walk stopped at ${MAX_FILES_WALKED} files; results are incomplete]`);
        }
        if (lines.length === 0) {
          lines.push(`[amc: no matches for ${args.pattern}]`);
        }
        return { output: lines.join("\n") };
      }
    })
  ];
}
