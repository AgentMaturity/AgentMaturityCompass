import { realpathSync } from "node:fs";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * What a command hook's argv may name (S6). Trust binds `.amc/hooks.json` and every file under `.amc/hooks/`; these
 * rules refuse the ways an argv names code trust cannot see, so an accepted command cannot start running different code
 * later without a new acceptance:
 *
 * - CODE-LOADING FLAGS of common interpreters (inline programs, required modules, include paths, an interactive or
 *   stdin program), wherever the interpreter appears in the whitespace-split command (so `env node -e`, `nice python3 -c`
 *   and `env -S "node -e ..."` are refused like `node -e`), in short-flag clusters (`-pe`, `-Bc`, `-xc`) too. Inline
 *   code itself is in the accepted file, but it can load any workspace file by name.
 * - STDIN AS PROGRAM: an interpreter given `-`, `/dev/stdin` or no script at all reads its program from stdin, which is
 *   the hook input and carries model-influenced text (tool arguments, prompts).
 * - PATH CANDIDATES: every argv item, its whitespace-separated words, the parts of `NAME=value` and `--flag=value`
 *   (split on `,` and the PATH delimiter) and an attached short-option value (`-I./lib`) are judged by canonical
 *   location against the workspace by nativeCommandHookConfig.ts.
 *
 * Not a parser for every program: inline programs (awk, sed, jq), and tools that read scripts or configuration from the
 * working directory or its parents on their own (npm scripts, make, test runners, linters, Node and Python package
 * lookup), are not inspected. docs/NATIVE_HOOKS.md says so.
 */

/** `short`: single-letter flags that load code; `valued`: other single-letter flags whose value ends a cluster (`-Wignore`). */
interface Interpreter { readonly short?: string; readonly valued?: string; readonly long?: readonly string[]; readonly words?: readonly string[]; readonly prefixes?: readonly string[] }
const NODE_LIKE: Interpreter = { short: "epri", valued: "C", long: ["--eval", "--print", "--require", "--import", "--loader", "--experimental-loader", "--interactive", "--preload"] };
const SHELL: Interpreter = { short: "csiC", valued: "oO", long: ["--command", "--init-command", "--rcfile", "--init-file"] };
/** PowerShell accepts any prefix of a parameter name (`-c`, `-com`, `-e`), case-insensitively, plus the aliases `-ec` and `-cwa`. */
const POWERSHELL: Interpreter = { prefixes: ["-command", "-encodedcommand", "-commandwithargs", "-ec", "-cwa"] };
const INTERPRETERS = new Map<string, Interpreter>([
  ...["node", "nodejs", "bun", "tsx", "ts-node", "esno"].map(name => [name, NODE_LIKE] as const),
  ...["sh", "bash", "zsh", "dash", "ksh", "mksh", "fish", "tcsh", "csh"].map(name => [name, SHELL] as const),
  ["python", { short: "cmi", valued: "WXQ" }], ["pypy", { short: "cmi", valued: "WXQ" }], ["ruby", { short: "erI" }], ["perl", { short: "eEMmI" }],
  ["php", { short: "rBREFa" }], ["lua", { short: "eli" }], ["luajit", { short: "eli" }], ["osascript", { short: "e" }], ["rscript", { short: "e" }],
  ["julia", { short: "eELi" }], ["deno", { words: ["eval", "repl"] }], ["pwsh", POWERSHELL], ["powershell", POWERSHELL],
  ["cmd", { words: ["/c", "/k", "/r", "/C", "/K", "/R"] }]
]);
/** `python3.12` → python, `node22` → node, `Rscript.exe` → rscript. */
function interpreterOf(token: string): Interpreter | undefined {
  const name = /^([a-z][a-z-]*?)[\d.]*(?:\.(?:exe|cmd|bat))?$/.exec(basename(token).toLowerCase())?.[1];
  return name === undefined ? undefined : INTERPRETERS.get(name);
}

function loadsCode(spec: Interpreter, token: string): boolean {
  if (spec.words?.includes(token)) return true;
  const lower = token.toLowerCase().split(":")[0]!;
  if (spec.prefixes !== undefined) return lower.length >= 2 && lower.startsWith("-") && spec.prefixes.some(prefix => prefix.startsWith(lower));
  if (token.startsWith("--")) return spec.long?.some(flag => token === flag || token.startsWith(`${flag}=`)) ?? false;
  if (!/^-[A-Za-z]/.test(token)) return false;
  for (const char of token.slice(1)) { // a cluster: flags left to right until one takes the rest of the token as its value
    if (spec.short?.includes(char)) return true;
    if (spec.valued?.includes(char)) return false;
  }
  return false;
}

