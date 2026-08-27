import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import {
  CLAUDE_CLI_DELEGATE_SCOPES,
  claudeCliForeignRunner
} from "../src/agent/providers/claudeCliProvider.js";
import { verifyLeaseToken } from "../src/leases/leaseVerifier.js";
import type { SubagentRunContext } from "../src/agent/subagentSpawn.js";

/**
 * The first real foreign provider: Claude Code, as a delegated child.
 *
 * Everything that governs the delegation is decided elsewhere — `spawnSubagent`
 * mints the packet and announces the session, `createForeignRunner` refuses an
 * ungoverned or hanging child. This module's whole job is to turn AMC's existing
 * `claudeCliAdapter` description into the two things the runner asks for: the
 * argv that starts the agent on a goal, and the environment that governs it.
 */
const PASS = "claude-provider-test-passphrase";
const dirs: string[] = [];
const priorPath = process.env["PATH"];

afterEach(() => {
  if (priorPath === undefined) delete process.env["PATH"];
  else process.env["PATH"] = priorPath;
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-claude-prov-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "payments-agent", trustBoundaryMode: "isolated" });
  return dir;
}

/** Put a stand-in `claude` on PATH that reports its argv and environment. */
function fakeClaudeOnPath(dir: string): { out: string } {
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  const out = join(dir, "claude-saw.txt");
  const script = join(bin, "claude");
  writeFileSync(
    script,
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "1.2.3"; exit 0; fi\n`
    + `{ echo "ARGV:$@"; env; } > ${JSON.stringify(out)}\n`
    + `echo "the delegate answer"\n`,
    "utf8"
  );
  chmodSync(script, 0o755);
  process.env["PATH"] = `${bin}:${priorPath ?? ""}`;
  return { out };
}

const ctx = (over: Partial<SubagentRunContext> = {}): SubagentRunContext => ({
  continuable: false,
  toolsetAgentId: "payments-agent",
  identity: { governedAs: "payments-agent", runAs: "researcher", depth: 1, parent: "payments-agent" },
  childSessionId: "claude-child-1",
  goal: "summarise the ledger",
  ...over
});

const runnerFor = (dir: string, over: Record<string, unknown> = {}) =>
  claudeCliForeignRunner({
    workspace: dir,
    gatewayBase: "http://127.0.0.1:3210",
    providerRoute: "/anthropic",
    model: "claude-opus-4-6",
    timeoutMs: 20_000,
    ...over
  });

describe("claude-cli runs as a governed delegate", () => {
  it("starts the agent on the goal and returns its words", async () => {
    const dir = workspace();
    const { out } = fakeClaudeOnPath(dir);

    const result = await runnerFor(dir)(ctx());

    expect(result.ok, result.ok ? "" : result.reason).toBe(true);
    expect(result.text).toContain("the delegate answer");
    expect(readFileSync(out, "utf8"), "the goal reached the agent").toContain("summarise the ledger");
  }, 40_000);

  it("points the agent at the gateway, not at the provider", async () => {
    // The one thing AMC can bind on a foreign child: where its traffic goes.
    const dir = workspace();
    const { out } = fakeClaudeOnPath(dir);

    await runnerFor(dir)(ctx());
    const seen = readFileSync(out, "utf8");

    expect(seen).toContain("ANTHROPIC_BASE_URL=http://127.0.0.1:3210/anthropic");
  }, 40_000);

  it("gives the agent a lease instead of a provider key", async () => {
    const dir = workspace();
    const { out } = fakeClaudeOnPath(dir);
    const prior = process.env["ANTHROPIC_API_KEY"];
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-real-key-must-not-escape";
    try {
      await runnerFor(dir)(ctx());
      const seen = readFileSync(out, "utf8");
      expect(seen, "AMC's own key never reaches it").not.toContain("sk-ant-real-key-must-not-escape");
      const line = seen.split("\n").find((l) => l.startsWith("ANTHROPIC_API_KEY="));
      expect(line, "it does get a credential").toBeDefined();
      const token = (line ?? "").slice("ANTHROPIC_API_KEY=".length);
      const verified = verifyLeaseToken({ workspace: dir, token });
      expect(verified.ok, "and the credential is a valid AMC lease").toBe(true);

      // Asserted on the PAYLOAD, not by passing an expectation into the
      // verifier: an earlier version passed `agentId` where the option is named
      // `expectedAgentId`, so the check was silently dropped and a lease issued
      // to the wrong identity passed. Mutation testing found it.
      expect(verified.payload?.agentId, "metered against the GOVERNING id, never runAs")
        .toBe("payments-agent");
      expect(verified.payload?.scopes, "the narrowest scope set that works")
        .toEqual(["gateway:llm"]);
      expect(verified.payload?.routeAllowlist, "pinned to one route").toEqual(["/anthropic"]);
      expect(verified.payload?.modelAllowlist, "and one model").toEqual(["claude-opus-4-6"]);
    } finally {
      if (prior === undefined) delete process.env["ANTHROPIC_API_KEY"];
      else process.env["ANTHROPIC_API_KEY"] = prior;
    }
  }, 40_000);

  it("refuses when the CLI is not installed", async () => {
    // Better than spawning something that is not there and reporting ENOENT as
    // a delegation failure.
    const dir = workspace();
    process.env["PATH"] = join(dir, "definitely-empty");

    const result = await runnerFor(dir)(ctx());

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not detected|not installed/i);
  }, 40_000);
});

describe("the lease a foreign CLI gets is the narrowest that works", () => {
  it("carries no toolhub scope, because a foreign CLI calls no toolhub", () => {
    // Over-granting here would be invisible: nothing refuses a scope that is
    // never exercised, so the lease would simply carry more authority than the
    // child could ever have needed.
    expect(CLAUDE_CLI_DELEGATE_SCOPES).toContain("gateway:llm");
    expect(CLAUDE_CLI_DELEGATE_SCOPES).not.toContain("toolhub:execute");
    expect(CLAUDE_CLI_DELEGATE_SCOPES).not.toContain("toolhub:intent");
  });
});
