import { mkdirSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { redactSecrets } from "../../shield/redaction/redactSecrets.js";
import { sha256Hex } from "../../utils/hash.js";
import { noteFileChange } from "../toolEvidence.js";
import { defineTool } from "../toolRegistry.js";
import type { ToolDefinition, ToolExecution } from "../toolTypes.js";
import type { ReadBeforeEditLedger } from "./readBeforeEdit.js";
import { writeFileAtomicSync } from "./atomicWrite.js";
import { planLiteralEdits, type LiteralEdit } from "./fsEditPlan.js";
import { unifiedDiff } from "./lineDiff.js";
import { readRegularFile, scanRegularFile } from "./fsRegularFile.js";

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
  maxBytes: z.number().int().positive().max(10_000_000).default(400_000),
  offset: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(20_000).optional()
});
const writeArgs = z.object({ path: z.string().min(1), content: z.string() });
const literalEdit = z.strictObject({ find: z.string().min(1), replace: z.string(), replaceAll: z.boolean().optional() });
// Exclusivity is checked here, not with `oneOf` in the published schema, which some providers reject.
const editArgs = z.object({
  path: z.string().min(1),
  find: z.string().min(1).optional(),
  replace: z.string().optional(),
  replaceAll: z.boolean().optional(),
  edits: z.array(literalEdit).min(1).max(50).optional()
}).refine(
  (args) => args.edits === undefined
    ? args.find !== undefined && args.replace !== undefined
    : args.find === undefined && args.replace === undefined && args.replaceAll === undefined,
  { message: "pass either find and replace (with optional replaceAll) or edits, not both" }
);

const DEFAULT_LINE_LIMIT = 2_000;
const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

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
function insideWorkspace(workspace: string, path: string): { readonly full: string; readonly rel: string } {
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
  return { full: real, rel: rel.split(sep).join("/") };
}

