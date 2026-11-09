import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { agentToolset, checkToolsetReadiness } from "../src/agent/agentToolset.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { SessionService } from "../src/session/sessionService.js";
import { fileChangesOf } from "../src/tools/toolEvidence.js";
import { defaultToolsConfig, type ToolDefinition } from "../src/toolhub/toolsSchema.js";
import { initToolsConfig, loadVerifiedToolsConfigSnapshot } from "../src/toolhub/toolhubValidators.js";
import { sha256Hex } from "../src/utils/hash.js";
import { initWorkspaceWithoutActionPolicy } from "./helpers/actionPolicyFixtures.js";

/**
 * SH-TOOLS-06c: the file-change carrier reaches the audit row's payload through the real surface (agentToolset with a
 * SessionService recorder), where resumeRules reads it, and never the row's plain meta; and the operator's write scope names every path-scoped
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
  const rows = () => session.readEvents().filter((row) => row.event_type === "audit"
    && String((JSON.parse(row.meta_json) as Record<string, unknown>).auditType).startsWith("TOOL_CALL_"));
  const audits = () => rows().map((row) => JSON.parse(row.meta_json) as Record<string, unknown>);
  /** The same rows' payloads, read back the way resumeRules reads them. */
  const payloads = () => rows().map((row) => {
    const read = readEventPayload(workspace, row);
    if (read.status !== "ok") throw new Error(`payload of ${row.id} is ${read.status}`);
    return JSON.parse(read.bytes.toString("utf8")) as Record<string, unknown>;
  });
  return { workspace, tools, call, audits, payloads };
}

test("a real fs.write's change reaches the audit payload that resumeRules reads, and nothing about the file reaches the plain meta", async () => {
  const f = fixture([scoped("fs.read", "READ_ONLY", ["./workspace/**"]), scoped("fs.write", "WRITE_LOW", ["./workspace/**"])]);
  expect(await f.call("fs.read", { path: "workspace/note.txt" })).toMatchObject({ outcome: "OK" });
  expect(await f.call("fs.write", { path: "workspace/note.txt", content: "after\n" })).toMatchObject({ outcome: "OK" });
  const meta = f.audits().find((row) => row.toolName === "fs.write")!;
  expect(meta.callId).toBe("carrier-2");
  // Ledger-row meta is stored unencrypted: no file name and no content digest, which a short protected file could be
  // brute-forced from. The change lives in the payload, encrypted at rest, bound to the row's signed digest.
  expect(meta).not.toHaveProperty("fileChange");
  expect(meta).not.toHaveProperty("fileChanges");
  for (const plain of ["note.txt", sha256Hex("before\n"), sha256Hex("after\n")]) expect(JSON.stringify(meta)).not.toContain(plain);
  const payload = f.payloads().find((row) => row.tool === "fs.write")!;
  expect(fileChangesOf(payload)).toMatchObject([{ path: "workspace/note.txt", beforeSha256: sha256Hex("before\n"), afterSha256: sha256Hex("after\n") }]);
  expect(fileChangesOf({ fileChanges: [{ path: "workspace/note.txt", beforeSha256: null, afterSha256: sha256Hex("after\n") }] })).toHaveLength(1);
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
  expect(JSON.stringify(meta)).not.toContain("new.txt");
  const payload = f.payloads().find((row) => row.tool === "apply_patch" && row.auditType === "TOOL_CALL_ALLOWED")!;
  expect(fileChangesOf(payload)).toMatchObject([{ path: "workspace/out/new.txt", beforeSha256: null, afterSha256: sha256Hex("hi\n") }]);
  // Denials leave no file change on their rows.
  expect(f.payloads().filter((row) => row.auditType === "TOOL_CALL_DENIED").every((row) => fileChangesOf(row).length === 0)).toBe(true);
});
