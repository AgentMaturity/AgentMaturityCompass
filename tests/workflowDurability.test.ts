import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { runWorkflowPlan } from "../src/workflow/workflowRunner.js";
import type { SubagentRunner } from "../src/agent/subagentSpawn.js";
import type { WorkflowNode } from "../src/workflow/workflowPlan.js";
import { openLedger } from "../src/ledger/ledger.js";
import { sha256Hex } from "../src/utils/hash.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { decodeBlobV1, encodeBlobV1, encryptBlobV1 } from "../src/storage/blobs/blobEncryptor.js";
import { readBlobKeyMaterial } from "../src/storage/blobs/blobKeys.js";

const dirs: string[] = [];
const sessions: SessionService[] = [];
afterEach(() => {
  for (const session of sessions.splice(0)) session.disposeWithoutClosing();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const agent = (id: string): WorkflowNode => ({ kind: "agent", id, runAs: "researcher", goal: `goal-${id}` });
const pipeline: WorkflowNode = { kind: "pipeline", id: "root", stages: [agent("a"), agent("b")] };
function fixture(backend: "sqlite" | "jsonl" = "sqlite") {
  process.env.AMC_VAULT_PASSPHRASE = "workflow-durability-test-passphrase";
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-wf-durable-")));
  dirs.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: "owner", trustBoundaryMode: "isolated" });
  const session = new SessionService(workspace, openSessionEventStore(workspace, backend));
  sessions.push(session);
  session.open({ sessionId: "parent", agentId: "owner", harnessVersion: "test", compositionDigest: "composition", policyDigest: "policy" });
  let child = 0;
  const run = (plan: WorkflowNode, runner: SubagentRunner, overrides: Record<string, unknown> = {}) => runWorkflowPlan({
    workspace, session, plan, parent: rootIdentity("owner"), runner,
    mintSessionId: () => `child-${++child}`, ...{ runId: "job", ...overrides }
  });
  return { workspace, session, run };
}

