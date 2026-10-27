/**
 * One check pass (P2-08 performance). Currentness gates nest: an outer gate re-runs inner gates that re-run the same
 * authority checks, so one outer gate evaluated the same keyset, signer and trust checks many times with nothing in
 * between. A function wrapped here opens a pass when it is the outermost wrapped call on the stack; inside that pass a
 * wrapped call with the same arguments that already returned is answered from the pass, unless anything that could
 * change its answer happened since: any synchronous node:fs mutation by this process (every writer, including a caller
 * callback's raw writes, is counted), a vault lock or unlock, or a change to an AMC_* environment variable. The pass
 * is synchronous and closes when the outermost call returns or throws, so nothing survives an await, a later gate, or
 * another operation: every outermost gate (the one each caller runs before a write) reads current state again.
 * Failures are never reused, and a reused value is a fresh copy, so a caller mutating it cannot change a later answer.
 * Wrap only synchronous checks.
 */
import fs, { readFileSync, statSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";

let open: Map<Function, { args: unknown[]; writes: number; value: unknown }[]> | null = null;
let reads = new Map<string, { identity: string; writes: number; bytes: Buffer }>();
let writes = 0;

/** Ends reuse in the current pass: a later check reads again. Called for state changes node:fs does not see. */
export function noteCheckPassWrite(): void {
  writes++;
}

// Count every synchronous mutation through node:fs, so a write anywhere in a pass (a caller's beforePublish hook
// included) ends reuse. Read-only opens are not counted; any other open flag is.
const MUTATORS = ["writeFileSync", "appendFileSync", "renameSync", "unlinkSync", "rmSync", "rmdirSync",
  "mkdtempSync", "symlinkSync", "linkSync", "chmodSync", "fchmodSync", "lchmodSync", "chownSync", "fchownSync",
  "lchownSync", "truncateSync", "ftruncateSync", "copyFileSync", "cpSync", "utimesSync", "futimesSync", "lutimesSync",
  "writeSync", "writevSync", "fsyncSync", "fdatasyncSync"] as const;
const mutable = fs as unknown as Record<string, unknown>;
for (const name of MUTATORS) {
  const original = mutable[name];
  if (typeof original !== "function") continue;
  mutable[name] = function (this: unknown, ...args: unknown[]) { writes++; return (original as (...a: unknown[]) => unknown).apply(this, args); };
}
// mkdirSync counts only when it creates a directory: a recursive call on an existing path (ensureDir) changes nothing.
const originalMkdirSync = fs.mkdirSync;
mutable.mkdirSync = function (this: unknown, ...args: unknown[]) {
  const created = (originalMkdirSync as (...a: unknown[]) => unknown).apply(this, args);
  const options = args[1];
  if (created !== undefined || !(typeof options === "object" && options !== null && (options as { recursive?: boolean }).recursive)) writes++;
  return created;
};
const originalOpenSync = fs.openSync;
mutable.openSync = function (this: unknown, ...args: unknown[]) {
  const flags = args[1];
  if (!(flags === undefined || flags === "r" || flags === "rs" || flags === fs.constants.O_RDONLY
    || (typeof flags === "number" && (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) === 0))) writes++;
  return (originalOpenSync as (...a: unknown[]) => unknown).apply(this, args);
};
syncBuiltinESMExports();

// An AMC_* environment change ends reuse. process.env is wrapped once so a change is counted when it is made, rather
// than scanning the environment on every wrapped call.
const counted = (key: string | symbol): boolean => typeof key === "string" && key.startsWith("AMC_");
process.env = new Proxy(process.env, {
  set(target, key, value) { if (counted(key)) writes++; return Reflect.set(target, key, value); },
  deleteProperty(target, key) { if (counted(key)) writes++; return Reflect.deleteProperty(target, key); },
  defineProperty(target, key, descriptor) { if (counted(key)) writes++; return Reflect.defineProperty(target, key, descriptor); }
});

/** A private copy, or undefined when the value cannot be copied (then it is not reused). */
function copyOf(value: unknown): { value: unknown } | undefined {
  if (value === undefined || value === null || typeof value !== "object") return { value };
  try { return { value: structuredClone(value) }; } catch { return undefined; }
}

function sameArg(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  // Bytes compare by content: a check over the same bytes read again is the same check.
  if (a instanceof Uint8Array && b instanceof Uint8Array) return Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(b);
  if (Object.getPrototypeOf(a) !== Object.prototype || Object.getPrototypeOf(b) !== Object.prototype) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}

export function inCheckPass<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  return (...args: A): R => {
    if (open === null) {
      open = new Map();
      try { return fn(...args); } finally { open = null; reads = new Map(); }
    }
    const hit = open.get(fn)?.find(row => row.writes === writes && row.args.length === args.length
      && row.args.every((arg, i) => sameArg(arg, args[i])));
    if (hit !== undefined) { const copy = copyOf(hit.value); if (copy !== undefined) return copy.value as R; }
    const before = writes, value = fn(...args);
    const stored = copyOf(value);
    if (open !== null && writes === before && stored !== undefined)
      open.set(fn, [...(open.get(fn) ?? []), { args: [...args], writes, value: stored.value }]);
    return value;
  };
}

/**
 * A file read inside a check pass: the same path with the same stat identity (dev, inode, size, mtime and ctime in
 * nanoseconds) and no write by this process since is answered with a copy of the bytes already read in this pass. Every
 * call stats the file again, so a replaced or rewritten file is read again. Outside a pass it is a plain read.
 */
export function readFileInPass(path: string): Buffer {
  if (open === null) return readFileSync(path);
  const stat = statSync(path, { bigint: true }), identity = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
  const hit = reads.get(path);
  if (hit !== undefined && hit.identity === identity && hit.writes === writes) return Buffer.from(hit.bytes);
  const bytes = readFileSync(path);
  reads.set(path, { identity, writes, bytes: Buffer.from(bytes) });
  return bytes;
}
