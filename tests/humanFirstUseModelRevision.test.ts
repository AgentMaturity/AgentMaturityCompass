/** AMC-1512 AUTHORING ONLY / UNEXECUTED.
 * Every identity, pin, timestamp, declaration, affirmative human flag and recording
 * byte below is SYNTHETIC. No provider, harness or person is invoked. Files exist
 * only if these tests are later authorized and run in their own disposable roots.
 * Legacy characterization is adapted from the preserved model-revision proposal
 * packet; its standalone source and all existing credential regressions stay intact.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  COMMON_PROTOCOL, COMMON_TASK, SCHEMA_VERSION, CREDENTIAL_SCHEMA_VERSION,
  MODEL_REVISION_SCHEMA_VERSION, MODEL_REVISION_CONTRACT_VERSION, MIN_HUMAN_SESSIONS_PER_HARNESS,
  validateSession, validateStudy, validateModelRevisionIdentity, parseStudyJson, intakeStudy, runCli as intakeCli
} from "../scripts/human-first-use-intake.mjs";
import {
  CAPTURE_VERSION, CREDENTIAL_CAPTURE_VERSION, MODEL_REVISION_CAPTURE_VERSION,
  CaptureError, prepareDraft, intakeSchemaForCapture, hasCredentialContract,
  projectSession, applyRevision, createCapture, appendCapture, loadCapture,
  migrateCapture, migratePreparationDraft, captureStatus, finalizeCapture, runCli as captureCli
} from "../scripts/human-first-use-capture.mjs";
import { runCli as observerCli, sessionView } from "../scripts/human-first-use-observer.mjs";

type Identity = { version: string; status: string; reference: string | null; reason: string | null };
type Model = { kind: string; provider: string | null; id: string | null; revision: string | null;
  settingsSha256: string | null; credentialState: string; revisionIdentity?: Identity };
type Event = { type: string; at: string; timing: string; data: Record<string, unknown> };
type Question = { id: string; label: string; choices?: string[] };
type Step = [string, string | null | ((question: Question) => string | null)];
const NEW = MODEL_REVISION_CAPTURE_VERSION;
const stamp = (seconds: number) => new Date(Date.UTC(2026, 8, 1, 10) + seconds * 1000).toISOString();
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const encode = (value: unknown) => Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
const recordingBytes = (id: string) => `SYNTHETIC ${id}; PRIVATE_RECORDING_CANARY; no human or inference.\n`;
const event = (type: string, seconds: number, data: Record<string, unknown> = {}): Event =>
  ({ type, at: stamp(seconds), timing: "explicit-observed", data });
const codes = (errors: Array<{ code: string }>) => errors.map(item => item.code);
const refusal = (action: () => unknown, code: string) =>
  assert.throws(action, error => error instanceof CaptureError && error.code === code);
function head(state: { headSha256: unknown }): string {
  assert.equal(typeof state.headSha256, "string"); return state.headSha256 as string;
}
function plan(id = "amc-synthetic", status = "unknown", harness = "amc", version = NEW) {
  const model: Model = { kind: "local-provider", provider: "synthetic-provider", id: "synthetic-requested-alias",
    revision: status === "declared-immutable" ? "synthetic-immutable-revision" : null,
    settingsSha256: hash("synthetic settings"), credentialState: version === CAPTURE_VERSION ? "configured" : "missing" };
  if (version === NEW) model.revisionIdentity = { version: MODEL_REVISION_CONTRACT_VERSION, status,
    reference: "synthetic-floating-reference", reason: status === "unknown" ? "PRIVATE_REASON_CANARY: synthetic undisclosed immutable revision" : null };
  else model.revision = "synthetic-legacy-reference";
  return { sessionId: id, participation: "automated-fixture", participantId: `p-${id}`, observerId: "o-synthetic",
    harness: { name: harness, version: "synthetic-only", sourceCommit: "a".repeat(40), artifactSha256: null },
    environment: { machineClass: "synthetic-machine", os: "darwin", osVersion: "synthetic-only", arch: "arm64", nodeVersion: "22.0.0", installState: "clean" }, model };
}
type Plan = ReturnType<typeof plan>;
function preparation(plans = [plan()]) {
  return { studyId: "synthetic-model-revision", preparedAt: stamp(0),
    operator: { id: "o-synthetic", statement: "Synthetic preparation, not participation" },
    protocol: { ...COMMON_PROTOCOL }, task: COMMON_TASK,
    observationWindowRule: "Synthetic full task, recovery and optional-return window",
    assistancePolicy: "Synthetic explicit assistance and unknown actor policy", plannedSessions: plans };
}
function closeData(p: Plan, used: boolean, version = NEW) {
  return { completeness: { actions: true, assistance: true, setupFailures: true, refusals: true,
      ...(version !== CAPTURE_VERSION ? { credentials: true } : {}) }, modelUsed: used,
    observer: { humanPresent: false, independent: false, consentRecorded: false, firstUse: false,
      statement: "SYNTHETIC FLAGS ONLY; no human participated", recordedAt: stamp(10) },
    recordingPath: `${p.sessionId}.txt` as string | null, windowRuleSatisfied: true, windowRuleDeviation: null };
}
function sequence(p = plan(), outcome = "completed", used = outcome === "completed", version = NEW, actor = "participant"): Event[] {
  const events = [event("start", 1), event("submitted-action", 2, { description: "Synthetic intentionally submitted operation" }),
    event("setup-failure", 2, { code: "synthetic-setup", detail: "Synthetic retained setup obstacle" }),
    event("refusal", 2, { code: "synthetic-refusal", namedFix: null })];
  if (version !== CAPTURE_VERSION && used) {
    if (["missing", "unknown"].includes(p.model.credentialState)) events.push(event("credential-change", 3, { from: p.model.credentialState, to: "configured", actor }));
    events.push(event("model-use", 4, { credentialState: p.model.credentialState === "not-required" ? "not-required" : "configured" }));
  }
  events.push(outcome === "completed" ? event("useful-result", 5, { judgement: "Synthetic answer judgement" })
    : event("first-task-ended", 5, { outcome, reason: "Synthetic first attempt without useful result" }),
  event("interruption", 6, { reason: "Synthetic separate recovery exercise" }),
  event("resume", 7, { outcome: "succeeded", reason: null }),
  event("second-task", 8, { outcome: "not-observed", reason: "Synthetic missing return observation" }),
  event("close", 9, closeData(p, used, version)));
  return events;
}
const closeOf = (events: Event[]) => events.at(-1)!.data as ReturnType<typeof closeData>;
const replay = (p: Plan, events: Event[], version = NEW) => projectSession(p, events, stamp(0), version);
// Independent intake rows: not obtained by calling capture projection.
function row(p = plan(), outcome = "completed", used = outcome === "completed", version = NEW, human = false) {
  const events = sequence(p, outcome, used, version), close = closeData(p, used, version);
  return { sessionId: p.sessionId, participation: human ? "human-declared" : "automated-fixture", participantId: p.participantId,
    observer: { id: p.observerId, ...close.observer, humanPresent: human, independent: human, consentRecorded: human, firstUse: human },
    harness: p.harness, environment: p.environment, protocol: { ...COMMON_PROTOCOL },
    model: { ...structuredClone(p.model), used, ...(version !== CAPTURE_VERSION ? { credentials: {
      version: "1", startingState: p.model.credentialState, coverageComplete: true,
      observations: events.filter(item => ["credential-change", "model-use"].includes(item.type)) } } : {}) },
    measurements: { startedAt: stamp(1), endedAt: stamp(9), outcome,
      firstUsefulResultAt: outcome === "completed" ? stamp(5) : null,
      actionsToFirstUsefulResult: outcome === "completed" ? 1 : null,
      noResultReason: outcome === "completed" ? null : "Synthetic no useful result",
      assistanceCount: 0 as number | null, setupFailures: [{ at: stamp(2), code: "synthetic-setup", detail: "Synthetic retained failure" }],
      refusals: [{ at: stamp(2), code: "synthetic-refusal", namedFix: null }],
      interruption: { at: stamp(6), resumedAt: stamp(7), resumeOutcome: "succeeded", reason: null },
      secondTask: { outcome: "not-observed", at: null, reason: "Synthetic missing return" } },
    recording: { path: `${p.sessionId}.txt`, sha256: hash(recordingBytes(p.sessionId)) } };
}
type Row = ReturnType<typeof row>;
const study = (rows: Row[], schemaVersion = MODEL_REVISION_SCHEMA_VERSION) => ({ schemaVersion, studyId: "synthetic-model-revision", sessions: rows });
const validate = (record: Row, schema = MODEL_REVISION_SCHEMA_VERSION) => validateSession(record, "session", schema);
function apply(state: ReturnType<typeof applyRevision> | null, kind: string, payload: unknown, version = state?.draft.captureVersion ?? NEW) {
  const record = { captureVersion: version, revision: state ? state.revision + 1 : 0,
    previousSha256: state ? head(state) : null, savedAt: stamp(100), kind, payload }, bytes = encode(record);
  return applyRevision(state, record, hash(bytes), bytes.length);
}
let root = "", store = "", evidence = "";
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "amc-model-revision-")));
  store = join(root, "journal"); evidence = join(root, "recordings"); await mkdir(evidence);
});
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = ""; });
async function snapshot(path = store) {
  const result = [];
  for (const name of (await readdir(path)).sort()) result.push({ name, bytes: await readFile(join(path, name)) });
  return result;
}
async function record(p: Plan) { await writeFile(join(evidence, `${p.sessionId}.txt`), recordingBytes(p.sessionId), { flag: "wx" }); }
async function persist(plans: Plan[], sequences: Event[][], version = NEW) {
  let state = await createCapture(preparation(plans), store, stamp(100), version);
  for (const [index, events] of sequences.entries()) for (const observation of events) {
    state = await appendCapture(store, head(state), "event", { sessionId: plans[index]!.sessionId, event: observation }, stamp(100));
  }
  return state;
}
function cliIo() {
  const captured = { stdout: "", stderr: "" };
  return { captured, io: { stdout: { write: (text: string) => { captured.stdout += text; } }, stderr: { write: (text: string) => { captured.stderr += text; } } } };
}
function prompts(steps: Step[]) {
  const remaining = [...steps], captured = { output: "", error: "", mismatches: [] as string[] };
  return { captured, io: { now: () => stamp(100), output: (text: string) => { captured.output += text; },
    error: (text: string) => { captured.error += text; }, prompt: async (question: Question) => {
      const step = remaining.shift();
      if (!step || step[0] !== question.id) {
        captured.mismatches.push(`Expected ${step?.[0] ?? "no prompt"}, got ${question.id}`); throw new Error("Unexpected synthetic prompt");
      }
      return typeof step[1] === "function" ? step[1](question) : step[1];
    } }, drained() { expect(captured.mismatches).toEqual([]); expect(remaining).toEqual([]); } };
}

describe("prospective typed revision admission and frozen declarations", () => {
  it("selects a new version without changing legacy defaults or adding observations", () => {
    const p = plan(), input = preparation([p]), before = structuredClone(input), draft = prepareDraft(input, NEW);
    expect(NEW).toBe("2026-09-11.1"); expect(MODEL_REVISION_SCHEMA_VERSION).toBe("2026-09-11");
    expect(intakeSchemaForCapture(CAPTURE_VERSION)).toBe(SCHEMA_VERSION);
    expect(intakeSchemaForCapture(CREDENTIAL_CAPTURE_VERSION)).toBe(CREDENTIAL_SCHEMA_VERSION);
    expect(draft.plannedSessions).toEqual(before.plannedSessions); expect(draft.migration).toBeNull();
    expect(p.model).not.toHaveProperty("used"); expect(p.model).not.toHaveProperty("credentials");
    expect(intakeSchemaForCapture(NEW)).toBe(MODEL_REVISION_SCHEMA_VERSION); expect(hasCredentialContract(NEW)).toBe(true);
    const state = apply(null, "prepare", draft);
    expect(captureStatus(state).sessions[0].status).toBe("unobserved");
    draft.plannedSessions[0].model.revisionIdentity.status = "declared-immutable";
    expect(input).toEqual(before);
    expect(prepareDraft(preparation([plan("old", "unknown", "amc", CAPTURE_VERSION)])).captureVersion).toBe("2026-09-09.1");
  });

  it.each(["completed", "failed", "incomplete"])("admits used unknown revision with a %s outcome without inferring success", outcome => {
    const p = plan(), events = sequence(p, outcome, true), before = structuredClone({ p, events });
    const projected = replay(p, events);
    expect(projected.status).toBe("closed"); expect(projected.model.revision).toBeNull();
    expect(projected.model.revisionIdentity).toEqual(p.model.revisionIdentity);
    expect(projected.model.credentialState).toBe("missing"); expect(projected.model.used).toBe(true);
    const direct = row(p, outcome, true); expect(validate(direct)).toEqual([]);
    expect(projected.measurements!.outcome).toBe(outcome);
    if (outcome !== "completed") expect(projected.measurements!).toMatchObject({ firstUsefulResultAt: null, actionsToFirstUsefulResult: null });
    expect({ p, events }).toEqual(before);
  });

  const contradictions: Array<[string, (p: Plan) => void, string]> = [
    ["unknown carrying a pin", p => { p.model.revision = "synthetic-forged-pin"; }, "model-revision-conflict"],
    ["immutable without revision", p => { p.model.revisionIdentity!.status = "declared-immutable"; p.model.revisionIdentity!.reason = null; }, "required"],
    ["no unknown reason", p => { p.model.revisionIdentity!.reason = null; }, "required"],
    ["empty reason", p => { p.model.revisionIdentity!.reason = " "; }, "format"],
    ["unsupported identity version", p => { p.model.revisionIdentity!.version = "2"; }, "enum"],
    ["numeric version", p => { Reflect.set(p.model.revisionIdentity!, "version", 1); }, "enum"],
    ["missing reference member", p => { Reflect.deleteProperty(p.model.revisionIdentity!, "reference"); }, "required"],
    ["extra identity member", p => { Object.assign(p.model.revisionIdentity!, { authenticated: true }); }, "unknown-field"],
    ["non-string reference", p => { Reflect.set(p.model.revisionIdentity!, "reference", {}); }, "format"],
    ["oversized reference", p => { p.model.revisionIdentity!.reference = "x".repeat(257); }, "format"],
    ["control-bearing reason", p => { p.model.revisionIdentity!.reason = "synthetic\nreason"; }, "format"],
    ["oversized reason", p => { p.model.revisionIdentity!.reason = "x".repeat(2049); }, "format"],
    ["provider not-applicable", p => { Object.assign(p.model.revisionIdentity!, { status: "not-applicable", reference: null, reason: null }); }, "model-revision-conflict"]
  ];
  it.each(contradictions)("refuses %s in both real preparation and independent intake", async (_label, mutate, code) => {
    const p = plan(); expect(validate(row(p))).toEqual([]); expect(prepareDraft(preparation([p]), NEW).captureVersion).toBe(NEW);
    mutate(p); const before = structuredClone(p);
    refusal(() => prepareDraft(preparation([p]), NEW), code);
    expect(codes(validate(row(p)))).toContain(code);
    await expect(createCapture(preparation([p]), store, stamp(100), NEW)).rejects.toMatchObject({ code });
    await expect(stat(store)).rejects.toMatchObject({ code: "ENOENT" }); expect(p).toEqual(before);
  });

  it("supports only demo not-applicable, and requires an immutable declaration's null reason", () => {
    const p = plan("demo"); Object.assign(p.model, { kind: "keyless-demo", provider: null, id: null, revision: null, settingsSha256: null, credentialState: "not-required" });
    p.model.revisionIdentity = { version: "1", status: "not-applicable", reference: null, reason: null };
    expect(prepareDraft(preparation([p]), NEW).plannedSessions[0].model).toEqual(p.model);
    expect(validate(row(p, "incomplete", false))).toEqual([]);
    refusal(() => replay(p, [event("start", 1), event("model-use", 2, { credentialState: "not-required" })]), "credential-use-conflict");
    p.model.revisionIdentity.status = "unknown"; p.model.revisionIdentity.reason = "Synthetic reason";
    expect(codes(validateModelRevisionIdentity(p.model))).toContain("model-revision-conflict");
    const known = plan("known", "declared-immutable"); known.model.revisionIdentity!.reason = "Synthetic contradictory unknown reason";
    refusal(() => prepareDraft(preparation([known]), NEW), "model-revision-conflict");
  });

  it("keeps unknown identity separate from credential chronology, assistance and actual-use evidence", () => {
    const p = plan(), events = sequence(p, "completed", true, NEW, "unknown");
    events.splice(5, 0, event("assistance", 3, { detail: "Synthetic later known help" }));
    const projected = replay(p, events); expect(projected.measurements!.assistanceCount).toBeNull();
    closeOf(events).completeness.credentials = false;
    expect(codes(replay(p, events).blockers)).toContain("credential-coverage-missing");
    refusal(() => replay(p, [event("start", 1), event("model-use", 2, { credentialState: "configured" })]), "credential-use-conflict");
    const direct = row(p); direct.model.credentials!.observations.reverse();
    expect(codes(validate(direct))).toContain("credential-use-conflict");
    const unused = sequence(p, "failed", false); expect(replay(p, unused).status).toBe("closed");
    closeOf(unused).modelUsed = true;
    expect(codes(replay(p, unused).blockers)).toContain("credential-use-missing");
    const operator = replay(p, sequence(p, "completed", true, NEW, "operator"));
    expect(operator.measurements!.assistanceCount).toBe(1);
  });

  it("refuses baseline/served-label rewrites through corrections and use events without advancing the journal", async () => {
    const p = plan(), events = sequence(p), state = await persist([p], [events]), before = await snapshot();
    const correction = { sessionId: p.sessionId, declaredAt: stamp(20), reason: "Synthetic correction", events };
    await expect(appendCapture(store, head(state), "correction", { ...correction, model: plan("new", "declared-immutable").model }, stamp(100))).rejects.toMatchObject({ code: "schema" });
    const replacement = structuredClone(events);
    Object.assign(replacement.find(item => item.type === "model-use")!.data, { returnedModelLabel: "synthetic-new-label" });
    await expect(appendCapture(store, head(state), "correction", { ...correction, events: replacement }, stamp(100))).rejects.toMatchObject({ code: "schema" });
    expect(await snapshot()).toEqual(before); expect(head(await loadCapture(store))).toBe(head(state));
    closeOf(events).completeness.assistance = false;
    const next = await appendCapture(store, head(state), "correction", correction, stamp(100));
    expect(next.draft.plannedSessions).toEqual([p]); expect((await snapshot()).slice(0, before.length)).toEqual(before);
    expect(sessionView(await loadCapture(store), p.sessionId).projection.model.revision).toBeNull();
  });
});

describe("legacy characterization, serialization and migration isolation", () => {
  it.each([CAPTURE_VERSION, CREDENTIAL_CAPTURE_VERSION])("preserves old %s behavior and exact preparation serialization", async version => {
    const p = plan("old", "unknown", "amc", version), input = preparation([p]); p.model.credentialState = "configured";
    const state = await createCapture(input, store, stamp(100), version);
    const expected = { captureVersion: version, revision: 0, previousSha256: null, savedAt: stamp(100), kind: "prepare",
      payload: { captureVersion: version, ...input, ...(version === CREDENTIAL_CAPTURE_VERSION ? { migration: null } : {}) } };
    expect(await readFile(join(store, "r-00000.json"))).toEqual(encode(expected));
    expect(head(state)).toBe(hash(encode(expected)));
    for (const value of ["synthetic-floating-reference", "unknown"]) {
      p.model.revision = value; expect(prepareDraft(input, version).plannedSessions[0].model.revision).toBe(value);
    }
    p.model.revision = null; refusal(() => prepareDraft(input, version), "schema");
    const schema = intakeSchemaForCapture(version), unused = row(p, "failed", false, version), used = row(p, "failed", true, version);
    expect(validate(unused, schema)).toEqual([]); expect(codes(validate(used, schema))).toContain("model-identity-missing");
    expect(codes(validate(row(), schema))).toContain("unknown-field");
    refusal(() => prepareDraft(preparation(), version), "schema");
    Reflect.deleteProperty(unused.model, "revision"); expect(codes(validate(unused, schema))).toContain("required");
  });

  it("refuses mixed versions, untyped relabels and migration metadata in a new-model draft", () => {
    const modern = apply(null, "prepare", prepareDraft(preparation(), NEW));
    for (const version of [CAPTURE_VERSION, CREDENTIAL_CAPTURE_VERSION]) {
      const p = plan("old", "unknown", "amc", version), old = apply(null, "prepare", prepareDraft(preparation([p]), version), version);
      refusal(() => apply(old, "event", { sessionId: p.sessionId, event: event("start", 1) }, NEW), "version");
      refusal(() => apply(modern, "event", { sessionId: "amc-synthetic", event: event("start", 1) }, version), "version");
      const relabelled = { ...old.draft, captureVersion: NEW, migration: null };
      refusal(() => apply(null, "prepare", relabelled, NEW), "schema");
      expect(validateStudy(study([row(p, "failed", false, version), row()])).records.some((r: { errors: unknown[] }) => r.errors.length)).toBe(true);
    }
    const migration = { fromVersion: CAPTURE_VERSION, sourceHeadSha256: "a".repeat(64), declaredAt: stamp(2), reason: "Synthetic forged migration", startingStatesUnchanged: true };
    refusal(() => apply(null, "prepare", { ...modern.draft, migration }), "migration-version");
    refusal(() => migratePreparationDraft(modern, head(modern), { declaredAt: stamp(2), reason: "Synthetic", startingStatesUnchanged: true }), "migration-version");
    refusal(() => prepareDraft(preparation(), "future"), "version");
  });

  it("keeps legacy migration credential-only, retains source bytes and enforces the migration correction floor", async () => {
    const p = plan("old", "unknown", "amc", CAPTURE_VERSION), source = await createCapture(preparation([p]), store, stamp(100));
    const before = await snapshot(), declaration = { declaredAt: stamp(10), reason: "Synthetic prospective credential fork", startingStatesUnchanged: true };
    const destination = join(root, "credential-fork"), migrated = await migrateCapture(store, head(source), destination, declaration, stamp(100));
    expect(migrated.draft.captureVersion).toBe(CREDENTIAL_CAPTURE_VERSION);
    expect(migrated.draft.plannedSessions).toEqual([p]); expect(migrated.draft.plannedSessions[0].model).not.toHaveProperty("revisionIdentity");
    const forkBefore = await snapshot(destination);
    await expect(appendCapture(destination, head(migrated), "correction", { sessionId: p.sessionId, declaredAt: stamp(9), reason: "Synthetic backdated empty correction", events: [] }, stamp(100))).rejects.toMatchObject({ code: "correction-order" });
    expect(await snapshot(destination)).toEqual(forkBefore); expect(await snapshot()).toEqual(before);
    const input = join(root, "migration.json"); await writeFile(input, encode(declaration)); const io = cliIo();
    expect(await captureCli(["migrate", "--store", store, "--expect", head(source), "--input", input, "--out", join(root, "unsupported"), "--capture-version", NEW], io.io)).toBe(1);
    expect(JSON.parse(io.captured.stderr).error).toBe("arguments");
    await expect(stat(join(root, "unsupported"))).rejects.toMatchObject({ code: "ENOENT" });
    const observed = await appendCapture(store, head(source), "event", { sessionId: p.sessionId, event: event("start", 1) }, stamp(100));
    const cleared = await appendCapture(store, head(observed), "correction", { sessionId: p.sessionId, declaredAt: stamp(2), reason: "Synthetic clear retains observed history", events: [] }, stamp(100));
    await expect(migrateCapture(store, head(cleared), join(root, "refused"), declaration, stamp(100))).rejects.toMatchObject({ code: "migration-observed" });
  });

  it("cold-load rejects a well-linked cross-version revision without a valid-prefix export", async () => {
    const p = plan(), state = await persist([p], [[]]);
    const hostile = encode({ captureVersion: CREDENTIAL_CAPTURE_VERSION, revision: 1, previousSha256: head(state), savedAt: stamp(100), kind: "event", payload: { sessionId: p.sessionId, event: event("start", 1) } });
    await writeFile(join(store, "r-00001.json"), hostile, { flag: "wx" }); const before = await snapshot();
    await expect(loadCapture(store)).rejects.toMatchObject({ code: "version" });
    const out = join(root, "refused-export");
    await expect(finalizeCapture(store, hash(hostile), evidence, out, stamp(100))).rejects.toMatchObject({ code: "version" });
    await expect(stat(out)).rejects.toMatchObject({ code: "ENOENT" }); expect(await snapshot()).toEqual(before);
  });
});

async function cohort(prefix: string, status = "unknown", version = NEW) {
  const rows: Row[] = [];
  for (const harness of ["amc", "dsh", "pi"]) for (let i = 0; i < MIN_HUMAN_SESSIONS_PER_HARNESS; i += 1) {
    const p = plan(`${prefix}-${harness}-${i}`, status, harness, version);
    // Affirmative human flags only reach the declared-cohort path; they are not human evidence.
    await record(p); rows.push(row(p, i === 0 ? "failed" : "completed", i !== 0, version, true));
  }
  return rows;
}
describe("conservative comparison without erasing unknown or failed rows", () => {
  it("withholds matching and CLI success for sufficient equal unknown-alias cohorts", async () => {
    const rows = await cohort("unknown"), input = study(rows), before = structuredClone(input);
    const result = await intakeStudy(input, { evidenceRoot: evidence, generatedAt: stamp(100) });
    expect(result.intakeStatus).toBe("valid-records");
    expect(result.comparative).toMatchObject({ status: "insufficient-evidence", modelMatchBasis: "insufficient-provenance", servedModelMatch: "not-established", modelIdentityAuthenticated: false });
    expect(result.comparative.cohorts).toHaveLength(1);
    expect(result.comparative.cohorts[0].reasons).toContain("unknown-immutable-model-revision");
    expect(result.comparative.cohorts[0].summaries).toBeNull();
    expect(result.records.map((r: { sessionId: string | null }) => r.sessionId)).toEqual(rows.map(r => r.sessionId));
    expect(result.records.every(r => r.model?.revision === null)).toBe(true);
    expect(result.records[0].declaredOutcome).toBe("failed"); expect(input).toEqual(before);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_REASON_CANARY");
    expect(result.records[0].model?.revisionIdentity).toMatchObject({ status: "unknown", reasonRecorded: true });
    const file = join(root, "study.json"), out = join(root, "intake.json"), io = cliIo(); await writeFile(file, encode(input));
    expect(await intakeCli(["--input", file, "--evidence-root", evidence, "--out", out], io.io)).toBe(2);
    expect(JSON.parse(io.captured.stdout).comparativeStatus).toBe("insufficient-evidence");
  });

  it("permits only declared known matching and never authenticates the served model", async () => {
    const rows = await cohort("known", "declared-immutable"), result = await intakeStudy(study(rows), { evidenceRoot: evidence });
    expect(result.comparative).toMatchObject({ status: "matched-declared-cohorts", modelMatchBasis: "declared-immutable-planning-identities", servedModelMatch: "not-established", modelIdentityAuthenticated: false, humanParticipationAuthenticated: false, ranking: null, superiorityClaim: null });
    const group = result.comparative.cohorts[0]; expect(group.servedModelMatch).toBe("not-established");
    assert(group.summaries); expect(group.summaries.amc.outcomes.failed).toBe(1);
    const input = join(root, "known-study.json"), io = cliIo(); await writeFile(input, encode(study(rows)));
    expect(await intakeCli(["--input", input, "--evidence-root", evidence, "--out", join(root, "known-intake.json")], io.io)).toBe(0);
    Object.assign(rows[0]!.model, { servedModelMatch: "verified", returnedModelLabels: ["synthetic-label"] });
    const refused = await intakeStudy(study(rows), { evidenceRoot: evidence });
    expect(refused.intakeStatus).toBe("invalid"); expect(refused.records[0].model).toBeNull();
    expect(refused.comparative.servedModelMatch).toBe("not-established");
  });

  it.each(["unknown", "invalid"])("does not hide an additional %s failed/no-use stratum behind a known cohort", async kind => {
    const rows = await cohort("known", "declared-immutable"), p = plan("extra-unknown"); await record(p);
    const extra = row(p, "failed", false, NEW, true);
    if (kind === "invalid") extra.model.revision = "synthetic-contradiction";
    rows.push(extra); const result = await intakeStudy(study(rows), { evidenceRoot: evidence });
    expect(result.records).toHaveLength(rows.length); expect(result.records.at(-1)?.declaredOutcome).toBe("failed");
    expect(result.comparative.status).toBe("insufficient-evidence");
    if (kind === "unknown") {
      expect(result.intakeStatus).toBe("valid-records");
      const unknown = result.comparative.cohorts.find((c: { reasons: string[] }) => c.reasons.includes("unknown-immutable-model-revision"));
      assert(unknown); expect(unknown.summaries).toBeNull();
    } else expect(result.comparative.cohorts.every((c: { summaries: unknown }) => c.summaries === null)).toBe(true);
  });

  it("keeps reason narratives out of equality while preserving exact reference distinctions and automation exclusion", async () => {
    const rows = await cohort("unknown"), initial = await intakeStudy(study(rows), { evidenceRoot: evidence });
    rows[0]!.model.revisionIdentity!.reason = "A different synthetic unknown explanation";
    const same = await intakeStudy(study(rows), { evidenceRoot: evidence });
    expect(same.comparative.cohorts[0].cohortId).toBe(initial.comparative.cohorts[0].cohortId);
    rows[0]!.model.revisionIdentity!.reference = " Synthetic-Floating-Reference ";
    const separate = await intakeStudy(study(rows), { evidenceRoot: evidence }); expect(separate.comparative.cohorts).toHaveLength(2);
    for (const r of rows) r.participation = "automated-fixture";
    const automated = await intakeStudy(study(rows), { evidenceRoot: evidence });
    expect(automated.comparative.cohorts).toEqual([]); expect(automated.comparative.excludedAutomatedRecords).toBe(rows.length);
    expect(automated.comparative.modelIdentityAuthenticated).toBe(false);
  });

  it.each([CAPTURE_VERSION, CREDENTIAL_CAPTURE_VERSION])("preserves old %s alias characterization and cohort key without new output fields", async version => {
    const rows = await cohort("old", "declared-immutable", version), schema = intakeSchemaForCapture(version);
    for (const r of rows) r.model.revision = "unknown"; // Hostile old sentinel, not an actual identity or recommended pin.
    const result = await intakeStudy(study(rows, schema), { evidenceRoot: evidence });
    expect(result.comparative.status).toBe("matched-declared-cohorts");
    expect(result.comparative).not.toHaveProperty("servedModelMatch");
    const p = rows[0]!.protocol, e = rows[0]!.environment, m = rows[0]!.model;
    const expectedKey = [p.id, p.version, p.taskId, p.taskVersion, p.taskSha256, e.machineClass, e.os, e.osVersion, e.arch,
      e.nodeVersion, e.installState, m.kind, m.provider, m.id, m.revision, m.settingsSha256, m.credentialState,
      ...(version === CREDENTIAL_CAPTURE_VERSION ? ["credential-contract", "1"] : [])];
    expect(result.comparative.cohorts[0].cohortId).toBe(hash(JSON.stringify(expectedKey)));
    for (const r of rows) { r.model.revision = null; r.model.used = false; if (r.model.credentials) r.model.credentials.observations = [];
      r.measurements.outcome = "failed"; r.measurements.firstUsefulResultAt = null; r.measurements.actionsToFirstUsefulResult = null; r.measurements.noResultReason = "Synthetic no result"; }
    const limited = await intakeStudy(study(rows, schema), { evidenceRoot: evidence });
    expect(limited.intakeStatus).toBe("valid-records"); expect(limited.comparative.status).toBe("insufficient-evidence");
    expect(limited.comparative.cohorts[0].reasons).toContain("unmatched-model-identity");
  });
});

describe("new-version persisted full roster and privacy", () => {
  it("exports closed unknown-revision failures and preserves the declaration on cold read", async () => {
    const plans = [plan("complete"), plan("failed"), plan("incomplete")];
    const sequences = [sequence(plans[0]!, "completed", true, NEW, "unknown"), sequence(plans[1]!, "failed", true), sequence(plans[2]!, "incomplete", false)];
    const state = await persist(plans, sequences); for (const p of plans) await record(p); const before = await snapshot();
    const out = join(root, "export"), report = await finalizeCapture(store, head(state), evidence, out, stamp(100));
    const bytes = await readFile(join(out, "study.json")), exported = JSON.parse(bytes.toString("utf8"));
    expect(report.exportStatus).toBe("complete-roster-export"); expect(report.studySha256).toBe(hash(bytes));
    expect(exported.schemaVersion).toBe(MODEL_REVISION_SCHEMA_VERSION);
    expect(exported.sessions.map((r: { sessionId: string }) => r.sessionId)).toEqual(plans.map(p => p.sessionId));
    expect(exported.sessions[0].measurements.assistanceCount).toBeNull();
    expect(exported.sessions[1].measurements).toMatchObject({ outcome: "failed", firstUsefulResultAt: null, actionsToFirstUsefulResult: null });
    expect(exported.sessions[2].model.used).toBe(false);
    expect((await loadCapture(join(out, "journal"))).draft.plannedSessions).toEqual(plans);
    expect(await snapshot(join(out, "journal"))).toEqual(before); expect(await snapshot()).toEqual(before);
    const result = await intakeStudy(exported, { evidenceRoot: evidence }); expect(result.intakeStatus).toBe("valid-records");
    expect(result.comparative).toMatchObject({ status: "insufficient-evidence", modelIdentityAuthenticated: false });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_REASON_CANARY"); expect(JSON.stringify(report)).not.toContain("PRIVATE_RECORDING_CANARY");
    await expect(finalizeCapture(store, head(state), evidence, out, stamp(100))).rejects.toMatchObject({ code: "output-exists-or-unavailable" });
  });

  it("blocks the whole export for no-show/open/coverage/recording gaps beside ready and failed unknown rows", async () => {
    const plans = ["ready", "failed", "no-show", "open", "coverage", "recording-gap"].map(id => plan(id));
    const partial = sequence(plans[4]!); closeOf(partial).completeness.credentials = false;
    const state = await persist(plans, [sequence(plans[0]!), sequence(plans[1]!, "failed", false), [], [event("start", 1)], partial, sequence(plans[5]!)]);
    for (const p of plans.slice(0, 5)) await record(p); const before = await snapshot(), out = join(root, "blocked");
    const report = await finalizeCapture(store, head(state), evidence, out, stamp(100));
    expect(report.exportStatus).toBe("blocked"); expect(report.studyWritten).toBe(false); expect(report.studySha256).toBeNull();
    expect(report.sessions.map((r: { sessionId: string }) => r.sessionId)).toEqual(plans.map(p => p.sessionId));
    expect(report.sessions[0].status).toBe("ready"); expect(report.failedFirstTaskSessionIds).toEqual(["failed"]);
    expect(report.unobservedPlannedSessionIds).toEqual(["no-show"]); expect(report.unclosedSessionIds).toEqual(["open"]);
    expect(codes(report.sessions[4].blockers)).toContain("credential-coverage-missing"); expect(report.sessions[5].status).toBe("closed-blocked");
    await expect(stat(join(out, "study.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await snapshot(join(out, "journal"))).toEqual(before); expect(await snapshot()).toEqual(before);
  });

  it("refuses duplicate keys/secret-shaped fields, keeps reason private and still requires recording-byte equality", async () => {
    expect(() => parseStudyJson('{"revisionIdentity":{"status":"unknown","status":"declared-immutable"}}')).toThrow(/Duplicate JSON/);
    expect(() => parseStudyJson(String.raw`{"revisionIdentity":{"version":"1","\u0076ersion":"2"}}`)).toThrow(/Duplicate JSON/);
    const p = plan(), r = row(p); await record(p);
    Object.assign(r.model.revisionIdentity!, { PRIVATE_SECRET_KEY_CANARY: "PRIVATE_SECRET_VALUE_CANARY" });
    const invalid = await intakeStudy(study([r]), { evidenceRoot: evidence });
    expect(invalid.records[0].model).toBeNull(); expect(codes(invalid.records[0].errors)).toContain("unknown-field");
    expect(JSON.stringify(invalid)).not.toContain("PRIVATE_SECRET_KEY_CANARY"); expect(JSON.stringify(invalid)).not.toContain("PRIVATE_SECRET_VALUE_CANARY");
    const valid = row(p); valid.recording.sha256 = hash("SYNTHETIC WRONG EXPECTED BYTES");
    const mismatch = await intakeStudy(study([valid]), { evidenceRoot: evidence });
    expect(codes(mismatch.records[0].errors)).toContain("recording-hash-mismatch");
    valid.recording.path = "../outside"; expect(codes(validate(valid))).toContain("recording-path");
  });
});

function planSteps(p: Plan, version = NEW): Step[] {
  const prefix = "plannedSessions.0", steps: Step[] = [
    [`${prefix}.sessionId`, p.sessionId], [`${prefix}.participation`, p.participation], [`${prefix}.participantId`, p.participantId], [`${prefix}.observerId`, p.observerId],
    [`${prefix}.harness.name`, p.harness.name], [`${prefix}.harness.version`, p.harness.version], [`${prefix}.harness.pins`, "source"], [`${prefix}.harness.sourceCommit`, p.harness.sourceCommit],
    [`${prefix}.environment.machineClass`, p.environment.machineClass], [`${prefix}.environment.os`, p.environment.os], [`${prefix}.environment.osVersion`, p.environment.osVersion],
    [`${prefix}.environment.arch`, p.environment.arch], [`${prefix}.environment.nodeVersion`, p.environment.nodeVersion], [`${prefix}.environment.installState`, p.environment.installState],
    [`${prefix}.model.kind`, p.model.kind]
  ];
  if (p.model.kind === "keyless-demo") return steps;
  steps.push([`${prefix}.model.provider`, p.model.provider], [`${prefix}.model.id`, p.model.id]);
  if (version === NEW) {
    steps.push([`${prefix}.model.revisionIdentity.status`, p.model.revisionIdentity!.status]);
    if (p.model.revisionIdentity!.status === "declared-immutable") steps.push([`${prefix}.model.revision`, p.model.revision]);
    steps.push([`${prefix}.model.revisionIdentity.reference`, p.model.revisionIdentity!.reference ?? "none"]);
    if (p.model.revisionIdentity!.status === "unknown") steps.push([`${prefix}.model.revisionIdentity.reason`, p.model.revisionIdentity!.reason]);
  } else steps.push([`${prefix}.model.revision`, p.model.revision]);
  steps.push([`${prefix}.model.settingsSha256`, p.model.settingsSha256], [`${prefix}.model.credentialState`, p.model.credentialState]);
  return steps;
}
function wizardSteps(p: Plan, version = NEW): Step[] {
  const input = preparation([p]);
  return [["studyId", input.studyId], ["preparedAt", input.preparedAt], ["operator.id", input.operator.id], ["operator.statement", input.operator.statement],
    ["observationWindowRule", input.observationWindowRule], ["assistancePolicy", input.assistancePolicy], ["session-count", "1"], ...planSteps(p, version)];
}
describe("public opt-in and guided nullable-revision entry", () => {
  it.each(["unknown", "declared-immutable"])("collects a complete %s wizard through explicit review", async status => {
    const p = plan("guided", status), script = prompts([...wizardSteps(p), ["prepare.review", "create"]]);
    expect(await observerCli(["prepare", "--store", store, "--capture-version", NEW], script.io)).toBe(0); script.drained();
    const state = await loadCapture(store); expect(state.draft.plannedSessions).toEqual([p]); expect(state.sessions.get(p.sessionId)).toEqual([]);
    expect(script.captured.output).toContain("FULL PLANNED POPULATION"); expect(script.captured.output).toContain("Served model match: not established");
  });

  it.each([CAPTURE_VERSION, CREDENTIAL_CAPTURE_VERSION])("retains the exact old %s wizard prompt path", async version => {
    const p = plan("old-guided", "unknown", "amc", version), script = prompts([...wizardSteps(p, version), ["prepare.review", "create"]]);
    const flags = version === CAPTURE_VERSION ? [] : ["--capture-version", version];
    expect(await observerCli(["prepare", "--store", store, ...flags], script.io)).toBe(0); script.drained();
    expect((await loadCapture(store)).draft.plannedSessions[0].model).not.toHaveProperty("revisionIdentity");
  });

  it.each(["pause", null])("never creates a reviewed file preparation on %s", async answer => {
    const p = plan(), input = join(root, "input.json"); await writeFile(input, encode(preparation([p]))); const before = await readFile(input);
    const script = prompts([["prepare.review", question => { expect(question.choices).toContain("create"); return answer; }]]);
    expect(await observerCli(["prepare", "--store", store, "--input", input, "--capture-version", NEW], script.io)).toBe(0); script.drained();
    await expect(stat(store)).rejects.toMatchObject({ code: "ENOENT" }); expect(await readFile(input)).toEqual(before);
    expect(script.captured.output).toContain("UNSAVED");
  });

  it("supports file fast path, explicit edit-session and capture CLI without automatic version inference", async () => {
    const p = plan(), input = join(root, "preparation.json"); await writeFile(input, encode(preparation([p]))); const before = await readFile(input);
    const script = prompts([["prepare.review", "edit-session"], ["prepare.edit-session", "1"], ...planSteps(p), ["prepare.review", "create"]]);
    expect(await observerCli(["prepare", "--store", store, "--input", input, "--capture-version", NEW], script.io)).toBe(0); script.drained();
    expect(await readFile(input)).toEqual(before); expect((await loadCapture(store)).draft.plannedSessions).toEqual([p]);
    const selected = join(root, "cli-selected"), io = cliIo();
    expect(await captureCli(["prepare", "--input", input, "--store", selected, "--capture-version", NEW], io.io)).toBe(0);
    expect((await loadCapture(selected)).draft.captureVersion).toBe(NEW);
    const unselected = join(root, "not-inferred"), refused = cliIo();
    expect(await captureCli(["prepare", "--input", input, "--store", unselected], refused.io)).toBe(1);
    expect(JSON.parse(refused.captured.stderr).error).toBe("schema"); await expect(stat(unselected)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("cancels at unknown reason without fabricating text, use or a journal", async () => {
    const steps = wizardSteps(plan()), index = steps.findIndex(([id]) => id.endsWith("revisionIdentity.reason"));
    const script = prompts([...steps.slice(0, index), ["plannedSessions.0.model.revisionIdentity.reason", null]]);
    expect(await observerCli(["prepare", "--store", store, "--capture-version", NEW], script.io)).toBe(0); script.drained();
    await expect(stat(store)).rejects.toMatchObject({ code: "ENOENT" }); expect(script.captured.output).toContain("UNSAVED");
  });

  it("inherits reviewed credential menus and unknown-coverage close/export in the new version", async () => {
    const p = plan(), initial = apply(null, "prepare", prepareDraft(preparation([p]), NEW));
    const started = apply(initial, "event", { sessionId: p.sessionId, event: event("start", 1) });
    expect(sessionView(started, p.sessionId).next).toContain("credential-change");
    expect(sessionView(started, p.sessionId).next).not.toContain("useful-result");
    const events = sequence(p); events.pop(); await persist([p], [events]);
    const script = prompts([["observe.next", "close"], ["close.at", stamp(9)],
      ["close.completeness.actions", "complete"], ["close.completeness.assistance", "complete"], ["close.completeness.setupFailures", "complete"], ["close.completeness.refusals", "complete"],
      ["close.completeness.credentials", "unknown"], ["close.modelUsed", "yes"],
      ["close.observer.humanPresent", "no"], ["close.observer.independent", "no"], ["close.observer.consentRecorded", "no"], ["close.observer.firstUse", "no"],
      ["close.observer.statement", "Synthetic close only"], ["close.observer.recordedAt", stamp(10)], ["close.recordingPath", `${p.sessionId}.txt`], ["close.windowRuleSatisfied", "yes"], ["event.review", "save"]]);
    expect(await observerCli(["observe", "--store", store, "--session", p.sessionId], script.io)).toBe(0); script.drained();
    const state = await loadCapture(store); expect(sessionView(state, p.sessionId).projection.status).toBe("closed-blocked");
    const out = join(root, "guided-export"), exportScript = prompts([["export.head", head(state)], ["export.review", "export"]]);
    expect(await observerCli(["export", "--store", store, "--evidence-root", evidence, "--out", out], exportScript.io)).toBe(2); exportScript.drained();
    await expect(stat(join(out, "study.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.parse(await readFile(join(out, "report.json"), "utf8")).sessions[0].observationGaps).toContain("credentials");
  });

  it("keeps demo preparation explicit without asking for a fictitious provider revision", async () => {
    const p = plan("guided-demo");
    Object.assign(p.model, { kind: "keyless-demo", provider: null, id: null, revision: null,
      settingsSha256: null, credentialState: "not-required",
      revisionIdentity: { version: "1", status: "not-applicable", reference: null, reason: null } });
    const script = prompts([...wizardSteps(p), ["prepare.review", "create"]]);
    expect(await observerCli(["prepare", "--store", store, "--capture-version", NEW], script.io)).toBe(0); script.drained();
    const loaded = await loadCapture(store); expect(loaded.draft.plannedSessions).toEqual([p]);
    expect(loaded.sessions.get(p.sessionId)).toEqual([]);
  });
});

describe("new-version chronology and declaration-only matching boundaries", () => {
  it("preserves equal-time repair/use/result order and the reduced-intake limitation", () => {
    const p = plan(), events = sequence(p);
    const change = events.find(item => item.type === "credential-change")!;
    const use = events.find(item => item.type === "model-use")!;
    const result = events.find(item => item.type === "useful-result")!;
    change.at = use.at = result.at = stamp(3);
    expect(replay(p, events).status).toBe("closed");
    const start = events.slice(0, 4);
    refusal(() => replay(p, [...start, use, change, result]), "credential-use-conflict");
    refusal(() => replay(p, [...start, change, result, use]), "credential-result-order");
    const direct = row(p); direct.model.credentials!.observations = [change, use];
    direct.measurements.firstUsefulResultAt = stamp(3);
    // Reduced intake has no useful-result event occurrence; equality cannot prove its full order.
    expect(validate(direct)).toEqual([]);
    direct.model.credentials!.observations = [use, change];
    expect(codes(validate(direct))).toContain("credential-use-conflict");
  });

  it("requires retained declaration syntax, not a guessed immutability detector", () => {
    const p = plan("declaration-boundary", "declared-immutable");
    // Deliberately misleading SYNTHETIC text. The contract validates a declaration;
    // it must not pretend to authenticate it or infer immutability from a blacklist.
    p.model.revision = "unknown";
    expect(validateModelRevisionIdentity(p.model)).toEqual([]);
    expect(prepareDraft(preparation([p]), NEW).plannedSessions[0].model.revision).toBe("unknown");
    p.model.revisionIdentity!.status = "unknown"; p.model.revisionIdentity!.reason = "Synthetic explicit unknown";
    refusal(() => prepareDraft(preparation([p]), NEW), "model-revision-conflict");
  });

  it("isolates new declared-revision cohort identities from credential-only cohorts", async () => {
    const modernRows = await cohort("modern", "declared-immutable");
    const oldRows = await cohort("credential", "declared-immutable", CREDENTIAL_CAPTURE_VERSION);
    for (const r of oldRows) r.model.revision = "synthetic-immutable-revision";
    const modern = await intakeStudy(study(modernRows), { evidenceRoot: evidence });
    const old = await intakeStudy(study(oldRows, CREDENTIAL_SCHEMA_VERSION), { evidenceRoot: evidence });
    expect(modern.comparative.status).toBe("matched-declared-cohorts");
    expect(old.comparative.status).toBe("matched-declared-cohorts");
    expect(modern.comparative.cohorts[0].cohortId).not.toBe(old.comparative.cohorts[0].cohortId);
    expect(old.comparative).not.toHaveProperty("modelIdentityAuthenticated");
    expect(modern.comparative.modelIdentityAuthenticated).toBe(false);
  });
});
