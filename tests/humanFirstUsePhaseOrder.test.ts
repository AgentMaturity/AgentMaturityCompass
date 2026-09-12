/** AMC1512-DIRECT-INTAKE-PHASE-ORDER — AUTHORING ONLY / UNEXECUTED.
 * Every identity, timestamp, human flag and recording below is synthetic.
 * Files are created only inside test-owned temporary roots on a later authorized run.
 * No provider, harness or human is invoked. Do not equate these declarations with evidence.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  COMMON_PROTOCOL, SCHEMA_VERSION, CREDENTIAL_SCHEMA_VERSION, MODEL_REVISION_SCHEMA_VERSION,
  MIN_HUMAN_SESSIONS_PER_HARNESS, validateSession, validateStudy, intakeStudy, runCli
} from "../scripts/human-first-use-intake.mjs";
import {
  CAPTURE_VERSION, CREDENTIAL_CAPTURE_VERSION, MODEL_REVISION_CAPTURE_VERSION,
  CaptureError, projectSession, intakeSchemaForCapture
} from "../scripts/human-first-use-capture.mjs";

type Outcome = "completed" | "failed" | "incomplete";
type Recovery = "succeeded" | "failed" | "not-attempted" | "not-observed";
type ReturnOutcome = "returned" | "did-not-return" | "not-observed";
type Observation = { type: string; at: string; timing: string; data: Record<string, unknown> };
type Model = {
  kind: string; used: boolean; provider: string; id: string; revision: string | null;
  settingsSha256: string; credentialState: string;
  credentials?: { version: string; startingState: string; coverageComplete: boolean; observations: Observation[] };
  revisionIdentity?: { version: string; status: string; reference: string | null; reason: string | null };
};
type ErrorRow = { path: string; code: string; kind: string; message: string };
const profiles = [
  { schema: SCHEMA_VERSION, capture: CAPTURE_VERSION },
  { schema: CREDENTIAL_SCHEMA_VERSION, capture: CREDENTIAL_CAPTURE_VERSION },
  { schema: MODEL_REVISION_SCHEMA_VERSION, capture: MODEL_REVISION_CAPTURE_VERSION }
];
const stamp = (seconds: number) => new Date(Date.UTC(2026, 8, 1, 10) + seconds * 1000).toISOString();
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const recordingBytes = (id: string) => `SYNTHETIC ${id}; PRIVATE_PHASE_RECORDING_CANARY; no person or inference.\n`;
const event = (type: string, seconds: number, data: Record<string, unknown> = {}): Observation =>
  ({ type, at: stamp(seconds), timing: "explicit-observed", data });
const recoveryMessage = "Recovery interruption precedes the first useful result.";
const returnMessage = "Second-task decision precedes the known recovery boundary.";
const newPhaseErrors = (errors: ErrorRow[]) => errors.filter(e => [recoveryMessage, returnMessage].includes(e.message));
const compact = (errors: ErrorRow[]) => errors.map(({ path, code, kind }) => ({ path, code, kind }));
const expectedOrder = (path: string) => [{ path, code: "time-order", kind: "invalid" }];

// Construct direct intake independently. Negative inputs never go through capture replay.
function row(schema: string, id = "synthetic-amc", harness = "amc", human = false) {
  const model: Model = {
    kind: "local-provider", used: true, provider: "synthetic-provider", id: "synthetic-model",
    revision: "synthetic-immutable-revision", settingsSha256: hash("synthetic phase settings"), credentialState: "configured"
  };
  if (schema !== SCHEMA_VERSION) model.credentials = {
    version: "1", startingState: "configured", coverageComplete: true,
    observations: [event("model-use", 2, { credentialState: "configured" })]
  };
  if (schema === MODEL_REVISION_SCHEMA_VERSION) model.revisionIdentity = {
    version: "1", status: "declared-immutable", reference: null, reason: null
  };
  return {
    sessionId: id, participation: human ? "human-declared" : "automated-fixture", participantId: `p-${id}`,
    observer: { id: "o-synthetic", humanPresent: human, independent: human, consentRecorded: human, firstUse: human,
      statement: "SYNTHETIC PRIVATE_PHASE_NARRATIVE_CANARY; not an actual observer", recordedAt: stamp(13) },
    harness: { name: harness, version: "synthetic-only", sourceCommit: "a".repeat(40), artifactSha256: null },
    environment: { machineClass: "synthetic-machine", os: "darwin", osVersion: "synthetic-only", arch: "arm64",
      nodeVersion: "22.0.0", installState: "clean" },
    protocol: { ...COMMON_PROTOCOL }, model,
    measurements: {
      startedAt: stamp(1), endedAt: stamp(12), outcome: "completed" as Outcome,
      firstUsefulResultAt: stamp(4) as string | null, actionsToFirstUsefulResult: 1 as number | null,
      noResultReason: null as string | null, assistanceCount: 0 as number | null,
      setupFailures: [] as Array<{ at: string; code: string; detail: string }>,
      refusals: [] as Array<{ at: string; code: string; namedFix: boolean | null }>,
      interruption: { at: stamp(6) as string | null, resumedAt: stamp(8) as string | null,
        resumeOutcome: "succeeded" as Recovery, reason: null as string | null },
      secondTask: { outcome: "returned" as ReturnOutcome, at: stamp(10) as string | null, reason: null as string | null }
    },
    recording: { path: `${id}.txt`, sha256: hash(recordingBytes(id)) }
  };
}
type Row = ReturnType<typeof row>;
/** A synthetic capture closes with complete coverage; anything else is a fixture defect, not a null to paper over. */
function closedMeasurements(projection: ReturnType<typeof projectSession>): Row["measurements"] {
  const m = projection.measurements;
  if (m === null || m.setupFailures === null || m.refusals === null) throw new Error("synthetic capture must close with complete coverage");
  return { ...m, setupFailures: m.setupFailures, refusals: m.refusals };
}
const study = (schemaVersion: string, sessions: Row[]) => ({ schemaVersion, studyId: "synthetic-phase-order", sessions });
const validate = (r: Row, schema: string) => validateSession(r, "session", schema);
function firstOutcome(r: Row, outcome: Outcome) {
  r.measurements.outcome = outcome;
  if (outcome !== "completed") {
    r.measurements.firstUsefulResultAt = r.measurements.actionsToFirstUsefulResult = null;
    r.measurements.noResultReason = "SYNTHETIC PRIVATE_PHASE_NARRATIVE_CANARY: no useful first result";
    r.model.used = false;
    if (r.model.credentials) r.model.credentials.observations = [];
  }
  return r;
}
function recovery(r: Row, outcome: Recovery, suppliedResume = outcome === "succeeded") {
  r.measurements.interruption.resumeOutcome = outcome;
  r.measurements.interruption.resumedAt = suppliedResume ? stamp(8) : null;
  r.measurements.interruption.reason = outcome === "succeeded" ? null : "Synthetic recovery disposition";
  return r;
}
function returned(r: Row, outcome: ReturnOutcome) {
  r.measurements.secondTask = { outcome, at: outcome === "not-observed" ? null : stamp(10),
    reason: outcome === "returned" ? null : "Synthetic return observation disposition" };
  return r;
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

for (const { schema, capture } of profiles) describe(`phase-order direct admission: ${schema}`, () => {
  it("keeps ordered input, schema selection and original declarations unchanged", () => {
    const input = study(schema, [row(schema)]), before = structuredClone(input);
    freeze(input);
    expect(validate(input.sessions[0]!, schema)).toEqual([]);
    expect(validateStudy(input).records[0].errors).toEqual([]);
    expect(intakeSchemaForCapture(capture)).toBe(schema);
    expect(input).toEqual(before);
    expect(SCHEMA_VERSION).toBe("2026-09-09");
    expect(CAPTURE_VERSION).toBe("2026-09-09.1");
  });

  it.each(["succeeded", "failed", "not-attempted", "not-observed"] as const)(
    "rejects %s recovery before a known first result with its exact field", outcome => {
      const r = recovery(row(schema), outcome);
      expect(validate(r, schema)).toEqual([]);
      r.measurements.interruption.at = stamp(3);
      if (outcome === "succeeded") r.measurements.interruption.resumedAt = stamp(3.5);
      const input = study(schema, [r]), before = structuredClone(input); freeze(input);
      expect(compact(validate(r, schema))).toEqual(expectedOrder("session.measurements.interruption.at"));
      expect(compact(validateStudy(input).records[0].errors)).toEqual(expectedOrder("sessions[0].measurements.interruption.at"));
      expect(input).toEqual(before);
    });

  const inversions: Array<[string, Recovery, boolean, number]> = [
    ["before interruption", "succeeded", true, 5],
    ["between interruption and success", "succeeded", true, 7],
    ["before failed recovery interruption", "failed", false, 5],
    ["before failed recovery supplied time", "failed", true, 7],
    ["before unattempted recovery interruption", "not-attempted", false, 5],
    ["before unobserved recovery interruption", "not-observed", false, 5]
  ];
  for (const returnOutcome of ["returned", "did-not-return"] as const) {
    it.each(inversions)(`${returnOutcome}: rejects %s`, (_label, recoveryOutcome, suppliedResume, seconds) => {
      const r = returned(recovery(row(schema), recoveryOutcome, suppliedResume), returnOutcome);
      expect(validate(r, schema)).toEqual([]);
      r.measurements.secondTask.at = stamp(seconds);
      const before = structuredClone(r); freeze(r);
      expect(compact(validate(r, schema))).toEqual(expectedOrder("session.measurements.secondTask.at"));
      expect(compact(validateStudy(study(schema, [r])).records[0].errors)).toEqual(expectedOrder("sessions[0].measurements.secondTask.at"));
      expect(r).toEqual(before);
    });
  }

  it("admits equal times as limited declarations, but rejects a strict millisecond inversion", () => {
    const r = row(schema), m = r.measurements;
    m.interruption.at = m.interruption.resumedAt = m.secondTask.at = m.firstUsefulResultAt;
    expect(validate(r, schema)).toEqual([]);
    m.interruption.at = stamp(3.999);
    expect(compact(validate(r, schema))).toEqual(expectedOrder("session.measurements.interruption.at"));
    m.interruption.at = stamp(4); m.interruption.resumedAt = stamp(8); m.secondTask.at = stamp(7.999);
    expect(compact(validate(r, schema))).toEqual(expectedOrder("session.measurements.secondTask.at"));
  });

  it("treats canonical Unix epoch zero as a known timestamp, not an absent value", () => {
    const r = row(schema), at = (ms: number) => new Date(ms).toISOString();
    Object.assign(r.measurements, { startedAt: at(-2000), endedAt: at(12000), firstUsefulResultAt: at(1000) });
    r.observer.recordedAt = at(13000);
    Object.assign(r.measurements.interruption, { at: at(0), resumedAt: at(4000) });
    r.measurements.secondTask.at = at(6000);
    if (r.model.credentials) r.model.credentials.observations[0]!.at = at(-1000);
    expect(compact(validate(r, schema))).toEqual(expectedOrder("session.measurements.interruption.at"));
    r.measurements.firstUsefulResultAt = at(-1500);
    Object.assign(r.measurements.interruption, { at: at(-1000), resumedAt: at(0) });
    r.measurements.secondTask.at = at(-500);
    if (r.model.credentials) r.model.credentials.observations[0]!.at = at(-1800);
    expect(compact(validate(r, schema))).toEqual(expectedOrder("session.measurements.secondTask.at"));
  });

  it.each(["failed", "incomplete"] as const)("does not invent a %s first-task termination timestamp", outcome => {
    const r = firstOutcome(row(schema), outcome);
    Object.assign(r.measurements.interruption, { at: stamp(1), resumedAt: stamp(2) });
    r.measurements.secondTask.at = stamp(3); r.measurements.assistanceCount = null;
    const before = structuredClone(r); freeze(r);
    expect(validate(r, schema)).toEqual([]);
    expect(r.measurements).not.toHaveProperty("firstTaskEndedAt");
    expect(r).toEqual(before);
    const inverted = structuredClone(r); inverted.measurements.secondTask.at = stamp(1.5);
    expect(compact(validate(inverted, schema))).toEqual(expectedOrder("session.measurements.secondTask.at"));
  });

  it.each(["failed", "not-attempted", "not-observed"] as const)("preserves missing %s decision time without assuming it", outcome => {
    const r = recovery(row(schema), outcome);
    r.measurements.secondTask.at = stamp(7); // After interruption; actual later decision time is omitted.
    expect(validate(r, schema)).toEqual([]);
    if (outcome !== "failed") {
      r.measurements.interruption.at = null;
      expect(validate(r, schema)).toEqual([]);
      r.measurements.secondTask.at = stamp(3);
      expect(compact(validate(r, schema))).toEqual(expectedOrder("session.measurements.secondTask.at"));
      returned(r, "not-observed");
      expect(validate(r, schema)).toEqual([]);
    }
  });

  it("retains missing-success-time classification and uses only the known interruption bound", () => {
    const r = row(schema); r.measurements.interruption.resumedAt = null;
    const errors = validate(r, schema);
    expect(compact(errors)).toEqual([{ path: "session.measurements.interruption.resumedAt", code: "resume-missing", kind: "missing-evidence" }]);
    r.measurements.secondTask.at = stamp(5);
    expect(compact(validate(r, schema))).toEqual([
      { path: "session.measurements.interruption.resumedAt", code: "resume-missing", kind: "missing-evidence" },
      ...expectedOrder("session.measurements.secondTask.at")
    ]);
  });

  it("keeps missing members missing rather than converting them to epoch or phase errors", () => {
    const r = row(schema); Reflect.deleteProperty(r.measurements.interruption, "resumedAt");
    const errors = validate(r, schema);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((e: ErrorRow) => e.path === "session.measurements.interruption.resumedAt" && e.code === "required" && e.kind === "missing-evidence")).toBe(true);
    expect(newPhaseErrors(errors)).toEqual([]);
    const absent = row(schema); Reflect.deleteProperty(absent.measurements, "interruption");
    const missingBlock = validate(absent, schema);
    expect(missingBlock.every((e: ErrorRow) => e.code === "required" && e.kind === "missing-evidence")).toBe(true);
    expect(missingBlock.length).toBeGreaterThan(0);
  });

  it("keeps an observed return's null timestamp missing, not a new chronology failure", () => {
    const r = row(schema); r.measurements.secondTask.at = null;
    expect(compact(validate(r, schema))).toEqual([{ path: "session.measurements.secondTask.at", code: "return-missing", kind: "missing-evidence" }]);
    returned(r, "not-observed");
    expect(validate(r, schema)).toEqual([]);
  });

  const malformed: Array<[string, unknown]> = [
    ["unparseable", "not-a-time"], ["number", 0], ["array", ["2026"]],
    ["object", { toString: "not-callable" }], ["rolled calendar", "2026-02-30T10:00:00.000Z"]
  ];
  for (const field of ["firstUsefulResultAt", "interruption.at", "interruption.resumedAt", "secondTask.at"]) {
    it.each(malformed)(`${field}: classifies %s without using it as a new phase bound`, (_label, value) => {
      const r = row(schema);
      const parts = field.split(".");
      const target = parts.length === 1 ? r.measurements : parts[0] === "interruption" ? r.measurements.interruption : r.measurements.secondTask;
      Reflect.set(target, parts.at(-1)!, value);
      const before = structuredClone(r); freeze(r);
      const errors = validate(r, schema);
      expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({ path: `session.measurements.${field}`, code: "timestamp", kind: "invalid" })]));
      expect(newPhaseErrors(errors)).toEqual([]); // Older within-window errors may coexist.
      expect(r).toEqual(before);
    });
  }

  it.each(["first", "interruption", "resume", "return"])("does not use parseable noncanonical %s time in the new comparisons", which => {
    const r = row(schema), m = r.measurements, noncanonical = (seconds: number) => stamp(seconds).replace(".000Z", "Z");
    let field: string;
    if (which === "first") { m.firstUsefulResultAt = noncanonical(9); field = "firstUsefulResultAt"; }
    else if (which === "interruption") {
      recovery(r, "not-observed"); m.interruption.at = noncanonical(9); m.secondTask.at = stamp(8); field = "interruption.at";
    } else if (which === "resume") { m.interruption.resumedAt = noncanonical(8); m.secondTask.at = stamp(7); field = "interruption.resumedAt"; }
    else { m.secondTask.at = noncanonical(7); field = "secondTask.at"; }
    expect(compact(validate(r, schema))).toEqual([{ path: `session.measurements.${field}`, code: "timestamp", kind: "invalid" }]);
  });

  it("does not elevate forbidden or reversed resume timestamps into a later phase bound", () => {
    const r = recovery(row(schema), "not-observed");
    r.measurements.interruption.resumedAt = stamp(11);
    expect(compact(validate(r, schema))).toEqual([{ path: "session.measurements.interruption.resumedAt", code: "resume-conflict", kind: "invalid" }]);
    recovery(r, "succeeded"); r.measurements.interruption.resumedAt = stamp(5);
    expect(compact(validate(r, schema))).toEqual(expectedOrder("session.measurements.interruption.resumedAt"));
    r.measurements.secondTask.at = stamp(5.5);
    expect(compact(validate(r, schema))).toEqual([
      ...expectedOrder("session.measurements.interruption.resumedAt"), ...expectedOrder("session.measurements.secondTask.at")
    ]);
  });
});

