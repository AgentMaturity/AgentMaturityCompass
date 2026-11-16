/**
 * Shared rules for importing agent sessions other tools wrote (Claude Code transcripts, `codex exec --json`, ATIF).
 *
 * The file is untrusted outside text. Each line is parsed on its own and capped; a bad line is counted and skipped.
 * Nothing in the file sets a trust tier, an agent id, a session label, a hook decision or a time later than now:
 * every row is self-reported and imported, carries the source file's SHA-256 and the format name, and prompt or reply
 * text is kept as a digest unless the person asked to keep text. No path found inside a file is ever opened.
 */
import type { ProductionTrace } from "../agents/traceIngestion.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { redactDeep } from "./importRedaction.js";
import { traceTimestamp } from "./traceMapping.js";

export const SESSION_LIMITS = { maxLineBytes: 1_048_576, maxRecords: 50_000, maxKeptTextChars: 4_000, maxNameChars: 128 } as const;

export type SessionFormatName = "claude-code-transcript" | "codex-exec-json" | "atif-trajectory";

export interface SessionImportFormat {
  name: SessionFormatName;
  /** The version the file states (ATIF schema_version, Claude Code CLI version); null when it states none. */
  version: string | null;
  mappingVersion: 1;
  /** True where the format has no published specification and AMC inferred the fields. */
  experimental: boolean;
  sourceTrust: "SELF_REPORTED";
  imported: true;
  sourceSha256: string;
  textStored: "digest" | "text";
  records: { lines: number; mapped: number; malformed: number; overLong: number; skipped: number; overCap: number };
  clampedTimestamps: number;
  unknownTimestamps: number;
}

export interface SessionImportContext {
  keepText: boolean; sourceSha256: string; now: number;
  /** Secret-shaped values removed so far; detectSessionImport sets a fresh counter for each file. */
  redactions?: { count: number };
}

export interface JsonRow { line: number; value: Record<string, unknown> }

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One JSON value per line; over-long and unparseable lines are counted, never thrown. */
export function readJsonLines(text: string): { rows: JsonRow[]; lines: number; malformed: number; overLong: number; overCap: number } {
  const rows: JsonRow[] = [];
  let lines = 0, malformed = 0, overLong = 0, overCap = 0;
  for (const [index, raw] of text.split("\n").entries()) {
    const line = raw.trim();
    if (!line) continue;
    lines += 1;
    if (rows.length >= SESSION_LIMITS.maxRecords) { overCap += 1; continue; }
    if (Buffer.byteLength(line, "utf8") > SESSION_LIMITS.maxLineBytes) { overLong += 1; continue; }
    try {
      const value = JSON.parse(line) as unknown;
      if (isRecord(value)) rows.push({ line: index + 1, value }); else malformed += 1;
    } catch {
      malformed += 1;
    }
  }
  return { rows, lines, malformed, overLong, overCap };
}

/** A tool or model name from the file, cut to a short run of plain characters (no regular expression over input). */
export function plainName(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  let out = "";
  for (const char of value.slice(0, SESSION_LIMITS.maxNameChars)) {
    const code = char.charCodeAt(0);
    const plain = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || "._:-/@".includes(char);
    out += plain ? char : "_";
  }
  return out;
}

/**
 * Prompt, reply or tool text: redacted first, then a digest by default, the (capped) text only when the person asked to
 * keep text. Steps, stored rows and traces all take their text from here, so none of them holds a secret the redactor knows.
 */
export function storedText(value: unknown, ctx: SessionImportContext): unknown {
  if (value === undefined || value === null) return null;
  const redacted = redactDeep(value);
  if (ctx.redactions) ctx.redactions.count += redacted.count;
  const text = typeof redacted.value === "string" ? redacted.value : canonicalize(redacted.value);
  if (!ctx.keepText) return { sha256: sha256Hex(text), chars: text.length };
  return text.length > SESSION_LIMITS.maxKeptTextChars ? `${text.slice(0, SESSION_LIMITS.maxKeptTextChars)} [cut]` : text;
}

export function digestOf(value: unknown): string {
  return sha256Hex(canonicalize(value ?? null));
}

