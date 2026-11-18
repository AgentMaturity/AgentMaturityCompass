import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
  prompt: vi.fn(),
  spawnSync: vi.fn((_command: string, _args: string[], _options: { cwd: string; env: NodeJS.ProcessEnv }): { status: number | null; error?: Error } => ({ status: 0 })),
  studio: vi.fn((_workspace: string): string | null => null),
  port: vi.fn(async (_host: string, port: number) => port)
}));
vi.mock("inquirer", () => ({ default: { prompt: io.prompt } }));
vi.mock("node:child_process", async (original) => ({ ...(await original<typeof import("node:child_process")>()), spawnSync: io.spawnSync }));
vi.mock("../src/studio/studioBridge.js", () => ({ runningStudioBridgeBase: io.studio }));
vi.mock("../src/studio/studioLifecycle.js", () => ({ defaultPortOrFree: io.port }));
vi.mock("../src/setup/agentSignIn.js", () => ({ inspectSignIn: () => [] }));

const { terminalFrontDoorIo } = await import("../src/setup/frontDoor.js");

let workspace: string;
beforeEach(() => { workspace = mkdtempSync(join(tmpdir(), "amc-front-door-io-")); });
afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const make = (operatorEnv: NodeJS.ProcessEnv = { OPERATOR: "1" }) => terminalFrontDoorIo({ workspace, agentId: "default", operatorEnv,
  openUrl: () => true, showScore: async () => undefined });

describe("the front door's terminal I/O", () => {
  it("detects a recorded run, the running console and the last choice, and saves the next choice", () => {
    const terminal = make();
    expect(terminal.detect()).toMatchObject({ signIn: [], studioRunning: false, hasRun: false, lastChoice: null });
    mkdirSync(join(workspace, ".amc", "runs"), { recursive: true });
    writeFileSync(join(workspace, ".amc", "runs", "run-1.json"), "{}");
    io.studio.mockReturnValue("http://127.0.0.1:3212");
    terminal.saveChoice("console");
    expect(terminal.detect()).toMatchObject({ studioRunning: true, hasRun: true, lastChoice: "console" });
    expect(terminal.studioOrigin()).toBe("http://127.0.0.1:3212");
    expect(JSON.parse(readFileSync(join(workspace, ".amc", "front-door.json"), "utf8"))).toEqual({ lastChoice: "console" });
  });

  it("asks with inquirer and logs to the console", async () => {
    const terminal = make();
    io.prompt.mockResolvedValueOnce({ choice: "score" }).mockResolvedValueOnce({ yes: false });
    await expect(terminal.select("What do you want to do?", [{ value: "score", name: "Score" }], "score")).resolves.toBe("score");
    expect(io.prompt.mock.calls[0]![0][0]).toMatchObject({ type: "select", default: "score", choices: [{ name: "Score", value: "score" }] });
    await expect(terminal.confirm("Install the hooks?")).resolves.toBe(false);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    terminal.log("hello");
    expect(log).toHaveBeenCalledWith("hello");
  });

  it("runs amc with the operator's environment, chat with this process's, and a tool with the operator's", () => {
    const terminal = make({ OPERATOR: "1" });
    const sigintListeners = process.listenerCount("SIGINT");
    expect(terminal.runAmc(["up"], false, { EXTRA: "x" })).toBe(0);
    let call = io.spawnSync.mock.calls.at(-1)!;
    expect(call[0]).toBe(process.execPath);
    expect(call[1].slice(1)).toEqual(["up"]);
    expect(call[2]).toMatchObject({ cwd: workspace, env: { OPERATOR: "1", EXTRA: "x" } });
    expect(call[2].env.PATH).toBeUndefined();
    terminal.runAmc(["agent-loop", "chat"], true);
    expect(io.spawnSync.mock.calls.at(-1)![2].env.PATH).toBe(process.env.PATH);
    io.spawnSync.mockReturnValueOnce({ status: null, error: new Error("ENOENT") });
    expect(terminal.runTool("claude")).toBe(127);
    call = io.spawnSync.mock.calls.at(-1)!;
    expect(call[0]).toBe("claude");
    expect(call[2].env).toEqual({ OPERATOR: "1" });
    io.spawnSync.mockReturnValueOnce({ status: null });
    expect(terminal.runTool("codex")).toBe(1);
    expect(process.listenerCount("SIGINT")).toBe(sigintListeners);
  });

  it("after a child changed the vault passphrase (the coding setup), the old one is not passed to the next child (UX-01)", async () => {
    const { initWorkspace } = await import("../src/workspace.js");
    const { lockVault } = await import("../src/vault/vault.js");
    vi.stubEnv("AMC_HOME", join(workspace, "amc-home"));
    vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(workspace, "checkpoints"));
    const root = join(workspace, "ws");
    mkdirSync(root);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "the passphrase that opens it");
    initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
    lockVault(root);
    const terminal = terminalFrontDoorIo({ workspace: root, agentId: "default", operatorEnv: {}, openUrl: () => true, showScore: async () => undefined });
    terminal.runAmc(["agent-loop", "chat"], true);
    expect(process.env.AMC_VAULT_PASSPHRASE, "one that opens the vault is kept").toBe("the passphrase that opens it");
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "a passphrase the setup replaced");
    terminal.runAmc(["init", "--coding"], true);
    expect(process.env.AMC_VAULT_PASSPHRASE).toBeUndefined();
    vi.unstubAllEnvs();
  }, 60_000);

  it("offers other ports only when the default gateway port is busy and none is configured", async () => {
    await expect(make().portsIfDefaultBusy()).resolves.toBeNull();
    io.port.mockImplementation(async (_host, port) => port + 1000);
    await expect(make().portsIfDefaultBusy()).resolves.toEqual({ AMC_GATEWAY_PORT: "4210", AMC_PROXY_PORT: "4211" });
    await expect(make({ AMC_GATEWAY_PORT: "5000" }).portsIfDefaultBusy()).resolves.toBeNull();
  });
});
