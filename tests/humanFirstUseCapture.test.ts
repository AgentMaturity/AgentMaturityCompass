import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { link, lstat, mkdir, mkdtemp, open, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMMON_PROTOCOL, COMMON_TASK, intakeStudy, validateStudy } from "../scripts/human-first-use-intake.mjs";
import {
  CAPTURE_VERSION, LIMITS, CaptureError, prepareDraft, projectSession, declareRecordNow,
  createCapture, appendCapture, loadCapture, captureStatus, hashRecording,
  finalizeCapture, readCaptureJson, writeExclusive, runCli
} from "../scripts/human-first-use-capture.mjs";

// AUTHORED, NOT EXECUTED. Every identity, observation, timestamp, affirmative flag
// and recording byte in these tests is SYNTHETIC. No participant was observed.
// A deterministic descriptor race uses real temporary files, not fake digest results.
const race = vi.hoisted(() => ({ path: null as string | null, openCount: 0, mutateOnOpen: 0, mutateAfterRead: false }));
vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return { ...actual, open: async (path: Parameters<typeof actual.open>[0], flags: Parameters<typeof actual.open>[1], mode?: Parameters<typeof actual.open>[2]) => {
    const handle = await actual.open(path, flags, mode);
    if (String(path) !== race.path) return handle;
    race.openCount += 1;
    if (race.mutateOnOpen === race.openCount) {
      race.path = null;
      await actual.appendFile(path, "SYNTHETIC CHANGE BETWEEN HASH PASSES");
    }
    return new Proxy(handle, { get(target, property) {
      if (property === "read") return async (...args: unknown[]) => {
        const result = await Reflect.apply(target.read, target, args);
        if (race.mutateAfterRead && race.path === String(path)) {
          race.path = null;
          await actual.appendFile(path, "SYNTHETIC CHANGE DURING READ");
        }
        return result;
      };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
  } };
});

const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const stamp = (seconds: number) => new Date(Date.UTC(2026, 8, 1, 10) + seconds * 1000).toISOString();
const recording = (id: string) => `SYNTHETIC ONLY ${id}; PRIVATE_RECORDING_CANARY; no human participated.\n`;
type Event = { type: string; at: string | null; timing: string | null; data: Record<string, unknown> };
const event = (type: string, seconds: number, data: Record<string, unknown> = {}): Event => ({ type, at: stamp(seconds), timing: "explicit-observed", data });
let root: string, store: string, evidence: string;

function planFixture(id = "amc-01", harness = "amc") {
  return { sessionId: id, participation: "human-declared", participantId: `p-${id}`, observerId: "o-synthetic",
    harness: { name: harness, version: "synthetic-version", sourceCommit: "a".repeat(40) as string | null, artifactSha256: null as string | null },
    environment: { machineClass: "synthetic-machine", os: "darwin", osVersion: "synthetic-os", arch: "arm64", nodeVersion: "22.0.0", installState: "clean" },
    model: { kind: "local-provider", provider: "synthetic-provider" as string | null, id: "synthetic-model" as string | null,
      revision: "synthetic-revision" as string | null, settingsSha256: hash("synthetic settings") as string | null, credentialState: "not-required" } };
}
function preparation(plans = [planFixture()]) {
  return { studyId: "synthetic-study", preparedAt: stamp(0), operator: { id: "o-synthetic", statement: "SYNTHETIC PREPARATION; no observations." },
    protocol: { ...COMMON_PROTOCOL }, task: COMMON_TASK,
    observationWindowRule: "Synthetic window after first task, recovery and voluntary-return disposition.",
    assistancePolicy: "Synthetic policy: retain every assistance event and explicit coverage gaps.", plannedSessions: plans };
}
function closeData(id = "amc-01", modelUsed = true) {
  return { completeness: { actions: true, assistance: true, setupFailures: true, refusals: true }, modelUsed,
    observer: { humanPresent: true, independent: true, consentRecorded: true, firstUse: true,
      statement: "SYNTHETIC DECLARATION; PRIVATE_NARRATIVE_CANARY; no human participated.", recordedAt: stamp(9) },
    recordingPath: `${id}.txt` as string | null, windowRuleSatisfied: true, windowRuleDeviation: null as string | null };
}
function sessionEvents(id = "amc-01", outcome = "completed") {
  return [event("start", 1), event("submitted-action", 2, { description: "Synthetic submitted operation A" }),
    event("submitted-action", 3, { description: "Synthetic submitted operation B" }),
    outcome === "completed" ? event("useful-result", 4, { judgement: "Synthetic judgement, not real task correctness" })
      : event("first-task-ended", 4, { outcome, reason: "Synthetic first task did not obtain a useful result" }),
    event("submitted-action", 4, { description: "Synthetic operation AFTER result, same millisecond" }),
    event("interruption", 5, { reason: "Synthetic recovery exercise" }), event("resume", 6, { outcome: "succeeded", reason: null }),
    event("second-task", 7, { outcome: "returned", reason: null }), event("close", 8, closeData(id, outcome === "completed"))];
}
const closeOf = (events: Event[]) => events.at(-1)!.data as ReturnType<typeof closeData>;
function errorCode(fn: () => unknown) {
  try { fn(); return null; } catch (error) { return (error as { code?: string }).code; }
}
async function persist(plans = [planFixture()], sequences = [sessionEvents()]) {
  let state = await createCapture(preparation(plans), store, stamp(100));
  for (const [index, sequence] of sequences.entries()) for (const observation of sequence) {
    state = await appendCapture(store, state.headSha256, "event", { sessionId: plans[index]!.sessionId, event: observation }, stamp(100));
  }
  return state;
}
async function saveRecording(id = "amc-01") { await writeFile(join(evidence, `${id}.txt`), recording(id)); }
function ioCapture() {
  const captured = { stdout: "", stderr: "" };
  return { captured, io: { stdout: { write: (text: string) => { captured.stdout += text; } }, stderr: { write: (text: string) => { captured.stderr += text; } } } };
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "amc-observer-capture-test-")));
  store = join(root, "journal"); evidence = join(root, "evidence");
  await mkdir(evidence);
  Object.assign(race, { path: null, openCount: 0, mutateOnOpen: 0, mutateAfterRead: false });
});
afterEach(async () => { race.path = null; if (root) await rm(root, { recursive: true, force: true }); });

