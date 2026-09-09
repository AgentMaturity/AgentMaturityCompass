/**
 * Encrypted spill objects are prepared before their signed commitment and only
 * published afterward. Legacy v1 plaintext is read-only.
 *
 * Filesystem boundary: the owner controls a stable workspace and its private
 * spill directories. Each component below the workspace is checked without
 * following links; objects use exclusive creation and O_NOFOLLOW descriptor
 * reads. Node has no portable openat directory-fd API, so this does not claim
 * confinement against a process with the same uid concurrently replacing the
 * containing directory tree. Such a process already controls the workspace.
 */
import {
  closeSync, constants, fchmodSync, fstatSync, fsyncSync, lstatSync,
  mkdirSync, openSync, readSync, readdirSync, realpathSync, rmdirSync, unlinkSync, writeSync,
  type Stats
} from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { sha256Hex } from "../../utils/hash.js";
import { decryptSpillBytes, encryptSpillBytes, SPILL_ENVELOPE_OVERHEAD, SpillKeyUnavailableError, validateSpillEnvelope } from "./spillEncryption.js";
import { formatSpillLocator, isSpillRef, parseSpillLocator, type SpillRef } from "./spillTypes.js";

const SESSION_DIR_MODE = 0o700;
const OBJECT_FILE_MODE = 0o600;

export function spillRoot(workspace: string): string {
  return join(workspace, ".amc", "spill");
}

export function sessionSpillDirName(sessionId: string): string {
  return `session-${sha256Hex(Buffer.from(sessionId, "utf8"))}`;
}

/** Both commitments describe full plaintext and its encrypted representation. */
export interface SpillObject {
  readonly v: 2;
  readonly format: "amc-blob-v1";
  readonly keyVersion: number;
  readonly encodedBytes: number;
  readonly encodedSha256: string;
  readonly locator: string;
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface PreparedSpillObject {
  readonly object: SpillObject;
  /** Caller must durably sign object metadata before this publication step. */
  persist(): SpillObject;
}

function safeNameComponent(seed: string): string {
  const cleaned = seed.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 40);
  return cleaned.length > 0 ? cleaned : "output";
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

function ownerOnly(stat: Stats, directory: boolean, privateMode: boolean): void {
  if (directory ? !stat.isDirectory() : !stat.isFile()) throw new Error("spill path has an unsafe file type");
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) throw new Error("spill path is not owned by this operator");
  if ((stat.mode & (privateMode ? 0o077 : 0o022)) !== 0) throw new Error("spill path permissions allow access outside its owner boundary");
  if (!directory && stat.nlink !== 1) throw new Error("spill object has multiple hard links");
}

function sameIdentity(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameContents(left: Stats, right: Stats): boolean {
  return sameIdentity(left, right) && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

/** Canonicalize only the operator-selected workspace, never untrusted descendants. */
function storageRoot(workspace: string, root: string): { base: string; root: string } {
  const lexicalBase = resolve(workspace);
  const suffix = relative(lexicalBase, resolve(root));
  if (!suffix || suffix === ".." || suffix.startsWith(`..${sep}`) || suffix.startsWith(sep)) {
    throw new Error("spill root must be a descendant of the workspace");
  }
  const base = realpathSync(lexicalBase);
  ownerOnly(lstatSync(base), true, false);
  return { base, root: join(base, suffix) };
}

/** No recursive mkdir/chmod: an existing unsafe component is refused, not repaired. */
function checkedDirectory(workspace: string, root: string, sessionHash: string, create: boolean): string {
  const paths = storageRoot(workspace, root);
  const session = join(paths.root, `session-${sessionHash}`);
  let current = paths.base;
  for (const component of relative(paths.base, session).split(sep)) {
    current = join(current, component);
    let stat: Stats;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (!create || !isMissing(error)) throw error;
      try { mkdirSync(current, { mode: SESSION_DIR_MODE }); } catch (createError) {
        if ((createError as NodeJS.ErrnoException).code !== "EEXIST") throw createError;
      }
      stat = lstatSync(current);
    }
    ownerOnly(stat, true, current === paths.root || current === session);
  }
  return session;
}

function checkedObjectPath(workspace: string, locator: string, root: string, create: boolean): string {
  const parts = parseSpillLocator(locator);
  if (parts === null) throw new Error("invalid spill locator");
  return join(checkedDirectory(workspace, root, parts.sessionHash, create), parts.objectName);
}

function stableObject(path: string, expectedSize?: number): Stats {
  const stat = lstatSync(path);
  ownerOnly(stat, false, true);
  if (expectedSize !== undefined && stat.size !== expectedSize) throw new Error("spill object size differs from signed commitment");
  return stat;
}

function readObject(workspace: string, locator: string, expectedSize: number, root: string): Buffer {
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 0 || expectedSize > 0xffffffff + SPILL_ENVELOPE_OVERHEAD) {
    throw new Error("spill object size is unsupported");
  }
  const path = checkedObjectPath(workspace, locator, root, false);
  const before = stableObject(path, expectedSize);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = fstatSync(fd);
    ownerOnly(opened, false, true);
    if (!sameContents(before, opened)) throw new Error("spill object changed before reading");
    // Allocation and every read are bounded by authenticated reference metadata.
    const bytes = Buffer.alloc(expectedSize);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (count === 0) throw new Error("spill object was truncated while reading");
      offset += count;
    }
    const after = fstatSync(fd);
    const named = stableObject(path, expectedSize);
    if (!sameContents(opened, after) || !sameContents(after, named)) throw new Error("spill object changed while reading");
    return bytes;
  } finally {
    closeSync(fd);
  }
}

