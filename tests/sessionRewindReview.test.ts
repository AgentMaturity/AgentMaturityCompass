import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initActionPolicy } from "../src/governor/actionPolicyEngine.js";
import { codingActionPolicy } from "../src/setup/starterProfiles.js";
import { initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { defaultToolsConfig } from "../src/toolhub/toolsSchema.js";
import { initToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { openLedger } from "../src/ledger/ledger.js";
import { runComposedTurn, type ComposedToolSession } from "../src/kernel/agentLoopRunner.js";
import { agentToolset } from "../src/agent/agentToolset.js";
import { approvalModeGatedClasses } from "../src/approvals/approvalModes.js";
import { STUB_PROVIDER_ID, STUB_PROVIDER_MODEL, stubProviderRoute, stubProviderTransport } from "../src/agent/stubProvider.js";
import { decideApprovalForIntent } from "../src/approvals/approvalEngine.js";
import { verifyAgentRun } from "../src/agent/runReport.js";
import { eraseSessionSpills, inventorySessionSpills } from "../src/session/spill/spillLifecycle.js";
import { lockVault } from "../src/vault/vault.js";
import { appendOpsAuditEvent } from "../src/ops/audit.js";
import { assertOwnerMode, setMode } from "../src/mode/mode.js";
import { SessionService } from "../src/session/sessionService.js";
import { planSessionRewind, REWIND_FINISHED_AUDIT, REWIND_INTENDED_AUDIT } from "../src/session/sessionRewind.js";
import { executeSessionRewind, RECREATED_DEFAULT_MODE } from "../src/session/sessionRewindApply.js";
import { describeSessionRewinds, FORK_AFTER_REWIND_AUDIT, rewindVerificationErrors, unfinishedRewindOf } from "../src/session/sessionRewindEvidence.js";
import { registerSessionRewindCommand } from "../src/cli-session-rewind-command.js";
import { AGENT_ENV_MARKERS } from "../src/vault/operatorContext.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { EvidenceEvent } from "../src/types.js";

const hook: { beforeWrite?: () => void; afterRead?: (path: string) => void; failFinished?: boolean } = {};
vi.mock("../src/tools/builtin/atomicWrite.js", async (orig) => {
  const real = await orig<typeof import("../src/tools/builtin/atomicWrite.js")>();
  return { ...real, writeFileAtomicSync: (...args: Parameters<typeof real.writeFileAtomicSync>) => { const h = hook.beforeWrite; hook.beforeWrite = undefined; h?.(); return real.writeFileAtomicSync(...args); } };
});
vi.mock("../src/tools/builtin/fsRegularFile.js", async (orig) => {
  const real = await orig<typeof import("../src/tools/builtin/fsRegularFile.js")>();
  return { ...real, readRegularFile: (path: string) => { const bytes = real.readRegularFile(path); const h = hook.afterRead; if (h) { hook.afterRead = undefined; h(path); } return bytes; } };
});
vi.mock("../src/ops/audit.js", async (orig) => {
  const real = await orig<typeof import("../src/ops/audit.js")>();
  return { ...real, appendOpsAuditEvent: (params: Parameters<typeof real.appendOpsAuditEvent>[0]) => {
    if (hook.failFinished && params.auditType === "SESSION_REWIND_FINISHED") { hook.failFinished = false; throw new Error("the process stopped here"); }
    return real.appendOpsAuditEvent(params);
  } };
});

/**
 * Review of lane rewind (REVIEW.md B1, H1, M1, M3, L1), ported from the reviewer's attack tests R2, R3, R6.
 * HP-06 end to end on a temp workspace, on the real composed loop and the real toolset: four approved turns (read,
 * overwrite, create, overwrite), a rewind to turn 1, the fork that continues from it, and the run verifier on both.
 * Then the refusals: a changed file, a live writer, a symlinked folder, a forged rewind row, and an agent.
 */
let workspace: string, credentialsHome: string, amcHome: string;
const originalCwd = process.cwd();
const out = (name: string) => join(workspace, "workspace", "output", name);

beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "session-rewind-fixture");
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-rewind-")));
  credentialsHome = realpathSync(mkdtempSync(join(tmpdir(), "amc-rewind-cred-")));
  amcHome = realpathSync(mkdtempSync(join(tmpdir(), "amc-rewind-home-")));
  vi.stubEnv("AMC_HOME", amcHome);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(workspace, "default");
  initActionPolicy(workspace, codingActionPolicy());
  initApprovalPolicy(workspace);
  writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  initToolsConfig(workspace, defaultToolsConfig());
  mkdirSync(join(workspace, "workspace", "output"), { recursive: true });
  writeFileSync(out("note.txt"), "v0\n");
  process.chdir(workspace);
});
afterEach(() => {
  process.chdir(originalCwd);
  vi.unstubAllEnvs();
  for (const dir of [workspace, credentialsHome, amcHome]) rmSync(dir, { recursive: true, force: true });
});

