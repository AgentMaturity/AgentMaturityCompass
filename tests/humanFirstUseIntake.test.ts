import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { link, lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  COMMON_PROTOCOL, MIN_HUMAN_SESSIONS_PER_HARNESS, SCHEMA_VERSION,
  intakeStudy, isRecordingPath, parseStudyJson, runCli, validateSession, validateStudy, writeIntakeReport
} from "../scripts/human-first-use-intake.mjs";

// AUTHOR-ONLY REGRESSIONS. All identities, declarations, timestamps and recording
// bytes below are synthetic. Even affirmative human-declared fixtures are NOT
// human evidence. No test execution or first-use result is claimed by this file.
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const privateBytes = (id: string) => `SYNTHETIC RECORDING ${id}; PRIVATE_RECORDING_CANARY; no human participated.\n`;
const stamp = (minute: number) => `2026-09-01T10:${String(minute).padStart(2, "0")}:00.000Z`;
let root: string;
let evidenceRoot: string;

function sessionFixture(id = "amc-01", harness = "amc") {
  return {
    sessionId: id, participation: "human-declared", participantId: `p-${id}`,
    observer: { id: "o-fixture", humanPresent: true, independent: true, consentRecorded: true, firstUse: true,
      statement: "SYNTHETIC TEST DECLARATION; PRIVATE_NARRATIVE_CANARY; no human participated.", recordedAt: stamp(10) },
    harness: { name: harness, version: "synthetic-1", sourceCommit: "a".repeat(40) as string | null,
      artifactSha256: hash(`synthetic artifact ${harness}`) as string | null },
    environment: { machineClass: "synthetic-arm-laptop", os: "darwin", osVersion: "synthetic-os-version",
      arch: "arm64", nodeVersion: "22.0.0", installState: "clean" },
    protocol: { ...COMMON_PROTOCOL },
    model: { kind: "local-provider", used: true, provider: "synthetic-provider" as string | null,
      id: "synthetic-model" as string | null, revision: "synthetic-model-revision" as string | null,
      settingsSha256: hash("synthetic settings") as string | null, credentialState: "not-required" },
    measurements: {
      startedAt: stamp(0), endedAt: stamp(10), outcome: "completed",
      firstUsefulResultAt: stamp(1) as string | null, actionsToFirstUsefulResult: 3 as number | null,
      noResultReason: null as string | null, assistanceCount: 0 as number | null,
      setupFailures: [] as Array<{ at: string; code: string; detail: string }>,
      refusals: [] as Array<{ at: string; code: string; namedFix: boolean | null }>,
      interruption: { at: stamp(2) as string | null, resumedAt: stamp(3) as string | null, resumeOutcome: "succeeded", reason: null as string | null },
      secondTask: { outcome: "returned", at: stamp(4) as string | null, reason: null as string | null }
    },
    recording: { path: `${id}.txt`, sha256: hash(privateBytes(id)) }
  };
}
type Session = ReturnType<typeof sessionFixture>;
const studyFixture = (sessions: Session[]) => ({ schemaVersion: SCHEMA_VERSION, studyId: "synthetic-study", sessions });
const codes = (report: Awaited<ReturnType<typeof intakeStudy>>) => report.records.flatMap((row: { errors: Array<{ code: string }> }) => row.errors.map(error => error.code));

async function record(session: Session) {
  await writeFile(join(evidenceRoot, session.recording.path), privateBytes(session.sessionId));
  return session;
}

async function cohort(counts = [5, 5, 5]) {
  const sessions: Session[] = [];
  for (const [index, harness] of ["amc", "dsh", "pi"].entries()) {
    for (let n = 0; n < counts[index]!; n += 1) sessions.push(await record(sessionFixture(`${harness}-${n}`, harness)));
  }
  return studyFixture(sessions);
}

function noUsefulResult(session: Session, outcome = "failed") {
  session.measurements.outcome = outcome;
  session.measurements.firstUsefulResultAt = null;
  session.measurements.actionsToFirstUsefulResult = null;
  session.measurements.noResultReason = "Synthetic setup failure; not a measured human outcome.";
  session.model.used = false; // Planned identity remains matched; failure must stay in the denominator.
  return session;
}

function captureIo() {
  const captured = { stdout: "", stderr: "" };
  return { captured, io: {
    stdout: { write: (text: string) => { captured.stdout += text; } },
    stderr: { write: (text: string) => { captured.stderr += text; } }
  } };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "amc-human-intake-test-"));
  evidenceRoot = join(root, "evidence");
  await mkdir(evidenceRoot);
});
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

