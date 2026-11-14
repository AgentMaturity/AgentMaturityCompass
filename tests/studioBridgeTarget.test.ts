import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bridgeTargetIssue, previousStudioApiPort, requireStudioBridgeBase, runningStudioBridgeBase } from "../src/studio/studioBridge.js";
import { writeStudioState, type StudioState } from "../src/studio/studioState.js";
import { listenOnPolicyPort } from "../src/studio/studioLifecycle.js";

const roots: string[] = [];
afterEach(() => { while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true }); });

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-studio-bridge-"));
  roots.push(root);
  mkdirSync(join(root, ".amc"), { recursive: true });
  return root;
}

const state = (over: Partial<StudioState> = {}): StudioState => ({ pid: process.pid, startedTs: 1, apiPort: 63742, gatewayPort: 3210, proxyPort: 0,
  dashboardPort: 4173, host: "127.0.0.1", currentAgent: "default", vaultUnlocked: true, untrustedConfig: false, logFile: "x", ...over });

describe("hooks send events to this workspace's own Studio", () => {
  it("reads the Bridge origin of the Studio running here, and nothing when none runs", () => {
    const ws = workspace();
    expect(runningStudioBridgeBase(ws)).toBeNull();
    writeStudioState(ws, state());
    expect(runningStudioBridgeBase(ws)).toBe("http://127.0.0.1:63742");
    expect(runningStudioBridgeBase(ws, () => false), "a stale state file is not a running Studio").toBeNull();
    writeStudioState(ws, state({ host: "0.0.0.0" }));
    expect(runningStudioBridgeBase(ws)).toBe("http://127.0.0.1:63742");
  });

  it("uses an explicit --bridge-url, else the running Studio, else refuses with the fix instead of guessing", () => {
    const ws = workspace();
    expect(requireStudioBridgeBase(ws, "http://127.0.0.1:9999")).toBe("http://127.0.0.1:9999");
    expect(() => requireStudioBridgeBase(ws, undefined)).toThrow("Start AMC here first: amc up");
    writeStudioState(ws, state());
    expect(requireStudioBridgeBase(ws, undefined)).toBe("http://127.0.0.1:63742");
  });

  it("remembers the API port past amc down, so the next amc up can keep it", () => {
    const ws = workspace();
    expect(previousStudioApiPort(ws)).toBeNull();
    writeStudioState(ws, state());
    rmSync(join(ws, ".amc", "studio", "state.json"));
    expect(previousStudioApiPort(ws)).toBe(63742);
    writeFileSync(join(ws, ".amc", "studio", "last-api-port"), "not-a-port");
    expect(previousStudioApiPort(ws)).toBeNull();
  });

  it("names a hook that sends somewhere other than this workspace's Studio, with the reinstall command", () => {
    const issue = bridgeTargetIssue({ installed: "http://127.0.0.1:3212", running: "http://127.0.0.1:63742", provider: "claude-code", mode: "observe" });
    expect(issue).toContain("http://127.0.0.1:3212");
    expect(issue).toContain("http://127.0.0.1:63742");
    expect(issue).toContain("amc connect hooks install --provider claude-code --mode observe");
    expect(bridgeTargetIssue({ installed: "http://127.0.0.1:3212", running: "http://127.0.0.1:3212", provider: "claude-code", mode: "observe" })).toBeNull();
    expect(bridgeTargetIssue({ installed: "http://127.0.0.1:3212", running: null, provider: "codex", mode: null })).toBeNull();
  });
});

describe("amc up keeps this workspace's previous port while it is free", () => {
  const servers: Server[] = [];
  afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done)))); });
  const busy = async (): Promise<number> => {
    const server = createServer();
    servers.push(server);
    await new Promise<void>((done) => server.listen({ host: "127.0.0.1", port: 0 }, () => done()));
    return (server.address() as { port: number }).port;
  };
  const start = async (port: number) => {
    const server = createServer();
    servers.push(server);
    await new Promise<void>((done, fail) => { server.once("error", fail); server.listen({ host: "127.0.0.1", port }, () => done()); });
    return { port: (server.address() as { port: number }).port };
  };

  it("prefers the previous port and says so", async () => {
    const previous = await busy();
    await new Promise((done) => servers.pop()!.close(done)); // free again
    const lines: string[] = [];
    const started = await listenOnPolicyPort({ label: "Studio API", port: await busy(), source: null, preferredPort: previous, start, log: (line) => lines.push(line) });
    expect(started.port).toBe(previous);
    expect(lines.join("\n")).toContain(`listening on ${previous}`);
  });

  it("falls back to the default, then any free port, when the previous one is taken", async () => {
    const previous = await busy();
    const lines: string[] = [];
    const defaultPort = await busy();
    const started = await listenOnPolicyPort({ label: "Studio API", port: defaultPort, source: null, preferredPort: previous, start, log: (line) => lines.push(line) });
    expect([previous, defaultPort]).not.toContain(started.port);
    expect(lines.join("\n")).toContain(`port ${defaultPort} was busy`);
  });

  it("never lets a previous port override a configured one", async () => {
    const configured = await busy();
    await expect(listenOnPolicyPort({ label: "Studio API", port: configured, source: "--port", preferredPort: 1, start })).rejects.toThrow(/already in use/);
  });
});
