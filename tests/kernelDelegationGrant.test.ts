import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { runComposedTurn, type ComposedTurnOptions } from "../src/kernel/agentLoopRunner.js";
import {
  STUB_PROVIDER_ID,
  STUB_PROVIDER_MODEL,
  stubProviderRoute,
  stubProviderTransport
} from "../src/agent/stubProvider.js";
import { echoToolSeam } from "../src/agent/echoTool.js";
import type { SubagentCapability } from "../src/agent/delegateTool.js";

/**
 * The kernel builds the delegation capability, because only it can (P6.1a).
 *
 * The capability needs three things that do not exist when a caller builds its
 * toolset: the parent's `SessionService`, so the delegation rows land in the
 * parent's own log; a way to build an `LlmRuntime` bound to a CHILD's session,
 * since `LlmRuntime` captures its session at construction; and the rendered
 * system prompt. So composition is inverted — the kernel builds it, the caller
 * says where it goes.
 */
const PASS = "kernel-delegation-test-passphrase";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function setup(): { workspace: string; home: string; credentialsHome: string } {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-kernel-deleg-")));
  const home = realpathSync(mkdtempSync(join(tmpdir(), "amc-kernel-home-")));
  const credentialsHome = realpathSync(mkdtempSync(join(tmpdir(), "amc-kernel-creds-")));
  dirs.push(workspace, home, credentialsHome);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(workspace, "default");
  return { workspace, home, credentialsHome };
}

function turnOptions(
  s: ReturnType<typeof setup>,
  extra: Partial<ComposedTurnOptions> = {}
): ComposedTurnOptions {
  return {
    workspace: s.workspace,
    agentId: "default",
    promptProfile: { persona: "You delegate carefully.", amcHome: s.home },
    prompt: "say hello",
    route: {
      providerId: STUB_PROVIDER_ID,
      model: STUB_PROVIDER_MODEL,
      params: { max_tokens: 256, stream: true }
    },
    routes: [stubProviderRoute()],
    transport: stubProviderTransport(),
    tools: echoToolSeam(),
    credentials: { homeDir: s.credentialsHome, env: {}, watch: false, projectDir: null },
    ...extra
  };
}

describe("the kernel hands over what only it has", () => {
  // NOTE: there is deliberately no "grants nothing when the caller did not ask"
  // test here. The first draft had one, and it was vacuous: with no `delegation`
  // option there is no callback to count, so its counter could never move and the
  // assertion could never fail. The absence is structural, not behavioural —
  // `options.delegation === undefined` means the block does not run — and a test
  // that cannot fail is worse than no test.

  it("grants a capability governed as the run's own agent", async () => {
    const s = setup();
    const grants: SubagentCapability[] = [];

    const outcome = await runComposedTurn(
      turnOptions(s, { delegation: { grant: (capability) => { grants.push(capability); } } })
    );

    expect(grants).toHaveLength(1);
    const capability = grants[0]!;
    expect(capability.identity.governedAs, "the run's own id governs its children").toBe("default");
    expect(capability.identity.depth, "a top-level run is the root").toBe(0);
    expect(capability.identity.parent).toBeNull();
    expect(outcome.sessionId.length).toBeGreaterThan(0);
  });

  it("grants before the first turn, so the tool is offered on it", async () => {
    // Granting after the turn would produce a capability nothing could use.
    const s = setup();
    let grantedDuringComposition = false;
    let sawTurn = false;

    await runComposedTurn(
      turnOptions(s, {
        delegation: { grant: () => { grantedDuringComposition = !sawTurn; } },
        onReady: () => { sawTurn = true; }
      })
    );

    expect(grantedDuringComposition, "granted while composing, not after running").toBe(true);
  });

  it("writes the delegation rows into the PARENT's session", async () => {
    // The reason the kernel builds this at all: the rows belong in the log of
    // the run that delegated, and only this function has that session.
    const s = setup();

    // Recorded DURING the run, from inside the grant. The capability's session
    // is the parent's live one, so it is usable exactly while the parent is —
    // a delegation after the parent's turn ended would have nowhere honest to
    // record, and the next test pins that.
    const outcome = await runComposedTurn(
      turnOptions(s, {
        delegation: {
          grant: (capability) => {
            capability.session.recordLoopEvent({
              kind: "delegation-started",
              childRunAs: "researcher",
              childSessionId: "child-x",
              governedAs: "default",
              depth: 1,
              packetId: "packet-x"
            });
          }
        }
      })
    );

    const db = new Database(join(s.workspace, ".amc", "evidence.sqlite"), { readonly: true });
    const rows = db
      .prepare("SELECT session_id FROM evidence_events WHERE event_type = 'agent_delegation_started'")
      .all() as Array<{ session_id: string }>;
    db.close();

    expect(rows.map((r) => r.session_id), "the parent's session, not a new one")
      .toEqual([outcome.sessionId]);
  });

  it("hands over a session that is live only while the run is", async () => {
    // Not a defect: a delegation announced after the parent's turn ended would
    // have nowhere honest to record. The capability's lifetime is the run's.
    const s = setup();
    const grants: SubagentCapability[] = [];
    await runComposedTurn(
      turnOptions(s, { delegation: { grant: (capability) => { grants.push(capability); } } })
    );

    expect(() =>
      grants[0]!.session.recordLoopEvent({
        kind: "delegation-started",
        childRunAs: "late",
        childSessionId: "child-late",
        governedAs: "default",
        depth: 1,
        packetId: "packet-late"
      })
    ).toThrow(/after close/i);
  });

  it("passes a maxDepth the caller chose", async () => {
    const s = setup();
    const grants: SubagentCapability[] = [];

    await runComposedTurn(
      turnOptions(s, {
        delegation: { maxDepth: 1, grant: (capability) => { grants.push(capability); } }
      })
    );

    expect(grants[0]!.maxDepth).toBe(1);
  });
});

describe("the operator's delegation scope reaches the capability", () => {
  it("passes a declared scope through to the grant", async () => {
    // Without this the whole scope chain is unreachable: `delegationScope` is
    // honoured by spawnSubagent, enforced by createDriverRunner and projected as
    // evidence for AMC-2.15 -- and nothing ever set it, because the kernel's
    // grant is the only call site in the codebase and it passed identity,
    // session, runner and maxDepth only. Three layers of enforcement gated on a
    // field no caller could populate.
    const s = setup();
    const grants: SubagentCapability[] = [];

    await runComposedTurn(
      turnOptions(s, {
        delegation: {
          scope: ["READ_ONLY"],
          grant: (capability) => { grants.push(capability); }
        }
      })
    );

    expect(grants[0]!.delegationScope).toEqual(["READ_ONLY"]);
  });

  it("leaves it undefined when the caller declares none", async () => {
    const s = setup();
    const grants: SubagentCapability[] = [];
    await runComposedTurn(
      turnOptions(s, { delegation: { grant: (capability) => { grants.push(capability); } } })
    );
    expect(grants[0]!.delegationScope).toBeUndefined();
  });
});
