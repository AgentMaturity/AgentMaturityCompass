/** AUTHORED / UNEXECUTED. Synthetic declarations and disposable local files only.
 * No person, provider, harness, production credential or recording is involved.
 * These tests specify the real capture/intake/CLI paths, not mocked core success.
 */
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CAPTURE_VERSION, CREDENTIAL_CAPTURE_VERSION, applyRevision, appendCapture,
  captureStatus, createCapture, finalizeCapture, loadCapture, migrateCapture,
  migratePreparationDraft, prepareDraft, runCli
} from "../scripts/human-first-use-capture.mjs";
import { COMMON_PROTOCOL, COMMON_TASK, CREDENTIAL_SCHEMA_VERSION, intakeStudy } from "../scripts/human-first-use-intake.mjs";

type Observation = { type: string; at: string; timing: string; data: Record<string, unknown> };
type Journal = ReturnType<typeof applyRevision>;
const stamp = (seconds: number) => new Date(Date.UTC(2026, 8, 1, 10) + seconds * 1000).toISOString();
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const encode = (value: unknown) => Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
const event = (type: string, seconds: number, data: Record<string, unknown> = {}): Observation =>
  ({ type, at: stamp(seconds), timing: "explicit-observed", data });
const migration = () => ({ declaredAt: stamp(10), reason: "Synthetic prospective version choice", startingStatesUnchanged: true });
const correction = (seconds: number, sessionId = "synthetic-first", events: Observation[] = []) =>
  ({ sessionId, declaredAt: stamp(seconds), reason: "Synthetic correction, not a human observation", events });
function head(state: { headSha256: unknown }): string {
  if (typeof state.headSha256 !== "string") throw new Error("Synthetic journal has no head");
  return state.headSha256;
}
function plan(id: string) {
  return { sessionId: id, participation: "automated-fixture", participantId: `p-${id}`, observerId: "o-synthetic",
    harness: { name: "amc", version: "synthetic-only", sourceCommit: "a".repeat(40), artifactSha256: null },
    environment: { machineClass: "synthetic-machine", os: "darwin", osVersion: "synthetic", arch: "arm64", nodeVersion: "22.0.0", installState: "clean" },
    model: { kind: "local-provider", provider: "synthetic-provider", id: "synthetic-model", revision: "synthetic-revision",
      settingsSha256: hash("synthetic generation settings"), credentialState: "missing" } };
}
function preparation() {
  return { studyId: "synthetic-migration-floor", preparedAt: stamp(0),
    operator: { id: "o-synthetic", statement: "Synthetic preparation; no people participated" },
    protocol: { ...COMMON_PROTOCOL }, task: COMMON_TASK,
    observationWindowRule: "Synthetic full-window task, recovery and return dispositions",
    assistancePolicy: "Retain unknown intervention actors as unknown assistance",
    plannedSessions: [plan("synthetic-first"), plan("synthetic-second")] };
}
function record(state: Journal | null, kind: string, payload: unknown, version = state?.draft.captureVersion ?? CREDENTIAL_CAPTURE_VERSION) {
  return { captureVersion: version, revision: state ? state.revision + 1 : 0,
    previousSha256: state ? head(state) : null, savedAt: stamp(100), kind, payload };
}
function apply(state: Journal | null, kind: string, payload: unknown, version?: string): Journal {
  const value = record(state, kind, payload, version), bytes = encode(value);
  return applyRevision(state, value, hash(bytes), bytes.length);
}
function pureMigrated(): Journal {
  const legacy = apply(null, "prepare", prepareDraft(preparation()), CAPTURE_VERSION);
  const draft = migratePreparationDraft(legacy, head(legacy), migration());
  return apply(null, "prepare", draft, CREDENTIAL_CAPTURE_VERSION);
}
function closeData(sessionId: string, used: boolean, at: number) {
  return { completeness: { actions: true, assistance: true, setupFailures: true, refusals: true, credentials: true },
    modelUsed: used, observer: { humanPresent: false, independent: false, consentRecorded: false, firstUse: false,
      statement: "Synthetic declaration, no participant or inference", recordedAt: stamp(at + 1) },
    recordingPath: `${sessionId}.txt`, windowRuleSatisfied: true, windowRuleDeviation: null };
}
function failedUsedSequence(): Observation[] {
  return [event("start", 11),
    event("credential-change", 12, { from: "missing", to: "configured", actor: "unknown" }),
    event("model-use", 13, { credentialState: "configured" }),
    event("first-task-ended", 14, { outcome: "failed", reason: "Synthetic unsuccessful task" }),
    event("recovery-decision", 15, { outcome: "not-attempted", reason: "Synthetic recovery not attempted" }),
    event("second-task", 16, { outcome: "not-observed", reason: "Synthetic return not observed" }),
    event("close", 17, closeData("synthetic-first", true, 17))];
}
function incompleteUnusedSequence(): Observation[] {
  return [event("start", 20),
    event("first-task-ended", 21, { outcome: "incomplete", reason: "Synthetic unused task" }),
    event("recovery-decision", 22, { outcome: "not-attempted", reason: "Synthetic recovery not attempted" }),
    event("second-task", 23, { outcome: "not-observed", reason: "Synthetic return not observed" }),
    event("close", 24, closeData("synthetic-second", false, 24))];
}

