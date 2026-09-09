import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMMON_PROTOCOL, COMMON_TASK, intakeStudy } from "../scripts/human-first-use-intake.mjs";
import { createCapture, appendCapture, loadCapture } from "../scripts/human-first-use-capture.mjs";
import { runCli, sessionView, createTerminalPrompt } from "../scripts/human-first-use-observer.mjs";

// AUTHORED, NOT EXECUTED. Every pin, timestamp, declaration, person label and
// recording byte below is SYNTHETIC. These are terminal regressions, not a study.
// Storage, optimistic heads, projection and export use the real unchanged core.
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const stamp = (seconds: number) => new Date(Date.UTC(2026, 8, 1, 10) + seconds * 1000).toISOString();
const recordBytes = (id: string) => `SYNTHETIC RECORDING ${id}; PRIVATE_RECORDING_CANARY; no person participated.\n`;
type Question = { id: string; label: string; choices?: string[] };
type Answer = string | null | ((question: Question) => string | null | Promise<string | null>);
type Step = [id: string, answer: Answer];
type Event = { type: string; at: string; timing: string; data: Record<string, unknown> };
const event = (type: string, seconds: number, data: Record<string, unknown> = {}): Event => ({ type, at: stamp(seconds), timing: "explicit-observed", data });
let root: string, store: string, evidence: string;

