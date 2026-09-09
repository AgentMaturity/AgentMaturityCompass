#!/usr/bin/env node
// Local intake only: declarations and matching file bytes do not authenticate humans.
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, realpath, stat } from "node:fs/promises";
import { arch, platform } from "node:os";
import { isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";

export const SCHEMA_VERSION = "2026-09-09";
export const MIN_HUMAN_SESSIONS_PER_HARNESS = 5; // Standing target, not a collected sample.
export const COMMON_TASK = "Draft three acceptance tests for a CLI that imports JSONL, rejects malformed records, and reports partial failures.";
export const COMMON_PROTOCOL = Object.freeze({
  id: "amc-human-first-use", version: "1", taskId: "jsonl-acceptance-tests", taskVersion: "1",
  taskSha256: createHash("sha256").update(COMMON_TASK, "utf8").digest("hex")
});
const HARNESSES = ["amc", "dsh", "pi"];
const MAX_SESSIONS = 2000;
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const MAX_RECORDING_BYTES = 8 * 1024 ** 3;
const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const HASH = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const OUTCOMES = ["completed", "failed", "incomplete"];
const PARTICIPATION = ["human-declared", "automated-fixture"];
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const time = value => typeof value === "string" ? Date.parse(value) : Number.NaN;
const issue = (path, code, message, kind = "invalid") => ({ path, code, message, kind });

function validator(errors) {
  const add = (path, code, message, kind) => errors.push(issue(path, code, message, kind));
  const missing = (value, path) => {
    if (value !== undefined && value !== null) return false;
    add(path, "required", "Required evidence is missing.", "missing-evidence");
    return true;
  };
  const object = (value, path, keys) => {
    if (missing(value, path)) return false;
    if (!isObject(value)) { add(path, "type", "Expected an object."); return false; }
    if (Object.keys(value).some(key => !keys.includes(key))) {
      // Do not echo an untrusted key: it could itself contain a secret.
      add(path, "unknown-field", "Unknown fields are not permitted by this schema.");
    }
    for (const key of keys) if (!Object.hasOwn(value, key)) missing(undefined, `${path}.${key}`);
    return true;
  };
  const text = (value, path, pattern, max = 2048) => {
    if (missing(value, path)) return false;
    if (typeof value !== "string" || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)
      || (pattern && !pattern.test(value))) {
      add(path, "format", "Expected bounded nonempty text in the documented format."); return false;
    }
    return true;
  };
  const choice = (value, path, choices) => {
    if (!missing(value, path) && !choices.includes(value)) add(path, "enum", `Expected one of: ${choices.join(", ")}.`);
  };
  const bool = (value, path) => {
    if (!missing(value, path) && typeof value !== "boolean") add(path, "type", "Expected a boolean, not a truthy value.");
  };
  const count = (value, path) => {
    if (!missing(value, path) && (!Number.isSafeInteger(value) || value < 0)) add(path, "count", "Expected a nonnegative safe integer.");
  };
  const timestamp = (value, path) => {
    if (missing(value, path)) return;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
      || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
      add(path, "timestamp", "Expected a real UTC timestamp: YYYY-MM-DDTHH:mm:ss.sssZ.");
    }
  };
  const nullable = (value, path, check) => { if (value !== null) check(value, path); };
  const array = (value, path, check) => {
    if (missing(value, path)) return;
    if (!Array.isArray(value) || value.length > MAX_SESSIONS) { add(path, "array", "Expected a bounded array (at most 2000 entries)."); return; }
    value.forEach((item, index) => check(item, `${path}[${index}]`));
  };
  return { add, object, text, choice, bool, count, timestamp, nullable, array };
}

/** One portable relative path spelling. Never URL-decode or normalize traversal away. */
export function isRecordingPath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 1024
    && !isAbsolute(value) && !win32.isAbsolute(value) && !/[\\:\x00-\x1f\x7f]/.test(value)
    && value.split("/").every(part => part !== "" && part !== "." && part !== "..");
}

