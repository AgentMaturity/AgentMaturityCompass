import { readFileSync, mkdirSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { defineTool } from "../toolRegistry.js";
import type { ToolDefinition, ToolExecution } from "../toolTypes.js";
import type { ReadBeforeEditLedger } from "./readBeforeEdit.js";
import { writeFileAtomicSync } from "./atomicWrite.js";

/**
 * Filesystem tools (P4.3).
 *
 * Three tools and one policy. The policy — read before you edit — lives in
 * `readBeforeEdit.ts` and is threaded through here rather than reimplemented,
 * because a rule enforced in three bodies is a rule that will shortly be
 * enforced in two.
 *
 * WHY THE WORKSPACE BOUND IS HERE AND NOT ONLY IN A GUARD. The signed
 * `tools.yaml` allowlist governs `fs.read`/`fs.write` by path glob, and that
 * remains the policy. This is the second, cruder check that a resolved path
 * stays inside the workspace at all — because the allowlist is a per-tool
 * configuration a deployment can widen, and escaping the workspace entirely is
 * not something any configuration should be able to express by accident.
 */

const readArgs = z.object({
  path: z.string().min(1),
  maxBytes: z.number().int().positive().max(10_000_000).default(400_000)
});
const writeArgs = z.object({ path: z.string().min(1), content: z.string() });
const editArgs = z.object({
  path: z.string().min(1),
  find: z.string().min(1),
  replace: z.string()
});

/**
 * Directories inside the workspace that a tool must not touch.
 *
 * `.amc` holds the vault and the signing keys, and the signed tool policy
 * itself; `.git` holds hooks, which are arbitrary code execution at the next
 * commit. Both are inside the workspace, so containment alone permits them.
 *
 * The signed `tools.yaml` allowlist denies these globs as well. This is the
 * second lock rather than the only one, because that allowlist is applied by a
 * guard — and a guard that a composition forgets to install enforces nothing.
 */
const FORBIDDEN_SEGMENTS = new Set([".amc", ".git"]);

/**
 * Resolve every symlink on the deepest existing prefix of a path.
 *
 * A file that does not exist yet still has an existing ancestor, and that
 * ancestor is where a link would be. Walking up until something resolves and
 * re-appending the rest is what makes the check work for a write to a new file.
 */
function realPathOfNearestExisting(target: string): string {
  const trailing: string[] = [];
  let current = target;
  for (;;) {
    try {
      return trailing.length === 0 ? realpathSync(current) : join(realpathSync(current), ...trailing);
    } catch {
      const parent = dirname(current);
      if (parent === current) return target; // reached the root; nothing exists
      trailing.unshift(basename(current));
      current = parent;
    }
  }
}

/**
 * Resolve inside the workspace, or refuse.
 *
 * `..` is not filtered — it is resolved and then checked, because filtering
 * strings is a guessing game and resolution is what the filesystem does.
 *
 * And the check is made on the REAL path, not the typed one. A lexical
 * `resolve`/`relative` pair does not follow symlinks while `readFileSync`
 * does, so `ln -s /etc/shadow ws/notes.txt` passes a textual containment test
 * and then reads the target. Containment has to be decided on the path the
 * filesystem will actually open. Both sides are realpath'd, because the
 * workspace root is itself often a link (`/var` to `/private/var` on macOS).
 */
function insideWorkspace(workspace: string, path: string): string {
  const root = realPathOfNearestExisting(resolve(workspace));
  const requested = isAbsolute(path) ? resolve(path) : resolve(root, path);
  const real = realPathOfNearestExisting(requested);
  const rel = relative(root, real);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`path escapes the workspace: ${path}`);
  }
  for (const segment of rel.split(/[/\\]/)) {
    if (FORBIDDEN_SEGMENTS.has(segment)) {
      throw new Error(`path is inside a protected directory (${segment}): ${path}`);
    }
  }
  return real;
}

export interface FsToolDeps {
  readonly ledger: ReadBeforeEditLedger;
}

