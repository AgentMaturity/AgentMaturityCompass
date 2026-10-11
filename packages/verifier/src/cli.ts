/**
 * amc-verify verify <artifact> --trust-list <file>... --trust-root <sha256>... [--root-threshold <n>] [--as-of <RFC 3339>]
 *   [--expect-tenant|--expect-deployment|--expect-subject|--expect-profile <id>] [--known-sequence <id>=<n>]...
 *   [--evidence-dir <dir>] [--json]
 * Exit codes: 0 every dimension passes; 1 any fails; 3 none fails, some not evaluated; 64 usage error. There is no flag
 * that admits an unpinned issuer.
 */
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parseJson, sha256Hex } from "./bytes.js";
import { DIMENSIONS } from "./codes.js";
import { exitCode, VERIFIER_NAME, VERIFIER_VERSION, type VerifierReport } from "./report.js";
import { verifyArtifact } from "./verify.js";

const USAGE = `usage: amc-verify verify <artifact> [--trust-list <file>]... [--trust-root <sha256>]... [--root-threshold <n>] [--as-of <RFC 3339>]
  [--expect-tenant <id>] [--expect-deployment <id>] [--expect-subject <id>] [--expect-profile <id>]
  [--known-sequence <id>=<n>]... [--evidence-dir <dir>] [--json]
       amc-verify --version
exit codes: 0 all six dimensions pass; 1 any fails; 3 none fails but one is not evaluated; 64 usage error`;

const MiB = 1024 * 1024;
const LIMITS = { artifact: 16 * MiB, trustList: MiB, evidence: 64 * MiB, evidenceFiles: 4096, evidenceTotal: 256 * MiB };

class UsageError extends Error {}

/** A regular file of at most `limit` bytes, read without following a final symlink, unchanged while read. */
function readBounded(path: string, limit: number): Buffer {
  let fd: number;
  try {
    // O_NONBLOCK: opening a FIFO must not wait for a writer; it is then refused as not a regular file.
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    throw new UsageError(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size > limit) throw new UsageError(`${path}: not a regular file of at most ${limit} bytes`);
    const buffer = Buffer.alloc(before.size + 1);
    let count = 0;
    while (count < buffer.length) {
      const read = readSync(fd, buffer, count, buffer.length - count, null);
      if (read === 0) break;
      count += read;
    }
    if (count !== before.size || fstatSync(fd).size !== before.size) throw new UsageError(`${path}: changed while being read`);
    return buffer.subarray(0, count);
  } finally {
    closeSync(fd);
  }
}