describe("independent human first-use intake: synthetic contract fixtures", () => {
  it("imports without invoking the CLI or emitting a result", () => {
    const moduleUrl = new URL("../scripts/human-first-use-intake.mjs", import.meta.url).href;
    const imported = spawnSync(process.execPath, ["--input-type=module", "--eval", `await import(${JSON.stringify(moduleUrl)});`],
      { cwd: root, encoding: "utf8", timeout: 10000 });
    expect(imported.status).toBe(0);
    expect(imported.stdout).toBe("");
    expect(imported.stderr).toBe("");
  });

  it("keeps schema validation pure and separate from recording-byte checks", () => {
    const study = studyFixture([sessionFixture()]); // No recording is created.
    const before = structuredClone(study);
    expect(validateSession(study.sessions[0])).toEqual([]);
    expect(validateStudy(study).records[0].errors).toEqual([]);
    expect(study).toEqual(before);
  });

  it("admits a human declaration with matching bytes without claiming authentication or a study pass", async () => {
    const session = await record(sessionFixture());
    const study = studyFixture([session]);
    const before = structuredClone(study);
    const result = await intakeStudy(study, { evidenceRoot, generatedAt: stamp(11) });
    expect(result.intakeStatus).toBe("valid-records");
    expect(result.records[0].status).toBe("human-declared");
    expect(result.records[0].recordingCheck).toMatchObject({ status: "hash-matched", sha256: session.recording.sha256 });
    expect(result.records[0].observer.statementRecorded).toBe(true);
    expect(result.comparative).toMatchObject({ status: "insufficient-evidence", minimumPerHarness: 5,
      humanParticipationAuthenticated: false, ranking: null, superiorityClaim: null });
    expect(result.comparative.cohorts[0].summaries).toBeNull();
    expect(JSON.stringify(result)).not.toContain("PRIVATE_RECORDING_CANARY");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_NARRATIVE_CANARY");
    expect(JSON.stringify(result)).not.toContain(evidenceRoot);
    expect(study).toEqual(before);
  });

  it("keeps explicit automation out even with affirmative observer flags and successful outcomes", async () => {
    const study = await cohort();
    study.sessions[0]!.participation = "automated-fixture";
    const result = await intakeStudy(study, { evidenceRoot });
    expect(result.records[0].status).toBe("automated-fixture");
    expect(result.comparative.excludedAutomatedRecords).toBe(1);
    expect(result.comparative.cohorts[0].humanDeclaredCounts).toEqual({ amc: 4, dsh: 5, pi: 5 });
    expect(result.comparative.cohorts[0].summaries).toBeNull();
    expect(result.comparative.status).toBe("insufficient-evidence");
  });

  it("never substitutes an automated-only or empty study for human evidence", async () => {
    const study = await cohort();
    for (const session of study.sessions) session.participation = "automated-fixture";
    const result = await intakeStudy(study, { evidenceRoot });
    expect(result.comparative.excludedAutomatedRecords).toBe(study.sessions.length);
    expect(result.comparative.cohorts).toEqual([]);
    expect(result.comparative.status).toBe("insufficient-evidence");
    const empty = await intakeStudy(studyFixture([]), { evidenceRoot });
    expect(empty.comparative.status).toBe("insufficient-evidence");
    expect(empty.comparative.ranking).toBeNull();
  });

  const invalidCases: Array<[string, (session: Session) => void, string]> = [
    ["identifying email instead of pseudonym", s => { s.participantId = "private-person@example.invalid"; }, "participantId"],
    ["unaffirmed independent observer", s => { s.observer.independent = false; }, "observer.independent"],
    ["no human observed", s => { s.observer.humanPresent = false; }, "observer.humanPresent"],
    ["no consent declaration", s => { s.observer.consentRecorded = false; }, "observer.consentRecorded"],
    ["not a first use", s => { s.observer.firstUse = false; }, "observer.firstUse"],
    ["abbreviated source identity", s => { s.harness.sourceCommit = "abcdef1"; }, "harness.sourceCommit"],
    ["negative actions", s => { s.measurements.actionsToFirstUsefulResult = -1; }, "measurements.actionsToFirstUsefulResult"],
    ["fractional actions", s => { s.measurements.actionsToFirstUsefulResult = 1.5; }, "measurements.actionsToFirstUsefulResult"],
    ["impossible calendar date", s => { s.measurements.startedAt = "2026-02-30T10:00:00.000Z"; }, "measurements.startedAt"],
    ["end before start", s => { s.measurements.endedAt = "2026-08-31T10:00:00.000Z"; }, "measurements.endedAt"],
    ["result outside observation", s => { s.measurements.firstUsefulResultAt = stamp(11); }, "measurements.firstUsefulResultAt"],
    ["premature observer statement", s => { s.observer.recordedAt = stamp(1); }, "observer.recordedAt"],
    ["resume before interruption", s => { s.measurements.interruption.resumedAt = stamp(1); }, "measurements.interruption.resumedAt"],
    ["unobserved return with a timestamp", s => { s.measurements.secondTask.outcome = "not-observed"; }, "measurements.secondTask.at"],
    ["claimed used model with unknown credentials", s => { s.model.credentialState = "unknown"; }, "model.credentialState"],
    ["stub claimed as real model", s => { s.model.kind = "keyless-demo"; }, "model"],
    ["unknown schema key", s => { Object.assign(s, { PRIVATE_SECRET_KEY_CANARY: "private" }); }, "sessions[0]"]
  ];
  it.each(invalidCases)("rejects %s with a field-specific issue", async (_name, mutate, field) => {
    const session = await record(sessionFixture());
    mutate(session);
    const result = await intakeStudy(studyFixture([session]), { evidenceRoot });
    expect(result.records[0].status).toBe("invalid");
    expect(result.records[0].errors.some((error: { path: string }) => error.path.includes(field))).toBe(true);
    expect(result.comparative.status).toBe("insufficient-evidence");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_SECRET_KEY_CANARY");
  });

  it("does not throw while classifying malformed non-scalar timestamp fields", async () => {
    const session = sessionFixture();
    Object.assign(session.measurements, { startedAt: { toString: "not-callable" }, endedAt: ["2026"] });
    const result = await intakeStudy(studyFixture([session]), { evidenceRoot });
    expect(result.records[0].status).toBe("invalid");
    expect(codes(result)).toContain("timestamp");
  });

  it.each(["model-id", "harness-identity", "actions", "setup-failures", "refusals", "recording", "resume"])("keeps missing %s evidence missing", async kind => {
    const session = await record(sessionFixture());
    if (kind === "model-id") session.model.id = null;
    if (kind === "harness-identity") { session.harness.sourceCommit = null; session.harness.artifactSha256 = null; }
    if (kind === "actions") session.measurements.actionsToFirstUsefulResult = null;
    if (kind === "setup-failures") Object.assign(session.measurements, { setupFailures: null });
    if (kind === "refusals") Object.assign(session.measurements, { refusals: null });
    if (kind === "recording") Object.assign(session, { recording: null });
    if (kind === "resume") session.measurements.interruption.resumedAt = null;
    const result = await intakeStudy(studyFixture([session]), { evidenceRoot });
    expect(result.records[0].status).toBe("missing-evidence");
    expect(result.comparative.status).toBe("insufficient-evidence");
    expect(result.records[0].declaredOutcome).toBe("completed");
  });

  it.each(["failed", "incomplete"])("retains a declared %s first task without zero-valued result metrics", async outcome => {
    const session = noUsefulResult(await record(sessionFixture()), outcome);
    const result = await intakeStudy(studyFixture([session]), { evidenceRoot });
    expect(result.records[0].status).toBe("human-declared");
    expect(result.records[0].measurements).toMatchObject({ outcome, firstUsefulResultAt: null,
      actionsToFirstUsefulResult: null, noResultReasonRecorded: true });
    session.measurements.actionsToFirstUsefulResult = 0;
    expect(validateSession(session).some((error: { code: string }) => error.code === "result-conflict")).toBe(true);
  });

  it("retains missing recording references and rejects forged or empty recording bytes", async () => {
    const session = sessionFixture();
    let result = await intakeStudy(studyFixture([session]), { evidenceRoot });
    expect(result.records[0].status).toBe("missing-evidence");
    expect(result.records[0].recording).toEqual(session.recording);
    await writeFile(join(evidenceRoot, session.recording.path), "forged private contents");
    result = await intakeStudy(studyFixture([session]), { evidenceRoot });
    expect(result.records[0].status).toBe("invalid");
    expect(codes(result)).toContain("recording-hash-mismatch");
    expect(JSON.stringify(result)).not.toContain("forged private contents");
    await writeFile(join(evidenceRoot, session.recording.path), "");
    session.recording.sha256 = hash("");
    result = await intakeStudy(studyFixture([session]), { evidenceRoot });
    expect(codes(result)).toContain("recording-empty");
    expect(result.records[0].status).toBe("missing-evidence");
  });

  it.each(["../outside.txt", "folder/../../outside.txt", "./file.txt", "folder//file.txt", "/etc/passwd", "C:\\private.txt", "C:private.txt", "file:///private.txt", "https://example.invalid/video", "folder\\file.txt", "file\u0000.txt"])("rejects unsafe path spelling %s", async path => {
    expect(isRecordingPath(path)).toBe(false);
    const session = sessionFixture(); session.recording.path = path;
    const result = await intakeStudy(studyFixture([session]), { evidenceRoot });
    expect(result.records[0].status).toBe("invalid");
    expect(result.records[0].recordingCheck.status).toBe("not-checked");
  });

  it("rejects escaping file symlinks, directory symlinks and in-root symlinks", async () => {
    const session = sessionFixture();
    const outside = join(root, "outside"); await mkdir(outside);
    await writeFile(join(outside, "recording.txt"), privateBytes(session.sessionId));
    await symlink(join(outside, "recording.txt"), join(evidenceRoot, "file-link.txt"));
    await symlink(outside, join(evidenceRoot, "directory-link"), "dir");
    await record(session);
    await symlink(join(evidenceRoot, session.recording.path), join(evidenceRoot, "inside-link.txt"));
    for (const path of ["file-link.txt", "directory-link/recording.txt", "inside-link.txt"]) {
      session.recording.path = path;
      const result = await intakeStudy(studyFixture([session]), { evidenceRoot });
      expect(result.records[0].status).toBe("invalid");
      expect(codes(result)).toContain("recording-symlink");
    }
  });

  it("rejects directories and hard-linked recordings", async () => {
    const session = await record(sessionFixture());
    await link(join(evidenceRoot, session.recording.path), join(root, "hard-link.txt"));
    let result = await intakeStudy(studyFixture([session]), { evidenceRoot });
    expect(codes(result)).toContain("recording-hardlink");
    await mkdir(join(evidenceRoot, "not-a-recording")); session.recording.path = "not-a-recording";
    result = await intakeStudy(studyFixture([session]), { evidenceRoot });
    expect(codes(result)).toContain("recording-type");
  });

  it.each(["session", "participant", "recording"])("rejects every side of a duplicate %s, rather than selecting a winner", async kind => {
    const a = await record(sessionFixture("amc-a"));
    const b = await record(sessionFixture("amc-b"));
    if (kind === "session") b.sessionId = a.sessionId;
    if (kind === "participant") b.participantId = a.participantId;
    if (kind === "recording") b.recording = { ...a.recording };
    const result = await intakeStudy(studyFixture([a, b]), { evidenceRoot });
    expect(result.records.map((row: { status: string }) => row.status)).toEqual(["invalid", "invalid"]);
    expect(result.comparative.status).toBe("insufficient-evidence");
  });

  it("aggregates only matched sufficient declarations and retains failed/unknown observations", async () => {
    const study = await cohort();
    const failed = noUsefulResult(study.sessions[0]!);
    failed.measurements.assistanceCount = null;
    failed.measurements.setupFailures.push({ at: stamp(0), code: "setup-failed", detail: "Synthetic setup failure." });
    failed.measurements.refusals.push({ at: stamp(0), code: "policy-refusal", namedFix: null });
    failed.measurements.interruption = { at: stamp(2), resumedAt: null, resumeOutcome: "failed", reason: "Synthetic resume failure." };
    failed.measurements.secondTask = { outcome: "not-observed", at: null, reason: "Synthetic observation ended." };
    const result = await intakeStudy(study, { evidenceRoot });
    expect(result.comparative.status).toBe("matched-declared-cohorts");
    expect(result.comparative.ranking).toBeNull();
    expect(result.comparative.superiorityClaim).toBeNull();
    const amc = result.comparative.cohorts[0].summaries.amc;
    expect(amc.humanDeclaredSessions).toBe(MIN_HUMAN_SESSIONS_PER_HARNESS);
    expect(amc.outcomes).toEqual({ completed: 4, failed: 1, incomplete: 0 });
    expect(amc.usefulResultOnly.withoutUsefulResult).toBe(1);
    expect(amc.usefulResultOnly.actions.observedSamples).toBe(4);
    expect(amc.observationWindowMs.observedSamples).toBe(5);
    expect(amc.assistance.unknown).toBe(1);
    expect(amc.refusals).toEqual({ total: 1, namedFix: 0, didNotNameFix: 0, unknown: 1 });
    expect(amc.resume.failed).toBe(1);
    expect(amc.secondTask["not-observed"]).toBe(1);
  });

  it("keeps all-failed cohorts descriptive without manufacturing zero action/time medians", async () => {
    const study = await cohort(); study.sessions.forEach(session => noUsefulResult(session));
    const result = await intakeStudy(study, { evidenceRoot });
    expect(result.comparative.status).toBe("matched-declared-cohorts");
    const summary = result.comparative.cohorts[0].summaries.amc;
    expect(summary.outcomes.failed).toBe(5);
    expect(summary.usefulResultOnly.actions).toEqual({ observedSamples: 0, values: [], median: null });
    expect(summary.usefulResultOnly.elapsedMs.median).toBeNull();
  });

  it.each([[4, 4, 4], [6, 5, 5], [5, 5, 0]])("withholds summaries for cohort sizes %s/%s/%s", async (amc, dsh, pi) => {
    const result = await intakeStudy(await cohort([amc, dsh, pi]), { evidenceRoot });
    expect(result.comparative.status).toBe("insufficient-evidence");
    expect(result.comparative.cohorts.every((row: { summaries: unknown }) => row.summaries === null)).toBe(true);
  });

  it.each(["machine", "protocol", "task", "model", "credentials", "artifact", "install"])("does not blend unmatched %s evidence", async field => {
    const study = await cohort();
    for (const session of study.sessions.filter(s => s.harness.name === "pi")) {
      if (field === "machine") session.environment.machineClass = "different-machine";
      if (field === "protocol") session.protocol.version = "2";
      if (field === "task") session.protocol.taskSha256 = hash("different task");
      if (field === "model") session.model.settingsSha256 = hash("different settings");
      if (field === "credentials") session.model.credentialState = "configured";
      if (field === "install") session.environment.installState = "preinstalled";
    }
    if (field === "artifact") study.sessions[0]!.harness.artifactSha256 = hash("different artifact");
    const result = await intakeStudy(study, { evidenceRoot });
    expect(result.comparative.status).toBe("insufficient-evidence");
    expect(result.comparative.cohorts.every((row: { summaries: unknown }) => row.summaries === null)).toBe(true);
  });

  it("matches equivalent field orderings and allows counterbalanced participants across harnesses", async () => {
    const study = await cohort();
    for (const [index, session] of study.sessions.entries()) {
      session.participantId = `p-counterbalanced-${index % 5}`;
      if (index % 2) session.protocol = Object.fromEntries(Object.entries(session.protocol).reverse()) as Session["protocol"];
    }
    const result = await intakeStudy(study, { evidenceRoot });
    expect(result.comparative.status).toBe("matched-declared-cohorts");
    expect(result.comparative.cohorts).toHaveLength(1);
  });

  it("blocks cherry-picked aggregates when a further human record lacks evidence", async () => {
    const study = await cohort();
    study.sessions.push(noUsefulResult(sessionFixture("amc-missing")));
    const result = await intakeStudy(study, { evidenceRoot });
    expect(result.records.at(-1).declaredOutcome).toBe("failed");
    expect(result.records.at(-1).status).toBe("missing-evidence");
    expect(result.comparative.status).toBe("insufficient-evidence");
    expect(result.comparative.cohorts[0].summaries).toBeNull();
  });
});

