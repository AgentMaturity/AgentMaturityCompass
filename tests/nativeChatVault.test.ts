import { describe, expect, it, vi } from "vitest";
import { chatVaultPassphrase, type ChatVaultDeps } from "../src/setup/nativeChatVault.js";

const deps = (over: Partial<ChatVaultDeps> = {}): ChatVaultDeps => ({
  env: {},
  vaultExists: () => true,
  operator: () => true,
  remembered: () => "remembered-pass",
  opensWith: (_workspace, passphrase) => passphrase === "remembered-pass" || passphrase === "typed-pass",
  ask: vi.fn(async () => "typed-pass"),
  ...over
});

describe("chat vault passphrase resolved in the parent", () => {
  it("hands the children the remembered passphrase for an interactive operator, without asking", async () => {
    const d = deps();
    await expect(chatVaultPassphrase("/ws", d)).resolves.toBe("remembered-pass");
    expect(d.ask).not.toHaveBeenCalled();
  });
  it("leaves the environment's passphrase or file to the children as they inherit it", async () => {
    await expect(chatVaultPassphrase("/ws", deps({ env: { AMC_VAULT_PASSPHRASE: "x" } }))).resolves.toBeNull();
    await expect(chatVaultPassphrase("/ws", deps({ env: { AMC_VAULT_PASSPHRASE_FILE: "/f" } }))).resolves.toBeNull();
  });
  it("does nothing without a vault, and never for an agent or a shell without a terminal", async () => {
    await expect(chatVaultPassphrase("/ws", deps({ vaultExists: () => false }))).resolves.toBeNull();
    const agent = deps({ operator: () => false });
    await expect(chatVaultPassphrase("/ws", agent)).resolves.toBeNull();
    expect(agent.ask).not.toHaveBeenCalled();
  });
  it("asks once when nothing is remembered, or when the remembered one no longer opens the vault", async () => {
    await expect(chatVaultPassphrase("/ws", deps({ remembered: () => null }))).resolves.toBe("typed-pass");
    const stale = deps({ remembered: () => "old-pass" });
    await expect(chatVaultPassphrase("/ws", stale)).resolves.toBe("typed-pass");
    expect(stale.ask).toHaveBeenCalledTimes(1);
  });
  it("returns null when the operator cancels the question", async () => {
    await expect(chatVaultPassphrase("/ws", deps({ remembered: () => null, ask: async () => null }))).resolves.toBeNull();
  });
});
