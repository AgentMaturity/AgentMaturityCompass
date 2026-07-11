import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { Command } from "commander";
import { afterEach, describe, expect, test, vi } from "vitest";
import { registerHookIntegrationCommands } from "../src/adapters/hookIntegrationCli.js";
import { handleWatchRoute } from "../src/api/watchRouter.js";
import { ingestObservedAepHookEvent } from "../src/bridge/hookIngress.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
const originalCwd = process.cwd();

function newWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-hook-lifecycle-surface-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return workspace;
}

function addRequested(workspace: string, agentId: string, actionId: string): void {
  const now = Date.now();
  ingestObservedAepHookEvent({
    workspace,
    authenticatedAgentId: agentId,
    now,
    rawBody: Buffer.from(JSON.stringify({
      aep_version: "0.1",
      id: `source-${actionId}`,
      type: "action.requested",
      time: new Date(now).toISOString(),
      hook: "PreToolUse",
      agent: { slug: agentId, surface: "claude-code" },
      action: { type: "tool_call", id: actionId },
      tool: { type: "native", name: "Read" },
    }), "utf8"),
  });
}

async function callWatchRoute(workspace: string, path: string): Promise<{ status: number; body: unknown }> {
  const req = Readable.from([]) as unknown as IncomingMessage;
  req.method = "GET";
  req.url = path;
  let status = 0;
  let body = "";
  const res = {
    writeHead(code: number): void { status = code; },
    end(chunk?: string): void { body = chunk ?? ""; },
    setHeader(): void {},
  } as unknown as ServerResponse;
  const pathname = new URL(path, "http://localhost").pathname;
  const handled = await handleWatchRoute(pathname, "GET", req, res, workspace);
  expect(handled).toBe(true);
  return { status, body: JSON.parse(body) as unknown };
}

afterEach(() => {
  process.chdir(originalCwd);
  process.exitCode = undefined;
  vi.restoreAllMocks();
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("hook action lifecycle CLI and Watch API", () => {
  test("return the same strict lifecycle contract", async () => {
    const workspace = newWorkspace();
    const agentId = "surface-agent";
    const actionId = "toolu_surface_01";
    addRequested(workspace, agentId, actionId);

    process.chdir(workspace);
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => lines.push(args.map(String).join(" ")));
    const program = new Command();
    program.exitOverride();
    const connect = program.command("connect");
    registerHookIntegrationCommands(connect, () => undefined);
    await program.parseAsync([
      "node",
      "amc",
      "connect",
      "hooks",
      "lifecycle",
      "--agent",
      agentId,
      "--action",
      actionId,
      "--json",
    ]);
    const cli = JSON.parse(lines.join("\n")) as Record<string, unknown>;

    const api = await callWatchRoute(
      workspace,
      `/api/v1/watch/hook-actions/${actionId}?agentId=${agentId}`,
    );
    expect(api.status).toBe(200);
    expect(api.body).toEqual({ ok: true, data: cli });
    expect(cli).toEqual(expect.objectContaining({
      schemaVersion: "2026-07-11",
      agentId,
      actionId,
      status: "requested",
      valid: true,
      rawProviderPayloadStored: false,
    }));
  });

  test("rejects unsafe lookup identifiers before reading evidence", async () => {
    const workspace = newWorkspace();
    const api = await callWatchRoute(workspace, "/api/v1/watch/hook-actions/not%2Fsafe?agentId=default");
    expect(api.status).toBe(400);
    expect(api.body).toEqual(expect.objectContaining({ ok: false }));
  });
});
