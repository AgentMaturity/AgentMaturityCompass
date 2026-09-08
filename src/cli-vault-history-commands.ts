/** Vault history admission and rotation commands, kept outside the main CLI. */
import type { Command } from "commander";
import chalk from "chalk";
import type { KeyHistoryRole } from "./crypto/keyHistoryEnvelope.js";
import { rotateVaultKeysInteractive } from "./vault/vaultCli.js";

interface HistoryMigrationOptions {
  role: string;
  expectedSha256: string;
  approveFingerprint: string[];
}

export function registerVaultHistoryCommands(vault: Command): void {
  vault.command("history").description("Review and explicitly migrate signing-key history")
    .command("migrate")
    .requiredOption("--role <role>", "monitor, auditor, lease, or session")
    .requiredOption("--expected-sha256 <hash>", "SHA-256 of the exact history file reviewed")
    .option("--approve-fingerprint <fingerprints...>", "Explicitly admit these reviewed historical key fingerprints; otherwise retain only current key", [])
    .description("Authenticate only current and explicitly approved keys; preserve original untrusted bytes")
    .action(async (opts: HistoryMigrationOptions) => {
      if (!["monitor", "auditor", "lease", "session"].includes(opts.role)) throw new Error("Invalid key history role");
      const { migratePublicKeyHistory } = await import("./crypto/keys.js");
      const result = migratePublicKeyHistory({
        workspace: process.cwd(),
        kind: opts.role as KeyHistoryRole,
        expectedSha256: opts.expectedSha256,
        approvedFingerprints: opts.approveFingerprint
      });
      console.log(JSON.stringify(result, null, 2));
    });
}

export function registerVaultRotationCommand(vault: Command): void {
  vault
    .command("rotate-keys")
    .description("Rotate monitor signing key and append to public key history")
    .action(async () => {
      const rotated = await rotateVaultKeysInteractive(process.cwd());
      console.log(chalk.green(`Monitor key rotated: ${rotated.fingerprint}`));
      console.log(`Public key path: ${rotated.publicKeyPath}`);
      console.log(`Rotation receipt: ${rotated.rotationReceiptPath}`);
      console.log(`Recovery files: ${rotated.recoveryDirectory}`);
    });
}
