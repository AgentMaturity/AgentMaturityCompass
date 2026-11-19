import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
import { executeSessionRewind } from "../src/session/sessionRewindApply.js";
import { describeSessionRewinds, FORK_AFTER_REWIND_AUDIT, rewindVerificationErrors } from "../src/session/sessionRewindEvidence.js";
import { registerSessionRewindCommand } from "../src/cli-session-rewind-command.js";
import { AGENT_ENV_MARKERS } from "../src/vault/operatorContext.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { EvidenceEvent } from "../src/types.js";

/**
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

describe("amc session rewind, end to end", () => {
  it("edit, edit, rewind to turn 1: files and hashes are back, the fork continues from turn 1, and both sessions verify", async () => {
    const parent = await fourTurns();
    const plan = planSessionRewind(workspace, parent, 1);
    expect(plan.conflicts).toEqual([]);
    expect(plan.files.map((file) => [file.path, file.fromSha256, file.toSha256])).toEqual([
      ["workspace/output/note.txt", sha256Hex("v2\n"), sha256Hex("v0\n")], ["workspace/output/new.txt", sha256Hex("created\n"), null]]);
    const outcome = executeSessionRewind(plan, { onlyClean: false });
    expect(outcome.results.map((result) => result.status)).toEqual(["restored", "removed"]);
    expect(readFileSync(out("note.txt"), "utf8")).toBe("v0\n");
    expect(existsSync(out("new.txt"))).toBe(false);
    // The original rows stay; the rewind is described in plain words.
    expect(rows(parent).some((row) => row.meta_json.includes("NATIVE_FILE_CHECKPOINT"))).toBe(true);
    expect(describeSessionRewinds(workspace, parent, rows(parent)).join("\n")).toMatch(/Files rewound to turn 1 .* 1 put back, 1 created file\(s\) removed, 0 already back, 0 failed/);
    // A second rewind to turn 2 is now a conflict on every file: nothing matches what the session last wrote.
    expect(planSessionRewind(workspace, parent, 2).conflicts.map((conflict) => conflict.reason)).toEqual(["changed-since", "changed-since"]);

    const child = await run(["continue from here"], { forkFrom: parent });
    const childRows = rows(child);
    expect(JSON.parse(childRows[0]!.meta_json)).toMatchObject({ parentSession: { sessionId: parent, forkTurn: 1 } });
    expect(JSON.parse(childRows[1]!.meta_json)).toMatchObject({ auditType: FORK_AFTER_REWIND_AUDIT, parentSessionId: parent, toTurn: 1, rewindEventId: outcome.finishedEventId });
    expect(describeSessionRewinds(workspace, child, childRows).join("\n")).toContain(`continues session ${parent} from turn 1`);
    for (const id of [parent, child]) {
      const verified = await verifyAgentRun(workspace, id);
      expect(verified.sessionChainErrors, id).toEqual([]);
      expect(verified.integrityOk, id).toBe(true);
    }
  }, 120_000);

  it("refuses to restore over a file that changed since, and writes nothing unless --only-clean", async () => {
    // MUTATION: drop the current-digest check in planSessionRewind and note.txt is overwritten.
    const parent = await fourTurns();
    writeFileSync(out("note.txt"), "changed by a person\n");
    const plan = planSessionRewind(workspace, parent, 1);
    expect(plan.conflicts).toEqual([{ path: "workspace/output/note.txt", reason: "changed-since" }]);
    // MUTATION: drop the CONFLICTS refusal and new.txt is removed here.
    expect(() => executeSessionRewind(plan, { onlyClean: false })).toThrow(/nothing was written/);
    expect(existsSync(out("new.txt"))).toBe(true);
    expect(executeSessionRewind(plan, { onlyClean: true }).results.map((result) => result.path)).toEqual(["workspace/output/new.txt"]);
    expect(existsSync(out("new.txt"))).toBe(false);
    expect(readFileSync(out("note.txt"), "utf8")).toBe("changed by a person\n");
  }, 120_000);

  it("refuses while a live writer holds a session in the workspace, and never writes through a symlinked folder", async () => {
    const parent = await fourTurns();
    const live = new SessionService(workspace);
    live.open({ agentId: "default", harnessVersion: "rewind-live", compositionDigest: "fixture", policyDigest: "fixture" });
    try {
      // MUTATION: skip assertNoLiveWriter and the plan is made while another agent writes.
      expect(() => planSessionRewind(workspace, parent, 1)).toThrow(/still being written by a running agent/);
    } finally { live.close({ reason: "test" }); }
    // note.txt becomes a link to another allowed file holding the same bytes the session last wrote.
    writeFileSync(out("real-note.txt"), "v2\n");
    rmSync(out("note.txt"));
    symlinkSync(out("real-note.txt"), out("note.txt"));
    // MUTATION: resolve with insideWorkspace (links followed) and the file behind the link is rewritten.
    const plan = planSessionRewind(workspace, parent, 1);
    expect(plan.conflicts).toEqual([{ path: "workspace/output/note.txt", reason: "symlink-or-protected" }]);
    executeSessionRewind(plan, { onlyClean: true });
    expect(readFileSync(out("real-note.txt"), "utf8")).toBe("v2\n");
    expect(existsSync(out("new.txt"))).toBe(false);
  }, 120_000);

  it("checkpoints are spill objects: inventory lists them, erasure removes them, and an erased copy is a conflict, not a promise", async () => {
    const parent = await fourTurns();
    const events = rows(parent);
    const inventory = inventorySessionSpills({ workspace, events });
    expect(inventory.ok).toBe(true);
    expect(inventory.entries.filter((entry) => entry.status === "retained").length).toBeGreaterThanOrEqual(2);
    // MUTATION: drop the object inspection in planSessionRewind and note.txt is planned as "put back" with no copy left.
    expect(eraseSessionSpills({ workspace, events, scope: { sessionIds: [parent] }, reason: "rewind fixture: erase this session's kept copies" }).ok).toBe(true);
    const plan = planSessionRewind(workspace, parent, 1);
    expect(plan.conflicts).toEqual([{ path: "workspace/output/note.txt", reason: "no-pre-image" }]);
    expect(plan.files.map((file) => file.path)).toEqual(["workspace/output/new.txt"]);
  }, 120_000);

  it("refuses instead of reading unreadable history as no change", async () => {
    const parent = await fourTurns();
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    lockVault(workspace);
    // MUTATION: let payloadOf return null again and the plan says nothing changed.
    expect(() => planSessionRewind(workspace, parent, 1)).toThrow(/could not be read/);
  }, 120_000);

  it("the verifier rejects a rewind row that cites a checkpoint that does not exist", async () => {
    // MUTATION: skip the cited-checkpoint lookup in checkFiles and this forged rewind verifies.
    const parent = await fourTurns();
    const intended = appendOpsAuditEvent({ workspace, auditType: REWIND_INTENDED_AUDIT, subjectId: parent, payload: { v: 1, sessionId: parent, toTurn: 1,
      files: [{ checkpointEventId: "no-such-row", commitmentEventId: "no-such-row", action: "restore" }] } });
    appendOpsAuditEvent({ workspace, auditType: REWIND_FINISHED_AUDIT, subjectId: parent, payload: { v: 1, intendedEventId: intended.eventId,
      intendedEventHash: intended.eventHash, sessionId: parent, toTurn: 1, outcomes: [{ status: "restored", restoredDigest: sha256Hex("v0\n") }] } });
    expect(rewindVerificationErrors(workspace, parent, rows(parent))).toEqual([expect.stringContaining("cites checkpoint row no-such-row")]);
    expect((await verifyAgentRun(workspace, parent)).integrityOk).toBe(false);
  }, 120_000);
});

describe("amc session rewind is a person's act", () => {
  it("is refused in agent mode and for a recognised agent; --dry-run only reads", async () => {
    // MUTATION: drop the interactive-operator check in the command and the agent's rewind runs.
    const parent = await fourTurns();
    const errors: string[] = [], logs: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line: unknown) => { errors.push(String(line)); });
    vi.spyOn(console, "log").mockImplementation((line: unknown) => { logs.push(String(line)); });
    const tty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    try {
      const program = new Command().exitOverride();
      const answers: string[] = [];
      registerSessionRewindCommand(program.command("session"), () => Promise.resolve(answers.shift() ?? null));
      for (const marker of AGENT_ENV_MARKERS) vi.stubEnv(marker, "");
      vi.stubEnv("CLAUDECODE", "1");
      await program.parseAsync(["session", "rewind", parent, "--to-turn", "1"], { from: "user" });
      expect(errors.join("\n")).toContain("agent marker CLAUDECODE");
      expect(readFileSync(out("note.txt"), "utf8")).toBe("v2\n");
      await program.parseAsync(["session", "rewind", parent, "--to-turn", "1", "--dry-run"], { from: "user" });
      expect(logs.join("\n")).toContain("put back  workspace/output/note.txt");
      expect(logs.join("\n")).toContain("A rewind never undoes");
      expect(readFileSync(out("note.txt"), "utf8")).toBe("v2\n");
      vi.stubEnv("CLAUDECODE", "");
      // MUTATION (M2): skip the typed confirmation and the first two answers already write.
      for (const answer of ["yes", null]) {
        answers.push(answer as string);
        await program.parseAsync(["session", "rewind", parent, "--to-turn", "1"], { from: "user" });
        expect(readFileSync(out("note.txt"), "utf8")).toBe("v2\n");
        expect(existsSync(out("new.txt"))).toBe(true);
      }
      expect(errors.join("\n")).toContain("Not confirmed. Nothing was changed.");
      answers.push("rewind");
      await program.parseAsync(["session", "rewind", parent, "--to-turn", "1"], { from: "user" });
      expect(readFileSync(out("note.txt"), "utf8")).toBe("v0\n");
      expect(logs.join("\n")).toContain(`amc agent-loop chat --fork-from ${parent}`);
    } finally {
      if (tty) Object.defineProperty(process.stdin, "isTTY", tty); else Reflect.deleteProperty(process.stdin, "isTTY");
      process.exitCode = undefined;
    }
    setMode(workspace, "agent");
    expect(() => assertOwnerMode(workspace, "session rewind")).toThrow(/blocked in agent mode/);
  }, 120_000);
});
