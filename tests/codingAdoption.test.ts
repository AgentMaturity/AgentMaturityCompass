import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** UX-01: a folder bare `amc` set up moves to the `init --coding` setup in place, by a person, keeping keys and records. */
const faults = vi.hoisted(() => ({ approvalPolicy: false, adoptedRow: false }));
vi.mock("../src/approvals/approvalPolicyEngine.js", async (original) => {
  const real = await original<typeof import("../src/approvals/approvalPolicyEngine.js")>();
  return { ...real, initApprovalPolicy: (...args: Parameters<typeof real.initApprovalPolicy>) => {
    if (faults.approvalPolicy) { faults.approvalPolicy = false; throw new Error("injected crash while writing the approval policy"); }
    return real.initApprovalPolicy(...args);
  } };
});
vi.mock("../src/ops/audit.js", async (original) => {
  const real = await original<typeof import("../src/ops/audit.js")>();
  return { ...real, appendOpsAuditEvent: (params: Parameters<typeof real.appendOpsAuditEvent>[0]) => {
    if (faults.adoptedRow && params.auditType === "WORKSPACE_CODING_SETUP_ADOPTED") { faults.adoptedRow = false; throw new Error("injected crash before the adopted row"); }
    return real.appendOpsAuditEvent(params);
  } };
});

import { defaultApprovalPolicy, initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { listVerifiedUsers, usersConfigPath } from "../src/auth/authApi.js";
import { ensureInstantVaultMode } from "../src/cli/instantVaultMode.js";
import { loadActionPolicy } from "../src/governor/actionPolicyStore.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { appendOpsAuditEvent } from "../src/ops/audit.js";
import { loadRuntimeFirewallPolicy, writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { assertPersonAdopts, codingAdoptionBlockers, CODING_MOVE_PHRASE, prepareCodingAdoption, readTypedLine, type CodingAdoptionIo } from "../src/setup/codingAdoption.js";
import { codingMoveInterrupted } from "../src/setup/codingMove.js";
import { refuseForceOverCommittedKeys, runStarterInit } from "../src/setup/starterProfiles.js";
import { toolsConfigPath } from "../src/toolhub/toolhubValidators.js";
import { sha256Hex } from "../src/utils/hash.js";
import { AGENT_ENV_MARKERS } from "../src/vault/operatorContext.js";
import { localVaultPassphrasePath } from "../src/vault/localPassphrase.js";
import { lockVault, vaultOpensWith } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

const OWNER = { username: "folder-owner", password: "folder-owner-password" };
const NEW_PASSPHRASE = "my own vault passphrase";
const tty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
const dirs: string[] = [];
const temp = (prefix: string): string => { const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix))); dirs.push(dir); return dir; };

/** The answers a person types; `phrase` is what they type at the confirmation. */
function typed(over: { phrase?: string | null; secret?: string; username?: string } = {}): CodingAdoptionIo & { lines: string[] } {
  const lines: string[] = [];
  return { lines, log: (line) => lines.push(line),
    line: async (prompt) => prompt.startsWith("Owner username") ? (over.username ?? OWNER.username) : over.phrase === undefined ? CODING_MOVE_PHRASE : over.phrase,
    secret: async () => over.secret ?? NEW_PASSPHRASE,
    newSecret: async (message) => (message.startsWith("Studio password") ? OWNER.password : NEW_PASSPHRASE) };
}