/** Pure structural/semantic validation. No file, clock, provider or participant access. */
export function validateSession(session, path = "session") {
  const errors = [];
  const v = validator(errors);
  if (!v.object(session, path, ["sessionId", "participation", "participantId", "observer", "harness", "environment", "protocol", "model", "measurements", "recording"])) return errors;
  v.text(session.sessionId, `${path}.sessionId`, ID);
  v.choice(session.participation, `${path}.participation`, PARTICIPATION);
  v.text(session.participantId, `${path}.participantId`, /^p-[a-z0-9][a-z0-9_-]{0,59}$/);
  const o = session.observer;
  if (v.object(o, `${path}.observer`, ["id", "humanPresent", "independent", "consentRecorded", "firstUse", "statement", "recordedAt"])) {
    v.text(o.id, `${path}.observer.id`, /^o-[a-z0-9][a-z0-9_-]{0,59}$/);
    for (const key of ["humanPresent", "independent", "consentRecorded", "firstUse"]) {
      v.bool(o[key], `${path}.observer.${key}`);
      if (session.participation === "human-declared" && o[key] === false) v.add(`${path}.observer.${key}`, "declaration", "Human first-use intake requires this observer declaration to be true.");
    }
    v.text(o.statement, `${path}.observer.statement`);
    v.timestamp(o.recordedAt, `${path}.observer.recordedAt`);
  }
  const h = session.harness;
  if (v.object(h, `${path}.harness`, ["name", "version", "sourceCommit", "artifactSha256"])) {
    v.choice(h.name, `${path}.harness.name`, HARNESSES);
    v.text(h.version, `${path}.harness.version`, undefined, 256);
    v.nullable(h.sourceCommit, `${path}.harness.sourceCommit`, (x, p) => v.text(x, p, COMMIT));
    v.nullable(h.artifactSha256, `${path}.harness.artifactSha256`, (x, p) => v.text(x, p, HASH));
    if (h.sourceCommit === null && h.artifactSha256 === null) v.add(`${path}.harness`, "identity-missing", "Supply an exact source commit or artifact SHA-256.", "missing-evidence");
  }
  const e = session.environment;
  if (v.object(e, `${path}.environment`, ["machineClass", "os", "osVersion", "arch", "nodeVersion", "installState"])) {
    v.text(e.machineClass, `${path}.environment.machineClass`, ID);
    v.choice(e.os, `${path}.environment.os`, ["darwin", "linux", "win32"]);
    v.text(e.osVersion, `${path}.environment.osVersion`, undefined, 256);
    v.text(e.arch, `${path}.environment.arch`, ID);
    v.text(e.nodeVersion, `${path}.environment.nodeVersion`, /^v?\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/);
    v.choice(e.installState, `${path}.environment.installState`, ["clean", "preinstalled", "unknown"]);
  }
  const p = session.protocol;
  if (v.object(p, `${path}.protocol`, Object.keys(COMMON_PROTOCOL))) {
    for (const key of ["id", "version", "taskId", "taskVersion"]) v.text(p[key], `${path}.protocol.${key}`, ID);
    v.text(p.taskSha256, `${path}.protocol.taskSha256`, HASH);
  }
  const m = session.model;
  if (v.object(m, `${path}.model`, ["kind", "used", "provider", "id", "revision", "settingsSha256", "credentialState"])) {
    v.choice(m.kind, `${path}.model.kind`, ["live-provider", "local-provider", "keyless-demo"]);
    v.bool(m.used, `${path}.model.used`);
    for (const key of ["provider", "id", "revision"]) v.nullable(m[key], `${path}.model.${key}`, (x, field) => v.text(x, field, undefined, 256));
    v.nullable(m.settingsSha256, `${path}.model.settingsSha256`, (x, field) => v.text(x, field, HASH));
    v.choice(m.credentialState, `${path}.model.credentialState`, ["configured", "not-required", "missing", "unknown"]);
    if (m.used === true) {
      for (const key of ["provider", "id", "revision", "settingsSha256"]) if (m[key] === null) v.add(`${path}.model.${key}`, "model-identity-missing", "A used model requires its identity and settings pin.", "missing-evidence");
      if (["missing", "unknown"].includes(m.credentialState)) v.add(`${path}.model.credentialState`, "model-credentials", "A used model requires a known configured or not-required credential state.");
    }
    if (m.kind === "keyless-demo" && (m.used !== false || m.provider !== null || m.id !== null || m.revision !== null
      || m.settingsSha256 !== null || m.credentialState !== "not-required")) v.add(`${path}.model`, "demo-model", "A keyless demonstration cannot declare model use or credentials.");
  }
  validateMeasurements(session, path, v);
  const r = session.recording;
  if (v.object(r, `${path}.recording`, ["path", "sha256"])) {
    if (v.text(r.path, `${path}.recording.path`) && !isRecordingPath(r.path)) v.add(`${path}.recording.path`, "recording-path", "Use a relative local path without traversal, backslashes, drive prefixes or URLs.");
    v.text(r.sha256, `${path}.recording.sha256`, HASH);
  }
  return errors;
}

