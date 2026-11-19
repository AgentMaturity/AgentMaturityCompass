import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { agentToolset } from "../src/agent/agentToolset.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { SessionService } from "../src/session/sessionService.js";
import { retrieveSpilledContent } from "../src/session/spill/spillEvidence.js";
import { extractSpillRef } from "../src/session/spill/spillTypes.js";
import { CHECKPOINT_SALT_BYTES, FILE_CHECKPOINT_AUDIT, fileCheckpoints } from "../src/tools/builtin/fileCheckpoint.js";
import { redactingSessionFor } from "../src/dataflow/redactingSession.js";
import { initProcessorRegistry } from "../src/dataflow/processorRegistry.js";
import type { ToolExecution } from "../src/tools/toolTypes.js";
import { defaultToolsConfig, type ToolDefinition } from "../src/toolhub/toolsSchema.js";
import { initToolsConfig, loadVerifiedToolsConfigSnapshot } from "../src/toolhub/toolhubValidators.js";
import { sha256Hex } from "../src/utils/hash.js";
import { initWorkspaceWithoutActionPolicy } from "./helpers/actionPolicyFixtures.js";

/**
 * HP-06: before fs.write, fs.edit or apply_patch changes a file through the real toolset and a real SessionService,
 * the prior bytes are kept as an encrypted spill object behind a signed commitment, and a signed NATIVE_FILE_CHECKPOINT
 * row names the call. Path and digests stay out of plain meta; the model cannot read a checkpoint back.
 */
const cleanups: Array<() => void> = [];
afterEach(() => { try { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); } finally { vi.unstubAllEnvs(); } });

const scoped = (name: string, actionClass: ToolDefinition["actionClass"], paths: string[]): ToolDefinition => ({ name, actionClass, allow: { paths } });
const GRANTS = [scoped("fs.read", "READ_ONLY", ["./workspace/**"]), scoped("fs.write", "WRITE_LOW", ["./workspace/**"]),
  scoped("fs.edit", "WRITE_LOW", ["./workspace/**"]), scoped("apply_patch", "WRITE_LOW", ["./workspace/**"]),
  scoped("session.spill_read", "READ_ONLY", [])];

