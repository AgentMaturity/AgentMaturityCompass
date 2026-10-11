import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureSigningKeys } from "../../src/crypto/keys.js";
import { registerKeysCommands, rotateKeysForCli } from "../../src/keys/keysCli.js";
import { getSigningPublicKeyPem } from "../../src/keys/purposeKeys.js";
import { lockVault } from "../../src/vault/vault.js";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
});
function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-keys-cli-"));
  roots.push(root);
  ensureSigningKeys(root);
  return root;
}

describe("amc keys (P1-08, freeze exception P1-08)", () => {
  it("registers exactly list, rotate, revoke and export-public", () => {
    const program = new Command();
    registerKeysCommands(program);
    expect(program.commands.find(command => command.name() === "keys")!.commands.map(command => command.name()).sort())
      .toEqual(["export-public", "list", "revoke", "rotate"]);
  });

  it("rotate validates its options and --resume stands alone", async () => {
    const root = workspace();
    await expect(rotateKeysForCli(root, { purpose: "release" })).rejects.toThrow(/--purpose must be one of/);
    await expect(rotateKeysForCli(root, { purpose: "receipt", reason: "because" })).rejects.toThrow(/--reason must be one of/);
    await expect(rotateKeysForCli(root, { purpose: "receipt", resume: true })).rejects.toThrow(/--resume takes no other options/);
    await expect(rotateKeysForCli(root, { resume: true })).resolves.toEqual({ action: "nothing-pending", generation: null });
    const before = getSigningPublicKeyPem(root, "receipt");
    await expect(rotateKeysForCli(root, { purpose: "receipt", overlapDays: "3" })).resolves.toMatchObject({ rotated: [expect.objectContaining({ purpose: "receipt" })] });
    expect(getSigningPublicKeyPem(root, "receipt")).not.toBe(before);
    await expect(rotateKeysForCli(root, { purpose: "receipt", overlapDays: "31" })).rejects.toThrow(/between 0 and 30/);
  });

  it("list, export-public and revoke print JSON through the registered commands", async () => {
    const root = workspace();
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(root);
    const printed: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => { printed.push(line); });
    const program = new Command().exitOverride();
    registerKeysCommands(program);
    await program.parseAsync(["node", "amc", "keys", "list", "--json"]);
    expect(JSON.parse(printed.pop()!)).toMatchObject({ complete: true, purposes: expect.arrayContaining([expect.objectContaining({ purpose: "artifact-seal" })]) });
    await program.parseAsync(["node", "amc", "keys", "export-public", "--purpose", "artifact-seal"]);
    expect(JSON.parse(printed.pop()!)).toMatchObject({ purpose: "artifact-seal", proofOfPossession: { signature: expect.any(String) } });
    await expect(program.parseAsync(["node", "amc", "keys", "revoke", "--purpose", "artifact-seal", "--key-id", "0".repeat(64), "--reason", "superseded"]))
      .rejects.toThrow(/not in the artifact-seal key history/);
    cwd.mockRestore();
  });
});