function readEvidenceDir(dir: string): Map<string, Uint8Array> {
  let names: string[];
  try {
    names = readdirSync(dir).sort();
  } catch (error) {
    throw new UsageError(`--evidence-dir ${dir}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (names.length > LIMITS.evidenceFiles) throw new UsageError(`--evidence-dir ${dir}: more than ${LIMITS.evidenceFiles} files`);
  const evidence = new Map<string, Uint8Array>();
  let total = 0;
  for (const name of names) {
    const path = join(dir, name);
    let regular = false;
    try { regular = lstatSync(path).isFile(); } catch { /* refused below */ }
    if (!regular) throw new UsageError(`--evidence-dir ${dir}: ${name} is not a regular file`);
    // Items are addressed by the sha256 of their bytes; file names are ignored.
    const bytes = readBounded(path, LIMITS.evidence);
    total += bytes.length;
    if (total > LIMITS.evidenceTotal) throw new UsageError(`--evidence-dir ${dir}: more than ${LIMITS.evidenceTotal} bytes in all`);
    evidence.set(sha256Hex(bytes), bytes);
  }
  return evidence;
}

const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

/** An RFC 3339 time whose date is a real calendar date (Date would roll 2026-02-30 over to March). */
function rfc3339(text: string): Date | null {
  const match = RFC3339.exec(text);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const calendar = new Date(Date.UTC(year, month - 1, day));
  const date = new Date(text);
  return calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day && !Number.isNaN(date.getTime()) ? date : null;
}

function single(values: string[] | undefined, flag: string): string | undefined {
  if (values && values.length > 1) throw new UsageError(`${flag} may be given once`);
  if (values?.[0] === "") throw new UsageError(`${flag} needs a value`);
  return values?.[0];
}

function options(args: string[]) {
  const many = { type: "string", multiple: true } as const;
  const { values, positionals } = parseArgs({
    args, allowPositionals: true, strict: true,
    options: {
      "trust-list": many, "trust-root": many, "root-threshold": many, "as-of": many, "expect-tenant": many, "expect-deployment": many, "expect-subject": many,
      "expect-profile": many, "known-sequence": many, "evidence-dir": many, json: { type: "boolean" }
    }
  });
  if (positionals.length !== 2 || positionals[0] !== "verify") throw new UsageError("expected: verify <artifact>");
  const asOfText = single(values["as-of"], "--as-of");
  const asOf = asOfText === undefined ? undefined : rfc3339(asOfText) ?? undefined;
  if (asOfText !== undefined && asOf === undefined) throw new UsageError(`--as-of ${asOfText} is not an RFC 3339 time`);
  const trustRoots = (values["trust-root"] ?? []).map(root => {
    if (!/^[0-9a-fA-F]{64}$/.test(root)) throw new UsageError(`--trust-root ${root} is not a 64 hex sha256 key id`);
    return root.toLowerCase();
  });
  const thresholdText = single(values["root-threshold"], "--root-threshold");
  const rootThreshold = thresholdText === undefined ? undefined : Number(thresholdText);
  if (thresholdText !== undefined && (!/^[1-9][0-9]{0,1}$/.test(thresholdText) || rootThreshold! > new Set(trustRoots).size)) {
    throw new UsageError(`--root-threshold ${thresholdText} must be from 1 to the number of --trust-root keys`);
  }
  // No prototype: an id such as "__proto__" is an ordinary key.
  const knownSequences = Object.create(null) as Record<string, number>;
  for (const pair of values["known-sequence"] ?? []) {
    const at = pair.lastIndexOf("=");
    const id = pair.slice(0, at);
    const sequence = pair.slice(at + 1);
    if (at <= 0 || !/^(0|[1-9][0-9]{0,15})$/.test(sequence) || !Number.isSafeInteger(Number(sequence))) throw new UsageError(`--known-sequence ${pair} is not <id>=<n>`);
    if (Object.hasOwn(knownSequences, id)) throw new UsageError(`--known-sequence ${id} is given twice`);
    knownSequences[id] = Number(sequence);
  }
  const trustLists = (values["trust-list"] ?? []).map(path => {
    try {
      return parseJson(readBounded(path, LIMITS.trustList));
    } catch (error) {
      throw new UsageError(`--trust-list ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  const expectScope = Object.fromEntries((["tenant", "deployment", "subject", "profile"] as const)
    .map(key => [key, single(values[`expect-${key}`], `--expect-${key}`)]).filter(([, value]) => value !== undefined));
  const evidenceDir = single(values["evidence-dir"], "--evidence-dir");
  const path = positionals[1]!;
  return {
    path, json: values.json === true, bytes: readBounded(path, LIMITS.artifact),
    verify: { trustLists, trustRoots, rootThreshold, asOf, expectScope, knownSequences, evidence: evidenceDir === undefined ? undefined : readEvidenceDir(evidenceDir), path }
  };
}

function human(report: VerifierReport): string {
  const lines = [`amc-verify: ${report.artifact.kind} ${report.artifact.path} (as of ${report.asOf})`];
  for (const dimension of DIMENSIONS) {
    const codes = report.reasonCodes[dimension];
    lines.push(`  ${dimension.padEnd(16)} ${report[dimension].status.padEnd(14)} ${codes.join(", ")}`.trimEnd());
  }
  if (report.anchoring.status !== "not-applicable") lines.push(`  anchoring        ${report.anchoring.status}`);
  for (const warning of report.warnings) lines.push(`  warning: ${warning}`);
  lines.push("  A signed record proves who wrote it and that it is unchanged, not that its statement is true.");
  return lines.join("\n");
}

/** Runs the CLI and returns its exit code. */
export function main(args: string[]): number {
  if (args.length === 1 && args[0] === "--version") {
    process.stdout.write(`${VERIFIER_NAME}@${VERIFIER_VERSION}\n`);
    return 0;
  }
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  let parsed: ReturnType<typeof options>;
  try {
    parsed = options(args);
  } catch (error) {
    process.stderr.write(`amc-verify: ${error instanceof Error ? error.message : String(error)}\n${USAGE}\n`);
    return 64;
  }
  const report = verifyArtifact(parsed.bytes, parsed.verify);
  process.stdout.write(`${parsed.json ? JSON.stringify(report, null, 2) : human(report)}\n`);
  return exitCode(report);
}