export function nonNegativeInt(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export interface SessionStep {
  step: number;
  kind: "tool-call" | "model-reply" | "turn";
  time: unknown;
  sessionLabel: string;
  tool?: string | null;
  model?: string | null;
  input?: unknown;
  output?: unknown;
  error?: boolean;
  /** Our own words, never text from the file. */
  errorMessage?: string;
  outcome: "completed" | "failed" | "declined" | "refused" | "unknown";
  tokens?: { input: number | null; output: number | null; cached: number | null } | null;
  stopReason?: string | null;
  callDigest?: string | null;
  /** Where the step sits in the file: the JSONL line, or the ATIF step_id. */
  sourceStep?: number | null;
}

/** Builds the traces of one session: fixed agent id, labels, clamped times, repeat counts and the ended-on-error mark. */
export function sessionTraces(format: SessionImportFormat, steps: SessionStep[], ctx: SessionImportContext,
  target: { agentId: string; source: string }): ProductionTrace[] {
  let lastCall: string | null = null, repeat = 0;
  const traces = steps.map((step) => {
    const parsed = traceTimestamp(step.time);
    const clamped = parsed !== null && parsed > ctx.now;
    if (step.kind === "tool-call" && step.callDigest) {
      repeat = step.callDigest === lastCall ? repeat + 1 : 1;
      lastCall = step.callDigest;
    } else if (step.kind === "model-reply") { lastCall = null; repeat = 0; }
    return {
      traceId: `${format.name}:${ctx.sourceSha256.slice(0, 12)}:${step.step}`,
      agentId: target.agentId,
      agentType: `imported-${format.name}`,
      input: step.input ?? null,
      output: step.output ?? null,
      durationMs: null,
      timestamp: clamped ? ctx.now : parsed,
      sessionId: step.sessionLabel,
      error: step.error === true,
      ...(step.errorMessage ? { errorMessage: step.errorMessage } : {}),
      metadata: {
        sourceTrust: "SELF_REPORTED", imported: true, sourceFormat: format.name, sourceSha256: ctx.sourceSha256, source: target.source,
        step: step.step, entryId: step.step, sourceStep: step.sourceStep ?? null, kind: step.kind, outcome: step.outcome, tool: step.tool ?? null, model: step.model ?? null,
        stopReason: step.stopReason ?? null, refusal: step.outcome === "refused", tokens: step.tokens ?? null,
        repeatCount: step.kind === "tool-call" && step.callDigest ? repeat : null, endedOnError: false,
        timeProvenance: { timestamp: clamped ? "clamped-to-import-time" : parsed !== null ? "source" : step.time == null ? "absent" : "invalid",
          duration: "absent", inferredDuration: false }
      }
    } satisfies ProductionTrace;
  });
  const last = traces.at(-1);
  if (last?.error) last.metadata.endedOnError = true;
  return traces;
}

/** The plain warnings every session import prints, in AMC's own words. */
export function sessionWarnings(format: SessionImportFormat, source: string): string[] {
  const r = format.records;
  return [
    `${source}: imported as ${format.name}${format.version ? ` ${format.version}` : ""}; every row is self-reported and was not observed by AMC.`,
    ...(format.experimental ? [`${source}: this format has no published specification; AMC inferred its fields, so this importer is experimental.`] : []),
    ...(r.malformed + r.overLong + r.overCap + r.skipped > 0
      ? [`${source}: ${r.malformed} unreadable, ${r.overLong} over-long and ${r.overCap} over-limit line(s) were skipped; ${r.skipped} record(s) had no part AMC maps.`] : []),
    ...(format.clampedTimestamps > 0 ? [`${source}: ${format.clampedTimestamps} time(s) were later than the import and were set to the import time.`] : []),
    format.textStored === "digest"
      ? `${source}: prompt, reply and tool text is kept as SHA-256 digests only, and the file itself is not kept; pass --keep-text to keep both.`
      : `${source}: prompt, reply and tool text is kept (cut at ${SESSION_LIMITS.maxKeptTextChars} characters) because --keep-text was given.`
  ];
}

export function newSessionFormat(name: SessionFormatName, version: string | null, experimental: boolean, ctx: SessionImportContext,
  counts: { lines: number; malformed: number; overLong: number; overCap: number }): SessionImportFormat {
  const records = { lines: counts.lines, mapped: 0, malformed: counts.malformed, overLong: counts.overLong, skipped: 0, overCap: counts.overCap };
  return { name, version, mappingVersion: 1, experimental, sourceTrust: "SELF_REPORTED", imported: true, sourceSha256: ctx.sourceSha256,
    textStored: ctx.keepText ? "text" : "digest", records, clampedTimestamps: 0, unknownTimestamps: 0 };
}

/** Counts the times a session's steps leave unknown, and those later than the import (which become the import time). */
export function countTimes(format: SessionImportFormat, steps: SessionStep[], now: number): SessionImportFormat {
  const times = steps.map((step) => traceTimestamp(step.time));
  return { ...format, clampedTimestamps: times.filter((time) => time !== null && time > now).length,
    unknownTimestamps: times.filter((time) => time === null).length };
}
