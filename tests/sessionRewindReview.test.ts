import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
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

const hook: { afterRead?: (path: string) => void; failFinished?: boolean } = {};
/**
 * One armed swap, run right before the next named fs call whose path matches: the moment between the last check and
 * the system call that a separate process would have to hit. Every other call passes through.
 */
const step = vi.hoisted(() => ({ armed: null as null | { fn: string; match: (path: string, flags?: unknown) => boolean; run: () => void; after?: () => void }, fired: 0 }));
vi.mock("node:fs", async (orig) => {
  const real = await orig<typeof import("node:fs")>();
  const at = <F extends (...args: never[]) => unknown>(fn: string, original: F): F => ((...args: Parameters<F>) => {
    const armed = step.armed;
    if (!(armed?.fn === fn && armed.match(String(args[0]), args[1]))) return original(...args);
    step.armed = null; step.fired++; armed.run();
    const result = original(...args);
    armed.after?.();
    return result;
  }) as F;
  const wrapped = { mkdirSync: at("mkdirSync", real.mkdirSync), openSync: at("openSync", real.openSync), lstatSync: at("lstatSync", real.lstatSync), renameSync: at("renameSync", real.renameSync), unlinkSync: at("unlinkSync", real.unlinkSync) };
  return { ...real, ...wrapped, default: { ...real, ...wrapped } };
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
  it("R2: a link swapped in only while a folder is entered is refused, and nothing is written outside", async () => {
    // The swap is undone right after the chdir, so the location check that follows sees the planned folder again:
    // only the process.cwd() check at the pin can tell that the process entered the outside folder.
    // MUTATION: drop the process.cwd() check in pinnedDirectory.ts enter() and evil.txt is created in the outside folder.
    writeFileSync(out("evil.txt"), "ATTACKER CONTENT\n");
    const parent = await deleteEvil();
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "amc-outside-")));
    const plan = planSessionRewind(workspace, parent, 1);
    expect(plan.files.map((file) => file.action)).toEqual(["recreate"]);
    const chdir = process.chdir.bind(process);
    const output = join(workspace, "workspace", "output");
    const spy = vi.spyOn(process, "chdir").mockImplementation((to: string) => {
      if (to !== "./output") return chdir(to);
      spy.mockRestore();
      swapTo(outside);
      chdir(to);
      unlinkSync(output); renameSync(`${output}.real`, output);
    });
    const outcome = executeSessionRewind(plan, { onlyClean: false });
    spy.mockRestore();
    expect(outcome.results.map((result) => result.status)).toEqual(["failed"]);
    expect(readdirSync(outside)).toEqual([]);
    expect(process.cwd()).toBe(workspace);
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
      for (let tries = 0; tries < 500 && wins === 0; tries++) {
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

/** Every file in a folder with its bytes and permission bits, to show an outside folder gained, lost or changed nothing. */
const snapshot = (dir: string) => readdirSync(dir).sort().map((entry) => {
  const status = lstatSync(join(dir, entry));
  return [entry, status.isFile() ? readFileSync(join(dir, entry), "utf8") : "not a file", status.mode & 0o7777];
});
const onlyFile = (plan: ReturnType<typeof planSessionRewind>, suffix: string) => ({ ...plan, files: plan.files.filter((file) => file.path.endsWith(suffix)) });

describe("Pinned folder: a folder swapped for a link between the last check and each system call changes nothing outside", () => {
  let outside: string;
  beforeEach(() => {
    outside = realpathSync(mkdtempSync(join(tmpdir(), "amc-outside-")));
    writeFileSync(join(outside, "note.txt"), "outside\n", { mode: 0o644 });
    writeFileSync(join(outside, "new.txt"), "created\n", { mode: 0o644 });
    chmodSync(join(outside, "note.txt"), 0o644);
  });
  afterEach(() => { step.armed = null; step.fired = 0; rmSync(outside, { recursive: true, force: true }); });

  /** Arm one swap of workspace/output (or `folder`) for a link to the outside folder, run the rewind, check outside and the working folder. */
  /** `midway`: also compare the outside folder right after the armed call returns, before any cleanup can undo it. */
  const swapAt = (fn: string, match: (path: string, flags?: unknown) => boolean, plan: ReturnType<typeof planSessionRewind>, folder = join(workspace, "workspace", "output"), midway = false) => {
    const before = snapshot(outside);
    let atCall: ReturnType<typeof snapshot> = before;
    step.armed = { fn, match, run: () => { renameSync(folder, `${folder}.real`); symlinkSync(outside, folder); }, ...(midway ? { after: () => { atCall = snapshot(outside); } } : {}) };
    const outcome = executeSessionRewind(plan, { onlyClean: false });
    expect(step.fired).toBe(1);
    expect(atCall).toEqual(before);
    expect(snapshot(outside)).toEqual(before);
    expect(process.cwd()).toBe(workspace);
    return { outcome, real: `${folder}.real` };
  };

  it("mkdir: nested missing folders made through a swapped folder are made inside, never outside", async () => {
    // MUTATION: mkdirSync(join(expected, folder)) instead of mkdirSync(name) in withPinnedDirectory and outside gains b/.
    writeFileSync(out("evil.txt"), "ATTACKER CONTENT\n");
    const plan = planSessionRewind(workspace, await deleteEvil(), 1);
    const nested = { ...plan, files: [{ ...plan.files[0]!, path: "workspace/output/a/b/evil.txt" }] };
    const { outcome, real } = swapAt("mkdirSync", (path) => path.endsWith("b"), nested, join(workspace, "workspace", "output", "a"));
    expect(outcome.results.map((result) => result.status)).toEqual(["failed"]); // entering b no longer leads to output/a/b
    expect(readdirSync(real)).toEqual(["b"]);
  }, 120_000);

  it("create: a re-created file lands in the folder that was checked", async () => {
    // MUTATION: openSync(join(expected, name), ...) for the create-only write and evil.txt appears outside.
    writeFileSync(out("evil.txt"), "ATTACKER CONTENT\n");
    const plan = planSessionRewind(workspace, await deleteEvil(), 1);
    const { outcome, real } = swapAt("openSync", (path, flags) => path.endsWith("evil.txt") && typeof flags === "number", plan);
    expect(outcome.results.map((result) => result.status)).toEqual(["recreated"]);
    expect(readFileSync(join(real, "evil.txt"), "utf8")).toBe("ATTACKER CONTENT\n");
  }, 120_000);

  it("temp create: the temp file of a restore is made and removed in the folder that was checked", async () => {
    // MUTATION: an absolute temp path and the temp file is made in the outside folder (seen right after the open, before
    // the commit check refuses and the cleanup removes it again).
    const plan = onlyFile(planSessionRewind(workspace, await fourTurns(), 1), "note.txt");
    const { outcome, real } = swapAt("openSync", (path) => path.includes(".amc-tmp-"), plan, join(workspace, "workspace", "output"), true);
    expect(outcome.results.map((result) => result.status)).toEqual(["failed"]); // the check before the rename sees the swap
    expect(readdirSync(real)).toEqual(["new.txt", "note.txt"]); // the temp file was removed where it was made
    expect(readFileSync(join(real, "note.txt"), "utf8")).toBe("v2\n");
  }, 120_000);

  it("rename: a restore publishes into the folder that was checked", async () => {
    // MUTATION: renameSync(temporary, join(expected, name)) and the outside note.txt is replaced.
    const plan = onlyFile(planSessionRewind(workspace, await fourTurns(), 1), "note.txt");
    const { outcome, real } = swapAt("renameSync", (path) => path.includes(".amc-tmp-"), plan);
    expect(outcome.results.map((result) => result.status)).toEqual(["restored"]);
    expect(readFileSync(join(real, "note.txt"), "utf8")).toBe("v0\n");
  }, 120_000);

  it("unlink: a removal deletes only inside the folder that was checked", async () => {
    // MUTATION: unlinkSync(join(expected, name)) and the outside new.txt is deleted.
    const plan = onlyFile(planSessionRewind(workspace, await fourTurns(), 1), "new.txt");
    const { outcome, real } = swapAt("unlinkSync", (path) => path.endsWith("new.txt"), plan);
    expect(outcome.results.map((result) => result.status)).toEqual(["removed"]);
    expect(existsSync(join(real, "new.txt"))).toBe(false);
  }, 120_000);

  it("chmod: the recorded mode is set on the new file before it is published, and no outside file changes mode", async () => {
    // MUTATION: put back the old chmodSync(planned) after the rename (here: on the absolute path) and outside note.txt becomes 0640.
    const plan = onlyFile(planSessionRewind(workspace, await fourTurns(), 1), "note.txt");
    const withMode = { ...plan, files: [{ ...plan.files[0]!, mode: 0o640 }] };
    const { outcome, real } = swapAt("renameSync", (path) => path.includes(".amc-tmp-"), withMode);
    expect(outcome.results.map((result) => result.status)).toEqual(["restored"]);
    expect(lstatSync(join(real, "note.txt")).mode & 0o777).toBe(0o640);
  }, 120_000);

  /** After the pin, the pinned folder is moved outside and a real folder with the same file bytes is put at the planned place. */
  const moveAt = async (suffix: string, toTurn: number) => {
    const plan = onlyFile(planSessionRewind(workspace, await fourTurns(), toTurn), suffix);
    const output = join(workspace, "workspace", "output"), moved = join(outside, "moved");
    let movedBefore: ReturnType<typeof snapshot> = [], freshBefore: ReturnType<typeof snapshot> = [];
    step.armed = { fn: "lstatSync", match: (path) => path === `./${suffix}`, run: () => {
      renameSync(output, moved);
      mkdirSync(output);
      for (const entry of readdirSync(moved)) writeFileSync(join(output, entry), readFileSync(join(moved, entry)));
      movedBefore = snapshot(moved); freshBefore = snapshot(output);
    } };
    const outcome = executeSessionRewind(plan, { onlyClean: false });
    expect(step.fired).toBe(1);
    expect(outcome.results.map((result) => result.status)).toEqual(["failed"]);
    expect(snapshot(moved)).toEqual(movedBefore);
    expect(snapshot(output)).toEqual(freshBefore);
    expect(process.cwd()).toBe(workspace);
  };

  it("moved folder: a restore in a pinned folder that was moved away and replaced is refused, and neither folder changes", async () => {
    // MUTATION: drop the device-and-inode check in applyOne's stillAsPlanned and note.txt is replaced in outside/moved.
    await moveAt("note.txt", 1);
  }, 120_000);

  it("moved folder: a removal in a pinned folder that was moved away and replaced is refused, and neither folder changes", async () => {
    // MUTATION: drop the device-and-inode check in applyOne's stillAsPlanned and new.txt is deleted from outside/moved.
    await moveAt("new.txt", 1);
  }, 120_000);
});

describe("A working folder that cannot be restored, and Windows", () => {
  it("stops the rewind, writes the finished record, zeroes the kept copies and says files may have changed", async () => {
    // MUTATION: rethrow ERR_AMC_PIN_RESTORE before the finished record and unfinishedRewindOf names the rewind.
    const parent = await fourTurns();
    const plan = planSessionRewind(workspace, parent, 1);
    const chdir = process.chdir.bind(process);
    let toWorkspace = 0;
    const spy = vi.spyOn(process, "chdir").mockImplementation((to: string) => {
      if (to === workspace && ++toWorkspace === 2) throw Object.assign(new Error("ENOENT: the folder is gone"), { code: "ENOENT" }); // the restore
      chdir(to);
    });
    const fills = vi.spyOn(Buffer.prototype, "fill");
    let caught: unknown;
    try { executeSessionRewind(plan, { onlyClean: false }); } catch (error) { caught = error; }
    spy.mockRestore();
    process.chdir(workspace);
    const zeroed = (fills.mock.contexts as Buffer[]).filter((buffer) => buffer.length === 3 && buffer.every((byte: number) => byte === 0));
    fills.mockRestore();
    expect((caught as { code?: string }).code).toBe("INTERRUPTED");
    expect((caught as Error).message).toContain("Some files may already have been changed");
    expect((caught as Error).message).toContain("Run the same rewind again");
    expect(readFileSync(out("note.txt"), "utf8")).toBe("v0\n"); // changed before the restore failed
    expect(existsSync(out("new.txt"))).toBe(true); // not reached
    expect(unfinishedRewindOf(workspace, parent)).toBe(null); // the finished record was written
    expect(zeroed.length).toBe(1); // the kept copy "v0\n"
  }, 120_000);

  it("on Windows the rewind is refused before anything is recorded or asked", async () => {
    // MUTATION: drop assertRewindCanRun in the command and the confirmation question is asked and the files change.
    const parent = await fourTurns();
    expect(() => executeSessionRewind(planSessionRewind(workspace, parent, 1), { onlyClean: false, platform: "win32" })).toThrow(/cannot rewind files here \(a folder cannot be pinned on Windows\)/);
    expect(unfinishedRewindOf(workspace, parent)).toBe(null);
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line: unknown) => { errors.push(String(line)); });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const tty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    let asked = 0;
    try {
      const program = new Command().exitOverride();
      registerSessionRewindCommand(program.command("session"), () => { asked++; return Promise.resolve("rewind"); }, "win32");
      for (const marker of AGENT_ENV_MARKERS) vi.stubEnv(marker, "");
      await program.parseAsync(["session", "rewind", parent, "--to-turn", "1"], { from: "user" });
    } finally {
      if (tty) Object.defineProperty(process.stdin, "isTTY", tty); else Reflect.deleteProperty(process.stdin, "isTTY");
      process.exitCode = undefined;
      vi.restoreAllMocks();
    }
    expect(errors.join("\n")).toContain("cannot rewind files here");
    expect(asked).toBe(0);
    expect(readFileSync(out("note.txt"), "utf8")).toBe("v2\n");
  }, 120_000);
});

