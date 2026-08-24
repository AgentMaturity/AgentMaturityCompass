/**
 * The spill store: session-scoped 0600 files, and the read path that checks
 * them against the signed commitment before returning a byte.
 *
 * Three properties are load-bearing here, and each is enforced rather than
 * documented:
 *
 * 1. **Session scoping.** Objects live under `.amc/spill/session-<sha256(id)>`.
 *    The directory is named by a hash rather than the raw session id because
 *    the id is a caller-supplied string that would otherwise become a path
 *    component, and because a directory listing should not enumerate live
 *    session identifiers to anything that can read the workspace root.
 *
 * 2. **Least privilege.** The session directory is 0700 and every object 0600,
 *    re-applied with `chmod` after creation because `mkdir`/`open` modes are
 *    masked by the process umask and a permissive umask would otherwise
 *    silently widen them. Tool output is the most sensitive material the
 *    harness handles — it is whatever the agent just read — so it does not get
 *    default file modes.
 *
 * 3. **No overwrite, no symlink.** Objects are created with `O_CREAT|O_EXCL`
 *    (`flag: "wx"`), which fails rather than following an existing name — so a
 *    pre-planted symlink cannot redirect a write out of the directory. Reads
 *    require a regular file, so one cannot redirect a read either.
 *
 * The read path deliberately returns a STATUS rather than throwing for every
 * unhappy case, because "the file is gone" and "the file no longer matches what
 * was signed" are different facts: the first is what retention looks like, the
 * second is what tampering looks like, and a verifier that collapsed them would
 * report a purge as an attack (or, worse, the reverse).
 */
import { chmodSync, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, rmSync, writeSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Hex } from "../../utils/hash.js";
import {
  formatSpillLocator,
  parseSpillLocator,
  type SpillRef
} from "./spillTypes.js";

/** Directory mode for a session's spill directory. Owner-only, no exceptions. */
const SESSION_DIR_MODE = 0o700;
/** File mode for a spilled object. */
const OBJECT_FILE_MODE = 0o600;

/** The workspace-wide spill root. One directory per session lives beneath it. */
export function spillRoot(workspace: string): string {
  return join(workspace, ".amc", "spill");
}

/** The directory name for a session, derived from its id rather than being it. */
export function sessionSpillDirName(sessionId: string): string {
  return `session-${sha256Hex(Buffer.from(sessionId, "utf8"))}`;
}

/** What a successful write produced. `sha256` is over the bytes as written. */
export interface SpillObject {
  readonly locator: string;
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

/**
 * Turn an arbitrary caller-supplied label into a filename component.
 *
 * The label is model-influenced (it is derived from a tool call id), so it is
 * mapped onto `[A-Za-z0-9._-]` and truncated rather than validated: the object
 * name is always prefixed by 32 random hex characters, so the label affects
 * only readability, never uniqueness and never location.
 */
function safeNameComponent(seed: string): string {
  const cleaned = seed.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 40);
  return cleaned.length > 0 ? cleaned : "output";
}

/**
 * One session's writer. Created by the session's SessionService, which is the
 * single writer for that session's spine and therefore for its spill objects.
 */
export class SessionSpillStore {
  readonly workspace: string;
  readonly sessionId: string;
  readonly sessionHash: string;
  private readonly sessionDir: string;

  constructor(workspace: string, sessionId: string, root: string = spillRoot(workspace)) {
    this.workspace = workspace;
    this.sessionId = sessionId;
    const dirName = sessionSpillDirName(sessionId);
    this.sessionHash = dirName.slice("session-".length);
    this.sessionDir = join(root, dirName);
  }