/**
 * The interpreter's own options run up to its script (the first word that is not an option); what follows is the
 * script's arguments. PowerShell, cmd and deno take parameters and subcommands anywhere, so every token counts there.
 */
function interpreterVerdict(spec: Interpreter, rest: readonly string[]): { readonly flag: string } | "stdin" | "script" {
  const anywhere = spec.prefixes !== undefined || spec.words !== undefined;
  for (let at = 0; at < rest.length; at++) {
    const item = rest[at]!;
    if (loadsCode(spec, item)) return { flag: item };
    if (item === "-") return "stdin";
    if (anywhere) continue;
    if (!/^[-+]/.test(item)) return "script"; // `+o posix` is a shell option too
    if (item.length === 2 && spec.valued?.includes(item[1]!)) at++; // `-W ignore`, `-o pipefail`: the value is not the script
  }
  return anywhere && rest.length > 0 ? "script" : "stdin";
}

/** Process-relative and descriptor paths name whatever the process has open, never a reviewable file. */
const PROCESS_RELATIVE = /^\/(proc\/|dev\/fd\/|dev\/std(in|out|err)$)/;

/**
 * The parse-time refusal for one handler's argv, or undefined. Nothing here touches the filesystem. The first
 * interpreter in the whitespace-split command is the one that runs, whatever wraps it (`env`, `nice`, `sudo`, `timeout`).
 */
export function hookArgvRefusal(event: string, argv: readonly string[], hooksDir: string): string | undefined {
  const program = argv[0]!;
  if (!isAbsolute(program) && /[\\/]/.test(program)) return `A ${event} hook names its program by a relative path (${program}); use an absolute path, or a bare name found on PATH.`;
  const processPath = argvPathCandidates(argv).find(candidate => PROCESS_RELATIVE.test(candidate));
  if (processPath !== undefined) return `A ${event} hook names ${processPath}; /proc and /dev/fd paths name whatever the process has open, not a reviewable file.`;
  const tokens = argv.flatMap(item => item.split(/\s+/)).filter(token => token.length > 0);
  const at = tokens.findIndex(token => interpreterOf(token) !== undefined);
  if (at < 0) return undefined;
  const name = basename(tokens[at]!), verdict = interpreterVerdict(interpreterOf(tokens[at]!)!, tokens.slice(at + 1));
  if (typeof verdict === "object") return `A ${event} hook passes ${verdict.flag} to ${name}, which loads code trust cannot bind; put the code in a file under ${hooksDir}/ and name that file.`;
  if (verdict === "stdin") return `A ${event} hook runs ${name} with no script file, so it would read its program from stdin, which carries the hook input (model-influenced text); name a script under ${hooksDir}/.`;
  return undefined;
}

/** Every string in the argv that may name a file: items, their words, `=`-separated value parts, attached short-option values. */
export function argvPathCandidates(argv: readonly string[]): string[] {
  const out = new Set<string>();
  const parts = new RegExp(`[,${delimiter === ";" ? ";" : ":"}]`);
  for (const item of argv) {
    for (const token of new Set([item, ...item.split(/\s+/)])) {
      if (token.length === 0) continue;
      out.add(token);
      for (const piece of token.split("=").slice(1)) for (const part of piece.split(parts)) if (part.length > 0) out.add(part);
      if (/^-[A-Za-z]./.test(token)) out.add(token.slice(2));
    }
  }
  return [...out];
}

/** The path as the filesystem knows it: symlinks followed and case as stored; a missing leaf is joined to its canonical parent. */
export function canonicalPath(path: string): string {
  try { return realpathSync.native(path); }
  catch {
    const parent = dirname(path);
    return parent === path ? path : join(canonicalPath(parent), basename(path));
  }
}

/** `item` as a POSIX path relative to the workspace by canonical location: "" for the workspace itself, null outside it. */
export function workspaceLocation(root: string, item: string): string | null {
  const rel = relative(canonicalPath(root), canonicalPath(resolve(root, item)));
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return rel.split(sep).join("/");
}

/** A bare program name is found on PATH, never in the working directory, so it names no workspace path as an argument would. */
export function isBareProgram(argv: readonly string[], candidate: string): boolean {
  return !/[\\/]/.test(candidate) && candidate !== "." && candidate !== ".." && (candidate === argv[0] || interpreterOf(candidate) !== undefined);
}

/** The hook child's PATH: absolute entries outside the workspace only, so a hook's own bare commands never resolve into it. */
export function hookChildPath(workspace: string, path: string | undefined): string {
  return (path ?? "").split(delimiter).filter(entry => entry.length > 0 && isAbsolute(entry) && workspaceLocation(workspace, entry) === null).join(delimiter);
}