let root = "", store = "", evidence = "";
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "amc-credential-migration-floor-")));
  store = join(root, "legacy"); evidence = join(root, "recordings");
  await mkdir(evidence);
});
afterEach(async () => {
  // Only this test's own mkdtemp root; no shared repo, worktree or user evidence.
  if (root) await rm(root, { recursive: true, force: true });
  root = "";
});
async function snapshot(path: string) {
  return Promise.all((await readdir(path)).sort().map(async name => ({ name, bytes: await readFile(join(path, name)) })));
}
async function diskMigrated() {
  const initial = await createCapture(preparation(), store, stamp(100));
  const out = join(root, "migrated");
  const migrated = await migrateCapture(store, head(initial), out, migration(), stamp(100));
  return { initial, out, migrated };
}
function cliIo() {
  const captured = { stdout: "", stderr: "" };
  return { captured, io: { stdout: { write: (text: string) => { captured.stdout += text; } },
    stderr: { write: (text: string) => { captured.stderr += text; } } } };
}

describe("credential capture migration: correction declarations cannot predate the fork", () => {
  it("rejects a pre-migration empty correction without mutating pure state", () => {
    const initial = pureMigrated(), before = structuredClone(initial);
    expect(() => apply(initial, "correction", correction(9))).toThrow(expect.objectContaining({ code: "correction-order" }));
    expect(initial).toEqual(before);
    const accepted = apply(initial, "correction", correction(10));
    expect(accepted.draft.preparedAt).toBe(stamp(0));
    expect(accepted.draft.migration).toEqual(initial.draft.migration);
    expect(accepted.draft.plannedSessions).toEqual(preparation().plannedSessions);
    expect(captureStatus(accepted).sessions.map((row: { status: string }) => row.status)).toEqual(["unobserved", "unobserved"]);
  });

  it.each([CAPTURE_VERSION, CREDENTIAL_CAPTURE_VERSION])("keeps the original preparation floor for non-migrated %s", version => {
    const initial = apply(null, "prepare", prepareDraft(preparation(), version), version);
    const invalid = () => apply(initial, "correction", correction(-1));
    expect(invalid).toThrow("Declare the correction at or after all replaced/replacement observations and attestations.");
    const accepted = apply(initial, "correction", correction(0));
    expect(accepted.draft.captureVersion).toBe(version);
    expect(accepted.draft.plannedSessions).toEqual(initial.draft.plannedSessions);
    expect(accepted.history).toHaveLength(2);
    if (version === CAPTURE_VERSION) {
      expect(Object.hasOwn(accepted.draft, "migration")).toBe(false);
      expect(() => migratePreparationDraft(accepted, head(accepted), migration())).toThrow(expect.objectContaining({ code: "migration-observed" }));
    } else expect(accepted.draft.migration).toBeNull();
  });

  it("preserves source and migrated revision bytes when an append or CLI correction is refused", async () => {
    const { initial, out, migrated } = await diskMigrated();
    const originalBytes = await snapshot(store), forkBytes = await snapshot(out);
    await expect(appendCapture(out, head(migrated), "correction", correction(9), stamp(100)))
      .rejects.toMatchObject({ code: "correction-order" });
    const input = join(root, "correction.json");
    await writeFile(input, encode(correction(9)), { flag: "wx" });
    const { captured, io } = cliIo();
    expect(await runCli(["correct", "--store", out, "--expect", head(migrated), "--input", input], io)).toBe(1);
    expect(captured.stdout).toBe("");
    expect(JSON.parse(captured.stderr)).toMatchObject({ error: "correction-order" });
    expect(captured.stderr).not.toContain("Synthetic correction, not a human observation");
    expect(await snapshot(store)).toEqual(originalBytes); expect(await snapshot(out)).toEqual(forkBytes);
    expect(head(await loadCapture(store))).toBe(head(initial)); expect(head(await loadCapture(out))).toBe(head(migrated));
    const accepted = await appendCapture(out, head(migrated), "correction", correction(10), stamp(100));
    expect(accepted.revision).toBe(1);
    expect(await readFile(join(out, "r-00000.json"))).toEqual(forkBytes[0]!.bytes);
  });

  it("keeps replaced observations and at-close attestations as additional correction floors", () => {
    let current = pureMigrated();
    for (const observation of failedUsedSequence()) {
      current = apply(current, "event", { sessionId: "synthetic-first", event: observation });
    }
    const before = structuredClone(current);
    // Migration is at 10; latest observation at 17, attestation at 18.
    expect(() => apply(current, "correction", correction(17))).toThrow(expect.objectContaining({ code: "correction-order" }));
    const replacement = failedUsedSequence();
    replacement[replacement.length - 1] = event("close", 17, closeData("synthetic-first", true, 29));
    expect(() => apply(current, "correction", correction(29, "synthetic-first", replacement)))
      .toThrow(expect.objectContaining({ code: "correction-order" }));
    const cleared = apply(current, "correction", correction(18));
    expect(current).toEqual(before);
    expect(cleared.history.slice(0, -1)).toEqual(before.history);
    expect(captureStatus(cleared).sessions[0].status).toBe("unobserved");
  });

  it("cold-load refuses a well-linked but backdated correction before any export prefix", async () => {
    const { out, migrated } = await diskMigrated();
    // Deliberately hostile bytes only in this disposable synthetic journal.
    const hostile = encode(record(migrated, "correction", correction(9)));
    await writeFile(join(out, "r-00001.json"), hostile, { flag: "wx" });
    const retained = await snapshot(out), original = await snapshot(store);
    await expect(loadCapture(out)).rejects.toMatchObject({ code: "correction-order" });
    const output = join(root, "refused-export");
    await expect(finalizeCapture(out, hash(hostile), evidence, output, stamp(100)))
      .rejects.toMatchObject({ code: "correction-order" });
    await expect(stat(output)).rejects.toMatchObject({ code: "ENOENT" });
    const { captured, io } = cliIo();
    expect(await runCli(["status", "--store", out], io)).toBe(1);
    expect(captured.stdout).toBe(""); expect(JSON.parse(captured.stderr).error).toBe("correction-order");
    expect(await snapshot(out)).toEqual(retained); expect(await snapshot(store)).toEqual(original);
  });

  it("retains the entire migrated roster, failed use and assistance unknowns across blocked and complete exports", async () => {
    const { out, migrated } = await diskMigrated(), original = await snapshot(store);
    let current = await appendCapture(out, head(migrated), "correction", correction(10), stamp(100));
    for (const observation of failedUsedSequence()) {
      current = await appendCapture(out, head(current), "event", { sessionId: "synthetic-first", event: observation }, stamp(100));
    }
    await writeFile(join(evidence, "synthetic-first.txt"), "SYNTHETIC FIRST: no person or provider", { flag: "wx" });
    const retained = await snapshot(out), blockedPath = join(root, "blocked-export");
    const blocked = await finalizeCapture(out, head(current), evidence, blockedPath, stamp(100));
    expect(blocked.exportStatus).toBe("blocked"); expect(blocked.studyWritten).toBe(false);
    expect(blocked.sessions.map((row: { sessionId: string }) => row.sessionId)).toEqual(["synthetic-first", "synthetic-second"]);
    expect(blocked.failedFirstTaskSessionIds).toEqual(["synthetic-first"]);
    expect(blocked.unobservedPlannedSessionIds).toEqual(["synthetic-second"]);
    await expect(stat(join(blockedPath, "study.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await snapshot(join(blockedPath, "journal"))).toEqual(retained);
    const blockedReportBytes = await readFile(join(blockedPath, "report.json"));

    for (const observation of incompleteUnusedSequence()) {
      current = await appendCapture(out, head(current), "event", { sessionId: "synthetic-second", event: observation }, stamp(100));
    }
    await writeFile(join(evidence, "synthetic-second.txt"), "SYNTHETIC SECOND: no person or provider", { flag: "wx" });
    const completePath = join(root, "complete-export");
    const complete = await finalizeCapture(out, head(current), evidence, completePath, stamp(100));
    expect(complete.exportStatus).toBe("complete-roster-export");
    const study = JSON.parse(await readFile(join(completePath, "study.json"), "utf8"));
    expect(study.schemaVersion).toBe(CREDENTIAL_SCHEMA_VERSION);
    expect(study.sessions).toHaveLength(2);
    expect(study.sessions[0]).toMatchObject({ model: { credentialState: "missing", used: true,
      credentials: { startingState: "missing", coverageComplete: true } },
      measurements: { outcome: "failed", firstUsefulResultAt: null, actionsToFirstUsefulResult: null, assistanceCount: null } });
    expect(study.sessions[1]).toMatchObject({ model: { credentialState: "missing", used: false,
      credentials: { startingState: "missing", observations: [] } }, measurements: { outcome: "incomplete" } });
    const intake = await intakeStudy(study, { evidenceRoot: evidence, generatedAt: stamp(100) });
    expect(intake.intakeStatus).toBe("valid-records");
    expect(intake.comparative).toMatchObject({ status: "insufficient-evidence", excludedAutomatedRecords: 2, humanParticipationAuthenticated: false });
    expect(await readFile(join(blockedPath, "report.json"))).toEqual(blockedReportBytes);
    expect(await snapshot(store)).toEqual(original);
  });
});
