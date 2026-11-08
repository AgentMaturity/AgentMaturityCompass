import { statSync } from "node:fs";
import { z } from "zod";
import { defineTool } from "../toolRegistry.js";
import type { ToolDefinition } from "../toolTypes.js";
import { insideWorkspace } from "./workspacePath.js";
import { listDirectory } from "./workspaceWalk.js";

/**
 * `ls` (SH-TOOLS-02): one directory level, bounded and honest about what it left out.
 *
 * READ_ONLY with no path policy, like `glob` and `grep`: the workspace bound and the protected-directory identities
 * are the limits, and they are checked in the body (`insideWorkspace`), not only by a guard. Symlinks are listed as
 * links and never followed. Repository ignore rules apply as `glob` applies them unless `includeIgnored` is set;
 * `node_modules` and `dist` are listed when present, since they exist, although `glob` and `grep` do not descend into
 * them.
 */

const args = z.object({
  path: z.string().min(1).default("."),
  includeIgnored: z.boolean().default(false),
  maxEntries: z.number().int().positive().max(2_000).default(500)
}).strict();

export function lsTool(): ToolDefinition {
  return defineTool({
    name: "ls",
    actionClass: "READ_ONLY",
    description: "List one directory level of the workspace: d name/ for directories, f name <bytes> for files, l name for symlinks (not followed). Sorted by name, capped, and repository ignore rules apply unless includeIgnored.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "workspace-relative directory (default the workspace root)" },
        includeIgnored: { type: "boolean", description: "include entries hidden by repository ignore rules" },
        maxEntries: { type: "integer", minimum: 1, maximum: 2000, description: "entries to return (default 500)" }
      },
      additionalProperties: false
    },
    body: (execution) => {
      const parsed = args.parse(execution.arguments);
      const { full, rel } = insideWorkspace(execution.workspace, parsed.path);
      if (!statSync(full).isDirectory()) throw new Error(`"${parsed.path}" is not a directory`);
      const listing = listDirectory(execution.workspace, full, { includeIgnored: parsed.includeIgnored, maxEntries: parsed.maxEntries });
      const lines = listing.entries.map((entry) => entry.kind === "directory" ? `d ${entry.name}/`
        : entry.kind === "symlink" ? `l ${entry.name}`
          : entry.kind === "file" ? `f ${entry.name}  ${entry.size ?? "?"}` : `? ${entry.name}`);
      if (lines.length === 0) lines.push(`[amc: ${rel === "" ? "the workspace root" : rel} has no entries to show]`);
      if (listing.dropped > 0) lines.push(`[amc: ${listing.dropped} more entries not shown; raise maxEntries or list a subdirectory]`);
      if (listing.ignored > 0) lines.push(`[amc: ${listing.ignored} entries hidden by ignore rules; pass includeIgnored to see them]`);
      const output = lines.join("\n");
      return { ok: true, output, bytes: Buffer.byteLength(output, "utf8") };
    }
  });
}
