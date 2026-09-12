import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMMON_PROTOCOL, COMMON_TASK, SCHEMA_VERSION, CREDENTIAL_SCHEMA_VERSION,
  CREDENTIAL_CONTRACT_VERSION, validateSession, validateStudy, parseStudyJson, intakeStudy
} from "../scripts/human-first-use-intake.mjs";
import {
  CAPTURE_VERSION, CREDENTIAL_CAPTURE_VERSION, CaptureError, intakeSchemaForCapture,
  prepareDraft, projectSession, applyRevision, migratePreparationDraft, createCapture,
  appendCapture, loadCapture, migrateCapture, captureStatus, finalizeCapture, runCli as captureCli
} from "../scripts/human-first-use-capture.mjs";
import { runCli as observerCli, sessionView } from "../scripts/human-first-use-observer.mjs";

// AUTHORING ONLY: this file was not executed when authored. ALL identities, pins,
// affirmative human flags, model-use declarations, times and recording bytes are
// SYNTHETIC. No provider, harness, human, shell or external recording is invoked.
// The controlled migration interleaving uses real disposable journal bytes, not
// mocked loadCapture results or fabricated digests. It is not a race-safety proof.
const race = vi.hoisted(() => ({
  store: null as string | null, listings: 0, fired: false,
  beforeSecondListing: null as (() => Promise<void>) | null
}));
vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return { ...actual, opendir: async (...args: Parameters<typeof actual.opendir>) => {
    if (String(args[0]) === race.store) {
      race.listings += 1;
      if (race.listings === 2 && race.beforeSecondListing) {
        const action = race.beforeSecondListing;
        race.beforeSecondListing = null; race.store = null; race.fired = true;
        await action();
      }
    }
    return actual.opendir(...args);
  } };
});

type Event = { type: string; at: string; timing: string; data: Record<string, unknown> };
type Actor = "participant" | "operator" | "observation-only" | "unknown";
type StateName = "configured" | "not-required" | "missing" | "unknown";
type Question = { id: string; label: string; choices?: string[] };
type Step = [string, string | null | ((question: Question) => string | null)];
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const stamp = (seconds: number) => new Date(Date.UTC(2026, 8, 1, 10) + seconds * 1000).toISOString();
const bytesFor = (id: string) => `SYNTHETIC ONLY ${id}; PRIVATE_RECORDING_CANARY; no person participated.\n`;
const event = (type: string, seconds: number, data: Record<string, unknown> = {}): Event =>
  ({ type, at: stamp(seconds), timing: "explicit-observed", data });
const change = (from: StateName, to: StateName, actor: Actor = "participant", seconds = 3) =>
  event("credential-change", seconds, { from, to, actor });
const use = (credentialState: StateName = "configured", seconds = 4) =>
  event("model-use", seconds, { credentialState });
const codes = (errors: Array<{ code: string }>) => errors.map(error => error.code);
function refusal(action: () => unknown, code: string) {
  assert.throws(action, error => error instanceof CaptureError && error.code === code);
}

function planned(id = "amc-synthetic", state: StateName = "missing", harness = "amc") {
  return { sessionId: id, participation: "automated-fixture", participantId: `p-${id}`, observerId: "o-synthetic",
    harness: { name: harness, version: "synthetic-version", sourceCommit: "a".repeat(40), artifactSha256: null as string | null },
    environment: { machineClass: "synthetic-machine", os: "darwin", osVersion: "synthetic-os", arch: "arm64", nodeVersion: "22.0.0", installState: "clean" },
    model: { kind: "local-provider", provider: "synthetic-provider" as string | null, id: "synthetic-model" as string | null,
      revision: "synthetic-revision" as string | null, settingsSha256: hash("synthetic settings") as string | null, credentialState: state } };
}
function preparation(plans = [planned()]) {
  return { studyId: "synthetic-credential-study", preparedAt: stamp(0),
    operator: { id: "o-synthetic", statement: "Synthetic preparation only; no observations." },
    protocol: { ...COMMON_PROTOCOL }, task: COMMON_TASK,
    observationWindowRule: "Synthetic full window covers task, recovery and voluntary-return dispositions.",
    assistancePolicy: "Synthetic rule: record operator changes once as assistance; unknown stays null.", plannedSessions: plans };
}
function closeData(id = "amc-synthetic", used = true, version = CREDENTIAL_CAPTURE_VERSION) {
  return { completeness: { actions: true, assistance: true, setupFailures: true, refusals: true,
      ...(version === CREDENTIAL_CAPTURE_VERSION ? { credentials: true } : {}) }, modelUsed: used,
    observer: { humanPresent: false, independent: false, consentRecorded: false, firstUse: false,
      statement: "SYNTHETIC DECLARATION; PRIVATE_NARRATIVE_CANARY; no human participated.", recordedAt: stamp(10) },
    recordingPath: `${id}.txt` as string | null, windowRuleSatisfied: true, windowRuleDeviation: null as string | null };
}
function sequence(plan = planned(), options: { version?: string; outcome?: string; used?: boolean; actor?: Actor } = {}): Event[] {
  const { version = CREDENTIAL_CAPTURE_VERSION, outcome = "completed", used = outcome === "completed", actor = "participant" } = options;
  const events = [event("start", 1), event("submitted-action", 2, { description: "Synthetic intentionally submitted setup/task operation" }),
    event("setup-failure", 2, { code: "synthetic-setup", detail: "Synthetic obstacle retained even after repair" }),
    event("refusal", 2, { code: "synthetic-refusal", namedFix: null })];
  if (version === CREDENTIAL_CAPTURE_VERSION && used) {
    if (["missing", "unknown"].includes(plan.model.credentialState)) events.push(change(plan.model.credentialState, "configured", actor));
    events.push(use(plan.model.credentialState === "not-required" ? "not-required" : "configured"));
  }
  events.push(outcome === "completed" ? event("useful-result", 5, { judgement: "Synthetic useful-answer judgement, not a real answer" })
    : event("first-task-ended", 5, { outcome, reason: "Synthetic first attempt did not obtain a useful result" }),
  event("interruption", 6, { reason: "Synthetic separate recovery exercise" }),
  event("resume", 7, { outcome: "succeeded", reason: null }),
  event("second-task", 8, { outcome: "not-observed", reason: "Synthetic unobserved voluntary return" }),
  event("close", 9, closeData(plan.sessionId, used, version)));
  return events;
}
const closeOf = (events: Event[]) => events.at(-1)!.data as ReturnType<typeof closeData>;
const replay = (plan = planned(), events = sequence(plan), version = CREDENTIAL_CAPTURE_VERSION) =>
  projectSession(plan, events, stamp(0), version);