const scripted = (tool: string, args: Record<string, unknown>): string => JSON.stringify({ tool, arguments: args });
const claimant = { pid: process.pid, hostId: hostname(), bootId: "rewind-test", startedAt: Date.now() };
const rows = (sessionId: string): EvidenceEvent[] => {
  const ledger = openLedger(workspace, { readonly: true });
  try { return ledger.getAllEvents().filter((row) => row.session_id === sessionId); } finally { ledger.close(); }
};

/**
 * Composed runs of one session with one toolset (so a file read in one turn may be written in the next, as in one chat
 * process): the first prompt opens the session, each later one resumes it; every gated call is approved.
 */
async function run(prompts: readonly string[], extra: { forkFrom?: string } = {}): Promise<string> {
  let writer: ComposedToolSession | undefined;
  let sessionId = extra.forkFrom === undefined ? `rewind-${Date.now()}-${Math.random().toString(16).slice(2)}` : undefined;
  const onRaised = (event: { approvalRequestId: string }) => {
    setTimeout(() => {
      for (const userId of ["approver-1", "approver-2"]) {
        const decided = decideApprovalForIntent({ reviewerAuthentication: "authenticated", workspace, agentId: "default", approvalId: event.approvalRequestId,
          decision: "APPROVED", mode: "EXECUTE", reason: "rewind fixture", userId, username: userId, userRoles: ["OWNER"] });
        if (decided.approval.status !== "PENDING") break;
      }
    }, 50);
  };
  const toolset = agentToolset({ workspace, agentId: "default", get sessionId() { return writer?.sessionId ?? sessionId ?? "pending"; },
    recorder: { recordProjectedEvidence: (row) => writer!.recordProjectedEvidence(row), assertWritable: () => writer!.assertWritable(),
      retainFileCheckpoint: (bytes, callId, cap) => writer!.retainFileCheckpoint(bytes, callId, cap) } });
  try {
    for (const [index, prompt] of prompts.entries()) {
      const outcome = await runComposedTurn({
        workspace, agentId: "default", ...(sessionId === undefined ? {} : { sessionId }), systemPrompt: "You are an AMC-governed agent.", prompt,
        route: { providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL, params: { max_tokens: 256, stream: true } },
        routes: [stubProviderRoute()], transport: stubProviderTransport(),
        tools: toolset.seam, bindToolSession: (selected) => { writer = selected; },
        credentials: { homeDir: credentialsHome, env: {}, watch: false, projectDir: null },
        approvalMode: "default",
        approvalGate: { actionClass: "WRITE_HIGH", riskTier: "high", gatesClasses: approvalModeGatedClasses("default")!, onRaised: onRaised as never },
        ...(index === 0 && extra.forkFrom !== undefined ? { forkFrom: { parentSessionId: extra.forkFrom, claimant } } : {}),
        ...(index > 0 ? { resume: { claimant } } : {}),
        keepOpen: index < prompts.length - 1
      });
      sessionId = outcome.sessionId;
    }
    return sessionId!;
  } finally { toolset.close(); }
}

/** read note (1), overwrite note v1 (2), create new.txt (3), overwrite note v2 (4). */
async function fourTurns(): Promise<string> {
  const id = await run([scripted("fs.read", { path: "workspace/output/note.txt" }),
    scripted("fs.write", { path: "workspace/output/note.txt", content: "v1\n" }),
    scripted("fs.write", { path: "workspace/output/new.txt", content: "created\n" }),
    scripted("fs.write", { path: "workspace/output/note.txt", content: "v2\n" })]);
  expect(readFileSync(out("note.txt"), "utf8")).toBe("v2\n");
  expect(readFileSync(out("new.txt"), "utf8")).toBe("created\n");
  return id;
}


const swapTo = (outside: string) => { renameSync(join(workspace, "workspace", "output"), join(workspace, "workspace", "output.real")); symlinkSync(outside, join(workspace, "workspace", "output")); };
const deleteEvil = () => run([scripted("fs.read", { path: "workspace/output/evil.txt" }),
  scripted("apply_patch", { patch: "*** Begin Patch\n*** Delete File: workspace/output/evil.txt\n*** End Patch" })]);