function validateMeasurements(session, path, v) {
  const m = session.measurements;
  const base = `${path}.measurements`;
  if (!v.object(m, base, ["startedAt", "endedAt", "outcome", "firstUsefulResultAt", "actionsToFirstUsefulResult", "noResultReason", "assistanceCount", "setupFailures", "refusals", "interruption", "secondTask"])) return;
  v.timestamp(m.startedAt, `${base}.startedAt`);
  v.timestamp(m.endedAt, `${base}.endedAt`);
  v.choice(m.outcome, `${base}.outcome`, OUTCOMES);
  v.nullable(m.firstUsefulResultAt, `${base}.firstUsefulResultAt`, v.timestamp);
  v.nullable(m.actionsToFirstUsefulResult, `${base}.actionsToFirstUsefulResult`, v.count);
  v.nullable(m.noResultReason, `${base}.noResultReason`, v.text);
  v.nullable(m.assistanceCount, `${base}.assistanceCount`, v.count);
  if (m.outcome === "completed") {
    if (m.firstUsefulResultAt === null) v.add(`${base}.firstUsefulResultAt`, "result-missing", "Completion requires a useful-result timestamp.", "missing-evidence");
    if (m.actionsToFirstUsefulResult === null) v.add(`${base}.actionsToFirstUsefulResult`, "actions-missing", "Completion requires a measured action count.", "missing-evidence");
    if (m.noResultReason !== null) v.add(`${base}.noResultReason`, "result-conflict", "A completed first task must use null for noResultReason.");
    if (session.model?.used !== true) v.add(`${path}.model.used`, "useful-model-result", "The common useful-result task requires declared real model use, not a stub or setup-only run.");
  } else if (["failed", "incomplete"].includes(m.outcome)) {
    if (m.firstUsefulResultAt !== null || m.actionsToFirstUsefulResult !== null) v.add(base, "result-conflict", "Without a useful result, its timestamp and action count must both be null.");
    v.text(m.noResultReason, `${base}.noResultReason`);
  }
  const inWindow = (at, field) => {
    if (at !== null && Number.isFinite(time(at)) && (time(at) < time(m.startedAt) || time(at) > time(m.endedAt))) {
      v.add(field, "time-order", "Observation must lie within the declared measurement window.");
    }
  };
  if (time(m.endedAt) < time(m.startedAt)) v.add(`${base}.endedAt`, "time-order", "End precedes start.");
  inWindow(m.firstUsefulResultAt, `${base}.firstUsefulResultAt`);
  if (time(session.observer?.recordedAt) < time(m.endedAt)) v.add(`${path}.observer.recordedAt`, "time-order", "The observer statement must cover the closed measurement window.");
  v.array(m.setupFailures, `${base}.setupFailures`, (row, field) => {
    if (!v.object(row, field, ["at", "code", "detail"])) return;
    v.timestamp(row.at, `${field}.at`); inWindow(row.at, `${field}.at`);
    v.text(row.code, `${field}.code`, ID); v.text(row.detail, `${field}.detail`);
  });
  v.array(m.refusals, `${base}.refusals`, (row, field) => {
    if (!v.object(row, field, ["at", "code", "namedFix"])) return;
    v.timestamp(row.at, `${field}.at`); inWindow(row.at, `${field}.at`);
    v.text(row.code, `${field}.code`, ID); v.nullable(row.namedFix, `${field}.namedFix`, v.bool);
  });
  const i = m.interruption;
  if (v.object(i, `${base}.interruption`, ["at", "resumedAt", "resumeOutcome", "reason"])) {
    v.nullable(i.at, `${base}.interruption.at`, v.timestamp);
    v.nullable(i.resumedAt, `${base}.interruption.resumedAt`, v.timestamp);
    v.choice(i.resumeOutcome, `${base}.interruption.resumeOutcome`, ["succeeded", "failed", "not-attempted", "not-observed"]);
    v.nullable(i.reason, `${base}.interruption.reason`, v.text);
    inWindow(i.at, `${base}.interruption.at`); inWindow(i.resumedAt, `${base}.interruption.resumedAt`);
    if (["succeeded", "failed"].includes(i.resumeOutcome) && i.at === null) v.add(`${base}.interruption.at`, "interruption-missing", "A resume outcome requires the interruption timestamp.", "missing-evidence");
    if (i.resumeOutcome === "succeeded" && i.resumedAt === null) v.add(`${base}.interruption.resumedAt`, "resume-missing", "Successful resume requires its timestamp.", "missing-evidence");
    if (["not-attempted", "not-observed"].includes(i.resumeOutcome) && i.resumedAt !== null) v.add(`${base}.interruption.resumedAt`, "resume-conflict", "An unobserved or unattempted resume must not have a success timestamp.");
    if (i.resumedAt !== null && (i.at === null || time(i.resumedAt) < time(i.at))) v.add(`${base}.interruption.resumedAt`, "time-order", "Resume cannot precede interruption.");
    if (i.resumeOutcome !== "succeeded") v.text(i.reason, `${base}.interruption.reason`);
  }
  const s = m.secondTask;
  if (v.object(s, `${base}.secondTask`, ["outcome", "at", "reason"])) {
    v.choice(s.outcome, `${base}.secondTask.outcome`, ["returned", "did-not-return", "not-observed"]);
    v.nullable(s.at, `${base}.secondTask.at`, v.timestamp);
    v.nullable(s.reason, `${base}.secondTask.reason`, v.text);
    inWindow(s.at, `${base}.secondTask.at`);
    if (["returned", "did-not-return"].includes(s.outcome) && s.at === null) v.add(`${base}.secondTask.at`, "return-missing", "An observed return decision requires its timestamp.", "missing-evidence");
    if (s.outcome === "not-observed" && s.at !== null) v.add(`${base}.secondTask.at`, "return-conflict", "An unobserved return must have a null timestamp.");
    if (s.outcome !== "returned") v.text(s.reason, `${base}.secondTask.reason`);
    if (s.at !== null && m.firstUsefulResultAt !== null && time(s.at) < time(m.firstUsefulResultAt)) v.add(`${base}.secondTask.at`, "time-order", "Second-task decision precedes the first useful result.");
  }
}