function sessionFixture(plan = planned(), events = sequence(plan), version = CREDENTIAL_CAPTURE_VERSION) {
  const projection = replay(plan, events, version);
  assert(projection.model && projection.measurements && projection.observer, "Synthetic closed record must have explicit projected fields");
  return { sessionId: plan.sessionId, participation: plan.participation, participantId: plan.participantId,
    observer: projection.observer, harness: plan.harness, environment: plan.environment, protocol: { ...COMMON_PROTOCOL },
    model: projection.model, measurements: projection.measurements,
    recording: { path: `${plan.sessionId}.txt`, sha256: hash(bytesFor(plan.sessionId)) } };
}
type Session = ReturnType<typeof sessionFixture>;
const study = (sessions: Session[], schemaVersion = CREDENTIAL_SCHEMA_VERSION) =>
  ({ schemaVersion, studyId: "synthetic-credential-study", sessions });
const validate = (row: Session) => validateSession(row, "session", CREDENTIAL_SCHEMA_VERSION);
function revision(state: ReturnType<typeof applyRevision> | null, kind: string, payload: unknown,
  version = state?.draft.captureVersion ?? CREDENTIAL_CAPTURE_VERSION) {
  const record = { captureVersion: version, revision: state ? state.revision + 1 : 0,
    previousSha256: state?.headSha256 ?? null, savedAt: stamp(100), kind, payload };
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`);
  return applyRevision(state, record, hash(bytes), bytes.length);
}
const origin = (version = CREDENTIAL_CAPTURE_VERSION, plans = [planned()]) =>
  revision(null, "prepare", prepareDraft(preparation(plans), version), version);
const declaration = () => ({ declaredAt: stamp(2), reason: "Synthetic opt-in before observation", startingStatesUnchanged: true });

let root: string, store: string, evidence: string;
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "amc-credential-contract-test-")));
  store = join(root, "journal"); evidence = join(root, "evidence"); await mkdir(evidence);
  Object.assign(race, { store: null, listings: 0, fired: false, beforeSecondListing: null });
});
afterEach(async () => {
  race.store = null; race.beforeSecondListing = null;
  if (root) await rm(root, { recursive: true, force: true });
});
async function persist(plans = [planned()], sequences = plans.map(plan => sequence(plan)), version = CREDENTIAL_CAPTURE_VERSION) {
  let state = await createCapture(preparation(plans), store, stamp(100), version);
  for (const [index, events] of sequences.entries()) for (const observation of events) {
    state = await appendCapture(store, state.headSha256, "event", { sessionId: plans[index]!.sessionId, event: observation }, stamp(100));
  }
  return state;
}
async function snapshot(path = store) {
  const entries = [];
  for (const name of (await readdir(path)).sort()) entries.push({ name, bytes: await readFile(join(path, name)) });
  return entries;
}
async function recording(plan = planned()) { await writeFile(join(evidence, `${plan.sessionId}.txt`), bytesFor(plan.sessionId)); }
function cliIo() {
  const captured = { stdout: "", stderr: "" };
  return { captured, io: { stdout: { write: (text: string) => { captured.stdout += text; } },
    stderr: { write: (text: string) => { captured.stderr += text; } } } };
}
function promptScript(steps: Step[]) {
  const remaining = [...steps], captured = { output: "", error: "", mismatches: [] as string[] };
  return { captured, io: { output: (text: string) => { captured.output += text; },
    error: (text: string) => { captured.error += text; }, now: () => stamp(100),
    prompt: async (question: Question) => {
      const next = remaining.shift();
      if (!next || next[0] !== question.id) {
        captured.mismatches.push(`Expected ${next?.[0] ?? "no prompt"}; received ${question.id}`);
        throw new Error("Unexpected synthetic prompt");
      }
      return typeof next[1] === "function" ? next[1](question) : next[1];
    } }, drained() { expect(captured.mismatches).toEqual([]); expect(remaining).toEqual([]); } };
}

describe("credential contract: immutable preparation and version isolation", () => {
  it("keeps the legacy default and explicitly selects a separately versioned cloned preparation", () => {
    const input = preparation(), before = structuredClone(input);
    const legacy = prepareDraft(input), next = prepareDraft(input, CREDENTIAL_CAPTURE_VERSION);
    expect(CAPTURE_VERSION).toBe("2026-09-09.1"); expect(SCHEMA_VERSION).toBe("2026-09-09");
    expect(CREDENTIAL_CAPTURE_VERSION).toBe("2026-09-10.1"); expect(CREDENTIAL_CONTRACT_VERSION).toBe("1");
    expect(legacy.captureVersion).toBe(CAPTURE_VERSION); expect(legacy).not.toHaveProperty("migration");
    expect(next.migration).toBeNull(); expect(next.plannedSessions).toEqual(input.plannedSessions);
    expect(next.plannedSessions[0].model).not.toHaveProperty("used");
    next.plannedSessions[0].model.credentialState = "configured";
    expect(input).toEqual(before); expect(legacy.plannedSessions[0].model.credentialState).toBe("missing");
    expect(intakeSchemaForCapture(CAPTURE_VERSION)).toBe(SCHEMA_VERSION);
    expect(intakeSchemaForCapture(CREDENTIAL_CAPTURE_VERSION)).toBe(CREDENTIAL_SCHEMA_VERSION);
    refusal(() => prepareDraft(input, "future-version"), "version");
  });

  it.each([change("missing", "configured"), use()])("rejects the opt-in event $type in legacy replay", observation => {
    refusal(() => replay(planned(), [event("start", 1), observation], CAPTURE_VERSION), "version");
  });

  it.each([[CAPTURE_VERSION, CREDENTIAL_CAPTURE_VERSION], [CREDENTIAL_CAPTURE_VERSION, CAPTURE_VERSION]])(
    "refuses revision version %s -> %s without changing the original state", (from, to) => {
      const state = origin(from), before = structuredClone(state);
      refusal(() => revision(state, "event", { sessionId: "amc-synthetic", event: event("start", 1) }, to), "version");
      expect(state).toEqual(before);
      refusal(() => revision(null, "prepare", prepareDraft(preparation(), from), to), "version");
    });

  it("does not admit mixed intake shapes or unknown credential/study versions", () => {
    const plan = planned("legacy-synthetic", "configured");
    const legacy = sessionFixture(plan, sequence(plan, { version: CAPTURE_VERSION }), CAPTURE_VERSION);
    const next = sessionFixture();
    expect(validateSession(legacy)).toEqual([]); expect(validate(next)).toEqual([]);
    expect(codes(validateSession(next))).toContain("unknown-field");
    expect(codes(validate(legacy))).toContain("required");
    for (const schemaVersion of [SCHEMA_VERSION, CREDENTIAL_SCHEMA_VERSION]) {
      const result = validateStudy(study([legacy, next], schemaVersion));
      expect(result.records.some((row: { errors: unknown[] }) => row.errors.length > 0)).toBe(true);
    }
    next.model.credentials.version = "2";
    expect(codes(validate(next))).toContain("enum");
    expect(codes(validateStudy(study([next], "future-schema")).errors)).toContain("enum");
  });

  it("cannot replace the frozen roster or baseline through another preparation or correction field", () => {
    const state = origin(), before = structuredClone(state), input = preparation();
    input.plannedSessions[0]!.model.credentialState = "configured";
    refusal(() => revision(state, "prepare", prepareDraft(input, CREDENTIAL_CAPTURE_VERSION)), "roster-frozen");
    refusal(() => revision(state, "correction", { sessionId: "amc-synthetic", declaredAt: stamp(20),
      reason: "Synthetic forbidden baseline rewrite", events: [], plannedSessions: input.plannedSessions }), "schema");
    refusal(() => revision(state, "event", { sessionId: "unplanned", event: event("start", 1) }), "unplanned-session");
    expect(state).toEqual(before);
  });
});

describe("credential observations: chronology, actual use and assistance", () => {
  it("retains missing starting state, observed repair and actual-use state without mutating input", () => {
    const plan = planned(), events = sequence(plan), before = structuredClone({ plan, events });
    const result = replay(plan, events);
    expect(result.status).toBe("closed"); expect(result.blockers).toEqual([]);
    expect(result.model).toMatchObject({ credentialState: "missing", used: true, credentials: {
      version: "1", startingState: "missing", coverageComplete: true, observations: [change("missing", "configured"), use()] } });
    expect(result.measurements).toMatchObject({ assistanceCount: 0, actionsToFirstUsefulResult: 1,
      setupFailures: [{ at: stamp(2), code: "synthetic-setup", detail: "Synthetic obstacle retained even after repair" }],
      refusals: [{ at: stamp(2), code: "synthetic-refusal", namedFix: null }] });
    expect({ plan, events }).toEqual(before);
    expect(validate(sessionFixture(plan, events))).toEqual([]);
  });

  const replayRefusals: Array<[string, Event[], string]> = [
    ["before start", [change("missing", "configured")], "start-required"],
    ["wrong from state", [event("start", 1), change("unknown", "configured")], "credential-transition-conflict"],
    ["no state change", [event("start", 1), change("missing", "missing")], "credential-transition-conflict"],
    ["disguised configuration actor", [event("start", 1), change("missing", "configured", "observation-only")], "credential-discovery-conflict"],
    ["use before configuration", [event("start", 1), use()], "credential-use-conflict"],
    ["missing actual-use state", [event("start", 1), use("missing")], "schema"],
    ["unknown actual-use state", [event("start", 1), use("unknown")], "schema"],
    ["decreasing event time", [event("start", 1), change("missing", "configured", "participant", 4), use("configured", 3)], "event-order"],
    ["same-time use before repair", [event("start", 1), use("configured", 3), change("missing", "configured")], "credential-use-conflict"],
    ["result before use", [event("start", 1), change("missing", "configured"), event("useful-result", 4, { judgement: "Synthetic premature result" })], "credential-result-order"]
  ];
  it.each(replayRefusals)("refuses %s in capture", (_label, events, code) => {
    refusal(() => replay(planned(), events), code);
  });

  it("uses recorded array order for equal-time repair/use, not a sorted or final-state shortcut", () => {
    const plan = planned(), events = sequence(plan);
    events.find(item => item.type === "model-use")!.at = stamp(3);
    expect(replay(plan, events).status).toBe("closed");
    const row = sessionFixture(plan, events);
    expect(validate(row)).toEqual([]);
    row.model.credentials.observations.reverse();
    expect(codes(validate(row))).toContain("credential-use-conflict");
  });

  it("allows later loss of credentials without rewriting an earlier supported use, but rejects a new unsupported use", () => {
    const plan = planned(), events = sequence(plan), index = events.findIndex(item => item.type === "useful-result");
    events.splice(index, 0, change("configured", "missing", "participant", 4));
    expect(replay(plan, events).status).toBe("closed"); expect(validate(sessionFixture(plan, events))).toEqual([]);
    events.splice(index + 1, 0, use("configured", 4));
    refusal(() => replay(plan, events), "credential-use-conflict");
  });

  it.each(["participant", "operator", "unknown", "observation-only"] as Actor[])(
    "keeps the assistance meaning of an unknown-to-configured observation by %s", actor => {
      const plan = planned("unknown-start", "unknown"), events = sequence(plan, { actor });
      const result = replay(plan, events);
      expect(result.status).toBe("closed");
      expect(result.model.credentialState).toBe("unknown");
      expect(result.measurements?.assistanceCount).toBe(actor === "unknown" ? null : actor === "operator" ? 1 : 0);
      expect(validate(sessionFixture(plan, events))).toEqual([]);
    });

  it("counts an operator change once, adds distinct assistance, and preserves explicitly incomplete assistance", () => {
    const plan = planned(), events = sequence(plan, { actor: "operator" });
    events.splice(2, 0, event("assistance", 2, { detail: "Synthetic separate explanation, not the credential change" }));
    expect(replay(plan, events).measurements?.assistanceCount).toBe(2);
    closeOf(events).completeness.assistance = false;
    expect(replay(plan, events).measurements?.assistanceCount).toBeNull();
    expect(validate(sessionFixture(plan, events))).toEqual([]);
  });

  it("retains incomplete credential coverage as an export blocker, not a fabricated empty timeline", () => {
    const plan = planned(), events = sequence(plan); closeOf(events).completeness.credentials = false;
    const result = replay(plan, events);
    expect(result.status).toBe("closed-blocked"); expect(codes(result.blockers)).toContain("credential-coverage-missing");
    expect(result.model.credentials.observations).toEqual([change("missing", "configured"), use()]);
    expect(result.model.credentials.coverageComplete).toBe(false);
  });

  it.each(["failed", "incomplete"])("keeps a %s task with no use and missing credentials as a valid declaration", outcome => {
    const plan = planned(), events = sequence(plan, { outcome, used: false });
    const result = replay(plan, events);
    expect(result.status).toBe("closed"); expect(result.model).toMatchObject({ used: false, credentialState: "missing", credentials: { observations: [] } });
    expect(result.measurements).toMatchObject({ outcome, firstUsefulResultAt: null, actionsToFirstUsefulResult: null,
      interruption: { resumeOutcome: "succeeded" }, secondTask: { outcome: "not-observed" } });
    expect(validate(sessionFixture(plan, events))).toEqual([]);
  });

  it("does not require model success for a supported actual-use observation", () => {
    const plan = planned(), events = sequence(plan, { outcome: "failed", used: true });
    expect(replay(plan, events).status).toBe("closed");
    expect(replay(plan, events).model.used).toBe(true); expect(validate(sessionFixture(plan, events))).toEqual([]);
  });

  it("supports declared not-required model use but never converts a keyless demo into model evidence", () => {
    const local = planned("local-synthetic", "not-required");
    expect(validate(sessionFixture(local))).toEqual([]);
    const demo = planned("demo-synthetic", "not-required");
    Object.assign(demo.model, { kind: "keyless-demo", provider: null, id: null, revision: null, settingsSha256: null });
    const events = sequence(demo, { outcome: "incomplete", used: false });
    expect(validate(sessionFixture(demo, events))).toEqual([]);
    refusal(() => replay(demo, [event("start", 1), change("not-required", "configured")]), "demo-model");
    refusal(() => replay(demo, [event("start", 1), use("not-required")]), "credential-use-conflict");
  });

  const intakeRefusals: Array<[string, (row: Session) => void, string]> = [
    ["rewritten starting state", row => { row.model.credentials.startingState = "configured"; }, "credential-start-conflict"],
    ["wrong transition origin", row => { row.model.credentials.observations[0].data.from = "unknown"; }, "credential-transition-conflict"],
    ["use before later repair", row => { row.model.credentials.observations.reverse(); }, "credential-use-conflict"],
    ["unknown use state", row => { row.model.credentials.observations[1].data.credentialState = "unknown"; }, "enum"],
    ["declared use without observation", row => { row.model.credentials.observations = []; }, "credential-use-missing"],
    ["use denied at close", row => { row.model.used = false; }, "credential-use-conflict"],
    ["only use after useful result", row => { row.model.credentials.observations[1].at = stamp(6); }, "credential-result-order"],
    ["change before measurement window", row => { row.model.credentials.observations[0].at = stamp(0); }, "credential-time-order"],
    ["use after measurement window", row => { row.model.credentials.observations[1].at = stamp(11); }, "credential-time-order"],
    ["non-scalar timestamp", row => { row.model.credentials.observations[0].at = { toString: "not-callable" }; }, "timestamp"],
    ["unknown coverage", row => { row.model.credentials.coverageComplete = false; }, "credential-coverage-missing"],
    ["unknown actor asserted as zero", row => { row.model.credentials.observations[0].data.actor = "unknown"; }, "credential-assistance-unknown"],
    ["operator assistance erased", row => { row.model.credentials.observations[0].data.actor = "operator"; }, "credential-assistance-conflict"],
    ["observation-only disguises configuration", row => { row.model.credentials.observations[0].data.actor = "observation-only"; }, "credential-discovery-conflict"]
  ];
  it.each(intakeRefusals)("refuses %s independently at direct intake", (_label, mutate, code) => {
    const row = sessionFixture(); expect(validate(row)).toEqual([]);
    mutate(row); expect(codes(validate(row))).toContain(code);
  });

  it("rejects secret-shaped extra credential fields without echoing their names or values", async () => {
    const row = sessionFixture(); await recording();
    Object.assign(row.model.credentials, { PRIVATE_SECRET_KEY_CANARY: "PRIVATE_SECRET_VALUE_CANARY" });
    Object.assign(row.model.credentials.observations[0].data, { credentialValue: "PRIVATE_SECRET_VALUE_CANARY" });
    const result = await intakeStudy(study([row]), { evidenceRoot: evidence, generatedAt: stamp(100) });
    expect(result.intakeStatus).toBe("invalid"); expect(result.records[0].model).toBeNull();
    expect(codes(result.records[0].errors)).toContain("unknown-field");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_SECRET_KEY_CANARY");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_SECRET_VALUE_CANARY");
    const observation = change("missing", "configured"); Object.assign(observation.data, { token: "PRIVATE_SECRET_VALUE_CANARY" });
    refusal(() => replay(planned(), [event("start", 1), observation]), "schema");
  });

  it("refuses duplicate version members instead of choosing the last credential contract", () => {
    expect(() => parseStudyJson('{"credentials":{"version":"1","version":"2"}}')).toThrow(/Duplicate JSON/);
    expect(() => parseStudyJson(String.raw`{"credentials":{"version":"1","\u0076ersion":"2"}}`)).toThrow(/Duplicate JSON/);
  });
});

describe("preparation-only migration and preserved revision bytes", () => {
  it("forks a reviewed preparation into a new journal with unchanged roster, baseline and source-head provenance", async () => {
    const plans = [planned(), planned("pi-synthetic", "unknown", "pi")], input = preparation(plans);
    const initial = await createCapture(input, store, stamp(100)), before = await snapshot();
    const out = join(root, "migrated"), declared = declaration();
    const migrated = await migrateCapture(store, initial.headSha256, out, declared, stamp(100));
    const loaded = await loadCapture(out);
    expect(loaded.headSha256).toBe(migrated.headSha256); expect(loaded.revision).toBe(0);
    expect(loaded.draft.plannedSessions).toEqual(plans); expect(loaded.draft.preparedAt).toBe(input.preparedAt);
    expect(loaded.draft.migration).toEqual({ fromVersion: CAPTURE_VERSION, sourceHeadSha256: initial.headSha256, ...declared });
    expect(loaded.draft.captureVersion).toBe(CREDENTIAL_CAPTURE_VERSION);
    expect(captureStatus(loaded).sessions.map((row: { status: string }) => row.status)).toEqual(["unobserved", "unobserved"]);
    expect(await snapshot()).toEqual(before); expect((await loadCapture(store)).headSha256).toBe(initial.headSha256);
    expect(await readdir(out)).toEqual(["r-00000.json"]);
    const draftCopy = migratePreparationDraft(await loadCapture(store), initial.headSha256, declared);
    draftCopy.plannedSessions[0].model.credentialState = "configured";
    expect((await loadCapture(store)).draft.plannedSessions).toEqual(plans);
  });

  it.each(["observed", "corrected-empty"])("refuses a %s legacy journal without discarding prior bytes", async kind => {
    let state = await createCapture(preparation(), store, stamp(100));
    state = await appendCapture(store, state.headSha256, "event", { sessionId: "amc-synthetic", event: event("start", 1) }, stamp(100));
    if (kind === "corrected-empty") state = await appendCapture(store, state.headSha256, "correction", {
      sessionId: "amc-synthetic", declaredAt: stamp(12), reason: "Synthetic empty effective sequence; original start stays retained", events: []
    }, stamp(100));
    const before = await snapshot(), out = join(root, "refused-migration");
    await expect(migrateCapture(store, state.headSha256, out, declaration(), stamp(100))).rejects.toMatchObject({ code: "migration-observed" });
    expect(await snapshot()).toEqual(before); await expect(stat(out)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses stale heads, unsupported migration sources and altered/retroactive declarations", () => {
    const initial = origin(CAPTURE_VERSION), before = structuredClone(initial);
    refusal(() => migratePreparationDraft(initial, "0".repeat(64), declaration()), "revision-conflict");
    const versioned = origin();
    refusal(() => migratePreparationDraft(versioned, versioned.headSha256, declaration()), "migration-version");
    refusal(() => migratePreparationDraft(initial, initial.headSha256, { ...declaration(), startingStatesUnchanged: false }), "migration-baseline");
    refusal(() => migratePreparationDraft(initial, initial.headSha256, { ...declaration(), declaredAt: stamp(-1) }), "migration-order");
    refusal(() => migratePreparationDraft(initial, initial.headSha256, { ...declaration(), reason: "" }), "schema");
    refusal(() => migratePreparationDraft(initial, initial.headSha256, { ...declaration(), replacementRoster: [] }), "schema");
    expect(initial).toEqual(before);
  });

  it("refuses a reviewed source head that advances between migration reads", async () => {
    const initial = await createCapture(preparation(), store, stamp(100)), original = await readFile(join(store, "r-00000.json"));
    const out = join(root, "moving-head");
    race.store = store;
    race.beforeSecondListing = async () => {
      await appendCapture(store, initial.headSha256, "event", { sessionId: "amc-synthetic", event: event("start", 1) }, stamp(100));
    };
    await expect(migrateCapture(store, initial.headSha256, out, declaration(), stamp(100))).rejects.toMatchObject({ code: "revision-conflict" });
    expect(race.fired).toBe(true); expect(race.listings).toBe(2);
    expect(await readFile(join(store, "r-00000.json"))).toEqual(original);
    expect((await loadCapture(store)).sessions.get("amc-synthetic")).toEqual([event("start", 1)]);
    await expect(stat(out)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses overlapping and existing destinations, retaining both source and prior output", async () => {
    const initial = await createCapture(preparation(), store, stamp(100)), before = await snapshot();
    for (const out of [store, join(store, "child"), root]) {
      await expect(migrateCapture(store, initial.headSha256, out, declaration(), stamp(100))).rejects.toMatchObject({ code: "output-overlap" });
    }
    const out = join(root, "existing"); await mkdir(out); await writeFile(join(out, "keep.txt"), "SYNTHETIC RETAINED OUTPUT");
    await expect(migrateCapture(store, initial.headSha256, out, declaration(), stamp(100))).rejects.toMatchObject({ code: "output-exists-or-unavailable" });
    expect(await readFile(join(out, "keep.txt"), "utf8")).toBe("SYNTHETIC RETAINED OUTPUT"); expect(await snapshot()).toEqual(before);
  });

  it("admits observations only at or after migration declaration, preserving original preregistration", async () => {
    const initial = await createCapture(preparation(), store, stamp(100)), out = join(root, "migrated");
    const next = await migrateCapture(store, initial.headSha256, out, declaration(), stamp(100));
    const before = await snapshot(out);
    await expect(appendCapture(out, next.headSha256, "event", { sessionId: "amc-synthetic", event: event("start", 1) }, stamp(100))).rejects.toMatchObject({ code: "event-order" });
    expect(await snapshot(out)).toEqual(before);
    const saved = await appendCapture(out, next.headSha256, "event", { sessionId: "amc-synthetic", event: event("start", 2) }, stamp(100));
    expect(saved.draft.preparedAt).toBe(stamp(0)); expect(saved.draft.migration.declaredAt).toBe(stamp(2));
    expect(sessionView(await loadCapture(out), "amc-synthetic").lastAt).toBe(stamp(2));
  });

  it("retains prior credential revisions when an explicit correction marks coverage incomplete", async () => {
    const plan = planned(), events = sequence(plan), state = await persist([plan], [events]), before = await snapshot();
    closeOf(events).completeness.credentials = false;
    const next = await appendCapture(store, state.headSha256, "correction", {
      sessionId: plan.sessionId, declaredAt: stamp(20), reason: "Synthetic coverage correction, not baseline repair", events
    }, stamp(100));
    const loaded = await loadCapture(store), after = await snapshot();
    expect(after.slice(0, before.length)).toEqual(before); expect(loaded.draft.plannedSessions).toEqual([plan]);
    expect(captureStatus(loaded).sessions[0]).toMatchObject({ status: "closed-blocked", correctionRevisions: [next.revision] });
    expect(codes(captureStatus(loaded).sessions[0].blockers)).toContain("credential-coverage-missing");
  });
});

describe("versioned full-roster export and descriptive starting strata", () => {
  it("withholds study.json for a mixture of ready, failed, incomplete, missing, open and credential-blocked entries", async () => {
    const plans = [planned("ready"), planned("failed"), planned("incomplete"), planned("missing"), planned("open"), planned("coverage-gap")];
    const partial = sequence(plans[5]!); closeOf(partial).completeness.credentials = false;
    const sequences = [sequence(plans[0]!), sequence(plans[1]!, { outcome: "failed" }),
      sequence(plans[2]!, { outcome: "incomplete" }), [], [event("start", 1)], partial];
    const state = await persist(plans, sequences), before = await snapshot();
    for (const plan of plans) await recording(plan);
    const out = join(root, "blocked-export"), report = await finalizeCapture(store, state.headSha256, evidence, out, stamp(100));
    expect(report.exportStatus).toBe("blocked"); expect(report.studyWritten).toBe(false); expect(report.studySha256).toBeNull();
    expect(report.sessions.map((row: { sessionId: string }) => row.sessionId)).toEqual(plans.map(plan => plan.sessionId));
    expect(report.failedFirstTaskSessionIds).toEqual(["failed"]); expect(report.incompleteFirstTaskSessionIds).toEqual(["incomplete"]);
    expect(report.unobservedPlannedSessionIds).toEqual(["missing"]); expect(report.unclosedSessionIds).toEqual(["open"]);
    expect(report.sessions[0].status).toBe("ready"); expect(report.sessions[5].observationGaps).toContain("credentials");
    expect(codes(report.sessions[5].blockers)).toContain("credential-coverage-missing");
    await expect(stat(join(out, "study.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await snapshot(join(out, "journal"))).toEqual(before); expect(await snapshot()).toEqual(before);
    expect(JSON.parse(await readFile(join(out, "report.json"), "utf8")).studyWritten).toBe(false);
    expect(JSON.stringify(report)).not.toContain("PRIVATE_RECORDING_CANARY");
  });

  it("exports all admissible failures and assistance unknowns in the new schema without claiming a human cohort", async () => {
    const plans = [planned("completed"), planned("failed"), planned("incomplete")];
    const sequences = [sequence(plans[0]!, { actor: "unknown" }), sequence(plans[1]!, { outcome: "failed" }), sequence(plans[2]!, { outcome: "incomplete" })];
    const state = await persist(plans, sequences); for (const plan of plans) await recording(plan);
    const out = join(root, "complete-export"), report = await finalizeCapture(store, state.headSha256, evidence, out, stamp(100));
    const bytes = await readFile(join(out, "study.json")), exported = JSON.parse(bytes.toString("utf8"));
    expect(report.exportStatus).toBe("complete-roster-export"); expect(report.studySha256).toBe(hash(bytes));
    expect(exported.schemaVersion).toBe(CREDENTIAL_SCHEMA_VERSION);
    expect(exported.sessions.map((row: { sessionId: string }) => row.sessionId)).toEqual(plans.map(plan => plan.sessionId));
    expect(exported.sessions[0].model.credentialState).toBe("missing"); expect(exported.sessions[0].measurements.assistanceCount).toBeNull();
    expect(exported.sessions[1].measurements).toMatchObject({ outcome: "failed", firstUsefulResultAt: null, actionsToFirstUsefulResult: null });
    expect(exported.sessions[2].measurements.outcome).toBe("incomplete");
    expect(exported.sessions[0].recording.sha256).toBe(hash(bytesFor("completed")));
    const intake = await intakeStudy(exported, { evidenceRoot: evidence, generatedAt: stamp(100) });
    expect(intake.intakeStatus).toBe("valid-records");
    expect(intake.comparative).toMatchObject({ status: "insufficient-evidence", humanParticipationAuthenticated: false, ranking: null, superiorityClaim: null });
    expect(intake.comparative.excludedAutomatedRecords).toBe(plans.length);
    expect(JSON.stringify(intake)).not.toContain("PRIVATE_NARRATIVE_CANARY");
  });

  it("preserves legacy successful export and the legacy missing-start model-use blocker", async () => {
    const plan = planned("legacy-ready", "configured"), events = sequence(plan, { version: CAPTURE_VERSION });
    const state = await persist([plan], [events], CAPTURE_VERSION); await recording(plan);
    const out = join(root, "legacy-export"); await finalizeCapture(store, state.headSha256, evidence, out, stamp(100));
    const exported = JSON.parse(await readFile(join(out, "study.json"), "utf8"));
    expect(exported.schemaVersion).toBe(SCHEMA_VERSION); expect(exported.sessions[0].model).not.toHaveProperty("credentials");
    const missing = planned("legacy-blocked");
    const blocked = replay(missing, sequence(missing, { version: CAPTURE_VERSION }), CAPTURE_VERSION);
    expect(blocked.status).toBe("closed-blocked"); expect(codes(blocked.blockers)).toContain("model-credentials");
  });

  it("blocks duplicate recording bytes and refuses overwriting a prior blocked export", async () => {
    const plans = [planned("one"), planned("two")], state = await persist(plans);
    for (const plan of plans) await writeFile(join(evidence, `${plan.sessionId}.txt`), "SYNTHETIC IDENTICAL BYTES");
    const out = join(root, "duplicate-export"), report = await finalizeCapture(store, state.headSha256, evidence, out, stamp(100));
    expect(report.exportStatus).toBe("blocked");
    expect(report.sessions.every((row: { blockers: Array<{ code: string }> }) => codes(row.blockers).includes("duplicate-recording"))).toBe(true);
    const before = await readFile(join(out, "report.json"));
    await expect(finalizeCapture(store, state.headSha256, evidence, out, stamp(100))).rejects.toMatchObject({ code: "output-exists-or-unavailable" });
    expect(await readFile(join(out, "report.json"))).toEqual(before);
    await expect(stat(join(out, "study.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps starting strata and contract versions separate, including unknown starts after repair", async () => {
    // Affirmative human-declared records below are fabricated TEST INPUT only,
    // solely to reach cohort projection. They are never written as real evidence.
    const plans = [planned("missing-start"), planned("configured-start", "configured"), planned("unknown-start", "unknown")];
    const rows = plans.map(plan => {
      const row = sessionFixture(plan);
      row.participation = "human-declared";
      Object.assign(row.observer, { humanPresent: true, independent: true, consentRecorded: true, firstUse: true });
      return row;
    });
    for (const plan of plans) await recording(plan);
    const result = await intakeStudy(study(rows), { evidenceRoot: evidence, generatedAt: stamp(100) });
    expect(result.intakeStatus).toBe("valid-records"); expect(result.comparative.cohorts).toHaveLength(plans.length);
    expect(new Set(result.comparative.cohorts.map((cohort: { model: { credentialState: string } }) => cohort.model.credentialState)))
      .toEqual(new Set(["missing", "configured", "unknown"]));
    const unknown = result.comparative.cohorts.find((cohort: { model: { credentialState: string } }) => cohort.model.credentialState === "unknown");
    assert(unknown); expect(unknown.reasons).toContain("unknown-starting-state"); expect(unknown.summaries).toBeNull();
    const modern = await intakeStudy(study([rows[1]!]), { evidenceRoot: evidence, generatedAt: stamp(100) });
    const legacyRow = structuredClone(rows[1]!); delete legacyRow.model.credentials;
    const legacy = await intakeStudy(study([legacyRow], SCHEMA_VERSION), { evidenceRoot: evidence, generatedAt: stamp(100) });
    expect(legacy.intakeStatus).toBe("valid-records");
    expect(legacy.comparative.cohorts[0].cohortId).not.toBe(modern.comparative.cohorts[0].cohortId);
    expect(modern.comparative.cohorts[0].model).toHaveProperty("credentialContractVersion", "1");
    expect(legacy.comparative.cohorts[0].model).not.toHaveProperty("credentialContractVersion");
    expect(result.comparative.humanParticipationAuthenticated).toBe(false);
  });
});

describe("public capture and guided-observer credential surfaces (synthetic only)", () => {
  it("wires explicit CLI opt-in and reviewed migration without changing default preparation", async () => {
    const input = join(root, "preparation.json"); await writeFile(input, JSON.stringify(preparation()));
    const legacyIo = cliIo();
    expect(await captureCli(["prepare", "--input", input, "--store", store], legacyIo.io)).toBe(0);
    const initial = await loadCapture(store); expect(initial.draft.captureVersion).toBe(CAPTURE_VERSION);
    const selected = join(root, "selected"), selectedIo = cliIo();
    expect(await captureCli(["prepare", "--input", input, "--store", selected, "--capture-version", CREDENTIAL_CAPTURE_VERSION], selectedIo.io)).toBe(0);
    expect((await loadCapture(selected)).draft.captureVersion).toBe(CREDENTIAL_CAPTURE_VERSION);
    const declarationPath = join(root, "migration.json"); await writeFile(declarationPath, JSON.stringify(declaration()));
    const migrated = join(root, "cli-migrated"), migratedIo = cliIo();
    expect(await captureCli(["migrate", "--store", store, "--expect", initial.headSha256, "--input", declarationPath, "--out", migrated], migratedIo.io)).toBe(0);
    expect((await loadCapture(migrated)).draft.migration.sourceHeadSha256).toBe(initial.headSha256);
    const blocked = cliIo(), out = join(root, "cli-blocked");
    expect(await captureCli(["export", "--store", migrated, "--expect", (await loadCapture(migrated)).headSha256,
      "--evidence-root", evidence, "--out", out], blocked.io)).toBe(2);
    expect(JSON.parse(blocked.captured.stdout)).toMatchObject({ exportStatus: "blocked", studyWritten: false });
    const invalid = cliIo();
    expect(await captureCli(["prepare", "--input", input, "--store", join(root, "bad-version"), "--capture-version", "future"], invalid.io)).toBe(1);
    expect(JSON.parse(invalid.captured.stderr).error).toBe("version");
    await expect(stat(join(root, "bad-version"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([CAPTURE_VERSION, CREDENTIAL_CAPTURE_VERSION])("keeps guided preparation review explicit for %s", async version => {
    const input = join(root, "preparation.json"); await writeFile(input, JSON.stringify(preparation()));
    const before = await readFile(input), script = promptScript([["prepare.review", "create"]]);
    const flags = version === CAPTURE_VERSION ? [] : ["--capture-version", version];
    expect(await observerCli(["prepare", "--store", store, "--input", input, ...flags], script.io)).toBe(0); script.drained();
    const loaded = await loadCapture(store); expect(loaded.draft.captureVersion).toBe(version);
    expect(loaded.sessions.get("amc-synthetic")).toEqual([]); expect(await readFile(input)).toEqual(before);
  });

  it("offers credential observations only in the opt-in menu and gates useful result on actual-use observation", async () => {
    const legacy = origin(CAPTURE_VERSION), modern = origin();
    const startedLegacy = revision(legacy, "event", { sessionId: "amc-synthetic", event: event("start", 1) });
    const startedModern = revision(modern, "event", { sessionId: "amc-synthetic", event: event("start", 1) });
    expect(sessionView(startedLegacy, "amc-synthetic").next).not.toContain("credential-change");
    expect(sessionView(startedLegacy, "amc-synthetic").next).not.toContain("model-use");
    expect(sessionView(startedModern, "amc-synthetic").next).toContain("credential-change");
    expect(sessionView(startedModern, "amc-synthetic").next).not.toContain("useful-result");
    const changed = revision(startedModern, "event", { sessionId: "amc-synthetic", event: change("missing", "configured") });
    expect(sessionView(changed, "amc-synthetic").next).not.toContain("useful-result");
    const used = revision(changed, "event", { sessionId: "amc-synthetic", event: use() });
    expect(sessionView(used, "amc-synthetic").next).toContain("useful-result");
  });

  it("persists separately reviewed guided change/use events, and EOF never fabricates another use", async () => {
    await persist([planned()], [[event("start", 1)]]);
    const script = promptScript([
      ["observe.next", "credential-change"], ["credential-change.from", "missing"], ["credential-change.to", "configured"],
      ["credential-change.actor", "unknown"], ["event.timing", "explicit-observed"], ["event.at", stamp(3)], ["event.review", "save"],
      ["observe.next", "model-use"], ["model-use.credentialState", "configured"],
      ["event.timing", "explicit-observed"], ["event.at", stamp(4)], ["event.review", "save"], ["observe.next", "pause"]
    ]);
    expect(await observerCli(["observe", "--store", store, "--session", "amc-synthetic"], script.io)).toBe(0); script.drained();
    const state = await loadCapture(store);
    expect(state.sessions.get("amc-synthetic")).toEqual([event("start", 1), change("missing", "configured", "unknown"), use()]);
    expect(state.draft.plannedSessions[0].model.credentialState).toBe("missing");
    const paused = promptScript([["observe.next", "model-use"], ["model-use.credentialState", null]]);
    expect(await observerCli(["observe", "--store", store, "--session", "amc-synthetic"], paused.io)).toBe(0); paused.drained();
    expect((await loadCapture(store)).headSha256).toBe(state.headSha256);
    expect(paused.captured.output).toContain("UNSAVED");
  });

  it("retains a guided unknown credential-coverage close and blocks the whole reviewed export", async () => {
    const plan = planned(), events = sequence(plan); events.pop(); await persist([plan], [events]);
    const script = promptScript([["observe.next", "close"], ["close.at", stamp(9)],
      ["close.completeness.actions", "complete"], ["close.completeness.assistance", "complete"],
      ["close.completeness.setupFailures", "complete"], ["close.completeness.refusals", "complete"],
      ["close.completeness.credentials", "unknown"], ["close.modelUsed", "yes"],
      ["close.observer.humanPresent", "no"], ["close.observer.independent", "no"],
      ["close.observer.consentRecorded", "no"], ["close.observer.firstUse", "no"],
      ["close.observer.statement", "Synthetic close only; no human participated"], ["close.observer.recordedAt", stamp(10)],
      ["close.recordingPath", "amc-synthetic.txt"], ["close.windowRuleSatisfied", "yes"], ["event.review", "save"]]);
    expect(await observerCli(["observe", "--store", store, "--session", plan.sessionId], script.io)).toBe(0); script.drained();
    const state = await loadCapture(store), view = sessionView(state, plan.sessionId);
    expect(view.projection.status).toBe("closed-blocked"); expect(view.projection.model.credentials.coverageComplete).toBe(false);
    expect(script.captured.output).toContain("UNREADY for export");
    const out = join(root, "guided-blocked"), exported = promptScript([["export.head", state.headSha256], ["export.review", "export"]]);
    expect(await observerCli(["export", "--store", store, "--evidence-root", evidence, "--out", out], exported.io)).toBe(2); exported.drained();
    await expect(stat(join(out, "study.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.parse(await readFile(join(out, "report.json"), "utf8")).sessions[0].observationGaps).toContain("credentials");
  });
});

// Recovery-only additions: amc-1512-credential-authoring-recovery-2026-09-10.
// These extend the late-present source; they are not executed evidence.
describe("credential recovery boundaries: persistent unknowns and reduced evidence", () => {
  it("does not erase an unknown actor when later operator changes and distinct help are known", () => {
    const plan = planned();
    const observations = (actor: Actor) => {
      const events = sequence(plan, { actor });
      events.splice(2, 0, event("assistance", 2, { detail: "Synthetic distinct explanation, not a credential intervention" }));
      const useIndex = events.findIndex(item => item.type === "model-use");
      events.splice(useIndex, 0, change("configured", "missing", "operator", 3), change("missing", "configured", "participant", 3));
      return events;
    };
    const known = observations("participant"), unknown = observations("unknown");
    expect(replay(plan, known).measurements?.assistanceCount).toBe(2);
    const projected = replay(plan, unknown);
    expect(projected.status).toBe("closed");
    expect(projected.model.credentialState).toBe("missing");
    expect(projected.measurements?.assistanceCount).toBeNull();
    const row = sessionFixture(plan, unknown);
    expect(validate(row)).toEqual([]);
    row.measurements.assistanceCount = 2;
    expect(codes(validate(row))).toContain("credential-assistance-unknown");
    closeOf(unknown).completeness.credentials = false;
    const blocked = replay(plan, unknown);
    expect(blocked.measurements?.assistanceCount).toBeNull();
    expect(blocked.status).toBe("closed-blocked");
    expect(codes(blocked.blockers)).toContain("credential-coverage-missing");
  });

  it("keeps same-time result ordering in capture without claiming the reduced intake can reconstruct it", () => {
    const plan = planned(), events = sequence(plan);
    const useIndex = events.findIndex(item => item.type === "model-use");
    events[useIndex]!.at = stamp(5);
    expect(events[useIndex + 1]!.type).toBe("useful-result");
    expect(replay(plan, events).status).toBe("closed");
    const reduced = sessionFixture(plan, events);
    expect(reduced.model.credentials.observations.at(-1)!.at).toBe(reduced.measurements.firstUsefulResultAt);
    expect(validate(reduced)).toEqual([]);
    const reversed = structuredClone(events);
    reversed.splice(useIndex, 2, events[useIndex + 1]!, events[useIndex]!);
    refusal(() => replay(plan, reversed), "credential-result-order");
    // The separate result event is not in model.credentials.observations.
    // The reduced row is admissible, not proof of the rejected journal's order.
    expect(validate(reduced)).toEqual([]);
  });

  it("does not infer actual use from a configured starting state or an affirmative close alone", () => {
    const plan = planned("configured-unused", "configured");
    const events = sequence(plan, { outcome: "failed", used: false });
    const projection = replay(plan, events);
    expect(projection.status).toBe("closed");
    expect(projection.model).toMatchObject({ credentialState: "configured", used: false, credentials: { observations: [] } });
    expect(validate(sessionFixture(plan, events))).toEqual([]);
    closeOf(events).modelUsed = true;
    const blocked = replay(plan, events);
    expect(blocked.status).toBe("closed-blocked");
    expect(codes(blocked.blockers)).toContain("credential-use-missing");
    refusal(() => replay(plan, [event("start", 1), event("useful-result", 2, { judgement: "Synthetic unsupported result" })]), "credential-result-order");
  });
});


// AMC-1512 terminal credential carry-forward continuation 2026-09-10.
// Authored only: these synthetic cases have not been executed or qualified.
describe("credential carry-forward: repair without use and repeated-use ordering", () => {
  it.each(["failed", "incomplete"])(
    "does not infer model use from a participant repair before a %s outcome", outcome => {
      const plan = planned(`repair-without-use-${outcome}`), before = structuredClone(plan);
      const events = sequence(plan, { outcome, used: false });
      const endIndex = events.findIndex(item => item.type === "first-task-ended");
      events.splice(endIndex, 0, change("missing", "configured", "participant", 3));
      const projection = replay(plan, events), row = sessionFixture(plan, events);
      expect(projection.status).toBe("closed");
      expect(plan).toEqual(before);
      expect(row.model.credentialState).toBe("missing");
      expect(row.model.credentials.startingState).toBe("missing");
      expect(row.model.used).toBe(false);
      expect(row.model.credentials.observations).toHaveLength(1);
      expect(row.model.credentials.observations[0]).toMatchObject({
        type: "credential-change", at: stamp(3), data: { from: "missing", to: "configured", actor: "participant" }
      });
      expect(row.measurements.firstUsefulResultAt).toBeNull();
      expect(row.measurements.assistanceCount).toBe(0);
      expect(validate(row)).toEqual([]);

      const falselyUsed = structuredClone(events);
      closeOf(falselyUsed).modelUsed = true;
      const blocked = replay(plan, falselyUsed);
      expect(blocked.status).toBe("closed-blocked");
      expect(codes(blocked.blockers)).toContain("credential-use-missing");
      const unsupportedDeclaration = structuredClone(row);
      unsupportedDeclaration.model.used = true;
      expect(codes(validate(unsupportedDeclaration))).toContain("credential-use-missing");
    }
  );

  it("requires repair before repeated use and retains earlier use after a final loss", () => {
    const plan = planned("repair-reuse-final-loss"), before = structuredClone(plan);
    const events = sequence(plan);
    const resultIndex = events.findIndex(item => item.type === "useful-result");
    events.splice(resultIndex, 0,
      change("configured", "missing", "operator", 4),
      change("missing", "configured", "participant", 4),
      use("configured", 4),
      change("configured", "missing", "participant", 4));
    const projection = replay(plan, events), row = sessionFixture(plan, events);
    expect(projection.status).toBe("closed");
    expect(plan).toEqual(before);
    expect(row.model.credentialState).toBe("missing");
    expect(row.model.credentials.startingState).toBe("missing");
    expect(row.model.used).toBe(true);
    expect(row.model.credentials.observations.filter(
      (observation: { type: string }) => observation.type === "model-use"
    )).toHaveLength(2);
    expect(row.model.credentials.observations.at(-1)).toMatchObject({
      type: "credential-change", data: { from: "configured", to: "missing", actor: "participant" }
    });
    expect(row.measurements.assistanceCount).toBe(1);
    expect(validate(row)).toEqual([]);

    // Identical timestamps do not permit a use to borrow a later repair.
    const prematureReuse = structuredClone(events);
    const repairIndex = resultIndex + 1;
    [prematureReuse[repairIndex], prematureReuse[repairIndex + 1]] =
      [prematureReuse[repairIndex + 1]!, prematureReuse[repairIndex]!];
    refusal(() => replay(plan, prematureReuse), "credential-use-conflict");
    const reducedConflict = structuredClone(row);
    const observations = reducedConflict.model.credentials.observations;
    [observations[3], observations[4]] = [observations[4]!, observations[3]!];
    expect(codes(validate(reducedConflict))).toContain("credential-use-conflict");
  });
});
