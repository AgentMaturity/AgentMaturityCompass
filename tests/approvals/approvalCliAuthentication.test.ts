import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { initActionPolicy } from "../../src/governor/actionPolicyEngine.js";
import { initToolsConfig } from "../../src/toolhub/toolhubValidators.js";
import { initBudgets } from "../../src/budgets/budgets.js";
import { addUser, createSession, initUsersConfig } from "../../src/auth/authApi.js";
import { approvalStatusPayload, createApprovalForIntent } from "../../src/approvals/approvalEngine.js";
import { approvalRequestBindingDigest, listApprovalDecisions } from "../../src/approvals/approvalChainStore.js";
import { registerApprovalCliCommands } from "../../src/approvals/approvalCliCommands.js";

/**
 * H-1: a decision that can satisfy an EXECUTE gate (the native agent-loop gate among them) must come from an
 * authenticated reviewer. `--username/--roles` without `--session-token-file` is self-asserted and may not approve
 * EXECUTE; it may still deny or approve SIMULATE, which never count toward an EXECUTE quorum.
 */
const roots: string[] = [];
const startCwd = process.cwd();
afterEach(() => {
  process.chdir(startCwd);
  process.exitCode = 0;
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  process.env["AMC_VAULT_PASSPHRASE"] = "amc-approval-cli-auth-passphrase";
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-approval-cli-auth-")));
  roots.push(root);
  const workspace = join(root, "ws");
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initActionPolicy(workspace);
  initToolsConfig(workspace);
  initBudgets(workspace, "default");
  initUsersConfig({ workspace, username: "fixture-owner", password: "fixture-owner-password" });
  const created = createApprovalForIntent({ workspace, agentId: "default", intentId: "native-intent-1", toolName: "fs.write",
    actionClass: "WRITE_HIGH", requestedMode: "EXECUTE", effectiveMode: "EXECUTE", riskTier: "high", intentPayload: { path: "out.txt" } });
  const login = (username: string) => {
    const user = addUser({ workspace, username, roles: ["APPROVER"], password: `${username}-fixture-password` });
    const tokenFile = join(root, `${username}.token`);
    writeFileSync(tokenFile, createSession({ workspace, user }).token, { mode: 0o600 });
    return { user, tokenFile };
  };
  process.chdir(workspace);
  return { workspace, id: created.request.approvalRequestId, digest: approvalRequestBindingDigest(created.request), login };
}

async function cli(...args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerApprovalCliCommands(program);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  await program.parseAsync(["approvals", ...args], { from: "user" });
}

const forged = (id: string, username: string) =>
  cli("approve", "--agent", "default", "--mode", "execute", "--reason", "smoke", "--username", username, "--roles", "OWNER", id);

describe("approval decisions from the CLI", () => {
  it("refuses a self-asserted EXECUTE approval and names the authenticated command", async () => {
    const f = fixture();
    await expect(forged(f.id, "mallory")).rejects.toThrow(/amc approvals login.*--session-token-file/s);
    expect(listApprovalDecisions({ workspace: f.workspace, agentId: "default", approvalRequestId: f.id })).toHaveLength(0);
  });

  it("two forged usernames cannot meet quorum", async () => {
    const f = fixture();
    await expect(forged(f.id, "mallory")).rejects.toThrow();
    await expect(forged(f.id, "eve")).rejects.toThrow();
    expect(approvalStatusPayload({ workspace: f.workspace, agentId: "default", approvalId: f.id }).quorum).toMatchObject({ status: "PENDING", received: 0 });
  });

  it("authenticated decisions record and meet quorum", async () => {
    const f = fixture();
    for (const name of ["ada", "grace"]) {
      const { user, tokenFile } = f.login(name);
      await cli("approve", "--agent", "default", "--mode", "execute", "--reason", "reviewed", "--user-id", user.userId,
        "--username", name, "--roles", "APPROVER", "--session-token-file", tokenFile, "--expect-request-digest", f.digest, f.id);
    }
    expect(approvalStatusPayload({ workspace: f.workspace, agentId: "default", approvalId: f.id }).quorum).toMatchObject({ status: "QUORUM_MET", received: 2 });
  });

  it("keeps the self-asserted path for deny (fail-safe, never counts toward quorum)", async () => {
    const f = fixture();
    await cli("deny", "--agent", "default", "--reason", "no", "--username", "mallory", "--roles", "OWNER", f.id);
    expect(approvalStatusPayload({ workspace: f.workspace, agentId: "default", approvalId: f.id }).status).toBe("DENIED");
  });
});