function statusFor(errors, participation) {
  if (errors.some(error => error.kind === "invalid")) return "invalid";
  if (errors.length) return "missing-evidence";
  return participation;
}

/** Pure study validation; every colliding record is rejected, not just the later one. */
export function validateStudy(study) {
  const errors = [];
  const v = validator(errors);
  if (!v.object(study, "study", ["schemaVersion", "studyId", "sessions"])) return { errors, records: [] };
  v.choice(study.schemaVersion, "study.schemaVersion", [SCHEMA_VERSION]);
  v.text(study.studyId, "study.studyId", ID);
  if (!Array.isArray(study.sessions) || study.sessions.length > MAX_SESSIONS) {
    v.add("study.sessions", "sessions", "Expected an array of at most 2000 sessions.");
    return { errors, records: [] };
  }
  const records = study.sessions.map((session, index) => ({ index, errors: validateSession(session, `sessions[${index}]`) }));
  const rejectDuplicates = (keyFor, field, code, message) => {
    const groups = new Map();
    study.sessions.forEach((session, index) => {
      const key = keyFor(session);
      if (key !== null) groups.set(key, [...(groups.get(key) ?? []), index]);
    });
    for (const indices of groups.values()) if (indices.length > 1) {
      for (const index of indices) records[index].errors.push(issue(`sessions[${index}].${field}`, code, message));
    }
  };
  rejectDuplicates(s => typeof s?.sessionId === "string" ? s.sessionId : null, "sessionId", "duplicate-session", "Session IDs must be unique; all colliding entries are invalid.");
  rejectDuplicates(s => s?.participation === "human-declared" && typeof s.participantId === "string" && HARNESSES.includes(s.harness?.name)
    ? JSON.stringify([s.participantId, s.harness.name]) : null, "participantId", "duplicate-first-use", "A participant can supply only one first-use session per harness in this study.");
  rejectDuplicates(s => s?.participation === "human-declared" && typeof s.recording?.sha256 === "string" && HASH.test(s.recording.sha256)
    ? s.recording.sha256 : null, "recording.sha256", "duplicate-recording", "Separate human sessions require distinct recording bytes; shared or replayed recordings are not admitted.");
  return { errors, records };
}