export function fsTools(deps: FsToolDeps): readonly ToolDefinition[] {
  const { ledger } = deps;

  const simulated = (execution: ToolExecution): boolean => execution.effectiveMode === "SIMULATE";

  return [
    defineTool({
      name: "fs.read",
      actionClass: "READ_ONLY",
      description: "Read a UTF-8 file from the workspace.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "workspace-relative path" },
          maxBytes: { type: "integer", description: "bytes to return before truncating" }
        },
        required: ["path"]
      },
      body: (execution) => {
        const args = readArgs.parse(execution.arguments);
        const full = insideWorkspace(execution.workspace, args.path);
        const raw = readFileSync(full);
        const slice = raw.subarray(0, Math.min(raw.length, args.maxBytes));
        // Record the FULL contents, not the truncated slice: the policy asks
        // whether the file changed, and a digest over a prefix would miss
        // every change past the cap.
        ledger.recordRead(execution.agentId, full, raw);
        const truncated = raw.length > slice.length;
        return {
          output: truncated
            ? `${slice.toString("utf8")}\n[amc: truncated at ${args.maxBytes} bytes; ${raw.length - slice.length} more]`
            : slice.toString("utf8"),
          bytes: slice.length
        };
      }
    }),

    defineTool({
      name: "fs.write",
      actionClass: "WRITE_LOW",
      description: "Write a UTF-8 file, creating it if absent. Overwriting an existing file requires reading it first.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "workspace-relative path" },
          content: { type: "string" }
        },
        required: ["path", "content"]
      },
      body: (execution) => {
        const args = writeArgs.parse(execution.arguments);
        const full = insideWorkspace(execution.workspace, args.path);
        const verdict = ledger.mayWrite(execution.agentId, full);
        if (!verdict.ok) throw new Error(verdict.reason);
        if (simulated(execution)) {
          return { output: `SIMULATE fs.write ${args.path} (${Buffer.byteLength(args.content, "utf8")} bytes)`, bytes: 0 };
        }
        mkdirSync(dirname(full), { recursive: true });
        writeFileAtomicSync(full, args.content);
        // Refresh: the agent now knows this file's contents, because it just
        // produced them.
        ledger.recordRead(execution.agentId, full, Buffer.from(args.content, "utf8"));
        return { output: `wrote ${args.path}`, bytes: Buffer.byteLength(args.content, "utf8") };
      }
    }),

    defineTool({
      name: "fs.edit",
      actionClass: "WRITE_LOW",
      description: "Replace an exact, unique string in a workspace file. Read the file first; the text must appear exactly once.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "workspace-relative path" },
          find: { type: "string", description: "exact text to replace; must be unique in the file" },
          replace: { type: "string" }
        },
        required: ["path", "find", "replace"]
      },
      body: (execution) => {
        const args = editArgs.parse(execution.arguments);
        const full = insideWorkspace(execution.workspace, args.path);
        const verdict = ledger.mayEdit(execution.agentId, full);
        if (!verdict.ok) throw new Error(verdict.reason);

        const before = readFileSync(full, "utf8");
        const occurrences = before.split(args.find).length - 1;
        if (occurrences === 0) {
          throw new Error(`no occurrence of that text in "${args.path}"`);
        }
        if (occurrences > 1) {
          // Refusing beats picking. An edit that silently changed the first of
          // several matches would be a different edit from the one intended,
          // and nothing downstream could tell.
          throw new Error(
            `that text appears ${occurrences} times in "${args.path}" — include more context so the match is unique`
          );
        }
        // A splice, not String.prototype.replace: replace would expand $$, $&,
        // $` and $' in the agent's text. The check above guarantees one match.
        const at = before.indexOf(args.find);
        const after = before.slice(0, at) + args.replace + before.slice(at + args.find.length);
        if (simulated(execution)) {
          return { output: `SIMULATE fs.edit ${args.path} (1 replacement)`, bytes: 0 };
        }
        writeFileAtomicSync(full, after);
        ledger.recordRead(execution.agentId, full, Buffer.from(after, "utf8"));
        return { output: `edited ${args.path}`, bytes: Buffer.byteLength(after, "utf8") };
      }
    })
  ];
}
