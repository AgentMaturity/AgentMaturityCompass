#!/usr/bin/env node
// Local operator declarations only. Neither journal hashes nor recording hashes authenticate events.
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, opendir, realpath, mkdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMMON_PROTOCOL, COMMON_TASK, SCHEMA_VERSION, isRecordingPath,
  validateSession, validateStudy, inspectRecording, parseStudyJson
} from "./human-first-use-intake.mjs";

export const CAPTURE_VERSION = "2026-09-09.1";
export const LIMITS = Object.freeze({
  sessions: 2000, eventsPerSession: 2000, revisions: 10000,
  jsonBytes: 16 * 1024 * 1024, journalBytes: 64 * 1024 * 1024,
  recordingBytes: 8 * 1024 ** 3, recordingTotalBytes: 64 * 1024 ** 3
});
const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const OBSERVER = /^o-[a-z0-9][a-z0-9_-]{0,59}$/;
const PARTICIPANT = /^p-[a-z0-9][a-z0-9_-]{0,59}$/;
const HASH = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const clone = value => structuredClone(value);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const encoded = value => Buffer.from(`${JSON.stringify(value)}\n`, "utf8");

export class CaptureError extends Error {
  constructor(code, message) { super(message); this.name = "CaptureError"; this.code = code; }
}
function requireThat(condition, code, message) {
  if (!condition) throw new CaptureError(code, message);
}
function shape(value, keys, field) {
  requireThat(object(value) && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key)), "schema", `${field}: supply exactly the documented fields.`);
}
function text(value, field, pattern, max = 2048) {
  requireThat(typeof value === "string" && value.trim().length > 0 && value.length <= max
    && !/[\x00-\x1f\x7f]/.test(value) && (!pattern || pattern.test(value)),
  "schema", `${field}: use bounded nonempty text in the documented format.`);
}
function choice(value, choices, field) {
  requireThat(choices.includes(value), "schema", `${field}: use one of ${choices.join(", ")}.`);
}
function boolean(value, field) {
  requireThat(typeof value === "boolean", "declaration-required", `${field}: explicitly declare true or false.`);
}
function nullableText(value, field, pattern, max) { if (value !== null) text(value, field, pattern, max); }
function timestamp(value, field) {
  requireThat(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value,
  "timestamp", `${field}: supply a real UTC timestamp (YYYY-MM-DDTHH:mm:ss.sssZ).`);
}
function boundedArray(value, max, field) {
  requireThat(Array.isArray(value) && value.length <= max, "size", `${field}: supply an array within the documented limit.`);
}
function recordingPath(value) {
  requireThat(isRecordingPath(value), "recording-path", "Use a local relative recording path without traversal, symlinks, drives or URLs.");
}

function validatePlan(plan) {
  shape(plan, ["sessionId", "participation", "participantId", "observerId", "harness", "environment", "model"], "planned session");
  text(plan.sessionId, "sessionId", ID);
  text(plan.participantId, "participantId", PARTICIPANT);
  text(plan.observerId, "observerId", OBSERVER);
  choice(plan.participation, ["human-declared", "automated-fixture"], "participation");
  const h = plan.harness;
  shape(h, ["name", "version", "sourceCommit", "artifactSha256"], "harness");
  choice(h.name, ["amc", "dsh", "pi"], "harness.name");
  text(h.version, "harness.version", undefined, 256);
  nullableText(h.sourceCommit, "harness.sourceCommit", COMMIT);
  nullableText(h.artifactSha256, "harness.artifactSha256", HASH);
  requireThat(h.sourceCommit !== null || h.artifactSha256 !== null, "identity-required", "Pin an actual source commit or artifact digest; no identity is inferred.");
  const e = plan.environment;
  shape(e, ["machineClass", "os", "osVersion", "arch", "nodeVersion", "installState"], "environment");
  text(e.machineClass, "environment.machineClass", ID);
  choice(e.os, ["darwin", "linux", "win32"], "environment.os");
  text(e.osVersion, "environment.osVersion", undefined, 256);
  text(e.arch, "environment.arch", ID);
  text(e.nodeVersion, "environment.nodeVersion", /^v?\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/);
  choice(e.installState, ["clean", "preinstalled", "unknown"], "environment.installState");
  const m = plan.model;
  shape(m, ["kind", "provider", "id", "revision", "settingsSha256", "credentialState"], "planned model (no used flag)");
  choice(m.kind, ["live-provider", "local-provider", "keyless-demo"], "model.kind");
  choice(m.credentialState, ["configured", "not-required", "missing", "unknown"], "model.credentialState");
  if (m.kind === "keyless-demo") {
    requireThat([m.provider, m.id, m.revision, m.settingsSha256].every(value => value === null)
      && m.credentialState === "not-required", "demo-model", "A keyless demo has no model identity/settings or required credentials.");
  } else {
    for (const key of ["provider", "id", "revision"]) text(m[key], `model.${key}`, undefined, 256);
    text(m.settingsSha256, "model.settingsSha256", HASH);
  }
}

