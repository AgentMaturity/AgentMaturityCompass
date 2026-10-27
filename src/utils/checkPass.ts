/**
 * One check pass (P2-08 performance). Currentness gates nest: an outer gate re-runs inner gates that re-run the same
 * authority checks, so one outer gate evaluated the same keyset, signer and trust checks many times with nothing in
 * between. A function wrapped here opens a pass when it is the outermost wrapped call on the stack; inside that pass a
 * wrapped call with the same arguments that already returned is answered from the pass, unless this process wrote a file
 * since (writeFileAtomic and the contained writers end the reuse). The pass is synchronous and closes when the outermost
 * call returns or throws, so nothing survives an await, a later gate, or another operation: every outermost gate (the
 * one each caller runs before a write) reads current state again. Failures are never reused. Wrap only synchronous checks.
 */
import { readFileSync, statSync } from "node:fs";

let open: Map<Function, { args: unknown[]; writes: number; value: unknown }[]> | null = null;
let reads = new Map<string, { identity: string; writes: number; bytes: Buffer }>();
let writes = 0;

/** Called by this process's file writers: a later check in the same pass reads again. */
export function noteCheckPassWrite(): void {
  writes++;
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
    const hit = open.get(fn)?.find(row => row.writes === writes && row.args.length === args.length && row.args.every((arg, i) => sameArg(arg, args[i])));
    if (hit !== undefined) return hit.value as R;
    const before = writes, value = fn(...args);
    if (open !== null && writes === before) open.set(fn, [...(open.get(fn) ?? []), { args, writes, value }]);
    return value;
  };
}

/**
 * A file read inside a check pass: the same path with the same stat identity (dev, inode, size, mtime and ctime in
 * nanoseconds) and no write by this process since is answered with the bytes already read in this pass. Every call
 * stats the file again, so a replaced or rewritten file is read again. Outside a pass it is a plain read.
 */
export function readFileInPass(path: string): Buffer {
  if (open === null) return readFileSync(path);
  const stat = statSync(path, { bigint: true }), identity = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
  const hit = reads.get(path);
  if (hit !== undefined && hit.identity === identity && hit.writes === writes) return hit.bytes;
  const bytes = readFileSync(path);
  reads.set(path, { identity, writes, bytes });
  return bytes;
}