// Capture is a positive integration control, not the constructor for negative direct rows.
function captured(schema: string, captureVersion: string, outcome: Outcome = "completed", resume: Recovery = "succeeded", second: ReturnOutcome = "returned", tied = false, id = "synthetic-amc") {
  const r = returned(recovery(firstOutcome(row(schema, id), outcome), resume), second);
  const { used, credentials, ...model } = structuredClone(r.model);
  const plan = { sessionId: r.sessionId, participation: r.participation, participantId: r.participantId,
    observerId: r.observer.id, harness: r.harness, environment: r.environment, model };
  const events = [event("start", 1), event("submitted-action", 2, { description: "Synthetic submitted operation" })];
  if (credentials) events.push(...credentials.observations);
  events.push(outcome === "completed" ? event("useful-result", 4, { judgement: "Synthetic useful result" })
    : event("first-task-ended", 4, { outcome, reason: r.measurements.noResultReason }));
  events.push(event("interruption", tied ? 4 : 6, { reason: "Synthetic interruption" }),
    event("resume", tied ? 4 : 8, { outcome: resume, reason: r.measurements.interruption.reason }),
    event("second-task", tied ? 4 : 10, { outcome: second, reason: r.measurements.secondTask.reason }));
  const { id: _observerId, ...observer } = r.observer;
  events.push(event("close", 12, { completeness: { actions: true, assistance: true, setupFailures: true, refusals: true,
      ...(schema === SCHEMA_VERSION ? {} : { credentials: true }) }, modelUsed: used, observer,
    recordingPath: r.recording.path, windowRuleSatisfied: true, windowRuleDeviation: null }));
  return { r, plan, events, captureVersion };
}
for (const { schema, capture } of profiles) describe(`phase-order capture consistency: ${schema}`, () => {
  const lawful: Array<[Outcome, Recovery, ReturnOutcome, boolean]> = [
    ["completed", "succeeded", "returned", false], ["completed", "succeeded", "did-not-return", true],
    ["failed", "failed", "did-not-return", false], ["incomplete", "not-observed", "not-observed", false]
  ];
  it.each(lawful)("retains lawful %s/%s/%s with ties=%s", (outcome, resume, second, tied) => {
    const data = captured(schema, capture, outcome, resume, second, tied), before = structuredClone(data); freeze(data);
    const projection = projectSession(data.plan, data.events, stamp(0), capture);
    expect(projection.status).toBe("closed"); expect(projection.blockers).toEqual([]);
    const direct = { ...data.r, model: projection.model, measurements: projection.measurements, observer: projection.observer };
    expect(validateSession(direct, "session", schema)).toEqual([]);
    expect(projection.measurements!.outcome).toBe(outcome);
    expect(projection.model.credentialState).toBe(data.plan.model.credentialState);
    if (resume !== "succeeded") expect(projection.measurements!.interruption.resumedAt).toBeNull();
    if (outcome !== "completed") expect(projection.measurements!.firstUsefulResultAt).toBeNull();
    expect(data).toEqual(before);
  });

  it("keeps stronger capture ordering for tied events instead of pretending scalar equality proves it", () => {
    const data = captured(schema, capture, "completed", "succeeded", "returned", true);
    const events = structuredClone(data.events), index = events.findIndex(e => e.type === "useful-result");
    const interruption = events.splice(index + 1, 1)[0]!; events.splice(index, 0, interruption);
    assert.throws(() => projectSession(data.plan, events, stamp(0), capture), error => error instanceof CaptureError && error.code === "recovery-order");
    const prematureReturn = structuredClone(data.events), returnIndex = prematureReturn.findIndex(e => e.type === "second-task");
    const decision = prematureReturn.splice(returnIndex, 1)[0]!; prematureReturn.splice(returnIndex - 1, 0, decision);
    assert.throws(() => projectSession(data.plan, prematureReturn, stamp(0), capture), error => error instanceof CaptureError && error.code === "second-task-order");
    const backwards = structuredClone(data.events); backwards.find(e => e.type === "resume")!.at = stamp(3);
    assert.throws(() => projectSession(data.plan, backwards, stamp(0), capture), error => error instanceof CaptureError && error.code === "event-order");
  });
});