/** Pure preregistration. Preparation declares intent, not consent, presence, use or outcomes. */
export function prepareDraft(input) {
  shape(input, ["studyId", "preparedAt", "operator", "protocol", "task", "observationWindowRule", "assistancePolicy", "plannedSessions"], "preparation");
  text(input.studyId, "studyId", ID);
  timestamp(input.preparedAt, "preparedAt");
  shape(input.operator, ["id", "statement"], "operator");
  text(input.operator.id, "operator.id", OBSERVER);
  text(input.operator.statement, "operator.statement");
  shape(input.protocol, Object.keys(COMMON_PROTOCOL), "protocol");
  requireThat(Object.entries(COMMON_PROTOCOL).every(([key, value]) => input.protocol[key] === value)
    && input.task === COMMON_TASK, "protocol", "Use the exact common protocol/task exports; the protocol command prints them.");
  text(input.observationWindowRule, "observationWindowRule");
  text(input.assistancePolicy, "assistancePolicy");
  boundedArray(input.plannedSessions, LIMITS.sessions, "plannedSessions");
  requireThat(input.plannedSessions.length > 0, "roster-empty", "Preregister a nonempty pseudonymous roster before observations.");
  const sessions = new Set(), pairs = new Set();
  for (const plan of input.plannedSessions) {
    validatePlan(plan);
    requireThat(!sessions.has(plan.sessionId), "duplicate-session", "Every planned session ID must be unique.");
    sessions.add(plan.sessionId);
    const pair = JSON.stringify([plan.participantId, plan.harness.name]);
    requireThat(!pairs.has(pair), "duplicate-first-use", "Preregister only one first-use attempt per participant/harness pair.");
    pairs.add(pair);
  }
  const draft = { captureVersion: CAPTURE_VERSION, ...clone(input) };
  requireThat(encoded(draft).length <= LIMITS.jsonBytes, "size", "Preparation exceeds the JSON byte limit.");
  return draft;
}

function validateDraft(draft) {
  shape(draft, ["captureVersion", "studyId", "preparedAt", "operator", "protocol", "task", "observationWindowRule", "assistancePolicy", "plannedSessions"], "draft");
  requireThat(draft.captureVersion === CAPTURE_VERSION, "version", "Unsupported capture version; retain the original and use its matching tool.");
  const { captureVersion, ...input } = draft;
  return prepareDraft(input);
}

function observerDeclaration(value, at) {
  shape(value, ["humanPresent", "independent", "consentRecorded", "firstUse", "statement", "recordedAt"], "close.observer");
  for (const key of ["humanPresent", "independent", "consentRecorded", "firstUse"]) boolean(value[key], `observer.${key}`);
  text(value.statement, "observer.statement");
  timestamp(value.recordedAt, "observer.recordedAt");
  requireThat(Date.parse(value.recordedAt) >= Date.parse(at), "attestation-order", "Observer attestation must cover the full window at or after close.");
}

