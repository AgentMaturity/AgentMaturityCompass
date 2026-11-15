import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupModelPrice } from "../src/product/modelPricing.js";
import { chatApprovalMode, chatDefaults } from "../src/setup/nativeInteractiveSession.js";
import { actionPolicyState } from "../src/tools/guards/actionPolicyGuard.js";
import { applyStarterProfile } from "../src/setup/starterProfiles.js";
import { initWorkspace } from "../src/workspace.js";

/** Chat with a real provider used to start with no tools and 512 output tokens: cut-off answers and nothing editable. */
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); });

function workspace(kind: "coding" | "regulated" | null, actionPolicy = true): string {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "chat-defaults-test");
  const ckpt = realpathSync(mkdtempSync(join(tmpdir(), "amc-chat-defaults-ckpt-")));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(ckpt, "checkpoints"));
  const ws = realpathSync(mkdtempSync(join(tmpdir(), "amc-chat-defaults-")));
  dirs.push(ws, ckpt);
  initWorkspace({ workspacePath: ws, actionPolicy });
  if (kind !== null) applyStarterProfile(ws, kind, { username: "chat-owner", password: "chat-owner-password" });
  return ws;
}

describe("native chat defaults", () => {
  it("offers the workspace tools behind approvals in a coding workspace, with the model's output limit", () => {
    const ws = workspace("coding");
    const catalog = lookupModelPrice("gpt-4o-mini")?.maxOutputTokens;
    expect(catalog).toBeGreaterThan(512);
    expect(chatDefaults(ws, "openai", "gpt-4o-mini")).toEqual({ tools: "workspace", maxTokens: String(Math.min(catalog!, 16384)), asksBeforeEffects: true });
    expect(chatDefaults(ws, "openai", "a-model-the-catalog-does-not-know").maxTokens).toBe("8192");
    expect(chatDefaults(ws, "stub", null).maxTokens).toBe("512");
  });

  it("keeps tools off where the workspace is not ready for them (no firewall policy)", () => {
    const ws = workspace(null);
    expect(chatDefaults(ws, "openai", "gpt-4o-mini")).toMatchObject({ tools: "none", asksBeforeEffects: false });
    expect(chatDefaults(ws, "stub", null).tools).toBe("echo");
  });

  it("keeps workspace tools off by default where no Action Policy is signed, even when the toolset is ready", () => {
    // As in a workspace created without a policy: "not configured" passes readiness but governs nothing.
    const ws = workspace("regulated", false);
    expect(actionPolicyState(ws)).toBe("not configured");
    expect(chatDefaults(ws, "openai", "gpt-4o-mini").tools).toBe("none");
    expect(chatDefaults(ws, "stub", null).tools).toBe("echo");
  });

  it("always sets an approval gate when tools are on by default, and keeps a person's explicit choice", () => {
    const noFlag = { tools: "workspace", asksBeforeEffects: false };
    expect(chatApprovalMode({}, noFlag), "signed policy without executeOnApproval").toBe("default");
    expect(chatApprovalMode({}, { ...noFlag, asksBeforeEffects: true })).toBe("default");
    expect(chatApprovalMode({ tools: "workspace" }, { ...noFlag, asksBeforeEffects: true })).toBe("default");
    expect(chatApprovalMode({}, { tools: "echo", asksBeforeEffects: false })).toBeUndefined();
    expect(chatApprovalMode({ tools: "workspace" }, noFlag), "the person chose tools without a gate").toBeUndefined();
    expect(chatApprovalMode({ approvalMode: "accept-edits" }, noFlag)).toBe("accept-edits");
    expect(chatApprovalMode({ approveTools: "WRITE_LOW" }, noFlag)).toBeUndefined();
  });
});