/** The file's bytes, or null when it does not exist. Any other failure (a directory, no permission) is thrown. */
function readIfExists(full: string): Buffer | null {
  try {
    return readRegularFile(full);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** The exact text of `raw`, or null when it is not valid UTF-8: decoding would replace bytes, and writing back would change them. */
function utf8(raw: Buffer): string | null {
  try {
    return UTF8.decode(raw);
  } catch {
    return null;
  }
}

/** Text fit to show as lines: valid UTF-8 with no NUL byte, which marks binary content. */
const displayText = (raw: Buffer): string | null => (raw.includes(0) ? null : utf8(raw));

/** Stream the full observation while retaining only a capped raw prefix or numbered line range. */
function readPresentation(full: string, path: string, maxBytes: number, range: { offset: number; limit: number } | null) {
  const chunks: Buffer[] = [];
  let retained = 0;
  let shownBytes = 0;
  const append = (chunk: Buffer): void => {
    shownBytes += chunk.length;
    // Up to four lookahead bytes let the final cut keep a whole UTF-8 character.
    const count = Math.min(chunk.length, maxBytes + 4 - retained);
    if (count > 0) {
      chunks.push(Buffer.from(chunk.subarray(0, count)));
      retained += count;
    }
  };
  const decoder = range === null ? null : new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  let line = 1;
  let lineStarted = false;
  let selectedLines = 0;
  let endsWithNewline = true;
  const notText = () => new Error(`"${path}" is not UTF-8 text (binary or another encoding); read it without offset and limit`);
  const observation = scanRegularFile(full, chunk => {
    if (range === null) { append(chunk); return; }
    try {
      if (chunk.includes(0)) throw notText();
      decoder!.decode(chunk, { stream: true });
    } catch { throw notText(); }
    let start = 0;
    while (start < chunk.length) {
      const newline = chunk.indexOf(10, start);
      const end = newline === -1 ? chunk.length : newline;
      if (line >= range.offset && line - range.offset < range.limit) {
        if (!lineStarted) {
          append(Buffer.from(`${selectedLines === 0 ? "" : "\n"}${String(line).padStart(6)}\t`, "utf8"));
          selectedLines++;
          lineStarted = true;
        }
        append(chunk.subarray(start, end));
      }
      endsWithNewline = newline !== -1;
      if (newline === -1) break;
      line++;
      lineStarted = false;
      start = newline + 1;
    }
  });
  if (decoder !== null) {
    try { decoder.decode(); } catch { throw notText(); }
  }
  const totalLines = line - (endsWithNewline ? 1 : 0);
  if (range !== null && range.offset > totalLines) {
    throw new Error(`offset ${range.offset} is past the end of the file (${totalLines} lines)`);
  }
  const shown = Buffer.concat(chunks, retained);
  let end = Math.min(shown.length, maxBytes);
  // A cut before a continuation byte falls inside its character: omit that character.
  while (end > 0 && end < shown.length && (shown[end]! & 0xc0) === 0x80) end--;
  const slice = shown.subarray(0, end);
  const truncated = shownBytes > slice.length
    ? `\n[amc: truncated at ${maxBytes} bytes; ${shownBytes - slice.length} more]`
    : "";
  const trailer = range === null ? "" : `\n[amc: lines ${range.offset}-${Math.min(totalLines, range.offset + range.limit - 1)} of ${totalLines}]`;
  return { ...observation, retainedBytes: slice.length, output: `${slice.toString("utf8")}${truncated}${trailer}` };
}

/**
 * The diff a tool result shows, redacted with the shared secret patterns before it reaches the model or the ledger.
 * Redaction is display only: the file gets the bytes the agent asked for.
 */
function shownDiff(rel: string, before: Buffer, after: Buffer): { readonly text: string; readonly truncated: boolean } {
  const oldText = displayText(before);
  const newText = displayText(after);
  const diff = oldText === null || newText === null
    ? { text: before.equals(after) ? "" : `Binary files a/${rel} and b/${rel} differ`, truncated: false }
    : unifiedDiff(rel, oldText, newText);
  return { text: redactSecrets(diff.text, (type) => `[AMC_REDACTED:${type}]`).redacted, truncated: diff.truncated };
}

/**
 * Write `after` only while the file still holds the bytes this call read and planned against.
 *
 * ponytail: a re-read just before the rename, so a writer racing the call is refused rather than overwritten; the
 * window between this check and the rename remains, as it does for any unlocked write.
 */
function writeIfUnchanged(full: string, path: string, before: Buffer | null, after: Buffer): void {
  const current = readIfExists(full);
  if ((current === null ? null : sha256Hex(current)) !== (before === null ? null : sha256Hex(before))) {
    throw new Error(`"${path}" changed while this call ran — read it again, then retry`);
  }
  writeFileAtomicSync(full, after);
}

function editsOf(args: z.infer<typeof editArgs>): LiteralEdit[] {
  if (args.edits !== undefined) return args.edits;
  return [{ find: args.find ?? "", replace: args.replace ?? "", ...(args.replaceAll === undefined ? {} : { replaceAll: args.replaceAll }) }];
}

const withDiff = (head: string, diff: string): string => (diff === "" ? head : `${head}\n${diff}`);

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
      description:
        "Read a regular file from the workspace, with file content capped at maxBytes on UTF-8 character boundaries. " +
        "With offset or limit, returns numbered UTF-8 lines: each line is its number " +
        "right-aligned in 6 columns, a tab, then the text. The number and tab are not part of the file; leave them out " +
        "of fs.edit find text.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "workspace-relative path" },
          maxBytes: { type: "integer", minimum: 1, maximum: 10_000_000, description: "bytes to return before truncating" },
          offset: { type: "integer", minimum: 1, description: "1-based first line to return" },
          limit: { type: "integer", minimum: 1, maximum: 20000, description: "lines to return (default 2000)" }
        },
        required: ["path"]
      },
      body: (execution) => {
        const args = readArgs.parse(execution.arguments);
        const { full } = insideWorkspace(execution.workspace, args.path);
        const range = args.offset === undefined && args.limit === undefined
          ? null
          : { offset: args.offset ?? 1, limit: args.limit ?? DEFAULT_LINE_LIMIT };
        const shown = readPresentation(full, args.path, args.maxBytes, range);
        // The streamed digest covers bytes outside the retained prefix/range too.
        ledger.recordReadDigest(execution.agentId, full, shown.digest);
        return { ok: true, output: shown.output, bytes: shown.retainedBytes };
      }
    }),

    defineTool({
      name: "fs.write",
      actionClass: "WRITE_LOW",
      description:
        "Write a UTF-8 file, creating it if absent. Overwriting an existing file requires reading it first, and returns a unified diff.",
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
        const { full, rel } = insideWorkspace(execution.workspace, args.path);
        const before = readIfExists(full);
        const verdict = ledger.mayWrite(execution.agentId, full);
        if (!verdict.ok) throw new Error(verdict.reason);
        const after = Buffer.from(args.content, "utf8");
        const diff = before === null ? null : shownDiff(rel, before, after);
        if (simulated(execution)) {
          return { ok: true, output: withDiff(`SIMULATE fs.write ${args.path} (${after.length} bytes)`, diff?.text ?? ""), bytes: 0 };
        }
        mkdirSync(dirname(full), { recursive: true });
        writeIfUnchanged(full, args.path, before, after);
        // Refresh: the agent now knows this file's contents, because it just
        // produced them.
        ledger.recordRead(execution.agentId, full, after);
        noteFileChange(execution.token, {
          path: rel, beforeSha256: before === null ? null : sha256Hex(before), afterSha256: sha256Hex(after),
          bytesBefore: before?.length ?? 0, bytesAfter: after.length, replacements: null,
          diffSha256: diff === null ? null : sha256Hex(diff.text), diffTruncated: diff?.truncated ?? false
        });
        return { ok: true, output: diff === null ? `created ${args.path}` : withDiff(`wrote ${args.path}`, diff.text), bytes: after.length };
      }
    }),

    defineTool({
      name: "fs.edit",
      actionClass: "WRITE_LOW",
      description:
        "Replace exact text in a workspace file you have read, and return a unified diff. Give find and replace (the text " +
        "must appear exactly once, or set replaceAll), or edits: up to 50 such replacements applied in order, all or " +
        "nothing. Text is literal; fs.read line-number prefixes are not part of the file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "workspace-relative path" },
          find: { type: "string", description: "exact text to replace; must appear exactly once unless replaceAll is true" },
          replace: { type: "string" },
          replaceAll: { type: "boolean", description: "replace every occurrence of find (at least one)" },
          edits: {
            type: "array",
            minItems: 1,
            maxItems: 50,
            description: "instead of find and replace: several edits applied in order to one read of the file, all or nothing",
            items: {
              type: "object",
              properties: {
                find: { type: "string" },
                replace: { type: "string" },
                replaceAll: { type: "boolean" }
              },
              required: ["find", "replace"],
              additionalProperties: false
            }
          }
        },
        required: ["path"]
      },
      body: (execution) => {
        const args = editArgs.parse(execution.arguments);
        const { full, rel } = insideWorkspace(execution.workspace, args.path);
        // Read before the policy check, and write only if the file still holds
        // these bytes: the plan, the diff and the evidence all describe them.
        const raw = readIfExists(full);
        const verdict = ledger.mayEdit(execution.agentId, full);
        if (!verdict.ok) throw new Error(verdict.reason);
        if (raw === null) throw new Error(`"${args.path}" changed while this call ran — read it again, then retry`);
        const before = utf8(raw);
        if (before === null) {
          throw new Error(`"${args.path}" is not valid UTF-8; fs.edit would change bytes it was not asked to change`);
        }
        const plan = planLiteralEdits(before, editsOf(args), args.path);
        const after = Buffer.from(plan.after, "utf8");
        const diff = shownDiff(rel, raw, after);
        const summary = `${plan.replacements} replacement${plan.replacements === 1 ? "" : "s"}`;
        if (simulated(execution)) {
          return { ok: true, output: withDiff(`SIMULATE fs.edit ${args.path} (${summary})`, diff.text), bytes: 0 };
        }
        writeIfUnchanged(full, args.path, raw, after);
        ledger.recordRead(execution.agentId, full, after);
        noteFileChange(execution.token, {
          path: rel, beforeSha256: sha256Hex(raw), afterSha256: sha256Hex(after), bytesBefore: raw.length,
          bytesAfter: after.length, replacements: plan.replacements, diffSha256: sha256Hex(diff.text), diffTruncated: diff.truncated
        });
        return { ok: true, output: withDiff(`edited ${args.path} (${summary})`, diff.text), bytes: after.length };
      }
    })
  ];
}
