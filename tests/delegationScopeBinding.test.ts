import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { credentialRef } from "../src/credentials/credentialRef.js";
import { createDriverRunner } from "../src/agent/subagentRunner.js";
import {
  FixedCredentials,
  LOOP_MODEL,
  LOOP_PROVIDER,
  scriptedAdapter,
  silentTransport,
  textStep,
  toolStep
} from "./helpers/agentLoopHarness.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { agentToolset } from "../src/agent/agentToolset.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { spawnSubagent, type SubagentRunContext } from "../src/agent/subagentSpawn.js";
import { listHandoffPackets } from "../src/fleet/handoffPacket.js";
import type { LoopEventRecord } from "../src/session/loopEventMeta.js";
import {
  DELEGATION_SCOPE_TOKENS,
  deniedToolNamesForScope,
  parseDelegationScope
} from "../src/agent/delegationScope.js";

/**
 * A signed packet that names a scope must bind the child to it.
 *
 * `delegationScope` was written into the signed handoff packet
 * (src/fleet/delegationPacket.ts) and rendered for humans, and read back by
 * NOTHING — `verifyHandoffPacket` checks the signature, not conformance. So a
 * packet asserting READ_ONLY was a signed document about a constraint that did
 * not exist, and `src/cli.ts` already ships operator-facing scopes derived from
 * a `--mode` flag. A signature over an unenforced claim manufactures more
 * confidence than no packet at all.
 *
 * The scope is an ACTION-CLASS budget: it names the classes a child may invoke,
 * and every tool outside them is denied to it.
 */
const PASS = "delegation-scope-test-passphrase";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-deleg-scope-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "payments-agent", trustBoundaryMode: "isolated" });
  initBudgets(dir, "payments-agent");
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  return dir;
}

describe("a delegation scope is an action-class budget", () => {
  it("accepts the action classes and refuses anything else", () => {
    expect(parseDelegationScope(["READ_ONLY"])).toEqual({ ok: true, classes: ["READ_ONLY"] });
    expect(parseDelegationScope(["READ_ONLY", "WRITE_LOW"]).ok).toBe(true);
    const bad = parseDelegationScope(["read_only"]);
    expect(bad.ok, "case matters; a near-miss must fail loudly").toBe(false);
    if (!bad.ok) expect(bad.reason).toContain("read_only");
  });

  it("refuses an empty scope rather than reading it as unrestricted", () => {
    // The dangerous default. An empty list looks like "nothing declared" and
    // would naturally be treated as "no restriction" — the opposite of what an
    // operator writing a scope means.
    const empty = parseDelegationScope([]);
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toContain("empty");
  });

  it("names every action class it knows, so the vocabulary has one home", () => {
    expect(DELEGATION_SCOPE_TOKENS).toContain("READ_ONLY");
    expect(DELEGATION_SCOPE_TOKENS).toContain("WRITE_HIGH");
  });
});

describe("the scope denies the tools outside it", () => {
  it("denies every write tool to a READ_ONLY child", () => {
    const dir = workspace();
    const toolset = agentToolset({ workspace: dir, agentId: "payments-agent", sessionId: "toolset-test-session"});

    const denied = deniedToolNamesForScope(toolset.registry, ["READ_ONLY"]);

    expect(denied, "writes are outside a READ_ONLY budget").toContain("fs.write");
    expect(denied).toContain("fs.edit");
    expect(denied, "reads are inside it").not.toContain("fs.read");
    toolset.close();
  });

  it("denies nothing a wider scope permits", () => {
    const dir = workspace();
    const toolset = agentToolset({ workspace: dir, agentId: "payments-agent", sessionId: "toolset-test-session"});

    const denied = deniedToolNamesForScope(toolset.registry, ["READ_ONLY", "WRITE_LOW", "WRITE_HIGH"]);

    expect(denied).not.toContain("fs.write");
    expect(denied).not.toContain("fs.read");
    toolset.close();
  });

  it("applies as a registry restriction the seam actually honours", () => {
    // The point of the whole exercise: not a list, a refusal.
    const dir = workspace();
    const toolset = agentToolset({ workspace: dir, agentId: "payments-agent", sessionId: "toolset-test-session"});
    const before = (toolset.seam.schemas() ?? []).map((s) => s.name);
    expect(before).toContain("fs.write");

    toolset.registry.restrict({ deny: new Set(deniedToolNamesForScope(toolset.registry, ["READ_ONLY"])) });

    const after = (toolset.seam.schemas() ?? []).map((s) => s.name);
    expect(after, "the model is no longer offered a write tool").not.toContain("fs.write");
    expect(after, "and still has its read tool").toContain("fs.read");
    toolset.close();
  });
});

