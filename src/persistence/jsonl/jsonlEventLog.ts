/**
 * File mechanics for the JSONL session-event backend.
 *
 * Kept separate from the backend itself so the backend reads as "build a signed
 * row, then append it" and the awkward parts — the single-writer lock, the
 * O(1) chain-head read, the fail-loud parse — are reviewable on their own.
 *
 * Three decisions worth the ink:
 *
 * 1. Appends use a held `O_APPEND` descriptor and `writeSync`, NOT the
 *    read-whole-file-then-rewrite shape `appendBlobIndexRow` uses. That shape
 *    is O(n) bytes per event, which is the O(n²) the P2.2 orchestrator had just
 *    finished removing from the blob index; copying it here would have put it
 *    straight back. The chain head comes from the last line only, for the same
 *    reason.
 *
 * 2. A malformed line THROWS rather than being skipped. A JSONL log's failure
 *    mode is a torn tail after a power cut or an edit by hand, and both are
 *    findings. Skipping them would make the log quietly shorter than it is,
 *    which is precisely the class of swallowed failure the plan flags elsewhere.
 *
 * 3. Rows are serialised with an explicit, fixed key order and `meta_json` is
 *    stored as the exact string that was hashed. Nothing round-trips through a
 *    schema library on the way in or out: zod's `.parse` reorders keys to schema
 *    order, and `sanitizeMetaForHash` re-stringifies meta in insertion order, so
 *    a reordering read/write would silently break every `event_hash`.
 */
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import type { EvidenceEvent } from "../../types.js";
import { ensureDir, pathExists, readUtf8 } from "../../utils/fs.js";
export { JsonlWriterLock } from "./jsonlWriterLock.js";

export function jsonlRoot(workspace: string): string {
  return join(workspace, ".amc", "jsonl");
}

export function jsonlEventsPath(workspace: string): string {
  return join(jsonlRoot(workspace), "events.jsonl");
}

export function jsonlSessionsPath(workspace: string): string {
  return join(jsonlRoot(workspace), "sessions.jsonl");
}

export function jsonlLockPath(workspace: string): string {
  return join(jsonlRoot(workspace), "writer.lock");
}

/**
 * The stored column order. Identical to the SQLite table's column order so a
 * line and a row are trivially comparable by eye during a dual-write parity
 * check, and so the retention archive's `JSON.stringify(row)` segments stay
 * readable by the same code.
 */
const EVENT_COLUMNS = [
  "id",
  "ts",
  "session_id",
  "runtime",
  "event_type",
  "payload_path",
  "payload_inline",
  "payload_sha256",
  "meta_json",
  "prev_event_hash",
  "event_hash",
  "writer_sig",
  "canonical_payload_path",
  "canonical_payload_inline",
  "blob_ref",
  "archived",
  "archive_segment_id",
  "archive_manifest_sha256",
  "payload_pruned",
  "payload_pruned_ts"
] as const;

/** Serialise a row in the fixed column order. Undefined fields become null. */
export function serializeEventRow(row: EvidenceEvent): string {
  const source = row as unknown as Record<string, unknown>;
  const ordered: Record<string, unknown> = {};
  for (const column of EVENT_COLUMNS) {
    ordered[column] = source[column] ?? null;
  }
  return JSON.stringify(ordered);
}

function requireString(source: Record<string, unknown>, key: string, line: number): string {
  const value = source[key];
  if (typeof value !== "string") {
    throw new Error(`jsonl event log line ${line}: field ${key} is not a string`);
  }
  return value;
}

function optionalString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  if (value !== undefined && value !== null && typeof value !== "string") throw new Error(`jsonl event log: invalid ${key}`);
  return (value as string | null | undefined) ?? null;
}

function optionalNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  if (value !== undefined && value !== null && (typeof value !== "number" || !Number.isSafeInteger(value))) throw new Error(`jsonl event log: invalid ${key}`);
  return (value as number | null | undefined) ?? null;
}

/**
 * Parse one stored line into an EvidenceEvent.
 *
 * Field-by-field rather than a cast: a line is untrusted input (anyone with
 * workspace write access can edit it), and a cast would let a row with a
 * missing `writer_sig` reach the verifier as `undefined` and compare unequal
 * instead of being reported as malformed.
 */
