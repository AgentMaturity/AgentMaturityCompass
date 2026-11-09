/**
 * `@path` imports inside instruction files (SH-LOOP-05).
 *
 * THE FORM. A line that is exactly `@<path>` (Claude Code's form; an `@` inside
 * prose is text) imports that file. The path is relative to the importing file's
 * directory; a leading `/` is relative to the WORKSPACE root, never the host's.
 * Imported files may import in turn, up to {@link MAX_IMPORT_DEPTH} hops; the
 * fifth hop is omitted and the model is told.
 *
 * CONFINEMENT, STATED. Project instruction files are attacker-writable (a cloned
 * repository ships them), and whatever they import goes to the provider and
 * into signed delivered-context evidence. So an import can reach ONLY a regular
 * file inside the workspace, through the same bounded reader the instruction
 * files use (`readWorkspaceFile`: no `..` escape, no symlink anywhere in the
 * path). `~`, absolute host paths and `$AMC_HOME` are refused outright, and so
 * are AMC's own state and the usual credential carriers: `.amc/`, `.git/`,
 * `node_modules/`, `.ssh/`, `.aws/`, any `.env*` file, rc files that hold
 * tokens (`.npmrc`, `.netrc`, `.pypirc`, `.git-credentials`) and private keys
 * (`id_*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`). Beyond the denylist, the
 * target must be a text file by extension (`.md`, `.mdx`, `.txt`), which is
 * what memory-file imports are for. Segments are folded the way the toolhub's
 * protected-path check folds them (NFKC, lower-case): on APFS and NTFS `.AMC/`
 * IS `.amc/`, and on a case-sensitive filesystem refusing the upper-case
 * spelling loses nothing. Segment shapes that alias a directory on some
 * volumes are refused outright (a trailing dot or space, which Win32 strips;
 * `:`, which reaches an NTFS alternate data stream; `~1` short names; the other
 * Win32-reserved characters), and after the read the canonical on-disk path
 * (`realpathSync.native`) is checked against the same denylist, so the name the
 * filesystem actually opened is the name that was judged. A file with more than
 * one hard link has other names nobody judged, so it is refused by the link
 * count of the descriptor that was read. User-scope files never import. There is
 * no approval dialog for a foreign path, which is stricter than Claude Code's
 * prompt-for-approval, and it is said in the docs.
 *
 * BOUNDED, BECAUSE THE IMPORTER IS ATTACKER-WRITABLE. One instruction file
 * follows at most {@link MAX_IMPORTS_PER_FILE} `@` lines across its whole import
 * tree, and stops reading once its imports would push it past the total
 * instruction budget (the loader would drop it whole anyway). The rest are one
 * summary omission, not one line each, and a refused target is quoted back with
 * its control characters escaped and its length capped: omissions reach every
 * step's prompt and the operator's terminal, outside the byte budgets.
 *
 * Every refusal is an omission the model sees, by path and by reason, for the
 * same reason an unreadable instruction file is: a rule the model was not shown
 * must not look like a rule that never existed. Imports are resolved per
 * instruction file: two files importing the same file each carry it, so a
 * weaker importer dropped for budget never takes a stronger file's import with it.
 */
import { realpathSync } from "node:fs";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";
import { aliasedSegmentReason, foldName } from "../../toolhub/protectedPaths.js";
import { escapeTerminalControls } from "../../tools/builtin/askUserTool.js";
import { sha256Hex } from "../../utils/hash.js";
import { readBoundedInstructionText, type InstructionOmission } from "./instructionFiles.js";

export const MAX_IMPORT_DEPTH = 4;
/** `@` lines one instruction file follows across its whole import tree; the rest are one summary omission. */
export const MAX_IMPORTS_PER_FILE = 32;
/** A refused target is quoted back to the model and the terminal: at most this many characters of it. */
const MAX_SHOWN_TARGET = 160;
const IMPORT_LINE = /^@(\S+)$/;
/**
 * Directories an import may never name, at any depth, however the path is written (lower-case; compared folded).
 * Covers AMC's state and every home-relative secret directory the macOS shell sandbox denies (MACOS_SECRET_PATHS in
 * src/sandbox/seatbeltNativeShell.ts; a test keeps the two in step), since a workspace can be a home directory.
 */