function planFixture(id = "amc-synthetic", harness = "amc") {
  return { sessionId: id, participation: "automated-fixture", participantId: `p-${id}`, observerId: "o-synthetic",
    harness: { name: harness, version: "synthetic-version", sourceCommit: "a".repeat(40), artifactSha256: null as string | null },
    environment: { machineClass: "synthetic-machine", os: "darwin", osVersion: "synthetic-os", arch: "arm64", nodeVersion: "22.0.0", installState: "clean" },
    model: { kind: "local-provider", provider: "synthetic-provider" as string | null, id: "synthetic-model" as string | null,
      revision: "synthetic-revision" as string | null, settingsSha256: hash("synthetic settings") as string | null, credentialState: "not-required" } };
}
function preparation(plans = [planFixture()]) {
  return { studyId: "synthetic-observer-study", preparedAt: stamp(0),
    operator: { id: "o-synthetic", statement: "Synthetic preparation only; no observations." },
    protocol: { ...COMMON_PROTOCOL }, task: COMMON_TASK,
    observationWindowRule: "Synthetic window ends after first task, recovery and optional return dispositions.",
    assistancePolicy: "Synthetic policy: explicitly retain assistance and coverage gaps.", plannedSessions: plans };
}
function script(steps: Step[] = []) {
  const remaining = [...steps], captured = { output: "", error: "", questions: [] as Question[], mismatches: [] as string[] };
  const io = {
    output: (text: string) => { captured.output += text; },
    error: (text: string) => { captured.error += text; },
    now: vi.fn(() => stamp(100)),
    prompt: async (question: Question) => {
      captured.questions.push(question);
      const step = remaining.shift();
      if (!step || step[0] !== question.id) {
        captured.mismatches.push(`Expected ${step?.[0] ?? "no prompt"}, received ${question.id}`);
        throw new Error("Unexpected scripted prompt");
      }
      return typeof step[1] === "function" ? await step[1](question) : step[1];
    }
  };
  return { io, captured, drained() { expect(captured.mismatches).toEqual([]); expect(remaining).toEqual([]); } };
}
const metadataSteps = (input = preparation()): Step[] => [
  ["studyId", input.studyId], ["preparedAt", input.preparedAt], ["operator.id", input.operator.id],
  ["operator.statement", input.operator.statement], ["observationWindowRule", input.observationWindowRule], ["assistancePolicy", input.assistancePolicy]
];
function planSteps(plan = planFixture(), index = 0): Step[] {
  const p = `plannedSessions.${index}`;
  const steps: Step[] = [
    [`${p}.sessionId`, plan.sessionId], [`${p}.participation`, plan.participation], [`${p}.participantId`, plan.participantId], [`${p}.observerId`, plan.observerId],
    [`${p}.harness.name`, plan.harness.name], [`${p}.harness.version`, plan.harness.version], [`${p}.harness.pins`, plan.harness.artifactSha256 ? "both" : "source"],
    [`${p}.harness.sourceCommit`, plan.harness.sourceCommit]
  ];
  if (plan.harness.artifactSha256) steps.push([`${p}.harness.artifactSha256`, plan.harness.artifactSha256]);
  steps.push([`${p}.environment.machineClass`, plan.environment.machineClass], [`${p}.environment.os`, plan.environment.os],
    [`${p}.environment.osVersion`, plan.environment.osVersion], [`${p}.environment.arch`, plan.environment.arch],
    [`${p}.environment.nodeVersion`, plan.environment.nodeVersion], [`${p}.environment.installState`, plan.environment.installState], [`${p}.model.kind`, plan.model.kind]);
  if (plan.model.kind !== "keyless-demo") steps.push([`${p}.model.provider`, plan.model.provider], [`${p}.model.id`, plan.model.id],
    [`${p}.model.revision`, plan.model.revision], [`${p}.model.settingsSha256`, plan.model.settingsSha256], [`${p}.model.credentialState`, plan.model.credentialState]);
  return steps;
}
const eventSteps = (type: string, fields: Step[], seconds: number, confirm: Answer = "save"): Step[] => [
  ["observe.next", type], ...fields, ["event.timing", "explicit-observed"], ["event.at", stamp(seconds)], ["event.review", confirm]
];
function closeSteps(options: { id?: string; used?: boolean; gaps?: string[]; closeAt?: string; attestedAt?: string; flags?: string[]; confirm?: Answer } = {}): Step[] {
  const { id = "amc-synthetic", used = false, gaps = [], closeAt = stamp(8), attestedAt = stamp(9), flags = ["no", "no", "no", "no"], confirm = "save" } = options;
  return [["observe.next", "close"], ["close.at", closeAt],
    ...["actions", "assistance", "setupFailures", "refusals"].map(key => [`close.completeness.${key}`, gaps.includes(key) ? "unknown" : "complete"] as Step),
    ["close.modelUsed", used ? "yes" : "no"],
    ...["humanPresent", "independent", "consentRecorded", "firstUse"].map((key, index) => [`close.observer.${key}`, flags[index]!] as Step),
    ["close.observer.statement", "Synthetic observer declaration only; no human participated."], ["close.observer.recordedAt", attestedAt],
    ["close.recordingPath", `${id}.txt`], ["close.windowRuleSatisfied", "yes"], ["event.review", confirm]];
}
function beforeClose(outcome = "incomplete"): Event[] {
  return [event("start", 1), outcome === "completed"
    ? event("useful-result", 2, { judgement: "Synthetic judgement only" })
    : event("first-task-ended", 2, { outcome, reason: "Synthetic first task ended" }),
  event("recovery-decision", 3, { outcome: "not-observed", reason: "Synthetic recovery gap" }),
  event("second-task", 4, { outcome: "not-observed", reason: "Synthetic return gap" })];
}
async function persist(events: Event[] = [], plans = [planFixture()]) {
  let state = await createCapture(preparation(plans), store, stamp(100));
  for (const observation of events) state = await appendCapture(store, state.headSha256, "event", { sessionId: plans[0]!.sessionId, event: observation }, stamp(100));
  return state;
}
async function fastPrepare(plans = [planFixture()]) {
  const path = join(root, "preparation.json"); await writeFile(path, JSON.stringify(preparation(plans)));
  const s = script([["prepare.review", "create"]]);
  expect(await runCli(["prepare", "--store", store, "--input", path], s.io)).toBe(0); s.drained();
}
async function exportWith(output: string, head?: string) {
  const s = script([["export.evidence-root", evidence], ["export.out", output],
    ["export.head", head ?? (async () => (await loadCapture(store)).headSha256)], ["export.review", "export"]]);
  const code = await runCli(["export", "--store", store], s.io); s.drained(); return { code, ...s };
}
const observeArgs = (id = "amc-synthetic") => ["observe", "--store", store, "--session", id];

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "amc-guided-observer-test-")));
  store = join(root, "journal"); evidence = join(root, "evidence"); await mkdir(evidence);
});
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