beforeEach(() => {
  for (const marker of AGENT_ENV_MARKERS) vi.stubEnv(marker, "");
  vi.stubEnv("AMC_NO_SIGN", "");
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
  vi.stubEnv("AMC_HOME", temp("amc-adopt-home-"));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(temp("amc-adopt-ckpt-"), "checkpoints"));
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  faults.approvalPolicy = false; faults.adoptedRow = false;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  if (tty) Object.defineProperty(process.stdin, "isTTY", tty); else delete (process.stdin as { isTTY?: boolean }).isTTY;
  for (const dir of dirs.splice(0)) { try { lockVault(dir); } catch { /* not a workspace */ } rmSync(dir, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** What bare `amc` makes: a vault sealed with a generated passphrase kept in .amc/local-vault-passphrase, and a record. */
function menuWorkspace(): string {
  const dir = temp("amc-adopt-");
  ensureInstantVaultMode(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  appendOpsAuditEvent({ workspace: dir, auditType: "MENU_RECORD_BEFORE_ADOPTION", payload: { note: "an earlier record" } });
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
  return dir;
}

function audits(dir: string, passphrase?: string): Array<{ auditType: string; payload: Record<string, unknown> | null }> {
  if (passphrase !== undefined) vi.stubEnv("AMC_VAULT_PASSPHRASE", passphrase);
  const ledger = openLedger(dir);
  try {
    return ledger.getAllEvents().map((event) => {
      const auditType = (JSON.parse(event.meta_json) as { auditType?: string }).auditType ?? "";
      const read = passphrase === undefined ? null : readEventPayload(dir, event);
      return { auditType, payload: read?.status === "ok" && auditType.startsWith("WORKSPACE_") ? JSON.parse(read.bytes.toString("utf8")) : null };
    });
  } finally { ledger.close(); }
}
const types = (dir: string): string[] => audits(dir).map((row) => row.auditType);
const fileDigest = (path: string): string | null => (existsSync(path) ? sha256Hex(readFileSync(path)) : null);

describe("moving a menu workspace to the coding setup (UX-01)", () => {
  it("a menu workspace has nothing in the way, also after amc up wrote the default approval policy; changed or unreadable ones are named", () => {
    const dir = menuWorkspace();
    expect(codingAdoptionBlockers(dir)).toEqual([]);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", readFileSync(localVaultPassphrasePath(dir), "utf8").trim());
    initApprovalPolicy(dir);
    expect(codingAdoptionBlockers(dir)).toEqual([]);
    const changed = defaultApprovalPolicy();
    initApprovalPolicy(dir, { ...changed, approvalPolicy: { ...changed.approvalPolicy, actionClasses: { ...changed.approvalPolicy.actionClasses,
      WRITE_LOW: { ...changed.approvalPolicy.actionClasses.WRITE_LOW!, requiredApprovals: 2 } } } });
    expect(codingAdoptionBlockers(dir)).toEqual(["its approval policy was changed (.amc/approval-policy.yaml)"]);
    writeFileSync(join(dir, ".amc", "approval-policy.yaml"), "approvalPolicy: {version: 1, junk: true}\n");
    expect(codingAdoptionBlockers(dir)).toEqual(["its approval policy cannot be read (.amc/approval-policy.yaml)"]);
  });

  it("keeps the keys, the earlier records and a verifying chain, and records who moved it, at a terminal, and what was written", async () => {
    const dir = menuWorkspace();
    const monitor = readFileSync(join(dir, ".amc", "keys", "monitor_ed25519.pub"), "utf8");
    const report = await runStarterInit(dir, "coding", false, [], typed());
    expect(report?.readiness.ready).toBe(true);
    expect(readFileSync(join(dir, ".amc", "keys", "monitor_ed25519.pub"), "utf8"), "same monitor key").toBe(monitor);
    const rules = loadActionPolicy(dir).actions.filter((rule) => rule.actionClass === "WRITE_LOW" || rule.actionClass === "WRITE_HIGH");
    expect(rules.map((rule) => rule.executeOnApproval)).toEqual([true, true]);
    expect(existsSync(localVaultPassphrasePath(dir)), "the generated passphrase is gone").toBe(false);
    expect(vaultOpensWith(dir, NEW_PASSPHRASE), "the person's own passphrase opens the vault").toBe(true);
    expect(existsSync(join(dir, ".amc", "coding-move")), "no copies left").toBe(false);
    const rows = audits(dir, NEW_PASSPHRASE);
    expect(rows.map((row) => row.auditType)).toEqual(expect.arrayContaining(["MENU_RECORD_BEFORE_ADOPTION", "WORKSPACE_CODING_SETUP_STARTED", "WORKSPACE_CODING_SETUP_ADOPTED"]));
    const adopted = rows.find((row) => row.auditType === "WORKSPACE_CODING_SETUP_ADOPTED")!.payload!;
    expect(adopted).toMatchObject({ atTerminal: true, osAccount: expect.any(String), owner: OWNER.username });
    expect((adopted.written as Record<string, string | null>)["users.yaml"]).toBe(fileDigest(usersConfigPath(dir)));
    expect((adopted.written as Record<string, string | null>)["action-policy.yaml"]).toBe(fileDigest(join(dir, ".amc", "action-policy.yaml")));
    expect(verifyLedgerIntegrity(dir).ok).toBe(true);
  });

  it("takes every secret typed at the terminal, never from the environment or *_FILE variables", async () => {
    const dir = menuWorkspace();
    const planted = join(temp("amc-adopt-planted-"), "owner");
    writeFileSync(planted, "planted-owner-password", { mode: 0o600 });
    vi.stubEnv("AMC_BOOTSTRAP_OWNER_USERNAME", "planted-owner");
    vi.stubEnv("AMC_BOOTSTRAP_OWNER_PASSWORD", "planted-owner-password");
    vi.stubEnv("AMC_BOOTSTRAP_OWNER_PASSWORD_FILE", planted);
    await runStarterInit(dir, "coding", false, [], typed());
    expect(listVerifiedUsers(dir).users.map((user) => user.username)).toEqual([OWNER.username]);
  });

  it("refuses when AMC recognises an agent or signing is off, and nothing changes", async () => {
    const dir = menuWorkspace();
    vi.stubEnv("CLAUDECODE", "1");
    await expect(runStarterInit(dir, "coding", false, [], typed())).rejects.toThrow("this shell carries the agent marker CLAUDECODE");
    vi.stubEnv("CLAUDECODE", "");
    expect(() => assertPersonAdopts(dir, {}, { isTTY: false })).toThrow("stdin is not a terminal");
    vi.stubEnv("AMC_NO_SIGN", "1");
    await expect(runStarterInit(dir, "coding", false, [], typed())).rejects.toThrow("AMC_NO_SIGN=1 turns signing off");
    expect(existsSync(usersConfigPath(dir))).toBe(false);
    expect(existsSync(localVaultPassphrasePath(dir))).toBe(true);
    expect(types(dir)).not.toContain("WORKSPACE_CODING_SETUP_STARTED");
  });

  it.each([["y"], [""], ["yes"], ["move"], [null]])("typing %j instead of the phrase writes nothing", async (answer) => {
    const dir = menuWorkspace();
    const tools = fileDigest(toolsConfigPath(dir));
    expect(await runStarterInit(dir, "coding", false, [], typed({ phrase: answer }))).toBeNull();
    expect(existsSync(usersConfigPath(dir))).toBe(false);
    expect(fileDigest(toolsConfigPath(dir))).toBe(tools);
    expect(types(dir)).not.toContain("WORKSPACE_CODING_SETUP_STARTED");
  });

  it("the confirmation is read from the terminal as typed: an empty line or the end of input is no, only the phrase is yes", async () => {
    const answer = async (input: string | null) => {
      const stream = new PassThrough();
      const reading = readTypedLine("> ", stream, new PassThrough());
      if (input === null) stream.end(); else stream.write(input);
      return reading;
    };
    expect(await answer("\n")).toBe("");
    expect(await answer(null)).toBeNull();
    expect(await answer(`${CODING_MOVE_PHRASE}\n`)).toBe(CODING_MOVE_PHRASE);
    const dir = menuWorkspace();
    const stream = new PassThrough();
    const io = { ...typed(), line: (prompt: string) => prompt.startsWith("To move") ? readTypedLine(prompt, stream, new PassThrough()) : typed().line(prompt) };
    const running = runStarterInit(dir, "coding", false, [], io);
    stream.write("\n");
    expect(await running, "Enter alone").toBeNull();
    expect(existsSync(usersConfigPath(dir))).toBe(false);
  });

  it("says a moved folder already has the coding setup", async () => {
    const dir = menuWorkspace();
    await runStarterInit(dir, "coding", false, [], typed());
    const again = typed();
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    expect(await runStarterInit(dir, "coding", false, [], again)).toBeNull();
    expect(again.lines.join("\n")).toContain("This folder already has the coding setup.");
  });

  it("keeps a firewall policy the folder already had", async () => {
    const dir = menuWorkspace();
    vi.stubEnv("AMC_VAULT_PASSPHRASE", readFileSync(localVaultPassphrasePath(dir), "utf8").trim());
    writeRuntimeFirewallPolicy({ workspace: dir, mode: "block" });
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    expect((await runStarterInit(dir, "coding", false, [], typed()))?.firewallMode).toBe("block");
    expect(loadRuntimeFirewallPolicy(dir)?.mode).toBe("block");
  });

  it("with the person's own passphrase: it is typed; a wrong one is refused before anything is written", async () => {
    const dir = temp("amc-adopt-own-");
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "the person's own passphrase");
    initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
    lockVault(dir);
    const tools = readFileSync(toolsConfigPath(dir), "utf8");
    // Left in the environment on purpose: the move never takes it from there.
    await expect(runStarterInit(dir, "coding", false, [], typed({ secret: "a wrong passphrase" }))).rejects.toThrow("That passphrase does not open this folder's vault. Nothing was changed.");
    expect(readFileSync(toolsConfigPath(dir), "utf8")).toBe(tools);
    expect((await runStarterInit(dir, "coding", false, [], typed({ secret: "the person's own passphrase" })))?.readiness.ready).toBe(true);
  });

  it("refuses a copy whose keys another computer created", () => {
    const dir = menuWorkspace();
    vi.stubEnv("AMC_HOME", temp("amc-adopt-other-machine-"));
    expect(codingAdoptionBlockers(dir)).toEqual(["this computer did not create its keys (a copy or a clone)"]);
  });
});

describe("the questions before a move (prepareCodingAdoption)", () => {
  /** A person whose new secrets go through the prompt's own check, as inquirer's validate does; a refused entry is typed again as `retry`. */
  function checked(answers: { vault?: [string, string]; studio?: [string, string]; refused?: string[] } = {}): CodingAdoptionIo {
    const refused = answers.refused ?? [];
    return { ...typed(), newSecret: async (message, problem) => {
      const [first, second] = message.startsWith("Studio password") ? answers.studio ?? [OWNER.password, OWNER.password] : answers.vault ?? [NEW_PASSPHRASE, NEW_PASSPHRASE];
      for (const attempt of ["short", first]) { const why = problem(attempt); if (why !== null) refused.push(`${message}: ${why}`); }
      return first === second ? first : null;
    } };
  }

  it("asks for a new vault passphrase of at least 8 characters and an owner password the password policy accepts", async () => {
    const dir = menuWorkspace();
    const refused: string[] = [];
    const adoption = await prepareCodingAdoption(dir, ["example.org"], checked({ refused }));
    expect(adoption).toMatchObject({ passphrase: { next: NEW_PASSPHRASE }, owner: OWNER });
    expect(refused[0]).toBe("New vault passphrase: At least 8 characters");
    expect(refused[1]).toMatch(/^Studio password for folder-owner: /);
    expect(refused).toHaveLength(2);
  });

  it("stops, writing nothing, when two entries differ or the owner password is refused", async () => {
    const dir = menuWorkspace();
    const tools = readFileSync(toolsConfigPath(dir), "utf8");
    await expect(prepareCodingAdoption(dir, [], checked({ vault: [NEW_PASSPHRASE, "something else"] }))).rejects.toThrow("New vault passphrase: the two entries differ. Nothing was changed.");
    await expect(prepareCodingAdoption(dir, [], checked({ studio: [OWNER.password, "other"] }))).rejects.toThrow("Studio password: the two entries differ. Nothing was changed.");
    await expect(prepareCodingAdoption(dir, [], checked({ studio: ["folder-owner", "folder-owner"] }))).rejects.toThrow(/^The owner's Studio password is refused: .+\. Nothing was changed\.$/);
    expect(readFileSync(toolsConfigPath(dir), "utf8")).toBe(tools);
  });

  it("says the person stopped at the prompt when a prompt is closed", async () => {
    const dir = menuWorkspace();
    const closed = Object.assign(new Error("User force closed the prompt"), { name: "ExitPromptError" });
    await expect(prepareCodingAdoption(dir, [], { ...typed(), newSecret: async () => { throw closed; } })).rejects.toThrow("Stopped at the prompt. Nothing was changed.");
  });

  it("names every file in the way and refuses before asking anything", async () => {
    const dir = menuWorkspace();
    writeFileSync(usersConfigPath(dir), "users: []\n");
    const io = typed();
    await expect(prepareCodingAdoption(dir, [], io)).rejects.toThrow("This folder cannot move to the coding setup in place: it already has accounts (.amc/users.yaml). Nothing was changed. "
      + "Use a new folder for the coding setup, or keep this one as it is.");
    expect(io.lines).toEqual([]);
    expect(codingAdoptionBlockers(temp("amc-adopt-empty-"))).toEqual(["its .amc folder is not a complete AMC workspace"]);
  });

  it("refuses a workspace whose settings use another profile, or cannot be read", () => {
    const dir = menuWorkspace();
    const config = join(dir, ".amc", "amc.config.yaml");
    const original = readFileSync(config, "utf8");
    writeFileSync(config, original.replace(/^(\s*profile:\s*).*$/m, "$1prod"));
    expect(codingAdoptionBlockers(dir)).toEqual(["its settings use another profile (.amc/amc.config.yaml)"]);
    writeFileSync(config, "{ not yaml: [\n");
    expect(codingAdoptionBlockers(dir)).toEqual(["its settings cannot be read (.amc/amc.config.yaml)"]);
  });

  it("at a terminal, each secret is a masked prompt checked as typed, and a new one is asked twice", async () => {
    const asked: Array<{ message: string; mask: string; validate?: (value: string) => string | true }> = [];
    const answers = ["first", "first", "one", "two", "plain"];
    vi.resetModules();
    vi.doMock("inquirer", () => ({ default: { prompt: async ([question]: Array<(typeof asked)[number]>) => { asked.push(question!); return { value: answers.shift() }; } } }));
    try {
      const { terminalAdoptionIo } = await import("../src/setup/codingAdoption.js");
      expect(await terminalAdoptionIo.newSecret("New vault passphrase", (v) => v.length >= 8 ? null : "At least 8 characters")).toBe("first");
      expect(await terminalAdoptionIo.newSecret("New vault passphrase", () => null)).toBeNull();
      expect(await terminalAdoptionIo.secret("This folder's vault passphrase")).toBe("plain");
      expect(asked.map((question) => question.message)).toEqual(["New vault passphrase", "New vault passphrase (again)", "New vault passphrase", "New vault passphrase (again)", "This folder's vault passphrase"]);
      expect(asked.every((question) => question.mask === "*")).toBe(true);
      expect(asked[0]!.validate!("short")).toBe("At least 8 characters");
      expect(asked[0]!.validate!("long enough")).toBe(true);
      expect(asked[1]!.validate).toBeUndefined();
      terminalAdoptionIo.log("a line for the person");
      expect(console.log).toHaveBeenCalledWith("a line for the person");
    } finally { vi.doUnmock("inquirer"); vi.resetModules(); }
  });
});

describe("a move that stops half way (review MEDIUM-2)", () => {
  it("is found, and the earlier files are put back from the copies the signed started row names; then the move can run again", async () => {
    const dir = menuWorkspace();
    const files = ["tools.yaml", "tools.yaml.sig", "action-policy.yaml", "action-policy.yaml.sig", "amc.config.yaml", "amc.config.yaml.sig"].map((name) => join(dir, ".amc", name));
    const before = files.map(fileDigest);
    faults.approvalPolicy = true;
    await expect(runStarterInit(dir, "coding", false, [], typed())).rejects.toThrow("injected crash");
    expect(codingMoveInterrupted(dir)).toBe(true);
    expect(existsSync(usersConfigPath(dir)), "half written").toBe(true);
    const recovery = typed();
    expect(await runStarterInit(dir, "coding", false, [], recovery)).toBeNull();
    expect(recovery.lines.join("\n")).toContain("did not finish");
    expect(recovery.lines.join("\n")).toContain("The earlier files are back");
    expect(files.map(fileDigest)).toEqual(before);
    expect(existsSync(usersConfigPath(dir))).toBe(false);
    expect(codingMoveInterrupted(dir)).toBe(false);
    expect(types(dir)).toContain("WORKSPACE_CODING_SETUP_PUT_BACK");
    expect(codingAdoptionBlockers(dir)).toEqual([]);
    expect((await runStarterInit(dir, "coding", false, [], typed()))?.readiness.ready).toBe(true);
    expect(verifyLedgerIntegrity(dir).ok).toBe(true);
  });

  it("after the passphrase change (the last write), it is recorded as finished", async () => {
    const dir = menuWorkspace();
    faults.adoptedRow = true;
    await expect(runStarterInit(dir, "coding", false, [], typed())).rejects.toThrow("injected crash before the adopted row");
    expect(codingMoveInterrupted(dir)).toBe(true);
    const recovery = typed({ secret: NEW_PASSPHRASE });
    await runStarterInit(dir, "coding", false, [], recovery);
    expect(recovery.lines.join("\n")).toContain("now recorded as finished");
    expect(codingMoveInterrupted(dir)).toBe(false);
    expect(types(dir)).toContain("WORKSPACE_CODING_SETUP_ADOPTED");
  });

  it("a copy that does not match the signed started row is not put back", async () => {
    const dir = menuWorkspace();
    faults.approvalPolicy = true;
    await expect(runStarterInit(dir, "coding", false, [], typed())).rejects.toThrow("injected crash");
    writeFileSync(join(dir, ".amc", "coding-move", "tools.yaml"), "tools: planted\n");
    await expect(runStarterInit(dir, "coding", false, [], typed())).rejects.toThrow("does not match the signed started record");
  });
});

describe("--force where this machine committed the folder's keys (UX-29)", () => {
  it("is refused before anything is deleted, because AMC would then refuse to set the folder up again", async () => {
    const dir = menuWorkspace();
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "an operator passphrase");
    vi.stubEnv("AMC_BOOTSTRAP_OWNER_USERNAME", OWNER.username);
    vi.stubEnv("AMC_BOOTSTRAP_OWNER_PASSWORD", OWNER.password);
    await expect(runStarterInit(dir, "coding", true)).rejects.toThrow("Nothing was deleted.");
    expect(existsSync(join(dir, ".amc", "keys", "monitor_ed25519.pub"))).toBe(true);
    expect(types(dir)).toContain("MENU_RECORD_BEFORE_ADOPTION");
    expect(() => refuseForceOverCommittedKeys(temp("amc-no-workspace-")), "a folder without .amc has nothing to protect").not.toThrow();
  });
});
