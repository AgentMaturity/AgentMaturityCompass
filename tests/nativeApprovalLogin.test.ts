import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { addUser, initUsersConfig, revokeUser, usersConfigPath, usersConfigSigPath, verifyTrackedSessionToken } from "../src/auth/authApi.js";
import { loginNativeApprovals } from "../src/approvals/nativeApprovalLogin.js";
import { readNativeApprovalPasswordFromStdin, registerNativeApprovalLoginCommands } from "../src/approvals/nativeApprovalLoginCli.js";
import { readNativeApprovalActor } from "../src/setup/nativeApprovalIdentity.js";

// Authored for the deferred combined run. Authentication, signing, session
// tracking and filesystem operations remain real; only final output-sync faults
// are injected so rollback has to revoke an actually minted local session.
const outputFault = vi.hoisted(() => ({ onSync: undefined as (() => void) | undefined }));
vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, fsyncSync(fd: number) { outputFault.onSync?.(); return actual.fsyncSync(fd); } };
});
const roots: string[] = [];
const password = "fixture-approval-password-not-for-output";
beforeEach(() => { vi.stubEnv("AMC_VAULT_PASSPHRASE", "native-login-fixture-passphrase"); outputFault.onSync = undefined; });
afterEach(() => {
  outputFault.onSync = undefined; vi.restoreAllMocks(); vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-native-login-"))); roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initUsersConfig({ workspace, username: "administrator", password: "admin-fixture-password" });
  const user = addUser({ workspace, username: "reviewer", roles: ["APPROVER"], password });
  return { workspace, user, tokenFile: join(workspace, "reviewer.session") };
}
function sessionRecords(workspace: string): Array<{ revoked: boolean; userId: string; authSource: string }> {
  const directory = join(workspace, ".amc", "studio", "sessions");
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter(name => name.endsWith(".json")).map(name => JSON.parse(readFileSync(join(directory, name), "utf8")));
}
async function* chunks(...values: Array<Buffer | string>) { yield* values; }

describe("native approval login preserves existing authenticated authority", () => {
  it("creates a private tracked local session usable by the real approval helper, without returning its token", async () => {
    const f = fixture();
    const receipt = await loginNativeApprovals({ ...f, username: "reviewer" }, async () => password);
    const token = readFileSync(f.tokenFile, "utf8").trim();
    expect(receipt).toMatchObject({ authSource: "LOCAL_USER", userId: f.user.userId, username: "reviewer", roles: ["APPROVER"], tokenFile: f.tokenFile });
    expect(receipt.expiresTs - receipt.issuedTs).toBe(15 * 60_000);
    expect(verifyTrackedSessionToken({ workspace: f.workspace, token })).toMatchObject({ ok: true, authSource: "LOCAL_USER", payload: { userId: f.user.userId, roles: ["APPROVER"] } });
    expect(readNativeApprovalActor(f.workspace, f.tokenFile)).toMatchObject({ userId: f.user.userId, username: "reviewer", roles: ["APPROVER"] });
    expect(Object.keys(receipt)).not.toContain("token");
    expect(JSON.stringify(receipt)).not.toContain(token);
    expect(JSON.stringify(receipt)).not.toContain(password);
    if (process.platform !== "win32") expect(lstatSync(f.tokenFile).mode & 0o777).toBe(0o600);
  });

  it.each([5, 60])("uses the exact supported %i-minute lifetime", async ttlMinutes => {
    const f = fixture();
    const receipt = await loginNativeApprovals({ ...f, username: "reviewer", ttlMinutes }, async () => password);
    expect(receipt.expiresTs - receipt.issuedTs).toBe(ttlMinutes * 60_000);
  });

  it.each([4, 61, 5.5, NaN])("refuses invalid TTL %s before reading a password or creating a session", async ttlMinutes => {
    const f = fixture(), reader = vi.fn(async () => password);
    await expect(loginNativeApprovals({ ...f, username: "reviewer", ttlMinutes }, reader)).rejects.toMatchObject({ code: "TTL_INVALID" });
    expect(reader).not.toHaveBeenCalled(); expect(existsSync(f.tokenFile)).toBe(false); expect(sessionRecords(f.workspace)).toEqual([]);
  });

  it.each(["wrong password", "missing user", "revoked user", "unsigned users", "changed users"])("refuses %s without minting a fallback identity", async condition => {
    const f = fixture();
    if (condition === "revoked user") revokeUser({ workspace: f.workspace, username: "reviewer" });
    if (condition === "unsigned users") rmSync(usersConfigSigPath(f.workspace));
    if (condition === "changed users") writeFileSync(usersConfigPath(f.workspace), `${readFileSync(usersConfigPath(f.workspace), "utf8")}\n# unsigned edit\n`);
    await expect(loginNativeApprovals({ ...f, username: condition === "missing user" ? "absent" : "reviewer" }, async () => condition === "wrong password" ? "wrong-secret-canary" : password)).rejects.toMatchObject({ code: "LOGIN_REFUSED" });
    expect(existsSync(f.tokenFile)).toBe(false); expect(sessionRecords(f.workspace)).toEqual([]);
  });

  it("refuses a preexisting destination before prompting and preserves its contents", async () => {
    const f = fixture(), reader = vi.fn(async () => password);
    writeFileSync(f.tokenFile, "preexisting private data", { mode: 0o600 });
    await expect(loginNativeApprovals({ ...f, username: "reviewer" }, reader)).rejects.toMatchObject({ code: "TOKEN_FILE_EXISTS" });
    expect(reader).not.toHaveBeenCalled(); expect(readFileSync(f.tokenFile, "utf8")).toBe("preexisting private data"); expect(sessionRecords(f.workspace)).toEqual([]);
  });

  it("refuses a destination created while the password prompt is pending", async () => {
    const f = fixture();
    await expect(loginNativeApprovals({ ...f, username: "reviewer" }, async () => { writeFileSync(f.tokenFile, "other writer"); return password; })).rejects.toMatchObject({ code: "TOKEN_FILE_EXISTS" });
    expect(readFileSync(f.tokenFile, "utf8")).toBe("other writer"); expect(sessionRecords(f.workspace)).toEqual([]);
  });

  it("does not follow an existing token symlink", async () => {
    const f = fixture(), original = join(f.workspace, "existing-secret"), reader = vi.fn(async () => password);
    writeFileSync(original, "private original", { mode: 0o600 }); symlinkSync(original, f.tokenFile);
    await expect(loginNativeApprovals({ ...f, username: "reviewer" }, reader)).rejects.toMatchObject({ code: "TOKEN_FILE_EXISTS" });
    expect(reader).not.toHaveBeenCalled(); expect(readFileSync(original, "utf8")).toBe("private original"); expect(sessionRecords(f.workspace)).toEqual([]);
  });

  it("resolves a directory alias and returns the actual private output path", async () => {
    const f = fixture(), alias = join(f.workspace, "directory-alias");
    symlinkSync(f.workspace, alias, "dir");
    const receipt = await loginNativeApprovals({ ...f, username: "reviewer", tokenFile: join(alias, "reviewer.session") }, async () => password);
    expect(receipt.tokenFile).toBe(f.tokenFile);
    expect(readNativeApprovalActor(f.workspace, receipt.tokenFile)).toMatchObject({ userId: f.user.userId, roles: ["APPROVER"] });
  });

  it("revokes the minted session and removes its own output on a write durability failure", async () => {
    const f = fixture();
    outputFault.onSync = () => { throw new Error("private-filesystem-diagnostic-canary"); };
    await expect(loginNativeApprovals({ ...f, username: "reviewer" }, async () => password)).rejects.toMatchObject({ code: "LOGIN_FAILED" });
    expect(existsSync(f.tokenFile)).toBe(false);
    expect(sessionRecords(f.workspace)).toEqual([expect.objectContaining({ revoked: true, userId: f.user.userId, authSource: "LOCAL_USER" })]);
  });

  it("revokes after output replacement without deleting the replacement file", async () => {
    const f = fixture(), movedOutput = join(f.workspace, "moved-login-output");
    outputFault.onSync = () => { renameSync(f.tokenFile, movedOutput); writeFileSync(f.tokenFile, "replacement belongs to someone else"); };
    await expect(loginNativeApprovals({ ...f, username: "reviewer" }, async () => password)).rejects.toMatchObject({ code: "TOKEN_FILE_CHANGED" });
    expect(readFileSync(f.tokenFile, "utf8")).toBe("replacement belongs to someone else");
    expect(readFileSync(movedOutput, "utf8")).toBe("");
    expect(sessionRecords(f.workspace)).toEqual([expect.objectContaining({ revoked: true })]);
  });
});

describe("approval login CLI and explicit password input", () => {
  function cli(workspace: string, input = password) {
    vi.spyOn(process, "cwd").mockReturnValue(workspace);
    const output: string[] = [], fail = vi.fn(), reader = vi.fn(async () => input);
    const program = new Command().exitOverride().configureOutput({ writeErr: () => {} });
    registerNativeApprovalLoginCommands(program.command("approvals"), { log: text => output.push(text), error: text => output.push(text), fail, readPassword: reader });
    return { program, output, fail, reader };
  }
  it("parses the public command and prints only actual identity, expiry and path metadata", async () => {
    const f = fixture(), c = cli(f.workspace);
    await c.program.parseAsync(["approvals", "login", "--username", "reviewer", "--token-file", "new session.txt", "--ttl-minutes", "5", "--password-stdin", "--json"], { from: "user" });
    expect(c.fail).not.toHaveBeenCalled(); expect(c.reader).toHaveBeenCalledWith(true);
    const path = join(f.workspace, "new session.txt"), token = readFileSync(path, "utf8").trim();
    expect(JSON.parse(c.output.join(""))).toMatchObject({ ok: true, userId: f.user.userId, username: "reviewer", roles: ["APPROVER"], authSource: "LOCAL_USER", tokenFile: path });
    expect(c.output.join("\n")).not.toContain(token); expect(c.output.join("\n")).not.toContain(password);
  });
  it("reports a failed login without the password, raw diagnostics or a success claim", async () => {
    const f = fixture(), c = cli(f.workspace, "wrong-secret-canary");
    await c.program.parseAsync(["approvals", "login", "--username", "reviewer", "--token-file", f.tokenFile, "--json"], { from: "user" });
    expect(c.fail).toHaveBeenCalledOnce(); expect(c.reader).toHaveBeenCalledWith(false);
    expect(JSON.parse(c.output.join(""))).toMatchObject({ ok: false, code: "LOGIN_REFUSED" });
    expect(c.output.join("\n")).not.toContain("wrong-secret-canary"); expect(existsSync(f.tokenFile)).toBe(false);
  });
  it("rejects password arguments before invoking the password reader", async () => {
    const f = fixture(), c = cli(f.workspace);
    await expect(c.program.parseAsync(["approvals", "login", "--username", "reviewer", "--token-file", f.tokenFile, "--password", "argv-secret-canary"], { from: "user" })).rejects.toMatchObject({ code: "commander.unknownOption" });
    expect(c.reader).not.toHaveBeenCalled(); expect(sessionRecords(f.workspace)).toEqual([]); expect(c.output.join("\n")).not.toContain("argv-secret-canary");
  });
  it("preserves password whitespace and removes only one optional terminal line ending", async () => {
    expect(await readNativeApprovalPasswordFromStdin(chunks("  exact ", Buffer.from("password  \r\n")))).toBe("  exact password  ");
    expect(await readNativeApprovalPasswordFromStdin(chunks("password\n\n"))).toBe("password\n");
    expect(await readNativeApprovalPasswordFromStdin(chunks("x".repeat(4096), "\r\n"))).toHaveLength(4096);
  });
  it("rejects over-limit UTF-8 bytes and invalid encoding without echoing the input", async () => {
    await expect(readNativeApprovalPasswordFromStdin(chunks("é".repeat(2049)))).rejects.toMatchObject({ code: "PASSWORD_LIMIT" });
    await expect(readNativeApprovalPasswordFromStdin(chunks(Buffer.from([0xc3, 0x28])))).rejects.toMatchObject({ code: "PASSWORD_ENCODING" });
    let requested = 0;
    async function* oversized() { requested++; yield Buffer.alloc(4099, 120); requested++; yield "not-consumed"; }
    await expect(readNativeApprovalPasswordFromStdin(oversized())).rejects.toMatchObject({ code: "PASSWORD_LIMIT" });
    expect(requested).toBe(1);
  });
});