  /**
   * Write one object and return its locator.
   *
   * Throws on any filesystem failure. The caller (the spill policy) converts
   * that into a recorded `unretrievable` reason rather than into a failed tool
   * call — see spillPolicy.ts — so the throw here stays specific and the
   * degradation decision stays in one place.
   */
  write(nameSeed: string, bytes: Buffer): SpillObject {
    mkdirSync(this.sessionDir, { recursive: true, mode: SESSION_DIR_MODE });
    // Re-assert the mode: `mkdir`'s is masked by umask, and on an existing
    // directory it is not applied at all.
    chmodSync(this.sessionDir, SESSION_DIR_MODE);

    const objectName = `${randomBytes(16).toString("hex")}-${safeNameComponent(nameSeed)}`;
    const path = join(this.sessionDir, objectName);
    // "wx" is O_CREAT|O_EXCL: it fails on an existing name, symlink included.
    const fd = openSync(path, "wx", OBJECT_FILE_MODE);
    try {
      writeSync(fd, bytes);
      // The commitment is already durable by the time the event commits; fsync
      // here so the bytes it commits to are durable too, rather than leaving the
      // retrievable half of the pair to the page cache.
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    chmodSync(path, OBJECT_FILE_MODE);

    return {
      locator: formatSpillLocator({ sessionHash: this.sessionHash, objectName }),
      path,
      bytes: bytes.byteLength,
      sha256: sha256Hex(bytes)
    };
  }

  /**
   * Remove this session's spill directory and everything in it.
   *
   * NOT called at session close, and deliberately so: the signed log keeps
   * referring to these objects for as long as it exists, so closing a session
   * and destroying its retrievable output are different decisions. This is the
   * hook a retention policy calls, and after it the affected rows verify as
   * `missing` — a recorded gap, never a silent one.
   */
  purge(): void {
    rmSync(this.sessionDir, { recursive: true, force: true });
  }
}

/**
 * Resolve a locator to a path, or null if it is not a locator at all.
 *
 * Deliberately takes only the workspace: a locator carries its own session
 * hash, so retrieval — including retrieval by a verifier that never opened the
 * session — needs no session id and cannot be pointed at the wrong session's
 * directory by supplying one.
 */
export function resolveSpillPath(workspace: string, locator: string, root: string = spillRoot(workspace)): string | null {
  const parts = parseSpillLocator(locator);
  if (parts === null) {
    return null;
  }
  return join(root, `session-${parts.sessionHash}`, parts.objectName);
}

export type SpillReadStatus = "ok" | "invalid-locator" | "unretrievable" | "missing" | "tampered";

export type SpillReadResult =
  | { readonly status: "ok"; readonly bytes: Buffer; readonly detail: null }
  | { readonly status: Exclude<SpillReadStatus, "ok">; readonly bytes: null; readonly detail: string };

/**
 * Read spilled bytes back and hold them to the ref that was signed.
 *
 * The ref is the authority for all three checks — length, regular-file-ness,
 * and content hash — and the ref only reaches this function from a row whose
 * `event_hash` and `writer_sig` the caller has verified (spillEvidence.ts does
 * exactly that). The length check is not redundant with the hash check: it
 * rejects a file that has been inflated, before reading it, so a hostile
 * workspace cannot turn a retrieval into an out-of-memory.
 */
export function readSpilled(
  workspace: string,
  ref: SpillRef,
  root: string = spillRoot(workspace)
): SpillReadResult {
  if (ref.locator === null) {
    return {
      status: "unretrievable",
      bytes: null,
      detail: ref.unretrievable ?? "the spill store did not retain these bytes"
    };
  }
  const path = resolveSpillPath(workspace, ref.locator, root);
  if (path === null) {
    return { status: "invalid-locator", bytes: null, detail: `not a spill locator: ${ref.locator}` };
  }

  let size: number;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile()) {
      // lstat does not follow links, so a symlink lands here rather than being
      // read through — a swapped object cannot redirect the read.
      return { status: "tampered", bytes: null, detail: `spill object is not a regular file: ${ref.locator}` };
    }
    size = stat.size;
  } catch {
    return { status: "missing", bytes: null, detail: `spill object not found: ${ref.locator}` };
  }

  if (size !== ref.bytes) {
    return {
      status: "tampered",
      bytes: null,
      detail: `spill object is ${size} bytes, the signed event committed to ${ref.bytes}`
    };
  }

  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    return { status: "missing", bytes: null, detail: `spill object could not be read: ${ref.locator}` };
  }

  const actual = sha256Hex(bytes);
  if (actual !== ref.contentSha256) {
    return {
      status: "tampered",
      bytes: null,
      detail:
        `spill object hashes to ${actual.slice(0, 16)}… but the signed event committed to ` +
        `${ref.contentSha256.slice(0, 16)}…`
    };
  }
  return { status: "ok", bytes, detail: null };
}