function runnerFor(dir: string, scripts: ReturnType<typeof textStep>[]) {
  const registry = new AdapterRegistry();
  registry.register({
    providerId: LOOP_PROVIDER,
    adapter: scriptedAdapter(scripts),
    baseUrl: "https://api.anthropic.invalid",
    credentialRef: credentialRef("AMC_LOOP_TEST_KEY"),
    models: [LOOP_MODEL]
  });
  let clock = 1_000;
  return createDriverRunner({
    workspace: dir,
    makeLlm: (session) =>
      new LlmRuntime({
        session,
        credentials: new FixedCredentials(),
        registry,
        transport: silentTransport,
        now: () => { clock += 5; return clock; }
      }),
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
    systemPrompt: "You are a careful delegate.",
    harnessVersion: "3.2.0",
    compositionDigest: "composition-digest",
    policyDigest: "policy-digest"
  });
}

function childRows(dir: string, sessionId: string): Array<{ event_type: string; meta_json: string }> {
  const db = new Database(join(dir, ".amc", "evidence.sqlite"), { readonly: true });
  try {
    return db
      .prepare("SELECT event_type, meta_json FROM evidence_events WHERE session_id = ? ORDER BY id")
      .all(sessionId) as Array<{ event_type: string; meta_json: string }>;
  } finally {
    db.close();
  }
}

function recorder() {
  const rows: LoopEventRecord[] = [];
  return { rows, recordLoopEvent: (r: LoopEventRecord) => { rows.push(r); return null; } };
}

