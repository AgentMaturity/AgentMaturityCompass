import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { agentToolset, checkToolsetReadiness } from "../src/agent/agentToolset.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { SessionService } from "../src/session/sessionService.js";
import { fileChangesOf } from "../src/tools/toolEvidence.js";
import { defaultToolsConfig, type ToolDefinition } from "../src/toolhub/toolsSchema.js";
import { initToolsConfig, loadVerifiedToolsConfigSnapshot } from "../src/toolhub/toolhubValidators.js";
import { sha256Hex } from "../src/utils/hash.js";
import { initWorkspaceWithoutActionPolicy } from "./helpers/actionPolicyFixtures.js";

/**
 * SH-TOOLS-06c: the file-change carrier reaches the audit row's meta through the real surface (agentToolset with a
 * SessionService recorder), where resumeRules reads it; and the operator's write scope names every path-scoped
 * writing tool, not two names. Also the apply_patch path-policy projection (SH-TOOLS-01): the guard sees the paths
 * inside `patch` and denies before the body.
 */
const cleanups: Array<() => void> = [];
afterEach(() => { try { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); } finally { vi.unstubAllEnvs(); } });

const scoped = (name: string, actionClass: ToolDefinition["actionClass"], paths: string[]): ToolDefinition => ({ name, actionClass, allow: { paths } });

function fixture(grants: ToolDefinition[]) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-file-change-carrier-")));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const workspace = join(root, "project"); mkdirSync(workspace);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-file-change-fixture-only");
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "control-checkpoints"));
  initWorkspaceWithoutActionPolicy({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initBudgets(workspace, "default"); writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  const config = defaultToolsConfig(); config.tools.allowedTools = grants; config.tools.denyByDefault = true;
  initToolsConfig(workspace, config);
  const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
  mkdirSync(join(workspace, "workspace"), { recursive: true });
  writeFileSync(join(workspace, "workspace", "note.txt"), "before\n");
  const session = new SessionService(workspace);
  cleanups.push(() => session.disposeWithoutClosing());
  session.open({ agentId: "default", harnessVersion: "file-change-fixture", compositionDigest: "fixture", policyDigest: snapshot.digestSha256! });
  session.startTurn({ trigger: "user" }); session.startStep();
  const tools = agentToolset({ workspace, agentId: "default", sessionId: session.sessionId, recorder: session, expectedToolsDigest: snapshot.digestSha256! });
  cleanups.push(() => tools.close());
  let sequence = 0;
  const call = (toolName: string, args: object) => tools.seam.execute({ callId: `carrier-${++sequence}`, toolName,
    rawArguments: JSON.stringify(args), sessionId: session.sessionId, turn: 1, step: 1, parentToken: null,
    dispatch: "native", signal: new AbortController().signal });
  const audits = () => session.readEvents().filter((row) => row.event_type === "audit")
    .map((row) => JSON.parse(row.meta_json) as Record<string, unknown>)
    .filter((meta) => typeof meta.auditType === "string" && String(meta.auditType).startsWith("TOOL_CALL_"));
  return { workspace, tools, call, audits };
}

test("a real fs.write's change reaches the audit row meta that resumeRules reads", async () => {
  const f = fixture([scoped("fs.read", "READ_ONLY", ["./workspace/**"]), scoped("fs.write", "WRITE_LOW", ["./workspace/**"])]);
  expect(await f.call("fs.read", { path: "workspace/note.txt" })).toMatchObject({ outcome: "OK" });
  expect(await f.call("fs.write", { path: "workspace/note.txt", content: "after\n" })).toMatchObject({ outcome: "OK" });
  const meta = f.audits().find((row) => row.toolName === "fs.write")!;
  expect(meta.callId).toBe("carrier-2");
  expect(meta.fileChange).toMatchObject({ path: "workspace/note.txt", beforeSha256: sha256Hex("before\n"), afterSha256: sha256Hex("after\n") });
  expect(fileChangesOf(meta)).toHaveLength(1);
  expect(fileChangesOf({})).toEqual([]);
  expect(fileChangesOf({ fileChange: { path: 1 } })).toEqual([]);
  expect(JSON.stringify(meta)).not.toContain("after\\n");
});

test("apply_patch's paths meet the signed path policy before the body, and the write scope names them", async () => {
  const f = fixture([scoped("fs.read", "READ_ONLY", ["./workspace/**"]), scoped("apply_patch", "WRITE_LOW", ["./workspace/out/**"])]);
  expect(f.tools.readiness.writeScope).toEqual(["./workspace/out/**"]);
  expect(checkToolsetReadiness(f.workspace).writeScope).toEqual(["./workspace/out/**"]);
  expect(await f.call("fs.read", { path: "workspace/note.txt" })).toMatchObject({ outcome: "OK" });
  const denied = await f.call("apply_patch", { patch: "*** Begin Patch\n*** Update File: workspace/note.txt\n@@\n-before\n+after\n*** End Patch\n" });
  expect(denied.outcome).toBe("DENIED");
  expect(String(denied.content)).toContain("not in allowlist");
  const unparsable = await f.call("apply_patch", { patch: "not a patch" });
  expect(unparsable.outcome).toBe("DENIED");
  expect(String(unparsable.content)).toContain("path is required");
  const allowed = await f.call("apply_patch", { patch: "*** Begin Patch\n*** Add File: workspace/out/new.txt\n+hi\n*** End Patch\n" });
  expect(allowed.outcome).toBe("OK");
  const meta = f.audits().find((row) => row.toolName === "apply_patch" && row.auditType === "TOOL_CALL_ALLOWED")!;
  expect(fileChangesOf(meta)).toMatchObject([{ path: "workspace/out/new.txt", afterSha256: sha256Hex("hi\n") }]);
  // Denials leave no file change on their rows.
  expect(f.audits().filter((row) => row.auditType === "TOOL_CALL_DENIED").every((row) => fileChangesOf(row).length === 0)).toBe(true);
});
