import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureSigningKeys } from "../../src/crypto/keys.js";
import { registerKeysCommands, rotateKeysForCli } from "../../src/keys/keysCli.js";
import { getSigningPublicKeyPem, listKeys } from "../../src/keys/purposeKeys.js";
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

  it("rotate binds the provider key keys.refs names instead of generating one (P2-08)", async () => {
    const root = workspace();
    const config = join(root, ".amc", "amc.config.yaml");
    writeFileSync(config, `keys:\n  refs:\n    artifact-seal: { provider: aws-kms, id: "arn:aws:kms:eu-west-1:111122223333:key/seal" }\n`);
    await expect(rotateKeysForCli(root, { purpose: "artifact-seal", reason: "scheduled" })).rejects.toThrow(/do not apply to a provider key/);
    await expect(rotateKeysForCli(root, { purpose: "artifact-seal" })).rejects.toThrow(/cannot be bound to artifact-seal yet/);
    // While artifact-seal names a provider key, every artifact-seal signer refuses, even the transparency-log seal a
    // rotation of another purpose writes; with the ref removed the vault signs again.
    const generation = listKeys(root).generation;
    await expect(rotateKeysForCli(root, { purpose: "receipt" })).rejects.toThrow(/KEY_PROVIDER_HELD/);
    // Refused before the commit, so no rotation is left unlogged.
    expect(listKeys(root).generation).toBe(generation);
    writeFileSync(config, "");
    await expect(rotateKeysForCli(root, { purpose: "receipt" })).resolves.toMatchObject({ rotated: [expect.objectContaining({ purpose: "receipt" })] });
  });

  it("list, export-public and revoke print JSON through the registered commands", async () => {
    const root = workspace();
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(root);
    const printed: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => { printed.push(line); });
    const program = new Command().exitOverride();
    registerKeysCommands(program);
    await program.parseAsync(["node", "amc", "keys", "list", "--json"]);
    expect(JSON.parse(printed.pop()!)).toMatchObject({ complete: true, purposes: expect.arrayContaining([expect.objectContaining({ purpose: "artifact-seal", provider: "file", algorithm: "ed25519", protection: "software", protectionBasis: "configured" })]) });
    await program.parseAsync(["node", "amc", "keys", "list"]);
    expect(printed.find(line => line.startsWith("artifact-seal"))).toMatch(/ file ed25519 protection=software \(configured\)$/);
    await program.parseAsync(["node", "amc", "keys", "export-public", "--purpose", "artifact-seal"]);
    expect(JSON.parse(printed.pop()!)).toMatchObject({ purpose: "artifact-seal", proofOfPossession: { signature: expect.any(String) } });
    await expect(program.parseAsync(["node", "amc", "keys", "revoke", "--purpose", "artifact-seal", "--key-id", "0".repeat(64), "--reason", "superseded"]))
      .rejects.toThrow(/not in the artifact-seal key history/);
    cwd.mockRestore();
  });
});
