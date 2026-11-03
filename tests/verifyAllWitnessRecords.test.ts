/**
 * The two configuration-witness records of `amc verify all` (an evidence-ledger audit row and a transparency entry): every
 * explicit writer leaves both, each is restored on its own after a rollback, and verify all reads the ledger witnesses from
 * the rows its verification checked, never from a second open of the file.
 */
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { verifyAll } from "../src/verify/verifyAll.js";
import { passportPolicyPath, savePassportPolicy } from "../src/passport/passportStore.js";
import { savePassportPolicyAsync } from "../src/index.js";
import { defaultPassportPolicy } from "../src/passport/passportPolicySchema.js";
import { promptSchedulerTickAsync } from "../src/prompt/promptSchedulerAsync.js";
import { promptLatestPackPath, promptSchedulerPath } from "../src/prompt/promptPolicyStore.js";
import { buildPromptPackForApi } from "../src/prompt/promptPackApi.js";
import { buildPromptPackForApiAsync } from "../src/prompt/promptPackAsync.js";
import { openLedger } from "../src/ledger/ledger.js";
import { closeAllSqlitePools } from "../src/storage/sqlitePool.js";
import { verifiedTransparencyLog } from "../src/transparency/logChain.js";
import { workspaceKeyTrust } from "./helpers/trustContext.js";

const hook = vi.hoisted(() => ({ afterLedgerVerify: null as null | (() => void) }));
vi.mock("../src/ledger/ledger.js", async (original) => {
  const actual = await original<typeof import("../src/ledger/ledger.js")>();
  return { ...actual, verifyLedgerIntegrity: (...args: Parameters<typeof actual.verifyLedgerIntegrity>) => {
    const result = actual.verifyLedgerIntegrity(...args);
    hook.afterLedgerVerify?.();
    return result;
  } };
});

vi.setConfig({ testTimeout: 60_000 });

