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

const defaults = vi.hoisted(() => ({
  prompt: vi.fn(),
  opens: vi.fn((_workspace: string, passphrase: string) => passphrase === "typed-pass"),
  remembered: vi.fn((): { passphrase: string } | null => null),
  operator: vi.fn(() => ({ ok: true }))
}));
vi.mock("inquirer", () => ({ default: { prompt: defaults.prompt } }));
vi.mock("../src/vault/vault.js", () => ({ vaultExists: () => true, vaultOpensWith: defaults.opens }));
vi.mock("../src/vault/passphraseStore.js", () => ({ operatorRememberedPassphrase: defaults.remembered }));
vi.mock("../src/vault/operatorContext.js", () => ({ interactiveOperator: defaults.operator }));

describe("chat vault passphrase with the default operator, store and question", () => {
  it("asks with a masked question that accepts only a passphrase that opens the vault", async () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    vi.stubEnv("AMC_VAULT_PASSPHRASE_FILE", "");
    let validate: ((value: string) => true | string) | undefined;
    defaults.prompt.mockImplementationOnce(async (questions: Array<{ type: string; mask: string; validate: (value: string) => true | string }>) => {
      expect(questions[0]).toMatchObject({ type: "password", mask: "*" });
      validate = questions[0]!.validate;
      return { passphrase: "typed-pass" };
    });
    await expect(chatVaultPassphrase("/ws")).resolves.toBe("typed-pass");
    expect(defaults.operator).toHaveBeenCalledWith({ workspace: "/ws" });
    expect(validate?.("typed-pass")).toBe(true);
    expect(validate?.("wrong")).toBe("That passphrase does not open this workspace's vault.");
    vi.unstubAllEnvs();
  });
  it("uses the remembered passphrase, and a cancelled question (Ctrl-C) is null", async () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    vi.stubEnv("AMC_VAULT_PASSPHRASE_FILE", "");
    defaults.remembered.mockReturnValueOnce({ passphrase: "typed-pass" });
    await expect(chatVaultPassphrase("/ws")).resolves.toBe("typed-pass");
    defaults.prompt.mockRejectedValueOnce(new Error("User force closed the prompt"));
    await expect(chatVaultPassphrase("/ws")).resolves.toBeNull();
    vi.unstubAllEnvs();
  });
});