export function parseEventLine(text: string, line: number): EvidenceEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`jsonl event log line ${line}: not valid JSON`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`jsonl event log line ${line}: not a JSON object`);
  }
  const source = parsed as Record<string, unknown>;
  const ts = source["ts"];
  if (typeof ts !== "number" || !Number.isSafeInteger(ts) || ts < 0) {
    throw new Error(`jsonl event log line ${line}: field ts is not a number`);
  }
  for (const field of ["archived", "payload_pruned"]) {
    if (source[field] !== undefined && source[field] !== null && source[field] !== 0 && source[field] !== 1) {
      throw new Error(`jsonl event log line ${line}: unsupported ${field} state`);
    }
  }
  return {
    id: requireString(source, "id", line),
    ts,
    session_id: requireString(source, "session_id", line),
    runtime: requireString(source, "runtime", line) as EvidenceEvent["runtime"],
    event_type: requireString(source, "event_type", line) as EvidenceEvent["event_type"],
    payload_path: optionalString(source, "payload_path"),
    payload_inline: optionalString(source, "payload_inline"),
    payload_sha256: requireString(source, "payload_sha256", line),
    meta_json: requireString(source, "meta_json", line),
    prev_event_hash: requireString(source, "prev_event_hash", line),
    event_hash: requireString(source, "event_hash", line),
    writer_sig: requireString(source, "writer_sig", line),
    canonical_payload_path: optionalString(source, "canonical_payload_path"),
    canonical_payload_inline: optionalString(source, "canonical_payload_inline"),
    blob_ref: optionalString(source, "blob_ref"),
    archived: optionalNumber(source, "archived") ?? 0,
    archive_segment_id: optionalString(source, "archive_segment_id"),
    archive_manifest_sha256: optionalString(source, "archive_manifest_sha256"),
    payload_pruned: optionalNumber(source, "payload_pruned") ?? 0,
    payload_pruned_ts: optionalNumber(source, "payload_pruned_ts")
  };
}

function splitLines(text: string): string[] {
  return text.split("\n").filter((line) => line.trim().length > 0);
}

/** Every event in the log, in append order. Throws on a malformed line. */
export function readEventRows(workspace: string): EvidenceEvent[] {
  const path = jsonlEventsPath(workspace);
  if (!pathExists(path)) {
    return [];
  }
  return splitLines(readUtf8(path)).map((line, index) => parseEventLine(line, index + 1));
}

/**
 * The `event_hash` of the last row, or null for an empty log.
 *
 * Reads only the final line. The append path needs exactly this one value to
 * chain the next row, and materialising the whole log per append would make a
 * session O(n²) in its own length.
 */
export function lastEventHash(workspace: string): string | null {
  const path = jsonlEventsPath(workspace);
  if (!pathExists(path)) {
    return null;
  }
  const text = readUtf8(path);
  let end = text.length;
  while (end > 0 && (text[end - 1] === "\n" || text[end - 1] === "\r")) {
    end -= 1;
  }
  if (end === 0) {
    return null;
  }
  const start = text.lastIndexOf("\n", end - 1) + 1;
  return parseEventLine(text.slice(start, end), -1).event_hash;
}

/**
 * An append-only file held open in O_APPEND mode for the writer's lifetime.
 *
 * `fsync` runs on every append, matching the ledger's `synchronous = FULL`
 * default (which also fsyncs per commit). It is NOT `F_FULLFSYNC`: Node exposes
 * no binding for it, so on macOS/APFS neither this nor the SQLite default
 * flushes the drive's write cache. See the backend header for what that means
 * for the declared `powerLossDurable` capability.
 */
export class AppendOnlyFile {
  private fd: number | null;
  private readonly identity: { dev: number; ino: number };
  private size: number;
  private failed = false;

  constructor(private readonly path: string) {
    ensureDir(join(path, ".."));
    // An unterminated row must not be glued to the next row. A torn tail is
    // evidence, not permission to truncate or silently repair history.
    if (pathExists(path)) {
      const info = lstatSync(path);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error("unsafe JSONL append path");
      const bytes = readFileSync(path);
      if (bytes.length && bytes[bytes.length - 1] !== 10) throw new Error("JSONL history has an unterminated tail; restore the original complete evidence before writing");
    }
    this.fd = openSync(path, constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    const info = fstatSync(this.fd);
    this.identity = { dev: info.dev, ino: info.ino };
    this.size = info.size;
  }

  appendLine(line: string): void {
    if (this.fd === null || this.failed) {
      throw new Error(`append after close: ${this.path}`);
    }
    const current = lstatSync(this.path);
    if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1
      || current.dev !== this.identity.dev || current.ino !== this.identity.ino || current.size !== this.size) {
      this.failed = true;
      throw new Error("JSONL append target changed; no bytes were appended");
    }
    const bytes = Buffer.from(`${line}\n`, "utf8");
    try {
      let offset = 0;
      while (offset < bytes.length) {
        const written = writeSync(this.fd, bytes, offset, bytes.length - offset);
        if (written <= 0) throw new Error("JSONL append made no progress");
        offset += written;
      }
      fsyncSync(this.fd);
      this.size += bytes.length;
    } catch (error) {
      // A partial write or uncertain fsync cannot be retried under the old head.
      // Keep the bytes and require a new authenticated recovery boundary.
      this.failed = true;
      throw error;
    }
  }

  close(): void {
    if (this.fd === null) {
      return;
    }
    closeSync(this.fd);
    this.fd = null;
  }
}