describe("B1: a folder swapped for a link after planning never sends a write or a delete outside the workspace", () => {
  it("R2: re-creating a deleted file through a swapped folder fails and writes nothing outside", async () => {
    // MUTATION: drop the location check in stillAsPlanned and evil.txt is created in the outside folder.
    writeFileSync(out("evil.txt"), "ATTACKER CONTENT\n");
    const parent = await deleteEvil();
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "amc-outside-")));
    const plan = planSessionRewind(workspace, parent, 1);
    expect(plan.files.map((file) => file.action)).toEqual(["recreate"]);
    hook.beforeWrite = () => swapTo(outside);
    const outcome = executeSessionRewind(plan, { onlyClean: false });
    expect(outcome.results.map((result) => result.status)).toEqual(["failed"]);
    expect(existsSync(join(outside, "evil.txt"))).toBe(false);
    rmSync(outside, { recursive: true, force: true });
  }, 120_000);

  it("R3: removing a created file through a swapped folder fails and deletes nothing outside", async () => {
    const parent = await run([scripted("fs.write", { path: "workspace/output/new.txt", content: "created\n" }), scripted("fs.read", { path: "workspace/output/note.txt" })]);
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "amc-outside-")));
    writeFileSync(join(outside, "new.txt"), "created\n");
    const plan = planSessionRewind(workspace, parent, 0);
    hook.afterRead = (path) => { if (path.endsWith("new.txt")) swapTo(outside); };
    const outcome = executeSessionRewind(plan, { onlyClean: false });
    expect(outcome.results.map((result) => result.status)).toEqual(["failed"]);
    expect(readFileSync(join(outside, "new.txt"), "utf8")).toBe("created\n");
    rmSync(outside, { recursive: true, force: true });
  }, 120_000);

  it.runIf(process.platform === "darwin")("R6: a separate process swapping the folder with a link while a person rewinds never wins (bounded tries)", async () => {
    writeFileSync(out("evil.txt"), "ATTACKER CONTENT\n");
    const parent = await deleteEvil();
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "amc-outside-")));
    const plan = planSessionRewind(workspace, parent, 1);
    const a = join(workspace, "workspace", "output"), b = join(workspace, "workspace", "output.alt");
    symlinkSync(outside, b);
    const swapper = spawn("python3", ["-c", "import ctypes,sys\nf=ctypes.CDLL(None).renamex_np\na,b=sys.argv[1].encode(),sys.argv[2].encode()\nwhile True: f(a,b,2)", a, b], { stdio: "ignore" });
    swapper.kill("SIGSTOP");
    let wins = 0;
    try {
      for (let tries = 0; tries < 150 && wins === 0; tries++) {
        swapper.kill("SIGCONT");
        try { executeSessionRewind(plan, { onlyClean: false }); } catch { /* a refusal is a safe outcome */ }
        swapper.kill("SIGSTOP");
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (existsSync(join(outside, "evil.txt"))) wins++;
        for (const dir of [a, b]) { try { if (lstatSync(dir).isDirectory()) unlinkSync(join(dir, "evil.txt")); } catch { /* absent */ } }
      }
    } finally { swapper.kill("SIGKILL"); rmSync(outside, { recursive: true, force: true }); }
    expect(wins).toBe(0);
  }, 600_000);
});

