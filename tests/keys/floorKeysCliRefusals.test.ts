/**
 * `amc keys rotate|revoke|export-public` refusals, checked in-process before any key changes: repair options run alone,
 * --accept needs a well-formed generation and digest, --config-candidate only with config-signature, a provider
 * transition refuses --root-key and key-compromise, revoke needs a key or a passport, and a passport id this workspace
 * never exported is named in the refusal.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureSigningKeys } from "../../src/crypto/keys.js";
import { registerKeysCommands, rotateKeysForCli } from "../../src/keys/keysCli.js";
import { listKeys } from "../../src/keys/purposeKeys.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";
import { createPassportArtifact } from "../../src/passport/passportArtifact.js";
import { defaultPassportPolicy } from "../../src/passport/passportPolicySchema.js";
import { savePassportPolicy } from "../../src/passport/passportStore.js";
import { PASSPORT_REVOCATION_LIST_REL, passportRevocationListId, readPassportRevocationList } from "../../src/passport/passportRevocationList.js";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
});
function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-floor-keys-cli-"));
  roots.push(root);
  ensureSigningKeys(root);
  return root;
}
function program(root: string): Command {
  vi.spyOn(process, "cwd").mockReturnValue(root);
  const cli = new Command().exitOverride();
  registerKeysCommands(cli);
  return cli;
}

describe("amc keys rotate refusals", () => {
  it("each key-set repair runs alone", async () => {
    const root = workspace();
    await expect(rotateKeysForCli(root, { restore: true, accept: "2" })).rejects.toThrow("--restore, --accept and --quarantine-unbound-pub each run alone");
    await expect(rotateKeysForCli(root, { quarantineUnboundPub: true, resume: true })).rejects.toThrow(/each run alone/);
    await expect(rotateKeysForCli(root, { restore: true, purpose: "receipt" })).rejects.toThrow(/each run alone/);
  });

  it("--accept needs a generation number and a 64-hex digest, and changes nothing when refused", async () => {
    const root = workspace();
    const generation = listKeys(root).generation;
    const message = "--accept <generation> needs --digest <sha256>, as `amc keys list` shows it on the committing machine";
    await expect(rotateKeysForCli(root, { accept: "0", digest: "a".repeat(64) })).rejects.toThrow(message);
    await expect(rotateKeysForCli(root, { accept: "3", digest: "not-a-digest" })).rejects.toThrow(message);
    await expect(rotateKeysForCli(root, { accept: "3" })).rejects.toThrow(message);
    expect(listKeys(root).generation).toBe(generation);
  });

  it("--config-candidate only works with --purpose config-signature", async () => {
    const root = workspace();
    await expect(rotateKeysForCli(root, { purpose: "receipt", configCandidate: "x.yaml" })).rejects.toThrow("--config-candidate only works with --purpose config-signature");
  });

  it("a config-signature provider transition refuses --root-key, key-compromise and an unknown reason", async () => {
    const root = workspace();
    const candidate = join(root, "candidate.yaml");
    writeFileSync(candidate, "keys: {}\n");
    const unsupported = /provider key-compromise config transitions need explicit pinned-root handling/;
    await expect(rotateKeysForCli(root, { purpose: "config-signature", configCandidate: candidate, rootKey: ["root.pem"] })).rejects.toThrow(unsupported);
    await expect(rotateKeysForCli(root, { purpose: "config-signature", configCandidate: candidate, reason: "key-compromise" })).rejects.toThrow(unsupported);
    await expect(rotateKeysForCli(root, { purpose: "config-signature", configCandidate: candidate, reason: "because" })).rejects.toThrow(/^--reason must be one of /);
  });
});

describe("amc keys revoke and export-public refusals", () => {
  it("revoke needs --purpose and --key-id, or --passport", async () => {
    const cli = program(workspace());
    await expect(cli.parseAsync(["node", "amc", "keys", "revoke", "--purpose", "receipt", "--reason", "superseded"]))
      .rejects.toThrow("amc keys revoke needs --purpose and --key-id, or --passport <passportId>");
    await expect(cli.parseAsync(["node", "amc", "keys", "revoke", "--key-id", "0".repeat(64), "--reason", "superseded"]))
      .rejects.toThrow(/needs --purpose and --key-id/);
  });

  it("revoke refuses a purpose that does not exist", async () => {
    const cli = program(workspace());
    await expect(cli.parseAsync(["node", "amc", "keys", "revoke", "--purpose", "release", "--key-id", "0".repeat(64), "--reason", "superseded"]))
      .rejects.toThrow(/^--purpose must be one of ledger-row, receipt, artifact-seal/);
  });

  it("revoke --passport names a passport id this workspace never exported", async () => {
    const cli = program(workspace());
    await expect(cli.parseAsync(["node", "amc", "keys", "revoke", "--passport", "pass_neverexported", "--reason", "lost laptop"]))
      .rejects.toThrow("no passport pass_neverexported was exported from this workspace; pass its .amcpass file instead");
  });

  it("revoke --passport with this workspace's .amcpass publishes the signed list; a file it did not sign is refused", async () => {
    const root = mkdtempSync(join(tmpdir(), "amc-floor-keys-cli-passport-"));
    roots.push(root);
    initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
    savePassportPolicy(root, defaultPassportPolicy());
    const created = createPassportArtifact({ workspace: root, scopeType: "WORKSPACE", outFile: "p.amcpass" });
    const printed: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => { printed.push(line); });
    const cli = program(root);
    try {
      await cli.parseAsync(["node", "amc", "keys", "revoke", "--passport", "p.amcpass", "--reason", "retired"]);
      expect(process.exitCode).toBe(0);
    } finally { process.exitCode = undefined; }
    expect(printed[0]).toBe(`Passport ${created.passport.passportId} is revoked on this machine.`);
    expect(printed[1]).toBe(`Signed revocation list: ${join(root, PASSPORT_REVOCATION_LIST_REL)}`);
    expect(printed[2]).toMatch(new RegExp(`^List ${passportRevocationListId(root)}, sequence 1, issued \\d{4}-`));
    expect(readPassportRevocationList(root)!.list.revoked).toEqual([expect.objectContaining({ id: created.passport.passportId, reason: "retired" })]);

    writeFileSync(join(root, "other.amcpass"), "not a passport archive");
    const printedBefore = printed.length;
    // The refusal text comes from the system tar (GNU and BSD word it differently), so only the outcome is checked.
    await expect(cli.parseAsync(["node", "amc", "keys", "revoke", "--passport", "other.amcpass", "--reason", "retired"])).rejects.toThrow(Error);
    expect(printed.slice(printedBefore).some((line) => line.includes("is revoked"))).toBe(false);
    expect(readPassportRevocationList(root)!.list.revoked).toHaveLength(1);
  });

  it("export-public refuses a purpose that does not exist", async () => {
    const cli = program(workspace());
    await expect(cli.parseAsync(["node", "amc", "keys", "export-public", "--purpose", "release"])).rejects.toThrow(/^--purpose must be one of/);
  });
});