/** Pure event replay; one submitted-action event is one intentionally submitted operation. */
export function projectSession(plan, events, preparedAt) {
  validatePlan(plan);
  timestamp(preparedAt, "preparedAt");
  boundedArray(events, LIMITS.eventsPerSession, "session events");
  let startedAt = null, firstTask = null, recovery = null, secondTask = null, closed = null;
  let actions = 0, assistance = 0, previousAt = preparedAt;
  const setupFailures = [], refusals = [];
  for (const event of events) {
    shape(event, ["type", "at", "timing", "data"], "event");
    timestamp(event.at, "event.at");
    choice(event.timing, ["explicit-observed", "operator-declared-now"], "event.timing");
    requireThat(Date.parse(event.at) >= Date.parse(previousAt), "event-order", "Events must be ordered at or after preregistration; correct the retained sequence explicitly.");
    requireThat(closed === null, "session-closed", "This window is closed. Use an explicit correction, never silently reopen it.");
    previousAt = event.at;
    const d = event.data;
    if (event.type === "start") {
      shape(d, [], "start.data");
      requireThat(startedAt === null, "already-started", "A session has exactly one start.");
      startedAt = event.at;
      continue;
    }
    requireThat(startedAt !== null, "start-required", "Record start before any session observation.");
    switch (event.type) {
      case "submitted-action":
        shape(d, ["description"], "submitted-action.data");
        text(d.description, "action.description");
        actions += 1;
        break;
      case "assistance":
        shape(d, ["detail"], "assistance.data");
        text(d.detail, "assistance.detail");
        assistance += 1;
        break;
      case "setup-failure":
        shape(d, ["code", "detail"], "setup-failure.data");
        text(d.code, "setup-failure.code", ID); text(d.detail, "setup-failure.detail");
        setupFailures.push({ at: event.at, ...clone(d) });
        break;
      case "refusal":
        shape(d, ["code", "namedFix"], "refusal.data");
        text(d.code, "refusal.code", ID);
        if (d.namedFix !== null) boolean(d.namedFix, "refusal.namedFix");
        refusals.push({ at: event.at, ...clone(d) });
        break;
      case "useful-result":
        shape(d, ["judgement"], "useful-result.data");
        text(d.judgement, "useful-result.judgement");
        requireThat(firstTask === null, "first-task-ended", "The first-task outcome is already recorded; use correction to change it.");
        firstTask = { outcome: "completed", firstUsefulResultAt: event.at, actionsToFirstUsefulResult: actions, noResultReason: null };
        break;
      case "first-task-ended":
        shape(d, ["outcome", "reason"], "first-task-ended.data");
        choice(d.outcome, ["failed", "incomplete"], "first-task-ended.outcome");
        text(d.reason, "first-task-ended.reason");
        requireThat(firstTask === null, "first-task-ended", "The first-task outcome is already recorded; use correction to change it.");
        firstTask = { outcome: d.outcome, firstUsefulResultAt: null, actionsToFirstUsefulResult: null, noResultReason: d.reason };
        break;
      case "interruption":
        shape(d, ["reason"], "interruption.data"); text(d.reason, "interruption.reason");
        requireThat(firstTask !== null && recovery === null && secondTask === null, "recovery-order", "Record one recovery exercise after the first-task outcome and before the second-task decision.");
        recovery = { at: event.at, resumedAt: null, resumeOutcome: null, reason: d.reason };
        break;
      case "resume":
        shape(d, ["outcome", "reason"], "resume.data");
        choice(d.outcome, ["succeeded", "failed", "not-attempted", "not-observed"], "resume.outcome");
        requireThat(recovery !== null && recovery.at !== null && recovery.resumeOutcome === null && secondTask === null,
          "interruption-required", "Record an interruption before its single resume disposition.");
        if (d.outcome === "succeeded") nullableText(d.reason, "resume.reason"); else text(d.reason, "resume.reason");
        recovery = { at: recovery.at, resumedAt: d.outcome === "succeeded" ? event.at : null, resumeOutcome: d.outcome, reason: d.reason };
        break;
      case "recovery-decision":
        shape(d, ["outcome", "reason"], "recovery-decision.data");
        choice(d.outcome, ["not-attempted", "not-observed"], "recovery-decision.outcome");
        text(d.reason, "recovery-decision.reason");
        requireThat(firstTask !== null && recovery === null && secondTask === null, "recovery-order", "Use this explicit disposition only when no interruption was recorded, after the first-task outcome.");
        recovery = { at: null, resumedAt: null, resumeOutcome: d.outcome, reason: d.reason };
        break;
      case "second-task":
        shape(d, ["outcome", "reason"], "second-task.data");
        choice(d.outcome, ["returned", "did-not-return", "not-observed"], "second-task.outcome");
        if (d.outcome === "returned") nullableText(d.reason, "second-task.reason"); else text(d.reason, "second-task.reason");
        requireThat(firstTask !== null && recovery?.resumeOutcome != null && secondTask === null,
          "second-task-order", "Record the first-task and recovery dispositions before the separate optional-return decision.");
        secondTask = { outcome: d.outcome, at: d.outcome === "not-observed" ? null : event.at, reason: d.reason };
        break;
      case "close":
        shape(d, ["completeness", "modelUsed", "observer", "recordingPath", "windowRuleSatisfied", "windowRuleDeviation"], "close.data");
        shape(d.completeness, ["actions", "assistance", "setupFailures", "refusals"], "close.completeness");
        for (const key of Object.keys(d.completeness)) boolean(d.completeness[key], `completeness.${key}`);
        boolean(d.modelUsed, "close.modelUsed"); boolean(d.windowRuleSatisfied, "close.windowRuleSatisfied");
        if (d.windowRuleSatisfied) requireThat(d.windowRuleDeviation === null, "window-rule", "A satisfied window rule must have null deviation.");
        else text(d.windowRuleDeviation, "windowRuleDeviation");
        observerDeclaration(d.observer, event.at);
        if (d.recordingPath !== null) recordingPath(d.recordingPath);
        requireThat(firstTask !== null && recovery?.resumeOutcome != null && secondTask !== null,
          "window-incomplete", "Close only after explicit first-task, recovery and second-task dispositions, including unknowns with reasons.");
        closed = { at: event.at, ...clone(d) };
        break;
      default: throw new CaptureError("event-type", "Unsupported event type; consult help and the event schema.");
    }
  }
  if (closed === null) return { status: startedAt === null ? "unobserved" : "open", outcome: firstTask?.outcome ?? null, measurements: null, observer: null, model: null, recordingPath: null, coverage: null, blockers: [] };
  const coverage = closed.completeness;
  const measurements = {
    startedAt, endedAt: closed.at, ...firstTask,
    actionsToFirstUsefulResult: coverage.actions ? firstTask.actionsToFirstUsefulResult : null,
    assistanceCount: coverage.assistance ? assistance : null,
    setupFailures: coverage.setupFailures ? setupFailures : null,
    refusals: coverage.refusals ? refusals : null,
    interruption: recovery, secondTask
  };
  const observer = { id: plan.observerId, ...closed.observer };
  const model = { ...clone(plan.model), used: closed.modelUsed };
  // Validate all available intake fields now; an expected recording hash is never invented.
  const fields = { sessionId: plan.sessionId, participation: plan.participation, participantId: plan.participantId,
    harness: plan.harness, environment: plan.environment, protocol: COMMON_PROTOCOL, observer, model, measurements };
  const blockers = validateSession(fields).filter(error => error.path !== "session.recording");
  if (closed.recordingPath === null) blockers.push({ path: "session.recording", code: "recording-missing", message: "Declare the retained recording path in an explicit correction." });
  if (!closed.windowRuleSatisfied) blockers.push({ path: "session.windowRule", code: "window-rule-unsatisfied", message: "The preregistered observation-window rule was not satisfied; retain the deviation." });
  return { status: blockers.length ? "closed-blocked" : "closed", outcome: firstTask.outcome,
    measurements, observer, model, recordingPath: closed.recordingPath, coverage, blockers };
}