describe("durable workflow admission", () => {
  it("reuses committed results and exact pipeline inputs on a fresh invocation", async () => {
    const f = fixture();
    const goals: string[] = [];
    const runner: SubagentRunner = async ctx => { goals.push(ctx.goal); return { ok: true, text: `[${ctx.goal}]` }; };
    const first = await f.run(pipeline, runner);
    const second = await f.run(pipeline, runner);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(goals).toHaveLength(2);
    expect(second.agentsRun).toBe(0);
    expect([...second.outputs]).toEqual([...first.outputs]);
  });

  it("blocks an admitted node whose result commit failed instead of repeating its effect", async () => {
    const f = fixture();
    const record = f.session.recordProjectedEvidence.bind(f.session);
    f.session.recordProjectedEvidence = row => {
      if (row.meta.kind === "workflow/progress" && row.meta.status === "succeeded") throw new Error("injected result commit failure");
      return record(row);
    };
    let effects = 0;
    const runner: SubagentRunner = async () => { effects++; return { ok: true, text: "paid effect" }; };
    const first = await f.run(agent("a"), runner);
    f.session.recordProjectedEvidence = record;
    const second = await f.run(agent("a"), runner);
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    expect(effects).toBe(1);
    expect(second.failures[0]?.reason).toContain("TOOL_OUTCOME_UNKNOWN");
    expect(second.outputs.size).toBe(0);
    const renamed = await f.run(agent("a"), runner, { runId: "new-name" });
    expect(renamed.ok).toBe(false);
    expect(effects).toBe(1);
  });

  it("bounds all nested parallel agent admission", async () => {
    const f = fixture();
    let live = 0, peak = 0;
    const result = await f.run({ kind: "parallel", id: "root", children: [
      { kind: "parallel", id: "left", children: [agent("a"), agent("b"), agent("c")] },
      { kind: "parallel", id: "right", children: [agent("d"), agent("e")] }
    ] }, async () => {
      peak = Math.max(peak, ++live);
      await new Promise(resolve => setTimeout(resolve, 10));
      live--;
      return { ok: true, text: "done" };
    }, { maxParallelAgents: 2 });
    expect(result.ok).toBe(true);
    expect(peak).toBe(2);
  });

  it("validates direct API plans before any delegation", async () => {
    const f = fixture();
    let effects = 0;
    const result = await f.run({ kind: "parallel", id: "root", children: [agent("same"), agent("same")] }, async () => {
      effects++; return { ok: true, text: "done" };
    });
    expect(result.ok).toBe(false);
    expect(effects).toBe(0);
  });

  it("rejects changed plans and tool generations before spawning", async () => {
    const f = fixture();
    let effects = 0;
    const runner: SubagentRunner = async () => { effects++; return { ok: true, text: "proven" }; };
    expect((await f.run(agent("a"), runner)).ok).toBe(true);
    const changed = await f.run({ ...agent("a"), goal: "changed" } as WorkflowNode, runner);
    expect(changed.ok).toBe(false);
    f.session.recordToolSchema("[]");
    const revoked = await f.run(agent("a"), runner);
    expect(revoked.ok).toBe(false);
    expect(effects).toBe(1);
  });

  it.each(["inline", "blob"])("does not reuse a completed output whose %s payload bytes were altered", async attack => {
    const f = fixture();
    const forged = JSON.stringify("forged output");
    const write = f.session.recordProjectedEvidence.bind(f.session);
    // Even a signed secondary digest cannot replace the session event's authoritative payload commitment.
    if (attack === "blob") f.session.recordProjectedEvidence = row => write({ ...row,
      meta: row.meta.kind === "workflow/progress" && row.meta.status === "succeeded"
        ? { ...row.meta, outputDigest: sha256Hex(forged) } : row.meta });
    let effects = 0;
    const runner: SubagentRunner = async () => { effects++; return { ok: true, text: "proven output" }; };
    await f.run(agent("a"), runner);
    f.session.recordProjectedEvidence = write;
    const result = f.session.readEvents().find(row => {
      const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
      return meta.kind === "workflow/progress" && meta.status === "succeeded";
    })!;
    if (attack === "inline") {
      const ledger = openLedger(f.workspace);
      try {
        for (const trigger of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence"]) ledger.db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
        ledger.db.prepare("UPDATE evidence_events SET payload_inline = ? WHERE id = ?").run(forged, result.id);
      } finally { ledger.close(); }
    } else {
      const path = join(f.workspace, result.payload_path!);
      const blobId = basename(path, ".blob");
      const envelope = decodeBlobV1(readFileSync(path), blobId);
      writeFileSync(path, encodeBlobV1(encryptBlobV1({ blobId, keyVersion: envelope.keyVersion,
        key: readBlobKeyMaterial(f.workspace, envelope.keyVersion), plaintext: Buffer.from(forged) })));
    }
    const resumed = await f.run(agent("a"), runner);
    expect(resumed.ok).toBe(false);
    expect(resumed.outputs.size).toBe(0);
    expect(effects).toBe(1);
  });

  it("requires a committed checkpoint and a real owning writer before effects", async () => {
    const f = fixture();
    let effects = 0;
    const runner: SubagentRunner = async () => { effects++; return { ok: true, text: "done" }; };
    const absent = await f.run(agent("a"), runner, { session: { recordLoopEvent: () => null, recordProjectedEvidence: () => null } });
    expect(absent.ok).toBe(false);
    const write = f.session.recordProjectedEvidence;
    f.session.recordProjectedEvidence = () => null as never;
    expect((await f.run(agent("a"), runner)).ok).toBe(false);
    f.session.recordProjectedEvidence = write;
    expect(effects).toBe(0);
  });

  it("does not accept another workspace's valid history as this writer's progress", async () => {
    const a = fixture(), b = fixture();
    await b.run(agent("a"), async () => ({ ok: true, text: "other workspace" }));
    let effects = 0;
    const result = await a.run(agent("a"), async () => { effects++; return { ok: true, text: "wrong" }; }, { workspace: b.workspace });
    expect(result.ok).toBe(false);
    expect(result.outputs.size).toBe(0);
    expect(effects).toBe(0);
  });

  it("binds the writer workspace even when another workspace clones its signed head", async () => {
    const f = fixture("jsonl");
    const clone = realpathSync(mkdtempSync(join(tmpdir(), "amc-wf-clone-")));
    dirs.push(clone);
    cpSync(f.workspace, clone, { recursive: true });
    let effects = 0;
    const result = await f.run(agent("a"), async () => { effects++; return { ok: true, text: "wrong workspace" }; }, { workspace: clone });
    expect(result.ok).toBe(false);
    expect(result.failures[0]?.reason).toContain("workspace differs");
    expect(effects).toBe(0);
  });

  it("reuses verified node evidence in the JSONL session backend", async () => {
    const f = fixture("jsonl");
    let effects = 0;
    const runner: SubagentRunner = async () => { effects++; return { ok: true, text: "proven JSONL output" }; };
    expect((await f.run(pipeline, runner)).ok).toBe(true);
    const resumed = await f.run(pipeline, runner);
    expect(resumed.ok).toBe(true);
    expect(resumed.agentsRun).toBe(0);
    expect(effects).toBe(2);
  });

  it("fences concurrent resumes through different wrappers of the same writer", async () => {
    const f = fixture();
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const admitted = new Promise<void>(resolve => { started = resolve; });
    const first = f.run(agent("a"), async () => { started(); await gate; return { ok: true, text: "first" }; });
    await admitted;
    const second = await f.run(agent("a"), async () => ({ ok: true, text: "duplicate" }), { session: {
      workspace: f.workspace, sessionId: f.session.sessionId, readEvents: () => f.session.readEvents(),
      assertDispatchFence: () => f.session.assertDispatchFence(),
      recordLoopEvent: f.session.recordLoopEvent.bind(f.session), recordProjectedEvidence: f.session.recordProjectedEvidence.bind(f.session)
    } });
    release();
    expect((await first).ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.agentsRun).toBe(0);
    expect(second.failures[0]?.reason).toContain("already active");
  });

  it("stops queued admission when a timed-out child has not settled", async () => {
    const f = fixture();
    let effects = 0, release!: () => void;
    const late = new Promise<void>(resolve => { release = resolve; });
    const result = await f.run({ kind: "parallel", id: "root", children: [agent("a"), agent("b")] }, async () => {
      effects++; await late; return { ok: true, text: "late" };
    }, { maxParallelAgents: 1, stopConditions: ["timeout-ms:10"], cancelGraceMs: 1 });
    expect(result.ok).toBe(false);
    expect(effects).toBe(1);
    expect(result.failures.some(row => row.reason.includes("TOOL_OUTCOME_UNKNOWN"))).toBe(true);
    release();
    await late;
  });

  it("binds dependency digests and never publishes an uncommitted sibling result", async () => {
    const f = fixture();
    const write = f.session.recordProjectedEvidence.bind(f.session);
    f.session.recordProjectedEvidence = row => {
      if (row.meta.kind === "workflow/progress" && row.meta.nodeId === "b" && row.meta.status === "waiting") {
        const payload = '{"input":"different predecessor"}';
        const ref = write({ ...row, payload, meta: { ...row.meta, inputDigest: sha256Hex(payload) } });
        throw new Error(`injected stop after ${ref.eventId}`);
      }
      return write(row);
    };
    let effects = 0;
    const runner: SubagentRunner = async () => { effects++; return { ok: true, text: "proven a" }; };
    const first = await f.run(pipeline, runner);
    f.session.recordProjectedEvidence = write;
    const second = await f.run(pipeline, runner);
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    expect(second.failures[0]?.reason).toContain("dependency inputs differ");
    expect(effects).toBe(1);
  });

  it("preserves operator scope and stop conditions across queued delegations", async () => {
    const f = fixture();
    const scopes: unknown[] = [], stops: unknown[] = [];
    const result = await f.run(pipeline, async context => {
      scopes.push(context.delegationScope); stops.push(context.stopConditions);
      return { ok: true, text: "done" };
    }, { delegationScope: ["READ_ONLY"], stopConditions: ["max-turns:1"], maxParallelAgents: 1 });
    expect(result.ok).toBe(true);
    expect(scopes).toEqual([["READ_ONLY"], ["READ_ONLY"]]);
    expect(stops).toEqual([["max-turns:1"], ["max-turns:1"]]);
    let effects = 0;
    const refused = await f.run({ ...agent("write"), scope: ["WRITE_HIGH"] } as WorkflowNode, async () => {
      effects++; return { ok: true, text: "wrong" };
    }, { runId: "narrowed", delegationScope: ["READ_ONLY"] });
    expect(refused.ok).toBe(false);
    expect(effects).toBe(0);
  });

  it.each(["version", "context", "plan", "generation", "operation", "output", "encoding", "shape", "settlement", "duplicate"] as const)("refuses semantically invalid signed %s checkpoints", async attack => {
    const f = fixture();
    const write = f.session.recordProjectedEvidence.bind(f.session);
    let success: Parameters<SessionService["recordProjectedEvidence"]>[0] | undefined;
    f.session.recordProjectedEvidence = row => {
      if (row.meta.kind !== "workflow/progress") return write(row);
      const meta = { ...row.meta };
      if (attack === "version" && meta.status === "created") meta.version = 2;
      if (attack === "context" && meta.status === "created") meta.contextDigest = "0".repeat(64);
      if (attack === "plan" && meta.status === "created") meta.planDigest = "0".repeat(64);
      if (attack === "generation" && meta.status === "created") meta.generationDigest = "0".repeat(64);
      if (attack === "operation" && meta.nodeId === "a") meta.operationKey = "0".repeat(64);
      if (attack === "output" && meta.status === "succeeded") meta.outputDigest = "0".repeat(64);
      if (attack === "encoding" && meta.status === "succeeded") meta.outputEncoding = "legacy-raw";
      if (attack === "shape" && meta.status === "succeeded") {
        const payload = '{"wrong":"shape"}';
        return write({ ...row, payload, meta: { ...meta, outputDigest: sha256Hex(payload) } });
      }
      if (attack === "settlement" && meta.status === "succeeded") meta.packetId = "not-the-admitted-packet";
      if (meta.status === "succeeded") success = { ...row, meta };
      return write({ ...row, meta });
    };
    let effects = 0;
    const runner: SubagentRunner = async () => { effects++; return { ok: true, text: "answer" }; };
    await f.run(agent("a"), runner);
    f.session.recordProjectedEvidence = write;
    if (attack === "duplicate") write(success!);
    const result = await f.run(agent("a"), runner);
    expect(result.ok).toBe(false);
    expect(result.outputs.size).toBe(0);
    expect(effects).toBe(1);
  });

  it("stops queued nodes before recording another dispatch after cancellation", async () => {
    const f = fixture();
    const controller = new AbortController();
    let effects = 0;
    const result = await f.run({ kind: "parallel", id: "root", children: [agent("a"), agent("b"), agent("c")] }, async () => {
      effects++; controller.abort(); return { ok: true, text: "cancelled" };
    }, { maxParallelAgents: 1, signal: controller.signal });
    expect(result.cancelled).toBe(true);
    expect(result.agentsRun).toBe(1);
    expect(effects).toBe(1);
  });

  it("shares the eight-child admission bound across distinct workflows in one session", async () => {
    const f = fixture();
    let live = 0, peak = 0;
    const plan: WorkflowNode = { kind: "parallel", id: "root", children: Array.from({ length: 8 }, (_, index) => agent(`a${index}`)) };
    const runner: SubagentRunner = async () => {
      peak = Math.max(peak, ++live);
      await new Promise(resolve => setTimeout(resolve, 10));
      live--; return { ok: true, text: "done" };
    };
    const results = await Promise.all([f.run(plan, runner, { runId: "first" }), f.run(plan, runner, { runId: "second" })]);
    expect(results.every(result => result.ok)).toBe(true);
    expect(peak).toBe(8);
  });

  it("stops queued siblings after a checkpoint write failure", async () => {
    const f = fixture();
    const write = f.session.recordProjectedEvidence.bind(f.session);
    f.session.recordProjectedEvidence = row => {
      if (row.meta.kind === "workflow/progress" && row.meta.status === "succeeded") throw new Error("result commit failed");
      return write(row);
    };
    let effects = 0;
    const result = await f.run({ kind: "parallel", id: "root", children: [agent("a"), agent("b")] }, async () => {
      effects++; return { ok: true, text: "uncommitted" };
    }, { maxParallelAgents: 1 });
    expect(result.ok).toBe(false);
    expect(result.outputs.size).toBe(0);
    expect(effects).toBe(1);
  });

  it.each([0, 9, NaN])("refuses invalid parallel admission bound %s", async maxParallelAgents => {
    const f = fixture();
    let effects = 0;
    const result = await f.run(agent("a"), async () => { effects++; return { ok: true, text: "wrong" }; }, { maxParallelAgents });
    expect(result.ok).toBe(false);
    expect(effects).toBe(0);
  });

  it("retains unknown when a synchronous child returns after its lifetime deadline", async () => {
    const f = fixture();
    let effects = 0;
    const runner: SubagentRunner = async () => {
      effects++;
      const end = performance.now() + 40;
      while (performance.now() < end) { /* Exercise a deadline before the event loop delivers its timer. */ }
      return { ok: true, text: "late effect" };
    };
    const result = await f.run(agent("a"), runner, { stopConditions: ["timeout-ms:20"] });
    expect(result.ok).toBe(false);
    expect(result.failures[0]?.reason).toContain("TOOL_OUTCOME_UNKNOWN");
    expect((await f.run(agent("a"), runner, { runId: "renamed", stopConditions: ["timeout-ms:20"] })).ok).toBe(false);
    expect(effects).toBe(1);
  });

  it.each(["created", "waiting", "running"])("commits %s before admitting any effect", async status => {
    const f = fixture();
    const write = f.session.recordProjectedEvidence.bind(f.session);
    f.session.recordProjectedEvidence = row => {
      if (row.meta.kind === "workflow/progress" && row.meta.status === status) throw new Error("injected admission commit failure");
      return write(row);
    };
    let effects = 0;
    const result = await f.run(agent("a"), async () => { effects++; return { ok: true, text: "wrong" }; });
    expect(result.ok).toBe(false);
    expect(effects).toBe(0);
  });

  it("does not replay a child that threw after applying an effect", async () => {
    const f = fixture();
    let effects = 0;
    const runner: SubagentRunner = async () => { effects++; throw new Error("effect applied before the throw"); };
    const first = await f.run(agent("a"), runner);
    expect(first.ok).toBe(false);
    expect(first.failures[0]?.reason).toContain("TOOL_OUTCOME_UNKNOWN");
    expect((await f.run(agent("a"), runner)).ok).toBe(false);
    expect(effects).toBe(1);
  });

  it("preserves exact result strings and dependent inputs across resume", async () => {
    const f = fixture();
    let effects = 0;
    const runner: SubagentRunner = async context => {
      effects++;
      return { ok: true, text: context.goal === "goal-a" ? '"quoted"\ud800' : context.goal };
    };
    const first = await f.run(pipeline, runner);
    const second = await f.run(pipeline, runner);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect([...second.outputs]).toEqual([...first.outputs]);
    expect(effects).toBe(2);
  });
});