const inside = (root, path) => {
  const rel = relative(root, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;
const unchanged = (a, b) => sameFile(a, b) && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
class IntakeError extends Error {
  constructor(code, message, kind = "invalid") { super(message); this.code = code; this.kind = kind; }
}

async function containedFile(root, reference) {
  if (!isRecordingPath(reference)) throw new IntakeError("recording-path", "Unsafe recording reference.");
  const target = resolve(root, reference);
  if (!inside(root, target)) throw new IntakeError("recording-escape", "Recording escapes the evidence root.");
  let current = root;
  for (const part of reference.split("/")) {
    current = join(current, part);
    const info = await lstat(current, { bigint: true });
    if (info.isSymbolicLink()) throw new IntakeError("recording-symlink", "Recording paths must not contain symlinks, even within the root.");
  }
  if (!inside(root, await realpath(target))) throw new IntakeError("recording-escape", "Recording resolves outside the evidence root.");
  return { target, info: await lstat(target, { bigint: true }) };
}

/** Hash local bytes without decoding, copying, uploading or returning their content. */
export async function inspectRecording(evidenceRoot, recording) {
  let handle;
  try {
    const root = await realpath(evidenceRoot);
    const rootInfo = await stat(root, { bigint: true });
    if (!rootInfo.isDirectory()) throw new IntakeError("evidence-root", "Evidence root must be a local directory.");
    const { target, info } = await containedFile(root, recording.path);
    if (!info.isFile()) throw new IntakeError("recording-type", "Recording must be a regular file.");
    if (info.nlink !== 1n) throw new IntakeError("recording-hardlink", "Hard-linked recordings are not admitted; retain a private standalone copy.");
    if (info.size === 0n) throw new IntakeError("recording-empty", "Recording is empty.", "missing-evidence");
    if (info.size > BigInt(MAX_RECORDING_BYTES)) throw new IntakeError("recording-size", "Recording exceeds the documented 8 GiB limit.");
    handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || !unchanged(info, opened)) throw new IntakeError("recording-changed", "Recording changed before hashing.");
    const hash = createHash("sha256");
    const buffer = Buffer.alloc(64 * 1024);
    let position = 0;
    while (position < Number(opened.size)) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, Number(opened.size) - position), position);
      if (!bytesRead) throw new IntakeError("recording-changed", "Recording was truncated during hashing.");
      hash.update(buffer.subarray(0, bytesRead)); position += bytesRead;
    }
    const after = await containedFile(root, recording.path);
    if (!unchanged(opened, await handle.stat({ bigint: true })) || !unchanged(opened, after.info)
      || !sameFile(rootInfo, await stat(root, { bigint: true })) || await realpath(evidenceRoot) !== root) {
      throw new IntakeError("recording-changed", "Recording or evidence root changed during hashing.");
    }
    const actualSha256 = hash.digest("hex");
    if (actualSha256 !== recording.sha256) throw new IntakeError("recording-hash-mismatch", "Recording bytes do not match the supplied SHA-256.");
    return { status: "hash-matched", sha256: actualSha256, bytes: position, error: null };
  } catch (error) {
    const missing = ["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(error?.code);
    return { status: error instanceof IntakeError ? error.kind : missing ? "missing-evidence" : "invalid", sha256: null, bytes: null,
      error: issue("recording", error instanceof IntakeError ? error.code : missing ? "recording-unavailable" : "recording-io",
        error instanceof IntakeError ? error.message : "Recording could not be read safely; no filesystem details or private bytes are included.",
        error instanceof IntakeError ? error.kind : missing ? "missing-evidence" : "invalid") };
  } finally { if (handle) await handle.close(); }
}

// Keep source narratives private. The input digest binds the retained operator JSON.
function publicMetadata(value) {
  if (Array.isArray(value)) return value.map(publicMetadata);
  if (!isObject(value)) return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (["statement", "detail", "reason", "noResultReason"].includes(key)) result[`${key}Recorded`] = typeof item === "string" && item.trim().length > 0;
    else result[key] = publicMetadata(item);
  }
  return result;
}