describe("phase-order full-population report and public CLI paths", () => {
  let root = "", evidenceRoot = "";
  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), "amc-phase-order-")));
    evidenceRoot = join(root, "recordings"); await mkdir(evidenceRoot);
  });
  afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = ""; });
  async function retain(r: Row) {
    await writeFile(join(evidenceRoot, r.recording.path), recordingBytes(r.sessionId), { flag: "wx" });
    return r;
  }
  async function cohort(schema: string, prefix: string) {
    const rows: Row[] = [];
    for (const harness of ["amc", "dsh", "pi"]) for (let i = 0; i < MIN_HUMAN_SESSIONS_PER_HARNESS; i += 1) {
      // Affirmative human flags only reach the declaration-aggregation path.
      const r = row(schema, `${prefix}-${harness}-${i}`, harness, true);
      r.environment.machineClass = `synthetic-${prefix}`;
      firstOutcome(r, i === 0 ? "failed" : i === 1 ? "incomplete" : "completed");
      r.measurements.assistanceCount = null;
      rows.push(await retain(r));
    }
    return rows;
  }
  function io() {
    const captured = { stdout: "", stderr: "" };
    return { captured, streams: { stdout: { write: (s: string) => { captured.stdout += s; } },
      stderr: { write: (s: string) => { captured.stderr += s; } } } };
  }

  for (const { schema, capture } of profiles) {
    it.each(["completed", "failed", "incomplete"] as const)(`${schema}: retains a contradictory %s row and blocks even an otherwise sufficient second cohort`, async outcome => {
      const first = await cohort(schema, "first"), second = await cohort(schema, "second"), rows = [...first, ...second];
      const initial = await intakeStudy(study(schema, rows), { evidenceRoot });
      expect(initial.intakeStatus).toBe("valid-records"); expect(initial.comparative.status).toBe("matched-declared-cohorts");
      expect(initial.comparative.cohorts).toHaveLength(2);
      const bad = first.find(r => r.measurements.outcome === outcome)!;
      bad.measurements.secondTask.at = stamp(7);
      const input = study(schema, rows), before = structuredClone(input); freeze(input);
      const result = await intakeStudy(input, { evidenceRoot, generatedAt: stamp(20) });
      expect(result.intakeStatus).toBe("invalid");
      expect(result.records.map(r => r.sessionId)).toEqual(rows.map(r => r.sessionId));
      const rejected = result.records.find(r => r.sessionId === bad.sessionId); assert.ok(rejected);
      expect(rejected).toMatchObject({ status: "invalid", declaredOutcome: outcome, participantId: bad.participantId, measurements: null });
      expect(rejected.recordingCheck.status).toBe("hash-matched");
      expect(compact(rejected.errors)).toEqual(expectedOrder(`sessions[${rows.indexOf(bad)}].measurements.secondTask.at`));
      expect(result.comparative.reasons).toContain("human-or-unclassified-records-invalid-or-missing");
      expect(result.comparative.cohorts.every(c => c.summaries === null)).toBe(true);
      const unaffected = result.comparative.cohorts.find(c => c.environment.machineClass === "synthetic-second"); assert.ok(unaffected);
      expect(unaffected.humanDeclaredCounts).toEqual(Object.fromEntries(["amc", "dsh", "pi"].map(h => [h, MIN_HUMAN_SESSIONS_PER_HARNESS])));
      expect(result.inputSha256).toBeNull(); expect(result.toolSha256).toBeNull();
      expect(JSON.stringify(result)).not.toContain("PRIVATE_PHASE_NARRATIVE_CANARY");
      expect(JSON.stringify(result)).not.toContain("PRIVATE_PHASE_RECORDING_CANARY");
      expect(result.comparative.humanParticipationAuthenticated).toBe(false);
      expect(result.comparative.ranking).toBeNull(); expect(input).toEqual(before);
    });

    it.each(["recovery-before-result", "return-before-recovery"])(`${schema}: writes a %s code-2 report without changing original inputs or prior reports`, async inversion => {
      const rows = await cohort(schema, "cli"), initialInput = study(schema, rows);
      const input = join(root, "ordered.json"), previousReport = join(root, "ordered-report.json"), positiveIo = io();
      const originalBytes = `${JSON.stringify(initialInput)}\n`; await writeFile(input, originalBytes, { flag: "wx" });
      expect(await runCli(["--input", input, "--evidence-root", evidenceRoot, "--out", previousReport], positiveIo.streams)).toBe(0);
      const previousBytes = await readFile(previousReport);
      const contradictory = structuredClone(initialInput);
      const badIndex = inversion === "recovery-before-result" ? contradictory.sessions.findIndex(r => r.measurements.outcome === "completed") : 0;
      const bad = contradictory.sessions[badIndex]!;
      const field = inversion === "recovery-before-result" ? "interruption.at" : "secondTask.at";
      if (inversion === "recovery-before-result") bad.measurements.interruption.at = stamp(3);
      else bad.measurements.secondTask.at = stamp(7);
      const badInput = join(root, "contradictory.json"), badBytes = `${JSON.stringify(contradictory)}\n`;
      await writeFile(badInput, badBytes, { flag: "wx" });
      const collision = io();
      expect(await runCli(["--input", badInput, "--evidence-root", evidenceRoot, "--out", previousReport], collision.streams)).toBe(1);
      expect(JSON.parse(collision.captured.stderr).error).toBe("output-exists");
      expect(await readFile(previousReport)).toEqual(previousBytes);
      const out = join(root, "invalid-report.json"), negativeIo = io();
      expect(await runCli(["--input", badInput, "--evidence-root", evidenceRoot, "--out", out], negativeIo.streams)).toBe(2);
      const outputBytes = await readFile(out), report = JSON.parse(outputBytes.toString("utf8"));
      expect(report.schemaVersion).toBe(schema); expect(report.intakeStatus).toBe("invalid");
      expect(report.records.map((r: { sessionId: string }) => r.sessionId)).toEqual(rows.map(r => r.sessionId));
      expect(report.records[badIndex]).toMatchObject({ declaredOutcome: bad.measurements.outcome, measurements: null, status: "invalid" });
      expect(compact(report.records[badIndex].errors)).toEqual(expectedOrder(`sessions[${badIndex}].measurements.${field}`));
      expect(report.comparative.status).toBe("insufficient-evidence"); expect(report.comparative.cohorts[0].summaries).toBeNull();
      expect(report.inputSha256).toBe(hash(badBytes));
      expect(report.toolSha256).toBe(hash(await readFile(fileURLToPath(new URL("../scripts/human-first-use-intake.mjs", import.meta.url)))));
      expect(JSON.parse(negativeIo.captured.stdout)).toEqual({ intakeStatus: "invalid", comparativeStatus: "insufficient-evidence", reportWritten: true });
      expect(negativeIo.captured.stderr).toBe("");
      expect(await readFile(input, "utf8")).toBe(originalBytes); expect(await readFile(badInput, "utf8")).toBe(badBytes);
      expect(await readFile(previousReport)).toEqual(previousBytes);
      expect(await runCli(["--input", badInput, "--evidence-root", evidenceRoot, "--out", out], io().streams)).toBe(1);
      expect(await readFile(out)).toEqual(outputBytes);
    });

    it(`${schema}: carries lawful capture projections through recording intake and complete reporting`, async () => {
      const rows: Row[] = [];
      for (const outcome of ["completed", "failed", "incomplete"] as const) {
        const data = captured(schema, capture, outcome, "succeeded", "returned", false, `capture-${outcome}`);
        const projection = projectSession(data.plan, data.events, stamp(0), capture);
        expect(projection.status).toBe("closed");
        const r = { ...data.r, model: projection.model, measurements: closedMeasurements(projection), observer: projection.observer };
        expect(r.sessionId).toBe(data.plan.sessionId); expect(r.participantId).toBe(data.plan.participantId);
        rows.push(await retain(r));
      }
      const result = await intakeStudy(study(schema, rows), { evidenceRoot });
      expect(result.intakeStatus).toBe("valid-records");
      expect(result.records.map(r => r.declaredOutcome)).toEqual(["completed", "failed", "incomplete"]);
      expect(result.records.every(r => r.recordingCheck.status === "hash-matched")).toBe(true);
      expect(result.comparative.status).toBe("insufficient-evidence");
      expect(result.comparative.excludedAutomatedRecords).toBe(rows.length);
    });
  }

  it("retains unknown revision and credential assistance beside an independent chronology refusal", async () => {
    const r = row(MODEL_REVISION_SCHEMA_VERSION, "unknown", "amc", true);
    r.model.revision = null; r.model.revisionIdentity = { version: "1", status: "unknown", reference: "synthetic-alias",
      reason: "PRIVATE_PHASE_NARRATIVE_CANARY: synthetic undisclosed revision" };
    r.model.credentialState = "missing";
    r.model.credentials = { version: "1", startingState: "missing", coverageComplete: true, observations: [
      event("credential-change", 2, { from: "missing", to: "configured", actor: "unknown" }),
      event("model-use", 2, { credentialState: "configured" })
    ] };
    r.measurements.assistanceCount = null; await retain(r);
    expect(validate(r, MODEL_REVISION_SCHEMA_VERSION)).toEqual([]);
    const valid = await intakeStudy(study(MODEL_REVISION_SCHEMA_VERSION, [r]), { evidenceRoot });
    expect(valid.records[0].measurements?.assistanceCount).toBeNull();
    expect(valid.comparative.cohorts[0].reasons).toContain("unknown-immutable-model-revision");
    r.measurements.secondTask.at = stamp(7); const before = structuredClone(r); freeze(r);
    const result = await intakeStudy(study(MODEL_REVISION_SCHEMA_VERSION, [r]), { evidenceRoot });
    expect(compact(result.records[0].errors)).toEqual(expectedOrder("sessions[0].measurements.secondTask.at"));
    expect(result.records[0].model).toMatchObject({ revision: null, credentialState: "missing",
      revisionIdentity: { status: "unknown", reasonRecorded: true }, credentials: r.model.credentials });
    expect(result.comparative).toMatchObject({ status: "insufficient-evidence", modelIdentityAuthenticated: false, servedModelMatch: "not-established" });
    expect(r).toEqual(before); expect(JSON.stringify(result)).not.toContain("PRIVATE_PHASE_NARRATIVE_CANARY");
    const reversed = structuredClone(r); reversed.measurements.secondTask.at = stamp(10); reversed.model.credentials!.observations.reverse();
    expect(validate(reversed, MODEL_REVISION_SCHEMA_VERSION).some((e: ErrorRow) => e.code === "credential-use-conflict")).toBe(true);
  });

  it("does not turn parse failure into an invalid-record report or echo private input", async () => {
    const input = join(root, "broken.json"), out = join(root, "absent-report.json"), captured = io();
    const bytes = '{"PRIVATE_PHASE_JSON_CANARY":'; await writeFile(input, bytes, { flag: "wx" });
    expect(await runCli(["--input", input, "--evidence-root", evidenceRoot, "--out", out], captured.streams)).toBe(1);
    expect(JSON.parse(captured.captured.stderr).error).toBe("input-json");
    expect(captured.captured.stderr).not.toContain("PRIVATE_PHASE_JSON_CANARY"); expect(captured.captured.stdout).toBe("");
    await expect(stat(out)).rejects.toMatchObject({ code: "ENOENT" }); expect(await readFile(input, "utf8")).toBe(bytes);
  });
});
