import { closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { redactSecrets } from "../shield/redaction/redactSecrets.js";

/**
 * Fatal process events (DXA-10). An unhandled rejection or uncaught exception leaves a bounded diagnostic with the
 * original stack, cause chain and AggregateError members, then the process exits nonzero. The failed operation is not
 * resumed. A message alone loses the cause; this keeps it, within fixed bounds, in a file only the owner can read.
 */

const MAX_FIELD_CHARS = 16_000;
const MAX_CAUSE_DEPTH = 8;
const MAX_AGGREGATE_MEMBERS = 16;
const MAX_FILE_CHARS = 64_000;

type FatalKind = "unhandledRejection" | "uncaughtException";

/** Secrets are redacted before anything is clipped or written: an error message is not a safe place for a key. */
function clip(raw: string): string {
  const text = redactSecrets(raw, (type) => `[AMC_REDACTED:${type}]`).redacted;
  return text.length <= MAX_FIELD_CHARS ? text : `${text.slice(0, MAX_FIELD_CHARS)}\n[amc: ${text.length - MAX_FIELD_CHARS} more characters]`;
}

function describeError(value: unknown, depth: number, seen: Set<unknown>): Record<string, unknown> {
  if (!(value instanceof Error)) return { value: clip(String(value)) };
  if (seen.has(value)) return { name: value.name, message: clip(value.message), circular: true };
  seen.add(value);
  const described: Record<string, unknown> = { name: value.name, message: clip(value.message), stack: clip(value.stack ?? "") };
  if (value.cause !== undefined) {
    described.cause = depth < MAX_CAUSE_DEPTH ? describeError(value.cause, depth + 1, seen) : { truncated: "cause chain deeper than the bound" };
  }
  if (value instanceof AggregateError && Array.isArray(value.errors)) {
    described.errors = value.errors.slice(0, MAX_AGGREGATE_MEMBERS).map((member: unknown) => describeError(member, depth + 1, seen));
    if (value.errors.length > MAX_AGGREGATE_MEMBERS) described.errorsOmitted = value.errors.length - MAX_AGGREGATE_MEMBERS;
  }
  return described;
}

/**
 * The workspace's `.amc/diagnostics` when the process runs in one, else a per-user temp directory. Never creates
 * `.amc`. The temp name carries the uid so users do not share one predictable path.
 */
function diagnosticsDir(cwd: string, tempBase: string): string {
  return existsSync(join(cwd, ".amc")) ? join(cwd, ".amc", "diagnostics")
    : join(tempBase, `amc-diagnostics-${process.getuid?.() ?? "user"}`);
}

/**
 * Refuse a directory someone else could have planted: it must be a real directory (not a symlink), and on POSIX
 * owned by this process's uid with mode 0700.
 */
function privateDir(dir: string): boolean {
  const stat = lstatSync(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) return false;
  const uid = process.getuid?.();
  return uid === undefined || (stat.uid === uid && (stat.mode & 0o777) === 0o700);
}

/** Write one bounded diagnostic; returns its path, or null when it was refused or failed. Never throws. */
export function writeFatalDiagnostic(kind: FatalKind, error: unknown, cwd = process.cwd(), tempBase = tmpdir()): string | null {
  try {
    const dir = diagnosticsDir(cwd, tempBase);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (!privateDir(dir)) return null;
    const at = new Date();
    const path = join(dir, `fatal-${at.toISOString().replace(/[:.]/g, "-")}-${process.pid}.json`);
    let body = JSON.stringify({ kind, at: at.toISOString(), pid: process.pid, argv0: process.argv[1] ?? null,
      node: process.version, error: describeError(error, 0, new Set()) }, null, 2);
    if (body.length > MAX_FILE_CHARS) {
      body = JSON.stringify({ kind, at: at.toISOString(), pid: process.pid, truncated: true, head: body.slice(0, MAX_FILE_CHARS) });
    }
    // O_EXCL: never reuse or truncate an existing file; O_NOFOLLOW: never write through a planted link.
    const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try {
      writeSync(fd, body);
    } finally {
      closeSync(fd);
    }
    return path;
  } catch {
    return null;
  }
}

/** Replace message-only fatal handlers: report, leave the diagnostic, exit 1. */
export function installFatalHandlers(report: (line: string) => void = (line) => process.stderr.write(`${line}\n`)): void {
  const fatal = (kind: FatalKind, error: unknown): void => {
    const path = writeFatalDiagnostic(kind, error);
    try {
      const message = redactSecrets(error instanceof Error ? error.message : String(error), (type) => `[AMC_REDACTED:${type}]`).redacted;
      report(`[AMC] ${kind === "unhandledRejection" ? "Unhandled rejection" : "Uncaught exception"}: ${message.slice(0, 2_000)}`);
      report(path === null ? "[AMC] the fatal diagnostic could not be written" : `[AMC] diagnostic: ${path}`);
    } finally {
      process.exit(1);
    }
  };
  process.on("unhandledRejection", (reason) => fatal("unhandledRejection", reason));
  process.on("uncaughtException", (error) => fatal("uncaughtException", error));
}