function fixture(recorderOf: (session: SessionService) => Parameters<typeof agentToolset>[0]["recorder"] = (session) => session) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-file-checkpoint-")));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const workspace = join(root, "project"); mkdirSync(workspace);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-file-checkpoint-fixture-only");
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "control-checkpoints"));
  initWorkspaceWithoutActionPolicy({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initBudgets(workspace, "default"); writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  const config = defaultToolsConfig(); config.tools.allowedTools = GRANTS; config.tools.denyByDefault = true;
  initToolsConfig(workspace, config);
  const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
  mkdirSync(join(workspace, "workspace"), { recursive: true });
  writeFileSync(join(workspace, "workspace", "note.txt"), "before\n");
  const session = new SessionService(workspace);
  cleanups.push(() => session.disposeWithoutClosing());
  session.open({ agentId: "default", harnessVersion: "checkpoint-fixture", compositionDigest: "fixture", policyDigest: snapshot.digestSha256! });
  session.startTurn({ trigger: "user" }); session.startStep();
  const tools = agentToolset({ workspace, agentId: "default", sessionId: session.sessionId, recorder: recorderOf(session), expectedToolsDigest: snapshot.digestSha256! });
  cleanups.push(() => tools.close());
  let sequence = 0;
  const call = (toolName: string, args: object) => tools.seam.execute({ callId: `ckpt-${++sequence}`, toolName,
    rawArguments: JSON.stringify(args), sessionId: session.sessionId, turn: 1, step: 1, parentToken: null,
    dispatch: "native", signal: new AbortController().signal });
  const checkpoints = () => session.readEvents().filter((row) => row.event_type === "audit"
    && (JSON.parse(row.meta_json) as Record<string, unknown>).auditType === FILE_CHECKPOINT_AUDIT);
  const payloadOf = (row: Parameters<typeof readEventPayload>[1]) => {
    const read = readEventPayload(workspace, row);
    if (read.status !== "ok") throw new Error(`payload ${read.status}`);
    return JSON.parse(read.bytes.toString("utf8")) as Record<string, unknown>;
  };
  const commitment = (locator: unknown) => session.readEvents().find((row) => row.event_type === "tool/spill-commitment"
    && extractSpillRef(row.meta_json)?.locator === locator)!;
  return { workspace, session, call, checkpoints, payloadOf, commitment };
}

test("fs.write over a read file keeps its prior bytes encrypted behind a signed commitment, with no path or digest in plain meta", async () => {
  const f = fixture();
  expect(await f.call("fs.read", { path: "workspace/note.txt" })).toMatchObject({ outcome: "OK" });
  expect(await f.call("fs.write", { path: "workspace/note.txt", content: "after\n" })).toMatchObject({ outcome: "OK" });
  const [row] = f.checkpoints();
  const meta = JSON.parse(row!.meta_json) as Record<string, unknown>;
  expect(meta).toMatchObject({ auditType: FILE_CHECKPOINT_AUDIT, v: 1, callId: "ckpt-2", status: "stored" });
  for (const plain of ["note.txt", sha256Hex("before\n"), sha256Hex("after\n")]) expect(JSON.stringify(meta)).not.toContain(plain);
  expect(f.payloadOf(row!)).toMatchObject({ path: "workspace/note.txt", beforeSha256: sha256Hex("before\n"), afterSha256: sha256Hex("after\n"), status: "stored" });
  const committed = f.commitment(meta.locator);
  expect(JSON.parse(committed.meta_json)).toMatchObject({ subject: "file/checkpoint", callId: "ckpt-2" });
  // The commitment is durable before the checkpoint row and before the file changed.
  const ids = f.session.readEvents().map((event) => event.id);
  expect(ids.indexOf(committed.id)).toBeGreaterThanOrEqual(0);
  expect(ids.indexOf(committed.id)).toBeLessThan(ids.indexOf(row!.id));
  expect(retrieveSpilledContent(f.workspace, committed).subarray(CHECKPOINT_SALT_BYTES).toString("utf8")).toBe("before\n");
  expect(readFileSync(join(f.workspace, "workspace", "note.txt"), "utf8")).toBe("after\n");
  // No plaintext copy anywhere in the spill store.
  const stored = JSON.stringify(f.session.readEvents().map((event) => event.meta_json));
  expect(stored).not.toContain("before\\n");
});

test("a created file records that it did not exist; fs.edit and apply_patch delete and move keep each prior file once", async () => {
  const f = fixture();
  expect(await f.call("fs.write", { path: "workspace/new.txt", content: "fresh\n" })).toMatchObject({ outcome: "OK" });
  expect(await f.call("fs.read", { path: "workspace/note.txt" })).toMatchObject({ outcome: "OK" });
  expect(await f.call("fs.edit", { path: "workspace/note.txt", find: "before", replace: "edited" })).toMatchObject({ outcome: "OK" });
  expect(await f.call("fs.read", { path: "workspace/new.txt" })).toMatchObject({ outcome: "OK" });
  const patch = "*** Begin Patch\n*** Update File: workspace/new.txt\n*** Move to: workspace/moved.txt\n@@\n-fresh\n+moved\n*** End Patch\n";
  expect(await f.call("apply_patch", { patch })).toMatchObject({ outcome: "OK" });
  const rows = f.checkpoints().map((row) => ({ meta: JSON.parse(row.meta_json) as Record<string, unknown>, payload: f.payloadOf(row) }));
  expect(rows.map((row) => [row.payload.path, row.meta.status])).toEqual([
    ["workspace/new.txt", "absent"], ["workspace/note.txt", "stored"], ["workspace/moved.txt", "absent"], ["workspace/new.txt", "stored"]]);
  expect(rows[0]!.meta.locator).toBeNull();
  expect(retrieveSpilledContent(f.workspace, f.commitment(rows[3]!.meta.locator)).subarray(CHECKPOINT_SALT_BYTES).toString("utf8")).toBe("fresh\n");
  expect(existsSync(join(f.workspace, "workspace", "new.txt"))).toBe(false);
});

test("a later process on the same session counts what the session already kept, and no plain digest of the earlier file is in plain meta", async () => {
  // MUTATION: start each toolset with an empty tally and the later process stores past the session's limit.
  const f = fixture();
  await f.call("fs.read", { path: "workspace/note.txt" });
  await f.call("fs.write", { path: "workspace/note.txt", content: "after\n" });
  const commitment = f.session.readEvents().find((row) => row.event_type === "tool/spill-commitment")!;
  // The commitment's plain meta carries the digest of salt + content, never of the content alone.
  expect(commitment.meta_json).not.toContain(sha256Hex("before\n"));
  const rows: Record<string, unknown>[] = [];
  const later = fileCheckpoints(() => ({ recordProjectedEvidence: (row) => { rows.push(row.meta); },
    retainFileCheckpoint: (bytes, callId, cap) => f.session.retainFileCheckpoint(bytes, callId, cap), readEvents: () => f.session.readEvents() }),
  { fileBytes: 100, sessionBytes: 10 });
  later(execution("EXECUTE", "later", f.session.sessionId), "workspace/other.txt", Buffer.from("12345"), null);
  expect(rows.map((row) => row.status)).toEqual(["session-limit"]);
});

test("protected-data mode keeps no earlier content: the edit lands, the row says why, and no copy is committed", async () => {
  // MUTATION: pass retainFileCheckpoint straight through the redacting session and a raw copy is kept.
  const f = fixture((session) => redactingSessionFor(session));
  initProcessorRegistry(f.workspace, { schemaVersion: "amc.dataflow-processors/v1", experimental: true,
    processors: [{ processorId: "proc-care", legalName: "Fixture Care Processor",
      contracts: [{ kind: "DPA", reference: "DPA-CARE-1", effective: "2026-01-01", expires: null, dataClasses: ["phi", "pii"] }] }],
    purposes: [{ purposeId: "care", allowedDataClasses: ["phi", "pii"], allowedTools: ["model.request"], allowedProcessors: ["proc-care"] }],
    bindings: [], runPurpose: "care" });
  await f.call("fs.read", { path: "workspace/note.txt" });
  expect(await f.call("fs.write", { path: "workspace/note.txt", content: "after\n" })).toMatchObject({ outcome: "OK" });
  expect(JSON.parse(f.checkpoints()[0]!.meta_json)).toMatchObject({ status: "not-stored", reason: "protected-data-mode", locator: null });
  expect(f.session.readEvents().filter((row) => row.event_type === "tool/spill-commitment")).toHaveLength(0);
});

test("the model cannot read a checkpoint back through session.spill_read", async () => {
  const f = fixture();
  await f.call("fs.read", { path: "workspace/note.txt" });
  await f.call("fs.write", { path: "workspace/note.txt", content: "after\n" });
  const locator = (JSON.parse(f.checkpoints()[0]!.meta_json) as { locator: string }).locator;
  const read = await f.call("session.spill_read", { locator });
  expect(read.outcome).not.toBe("OK");
  expect(String(read.content)).toContain("No tool/spill-commitment in the current session names this locator");
});

test("a checkpoint row that cannot be written refuses the write before the file changes", async () => {
  let failNext = false;
  const f = fixture((session) => ({
    recordProjectedEvidence: (row) => {
      if (failNext && (row.meta as Record<string, unknown>).auditType === FILE_CHECKPOINT_AUDIT) throw new Error("ledger full");
      return session.recordProjectedEvidence(row);
    },
    assertWritable: () => session.assertWritable(),
    retainFileCheckpoint: (bytes, callId, cap) => session.retainFileCheckpoint(bytes, callId, cap)
  }));
  await f.call("fs.read", { path: "workspace/note.txt" });
  failNext = true;
  const refused = await f.call("fs.write", { path: "workspace/note.txt", content: "after\n" });
  expect(refused.outcome).not.toBe("OK");
  expect(readFileSync(join(f.workspace, "workspace", "note.txt"), "utf8")).toBe("before\n");
});

test("a toolset whose writer keeps no checkpoints records none, and the write still lands", async () => {
  const f = fixture((session) => ({ recordProjectedEvidence: (row) => session.recordProjectedEvidence(row), assertWritable: () => session.assertWritable() }));
  await f.call("fs.read", { path: "workspace/note.txt" });
  expect(await f.call("fs.write", { path: "workspace/note.txt", content: "after\n" })).toMatchObject({ outcome: "OK" });
  expect(f.checkpoints()).toHaveLength(0);
});

function execution(mode: "EXECUTE" | "SIMULATE", callId: string, sessionId = "s"): ToolExecution {
  return { token: callId, callId, rootCallId: callId, name: "fs.write", agentId: "a", workspace: "/w", actionClass: "WRITE_LOW",
    requestedMode: mode, effectiveMode: mode, arguments: {}, parentToken: null, ownerStep: { sessionId, turn: 1, step: 1, callId } };
}

test("SIMULATE keeps nothing; too large, session limit and a missing key are recorded, never stored in plain text", () => {
  const rows: Record<string, unknown>[] = [];
  let key = true;
  const retained: Buffer[] = [];
  const limits = { fileBytes: 8, sessionBytes: 64 };
  const checkpoint = fileCheckpoints(() => ({
    recordProjectedEvidence: (row) => { rows.push({ ...row.meta, ...JSON.parse(row.payload) as object }); },
    retainFileCheckpoint: (bytes) => {
      if (!key) throw Object.assign(new Error("encrypted spill key unavailable"), { stage: "prepare" });
      retained.push(Buffer.from(bytes));
      return { locator: `loc-${retained.length}` } as never;
    }
  }), limits);
  checkpoint(execution("SIMULATE", "c0"), "a.txt", Buffer.from("x"), Buffer.from("y"));
  expect(rows).toEqual([]);
  checkpoint(execution("EXECUTE", "c1"), "big.bin", Buffer.alloc(limits.fileBytes + 1), null);
  const chunk = Buffer.alloc(limits.fileBytes, 1);
  for (let i = 0; i < limits.sessionBytes / limits.fileBytes; i++) {
    chunk[0] = i; checkpoint(execution("EXECUTE", `f${i}`), `f${i}`, Buffer.from(chunk), null);
  }
  chunk[0] = 255; checkpoint(execution("EXECUTE", "over"), "over", Buffer.from(chunk), null);
  // Same bytes again: the earlier object is cited, not stored twice.
  chunk[0] = 0; checkpoint(execution("EXECUTE", "again"), "again", Buffer.from(chunk), null);
  key = false;
  checkpoint(execution("EXECUTE", "nokey", "another-session"), "small.txt", Buffer.from("tiny"), null);
  // A commitment append that failed is lost evidence: the write is refused, never silently unprotected.
  const failing = fileCheckpoints(() => ({ recordProjectedEvidence: () => undefined,
    retainFileCheckpoint: () => { throw Object.assign(new Error("append failed"), { stage: "commit" }); } }));
  expect(() => failing(execution("EXECUTE", "c9"), "z.txt", Buffer.from("z"), null)).toThrow(/could not be recorded/);
  expect(rows.map((row) => [row.path, row.status, row.reason ?? null])).toEqual([
    ["big.bin", "too-large", null],
    ...Array.from({ length: 8 }, (_, i) => [`f${i}`, "stored", null]),
    ["over", "session-limit", null], ["again", "stored", null], ["small.txt", "not-stored", "no-encryption-key"]]);
  expect(rows.find((row) => row.path === "again")!.locator).toBe("loc-1");
  expect(retained).toHaveLength(8);
  // Each kept object is a fresh salt followed by the bytes.
  expect(retained[0]!.length).toBe(CHECKPOINT_SALT_BYTES + limits.fileBytes);
  expect(retained[0]!.subarray(CHECKPOINT_SALT_BYTES)[0]).toBe(0);
});