describe("H1: each safety rule has a test", () => {
  it("a path the signed tools policy now denies is a conflict", async () => {
    // MUTATION: drop deniedByPolicy in planSessionRewind and note.txt is planned as "restore".
    const parent = await fourTurns();
    const config = defaultToolsConfig();
    for (const tool of config.tools.allowedTools.filter((entry) => entry.name === "fs.write")) tool.deny = { ...tool.deny, paths: [...(tool.deny?.paths ?? []), "./workspace/output/note.txt"] };
    initToolsConfig(workspace, config);
    expect(planSessionRewind(workspace, parent, 1).conflicts).toContainEqual({ path: "workspace/output/note.txt", reason: "symlink-or-protected" });
  }, 120_000);

  it("a file another session changed afterwards is a conflict", async () => {
    // MUTATION: drop the other-session check and note.txt is reported as changed-since instead.
    const parent = await fourTurns();
    await run([scripted("fs.read", { path: "workspace/output/note.txt" }), scripted("fs.write", { path: "workspace/output/note.txt", content: "v3\n" })]);
    expect(planSessionRewind(workspace, parent, 1).conflicts).toContainEqual({ path: "workspace/output/note.txt", reason: "other-session" });
  }, 120_000);

  it("a removal re-checks the file's bytes: a file changed after the plan is kept", async () => {
    // MUTATION: drop stillAsPlanned before the unlink and new.txt is deleted with its new content.
    const parent = await fourTurns();
    const plan = planSessionRewind(workspace, parent, 1);
    writeFileSync(out("new.txt"), "a person's edit\n");
    const outcome = executeSessionRewind(plan, { onlyClean: false });
    expect(outcome.results.find((result) => result.path.endsWith("new.txt"))?.status).toBe("failed");
    expect(readFileSync(out("new.txt"), "utf8")).toBe("a person's edit\n");
  }, 120_000);

  it("the verifier rejects a fork that cites a rewind of another session", () => {
    // MUTATION: drop the subjectId match in the fork-citation check and this verifies.
    const finished = appendOpsAuditEvent({ workspace, auditType: REWIND_FINISHED_AUDIT, subjectId: "another-session", payload: { v: 2, toTurn: 1, outcomes: [] } });
    const rowsOf = [
      { id: "open", event_type: "session/open", meta_json: JSON.stringify({ parentSession: { sessionId: "the-parent", forkTurn: 1 } }) },
      { id: "fork", event_type: "audit", meta_json: JSON.stringify({ auditType: FORK_AFTER_REWIND_AUDIT, parentSessionId: "the-parent", toTurn: 1,
        rewindEventId: finished.eventId, rewindEventHash: finished.eventHash }) }
    ] as unknown as EvidenceEvent[];
    expect(rewindVerificationErrors(workspace, "child", rowsOf)).toEqual([expect.stringContaining("cites a rewind that does not exist or does not match")]);
  });
});

describe("M3 and L1: an interrupted rewind is visible and finishes truthfully; permissions come back", () => {
  it("a rewind stopped before its finished record is shown, verified, and a re-run counts files already back as done", async () => {
    // MUTATION: drop the "already" branch in planSessionRewind and the re-run calls note.txt "changed after the session last wrote it".
    const parent = await fourTurns();
    hook.failFinished = true;
    expect(() => executeSessionRewind(planSessionRewind(workspace, parent, 1), { onlyClean: false })).toThrow(/stopped here/);
    expect(readFileSync(out("note.txt"), "utf8")).toBe("v0\n");
    const shown = describeSessionRewinds(workspace, parent, rows(parent)).join("\n");
    expect(shown).toMatch(/A rewind to turn 1 was started .* did not finish .* 2 file\(s\): workspace\/output\/note.txt, workspace\/output\/new.txt/);
    expect(rewindVerificationErrors(workspace, parent, rows(parent))).toEqual([]);
    const unfinished = unfinishedRewindOf(workspace, parent);
    const again = planSessionRewind(workspace, parent, 1, unfinished);
    expect(again.conflicts).toEqual([]);
    expect(again.files.map((file) => file.action)).toEqual(["already", "already"]);
    const outcome = executeSessionRewind(again, { onlyClean: false });
    expect(outcome.results.map((result) => result.status)).toEqual(["already", "already"]);
    expect(unfinishedRewindOf(workspace, parent)).toBe(unfinished); // the first intention stays on record, cited by the second
    expect((await verifyAgentRun(workspace, parent)).sessionChainErrors).toEqual([]);
  }, 120_000);

  it("a deleted 0600 file comes back 0600, and one with no recorded mode comes back readable by its owner only", async () => {
    // MUTATION: re-create without the recorded mode and secret.txt comes back with the default bits.
    writeFileSync(out("secret.txt"), "token\n", { mode: 0o600 });
    chmodSync(out("secret.txt"), 0o640);
    const parent = await run([scripted("fs.read", { path: "workspace/output/secret.txt" }),
      scripted("apply_patch", { patch: "*** Begin Patch\n*** Delete File: workspace/output/secret.txt\n*** End Patch" })]);
    const plan = planSessionRewind(workspace, parent, 1);
    expect(plan.files[0]).toMatchObject({ action: "recreate", mode: 0o640 });
    executeSessionRewind(plan, { onlyClean: false });
    expect(lstatSync(out("secret.txt")).mode & 0o777).toBe(0o640);
    rmSync(out("secret.txt"));
    executeSessionRewind({ ...plan, files: [{ ...plan.files[0]!, mode: null }] }, { onlyClean: false });
    expect(lstatSync(out("secret.txt")).mode & 0o777).toBe(RECREATED_DEFAULT_MODE);
  }, 120_000);
});