describe("pure preregistration and explicit observer transitions", () => {
  it("imports without running a command or emitting an observation", () => {
    const url = new URL("../scripts/human-first-use-capture.mjs", import.meta.url).href;
    const imported = spawnSync(process.execPath, ["--input-type=module", "--eval", `await import(${JSON.stringify(url)});`], { cwd: root, encoding: "utf8", timeout: 10000 });
    expect(imported.status).toBe(0); expect(imported.stdout).toBe(""); expect(imported.stderr).toBe("");
  });

  it("retains the exact roster and pins without inventing declarations or mutating preparation", () => {
    const input = preparation([planFixture(), planFixture("pi-01", "pi")]), before = structuredClone(input);
    const draft = prepareDraft(input);
    expect(draft.captureVersion).toBe(CAPTURE_VERSION); expect(draft.plannedSessions).toEqual(input.plannedSessions);
    expect(draft.plannedSessions[0].model).not.toHaveProperty("used");
    expect(draft.plannedSessions[0]).not.toHaveProperty("observer"); expect(input).toEqual(before);
    expect(projectSession(input.plannedSessions[0], [], input.preparedAt)).toMatchObject({ status: "unobserved", measurements: null });
    draft.plannedSessions[0].harness.version = "changed-copy"; expect(input).toEqual(before);
  });

  it("requires explicit metadata, real pin syntax, common task and unique planned population", () => {
    const input = preparation(); input.plannedSessions[0]!.harness.sourceCommit = null;
    expect(errorCode(() => prepareDraft(input))).toBe("identity-required");
    expect(errorCode(() => prepareDraft({ ...preparation(), task: "alternate task" }))).toBe("protocol");
    expect(errorCode(() => prepareDraft({ ...preparation(), plannedSessions: [] }))).toBe("roster-empty");
    expect(errorCode(() => prepareDraft(preparation([planFixture(), planFixture()])))).toBe("duplicate-session");
    const duplicate = planFixture("amc-other"); duplicate.participantId = planFixture().participantId;
    expect(errorCode(() => prepareDraft(preparation([planFixture(), duplicate])))).toBe("duplicate-first-use");
    const extra = preparation(); Object.assign(extra.plannedSessions[0]!.model, { used: false });
    expect(errorCode(() => prepareDraft(extra))).toBe("schema");
    const unknownModel = preparation(); unknownModel.plannedSessions[0]!.model.id = null;
    expect(errorCode(() => prepareDraft(unknownModel))).toBe("schema");
    expect(errorCode(() => prepareDraft({ ...preparation(), preparedAt: "2026-02-30T10:00:00.000Z" }))).toBe("timestamp");
  });

  it("counts retained submitted events only through the first useful result, using order for equal times", () => {
    const events = sessionEvents(), before = structuredClone(events);
    events.splice(2, 0, event("assistance", 2, { detail: "Synthetic unsolicited assistance" }), event("refusal", 2, { code: "synthetic-refusal", namedFix: null }));
    const result = projectSession(planFixture(), events, stamp(0));
    expect(result.status).toBe("closed");
    expect(result.measurements).toMatchObject({ outcome: "completed", actionsToFirstUsefulResult: 2, firstUsefulResultAt: stamp(4), assistanceCount: 1, endedAt: stamp(8) });
    assert(result.measurements !== null, "Closed synthetic session must retain measurements");
    expect(result.measurements.refusals).toEqual([{ at: stamp(2), code: "synthetic-refusal", namedFix: null }]);
    expect(result.measurements.interruption).toMatchObject({ resumeOutcome: "succeeded", resumedAt: stamp(6) });
    expect(result.measurements.secondTask).toMatchObject({ outcome: "returned", at: stamp(7) });
    expect(before[0]).toEqual(events[0]); expect(closeOf(events).observer.recordedAt).toBe(stamp(9));
  });

  it.each(["failed", "incomplete"])("keeps %s first-task metrics null even when subsequent recovery/return succeeded", outcome => {
    const result = projectSession(planFixture(), sessionEvents("amc-01", outcome), stamp(0));
    expect(result.status).toBe("closed");
    expect(result.measurements).toMatchObject({ outcome, firstUsefulResultAt: null, actionsToFirstUsefulResult: null });
    assert(result.measurements !== null, "Closed synthetic attempt must retain measurements");
    assert(result.measurements.interruption !== null, "Synthetic recovery disposition must be present");
    expect(result.model.used).toBe(false); expect(result.measurements.interruption.resumeOutcome).toBe("succeeded");
  });

  it("preserves unknown coverage and retained partial events rather than zero or empty observations", () => {
    const events = sessionEvents(); events.splice(2, 0, event("setup-failure", 2, { code: "synthetic", detail: "Known partial failure observation" }));
    Object.assign(closeOf(events).completeness, { actions: false, assistance: false, setupFailures: false, refusals: false });
    const result = projectSession(planFixture(), events, stamp(0));
    expect(result.status).toBe("closed-blocked");
    expect(result.measurements).toMatchObject({ assistanceCount: null, actionsToFirstUsefulResult: null, setupFailures: null, refusals: null });
    expect(events.some(item => item.type === "setup-failure")).toBe(true);
    expect(result.blockers.map((item: { code: string }) => item.code)).toContain("actions-missing");
  });

  it("requires separate explicit unknown recovery and voluntary-return dispositions", () => {
    const events = sessionEvents();
    events.splice(5, 3, event("recovery-decision", 5, { outcome: "not-observed", reason: "Synthetic unobserved recovery" }),
      event("second-task", 7, { outcome: "not-observed", reason: "Synthetic observation gap, not a refusal to return" }));
    const result = projectSession(planFixture(), events, stamp(0));
    expect(result.status).toBe("closed");
    assert(result.measurements !== null, "Closed synthetic session must retain explicit unknown dispositions");
    expect(result.measurements.interruption).toMatchObject({ at: null, resumedAt: null, resumeOutcome: "not-observed" });
    expect(result.measurements.secondTask).toMatchObject({ at: null, outcome: "not-observed" });
  });

  it("never silently uses invocation time, and labels deliberate record-now without replacing supplied observations", () => {
    const noTime = { ...event("start", 1), at: null, timing: null };
    expect(errorCode(() => projectSession(planFixture(), [noTime], stamp(0)))).toBe("timestamp");
    const declared = declareRecordNow(noTime, stamp(1));
    expect(declared).toMatchObject({ at: stamp(1), timing: "operator-declared-now" });
    expect(noTime.at).toBeNull(); expect(projectSession(planFixture(), [declared], stamp(0)).status).toBe("open");
    expect(errorCode(() => declareRecordNow(event("start", 1), stamp(2)))).toBe("record-now-conflict");
    expect(errorCode(() => declareRecordNow({ ...event("close", 8, closeData()), at: null, timing: null }, stamp(8)))).toBe("close-time-required");
  });

  const badSequences: Array<[string, (events: Event[]) => Event[], string]> = [
    ["action before start", e => e.slice(1), "start-required"],
    ["duplicate start", e => [e[0]!, e[0]!], "already-started"],
    ["timestamp before preregistration", e => [{ ...e[0]!, at: stamp(-1) }], "event-order"],
    ["decreasing timestamp", e => [e[0]!, e[2]!, e[1]!], "event-order"],
    ["outcome repeated", e => [...e.slice(0, 4), event("first-task-ended", 4, { outcome: "failed", reason: "synthetic" })], "first-task-ended"],
    ["recovery before first task", e => [e[0]!, e[5]!], "recovery-order"],
    ["resume without interruption", e => [...e.slice(0, 4), e[6]!], "interruption-required"],
    ["second task before recovery", e => [...e.slice(0, 4), e[7]!], "second-task-order"],
    ["close before return disposition", e => [...e.slice(0, 7), e[8]!], "window-incomplete"],
    ["new event after close", e => [...e, event("assistance", 10, { detail: "synthetic" })], "session-closed"]
  ];
  it.each(badSequences)("refuses %s", (_label, mutate, code) => {
    expect(errorCode(() => projectSession(planFixture(), mutate(sessionEvents()), stamp(0)))).toBe(code);
  });

  it("requires explicit close flags and a post-close observer attestation", () => {
    let events = sessionEvents(); Object.assign(closeOf(events), { modelUsed: undefined });
    expect(errorCode(() => projectSession(planFixture(), events, stamp(0)))).toBe("declaration-required");
    events = sessionEvents(); Object.assign(closeOf(events).completeness, { refusals: undefined });
    expect(errorCode(() => projectSession(planFixture(), events, stamp(0)))).toBe("declaration-required");
    events = sessionEvents(); closeOf(events).observer.recordedAt = stamp(7);
    expect(errorCode(() => projectSession(planFixture(), events, stamp(0)))).toBe("attestation-order");
    events = sessionEvents(); closeOf(events).modelUsed = false;
    expect(projectSession(planFixture(), events, stamp(0)).blockers.map((item: { code: string }) => item.code)).toContain("useful-model-result");
  });

  it.each(["humanPresent", "independent", "consentRecorded", "firstUse"] as const)("retains false %s declarations without promoting them to admitted human evidence", key => {
    const events = sessionEvents(); closeOf(events).observer[key] = false;
    expect(projectSession(planFixture(), events, stamp(0)).status).toBe("closed-blocked");
    const automated = planFixture(); automated.participation = "automated-fixture";
    expect(projectSession(automated, events, stamp(0)).status).toBe("closed");
  });
});

