// P0-31 (AMC-1541): archive negatives through the built Studio native task service.
// The operator home sits OUTSIDE the governed workspace, as in an installation: a
// home inside it puts the control checkpoint root inside the workspace, and every
// session open is then refused (see qualification/2026-10-11-P0-31/follow-ups.md).
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { openLedger } from "../src/ledger/ledger.js";
import { NativeTaskDescriptors } from "../src/studio/nativeTaskDescriptors.js";
import type { NativeTaskActor, NativeTaskService, NativeTaskView } from "../src/studio/nativeTaskTypes.js";

let createService: typeof import("../src/studio/nativeTaskService.js").createNativeTaskService;
beforeAll(async () => {
  const file = resolve("dist/studio/nativeTaskService.js");
  if (!existsSync(file)) throw new Error("Build the candidate before native Studio process tests.");
  createService = (await import(pathToFileURL(file).href) as typeof import("../src/studio/nativeTaskService.js")).createNativeTaskService;
});

const pass = "synthetic-archive-negatives-vault";
const actor: NativeTaskActor = { principalId: "studio-test:owner", agentId: "default", demo: true };
let root = "", home = "", prior: string | undefined;
const services: NativeTaskService[] = [];
beforeEach(() => {
  prior = process.env.AMC_VAULT_PASSPHRASE; process.env.AMC_VAULT_PASSPHRASE = pass;
  root = mkdtempSync(join(tmpdir(), "amc-archive-negatives-"));
  home = mkdtempSync(join(tmpdir(), "amc-archive-negatives-home-")); mkdirSync(join(home, ".amc"), { mode: 0o700 });
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
});
afterEach(async () => {
  const outcomes = await Promise.allSettled(services.splice(0).map(service => service.close()));
  lockVault(root); rmSync(root, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true });
  if (prior === undefined) delete process.env.AMC_VAULT_PASSPHRASE; else process.env.AMC_VAULT_PASSPHRASE = prior;
  expect(outcomes.filter(outcome => outcome.status === "rejected")).toEqual([]);
});

function service(): NativeTaskService {
  const value = createService({ workspace: root, credentialsHome: home, credentialsFile: join(home, ".credentials.yaml"),
    environment: { HOME: home, PATH: process.env.PATH, AMC_VAULT_PASSPHRASE: pass } });
  services.push(value); return value;
}
const start = (s: NativeTaskService, prompt: string) =>
  s.start(actor, { agentId: "default", clientRequestId: randomUUID(), provider: "stub", tools: "none", prompt, maxSteps: 2, maxTokens: 64 });
async function idle(s: NativeTaskService, id: string): Promise<NativeTaskView> {
  const deadline = Date.now() + 25_000;
  for (;;) {
    const current = s.poll(actor, id).task;
    if (current.state === "idle" || current.state === "failed") { expect(current.error).toBeNull(); expect(current.state).toBe("idle"); return current; }
    if (Date.now() >= deadline) throw new Error("Native Studio task did not settle before the fixture deadline.");
    await new Promise(done => setTimeout(done, 50));
  }
}
const descriptorBytes = (taskId: string) => readFileSync(join(new NativeTaskDescriptors(root).directory, `${taskId}.json`));
function rows(sessionId: string | null) {
  const ledger = openLedger(root, { readonly: true });
  try { return ledger.getAllEvents().filter(row => row.session_id === sessionId); } finally { ledger.close(); }
}

test("archiving a task owned by another agent or principal is refused as not found and changes nothing", async () => {
  const s = service();
  const task = await idle(s, (await start(s, "Foreign archive negative.")).taskId);
  const before = descriptorBytes(task.taskId);
  for (const foreign of [{ ...actor, agentId: "other-agent" }, { ...actor, principalId: "studio-test:other-owner" }]) {
    expect(() => s.archive(foreign, task.taskId, task.revision)).toThrow(expect.objectContaining({ code: "NATIVE_TASK_NOT_FOUND", statusCode: 404 }));
  }
  expect(descriptorBytes(task.taskId)).toEqual(before);
  expect(s.poll(actor, task.taskId).task.archived).toBe(false);
}, 60_000);

test("archiving an open task is refused with 409 while its runtime is live and after release", async () => {
  const s = service();
  const task = await idle(s, (await start(s, "Open archive negative.")).taskId);
  const before = descriptorBytes(task.taskId);
  expect(() => s.archive(actor, task.taskId, task.revision)).toThrow(expect.objectContaining({ code: "NATIVE_ARCHIVE_BUSY", statusCode: 409 }));
  const released = await s.release(actor, task.taskId, task.revision);
  // Released is not closed: the authenticated session is still open, so a fresh observer refuses too.
  expect(() => service().archive(actor, task.taskId, released.revision)).toThrow(expect.objectContaining({ code: "NATIVE_ARCHIVE_NOT_CLOSED", statusCode: 409 }));
  expect(descriptorBytes(task.taskId)).toEqual(before);
}, 60_000);

test("a turn sent to an archived task is refused with 409 TASK_ARCHIVED and records nothing", async () => {
  const s = service();
  let task = await idle(s, (await start(s, "Archived turn negative.")).taskId);
  task = await s.verify(actor, task.taskId, task.revision);
  expect(task.state).toBe("closed");
  expect(s.archive(actor, task.taskId, task.revision).archived).toBe(true);
  const recorded = rows(task.sessionId), archived = descriptorBytes(task.taskId);
  await expect(s.turn(actor, task.taskId, { clientRequestId: randomUUID(), expectedRevision: task.revision, prompt: "Turn after archival." }))
    .rejects.toMatchObject({ code: "NATIVE_TASK_ARCHIVED", statusCode: 409 });
  expect(rows(task.sessionId)).toEqual(recorded);
  expect(descriptorBytes(task.taskId)).toEqual(archived);
}, 60_000);
