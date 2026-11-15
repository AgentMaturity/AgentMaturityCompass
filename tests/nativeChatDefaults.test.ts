import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupModelPrice } from "../src/product/modelPricing.js";
import { chatDefaults } from "../src/setup/nativeInteractiveSession.js";
import { applyStarterProfile } from "../src/setup/starterProfiles.js";
import { initWorkspace } from "../src/workspace.js";

/** Chat with a real provider used to start with no tools and 512 output tokens: cut-off answers and nothing editable. */
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); });

function workspace(coding: boolean): string {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "chat-defaults-test");
  const ckpt = realpathSync(mkdtempSync(join(tmpdir(), "amc-chat-defaults-ckpt-")));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(ckpt, "checkpoints"));
  const ws = realpathSync(mkdtempSync(join(tmpdir(), "amc-chat-defaults-")));
  dirs.push(ws, ckpt);
  initWorkspace({ workspacePath: ws });
  if (coding) applyStarterProfile(ws, "coding", { username: "chat-owner", password: "chat-owner-password" });
  return ws;
}

describe("native chat defaults", () => {
  it("offers the workspace tools behind approvals in a coding workspace, with the model's output limit", () => {
    const ws = workspace(true);
    const catalog = lookupModelPrice("gpt-4o-mini")?.maxOutputTokens;
    expect(catalog).toBeGreaterThan(512);
    expect(chatDefaults(ws, "openai", "gpt-4o-mini")).toEqual({ tools: "workspace", maxTokens: String(Math.min(catalog!, 16384)), asksBeforeEffects: true });
    expect(chatDefaults(ws, "openai", "a-model-the-catalog-does-not-know").maxTokens).toBe("8192");
    expect(chatDefaults(ws, "stub", null).maxTokens).toBe("512");
  });

  it("keeps tools off where the workspace is not ready for them (no firewall policy)", () => {
    const ws = workspace(false);
    expect(chatDefaults(ws, "openai", "gpt-4o-mini")).toMatchObject({ tools: "none", asksBeforeEffects: false });
    expect(chatDefaults(ws, "stub", null).tools).toBe("echo");
  });
});