describe("local JSON CLI and exclusive report output", () => {
  it("rejects duplicate JSON keys, including escaped human/automation label aliases", () => {
    expect(() => parseStudyJson('{"participation":"automated-fixture","participation":"human-declared"}')).toThrow(/Duplicate JSON/);
    expect(() => parseStudyJson(String.raw`{"a":1,"\u0061":2}`)).toThrow(/Duplicate JSON/);
    expect(() => parseStudyJson('{"sessions":[{"id":1,"id":2}]}')).toThrow(/Duplicate JSON/);
    const ordinary = { sessions: [{ id: "one", statement: 'comma, {braces}, "quotes"' }, { id: "two" }] };
    expect(parseStudyJson(JSON.stringify(ordinary))).toEqual(ordinary);
  });

  it("writes a versioned, source-digested insufficient report rather than reporting a study pass", async () => {
    const input = join(root, "study.json"), output = join(root, "intake.json");
    const text = JSON.stringify(studyFixture([await record(sessionFixture())]));
    await writeFile(input, text);
    const { captured, io } = captureIo();
    const code = await runCli(["--input", input, "--evidence-root", evidenceRoot, "--out", output], io);
    expect(code).toBe(2);
    const report = JSON.parse(await readFile(output, "utf8"));
    expect(report.inputSha256).toBe(hash(text));
    expect(report.toolSha256).toBe(hash(await readFile(fileURLToPath(new URL("../scripts/human-first-use-intake.mjs", import.meta.url)))));
    expect(report.comparative.status).toBe("insufficient-evidence");
    expect(captured.stderr).toBe("");
    expect(JSON.parse(captured.stdout)).toMatchObject({ reportWritten: true, comparativeStatus: "insufficient-evidence" });
    if (process.platform !== "win32") expect((await stat(output)).mode & 0o777).toBe(0o600);
  });

  it("writes invalid-record reports while returning a non-success intake code", async () => {
    const input = join(root, "study.json"), output = join(root, "invalid.json");
    await writeFile(input, JSON.stringify({ schemaVersion: SCHEMA_VERSION, studyId: "synthetic", sessions: [null, 7] }));
    const { io } = captureIo();
    expect(await runCli(["--input", input, "--evidence-root", evidenceRoot, "--out", output], io)).toBe(2);
    const report = JSON.parse(await readFile(output, "utf8"));
    expect(report.records).toHaveLength(2);
    expect(report.intakeStatus).toBe("invalid");
  });

  it("never overwrites an existing report, including through a symlink or a racing writer", async () => {
    const output = join(root, "existing.json");
    await writeIntakeReport(output, { marker: "retained" });
    const before = await readFile(output);
    await expect(writeIntakeReport(output, { marker: "replacement" })).rejects.toMatchObject({ code: "output-exists" });
    expect(await readFile(output)).toEqual(before);
    const alias = join(root, "alias.json"); await symlink(output, alias);
    await expect(writeIntakeReport(alias, {})).rejects.toMatchObject({ code: "output-exists" });
    expect((await lstat(alias)).isSymbolicLink()).toBe(true);
    expect(await readFile(output)).toEqual(before);
    const raced = join(root, "raced.json");
    const results = await Promise.allSettled([writeIntakeReport(raced, { writer: 1 }), writeIntakeReport(raced, { writer: 2 })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect([1, 2]).toContain(JSON.parse(await readFile(raced, "utf8")).writer);
  });

  it("refuses dangling output symlinks rather than creating their targets", async () => {
    const target = join(root, "absent.json"), alias = join(root, "dangling.json");
    await symlink(target, alias);
    await expect(writeIntakeReport(alias, {})).rejects.toMatchObject({ code: "output-exists" });
    await expect(stat(target)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("enforces no-overwrite through the actual CLI function", async () => {
    const input = join(root, "study.json"), output = join(root, "already.json");
    await writeFile(input, JSON.stringify(studyFixture([await record(sessionFixture())])));
    await writeFile(output, "retained original");
    const { captured, io } = captureIo();
    expect(await runCli(["--input", input, "--evidence-root", evidenceRoot, "--out", output], io)).toBe(1);
    expect(JSON.parse(captured.stderr).error).toBe("output-exists");
    expect(await readFile(output, "utf8")).toBe("retained original");
  });

  it.each(["malformed", "duplicate-key", "invalid-utf8"])("rejects %s input without echoing its contents", async kind => {
    const input = join(root, "private.json"), output = join(root, "never-created.json");
    const text = kind === "malformed" ? '{"PRIVATE_JSON_CANARY":' : '{"PRIVATE_JSON_CANARY":1,"PRIVATE_JSON_CANARY":2}';
    await writeFile(input, kind === "invalid-utf8" ? Buffer.from([0xff, 0xfe]) : text);
    const { captured, io } = captureIo();
    expect(await runCli(["--input", input, "--evidence-root", evidenceRoot, "--out", output], io)).toBe(1);
    expect(captured.stderr).not.toContain("PRIVATE_JSON_CANARY");
    expect(captured.stdout).toBe("");
    await expect(stat(output)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("requires the explicit evidence root and rejects repeated or missing flags", async () => {
    await expect(intakeStudy(studyFixture([]))).rejects.toMatchObject({ code: "evidence-root-required" });
    const { io } = captureIo();
    expect(await runCli(["--input", "study.json", "--out", "new.json"], io)).toBe(1);
    expect(await runCli(["--input", "one", "--input", "two", "--out", "new"], io)).toBe(1);
    expect(await runCli(["--input"], io)).toBe(1);
  });
});