function projectRecord(session, entry, recordingCheck) {
  const path = `sessions[${entry.index}]`;
  const cleanBlock = key => !entry.errors.some(error => error.path === path || error.path === `${path}.${key}` || error.path.startsWith(`${path}.${key}.`) || error.path.startsWith(`${path}.${key}[`));
  const fields = {};
  for (const key of ["observer", "harness", "environment", "protocol", "model", "measurements", "recording"]) {
    fields[key] = isObject(session?.[key]) && cleanBlock(key) ? publicMetadata(session[key]) : null;
  }
  // A safe supplied reference remains useful when its file is missing or mismatches.
  const reference = session?.recording;
  fields.recording = isRecordingPath(reference?.path) && typeof reference?.sha256 === "string" && HASH.test(reference.sha256)
    ? { path: reference.path, sha256: reference.sha256 } : null;
  const participation = PARTICIPATION.includes(session?.participation) ? session.participation : null;
  return { index: entry.index, sessionId: typeof session?.sessionId === "string" && ID.test(session.sessionId) ? session.sessionId : null,
    participantId: typeof session?.participantId === "string" && /^p-[a-z0-9][a-z0-9_-]{0,59}$/.test(session.participantId) ? session.participantId : null,
    participation, status: statusFor(entry.errors, participation), errors: entry.errors,
    declaredOutcome: OUTCOMES.includes(session?.measurements?.outcome) ? session.measurements.outcome : null,
    ...fields, recordingCheck };
}

function valuesSummary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length === 0 ? null : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { observedSamples: values.length, values, median };
}

function summarizeHarness(rows) {
  const ms = rows.map(row => row.measurements);
  const outcomes = Object.fromEntries(OUTCOMES.map(key => [key, ms.filter(m => m.outcome === key).length]));
  const useful = ms.filter(m => m.outcome === "completed");
  const refusals = ms.flatMap(m => m.refusals);
  return { sessionIds: rows.map(row => row.sessionId), humanDeclaredSessions: rows.length, outcomes,
    measurementSource: "operator-declared; not independently timed or judged",
    usefulResultOnly: { withoutUsefulResult: ms.length - useful.length,
      actions: valuesSummary(useful.map(m => m.actionsToFirstUsefulResult)),
      elapsedMs: valuesSummary(useful.map(m => Date.parse(m.firstUsefulResultAt) - Date.parse(m.startedAt))) },
    observationWindowMs: valuesSummary(ms.map(m => Date.parse(m.endedAt) - Date.parse(m.startedAt))),
    assistance: { ...valuesSummary(ms.filter(m => m.assistanceCount !== null).map(m => m.assistanceCount)), unknown: ms.filter(m => m.assistanceCount === null).length },
    setupFailures: { sessions: ms.filter(m => m.setupFailures.length > 0).length, events: ms.reduce((n, m) => n + m.setupFailures.length, 0) },
    refusals: { total: refusals.length, namedFix: refusals.filter(r => r.namedFix === true).length,
      didNotNameFix: refusals.filter(r => r.namedFix === false).length, unknown: refusals.filter(r => r.namedFix === null).length },
    resume: Object.fromEntries(["succeeded", "failed", "not-attempted", "not-observed"].map(key => [key, ms.filter(m => m.interruption.resumeOutcome === key).length])),
    secondTask: Object.fromEntries(["returned", "did-not-return", "not-observed"].map(key => [key, ms.filter(m => m.secondTask.outcome === key).length])) };
}

function cohortIdentity(row) {
  if (!row.protocol || !row.environment || !row.model) return null;
  const p = row.protocol, e = row.environment, m = row.model;
  // Ordered tuples, not source object order; model.used is an outcome, not a stratum.
  return [p.id, p.version, p.taskId, p.taskVersion, p.taskSha256, e.machineClass, e.os, e.osVersion, e.arch,
    e.nodeVersion, e.installState, m.kind, m.provider, m.id, m.revision, m.settingsSha256, m.credentialState];
}

