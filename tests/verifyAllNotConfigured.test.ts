/**
 * `amc verify all` on optional features: a feature the workspace never configured reads NOT_CONFIGURED and does not
 * withhold the headline, while a configured feature that fails verification still fails it.
 */
import { appendFileSync, cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { verifyAll } from "../src/verify/verifyAll.js";
import { verifyAllExit } from "../src/cli-trust-flags.js";
import { passportPolicyPath, savePassportPolicy } from "../src/passport/passportStore.js";
import { capturePassportInitialization, passportInitForApi, passportPolicyApplyForApiAsync } from "../src/passport/passportApi.js";
import { passportInitCli, passportInitCliAsync } from "../src/passport/passportCli.js";
import { loadPassportPolicyAsync } from "../src/passport/passportPairPublication.js";
import { saveForecastSchedulerState, defaultForecastSchedulerState } from "../src/forecast/forecastStore.js";
import { transparencyLogPath, transparencySealPath, transparencySealSigPath } from "../src/transparency/logChain.js";
import { buildPromptPackForApi } from "../src/prompt/promptPackApi.js";
import { promptLatestPackPath } from "../src/prompt/promptPolicyStore.js";
import { promptSchedulerPath, savePromptSchedulerState } from "../src/prompt/promptPolicyStore.js";
import { defaultPromptSchedulerState } from "../src/prompt/promptPolicySchema.js";
import { openLedger } from "../src/ledger/ledger.js";
import { defaultPassportPolicy } from "../src/passport/passportPolicySchema.js";
import { openA4Store } from "../src/a4/a4Store.js";
import { workspaceKeyTrust } from "./helpers/trustContext.js";
import { cleanupGovernanceFixtures } from "./governor/governanceFixture.js";
import { A4Project, a4Workspace } from "./a4/a4Harness.js";

vi.setConfig({ testTimeout: 60_000 });

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  cleanupGovernanceFixtures();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fresh(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-verify-notconfigured-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}

const run = (workspace: string) => verifyAll({ workspace, trust: workspaceKeyTrust(workspace) });
/** Every optional part a fresh workspace has not set up, in report order. */
const FRESH_NOT_CONFIGURED = [
  "prompt-scheduler-signature", "prompt-packs", "audit-binder-exports", "passport-policy-signature", "passport-workspace-integrity",
  "standard-schema-bundle", "a4-projects", "forecast-signatures", "bench-artifacts", "backup-manifests", "release-bundles"
];
const status = (report: Awaited<ReturnType<typeof run>>, id: string) => report.checks.find((check) => check.id === id)?.status;

describe("verify all: not configured is not INCOMPLETE", () => {
  test("a fresh workspace passes and names each part it has not configured", async () => {
    const ws = fresh();
    const report = await run(ws);
    expect(report.status).toBe("PASS");
    expect(report.skippedCritical).toEqual([]);
    expect(report.notConfigured).toEqual(FRESH_NOT_CONFIGURED);
    for (const id of report.notConfigured) expect(status(report, id)).toBe("NOT_CONFIGURED");
    expect(report.checks.filter((check) => check.status === "SKIP" || check.status === "FAIL")).toEqual([]);
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => { throw new Error(`exit ${code}`); }) as never);
    verifyAllExit(report, workspaceKeyTrust(ws));
    expect(exit).not.toHaveBeenCalled();
  });

  test("a configured, valid passport policy and A4 project pass and leave the not-configured list", async () => {
    const { workspace, alice, sessionId } = a4Workspace();
    savePassportPolicy(workspace, defaultPassportPolicy());
    await A4Project.create(workspace, alice);
    // The governance fixture leaves its session open; sealing it makes the ledger itself verify.
    const ledger = openLedger(workspace);
    try { ledger.sealSession(sessionId); } finally { ledger.close(); }
    const report = await run(workspace);
    expect(report.status).toBe("PASS");
    expect(status(report, "passport-policy-signature")).toBe("PASS");
    expect(status(report, "a4-projects")).toBe("PASS");
    expect(report.notConfigured).toEqual(FRESH_NOT_CONFIGURED.filter((id) => !id.startsWith("passport-") && id !== "a4-projects"));
    expect(report.skippedCritical).toEqual([]);
  });

  test("a configured passport policy whose signature no longer verifies fails", async () => {
    const ws = fresh();
    savePassportPolicy(ws, defaultPassportPolicy());
    appendFileSync(passportPolicyPath(ws), "\n# edited after signing\n");
    const report = await run(ws);
    expect(status(report, "passport-policy-signature")).toBe("FAIL");
    expect(report.status).toBe("FAIL");
    expect(report.criticalFail).toBe(true);
  });

  test("a configured A4 project whose record was altered fails", async () => {
    const { workspace, alice } = a4Workspace();
    const p = await A4Project.create(workspace, alice);
    const store = openA4Store(workspace);
    try {
      const db = store.ledger.db;
      for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'a4_projects'").all() as Array<{ name: string }>) {
        db.exec(`DROP TRIGGER "${name}"`);
      }
      expect(db.prepare("UPDATE a4_projects SET agent_id = 'another-agent' WHERE project_id = ?").run(p.projectId).changes).toBe(1);
    } finally {
      store.close();
    }
    const report = await run(workspace);
    expect(status(report, "a4-projects")).toBe("FAIL");
    expect(report.status).toBe("FAIL");
  });

  test("a passport policy deleted after signing fails: the surviving signature proves it was configured", async () => {
    const ws = fresh();
    savePassportPolicy(ws, defaultPassportPolicy());
    rmSync(passportPolicyPath(ws));
    const report = await run(ws);
    expect(status(report, "passport-policy-signature")).toBe("FAIL");
    expect(report.notConfigured).not.toContain("passport-policy-signature");
    expect(report.status).toBe("FAIL");
  });

  test("a prompt scheduler state file without its signature fails, and so does a signature without its state file", async () => {
    const ws = fresh();
    savePromptSchedulerState(ws, defaultPromptSchedulerState());
    expect(status(await run(ws), "prompt-scheduler-signature")).toBe("PASS");
    rmSync(`${promptSchedulerPath(ws)}.sig`);
    expect(status(await run(ws), "prompt-scheduler-signature")).toBe("FAIL");
    savePromptSchedulerState(ws, defaultPromptSchedulerState());
    rmSync(promptSchedulerPath(ws));
    expect(status(await run(ws), "prompt-scheduler-signature")).toBe("FAIL");
  });

  test.each([
    ["synchronously", (ws: string) => { savePassportPolicy(ws, defaultPassportPolicy()); }],
    ["through the async policy apply", async (ws: string) => { await passportPolicyApplyForApiAsync({ workspace: ws, policy: defaultPassportPolicy() }); }]
  ])("a passport policy saved %s and then deleted with its signature fails: the transparency log witnesses it", async (_how, save) => {
    const ws = fresh();
    await save(ws);
    rmSync(passportPolicyPath(ws));
    rmSync(`${passportPolicyPath(ws)}.sig`);
    const report = await run(ws);
    expect(status(report, "passport-policy-signature")).toBe("FAIL");
    expect(report.criticalFail).toBe(true);
    expect(report.status).toBe("FAIL");
    expect(report.notConfigured).not.toContain("passport-policy-signature");
  });

  test("a prompt scheduler state deleted with its signature fails: the transparency log witnesses it", async () => {
    const ws = fresh();
    savePromptSchedulerState(ws, defaultPromptSchedulerState());
    rmSync(promptSchedulerPath(ws));
    rmSync(`${promptSchedulerPath(ws)}.sig`);
    const report = await run(ws);
    expect(status(report, "prompt-scheduler-signature")).toBe("FAIL");
    expect(report.status).toBe("FAIL");
  });

  test("a prompt pack the transparency log records as built fails when its directory is deleted", async () => {
    const ws = fresh();
    buildPromptPackForApi({ workspace: ws, agentId: "default" });
    expect(status(await run(ws), "prompt-packs")).toBe("PASS");
    rmSync(dirname(promptLatestPackPath(ws, "default")), { recursive: true, force: true });
    const report = await run(ws);
    expect(status(report, "prompt-packs")).toBe("FAIL");
    expect(report.status).toBe("FAIL");
  });

  test.each([
    ["amc passport init", async (ws: string) => { await passportInitCliAsync(ws); }],
    ["the sync passport init", (ws: string) => { passportInitCli(ws); }],
    ["the API init", (ws: string) => { passportInitForApi(ws); }],
    ["the Studio startup init", async (ws: string) => { await capturePassportInitialization(ws).initialize(); }]
  ])("a passport policy created by %s and then deleted with its signature fails", async (_how, init) => {
    const ws = fresh();
    await init(ws);
    rmSync(passportPolicyPath(ws));
    rmSync(`${passportPolicyPath(ws)}.sig`);
    const report = await run(ws);
    expect(status(report, "passport-policy-signature")).toBe("FAIL");
    expect(report.status).toBe("FAIL");
  });

  test("a default policy an async reader creates is not witnessed until an explicit init witnesses it", async () => {
    const ws = fresh(), remove = () => { for (const file of [passportPolicyPath(ws), `${passportPolicyPath(ws)}.sig`]) rmSync(file); };
    await loadPassportPolicyAsync(ws);
    remove();
    expect(status(await run(ws), "passport-policy-signature")).toBe("NOT_CONFIGURED");
    await loadPassportPolicyAsync(ws);
    passportInitCli(ws);
    remove();
    expect(status(await run(ws), "passport-policy-signature")).toBe("FAIL");
  });

  test("a forecast scheduler state deleted with its signature fails", async () => {
    const ws = fresh();
    const saved = saveForecastSchedulerState(ws, defaultForecastSchedulerState());
    expect(status(await run(ws), "forecast-signatures")).toBe("PASS");
    rmSync(saved.path);
    rmSync(saved.sigPath);
    const report = await run(ws);
    expect(status(report, "forecast-signatures")).toBe("FAIL");
    expect(report.status).toBe("FAIL");
  });

  test.each([
    ["saved synchronously", (ws: string) => { savePassportPolicy(ws, defaultPassportPolicy()); }],
    ["applied asynchronously", async (ws: string) => { await passportPolicyApplyForApiAsync({ workspace: ws, policy: defaultPassportPolicy() }); }]
  ])("a transparency log restored to a copy taken before a policy was %s fails: the ledger witness disagrees", async (_how, save) => {
    const ws = fresh(), dir = join(ws, ".amc", "transparency"), snapshot = mkdtempSync(join(tmpdir(), "amc-verify-snapshot-"));
    roots.push(snapshot);
    cpSync(dir, snapshot, { recursive: true });
    await save(ws);
    rmSync(dir, { recursive: true, force: true });
    cpSync(snapshot, dir, { recursive: true });
    expect(status(await run(ws), "transparency-log")).toBe("FAIL");
    for (const file of [passportPolicyPath(ws), `${passportPolicyPath(ws)}.sig`]) rmSync(file);
    const report = await run(ws);
    expect(status(report, "passport-policy-signature")).toBe("FAIL");
    expect(status(report, "transparency-log")).toBe("FAIL");
    expect(report.status).toBe("FAIL");
  });

  test("without the witness log, removed passport files still fail on the ledger witness, and the log is not recreated", async () => {
    const ws = fresh();
    savePassportPolicy(ws, defaultPassportPolicy());
    for (const file of [passportPolicyPath(ws), `${passportPolicyPath(ws)}.sig`, transparencyLogPath(ws)]) rmSync(file);
    const report = await run(ws);
    expect(status(report, "passport-policy-signature")).toBe("FAIL");
    expect(status(report, "transparency-log")).toBe("FAIL");
    expect(report.status).toBe("FAIL");
    expect(existsSync(transparencyLogPath(ws))).toBe(false);
  });

  test.each([
    ["log", (ws: string) => [transparencyLogPath(ws)]],
    ["seal", (ws: string) => [transparencySealPath(ws), transparencySealSigPath(ws)]]
  ])("a missing transparency %s reads INCOMPLETE, never PASS, and verify all writes no new one", async (_what, files) => {
    const ws = fresh();
    for (const file of files(ws)) rmSync(file);
    for (let i = 0; i < 2; i++) {
      const report = await run(ws);
      expect(report.status).toBe("INCOMPLETE");
      expect(report.skippedCritical).toEqual(["passport-policy-signature", "transparency-log", "transparency-merkle", "a4-projects"]);
      for (const file of files(ws)) expect(existsSync(file)).toBe(false);
    }
  });
});