function publishObject(workspace: string, locator: string, encoded: Buffer, root: string): void {
  const path = checkedObjectPath(workspace, locator, root, true);
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, OBJECT_FILE_MODE);
  let created: Stats | undefined;
  let complete = false;
  try {
    created = fstatSync(fd);
    ownerOnly(created, false, true);
    fchmodSync(fd, OBJECT_FILE_MODE);
    let offset = 0;
    while (offset < encoded.length) {
      const count = writeSync(fd, encoded, offset, encoded.length - offset, offset);
      if (count === 0) throw new Error("spill object write made no progress");
      offset += count;
    }
    fsyncSync(fd);
    const final = fstatSync(fd);
    const named = stableObject(path, encoded.length);
    if (!sameIdentity(created, final) || !sameContents(final, named)) throw new Error("spill object changed during publication");
    // Persist the new directory entry as well as its contents.
    const parent = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { fsyncSync(parent); } finally { closeSync(parent); }
    complete = true;
  } finally {
    closeSync(fd);
    if (!complete) {
      // Remove only the inode this invocation created; never a replacement.
      try {
        const named = lstatSync(path);
        if (created && sameIdentity(created, named) && named.isFile() && named.nlink === 1) unlinkSync(path);
      } catch { /* The signed commitment remains an explicit missing object. */ }
    }
  }
}

function removeObjectAtPath(path: string): void {
  const before = stableObject(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = fstatSync(fd);
    ownerOnly(opened, false, true);
    const named = stableObject(path);
    if (!sameIdentity(before, opened) || !sameIdentity(opened, named)) throw new Error("spill object changed before erasure");
    unlinkSync(path);
    if (fstatSync(fd).nlink !== 0) throw new Error("spill object still has a retained hard link after erasure");
  } finally { closeSync(fd); }
}

export class SessionSpillStore {
  readonly workspace: string;
  readonly sessionId: string;
  readonly sessionHash: string;
  private readonly root: string;

  constructor(workspace: string, sessionId: string, root: string = spillRoot(workspace)) {
    this.workspace = workspace;
    this.sessionId = sessionId;
    this.sessionHash = sessionSpillDirName(sessionId).slice("session-".length);
    this.root = root;
  }

  /** Reads existing keys and encrypts in memory; creates no directories or files. */
  prepare(nameSeed: string, bytes: Buffer): PreparedSpillObject {
    const objectName = `${randomBytes(16).toString("hex")}-${safeNameComponent(nameSeed)}`;
    const locator = formatSpillLocator({ version: 2, sessionHash: this.sessionHash, objectName });
    const plaintext = Buffer.from(bytes);
    const { encoded, keyVersion, encodedSha256 } = encryptSpillBytes(this.workspace, locator, plaintext);
    const object: SpillObject = Object.freeze({
      v: 2, format: "amc-blob-v1", keyVersion, encodedBytes: encoded.length, encodedSha256,
      locator, path: resolveSpillPath(this.workspace, locator, this.root)!, bytes: plaintext.length, sha256: sha256Hex(plaintext)
    });
    let attempted = false;
    return Object.freeze({
      object,
      persist: (): SpillObject => {
        if (attempted) throw new Error("prepared spill publication already attempted");
        attempted = true;
        publishObject(this.workspace, locator, encoded, this.root);
        return object;
      }
    });
  }

  /** Compatibility entry point: there is deliberately no unsigned default. */
  write(nameSeed: string, bytes: Buffer, beforeWrite: (object: SpillObject) => void): SpillObject {
    if (typeof beforeWrite !== "function") throw new Error("spill write requires a signed commitment callback before publication");
    const prepared = this.prepare(nameSeed, bytes);
    const result: unknown = beforeWrite(prepared.object);
    if (result !== null && (typeof result === "object" || typeof result === "function") && "then" in result) {
      // Refuse asynchronous commitment without leaving its rejection unhandled.
      void Promise.resolve(result).catch(() => undefined);
      throw new Error("spill commitment callback must finish synchronously before publication");
    }
    return prepared.persist();
  }

  /** Explicit whole-session erasure; no recursive traversal into planted paths. */
  purge(): void {
    let session: string;
    try { session = checkedDirectory(this.workspace, this.root, this.sessionHash, false); } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    const names = readdirSync(session);
    // Refuse unsafe entries before deleting any object in this session.
    for (const name of names) {
      if (parseSpillLocator(`amc-spill:v1:${this.sessionHash}:${name}`) === null) throw new Error("invalid spill object name");
      stableObject(join(session, name));
    }
    for (const name of names) removeObjectAtPath(join(session, name));
    rmdirSync(session);
  }
}