describe("the scope reaches the thing that can enforce it", () => {
  it("hands the runner the declared scope", async () => {
    // It was written into the signed packet and never passed to the runner, so
    // nothing downstream COULD enforce it however much it wanted to.
    const dir = workspace();
    let seen: SubagentRunContext | null = null;

    await spawnSubagent({
      workspace: dir,
      parent: rootIdentity("payments-agent"),
      request: { runAs: "researcher", goal: "read the ledger", delegationScope: ["READ_ONLY"] },
      session: recorder(),
      runner: async (ctx) => { seen = ctx; return { ok: true, text: "done" }; },
      mintSessionId: () => "child-scoped"
    });

    expect(seen).not.toBeNull();
    expect(seen!.delegationScope, "the runner can now bind the child to it").toEqual(["READ_ONLY"]);
  });

  it("leaves the scope absent when none was declared", () => {
    // Absent must stay distinguishable from empty: one means unrestricted, the
    // other is an operator writing a constraint that says nothing.
    const dir = workspace();
    let seen: SubagentRunContext | null = null;
    return spawnSubagent({
      workspace: dir,
      parent: rootIdentity("payments-agent"),
      request: { runAs: "researcher", goal: "g" },
      session: recorder(),
      runner: async (ctx) => { seen = ctx; return { ok: true, text: "done" }; },
      mintSessionId: () => "child-unscoped"
    }).then(() => {
      expect(seen!.delegationScope).toBeUndefined();
    });
  });

  it("refuses an unenforceable scope before it signs anything", async () => {
    // The packet is the authorisation record. Minting one that names a scope the
    // runtime cannot read would be exactly the defect this work exists to close,
    // so the refusal has to come first -- no packet, no row.
    const dir = workspace();
    const before = listHandoffPackets(dir).length;
    const session = recorder();

    const outcome = await spawnSubagent({
      workspace: dir,
      parent: rootIdentity("payments-agent"),
      request: { runAs: "researcher", goal: "g", delegationScope: ["read_only"] },
      session,
      runner: async () => ({ ok: true, text: "should not run" }),
      mintSessionId: () => "child-bad-scope"
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toContain("read_only");
    expect(outcome.packetId, "refused before authorisation").toBeNull();
    expect(listHandoffPackets(dir).length, "no packet for a delegation that never happened").toBe(before);
    expect(session.rows, "and nothing announced").toEqual([]);
  });

  it("refuses an empty scope rather than silently unrestricting the child", async () => {
    const dir = workspace();
    const outcome = await spawnSubagent({
      workspace: dir,
      parent: rootIdentity("payments-agent"),
      request: { runAs: "researcher", goal: "g", delegationScope: [] },
      session: recorder(),
      runner: async () => ({ ok: true, text: "should not run" }),
      mintSessionId: () => "child-empty-scope"
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain("empty");
  });
});

/** The digest of the catalogue a child's model was offered, from its own rows. */
function offeredTo(dir: string, sessionId: string): string[] {
  const digests = childRows(dir, sessionId)
    .filter((r) => r.event_type === "request/tools")
    .map((r) => JSON.parse(r.meta_json)["toolSchemaSha256"] as unknown)
    .filter((d): d is string => typeof d === "string");
  return [...new Set(digests)];
}

async function runChild(dir: string, sessionId: string, scope?: readonly string[]) {
  const parentSession = new SessionService(dir);
  parentSession.open({
    agentId: "payments-agent", harnessVersion: "3.2.0", compositionDigest: "c", policyDigest: "p"
  });
  const outcome = await spawnSubagent({
    workspace: dir,
    parent: rootIdentity("payments-agent"),
    request: {
      runAs: "researcher",
      goal: "do the thing",
      ...(scope === undefined ? {} : { delegationScope: scope })
    },
    session: { recordLoopEvent: (r) => parentSession.recordLoopEvent(r) },
    runner: runnerFor(dir, [textStep("done")]),
    mintSessionId: () => sessionId
  });
  parentSession.close({ reason: "completed" });
  return outcome;
}

describe("the in-process runner binds the child to its scope", () => {
  it("offers a scoped child a smaller catalogue than an unscoped one", async () => {
    // Observed as what the model was SHOWN, not as a denial. An earlier version
    // asserted that a READ_ONLY child's `fs.write` call came back denied, and it
    // passed -- but so did the unscoped control, because `fs.write` is refused
    // in this workspace for an unrelated reason. A denial proves a refusal
    // happened; it does not prove the scope caused it.
    const dir = workspace();

    const unscoped = await runChild(dir, "child-unrestricted");
    expect(unscoped.ok, unscoped.ok ? "" : unscoped.reason).toBe(true);
    const full = offeredTo(dir, "child-unrestricted");
    expect(full.length, "the unscoped child was offered a catalogue").toBeGreaterThan(0);

    const scoped = await runChild(dir, "child-readonly", ["READ_ONLY"]);
    expect(scoped.ok, scoped.ok ? "" : scoped.reason).toBe(true);
    const narrowed = offeredTo(dir, "child-readonly");

    expect(narrowed.length).toBeGreaterThan(0);
    expect(narrowed[0], "READ_ONLY changed what the child was shown").not.toBe(full[0]);
  });

  it("offers two identically-scoped children the same catalogue", async () => {
    // The control. Without it the test above passes on any run-to-run variation
    // in the catalogue rather than on the scope.
    const dir = workspace();
    await runChild(dir, "child-a", ["READ_ONLY"]);
    await runChild(dir, "child-b", ["READ_ONLY"]);

    expect(offeredTo(dir, "child-b")).toEqual(offeredTo(dir, "child-a"));
  });
});