/** Internal pure projection of validated intake rows; never emits ranks or speedup claims. */
function aggregateHumanCohorts(records, studyErrors) {
  const blockingReasons = [];
  if (studyErrors.length) blockingReasons.push("study-record-invalid-or-missing");
  if (records.some(row => row.participation !== "automated-fixture" && row.status !== "human-declared")) blockingReasons.push("human-or-unclassified-records-invalid-or-missing");
  const groups = new Map();
  for (const row of records.filter(r => r.status === "human-declared")) {
    const identity = cohortIdentity(row);
    const key = JSON.stringify(identity);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const cohorts = [];
  for (const [key, rows] of groups) {
    const counts = Object.fromEntries(HARNESSES.map(h => [h, rows.filter(r => r.harness.name === h).length]));
    const reasons = [...blockingReasons];
    if (Object.values(counts).some(n => n < MIN_HUMAN_SESSIONS_PER_HARNESS)) reasons.push("fewer-than-five-human-declared-sessions-per-harness");
    if (new Set(Object.values(counts)).size !== 1) reasons.push("unequal-harness-cohorts");
    const sample = rows[0];
    if (Object.entries(COMMON_PROTOCOL).some(([field, value]) => sample.protocol[field] !== value)) reasons.push("not-the-standing-common-task-protocol");
    if (sample.model.kind === "keyless-demo") reasons.push("keyless-demonstration-is-not-the-real-model-task");
    if (["provider", "id", "revision", "settingsSha256"].some(field => sample.model[field] === null)) reasons.push("unmatched-model-identity");
    if (sample.model.credentialState === "unknown" || sample.environment.installState === "unknown") reasons.push("unknown-starting-state");
    for (const harness of HARNESSES) {
      const pins = new Set(rows.filter(r => r.harness.name === harness).map(r => JSON.stringify([r.harness.version, r.harness.sourceCommit, r.harness.artifactSha256])));
      if (pins.size > 1) reasons.push(`mixed-${harness}-identities`);
    }
    cohorts.push({ cohortId: digest(key), protocol: sample.protocol, environment: sample.environment,
      model: { ...sample.model, used: undefined }, humanDeclaredCounts: counts,
      status: reasons.length ? "insufficient-evidence" : "matched-declared-cohort", reasons,
      summaries: reasons.length ? null : Object.fromEntries(HARNESSES.map(h => [h, summarizeHarness(rows.filter(r => r.harness.name === h))])) });
  }
  // Do not hide unmatched human strata behind one adequate subgroup.
  const sufficient = cohorts.length > 0 && cohorts.every(c => c.status === "matched-declared-cohort") && !blockingReasons.length;
  return { status: sufficient ? "matched-declared-cohorts" : "insufficient-evidence", minimumPerHarness: MIN_HUMAN_SESSIONS_PER_HARNESS,
    reasons: cohorts.length ? [...blockingReasons, ...(!sufficient ? ["not-all-human-cohorts-are-matched-and-sufficient"] : [])] : [...blockingReasons, "no-eligible-human-declared-cohort"],
    excludedAutomatedRecords: records.filter(row => row.participation === "automated-fixture").length,
    humanParticipationAuthenticated: false, ranking: null, superiorityClaim: null, cohorts };
}

/** Filesystem orchestration. A schema-valid failed session is not an invalid record. */
export async function intakeStudy(study, { evidenceRoot, generatedAt = new Date().toISOString() } = {}) {
  if (typeof evidenceRoot !== "string" || !evidenceRoot.trim()) throw new IntakeError("evidence-root-required", "An explicit local evidence root is required.");
  const validated = validateStudy(study);
  const records = [];
  for (const entry of validated.records) {
    const session = study.sessions[entry.index];
    const field = `sessions[${entry.index}].recording`;
    const canInspect = isObject(session?.recording) && !entry.errors.some(error => error.path === field || error.path.startsWith(`${field}.`));
    let check = { status: "not-checked", sha256: null, bytes: null, error: null };
    if (canInspect) {
      check = await inspectRecording(evidenceRoot, session.recording);
      if (check.error) entry.errors.push({ ...check.error, path: field });
    }
    records.push(projectRecord(session, entry, check));
  }
  const allErrors = [...validated.errors, ...records.flatMap(r => r.errors)];
  return { schemaVersion: SCHEMA_VERSION, receiptType: "human-first-use-intake", generatedAt,
    studyId: typeof study?.studyId === "string" && ID.test(study.studyId) ? study.studyId : null,
    intakeStatus: allErrors.some(e => e.kind === "invalid") ? "invalid" : allErrors.length ? "missing-evidence" : "valid-records",
    inputSha256: null, toolSha256: null, intakeEnvironment: { os: platform(), arch: arch(), nodeVersion: process.version },
    boundary: "Local record/schema and recording-byte intake only. Human participation, consent, observer independence, task correctness, model identity and harness provenance are operator declarations, not authenticated attestations. No human study was run by this tool.",
    studyErrors: validated.errors, recordCounts: Object.fromEntries([...PARTICIPATION, "missing-evidence", "invalid"].map(s => [s, records.filter(r => r.status === s).length])),
    records, comparative: aggregateHumanCohorts(records, validated.errors) };
}

/** Exclusive creation also rejects existing symlinks; never truncate an earlier report. */
export async function writeIntakeReport(outputPath, report) {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  let handle;
  try {
    handle = await open(outputPath, "wx", 0o600);
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
  } catch (error) {
    throw new IntakeError(error?.code === "EEXIST" ? "output-exists" : "output-write",
      error?.code === "EEXIST" ? "Output already exists; choose a new report path." : "Could not create the report. Its parent must exist; preserve any partial output and choose a new path.");
  } finally { if (handle) await handle.close(); }
}

const USAGE = "node scripts/human-first-use-intake.mjs --input study.json --evidence-root /absolute/private-evidence --out /absolute/new-intake.json";

/** Reject ambiguous duplicate JSON members, including escaped spellings of a key. */
export function parseStudyJson(text) {
  let study;
  try { study = JSON.parse(text); }
  catch { throw new IntakeError("input-json", "Study input must be valid UTF-8 JSON. Its private content is not echoed."); }
  const stack = [];
  // JSON.parse already checked the grammar. This pass only tracks object keys.
  for (const [token] of text.matchAll(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]/g)) {
    const frame = stack[stack.length - 1];
    if (token === "{") stack.push({ keys: new Set(), expectingKey: true });
    else if (token === "[") stack.push({ keys: null, expectingKey: false });
    else if (token === "}" || token === "]") stack.pop();
    else if (token === "," && frame?.keys) frame.expectingKey = true;
    else if (token.startsWith('"') && frame?.keys && frame.expectingKey) {
      const key = JSON.parse(token);
      if (frame.keys.has(key)) throw new IntakeError("duplicate-json-key", "Duplicate JSON object members are ambiguous and are not admitted.");
      frame.keys.add(key); frame.expectingKey = false;
    }
  }
  return study;
}