/** Deliberate record-now is an operator declaration; a clock value alone is not an observation. */
export function declareRecordNow(event, now) {
  shape(event, ["type", "at", "timing", "data"], "record-now event");
  requireThat(event.type !== "close", "close-time-required", "Close requires an explicit observed timestamp and an at/after-close observer attestation; do not substitute invocation time.");
  requireThat(event.at === null && event.timing === null, "record-now-conflict", "For --record-now, explicitly leave at and timing null; it cannot replace a supplied timestamp.");
  timestamp(now, "record-now timestamp");
  return { ...clone(event), at: now, timing: "operator-declared-now" };
}

function emptyState(draft) {
  return { draft, revision: -1, headSha256: null, sessions: new Map(draft.plannedSessions.map(plan => [plan.sessionId, []])), history: [], journalBytes: 0 };
}

/** Pure revision application. Corrections retain the old revisions and cannot change the roster. */
export function applyRevision(state, revision, digest, byteLength) {
  shape(revision, ["captureVersion", "revision", "previousSha256", "savedAt", "kind", "payload"], "revision");
  requireThat(revision.captureVersion === CAPTURE_VERSION, "version", "Unsupported journal version.");
  timestamp(revision.savedAt, "revision.savedAt");
  text(digest, "revision digest", HASH);
  requireThat(Number.isSafeInteger(byteLength) && byteLength > 0 && byteLength <= LIMITS.jsonBytes, "size", "Revision exceeds its byte limit.");
  requireThat(Number.isSafeInteger(revision.revision) && revision.revision >= 0 && revision.revision < LIMITS.revisions, "revision", "Invalid or exhausted revision sequence.");
  if (state === null) {
    requireThat(revision.kind === "prepare" && revision.revision === 0 && revision.previousSha256 === null, "journal-origin", "The journal must begin with its original preparation revision.");
    state = emptyState(validateDraft(revision.payload));
  }
  requireThat(revision.revision === state.revision + 1 && revision.previousSha256 === state.headSha256,
    "revision-conflict", "Revision/head conflict. Re-read status and reconcile; do not blindly retry an observation.");
  requireThat(state.journalBytes + byteLength <= LIMITS.journalBytes, "size", "Journal exceeds its retained-history byte limit.");
  let sessionId = null;
  const sessions = new Map(state.sessions);
  if (revision.kind !== "prepare") {
    choice(revision.kind, ["event", "correction"], "revision.kind");
    const p = revision.payload;
    shape(p, revision.kind === "event" ? ["sessionId", "event"] : ["sessionId", "declaredAt", "reason", "events"], "revision.payload");
    text(p.sessionId, "sessionId", ID);
    sessionId = p.sessionId;
    const plan = state.draft.plannedSessions.find(item => item.sessionId === sessionId);
    requireThat(plan !== undefined, "unplanned-session", "This session is not in the frozen roster. Do not substitute or silently add participants.");
    let events;
    if (revision.kind === "event") events = [...sessions.get(sessionId), clone(p.event)];
    else {
      text(p.reason, "correction.reason"); timestamp(p.declaredAt, "correction.declaredAt");
      boundedArray(p.events, LIMITS.eventsPerSession, "correction.events");
      events = clone(p.events);
    }
    // Validate replacement shapes before reading their times or close declarations.
    projectSession(plan, events, state.draft.preparedAt);
    if (revision.kind === "correction") {
      const prior = sessions.get(sessionId);
      const latest = [state.draft.preparedAt, ...prior.map(event => event.at), ...events.map(event => event.at),
        ...prior.filter(event => event.type === "close").map(event => event.data.observer.recordedAt),
        ...events.filter(event => event?.type === "close").map(event => event.data?.observer?.recordedAt)];
      requireThat(latest.every(at => Number.isFinite(Date.parse(at)) && Date.parse(p.declaredAt) >= Date.parse(at)),
        "correction-order", "Declare the correction at or after all replaced/replacement observations and attestations.");
    }
    sessions.set(sessionId, events);
  } else requireThat(state.revision === -1, "roster-frozen", "Preparation and the planned population cannot be replaced within a journal.");
  return { ...state, sessions, revision: revision.revision, headSha256: digest, journalBytes: state.journalBytes + byteLength,
    history: [...state.history, { revision: revision.revision, sha256: digest, kind: revision.kind, sessionId }] };
}

const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;
const unchanged = (a, b) => sameFile(a, b) && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs && a.nlink === b.nlink;
const revisionName = number => `r-${String(number).padStart(5, "0")}.json`;
const nested = (root, target) => {
  const part = relative(root, target);
  return part === "" || (part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part));
};

async function localDirectory(path) {
  requireThat(typeof path === "string" && isAbsolute(path), "directory", "Supply an explicit absolute local directory path.");
  const supplied = resolve(path), info = await lstat(supplied, { bigint: true });
  requireThat(info.isDirectory() && !info.isSymbolicLink(), "directory", "Use a real nonsymlink directory with a private, stable parent.");
  const root = await realpath(supplied);
  requireThat(sameFile(info, await lstat(root, { bigint: true })), "directory-changed", "Directory changed; freeze the local snapshot and retry.");
  return { supplied, root, info };
}

async function checkDirectory(directory) {
  const again = await localDirectory(directory.supplied);
  requireThat(again.root === directory.root && sameFile(again.info, directory.info), "directory-changed", "Directory identity changed; preserve this attempt and use a stable private snapshot.");
}

