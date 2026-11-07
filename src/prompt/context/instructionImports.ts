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
 * (`id_*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`). Names are compared
 * case-insensitively: on APFS and NTFS `.AMC/` IS `.amc/`, and on a
 * case-sensitive filesystem refusing the upper-case spelling loses nothing.
 * User-scope files never import. There is
 * no approval dialog for a foreign path, which is stricter than Claude Code's
 * prompt-for-approval, and it is said in the docs.
 *
 * Every refusal is an omission the model sees, by path and by reason, for the
 * same reason an unreadable instruction file is: a rule the model was not shown
 * must not look like a rule that never existed.
 */
import { posix } from "node:path";
import { sha256Hex } from "../../utils/hash.js";
import { readBoundedInstructionText, type InstructionOmission } from "./instructionFiles.js";

export const MAX_IMPORT_DEPTH = 4;
const IMPORT_LINE = /^@(\S+)$/;
/** Directories an import may never name, however the path is written (lower-case; compared case-insensitively). */
const REFUSED_SEGMENTS: readonly string[] = Object.freeze([".amc", ".git", "node_modules", ".ssh", ".aws", ".gnupg", ".kube", ".docker"]);
/** Credential carriers by exact lower-case file name. */
const REFUSED_FILE_NAMES: readonly string[] = Object.freeze([".envrc", ".npmrc", ".netrc", ".pypirc", ".git-credentials", "credentials"]);
/** Credential carriers by lower-case name shape: `.env*`, SSH identities, and key-file extensions. */
const REFUSED_FILE_PATTERNS: readonly RegExp[] = Object.freeze([/^\.env(\.|$)/, /^id_[a-z0-9]+(\.pub)?$/, /\.(pem|key|p12|pfx|jks|keystore)$/]);

/** True when a lower-cased final path segment is a file an import may never read. */
function isRefusedFileName(name: string): boolean {
  return REFUSED_FILE_NAMES.includes(name) || REFUSED_FILE_PATTERNS.some((pattern) => pattern.test(name));
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
  // Case-insensitive on purpose: the filesystem may be, and `.AMC/vault.json` must not read what `.amc/vault.json` cannot.
  const segments = resolved.split("/").map((segment) => segment.toLowerCase());
  if (segments.some((segment) => REFUSED_SEGMENTS.includes(segment))) return { ok: false, detail: "the import names AMC state, version control, dependencies or a credential directory" };
  if (isRefusedFileName(segments.at(-1)!)) return { ok: false, detail: "the import names an environment or credential file" };
  return { ok: true, path: resolved };
}

/**
 * Follow a loaded file's imports, breadth first, within the depth and byte caps.
 *
 * @param params.workspace - the verified workspace root (real path).
 * @param params.alreadyLoaded - display paths already in the contribution; a repeat is skipped, not re-sent.
 */
export function resolveInstructionImports(params: {
  readonly workspace: string;
  readonly importedBy: string;
  readonly content: string;
  readonly maxFileBytes: number;
  readonly alreadyLoaded: ReadonlySet<string>;
  readonly readTextFile?: (absolutePath: string) => string;
}): ImportResolution {
  const imports: LoadedImport[] = [];
  const omitted: InstructionOmission[] = [];
  const seen = new Set<string>(params.alreadyLoaded);
  seen.add(params.importedBy);
  let frontier: { readonly importedBy: string; readonly content: string }[] = [{ importedBy: params.importedBy, content: params.content }];
  for (let depth = 1; frontier.length > 0; depth += 1) {
    const next: { importedBy: string; content: string }[] = [];
    for (const file of frontier) {
      for (const target of importTargets(file.content)) {
        const resolved = resolveImportPath(target, file.importedBy);
        const displayPath = resolved.ok ? resolved.path : `${file.importedBy} → @${target}`;
        if (!resolved.ok) { omitted.push({ displayPath, reason: "import-refused", detail: resolved.detail }); continue; }
        if (seen.has(resolved.path)) continue;
        seen.add(resolved.path);
        if (depth > MAX_IMPORT_DEPTH) {
          omitted.push({ displayPath: resolved.path, reason: "import-depth", detail: `imported by ${file.importedBy} beyond the ${MAX_IMPORT_DEPTH}-hop import limit` });
          continue;
        }
        const read = readBoundedInstructionText(params.workspace, resolved.path, params.maxFileBytes, params.readTextFile);
        if (read === null) { omitted.push({ displayPath: resolved.path, reason: "unreadable", detail: `imported by ${file.importedBy}; not a readable regular workspace file` }); continue; }
        if (read.bytes > params.maxFileBytes) {
          omitted.push({ displayPath: resolved.path, reason: "oversize", detail: `imported by ${file.importedBy}; ${read.bytes} bytes exceeds the ${params.maxFileBytes}-byte per-file limit` });
          continue;
        }
        imports.push({ displayPath: resolved.path, importedBy: file.importedBy, content: read.content, bytes: read.bytes, sha256: sha256Hex(read.content) });
        next.push({ importedBy: resolved.path, content: read.content });
      }
    }
    frontier = next;
  }
  return { imports, omitted };
}
