/**
 * The Codex `apply_patch` grammar (SH-TOOLS-01), parsed without touching the filesystem.
 *
 *   *** Begin Patch
 *   *** Add File: <path>          lines prefixed `+`
 *   *** Delete File: <path>
 *   *** Update File: <path>       optional `*** Move to: <newpath>`, then hunks
 *   @@ [context hint]             a hunk: lines prefixed ` ` (context), `-` (remove), `+` (add)
 *   *** End of File               the preceding hunk is anchored at the end of the file
 *   *** End Patch
 *
 * Pure and closed: a line that fits no rule refuses the whole patch, because a lenient reading of an edit script is a
 * guess about what the model meant, applied to the user's files. Paths are refused here when absolute or when they
 * contain a `..` segment; resolution against the workspace happens later and is the real check. Duplicate paths are
 * refused lexically here and again by real path in the tool body.
 */

interface PatchLine {
  readonly op: " " | "+" | "-";
  readonly text: string;
}

export interface PatchHunk {
  readonly contextHint: string | null;
  readonly lines: readonly PatchLine[];
  /** `*** End of File` followed this hunk: it must match at the end of the file. */
  readonly eof: boolean;
}

export type PatchSection =
  | { readonly kind: "add"; readonly path: string; readonly lines: readonly string[] }
  | { readonly kind: "delete"; readonly path: string }
  | { readonly kind: "update"; readonly path: string; readonly moveTo: string | null; readonly hunks: readonly PatchHunk[] };

class PatchParseError extends Error {
  override readonly name = "PatchParseError";
}

export const MAX_PATCH_BYTES = 2_000_000;
export const MAX_PATCH_SECTIONS = 100;

const BEGIN = "*** Begin Patch";
const END = "*** End Patch";

function checkPath(path: string, line: number): string {
  const trimmed = path.trim();
  if (trimmed.length === 0) throw new PatchParseError(`line ${line}: a section names no path`);
  if (trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\")) {
    throw new PatchParseError(`line ${line}: path must be workspace-relative, not absolute: ${trimmed}`);
  }
  if (trimmed.split(/[\\/]/).includes("..")) throw new PatchParseError(`line ${line}: path must not contain "..": ${trimmed}`);
  if (trimmed.includes("\0")) throw new PatchParseError(`line ${line}: path contains a NUL byte`);
  return trimmed;
}

/** Every path a patch names, source and move target alike, for the path-policy guard; `[]` when it does not parse. */
export function patchPaths(text: unknown): string[] {
  if (typeof text !== "string") return [];
  try {
    return parsePatch(text).flatMap((section) => section.kind === "update" && section.moveTo !== null ? [section.path, section.moveTo] : [section.path]);
  } catch {
    return [];
  }
}

export function parsePatch(text: string): PatchSection[] {
  if (Buffer.byteLength(text, "utf8") > MAX_PATCH_BYTES) throw new PatchParseError(`patch exceeds ${MAX_PATCH_BYTES} bytes`);
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  // A trailing newline after `*** End Patch` is the normal case; anything else after it is not.
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  let at = 0;
  while (at < lines.length && lines[at]!.trim() === "") at++;
  if (lines[at] !== BEGIN) throw new PatchParseError(`patch must start with "${BEGIN}"`);
  at++;
  const sections: PatchSection[] = [];
  const seen = new Set<string>();
  const claim = (path: string, line: number): void => {
    if (seen.has(path)) throw new PatchParseError(`line ${line}: path appears twice in the patch: ${path}`);
    seen.add(path);
  };
  let ended = false;
  while (at < lines.length) {
    const line = lines[at]!;
    const number = at + 1;
    if (line === END) { ended = true; at++; break; }
    if (sections.length >= MAX_PATCH_SECTIONS) throw new PatchParseError(`patch has more than ${MAX_PATCH_SECTIONS} sections`);
    if (line.startsWith("*** Add File: ")) {
      const path = checkPath(line.slice("*** Add File: ".length), number);
      claim(path, number);
      at++;
      const added: string[] = [];
      while (at < lines.length && !lines[at]!.startsWith("*** ")) {
        const body = lines[at]!;
        if (!body.startsWith("+")) throw new PatchParseError(`line ${at + 1}: an Add File line must start with "+"`);
        added.push(body.slice(1));
        at++;
      }
      sections.push({ kind: "add", path, lines: added });
      continue;
    }
    if (line.startsWith("*** Delete File: ")) {
      const path = checkPath(line.slice("*** Delete File: ".length), number);
      claim(path, number);
      sections.push({ kind: "delete", path });
      at++;
      continue;
    }
    if (line.startsWith("*** Update File: ")) {
      const path = checkPath(line.slice("*** Update File: ".length), number);
      claim(path, number);
      at++;
      let moveTo: string | null = null;
      if (at < lines.length && lines[at]!.startsWith("*** Move to: ")) {
        moveTo = checkPath(lines[at]!.slice("*** Move to: ".length), at + 1);
        if (moveTo === path) throw new PatchParseError(`line ${at + 1}: Move to names the file's own path`);
        claim(moveTo, at + 1);
        at++;
      }
      const hunks: PatchHunk[] = [];
      let current: { contextHint: string | null; lines: PatchLine[] } | null = null;
      const close = (eof: boolean): void => {
        if (current === null) return;
        if (current.lines.length === 0) throw new PatchParseError(`line ${at + 1}: an empty hunk in ${path}`);
        hunks.push({ ...current, eof });
        current = null;
      };
      while (at < lines.length) {
        const body = lines[at]!;
        if (body === "*** End of File") {
          if (current === null) throw new PatchParseError(`line ${at + 1}: "*** End of File" follows no hunk`);
          close(true);
          at++;
          continue;
        }
        if (body.startsWith("*** ")) break;
        if (body.startsWith("@@")) {
          close(false);
          const hint = body.slice(2).trim();
          current = { contextHint: hint.length === 0 ? null : hint, lines: [] };
          at++;
          continue;
        }
        current ??= { contextHint: null, lines: [] };
        const op = body.length === 0 ? " " : body[0]!;
        if (op !== " " && op !== "+" && op !== "-") {
          throw new PatchParseError(`line ${at + 1}: a hunk line must start with " ", "+" or "-" (got ${JSON.stringify(body.slice(0, 20))})`);
        }
        current.lines.push({ op, text: body.slice(1) });
        at++;
      }
      close(false);
      if (hunks.length === 0 && moveTo === null) throw new PatchParseError(`line ${number}: Update File ${path} has no hunks`);
      sections.push({ kind: "update", path, moveTo, hunks });
      continue;
    }
    throw new PatchParseError(`line ${number}: unexpected text outside a section: ${JSON.stringify(line.slice(0, 40))}`);
  }
  if (!ended) throw new PatchParseError(`patch must end with "${END}"`);
  if (at < lines.length) throw new PatchParseError(`line ${at + 1}: text after "${END}"`);
  if (sections.length === 0) throw new PatchParseError("patch has no sections");
  return sections;
}