describe("retained revision history and complete-roster export", () => {
  it("persists a preparation-only draft, rejects stale and concurrently conflicting updates", async () => {
    const initial = await createCapture(preparation(), store, stamp(100));
    const original = await readFile(join(store, "r-00000.json"));
    expect(captureStatus(await loadCapture(store))).toMatchObject({ preparationOnly: true, plannedSessionCount: 1 });
    const updates = await Promise.allSettled([1, 2].map(() => appendCapture(store, initial.headSha256, "event", { sessionId: "amc-01", event: event("start", 1) }, stamp(100))));
    expect(updates.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(updates.filter(result => result.status === "rejected")).toHaveLength(1);
    await expect(appendCapture(store, initial.headSha256, "event", { sessionId: "amc-01", event: event("start", 1) }, stamp(100))).rejects.toMatchObject({ code: "revision-conflict" });
    expect(await readFile(join(store, "r-00000.json"))).toEqual(original);
    expect((await loadCapture(store)).sessions.get("amc-01")).toHaveLength(1);
  });

  it("resumes from disk and corrects explicitly while retaining every earlier revision and planned session", async () => {
    const state = await persist(), original = await readFile(join(store, "r-00009.json"));
    const corrected = sessionEvents(); closeOf(corrected).completeness.assistance = false;
    const next = await appendCapture(store, state.headSha256, "correction", { sessionId: "amc-01", declaredAt: stamp(11), reason: "Synthetic coverage correction", events: corrected }, stamp(100));
    const loaded = await loadCapture(store);
    expect(loaded.headSha256).toBe(next.headSha256); expect(loaded.revision).toBe(state.revision + 1);
    expect(loaded.draft.plannedSessions).toEqual(preparation().plannedSessions);
    expect(captureStatus(loaded).sessions[0].correctionRevisions).toEqual([next.revision]);
    expect(await readFile(join(store, "r-00009.json"))).toEqual(original);
    await expect(appendCapture(store, next.headSha256, "event", { sessionId: "unplanned", event: event("start", 1) }, stamp(100))).rejects.toMatchObject({ code: "unplanned-session" });
    await expect(appendCapture(store, next.headSha256, "correction", { sessionId: "amc-01", declaredAt: stamp(1), reason: "synthetic", events: [] }, stamp(100))).rejects.toMatchObject({ code: "correction-order" });
  });

  it("detects a modified ancestor, missing revision and partial tail rather than silently skipping them", async () => {
    await persist();
    const origin = join(store, "r-00000.json"), bytes = await readFile(origin, "utf8");
    await writeFile(origin, bytes.replace("synthetic-study", "changed-study"));
    await expect(loadCapture(store)).rejects.toMatchObject({ code: "revision-conflict" });
    await writeFile(origin, bytes); await rm(join(store, "r-00002.json"));
    await expect(loadCapture(store)).rejects.toMatchObject({ code: "journal-gap" });
    const other = join(root, "partial"); await createCapture(preparation(), other, stamp(100));
    await writeFile(join(other, "r-00001.json"), '{"partial":');
    await expect(loadCapture(other)).rejects.toMatchObject({ code: "journal-json" });
  });

  it("refuses malformed correction events through the schema boundary without advancing history", async () => {
    const state = await persist();
    await expect(appendCapture(store, state.headSha256, "correction", {
      sessionId: "amc-01", declaredAt: stamp(11), reason: "Synthetic invalid correction", events: [null]
    }, stamp(100))).rejects.toMatchObject({ code: "schema" });
    expect((await loadCapture(store)).headSha256).toBe(state.headSha256);
  });

  it("withholds the whole intake study when planned sessions are unobserved or still open", async () => {
    const plans = [planFixture(), planFixture("pi-missing", "pi"), planFixture("dsh-open", "dsh")];
    const state = await persist(plans, [sessionEvents(), [], [event("start", 1)]]); await saveRecording();
    const output = join(root, "blocked-export");
    const report = await finalizeCapture(store, state.headSha256, evidence, output, stamp(100));
    expect(report.exportStatus).toBe("blocked"); expect(report.studyWritten).toBe(false);
    expect(report.sessions.map((row: { sessionId: string }) => row.sessionId)).toEqual(plans.map(plan => plan.sessionId));
    expect(report.unobservedPlannedSessionIds).toEqual(["pi-missing"]); expect(report.unclosedSessionIds).toEqual(["dsh-open"]);
    await expect(stat(join(output, "study.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(output, "journal", "r-00000.json"))).toEqual(await readFile(join(store, "r-00000.json")));
  });

  it("exports failed/incomplete attempts and unknown assistance, with actual hashes accepted by existing intake", async () => {
    const plans = [planFixture(), planFixture("amc-failed"), planFixture("pi-incomplete", "pi")];
    const sequences = [sessionEvents(), sessionEvents("amc-failed", "failed"), sessionEvents("pi-incomplete", "incomplete")];
    closeOf(sequences[1]!).completeness.assistance = false;
    const state = await persist(plans, sequences); for (const plan of plans) await saveRecording(plan.sessionId);
    const output = join(root, "complete-export");
    const report = await finalizeCapture(store, state.headSha256, evidence, output, stamp(100));
    expect(report.exportStatus).toBe("complete-roster-export");
    expect(report.failedFirstTaskSessionIds).toEqual(["amc-failed"]); expect(report.incompleteFirstTaskSessionIds).toEqual(["pi-incomplete"]);
    const bytes = await readFile(join(output, "study.json")), study = JSON.parse(bytes.toString("utf8"));
    expect(report.studySha256).toBe(hash(bytes)); expect(study.sessions).toHaveLength(plans.length);
    expect(validateStudy(study).records.every((row: { errors: unknown[] }) => row.errors.length === 0)).toBe(true);
    expect(study.sessions[1].measurements).toMatchObject({ outcome: "failed", firstUsefulResultAt: null, actionsToFirstUsefulResult: null, assistanceCount: null });
    expect(study.sessions[0].recording.sha256).toBe(hash(recording("amc-01")));
    const intake = await intakeStudy(study, { evidenceRoot: evidence, generatedAt: stamp(100) });
    expect(intake.intakeStatus).toBe("valid-records"); expect(intake.comparative.status).toBe("insufficient-evidence");
    expect(intake.comparative.humanParticipationAuthenticated).toBe(false);
    expect(JSON.stringify(report)).not.toContain("PRIVATE_RECORDING_CANARY"); expect(JSON.stringify(report)).not.toContain("PRIVATE_NARRATIVE_CANARY");
    expect(report.boundary).toContain("Operator-declared");
    if (process.platform !== "win32") {
      expect((await stat(output)).mode & 0o777).toBe(0o700);
      expect((await stat(join(output, "study.json"))).mode & 0o777).toBe(0o600);
    }
  });

  it.each(["setupFailures", "refusals"] as const)("blocks export of unknown %s instead of converting it into an empty array", async field => {
    const events = sessionEvents(); closeOf(events).completeness[field] = false;
    const state = await persist([planFixture()], [events]); await saveRecording();
    const output = join(root, "unknown-export"), report = await finalizeCapture(store, state.headSha256, evidence, output, stamp(100));
    expect(report.exportStatus).toBe("blocked"); expect(report.sessions[0].observationGaps).toContain(field);
    await expect(stat(join(output, "study.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("blocks unsatisfied window rules and retains their explicit deviation", async () => {
    const events = sessionEvents(); Object.assign(closeOf(events), { windowRuleSatisfied: false, windowRuleDeviation: "Synthetic early close" });
    const state = await persist([planFixture()], [events]);
    const report = await finalizeCapture(store, state.headSha256, evidence, join(root, "early-export"), stamp(100));
    expect(report.exportStatus).toBe("blocked");
    expect(report.sessions[0].blockers.map((item: { code: string }) => item.code)).toContain("window-rule-unsatisfied");
  });

  it("rejects reuse of the same recording bytes for all colliding sessions, including automation", async () => {
    const plans = [planFixture(), planFixture("pi-01", "pi")]; plans.forEach(plan => { plan.participation = "automated-fixture"; });
    const state = await persist(plans, [sessionEvents(), sessionEvents("pi-01")]);
    for (const plan of plans) await writeFile(join(evidence, `${plan.sessionId}.txt`), "identical SYNTHETIC recording");
    const report = await finalizeCapture(store, state.headSha256, evidence, join(root, "duplicate-export"), stamp(100));
    expect(report.exportStatus).toBe("blocked");
    expect(report.sessions.every((row: { blockers: Array<{ code: string }> }) => row.blockers.some(item => item.code === "duplicate-recording"))).toBe(true);
  });

  it("reports missing recording bytes without dropping the closed planned session", async () => {
    const state = await persist(); const report = await finalizeCapture(store, state.headSha256, evidence, join(root, "missing-export"), stamp(100));
    expect(report.exportStatus).toBe("blocked"); expect(report.sessions).toHaveLength(1); expect(report.sessions[0].status).toBe("closed-blocked");
  });

  it("detects changes between the derived hash and intake verification", async () => {
    const state = await persist(); await saveRecording();
    Object.assign(race, { path: join(evidence, "amc-01.txt"), openCount: 0, mutateOnOpen: 2 });
    const output = join(root, "changed-export"), report = await finalizeCapture(store, state.headSha256, evidence, output, stamp(100));
    expect(report.exportStatus).toBe("blocked"); expect(report.sessions[0].blockers.length).toBeGreaterThan(0);
    await expect(stat(join(output, "study.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("contained recording reads, strict JSON and exclusive private outputs", () => {
  it("derives a digest from bytes without a supplied expected digest and detects mid-read changes", async () => {
    await saveRecording(); const actual = await hashRecording(evidence, "amc-01.txt");
    expect(actual).toEqual({ path: "amc-01.txt", sha256: hash(recording("amc-01")), bytes: Buffer.byteLength(recording("amc-01")) });
    Object.assign(race, { path: join(evidence, "amc-01.txt"), mutateAfterRead: true });
    await expect(hashRecording(evidence, "amc-01.txt")).rejects.toBeInstanceOf(CaptureError);
  });

  it.each(["../outside", "a/../../outside", "./recording", "/absolute", "a//b", "a\\b", "C:private", "file:///private", "https://example.invalid/video"])("rejects unsafe recording path %s", async path => {
    await expect(hashRecording(evidence, path)).rejects.toMatchObject({ code: "recording-path" });
  });

  it("refuses file/directory symlinks, hardlinks and nonregular recordings", async () => {
    await saveRecording();
    await symlink(join(evidence, "amc-01.txt"), join(evidence, "alias.txt"));
    await expect(hashRecording(evidence, "alias.txt")).rejects.toMatchObject({ code: "file-symlink" });
    await mkdir(join(root, "outside")); await writeFile(join(root, "outside", "file.txt"), "synthetic");
    await symlink(join(root, "outside"), join(evidence, "dir-link"), "dir");
    await expect(hashRecording(evidence, "dir-link/file.txt")).rejects.toMatchObject({ code: "file-symlink" });
    await link(join(evidence, "amc-01.txt"), join(root, "hardlinked.txt"));
    await expect(hashRecording(evidence, "amc-01.txt")).rejects.toMatchObject({ code: "file-hardlink" });
    await mkdir(join(evidence, "directory"));
    await expect(hashRecording(evidence, "directory")).rejects.toMatchObject({ code: "file-type" });
    const rootAlias = join(root, "root-alias"); await symlink(evidence, rootAlias, "dir");
    await expect(hashRecording(rootAlias, "amc-01.txt")).rejects.toMatchObject({ code: "directory" });
  });

  it("rejects empty and oversized sparse recordings and oversized JSON before reading their contents", async () => {
    const large = join(evidence, "large.bin"), handle = await open(large, "wx");
    try { await handle.truncate(LIMITS.recordingBytes + 1); } finally { await handle.close(); }
    await expect(hashRecording(evidence, "large.bin")).rejects.toMatchObject({ code: "file-size" });
    await writeFile(join(evidence, "empty"), ""); await expect(hashRecording(evidence, "empty")).rejects.toMatchObject({ code: "file-size" });
    const json = join(root, "large.json"), jsonHandle = await open(json, "wx");
    try { await jsonHandle.truncate(LIMITS.jsonBytes + 1); } finally { await jsonHandle.close(); }
    await expect(readCaptureJson(json)).rejects.toMatchObject({ code: "file-size" });
  });

  it.each(['{"a":1,"a":2}', String.raw`{"a":1,"\u0061":2}`, '{"PRIVATE_JSON_CANARY":'])("rejects ambiguous/malformed JSON without echoing private excerpts", async contents => {
    const input = join(root, "private.json"); await writeFile(input, contents);
    const { captured, io } = ioCapture();
    expect(await runCli(["prepare", "--input", input, "--store", store], io)).toBe(1);
    expect(captured.stderr).not.toContain("PRIVATE_JSON_CANARY"); expect(captured.stdout).toBe("");
    await expect(stat(store)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects invalid UTF-8 and excessive nesting", async () => {
    const input = join(root, "bad.json"); await writeFile(input, Buffer.from([0xff, 0xfe]));
    await expect(readCaptureJson(input)).rejects.toMatchObject({ code: "input-json" });
    await writeFile(input, "[".repeat(40) + "0" + "]".repeat(40));
    await expect(readCaptureJson(input)).rejects.toMatchObject({ code: "input-depth" });
  });

  it("never overwrites outputs, existing symlinks, journals or export bundles", async () => {
    const output = join(root, "exclusive.json"); await writeExclusive(output, Buffer.from("retained"));
    await expect(writeExclusive(output, Buffer.from("replacement"))).rejects.toMatchObject({ code: "output-exists" });
    const alias = join(root, "alias.json"); await symlink(output, alias);
    await expect(writeExclusive(alias, Buffer.from("replacement"))).rejects.toMatchObject({ code: "output-exists" });
    expect(await readFile(output, "utf8")).toBe("retained"); expect((await lstat(alias)).isSymbolicLink()).toBe(true);
    const state = await persist(); await saveRecording();
    await expect(createCapture(preparation(), store, stamp(100))).rejects.toMatchObject({ code: "output-exists-or-unavailable" });
    const directory = join(root, "export"); await finalizeCapture(store, state.headSha256, evidence, directory, stamp(100));
    const before = await readFile(join(directory, "report.json"));
    await expect(finalizeCapture(store, state.headSha256, evidence, directory, stamp(100))).rejects.toMatchObject({ code: "output-exists-or-unavailable" });
    expect(await readFile(join(directory, "report.json"))).toEqual(before);
    await expect(finalizeCapture(store, state.headSha256, evidence, join(store, "bad-output"), stamp(100))).rejects.toMatchObject({ code: "output-overlap" });
  });

  it("exposes usable CLI commands and distinct preparation, refusal and blocked-export exit semantics", async () => {
    const input = join(root, "preparation.json"); await writeFile(input, JSON.stringify(preparation()));
    const first = ioCapture(); expect(await runCli(["prepare", "--input", input, "--store", store], first.io)).toBe(0);
    const head = JSON.parse(first.captured.stdout).headSha256;
    const statusIo = ioCapture(); expect(await runCli(["status", "--store", store], statusIo.io)).toBe(0);
    expect(JSON.parse(statusIo.captured.stdout).sessions[0].status).toBe("unobserved");
    const blocked = ioCapture();
    expect(await runCli(["export", "--store", store, "--expect", head, "--evidence-root", evidence, "--out", join(root, "cli-export")], blocked.io)).toBe(2);
    expect(JSON.parse(blocked.captured.stdout)).toMatchObject({ exportStatus: "blocked", studyWritten: false, reportWritten: true });
    const refused = ioCapture(); expect(await runCli(["status", "--store", store, "--store", store], refused.io)).toBe(1);
    const help = ioCapture(); expect(await runCli(["--help"], help.io)).toBe(0); expect(help.captured.stdout).toContain("--record-now");
    const protocol = ioCapture(); expect(await runCli(["protocol"], protocol.io)).toBe(0);
    expect(JSON.parse(protocol.captured.stdout)).toEqual({ protocol: COMMON_PROTOCOL, task: COMMON_TASK });
  });
});