async function containedRegular(directory, reference, maxBytes, allowEmpty = false) {
  recordingPath(reference);
  await checkDirectory(directory);
  let target = directory.root;
  const parents = [], parts = reference.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    target = join(target, parts[index]);
    const info = await lstat(target, { bigint: true });
    requireThat(!info.isSymbolicLink(), "file-symlink", "Symlink components are refused; retain a private standalone file under the explicit root.");
    if (index < parts.length - 1) {
      requireThat(info.isDirectory(), "file-type", "Intermediate path components must be real directories.");
      parents.push({ path: target, info });
    } else {
      requireThat(info.isFile(), "file-type", "Only regular local files are accepted, not devices, sockets, FIFOs or directories.");
      requireThat(info.nlink === 1n, "file-hardlink", "Hard-linked files are refused; use a private standalone copy.");
      requireThat((allowEmpty || info.size > 0n) && info.size <= BigInt(maxBytes), "file-size", "File is empty or exceeds its documented byte limit.");
      requireThat(await realpath(target) === target, "file-escape", "File resolution changed or escaped the explicit root.");
      return { target, info, parents };
    }
  }
  throw new CaptureError("file-path", "A regular-file reference is required.");
}

/** Shared bounded descriptor reader; detects ordinary path/file changes, not a portable openat sandbox. */
async function readStable(directory, reference, maxBytes, collect) {
  const before = await containedRegular(directory, reference, maxBytes);
  let handle;
  try {
    handle = await open(before.target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const opened = await handle.stat({ bigint: true });
    requireThat(opened.isFile() && opened.nlink === 1n && unchanged(before.info, opened), "file-changed", "File changed before reading; freeze the evidence snapshot.");
    const hash = createHash("sha256"), buffer = Buffer.alloc(64 * 1024);
    const bytes = collect ? Buffer.alloc(Number(opened.size)) : null;
    let position = 0;
    while (position < Number(opened.size)) {
      const result = await handle.read(buffer, 0, Math.min(buffer.length, Number(opened.size) - position), position);
      requireThat(result.bytesRead > 0, "file-changed", "File was truncated during reading; no digest is admitted.");
      const chunk = buffer.subarray(0, result.bytesRead);
      hash.update(chunk);
      if (bytes) chunk.copy(bytes, position);
      position += result.bytesRead;
    }
    const after = await containedRegular(directory, reference, maxBytes);
    requireThat(unchanged(opened, await handle.stat({ bigint: true })) && unchanged(opened, after.info)
      && before.parents.length === after.parents.length && before.parents.every((parent, index) => sameFile(parent.info, after.parents[index].info)),
    "file-changed", "File or its parent changed while reading; no digest is admitted.");
    return { sha256: hash.digest("hex"), bytes: position, content: bytes };
  } finally { if (handle) await handle.close(); }
}

function decodeJson(bytes) {
  requireThat(bytes.length <= LIMITS.jsonBytes, "size", "JSON exceeds the documented input limit.");
  let parsed;
  try { parsed = parseStudyJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new CaptureError("input-json", "Use valid UTF-8 JSON without duplicate members; private parse excerpts are suppressed."); }
  // Bound traversal space by nesting depth, not the width of a large input array.
  const visit = (value, depth) => {
    requireThat(depth <= 32, "input-depth", "JSON nesting exceeds the local capture limit.");
    if (Array.isArray(value)) for (const item of value) visit(item, depth + 1);
    else if (object(value)) for (const key in value) if (Object.hasOwn(value, key)) visit(value[key], depth + 1);
  };
  visit(parsed, 0);
  return parsed;
}

export async function readCaptureJson(path) {
  requireThat(typeof path === "string" && isAbsolute(path), "input-path", "Supply an absolute local JSON path.");
  const absolute = resolve(path), parent = await localDirectory(resolve(absolute, ".."));
  const read = await readStable(parent, relative(parent.supplied, absolute), LIMITS.jsonBytes, true);
  return decodeJson(read.content);
}

/** No truncation, replacement or overwrite. A failed partial creation remains visible for recovery. */
export async function writeExclusive(path, bytes) {
  let handle;
  try {
    handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    if (error instanceof CaptureError) throw error;
    throw new CaptureError(error?.code === "EEXIST" ? "output-exists" : "output-write",
      error?.code === "EEXIST" ? "Output or next revision already exists. Re-read status, reconcile conflicts, or choose a new output path."
        : "Private output creation failed. Preserve any partial file and choose a fresh destination; never truncate an earlier artifact.");
  } finally { if (handle) await handle.close(); }
}

async function newDirectory(path) {
  requireThat(typeof path === "string" && isAbsolute(path), "output-path", "Use an absolute new output directory with an existing private parent.");
  const absolute = resolve(path), parent = await localDirectory(resolve(absolute, ".."));
  const target = join(parent.root, relative(parent.supplied, absolute));
  try { await mkdir(target, { mode: 0o700 }); }
  catch { throw new CaptureError("output-exists-or-unavailable", "Output directory must not exist and its parent must be writable. Preserve prior/partial output and choose a new path."); }
  await checkDirectory(parent);
  return localDirectory(target);
}

/** Read all revisions, not a mutable head pointer; reject gaps, extra files and changed bytes. */
export async function loadCapture(storePath) {
  const directory = await localDirectory(storePath), names = [];
  const listing = await opendir(directory.root);
  for await (const item of listing) {
    requireThat(/^r-\d{5}\.json$/.test(item.name) && names.length < LIMITS.revisions,
      "journal-layout", "Journal contains unexpected files or too many revisions. Retain the original store; consult the recovery procedure.");
    names.push(item.name);
  }
  names.sort();
  requireThat(names.length > 0 && names.every((name, index) => name === revisionName(index)), "journal-gap", "Journal is empty or has a revision gap; do not silently skip history.");
  let state = null;
  const sources = [];
  for (const name of names) {
    const remaining = LIMITS.journalBytes - (state?.journalBytes ?? 0);
    requireThat(remaining > 0, "size", "Journal exceeds its total byte limit.");
    const read = await readStable(directory, name, Math.min(LIMITS.jsonBytes, remaining), true);
    let revision;
    try { revision = decodeJson(read.content); }
    catch { throw new CaptureError("journal-json", "A revision is incomplete or invalid. A writer may still be saving; retry status after it finishes. Preserve interrupted files for reviewed recovery."); }
    state = applyRevision(state, revision, read.sha256, read.bytes);
    sources.push({ name, bytes: read.content });
  }
  await checkDirectory(directory);
  return { ...state, directory, sources };
}

export async function createCapture(input, storePath, savedAt = new Date().toISOString()) {
  const draft = prepareDraft(input);
  const revision = { captureVersion: CAPTURE_VERSION, revision: 0, previousSha256: null, savedAt, kind: "prepare", payload: draft };
  const bytes = encoded(revision);
  const state = applyRevision(null, revision, sha256(bytes), bytes.length);
  const directory = await newDirectory(storePath);
  await writeExclusive(join(directory.root, revisionName(0)), bytes);
  await checkDirectory(directory);
  return state;
}

export async function appendCapture(storePath, expectedHead, kind, payload, savedAt = new Date().toISOString()) {
  text(expectedHead, "expected head SHA-256", HASH);
  choice(kind, ["event", "correction"], "append kind");
  const state = await loadCapture(storePath);
  requireThat(state.headSha256 === expectedHead, "revision-conflict", "The journal advanced. Read status and reconcile with retained history; do not retry blindly.");
  const revision = { captureVersion: CAPTURE_VERSION, revision: state.revision + 1, previousSha256: expectedHead, savedAt, kind, payload };
  const bytes = encoded(revision);
  const next = applyRevision(state, revision, sha256(bytes), bytes.length);
  await checkDirectory(state.directory);
  // Identical next names are the compare-and-create boundary: only one cooperating writer wins.
  await writeExclusive(join(state.directory.root, revisionName(revision.revision)), bytes);
  await checkDirectory(state.directory);
  return next;
}

/** Pure full-roster inventory. Missing sessions are never filtered out. */
export function captureStatus(state) {
  const sessions = state.draft.plannedSessions.map(plan => {
    const events = state.sessions.get(plan.sessionId);
    const projection = projectSession(plan, events, state.draft.preparedAt);
    return { sessionId: plan.sessionId, participantId: plan.participantId, participation: plan.participation,
      harness: plan.harness.name, status: projection.status, firstTaskOutcome: projection.outcome,
      activeEventCount: events.length,
      correctionRevisions: state.history.filter(item => item.sessionId === plan.sessionId && item.kind === "correction").map(item => item.revision),
      observationGaps: projection.coverage === null ? null : Object.keys(projection.coverage).filter(key => !projection.coverage[key]),
      blockers: clone(projection.blockers) };
  });
  return { captureVersion: CAPTURE_VERSION, studyId: state.draft.studyId, revision: state.revision, headSha256: state.headSha256,
    preparationOnly: state.history.every(item => item.kind === "prepare"), plannedSessionCount: sessions.length, sessions };
}

/** Derive the actual SHA-256 from contained file bytes; never pass a placeholder hash to intake. */
export async function hashRecording(evidenceRoot, reference, maxBytes = LIMITS.recordingBytes) {
  requireThat(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= LIMITS.recordingBytes,
    "recording-limit", "Recording read budget must be positive and cannot exceed 8 GiB.");
  const directory = await localDirectory(evidenceRoot);
  const read = await readStable(directory, reference, maxBytes, false);
  return { path: reference, sha256: read.sha256, bytes: read.bytes };
}

function asBlocker(error) {
  return { path: "session.recording", code: error instanceof CaptureError ? error.code : "recording-unavailable",
    message: error instanceof CaptureError ? error.message : "Recording could not be read safely. Retain the original and check the private root/file permissions." };
}

function intakeFields(plan, projection, protocol, recording) {
  return { sessionId: plan.sessionId, participation: plan.participation, participantId: plan.participantId,
    observer: clone(projection.observer), harness: clone(plan.harness), environment: clone(plan.environment),
    protocol: clone(protocol), model: clone(projection.model), measurements: clone(projection.measurements), recording };
}

/** Export a complete roster or a blocked report, never an apparently complete successful subset. */
export async function finalizeCapture(storePath, expectedHead, evidenceRoot, outputPath, generatedAt = new Date().toISOString()) {
  text(expectedHead, "expected head SHA-256", HASH); timestamp(generatedAt, "generatedAt");
  const state = await loadCapture(storePath);
  requireThat(state.headSha256 === expectedHead, "revision-conflict", "Export requires the current reviewed head digest. Re-read status and reconcile first.");
  const evidence = await localDirectory(evidenceRoot);
  requireThat(typeof outputPath === "string" && isAbsolute(outputPath), "output-path", "Supply a new absolute export directory.");
  const parent = await localDirectory(resolve(outputPath, ".."));
  const destination = join(parent.root, relative(parent.supplied, resolve(outputPath)));
  requireThat(!nested(state.directory.root, destination) && !nested(evidence.root, destination),
    "output-overlap", "Keep exports outside the journal and evidence root so original evidence/history remain untouched.");
  const status = captureStatus(state), candidates = [], snapshots = new Map();
  let budget = LIMITS.recordingTotalBytes;
  for (const row of status.sessions) {
    row.recordingCheck = { status: "not-checked", sha256: null, bytes: null };
    if (row.status !== "closed") continue;
    const plan = state.draft.plannedSessions.find(item => item.sessionId === row.sessionId);
    const projection = projectSession(plan, state.sessions.get(row.sessionId), state.draft.preparedAt);
    try {
      requireThat(budget > 0, "recording-total-size", "Recording population exceeds the aggregate 64 GiB snapshot limit.");
      const before = await containedRegular(evidence, projection.recordingPath, Math.min(LIMITS.recordingBytes, budget));
      // Charge before reading, including attempts which subsequently fail stability checks.
      const size = Number(before.info.size);
      budget -= size;
      const actual = await hashRecording(evidence.root, projection.recordingPath, size);
      const after = await containedRegular(evidence, projection.recordingPath, size);
      requireThat(unchanged(before.info, after.info), "file-changed", "Recording changed since export preflight; no record is admitted.");
      const recording = { path: actual.path, sha256: actual.sha256 };
      const candidate = intakeFields(plan, projection, state.draft.protocol, recording);
      const errors = validateSession(candidate);
      row.blockers.push(...errors);
      row.recordingCheck = { status: "hash-derived-not-yet-verified", sha256: actual.sha256, bytes: actual.bytes };
      snapshots.set(row.sessionId, { info: before.info, size });
      candidates.push(candidate);
    } catch (error) {
      row.status = "closed-blocked";
      row.blockers.push(asBlocker(error));
    }
  }
  const study = { schemaVersion: SCHEMA_VERSION, studyId: state.draft.studyId, sessions: candidates };
  const validation = validateStudy(study);
  for (const entry of validation.records) {
    const candidate = candidates[entry.index];
    status.sessions.find(row => row.sessionId === candidate.sessionId).blockers.push(...entry.errors);
  }
  // Unlike intake's human-only reuse rule, capture refuses shared bytes even for automated fixtures.
  const duplicates = new Map();
  for (const candidate of candidates) {
    const hash = candidate.recording.sha256;
    duplicates.set(hash, [...(duplicates.get(hash) ?? []), candidate.sessionId]);
  }
  for (const ids of duplicates.values()) if (ids.length > 1) for (const id of ids) {
    status.sessions.find(row => row.sessionId === id).blockers.push({ path: "session.recording", code: "duplicate-recording",
      message: "Distinct planned sessions require distinct recording bytes; every colliding record is blocked." });
  }
  // Second independent read uses intake's expected-digest verifier, with the actually derived hash.
  for (const candidate of candidates) {
    const row = status.sessions.find(item => item.sessionId === candidate.sessionId);
    const snapshot = snapshots.get(candidate.sessionId);
    try {
      const before = await containedRegular(evidence, candidate.recording.path, snapshot.size);
      requireThat(unchanged(snapshot.info, before.info), "file-changed", "Recording changed between derivation and verification.");
      const check = await inspectRecording(evidence.root, candidate.recording);
      row.recordingCheck = { status: check.status, sha256: check.sha256, bytes: check.bytes };
      if (check.error) row.blockers.push(check.error);
      const after = await containedRegular(evidence, candidate.recording.path, snapshot.size);
      requireThat(unchanged(snapshot.info, after.info), "file-changed", "Recording changed during intake verification.");
    } catch (error) { row.blockers.push(asBlocker(error)); }
    row.status = row.blockers.length ? "closed-blocked" : "ready";
  }
  await checkDirectory(evidence);
  const studyBytes = encoded(study);
  const studyErrors = [...validation.errors];
  if (studyBytes.length > LIMITS.jsonBytes) studyErrors.push({ path: "study", code: "study-size", message: "The complete study exceeds intake's 16 MiB input limit; no subset was exported." });
  const complete = !studyErrors.length && candidates.length === state.draft.plannedSessions.length
    && status.sessions.every(row => row.status === "ready");
  const latest = await loadCapture(storePath);
  requireThat(latest.headSha256 === expectedHead, "revision-conflict", "The journal changed during export. Review the new head and choose a fresh export attempt.");
  const report = {
    ...status, reportType: "observer-capture-export", generatedAt,
    exportStatus: complete ? "complete-roster-export" : "blocked", studyWritten: complete,
    studySha256: complete ? sha256(studyBytes) : null, studyErrors,
    unobservedPlannedSessionIds: status.sessions.filter(row => row.status === "unobserved").map(row => row.sessionId),
    unclosedSessionIds: status.sessions.filter(row => row.status === "open").map(row => row.sessionId),
    failedFirstTaskSessionIds: status.sessions.filter(row => row.firstTaskOutcome === "failed").map(row => row.sessionId),
    incompleteFirstTaskSessionIds: status.sessions.filter(row => row.firstTaskOutcome === "incomplete").map(row => row.sessionId),
    journal: state.history.map(item => ({ ...item, path: `journal/${revisionName(item.revision)}` })),
    boundary: "Operator-declared evidence, not authenticated human participation or cryptographic event attestation. savedAt/generatedAt are persistence metadata, not observed event times. Hashes bind retained bytes only. Full roster export does not mean complete observations, successful tasks, matched cohorts, validation acceptance or issue Done. No recording content is decoded, copied or uploaded."
  };
  const reportBytes = encoded(report);
  requireThat(reportBytes.length <= LIMITS.jsonBytes, "size", "Export report exceeds the JSON limit; no subset is emitted.");
  const output = await newDirectory(destination);
  await mkdir(join(output.root, "journal"), { mode: 0o700 });
  for (const source of state.sources) await writeExclusive(join(output.root, "journal", source.name), source.bytes);
  if (complete) await writeExclusive(join(output.root, "study.json"), studyBytes);
  // This final marker is written last. Missing/partial report means the bundle is not complete.
  await writeExclusive(join(output.root, "report.json"), reportBytes);
  await checkDirectory(output);
  return report;
}

const HELP = `Local observer capture (no harness execution, recording or uploads).
  prepare --input /private/preparation.json --store /private/new-journal
  event --store /private/journal --expect HEAD_SHA256 --session SESSION_ID --input /private/event.json [--record-now]
  correct --store /private/journal --expect HEAD_SHA256 --input /private/correction.json
  status --store /private/journal
  export --store /private/journal --expect HEAD_SHA256 --evidence-root /private/recordings --out /private/new-export
  protocol
Invoke with: node scripts/human-first-use-capture.mjs COMMAND FLAGS
Explicit UTC event times are required; --record-now requires at:null and timing:null
and labels the resulting timestamp operator-declared-now. It does not attest an event.
Close always requires an explicit observed timestamp and a subsequent attestation.
All input JSON keys are strict. Use status's headSha256 for optimistic updates.
Export writes study.json only when every planned session is closed and admissible;
otherwise it writes report.json plus retained journal history, with no subset study.
Exit 0: command completed (not validation/human proof); 2: blocked export report;
1: refusal/I/O error. Preserve partial output, reconcile conflicts, and use new paths.
Event/correction schema and recovery: docs/HUMAN_FIRST_USE_CAPTURE.md
`;

function argumentsFor(args) {
  const command = args[0];
  const required = {
    prepare: ["--input", "--store"], event: ["--store", "--expect", "--session", "--input"],
    correct: ["--store", "--expect", "--input"], status: ["--store"],
    export: ["--store", "--expect", "--evidence-root", "--out"], protocol: []
  };
  requireThat(Object.hasOwn(required, command), "arguments", "Choose a documented command; use --help for its flags.");
  const flags = Object.create(null);
  for (let index = 1; index < args.length; index += 1) {
    const key = args[index];
    requireThat(!Object.hasOwn(flags, key), "arguments", "Duplicate flags are ambiguous; supply each flag once.");
    if (key === "--record-now" && command === "event") { flags[key] = true; continue; }
    requireThat(required[command].includes(key), "arguments", "Unexpected flag; use --help for the exact command interface.");
    const value = args[++index];
    requireThat(typeof value === "string" && value.trim().length > 0 && !value.startsWith("--"), "arguments", "Every path, session and expected-head flag requires an explicit value.");
    flags[key] = value;
  }
  requireThat(required[command].every(key => Object.hasOwn(flags, key)), "arguments", "Required flags are missing; use --help for the exact command interface.");
  return { command, flags };
}

/** Import-safe command boundary. Persistence clocks never fill undeclared observation fields. */
export async function runCli(args = process.argv.slice(2), io = process) {
  try {
    if ((args.length === 1 && args[0] === "--help") || (args.length === 2 && args[1] === "--help")) {
      io.stdout.write(HELP); return 0;
    }
    const { command, flags: f } = argumentsFor(args);
    if (command === "protocol") { io.stdout.write(`${JSON.stringify({ protocol: COMMON_PROTOCOL, task: COMMON_TASK })}\n`); return 0; }
    let result;
    if (command === "prepare") result = await createCapture(await readCaptureJson(f["--input"]), f["--store"]);
    else if (command === "event") {
      let event = await readCaptureJson(f["--input"]);
      if (f["--record-now"]) event = declareRecordNow(event, new Date().toISOString());
      result = await appendCapture(f["--store"], f["--expect"], "event", { sessionId: f["--session"], event });
    } else if (command === "correct") result = await appendCapture(f["--store"], f["--expect"], "correction", await readCaptureJson(f["--input"]));
    else if (command === "status") { io.stdout.write(`${JSON.stringify(captureStatus(await loadCapture(f["--store"])))}\n`); return 0; }
    else {
      const report = await finalizeCapture(f["--store"], f["--expect"], f["--evidence-root"], f["--out"]);
      io.stdout.write(`${JSON.stringify({ exportStatus: report.exportStatus, studyWritten: report.studyWritten, reportWritten: true, headSha256: report.headSha256 })}\n`);
      return report.exportStatus === "complete-roster-export" ? 0 : 2;
    }
    io.stdout.write(`${JSON.stringify({ revision: result.revision, headSha256: result.headSha256, saved: true })}\n`);
    return 0;
  } catch (error) {
    io.stderr.write(`${JSON.stringify({ error: error instanceof CaptureError ? error.code : "local-io",
      message: error instanceof CaptureError ? error.message : "Local capture I/O failed. Check private paths and permissions, preserve partial artifacts, and consult --help; no private input is echoed." })}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli();
}
