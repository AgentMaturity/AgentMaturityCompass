import { afterEach, describe, expect, it, vi } from "vitest";

const seam = vi.hoisted(() => ({
  prompt: vi.fn(), install: vi.fn(), confirmRemembered: vi.fn(), unlock: vi.fn(), unlocked: false, bridge: vi.fn(), signIn: vi.fn(), order: [] as string[]
}));
vi.mock("inquirer", () => ({ default: { prompt: seam.prompt } }));
vi.mock("../src/adapters/hookIntegration.js", () => ({ installHookIntegration: seam.install }));
vi.mock("../src/vault/operatorContext.js", () => ({ confirmRememberedUnlock: seam.confirmRemembered }));
vi.mock("../src/vault/vaultCli.js", () => ({ unlockVaultInteractive: seam.unlock, vaultStatusNow: () => ({ unlocked: seam.unlocked }) }));
vi.mock("../src/studio/studioBridge.js", () => ({ requireStudioBridgeBase: seam.bridge }));
vi.mock("../src/setup/agentSignIn.js", () => ({ inspectSignIn: seam.signIn }));

import { connectWatchDeps } from "../src/studio/connectWatchIo.js";

afterEach(() => { vi.clearAllMocks(); seam.unlocked = false; seam.order = []; });

describe("amc connect's watch offer installs the way connect hooks install does", () => {
  it("names this workspace's Bridge, asks the D4 question, unlocks, then installs observe", async () => {
    seam.bridge.mockImplementation(() => { seam.order.push("bridge"); return "http://127.0.0.1:49894"; });
    seam.confirmRemembered.mockImplementation(async () => { seam.order.push("d4"); });
    seam.unlock.mockImplementation(async () => { seam.order.push("unlock"); });
    seam.install.mockImplementation(() => { seam.order.push("install"); return { changed: true, files: [{ action: "create", path: "/ws/.codex/hooks.json" }] }; });
    const lines = await connectWatchDeps("/ws").install("codex", "default");
    expect(seam.order).toEqual(["bridge", "d4", "unlock", "install"]);
    expect(seam.confirmRemembered).toHaveBeenCalledWith("/ws", "connect hooks install");
    expect(seam.install).toHaveBeenCalledWith({ workspace: "/ws", provider: "codex", mode: "observe", agentId: "default", bridgeBase: "http://127.0.0.1:49894" });
    expect(lines.join("\n")).toContain("Next (in Codex, not in AMC):");
    expect(lines.join("\n")).toContain("amc connect hooks status --provider codex");
  });

  it("refuses before any question when no Studio runs here", async () => {
    seam.bridge.mockImplementation(() => { throw new Error("Start AMC here first: amc up."); });
    await expect(connectWatchDeps("/ws").install("claude-code", "default")).rejects.toThrow("Start AMC here first");
    expect(seam.confirmRemembered).not.toHaveBeenCalled();
    expect(seam.install).not.toHaveBeenCalled();
  });

  it("skips the unlock when the vault is open, and reports an existing hook", async () => {
    seam.unlocked = true;
    seam.bridge.mockReturnValue("http://127.0.0.1:1");
    seam.install.mockReturnValue({ changed: false, files: [] });
    const lines = await connectWatchDeps("/ws").install("claude-code", "default");
    expect(seam.unlock).not.toHaveBeenCalled();
    expect(lines[0]).toBe("AMC hook already installed");
  });

  it("asks with inquirer and treats Ctrl-C as no", async () => {
    const deps = connectWatchDeps("/ws", () => undefined);
    seam.prompt.mockResolvedValueOnce({ picked: "claude" }).mockResolvedValueOnce({ ok: true });
    await expect(deps.choose("?", [{ name: "a", value: "claude" }])).resolves.toBe("claude");
    await expect(deps.confirm("?")).resolves.toBe(true);
    seam.prompt.mockRejectedValue(new Error("force closed"));
    await expect(deps.choose("?", [])).resolves.toBeNull();
    await expect(deps.confirm("?")).resolves.toBe(false);
    seam.signIn.mockReturnValue([]);
    expect(deps.signIn()).toEqual([]);
  });
});