describe("guided preparation and private terminal boundaries (synthetic only)", () => {
  it("walks the full roster and explicit pins into real storage without inventing presence, use or observations", async () => {
    const plans = [planFixture(), planFixture("pi-synthetic", "pi")];
    plans[0]!.harness.artifactSha256 = hash("synthetic installed artifact");
    plans[0]!.environment.installState = "unknown"; plans[0]!.model.credentialState = "unknown";
    Object.assign(plans[1]!.model, { kind: "keyless-demo", provider: null, id: null, revision: null, settingsSha256: null, credentialState: "not-required" });
    const input = preparation(plans);
    const s = script([...metadataSteps(input), ["session-count", "2"], ...plans.flatMap(planSteps), ["prepare.review", "create"]]);
    expect(await runCli(["prepare", "--store", store], s.io)).toBe(0); s.drained();
    const state = await loadCapture(store);
    expect(state.draft.plannedSessions).toEqual(plans); expect(state.revision).toBe(0);
    expect(state.sessions.get("amc-synthetic")).toEqual([]); expect(state.sessions.get("pi-synthetic")).toEqual([]);
    expect(state.draft.plannedSessions[0]).not.toHaveProperty("observer");
    expect(state.draft.plannedSessions[0].model).not.toHaveProperty("used");
    expect(s.captured.output).toContain(COMMON_TASK); expect(s.captured.output).toContain(COMMON_PROTOCOL.taskSha256);
    expect(s.captured.output).toContain("FULL PLANNED POPULATION"); expect(s.captured.output).toContain("pi-synthetic");
    expect(s.captured.output).toContain("no observations created");
  });

  it("does not interpret blank approval as create, and the reviewed file fast path still needs full-roster approval", async () => {
    const input = join(root, "reviewed.json"); await writeFile(input, JSON.stringify(preparation()));
    const before = await readFile(input);
    const s = script([["prepare.review", ""], ["prepare.review", "pause"]]);
    expect(await runCli(["prepare", "--store", store, "--input", input], s.io)).toBe(0); s.drained();
    await expect(stat(store)).rejects.toMatchObject({ code: "ENOENT" }); expect(await readFile(input)).toEqual(before);
    expect(s.captured.output).toContain("Empty is not yes"); expect(s.captured.output).toContain("UNSAVED");
  });

  it("keeps an unknown required source pin visibly unready rather than using HEAD or example pins", async () => {
    const steps = planSteps(), cutoff = steps.findIndex(([id]) => id.endsWith(".harness.pins"));
    const s = script([...metadataSteps(), ["session-count", "1"], ...steps.slice(0, cutoff), ["plannedSessions.0.harness.pins", "unknown"]]);
    expect(await runCli(["prepare", "--store", store], s.io)).toBe(2); s.drained();
    expect(s.captured.error).toContain("unready"); expect(s.captured.output).toContain("UNSAVED");
    await expect(stat(store)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("lets an operator explicitly re-enter malformed unsaved preparation metadata without modifying the source file", async () => {
    const input = join(root, "malformed-metadata.json");
    await writeFile(input, JSON.stringify({ ...preparation(), operator: "SYNTHETIC MALFORMED OPERATOR" }));
    const original = await readFile(input);
    const s = script([["prepare.review", "edit-study"], ...metadataSteps(), ["prepare.review", "create"]]);
    expect(await runCli(["prepare", "--store", store, "--input", input], s.io)).toBe(0); s.drained();
    expect((await loadCapture(store)).draft.operator).toEqual(preparation().operator);
    expect(await readFile(input)).toEqual(original);
  });

  it("uses core validation for malformed preparation and never rewrites an existing journal", async () => {
    await fastPrepare(); const before = await readFile(join(store, "r-00000.json"));
    const input = join(root, "preparation.json");
    const existing = script([["prepare.review", "create"]]);
    expect(await runCli(["prepare", "--store", store, "--input", input], existing.io)).toBe(1); existing.drained();
    expect(await readFile(join(store, "r-00000.json"))).toEqual(before);
    const invalid = preparation(); invalid.plannedSessions[0]!.harness.sourceCommit = "abbreviated";
    await writeFile(input, JSON.stringify(invalid));
    const refused = script([["prepare.review", question => { expect(question.choices).not.toContain("create"); return "pause"; }]]);
    expect(await runCli(["prepare", "--store", join(root, "invalid-new"), "--input", input], refused.io)).toBe(0); refused.drained();
    expect(refused.captured.error).toContain("schema"); await expect(stat(join(root, "invalid-new"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not leak malformed JSON excerpts and refuses unknown/duplicate/hidden-execution flags", async () => {
    const input = join(root, "private.json"); await writeFile(input, '{"PRIVATE_INPUT_CANARY":');
    const s = script();
    expect(await runCli(["prepare", "--store", store, "--input", input], s.io)).toBe(1); s.drained();
    expect(s.captured.output + s.captured.error).not.toContain("PRIVATE_INPUT_CANARY");
    for (const args of [["status", "--store", store, "--store", store], ["observe", "--store", store, "--run-harness", "true"], ["prepare", "--store"]]) {
      const refused = script(); expect(await runCli(args, refused.io)).toBe(1); refused.drained();
      expect(refused.captured.error).toContain("arguments");
    }
    const help = script(); expect(await runCli(["--help"], help.io)).toBe(0); help.drained();
    expect(help.captured.output).toContain(":pause"); expect(help.captured.output).toContain("--input");
  });
});

describe("explicit resumable observations and unknowns", () => {
  it("records a complete guided synthetic task, retaining failures/refusal unknowns and separate recovery/return", async () => {
    await fastPrepare();
    const s = script([
      ...eventSteps("start", [], 1),
      ...eventSteps("submitted-action", [["action.description", "Synthetic first submitted operation"]], 2),
      ...eventSteps("setup-failure", [["setup-failure.code", "synthetic-setup"], ["setup-failure.detail", "Synthetic setup obstacle"]], 2),
      ...eventSteps("assistance", [["assistance.detail", "Synthetic assistance observation"]], 2),
      ...eventSteps("refusal", [["refusal.code", "synthetic-policy"], ["refusal.namedFix", "unknown"]], 2),
      ...eventSteps("useful-result", [["useful-result.judgement", "Synthetic participant judgement: concrete inputs and expected outcomes"]], 3),
      ...eventSteps("submitted-action", [["action.description", "Synthetic later recovery action, not first-task action"]], 4),
      ...eventSteps("interruption", [["interruption.reason", "Synthetic interruption exercise"]], 5),
      ...eventSteps("resume", [["resume.outcome", "succeeded"], ["resume.reason", "none"]], 6),
      ...eventSteps("second-task", [["second-task.outcome", "returned"], ["second-task.reason", "none"]], 7),
      ...closeSteps({ used: true })
    ]);
    expect(await runCli(observeArgs(), s.io)).toBe(0); s.drained();
    const state = await loadCapture(store), view = sessionView(state, "amc-synthetic");
    expect(view.projection.status).toBe("closed"); expect(view.recovery).toBe("succeeded"); expect(view.secondTask).toBe("returned");
    expect(view.projection.measurements).toMatchObject({ actionsToFirstUsefulResult: 1, assistanceCount: 1, outcome: "completed" });
    expect(view.projection.measurements.setupFailures).toHaveLength(1);
    expect(view.projection.measurements.refusals[0].namedFix).toBeNull();
    expect(view.projection.observer.humanPresent).toBe(false); expect(view.plan.participation).toBe("automated-fixture");
    const menus = s.captured.questions.filter(q => q.id === "observe.next");
    expect(menus[0]!.choices).toEqual(["start", "status", "history", "pause"]);
    expect(menus[1]!.choices).not.toContain("start"); expect(menus[1]!.choices).not.toContain("resume");
    expect(menus[1]!.choices).not.toContain("close"); expect(view.next).toEqual([]);
    await writeFile(join(evidence, "amc-synthetic.txt"), recordBytes("amc-synthetic"));
    const output = join(root, "export"), exported = await exportWith(output);
    expect(exported.code).toBe(0);
    const study = JSON.parse(await readFile(join(output, "study.json"), "utf8"));
    expect(study.sessions[0].recording.sha256).toBe(hash(recordBytes("amc-synthetic")));
    const intake = await intakeStudy(study, { evidenceRoot: evidence, generatedAt: stamp(100) });
    expect(intake.intakeStatus).toBe("valid-records"); expect(intake.comparative.humanParticipationAuthenticated).toBe(false);
    expect(intake.comparative.status).toBe("insufficient-evidence");
    expect(exported.captured.output).not.toContain("PRIVATE_RECORDING_CANARY");
  });

  it.each(["failed", "incomplete"])("exports a guided %s attempt without changing it after successful recovery", async outcome => {
    await fastPrepare();
    const s = script([...eventSteps("start", [], 1),
      ...eventSteps("first-task-ended", [["first-task-ended.outcome", outcome], ["first-task-ended.reason", "Synthetic unsuccessful first attempt"]], 2),
      ...eventSteps("interruption", [["interruption.reason", "Synthetic later interruption"]], 3),
      ...eventSteps("resume", [["resume.outcome", "succeeded"], ["resume.reason", "none"]], 4),
      ...eventSteps("second-task", [["second-task.outcome", "not-observed"], ["second-task.reason", "Synthetic missing follow-up"]], 5),
      ...closeSteps({ gaps: ["assistance"] })]);
    expect(await runCli(observeArgs(), s.io)).toBe(0); s.drained();
    await writeFile(join(evidence, "amc-synthetic.txt"), recordBytes("amc-synthetic"));
    const output = join(root, "failed-export"); expect((await exportWith(output)).code).toBe(0);
    const study = JSON.parse(await readFile(join(output, "study.json"), "utf8"));
    expect(study.sessions[0].measurements).toMatchObject({ outcome, firstUsefulResultAt: null, actionsToFirstUsefulResult: null,
      assistanceCount: null, interruption: { resumeOutcome: "succeeded" }, secondTask: { outcome: "not-observed", at: null } });
  });

  it.each(["setupFailures", "refusals", "actions"])("retains unknown %s coverage and blocks an inadmissible completed export", async gap => {
    await persist(beforeClose("completed"));
    const s = script(closeSteps({ gaps: [gap], used: true }));
    expect(await runCli(observeArgs(), s.io)).toBe(0); s.drained();
    expect(s.captured.output).toContain("UNREADY for export");
    const state = await loadCapture(store), view = sessionView(state, "amc-synthetic");
    expect(view.projection.status).toBe("closed-blocked"); expect(view.projection.coverage[gap]).toBe(false);
    expect((await exportWith(join(root, "gap-export"))).code).toBe(2);
    await expect(stat(join(root, "gap-export", "study.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["close.modelUsed", "close.observer.humanPresent", "close.observer.independent", "close.observer.consentRecorded", "close.observer.firstUse", "close.windowRuleSatisfied"])("leaves unsupported unknown %s visibly unready, not false/true", async field => {
    const before = await persist(beforeClose());
    const steps = closeSteps(), index = steps.findIndex(([id]) => id === field);
    const s = script([...steps.slice(0, index), [field, "unknown"]]);
    expect(await runCli(observeArgs(), s.io)).toBe(2); s.drained();
    const after = await loadCapture(store); expect(after.headSha256).toBe(before.headSha256);
    expect(sessionView(after, "amc-synthetic").projection.status).toBe("open");
    expect(s.captured.error).toContain(field); expect(s.captured.output).toContain("UNSAVED");
  });

  it("retains explicit false human declarations without relabelling automation or admitting them as human evidence", async () => {
    const plan = planFixture(); plan.participation = "human-declared";
    await persist(beforeClose(), [plan]);
    const s = script(closeSteps()); expect(await runCli(observeArgs(), s.io)).toBe(0); s.drained();
    const state = await loadCapture(store), view = sessionView(state, plan.sessionId);
    expect(view.plan.participation).toBe("human-declared"); expect(view.projection.observer.humanPresent).toBe(false);
    expect(view.projection.status).toBe("closed-blocked");
  });

  it("uses declareRecordNow only after explicit choice and never replaces an explicit timestamp with persistence time", async () => {
    await persist();
    const s = script([["observe.next", "start"], ["event.timing", "record-now"], ["event.review", "save"], ["observe.next", "pause"]]);
    expect(await runCli(observeArgs(), s.io)).toBe(0); s.drained();
    let state = await loadCapture(store);
    expect(state.sessions.get("amc-synthetic")[0]).toMatchObject({ at: stamp(100), timing: "operator-declared-now" });
    expect(s.captured.output).toContain("labelled operator-declared-now");
    const later = script([...eventSteps("assistance", [["assistance.detail", "Synthetic explicit time"]], 110), ["observe.next", "pause"]]);
    expect(await runCli(observeArgs(), later.io)).toBe(0); later.drained();
    state = await loadCapture(store);
    expect(state.sessions.get("amc-synthetic")[1]).toMatchObject({ at: stamp(110), timing: "explicit-observed" });
    const revision = JSON.parse(await readFile(join(store, "r-00002.json"), "utf8")); expect(revision.savedAt).toBe(stamp(100));
  });

  it.each(["now", "2026-02-30T10:00:00.000Z", stamp(-1)])("refuses invalid explicit event time %s without creating an event", async at => {
    const before = await persist();
    const s = script([["observe.next", "start"], ["event.timing", "explicit-observed"], ["event.at", at],
      ["event.review", question => { expect(question.choices).not.toContain("save"); return "discard"; }], ["observe.next", "pause"]]);
    expect(await runCli(observeArgs(), s.io)).toBe(0); s.drained();
    expect((await loadCapture(store)).headSha256).toBe(before.headSha256); expect(s.captured.error).toContain("Refused");
  });

  it.each([{ closeAt: "now" }, { attestedAt: stamp(7) }])("requires explicit close and at/after-close attestation: %s", async options => {
    const before = await persist(beforeClose());
    const s = script([...closeSteps({ ...options, confirm: question => { expect(question.choices).not.toContain("save"); return "discard"; } }), ["observe.next", "pause"]]);
    expect(await runCli(observeArgs(), s.io)).toBe(0); s.drained();
    expect((await loadCapture(store)).headSha256).toBe(before.headSha256);
    expect(s.captured.questions.some(q => q.id === "event.timing")).toBe(false);
    expect(s.io.now).not.toHaveBeenCalled();
  });
});

describe("resumption, refusal, cancellation and conflicts", () => {
  it.each(["pause", "eof", "cancel"])("preserves saved history and drops no observations on %s with an unfinished candidate", async stop => {
    const before = await persist([event("start", 1)]);
    const interruption: Answer = stop === "eof" ? null : stop === "pause" ? ":pause" : () => { throw Object.assign(new Error("Synthetic cancellation"), { name: "AbortError" }); };
    const s = script([["observe.next", "submitted-action"], ["action.description", "Synthetic unsaved operation"], ["event.timing", interruption]]);
    expect(await runCli(observeArgs(), s.io)).toBe(0); s.drained();
    let state = await loadCapture(store); expect(state.headSha256).toBe(before.headSha256);
    expect(state.sessions.get("amc-synthetic")).toHaveLength(1); expect(s.captured.output).toContain("UNSAVED");
    const resume = script([...eventSteps("assistance", [["assistance.detail", "Synthetic explicitly observed after resumption"]], 2), ["observe.next", "pause"]]);
    expect(await runCli(observeArgs(), resume.io)).toBe(0); resume.drained();
    state = await loadCapture(store); expect(state.sessions.get("amc-synthetic").map((row: Event) => row.type)).toEqual(["start", "assistance"]);
    expect(sessionView(state, "amc-synthetic").projection.status).toBe("open");
  });

  it("EOF at confirmation does not save, and blank confirmation is never yes", async () => {
    const before = await persist();
    const s = script([["observe.next", "start"], ["event.timing", "explicit-observed"], ["event.at", stamp(1)], ["event.review", ""], ["event.review", null]]);
    expect(await runCli(observeArgs(), s.io)).toBe(0); s.drained();
    expect((await loadCapture(store)).headSha256).toBe(before.headSha256);
    expect(s.captured.output).toContain("Empty is not yes");
  });

  it("stops a cancelled confirmation before a write even when the answer text says save", async () => {
    const before = await persist(); let cancelled = false;
    const s = script([...eventSteps("start", [], 1, () => { cancelled = true; return "save"; })]);
    expect(await runCli(observeArgs(), { ...s.io, isCancelled: () => cancelled })).toBe(0); s.drained();
    expect((await loadCapture(store)).headSha256).toBe(before.headSha256);
  });

  it("exposes an actual competing write, shows the unsaved candidate, asks for review and never retries it", async () => {
    const initial = await persist([event("start", 1)]);
    const s = script([...eventSteps("assistance", [["assistance.detail", "UNSAVED_SYNTHETIC_CANDIDATE"]], 3, async () => {
      await appendCapture(store, initial.headSha256, "event", { sessionId: "amc-synthetic", event: event("refusal", 2, { code: "synthetic-winner", namedFix: false }) }, stamp(100));
      return "save";
    }), ["conflict.review", "review"]]);
    expect(await runCli(observeArgs(), s.io)).toBe(1); s.drained();
    const state = await loadCapture(store);
    expect(state.sessions.get("amc-synthetic").map((row: Event) => row.type)).toEqual(["start", "refusal"]);
    expect(s.captured.error).toContain("revision-conflict"); expect(s.captured.output).toContain("UNSAVED_SYNTHETIC_CANDIDATE");
    expect(s.captured.output).toContain("not be retried"); expect(s.captured.output).toContain("synthetic-winner");
  });

  it("does not reopen or overwrite a closed window, and status shows every missing planned outcome", async () => {
    await persist(beforeClose(), [planFixture(), planFixture("pi-missing", "pi")]);
    const close = script(closeSteps()); expect(await runCli(observeArgs(), close.io)).toBe(0); close.drained();
    const before = await loadCapture(store), repeat = script();
    expect(await runCli(observeArgs(), repeat.io)).toBe(0); repeat.drained();
    expect((await loadCapture(store)).headSha256).toBe(before.headSha256);
    const status = script(); expect(await runCli(["status", "--store", store], status.io)).toBe(0); status.drained();
    expect(status.captured.output).toContain("pi-missing"); expect(status.captured.output).toContain("NOT RECORDED");
    const output = join(root, "missing-roster-export"), exported = await exportWith(output);
    expect(exported.code).toBe(2); expect(exported.captured.output).toContain("NO study.json");
    const report = JSON.parse(await readFile(join(output, "report.json"), "utf8"));
    expect(report.sessions.map((row: { sessionId: string }) => row.sessionId)).toEqual(["amc-synthetic", "pi-missing"]);
    expect(report.unobservedPlannedSessionIds).toEqual(["pi-missing"]);
    await expect(stat(join(output, "study.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("requires an exact export head and preserves previous output bytes", async () => {
    await persist(); const output = join(root, "retained-export");
    expect((await exportWith(output)).code).toBe(2);
    const before = await readFile(join(output, "report.json"));
    expect((await exportWith(output)).code).toBe(1); expect(await readFile(join(output, "report.json"))).toEqual(before);
    const wrong = script([["export.head", "0".repeat(64)]]);
    expect(await runCli(["export", "--store", store, "--evidence-root", evidence, "--out", join(root, "wrong-head")], wrong.io)).toBe(1); wrong.drained();
    expect(wrong.captured.error).toContain("review-head"); await expect(stat(join(root, "wrong-head"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("stops an export whose reviewed head advances before confirmation, without substituting a new head", async () => {
    const initial = await persist(), output = join(root, "conflicted-export");
    const s = script([["export.head", initial.headSha256], ["export.review", async () => {
      await appendCapture(store, initial.headSha256, "event", { sessionId: "amc-synthetic", event: event("start", 1) }, stamp(100)); return "export";
    }], ["conflict.review", "review"]]);
    expect(await runCli(["export", "--store", store, "--evidence-root", evidence, "--out", output], s.io)).toBe(1); s.drained();
    await expect(stat(output)).rejects.toMatchObject({ code: "ENOENT" }); expect(s.captured.output).toContain("Current head");
  });

  it("prints help in a prompt without performing an operation, and renders control-bearing values as inert data", async () => {
    const initial = await persist();
    const s = script([["observe.next", ":help"], ["observe.next", "pause"]]);
    expect(await runCli(observeArgs(), s.io)).toBe(0); s.drained();
    expect(s.captured.output).toContain("Guided local observer"); expect((await loadCapture(store)).headSha256).toBe(initial.headSha256);
    const input = join(root, "controls.json"); const data = preparation(); data.operator.statement = "\u001b[2JPRIVATE_SYNTHETIC_TEXT";
    await writeFile(input, JSON.stringify(data));
    const invalid = script([["prepare.review", "pause"]]);
    expect(await runCli(["prepare", "--store", join(root, "controls"), "--input", input], invalid.io)).toBe(0); invalid.drained();
    expect(invalid.captured.output).not.toContain("\u001b"); expect(invalid.captured.output).toContain("\\u001b");
  });
});

describe("native terminal seam and import safety", () => {
  it.each(["eof", "SIGINT"])("wakes an outstanding native prompt on %s and removes the signal handler", async mode => {
    const input = new PassThrough(), output = new PassThrough(), signals = new EventEmitter();
    const prompt = createTerminalPrompt({ input, output, signals });
    try {
      const pending = prompt.prompt({ id: "native", label: "Synthetic prompt" });
      if (mode === "SIGINT") signals.emit("SIGINT"); else input.end();
      expect(await pending).toBeNull(); expect(prompt.isCancelled()).toBe(true);
      expect(await prompt.prompt({ id: "later", label: "Must not hang" })).toBeNull();
    } finally { prompt.close(); input.destroy(); output.destroy(); }
    expect(signals.listenerCount("SIGINT")).toBe(0);
  });

  it("drops extra pasted approval lines rather than applying them to a later prompt", async () => {
    const input = new PassThrough(), output = new PassThrough(), signals = new EventEmitter();
    const terminal = createTerminalPrompt({ input, output, signals });
    try {
      const first = terminal.prompt({ id: "one", label: "One" }); input.write("explicit\nsave\n");
      expect(await first).toBe("explicit");
      const next = terminal.prompt({ id: "two", label: "Two" }); input.end();
      expect(await next).toBeNull();
    } finally { terminal.close(); input.destroy(); output.destroy(); }
  });

  it("imports silently without filesystem writes and refuses piped interactive collection", async () => {
    const url = new URL("../scripts/human-first-use-observer.mjs", import.meta.url), before = await readdir(root);
    const imported = spawnSync(process.execPath, ["--input-type=module", "--eval", `await import(${JSON.stringify(url.href)});`], { cwd: root, encoding: "utf8", timeout: 10000 });
    expect(imported.status).toBe(0); expect(imported.stdout).toBe(""); expect(imported.stderr).toBe("");
    expect(await readdir(root)).toEqual(before);
    const piped = spawnSync(process.execPath, [fileURLToPath(url), "prepare", "--store", store], { cwd: root, input: "create\n", encoding: "utf8", timeout: 10000 });
    expect(piped.status).toBe(1); expect(piped.stderr).toContain("terminal-required");
    await expect(stat(store)).rejects.toMatchObject({ code: "ENOENT" });
    const source = await readFile(url, "utf8");
    expect(source).not.toMatch(/node:(?:child_process|worker_threads|https?|net)|\bfetch\s*\(|\b(?:eval|spawn|execFile)\s*\(/);
    expect(source).toContain("finalizeCapture("); expect(source).toContain("declareRecordNow(");
    expect(source).not.toContain("writeFile("); expect(source).not.toContain("createHash(");
  });
});