describe("A file name with a backslash (a plain character on macOS and Linux)", () => {
  it("is put back and removed by a rewind, inside the workspace", async () => {
    // MUTATION: refuse "\\" in pinnedDirectory.ts own() and both results are "failed".
    writeFileSync(out("a\\b.txt"), "v0\n");
    const edited = await run([scripted("fs.read", { path: "workspace/output/a\\b.txt" }), scripted("fs.write", { path: "workspace/output/a\\b.txt", content: "v1\n" })]);
    expect(executeSessionRewind(planSessionRewind(workspace, edited, 1), { onlyClean: false }).results.map((result) => result.status)).toEqual(["restored"]);
    expect(readFileSync(out("a\\b.txt"), "utf8")).toBe("v0\n");
    const created = await run([scripted("fs.write", { path: "workspace/output/c\\d.txt", content: "created\n" }), scripted("fs.read", { path: "workspace/output/note.txt" })]);
    expect(executeSessionRewind(planSessionRewind(workspace, created, 0), { onlyClean: false }).results.map((result) => result.status)).toEqual(["removed"]);
    expect(readdirSync(join(workspace, "workspace", "output")).sort()).toEqual(["a\\b.txt", "note.txt"]);
    expect(process.cwd()).toBe(workspace);
  }, 120_000);
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
