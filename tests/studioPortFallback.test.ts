import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, test } from "vitest";
import { initHostDb } from "../src/workspaces/hostDb.js";
import { startWorkspaceRouter } from "../src/workspaces/workspaceRouter.js";
import { runStudioForeground } from "../src/studio/studioSupervisor.js";
import { initWorkspace } from "../src/workspace.js";

// LIVE-RUNTIME-10 (D-R7): a configured port that is busy is a hard error naming it and its source; a busy default port
// falls back; host mode never falls back; the router reports the port it is bound to.
const roots: string[] = [];
const holders: Server[] = [];
afterEach(async () => {
  while (holders.length > 0) await new Promise<void>((done) => holders.pop()!.close(() => done()));
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function dir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  roots.push(path);
  return path;
}

function workspace(): string {
  const path = dir("amc-port-policy-");
  initWorkspace({ workspacePath: path, trustBoundaryMode: "isolated" });
  return path;
}

/** Holds a loopback port; with `port` it holds that one, or resolves null when another process already has it. */
async function hold(port = 0): Promise<number | null> {
  const server = createServer();
  const bound = await new Promise<boolean>((resolvePromise) => {
    server.once("error", () => resolvePromise(false));
    server.listen(port, "127.0.0.1", () => resolvePromise(true));
  });
  if (!bound) return null;
  holders.push(server);
  const address = server.address();
  return typeof address === "object" && address ? address.port : null;
}

function openSessions(path: string): number {
  const db = new Database(join(path, ".amc", "evidence.sqlite"), { readonly: true });
  try {
    return (db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE ended_ts IS NULL").get() as { n: number }).n;
  } finally {
    db.close();
  }
}

function listening(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("connect", () => { socket.destroy(); resolvePromise(true); });
    socket.once("error", () => resolvePromise(false));
  });
}

const others = { gatewayPort: 0, proxyPort: 0, dashboardPort: 0 };

describe("single-workspace port policy", () => {
  test("a busy AMC_STUDIO_PORT is refused by name before anything starts", async () => {
    const path = workspace();
    const busy = (await hold())!;
    await expect(runStudioForeground({ workspace: path, env: { AMC_STUDIO_PORT: String(busy) }, metricsPort: 0, ...others }))
      .rejects.toThrow(`Port ${busy} (from AMC_STUDIO_PORT) is already in use. Stop the other process or change the port.`);
    expect(openSessions(path)).toBe(0);
  }, 120_000);

  test("a busy AMC_METRICS_PORT is refused by name the same way", async () => {
    const path = workspace();
    const busy = (await hold())!;
    await expect(runStudioForeground({ workspace: path, env: { AMC_METRICS_PORT: String(busy) }, apiPort: 0, ...others }))
      .rejects.toThrow(`Port ${busy} (from AMC_METRICS_PORT) is already in use.`);
    expect(openSessions(path)).toBe(0);
  }, 120_000);

  // Skeptic D4: startGateway opens its ledger session before it listens, so a busy gateway or proxy port used to fail
  // after the session opened and leave it open and unsealed.
  test("a busy gateway or proxy port is refused before the gateway opens its session", async () => {
    const path = workspace();
    const busy = (await hold())!;
    await expect(runStudioForeground({ workspace: path, env: { AMC_GATEWAY_PORT: String(busy) }, apiPort: 0, metricsPort: 0, dashboardPort: 0, proxyPort: 0, gatewayHost: "127.0.0.1", gatewayPort: busy }))
      .rejects.toThrow(`Port ${busy} (from AMC_GATEWAY_PORT) is already in use.`);
    // AMC_GATEWAY_PORT unset: the port is the default, and the message does not blame a variable nobody set.
    await expect(runStudioForeground({ workspace: path, env: {}, apiPort: 0, metricsPort: 0, dashboardPort: 0, proxyPort: 0, gatewayHost: "127.0.0.1", gatewayPort: busy }))
      .rejects.toThrow(`Port ${busy} (from the default gateway port; set AMC_GATEWAY_PORT to change it) is already in use.`);
    await expect(runStudioForeground({ workspace: path, env: { AMC_PROXY_PORT: String(busy) }, apiPort: 0, metricsPort: 0, dashboardPort: 0, gatewayPort: 0, gatewayHost: "127.0.0.1", proxyPort: busy }))
      .rejects.toThrow(`Port ${busy} (from AMC_PROXY_PORT) is already in use.`);
    expect(openSessions(path)).toBe(0);
  }, 120_000);

  test("a busy default port falls back to a free one", async () => {
    const path = workspace();
    await hold(3212); // null when another Studio on this shared machine already holds it: busy either way
    const runtime = await runStudioForeground({ workspace: path, env: {}, metricsPort: 0, ...others });
    try {
      expect(runtime.state.apiPort).not.toBe(3212);
      expect(runtime.state.apiPort).toBeGreaterThan(0);
    } finally {
      await runtime.stop();
    }
  }, 120_000);

  test("a failure after the gateway started closes what started, so no session stays open", async () => {
    const path = workspace();
    const gatewayPort = (await hold())!;
    await new Promise<void>((done) => holders.pop()!.close(() => done()));
    // 192.0.2.1 (TEST-NET-1) is on no interface: the API's listen fails after the gateway, metrics and dashboard started.
    await expect(runStudioForeground({ workspace: path, env: {}, apiHost: "192.0.2.1", gatewayHost: "127.0.0.1", metricsPort: 0, ...others, gatewayPort }))
      .rejects.toThrow(/EADDRNOTAVAIL|address not available/i);
    expect(openSessions(path)).toBe(0);
    expect(await listening(gatewayPort)).toBe(false);
  }, 120_000);
});

describe("host mode", () => {
  test("the router reports its bound port for port 0", async () => {
    const hostDir = dir("amc-port-policy-host-");
    initHostDb(hostDir);
    const router = await startWorkspaceRouter({ hostDir, host: "127.0.0.1", port: 0 });
    try {
      expect(router.port).toBeGreaterThan(0);
      expect(await listening(router.port)).toBe(true);
    } finally {
      await router.close();
    }
  }, 60_000);

  test("a busy configured host port is refused, never replaced", async () => {
    const hostDir = dir("amc-port-policy-host-");
    const busy = (await hold())!;
    await expect(runStudioForeground({ workspace: dir("amc-port-policy-host-ws-"), hostDir, env: { AMC_HOST_PORT: String(busy) } }))
      .rejects.toThrow(/EADDRINUSE/);
  }, 120_000);
});
