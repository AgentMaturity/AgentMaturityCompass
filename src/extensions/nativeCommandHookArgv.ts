import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { basename, delimiter, isAbsolute, join, normalize, relative, sep } from "node:path";

const INTERPRETER = /^(?:node(?:js)?|python|pypy|ruby|perl|sh|bash|zsh|dash|ksh)(?:\d+(?:\.\d+)*)?$/;
const LAUNCHERS = new Set([
  "env", "nice", "timeout", "sudo", "doas", "su", "nohup", "setsid", "xargs", "busybox",
  "bun", "tsx", "ts-node", "esno", "deno", "mksh", "fish", "tcsh", "csh", "php", "lua", "luajit",
  "osascript", "rscript", "julia", "pwsh", "powershell", "cmd", "awk", "gawk", "mawk", "sed", "jq"
]);
const PROCESS_PATH = /^\/(?:proc(?:\/|$)|dev\/(?:fd(?:\/|$)|std(?:in|out|err)$))/;
const PLAIN_SEGMENT = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,255}$/;
const PLAIN_ARG = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const nameOf = (program: string): string => basename(program).toLowerCase().replace(/\.exe$/, "");
const isInterpreter = (program: string): boolean => INTERPRETER.test(nameOf(program));

/** The only command shapes: one external executable, or a known interpreter with a bound script and plain arguments. */
export function hookArgvRefusal(event: string, argv: readonly string[], hooksDir: string): string | undefined {
  const program = argv[0]!;
  const refusal = (reason: string): string => `A ${event} hook ${reason}`;
  if (argv.some(part => part.includes("\0")) || PROCESS_PATH.test(program)) return refusal("contains an unsafe program or argument.");
  if (LAUNCHERS.has(nameOf(program))) return refusal("cannot run a wrapper or an unsupported interpreter.");
  if (isInterpreter(program)) {
    if (!isAbsolute(program) && nameOf(program) !== program.toLowerCase().replace(/\.exe$/, "")) return refusal("must name the interpreter directly, without a relative path.");
    const script = argv[1];
    if (script === undefined || !script.startsWith(`${hooksDir}/`) || !script.slice(hooksDir.length + 1).split("/").every(part => PLAIN_SEGMENT.test(part))) {
      return refusal(`must give the interpreter one exact ${hooksDir}/ file as its first argument, without interpreter flags.`);
    }
    if (!argv.slice(2).every(arg => PLAIN_ARG.test(arg))) return refusal("takes plain arguments after the script. Flags, paths and assignments are refused.");
    return undefined;
  }
  if (!isAbsolute(program) || argv.length !== 1) return refusal("must name one absolute external executable without arguments, or a supported interpreter with a bound script.");
  return undefined;
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** Check both the operator's spelling and its resolved location, then use only the resolved path. */
export function outsideHookWorkspace(workspace: string, path: string): string | null {
  if (!isAbsolute(path) || normalize(path) !== path || PROCESS_PATH.test(path)) return null;
  const root = realpathSync.native(workspace), actual = realpathSync.native(path);
  return inside(workspace, path) || inside(root, path) || inside(root, actual) || PROCESS_PATH.test(actual) ? null : actual;
}

/** Bare names are reserved for supported interpreters and looked up only in absolute, external PATH directories. */
export function resolveHookProgram(program: string, workspace: string): string {
  const interpreter = isInterpreter(program);
  const checked = (path: string): string => {
    const actual = outsideHookWorkspace(workspace, path);
    if (actual === null) throw new Error("hook program must be an absolute executable outside the workspace");
    if (interpreter !== isInterpreter(actual) || LAUNCHERS.has(nameOf(actual))) throw new Error("hook program resolves to a different command type, a wrapper or an unsupported interpreter");
    if (!statSync(actual).isFile()) throw new Error("hook program is not a regular file");
    accessSync(actual, constants.X_OK);
    return actual;
  };
  if (isAbsolute(program)) return checked(program);
  for (const dir of hookChildPath(workspace, process.env.PATH).split(delimiter).filter(Boolean)) {
    const candidate = join(dir, process.platform === "win32" && !program.toLowerCase().endsWith(".exe") ? `${program}.exe` : program);
    try { return checked(candidate); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  throw new Error(`hook interpreter ${program} was not found on PATH outside the workspace`);
}

/** Canonical absolute PATH directories outside the workspace, for lookup and for the hook child. */
export function hookChildPath(workspace: string, path: string | undefined): string {
  return (path ?? "").split(delimiter).flatMap(entry => {
    try {
      const actual = outsideHookWorkspace(workspace, entry);
      return actual !== null && statSync(actual).isDirectory() ? [actual] : [];
    } catch { return []; }
  }).join(delimiter);
}