/** Returns 0 for sufficient declared cohorts, 2 for insufficient/invalid intake, 1 for CLI/I/O failure. */
export async function runCli(args = process.argv.slice(2), io = process) {
  try {
    if (args.length === 1 && args[0] === "--help") { io.stdout.write(`${USAGE}\n`); return 0; }
    const flags = {};
    for (let index = 0; index < args.length; index += 2) {
      const flag = args[index], value = args[index + 1];
      if (!["--input", "--evidence-root", "--out"].includes(flag) || Object.hasOwn(flags, flag) || typeof value !== "string" || !value.trim() || value.startsWith("--")) {
        throw new IntakeError("arguments", `Expected each required flag exactly once. ${USAGE}`);
      }
      flags[flag] = value;
    }
    if (Object.keys(flags).length !== 3) throw new IntakeError("arguments", `All three paths are required. ${USAGE}`);
    const inputPath = resolve(flags["--input"]), outputPath = resolve(flags["--out"]);
    if (inputPath === outputPath) throw new IntakeError("output-exists", "Input and output must be different paths.");
    // Check size before reading the operator's JSON; never include parse-error excerpts.
    const info = await stat(inputPath);
    if (!info.isFile() || info.size > MAX_JSON_BYTES) throw new IntakeError("input-size", "Study JSON must be a regular file of at most 16 MiB.");
    const bytes = await readFile(inputPath);
    if (bytes.length > MAX_JSON_BYTES) throw new IntakeError("input-size", "Study JSON exceeds 16 MiB.");
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw new IntakeError("input-json", "Study input must be valid UTF-8 JSON. Its private content is not echoed."); }
    const study = parseStudyJson(text);
    const report = await intakeStudy(study, { evidenceRoot: resolve(flags["--evidence-root"]) });
    report.inputSha256 = digest(bytes);
    report.toolSha256 = digest(await readFile(fileURLToPath(import.meta.url)));
    await writeIntakeReport(outputPath, report);
    io.stdout.write(`${JSON.stringify({ intakeStatus: report.intakeStatus, comparativeStatus: report.comparative.status, reportWritten: true })}\n`);
    return report.intakeStatus === "valid-records" && report.comparative.status === "matched-declared-cohorts" ? 0 : 2;
  } catch (error) {
    io.stderr.write(`${JSON.stringify({ error: error instanceof IntakeError ? error.code : "local-io", message: error instanceof IntakeError ? error.message : "Local intake I/O failed. No input or recording content is included." })}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli();
}