const REFUSED_SEGMENTS: readonly string[] = Object.freeze([".amc", ".git", "node_modules", ".ssh", ".aws", ".azure", ".gnupg", ".kube", ".docker", ".netrc", ".npmrc"]);
const REFUSED_SEGMENT_PATHS: readonly (readonly string[])[] = Object.freeze([[".config", "gcloud"], ["library", "keychains"]]);
/** Credential carriers by name: exactly, or the same name with anything after a dot (`.npmrc.txt`, `credentials.md`). */
const REFUSED_FILE_STEMS: readonly string[] = Object.freeze([".npmrc", ".netrc", ".pypirc", ".git-credentials", "credentials"]);
/**
 * Credential carriers by shape, on the folded final segment: any name starting with `.env` (`.env.local`, `.envrc`,
 * `.env-prod.txt`), an SSH identity by its key-type stem (`id_rsa`, `id_ed25519.txt`), and a key-file extension
 * anywhere in the name (`server.pem.txt`).
 */
const REFUSED_FILE_PATTERNS: readonly RegExp[] = Object.freeze([/^\.env/, /^id_(rsa|dsa|ecdsa|ed25519)/, /\.(pem|key|p12|pfx|jks|keystore)(\.|$)/]);
/** The only things an instruction import is for: text, by extension (folded). */
const ALLOWED_EXTENSIONS: readonly string[] = Object.freeze([".md", ".mdx", ".txt"]);
/** Win32-reserved and control characters; `:` and separators are refused by {@link aliasedSegmentReason}. */
const RESERVED_CHARACTERS = /[<>"|?*\u0000-\u001f]/;

/** True when a folded final path segment is a file an import may never read. */
function isRefusedFileName(name: string): boolean {
  return REFUSED_FILE_STEMS.some((stem) => name === stem || name.startsWith(`${stem}.`)) || REFUSED_FILE_PATTERNS.some((pattern) => pattern.test(name));
}

/** True when the folded segments contain a refused directory sequence anywhere. */
function namesSecretDirectory(folded: readonly string[]): boolean {
  return folded.some((segment) => REFUSED_SEGMENTS.includes(segment))
    || REFUSED_SEGMENT_PATHS.some((path) => folded.some((_, at) => path.every((part, offset) => folded[at + offset] === part)));
}

/** A refused target as the model and the operator see it: control characters escaped, length capped. */
function shownTarget(target: string): string {
  const escaped = escapeTerminalControls(target);
  return escaped.length > MAX_SHOWN_TARGET ? `${escaped.slice(0, MAX_SHOWN_TARGET)}…` : escaped;
}

export interface LoadedImport {
  /** Workspace-relative, as the model sees it. */
  readonly displayPath: string;
  /** The file whose `@` line pulled it in. */
  readonly importedBy: string;
  readonly content: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface ImportResolution {
  readonly imports: readonly LoadedImport[];
  readonly omitted: readonly InstructionOmission[];
}

/** The `@path` targets a file names, in order; empty for a file with none. */
export function importTargets(content: string): string[] {
  const targets: string[] = [];
  for (const line of content.split("\n")) {
    const match = IMPORT_LINE.exec(line.trimEnd());
    if (match !== null) targets.push(match[1]!);
  }
  return targets;
}

/** Resolve one `@` target to a workspace-relative path, or the reason it is refused. */
export function resolveImportPath(target: string, importedBy: string): { ok: true; path: string } | { ok: false; detail: string } {
  if (target.startsWith("~")) return { ok: false, detail: "imports from a home directory are refused" };
  if (target.includes("\\") || target.includes("\0")) return { ok: false, detail: "the import path contains a refused character" };
  const base = target.startsWith("/") ? "." : posix.dirname(importedBy);
  const resolved = posix.normalize(posix.join(base, target.startsWith("/") ? target.slice(1) : target));
  if (resolved === "." || resolved === ".." || resolved.startsWith("../") || resolved.startsWith("/")) {
    return { ok: false, detail: "the import leaves the workspace" };
  }
  const refusal = refusedPathDetail(resolved.split("/"));
  if (refusal !== null) return { ok: false, detail: refusal };
  if (!ALLOWED_EXTENSIONS.some((extension) => foldName(resolved).endsWith(extension))) return { ok: false, detail: "only .md, .mdx and .txt files can be imported" };
  return { ok: true, path: resolved };
}

/**
 * Why a workspace-relative path's segments may never be imported, or null.
 * Folded on purpose: the filesystem may be case-insensitive, and `.AMC/vault.json` must not read what `.amc/vault.json` cannot.
 */
function refusedPathDetail(segments: readonly string[]): string | null {
  const folded = segments.map(foldName);
  if (namesSecretDirectory(folded)) return "the import names AMC state, version control, dependencies or a credential directory";
  if (isRefusedFileName(folded.at(-1)!)) return "the import names an environment or credential file";
  for (const segment of segments) {
    if (RESERVED_CHARACTERS.test(segment) || aliasedSegmentReason(segment) !== null) return "a path segment may alias another name on some volumes";
  }
  return null;
}

/**
 * The name the filesystem actually opened, judged again. `readWorkspaceFile` already refused symlinks and escapes, so this
 * catches only what spelling hides: a case-insensitive or short-name volume resolving the written path onto a refused one.
 * Exported for its unit test: on a real volume every spelling it could catch is refused earlier, by the folded check.
 */
export function canonicalImportRefusal(workspace: string, path: string): string | null {
  try {
    const root = realpathSync.native(workspace);
    const rel = relative(root, realpathSync.native(resolve(root, path)));
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return "the import resolves outside the workspace";
    return refusedPathDetail(rel.split(sep));
  } catch {
    return "the import could not be resolved on disk";
  }
}

/**
 * Follow one instruction file's imports, breadth first, within the depth, count and byte caps.
 *
 * @param params.workspace - the verified workspace root (real path).
 * @param params.maxTotalBytes - the total instruction budget; imports stop once the file and its imports exceed it.
 */
export function resolveInstructionImports(params: {
  readonly workspace: string;
  readonly importedBy: string;
  readonly content: string;
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
  readonly readTextFile?: (absolutePath: string) => string;
}): ImportResolution {
  const imports: LoadedImport[] = [];
  const omitted: InstructionOmission[] = [];
  const seen = new Set<string>([params.importedBy]);
  // What the imports may add before the loader would drop this file whole for exceeding the total budget.
  let room = params.maxTotalBytes - Buffer.byteLength(params.content, "utf8");
  let examined = 0, unexamined = 0;
  let frontier: { readonly importedBy: string; readonly content: string }[] = [{ importedBy: params.importedBy, content: params.content }];
  for (let depth = 1; frontier.length > 0; depth += 1) {
    const next: { importedBy: string; content: string }[] = [];
    for (const file of frontier) {
      const targets = importTargets(file.content);
      for (const [index, target] of targets.entries()) {
        if (examined >= MAX_IMPORTS_PER_FILE || room < 0) { unexamined += targets.length - index; break; }
        examined += 1;
        const resolved = resolveImportPath(target, file.importedBy);
        if (!resolved.ok) { omitted.push({ displayPath: `${file.importedBy} → @${shownTarget(target)}`, reason: "import-refused", detail: resolved.detail }); continue; }
        if (seen.has(resolved.path)) continue;
        seen.add(resolved.path);
        if (depth > MAX_IMPORT_DEPTH) {
          omitted.push({ displayPath: resolved.path, reason: "import-depth", detail: `imported by ${file.importedBy} beyond the ${MAX_IMPORT_DEPTH}-hop import limit` });
          continue;
        }
        const read = readBoundedInstructionText(params.workspace, resolved.path, params.maxFileBytes, params.readTextFile);
        if (read === null) { omitted.push({ displayPath: resolved.path, reason: "unreadable", detail: `imported by ${file.importedBy}; not a readable regular workspace file` }); continue; }
        if (read.links !== 1) { omitted.push({ displayPath: resolved.path, reason: "import-refused", detail: `imported by ${file.importedBy}; the file has other names (hard links), so the name that was judged is not the only one` }); continue; }
        if (read.bytes > params.maxFileBytes) {
          omitted.push({ displayPath: resolved.path, reason: "oversize", detail: `imported by ${file.importedBy}; ${read.bytes} bytes exceeds the ${params.maxFileBytes}-byte per-file limit` });
          continue;
        }
        const canonical = params.readTextFile === undefined ? canonicalImportRefusal(params.workspace, resolved.path) : null;
        if (canonical !== null) { omitted.push({ displayPath: resolved.path, reason: "import-refused", detail: `imported by ${file.importedBy}; ${canonical}` }); continue; }
        room -= read.bytes;
        if (room < 0) {
          omitted.push({ displayPath: resolved.path, reason: "over-budget", detail: `imported by ${file.importedBy}; with its importer it exceeds the ${params.maxTotalBytes}-byte total instruction budget, so no further import was read` });
          continue;
        }
        imports.push({ displayPath: resolved.path, importedBy: file.importedBy, content: read.content, bytes: read.bytes, sha256: sha256Hex(read.content) });
        next.push({ importedBy: resolved.path, content: read.content });
      }
    }
    frontier = next;
  }
  if (unexamined > 0) {
    omitted.push({ displayPath: `${params.importedBy} → @…`, reason: "import-limit",
      detail: `${unexamined} further @ line(s) in this file's imports were not examined: at most ${MAX_IMPORTS_PER_FILE} are followed per instruction file, within its total budget` });
  }
  return { imports, omitted };
}
