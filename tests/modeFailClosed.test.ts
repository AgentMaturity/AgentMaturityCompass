import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { assertOwnerMode, getMode, leaveAgentMode, setMode } from "../src/mode/mode.js";

/** DXA-49: agent mode fails closed and cannot be left without owner proof. */
const roots: string[] = [];
const PASSPHRASE = "mode-test-passphrase";
const savedPassphrase = process.env.AMC_VAULT_PASSPHRASE;

afterEach(() => {
  process.env.AMC_VAULT_PASSPHRASE = savedPassphrase;
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function bare(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-mode-"));
  roots.push(dir);
  return dir;
}

function initialised(): string {
  const dir = bare();
  process.env.AMC_VAULT_PASSPHRASE = PASSPHRASE;
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function writeModeFile(workspace: string, text: string): string {
  mkdirSync(join(workspace, ".amc"), { recursive: true });
  const file = join(workspace, ".amc", "mode.json");
  writeFileSync(file, text);
  return file;
}

describe("getMode fails closed", () => {
  test("a workspace that never entered agent mode is owner", () => {
    expect(getMode(bare())).toBe("owner");
  });

  test("a corrupt mode.json is agent", () => {
    const ws = bare();
    writeModeFile(ws, "{ not json");
    expect(getMode(ws)).toBe("agent");
    expect(() => assertOwnerMode(ws, "target set")).toThrow("blocked in agent mode");
  });

  test("an unknown or missing mode value is agent", () => {
    const ws = bare();
    writeModeFile(ws, JSON.stringify({ mode: "root" }));
    expect(getMode(ws)).toBe("agent");
    writeModeFile(ws, "null");
    expect(getMode(ws)).toBe("agent");
  });

  test.skipIf(process.getuid?.() === 0)("an unreadable mode.json is agent", () => {
    const ws = bare();
    const file = writeModeFile(ws, JSON.stringify({ mode: "owner" }));
    chmodSync(file, 0o000);
    try {
      expect(getMode(ws)).toBe("agent");
    } finally {
      chmodSync(file, 0o600);
    }
  });
});

describe("leaving agent mode needs owner proof", () => {
  test("the wrong passphrase is refused and the workspace stays in agent mode", async () => {
    const ws = initialised();
    setMode(ws, "agent");
    await expect(leaveAgentMode(ws, "wrong-passphrase")).rejects.toThrow("did not unlock");
    expect(getMode(ws)).toBe("agent");
  });

  test("an empty passphrase is refused even when AMC_VAULT_PASSPHRASE holds the right one", async () => {
    const ws = initialised();
    setMode(ws, "agent");
    await expect(leaveAgentMode(ws, "")).rejects.toThrow("needs the vault passphrase");
    expect(getMode(ws)).toBe("agent");
  });

  test("a workspace with no vault cannot leave agent mode", async () => {
    const ws = bare();
    setMode(ws, "agent");
    await expect(leaveAgentMode(ws, PASSPHRASE)).rejects.toThrow("no vault");
    expect(getMode(ws)).toBe("agent");
  });

  test("the vault passphrase switches to owner", async () => {
    const ws = initialised();
    setMode(ws, "agent");
    await leaveAgentMode(ws, PASSPHRASE);
    expect(getMode(ws)).toBe("owner");
  });

  test("owner mode needs no proof to stay owner", async () => {
    const ws = bare();
    await leaveAgentMode(ws, "");
    expect(getMode(ws)).toBe("owner");
  });
});
