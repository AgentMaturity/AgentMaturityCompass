/**
 * CLI surface for the vault's commitment and secret-sharing utilities.
 *
 * Carved out of cli.ts, which is under a descending line ratchet: adding the
 * disclaimers these commands need would have pushed it past its baseline. The
 * same strangler move ADR-0001 describes for packages, and the one
 * cli-composition-commands.ts already made.
 *
 * The commands are deliberately blunt about what they are. src/vault/zkPrivacy.ts
 * is not a zero-knowledge proof system — its proofs do not verify, and the one
 * check named "verify" only tested that some strings were non-empty. Presenting
 * these outputs as privacy guarantees would be the exact overstatement the rest
 * of this product exists to catch.
 */
import type { Command } from "commander";
import chalk from "chalk";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerVaultZkCommands(vault: Command): void {
  vault
    .command("zk-range-proof")
    .description("Create a range commitment for an AMC score threshold (NOT a zero-knowledge proof; unsound, does not verify)")
    .requiredOption("--value <n>", "Score value (0-100 display scale)")
    .requiredOption("--threshold <n>", "Minimum threshold to prove")
    .requiredOption("--agent <id>", "Agent ID")
    .action(async (opts: { value: string; threshold: string; agent: string }) => {
      try {
        const { createZKRangeProof } = await import("./vault/zkPrivacy.js");
        const value = parseFloat(opts.value);
        const threshold = parseFloat(opts.threshold);
        const proof = createZKRangeProof(value, threshold, opts.agent);
        console.log(chalk.bold.yellow("\n⚠  Range commitment (NOT a zero-knowledge proof)"));
        console.log(
          chalk.yellow(
            "  This construction is not sound and does not verify. It must not be\n" +
              "  offered to an auditor as evidence. See src/vault/zkPrivacy.ts."
          )
        );
        console.log(chalk.gray("Agent:"), opts.agent);
        console.log(chalk.gray("Claim:"), proof.claim);
        console.log(chalk.gray("Verified:"), proof.verified ? chalk.green("✓ yes") : chalk.red("✗ no"));
        console.log(chalk.gray("Value commitment:"), proof.valueCommitment.slice(0, 16) + "...");
        console.log(chalk.gray("Delta commitment:"), proof.deltaCommitment.slice(0, 16) + "...");
        console.log(chalk.gray("Bit proofs:"), proof.bitProofs.length);
        console.log(chalk.gray("Challenge hash:"), proof.challengeHash.slice(0, 16) + "...");
        console.log(chalk.gray("Proof ID:"), proof.id);
      } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
    });

  vault
    .command("zk-verify <proofJson>")
    .description("Check a range commitment (NOT a zero-knowledge verification; unsound)")
    .action(async (proofJson: string) => {
      try {
        const { verifyZKRangeProof } = await import("./vault/zkPrivacy.js");
        const proof = JSON.parse(proofJson);
        const valid = verifyZKRangeProof(proof);
        console.log(chalk.bold.yellow("\n⚠  Range commitment check (NOT a zero-knowledge verification)"));
        console.log(chalk.gray("Claim:"), proof.claim ?? "N/A");
        console.log(chalk.gray("Valid:"), valid ? chalk.green("✓ yes") : chalk.red("✗ no"));
      } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
    });

  vault
    .command("zk-commit")
    .description("Create a Pedersen commitment to a value")
    .requiredOption("--value <n>", "Value to commit to (integer)")
    .action(async (opts: { value: string }) => {
      try {
        const { pedersenCommit } = await import("./vault/zkPrivacy.js");
        const commitment = pedersenCommit(BigInt(Math.floor(parseFloat(opts.value))));
        console.log(chalk.bold.green("\n🔒  Pedersen Commitment"));
        console.log(chalk.gray("Value:"), opts.value);
        console.log(chalk.gray("Commitment:"), commitment.commitment.slice(0, 32) + "...");
        console.log(chalk.gray("Blinding factor:"), "[redacted]");
      } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
    });

  vault
    .command("secret-share")
    .description("Split a secret into shares using Shamir's Secret Sharing")
    .requiredOption("--secret <value>", "Secret integer value to split")
    .requiredOption("--shares <n>", "Total number of shares to create")
    .requiredOption("--threshold <k>", "Minimum shares required to reconstruct")
    .action(async (opts: { secret: string; shares: string; threshold: string }) => {
      try {
        const { shamirSplit } = await import("./vault/zkPrivacy.js");
        const secret = BigInt(Math.floor(parseFloat(opts.secret)));
        const n = parseInt(opts.shares, 10);
        const k = parseInt(opts.threshold, 10);
        // shamirSplit(secret, threshold, totalShares). These were passed the
        // other way round, so `--shares 3 --threshold 2` built a degree-2
        // polynomial and emitted 2 shares — three needed to reconstruct, two
        // in existence. The secret was unrecoverable from the moment it was
        // split, and nothing said so.
        const shares = shamirSplit(secret, k, n);
        console.log(chalk.bold.green("\n🔒  Secret Sharing"));
        console.log(chalk.gray("Total shares:"), n);
        console.log(chalk.gray("Threshold:"), k);
        console.log(chalk.gray("Shares created:"), shares.length);
        for (const share of shares) {
          const valuePreview = share.value.slice(0, 8);
          console.log(chalk.gray(`  share #${share.index}: index=${share.index} value=0x${valuePreview}... [redacted]`));
        }
      } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
    });
}