const roots: string[] = [];
afterEach(() => {
  hook.afterLedgerVerify = null;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temp(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}
function fresh(): string {
  const root = temp("amc-verify-witness-");
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}
const run = (workspace: string) => verifyAll({ workspace, trust: workspaceKeyTrust(workspace) });
const check = (report: Awaited<ReturnType<typeof run>>, id: string) => report.checks.find((row) => row.id === id);
const transparencyDir = (ws: string) => join(ws, ".amc", "transparency");
const ledgerFiles = (ws: string) => ["evidence.sqlite", "evidence.sqlite-wal", "evidence.sqlite-shm"].map((name) => join(ws, ".amc", name));

/** Copies the transparency directory and the ledger files aside; `restore` puts the chosen record back as it was. */
function snapshot(ws: string) {
  const dir = temp("amc-verify-witness-snap-"), log = join(dir, "transparency"), ledger = join(dir, "ledger");
  cpSync(transparencyDir(ws), log, { recursive: true });
  for (const file of ledgerFiles(ws)) if (existsSync(file)) cpSync(file, join(ledger, file.split("/").pop()!));
  return {
    restoreLog() { rmSync(transparencyDir(ws), { recursive: true, force: true }); cpSync(log, transparencyDir(ws), { recursive: true }); },
    restoreLedger() {
      closeAllSqlitePools(); // pooled writers would keep writing to the replaced file
      for (const file of ledgerFiles(ws)) {
        rmSync(file, { force: true });
        const copy = join(ledger, file.split("/").pop()!);
        if (existsSync(copy)) cpSync(copy, file);
      }
    }
  };
}
function ledgerRows(ws: string, type: string): number {
  const ledger = openLedger(ws, { readonly: true });
  try {
    return (ledger.db.prepare("SELECT COUNT(*) AS n FROM evidence_events WHERE event_type = 'audit' AND json_extract(meta_json, '$.auditType') = ?")
      .get(type) as { n: number }).n;
  } finally {
    ledger.close();
  }
}
const logRows = (ws: string, type: string) => verifiedTransparencyLog(ws, { readOnly: true }).entries.filter((entry) => entry.type === type).length;
const removePair = (path: string) => { rmSync(path); rmSync(`${path}.sig`); };

describe("verify all configuration witnesses", () => {
  test("a passport policy saved through the async SDK and then deleted with its signature fails", async () => {
    const ws = fresh();
    await savePassportPolicyAsync(ws, defaultPassportPolicy());
    removePair(passportPolicyPath(ws));
    const report = await run(ws);
    expect(check(report, "passport-policy-signature")?.status).toBe("FAIL");
    expect(report.status).toBe("FAIL");
  });

  test("the scheduler state an async tick writes on its error branch is witnessed", async () => {
    const ws = fresh();
    expect(await promptSchedulerTickAsync({ workspace: ws, workspaceReady: false })).toMatchObject({ ran: false, reason: "workspace_not_ready" });
    removePair(promptSchedulerPath(ws));
    const report = await run(ws);
    expect(check(report, "prompt-scheduler-signature")?.status).toBe("FAIL");
    expect(report.status).toBe("FAIL");
  });

  test("each record is restored on the next save after only it was rolled back", async () => {
    const ws = fresh(), before = snapshot(ws);
    savePassportPolicy(ws, defaultPassportPolicy());
    expect([ledgerRows(ws, "PASSPORT_POLICY_CONFIGURED"), logRows(ws, "PASSPORT_POLICY_CONFIGURED")]).toEqual([1, 1]);
    before.restoreLedger();
    expect(ledgerRows(ws, "PASSPORT_POLICY_CONFIGURED")).toBe(0);
    savePassportPolicy(ws, defaultPassportPolicy());
    expect([ledgerRows(ws, "PASSPORT_POLICY_CONFIGURED"), logRows(ws, "PASSPORT_POLICY_CONFIGURED")]).toEqual([1, 1]);
    before.restoreLog();
    expect(check(await run(ws), "transparency-log")?.status).toBe("FAIL");
    savePassportPolicy(ws, defaultPassportPolicy());
    expect([ledgerRows(ws, "PASSPORT_POLICY_CONFIGURED"), logRows(ws, "PASSPORT_POLICY_CONFIGURED")]).toEqual([1, 1]);
    expect(check(await run(ws), "transparency-log")?.status).toBe("PASS");
  });

  test("the ledger witnesses are those verification checked: a ledger swapped after verification changes nothing", async () => {
    const ws = fresh(), before = snapshot(ws);
    savePassportPolicy(ws, defaultPassportPolicy());
    removePair(passportPolicyPath(ws));
    before.restoreLog();
    hook.afterLedgerVerify = () => before.restoreLedger();
    const report = await run(ws);
    expect(check(report, "passport-policy-signature")?.status).toBe("FAIL");
    expect(check(report, "passport-policy-signature")?.details.join(" ")).toContain("evidence ledger");
  });

  test.each([
    ["synchronously", async (ws: string) => { buildPromptPackForApi({ workspace: ws, agentId: "default" }); }],
    ["asynchronously", async (ws: string) => { await buildPromptPackForApiAsync({ workspace: ws, agentId: "default" }); }]
  ])("a pack built %s is witnessed in the ledger: deleted with the log rolled back, it still fails", async (_how, build) => {
    const ws = fresh(), before = snapshot(ws);
    await build(ws);
    await build(ws);
    expect(ledgerRows(ws, "PROMPT_PACK_CREATED")).toBe(1);
    before.restoreLog();
    rmSync(dirname(promptLatestPackPath(ws, "default")), { recursive: true, force: true });
    const report = await run(ws);
    expect(check(report, "prompt-packs")?.status).toBe("FAIL");
    expect(check(report, "prompt-packs")?.details.join(" ")).toContain("the evidence ledger records a pack built for this agent");
    expect(check(report, "transparency-log")?.status).toBe("FAIL");
    expect(report.notConfigured).not.toContain("prompt-packs");
  });
});