export function resolveSpillPath(workspace: string, locator: string, root: string = spillRoot(workspace)): string | null {
  const parts = parseSpillLocator(locator);
  if (parts === null) return null;
  return join(root, `session-${parts.sessionHash}`, parts.objectName);
}

export type SpillReadStatus = "ok" | "invalid-locator" | "unretrievable" | "missing" | "tampered" | "key-unavailable";
export type SpillReadResult =
  | { readonly status: "ok"; readonly bytes: Buffer; readonly detail: null }
  | { readonly status: Exclude<SpillReadStatus, "ok">; readonly bytes: null; readonly detail: string };

function locatorMatches(ref: SpillRef): boolean {
  return ref.locator !== null && parseSpillLocator(ref.locator)?.version === ref.v;
}

/** Caller authenticates the event signature before passing its reference here. */
export function readSpilled(workspace: string, ref: SpillRef, root: string = spillRoot(workspace)): SpillReadResult {
  if (!isSpillRef(ref)) return { status: "tampered", bytes: null, detail: "invalid spill reference" };
  if (ref.locator === null) return { status: "unretrievable", bytes: null, detail: ref.unretrievable ?? "the spill store did not retain these bytes" };
  if (!locatorMatches(ref)) return { status: "invalid-locator", bytes: null, detail: "spill locator and reference version do not match" };
  try {
    const encodedSize = ref.v === 2 ? ref.encodedBytes! : ref.bytes;
    if (ref.v === 2 && encodedSize !== ref.bytes + SPILL_ENVELOPE_OVERHEAD) throw new Error("invalid signed encrypted spill size");
    const stored = readObject(workspace, ref.locator, encodedSize, root);
    const bytes = ref.v === 2 ? decryptSpillBytes(workspace, ref, stored) : stored;
    if (bytes.length !== ref.bytes || sha256Hex(bytes) !== ref.contentSha256) throw new Error("spill plaintext differs from signed commitment");
    return { status: "ok", bytes, detail: null };
  } catch (error) {
    return {
      status: error instanceof SpillKeyUnavailableError ? "key-unavailable" : isMissing(error) ? "missing" : "tampered",
      bytes: null, detail: error instanceof Error ? error.message : String(error)
    };
  }
}

export type SpillObjectInspection =
  | { readonly status: "ok"; readonly encoded: Buffer; readonly detail: null }
  | { readonly status: "missing" | "legacy-plaintext" | "tampered" | "invalid-locator" | "unretrievable"; readonly encoded: null; readonly detail: string };

/** Keyless transport verifies the signed ciphertext digest, not decryption. */
export function inspectSpillObject(workspace: string, ref: SpillRef, root: string = spillRoot(workspace)): SpillObjectInspection {
  if (!isSpillRef(ref)) return { status: "tampered", encoded: null, detail: "invalid spill reference" };
  if (ref.locator === null) return { status: "unretrievable", encoded: null, detail: ref.unretrievable ?? "spill bytes were not retained" };
  if (!locatorMatches(ref)) return { status: "invalid-locator", encoded: null, detail: "spill locator and reference version do not match" };
  if (ref.v === 1) return { status: "legacy-plaintext", encoded: null, detail: "legacy plaintext spill is excluded from encrypted transport" };
  try {
    if (ref.encodedBytes !== ref.bytes + SPILL_ENVELOPE_OVERHEAD) throw new Error("invalid signed encrypted spill size");
    const encoded = readObject(workspace, ref.locator, ref.encodedBytes!, root);
    validateSpillEnvelope(ref, encoded);
    return { status: "ok", encoded, detail: null };
  } catch (error) {
    return { status: isMissing(error) ? "missing" : "tampered", encoded: null, detail: error instanceof Error ? error.message : String(error) };
  }
}

/** The signed reference must already have been restored/authenticated by caller. */
export function restoreSpillObject(workspace: string, ref: SpillRef, encoded: Buffer, root: string = spillRoot(workspace)): void {
  if (!isSpillRef(ref) || ref.v !== 2 || !locatorMatches(ref)) throw new Error("restore requires a valid encrypted spill reference");
  const snapshot = Buffer.from(encoded);
  validateSpillEnvelope(ref, snapshot);
  publishObject(workspace, ref.locator!, snapshot, root);
}

/** Caller supplies an authenticated, explicitly selected reference for erasure. */
export function removeSpillObject(workspace: string, ref: SpillRef, root: string = spillRoot(workspace)): "removed" | "missing" {
  if (!isSpillRef(ref)) throw new Error("erasure requires a valid spill reference");
  if (ref.locator === null) return "missing";
  if (!locatorMatches(ref)) throw new Error("erasure requires a valid spill reference");
  try {
    const path = checkedObjectPath(workspace, ref.locator, root, false);
    removeObjectAtPath(path);
    return "removed";
  } catch (error) {
    if (isMissing(error)) return "missing";
    throw error;
  }
}
