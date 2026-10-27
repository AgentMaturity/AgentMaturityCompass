/**
 * CLI surface for the evidence stores: receipt delegation chains, and the
 * staged consolidation of the databases that sit outside evidence.sqlite.
 *
 * Its own module because cli.ts is at its ratchet floor — every command added
 * there has to displace something — and because these commands are about where
 * evidence lives rather than about any one product surface.
 */
import type { Command } from "commander";
import chalk from "chalk";
import { join } from "node:path";
import { LEDGER_UNANCHORED_MESSAGE } from "./ledger/ledgerVerification.js";
import type { IssuerAdmission } from "./trust/admission.js";
import { isKeyRefused } from "./trust/signatureCheck.js";

export function registerEvidenceStoreCommands(program: Command): void {
  program
    .command("receipts-chain")
    .description("Show full delegation chain for a receipt")
    .argument("<receiptId>", "receipt ID to trace")
    .action(async (receiptId: string) => {
      const { verifyDelegationChain, renderDelegationChainMarkdown } = await import("./receipts/receiptChain.js");
      // In practice, public keys would be loaded from workspace
      const publicKeys: string[] = [];
      try {
        const { getPublicKeyHistory } = await import("./crypto/keys.js");
        const keys = getPublicKeyHistory(process.cwd(), "monitor");
        publicKeys.push(...keys);
      } catch { /* no keys */ }
      const result = verifyDelegationChain(receiptId, publicKeys, process.cwd());
      console.log(renderDelegationChainMarkdown(result));
      const { countStoredReceipts } = await import("./receipts/receiptChain.js");
      if (!result.valid && countStoredReceipts(process.cwd()) === 0) {
        // Otherwise "not found in store" reads as a mistyped id, when in fact
        // this workspace has never recorded a chained receipt: the ledger mints
        // plain receipts, and delegation chains come only from callers that opt
        // into mintChainedReceipt.
        console.log(
          chalk.yellow(
            "No chained receipts are recorded in this workspace, so no delegation chain can be traced yet."
          )
        );
      }
    });

  // ── Store consolidation ─────────────────────────────────────────────────
  const stores = program
    .command("evidence-stores")
    .description("Inspect the staged consolidation of databases outside evidence.sqlite");

  stores
    .command("parity")
    .description("Compare the legacy guard-event store against the consolidated one")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      const { compareGuardEventStores, currentStage } = await import(
        "./storage/consolidation/guardEventConsolidation.js"
      );
      const workspace = process.cwd();
      const legacyDbPath =
        process.env.AMC_GUARD_EVENTS_DB_PATH ?? join(workspace, ".amc", "guard_events.sqlite");
      const comparison = compareGuardEventStores({ workspace, legacyDbPath });
      if (opts.json) {
        console.log(JSON.stringify({ stage: currentStage(), ...comparison }, null, 2));
        return;
      }
      console.log(chalk.bold("\nGuard event store parity"));
      console.log(chalk.gray("Stage:            "), currentStage());
      console.log(chalk.gray("Legacy rows:      "), comparison.legacyRows);
      console.log(chalk.gray("Consolidated rows:"), comparison.consolidatedRows);
      if (comparison.identical) {
        console.log(chalk.green("\nStores agree. Cutover is safe: set AMC_GUARD_EVENTS_STAGE=CUTOVER."));
        return;
      }
      console.log(chalk.yellow("\nStores differ — do not cut over yet."));
      if (comparison.missingFromConsolidated.length > 0) {
        // Almost always history written before dual-write was switched on,
        // which is what backfill exists to close.
        console.log(
          chalk.gray("  Missing from evidence.sqlite:"),
          comparison.missingFromConsolidated.length,
          chalk.gray("(run: amc evidence-stores backfill)")
        );
      }
      if (comparison.missingFromLegacy.length > 0) {
        console.log(chalk.gray("  Present only in evidence.sqlite:"), comparison.missingFromLegacy.length);
      }
      if (comparison.divergent.length > 0) {
        // Same id, different content: not a timing gap, so backfill will not
        // fix it and cutover would silently pick a winner.
        console.log(chalk.red("  Same id, different content:"), comparison.divergent.length);
      }
      process.exitCode = 1;
    });

  stores
    .command("encrypt")
    .description("Encrypt existing inline evidence payloads under the ledger data key (P2-09)")
    .option("--key-provider <id>", "provider of the wrapping key for a new data key (default: file)")
    .option("--key-ref <id>", "wrapping key id: KMS ARN or name, Key Vault URL, PKCS#11 URI, or a vault wrap-key name")
    .option("--rotate-key", "add a new data key version first; old rows keep theirs")
    .option("--rewrap", "re-wrap every data key version (under --key-ref when given) and stop; no ciphertext changes")
    .option("--json", "Output as JSON")
    .action(async (opts: { keyProvider?: string; keyRef?: string; rotateKey?: boolean; rewrap?: boolean; json?: boolean }) => {
      const { encryptExistingLedger } = await import("./ledger/encryption/encryptMigration.js");
      const { rewrapDataKeys, rotateDataKey } = await import("./ledger/encryption/dataKeys.js");
      const { KEY_PROVIDER_IDS } = await import("./keys/provider.js");
      const workspace = process.cwd();
      const provider = KEY_PROVIDER_IDS.find((id) => id === (opts.keyProvider ?? "file"));
      if (!provider) throw new Error(`--key-provider must be one of ${KEY_PROVIDER_IDS.join(", ")}`);
      const ref = opts.keyRef ? { provider, id: opts.keyRef } : undefined;
      if (opts.rewrap) {
        const keys = await rewrapDataKeys(workspace, { ref });
        console.log(opts.json ? JSON.stringify({ rewrapped: keys.map((key) => key.keyVersion) }) : chalk.green(`Re-wrapped ${keys.length} ledger data key version(s).`));
        return;
      }
      if (opts.rotateKey) await rotateDataKey(workspace, { ref });
      const result = await encryptExistingLedger(workspace, { ref });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(chalk.green(`Encrypted ${result.receipt.rowsEncrypted} row(s) under data key version ${result.receipt.keyVersion}; ${result.receipt.rowsSkipped} already encrypted.`));
      console.log(chalk.gray(`Chain head unchanged: ${result.receipt.chainHeadAfter}`));
      console.log(chalk.gray(`Signed receipt: ${result.receiptPath}`));
    });

  stores
    .command("worm-export")
    .description("Export signed retention segments to an object-lock (WORM) bucket under a retention lock that cannot be shortened (P2-09)")
    .requiredOption("--bucket <name>", "S3 bucket with Object Lock enabled")
    .requiredOption("--retain-days <n>", "retain each segment this many days after its last event")
    .option("--prefix <prefix>", "key prefix inside the bucket", "")
    .option("--region <region>", "bucket region (default: the AWS SDK's)")
    .option("--json", "Output as JSON")
    .action(async (opts: { bucket: string; retainDays: string; prefix: string; region?: string; json?: boolean }) => {
      const { exportRetentionSegments } = await import("./ops/retention/wormExport.js");
      const { s3ObjectLockTarget } = await import("./ops/retention/wormTargets.js");
      const days = Number(opts.retainDays);
      if (!Number.isInteger(days) || days < 1) throw new Error("--retain-days must be a positive integer");
      const receipt = await exportRetentionSegments({ workspace: process.cwd(), target: s3ObjectLockTarget({ bucket: opts.bucket, prefix: opts.prefix, region: opts.region }),
        retainUntil: (segment) => new Date(segment.endTs + days * 86_400_000) });
      if (opts.json) {
        console.log(JSON.stringify(receipt, null, 2));
        return;
      }
      console.log(chalk.green(`Exported ${receipt.segments} segment(s): ${receipt.uploaded.length} object(s) uploaded, ${receipt.alreadyPresent.length} already held under lock.`));
      console.log(chalk.gray(`Signed index: ${receipt.indexKey} (local copy ${receipt.localIndexPath})`));
      console.log(chalk.gray("WORM export designed for SEC 17a-4-style retention; AMC makes no regulatory claim about it."));
    });

  stores
    .command("worm-verify")
    .description("Verify a downloaded WORM export offline against a trust list (P2-09)")
    .requiredOption("--index <file>", "the downloaded worm-export-index.json object")
    .requiredOption("--objects <dir>", "directory holding the downloaded objects by key")
    .requiredOption("--trust-list <file>", "signed trust list pinning the artifact-seal key")
    .action(async (opts: { index: string; objects: string; trustList: string }) => {
      const { verifyWormExport } = await import("./ops/retention/wormExport.js");
      const verdict = verifyWormExport({ indexFile: opts.index, objectsDir: opts.objects, trustList: opts.trustList });
      if (verdict.ok) {
        console.log(chalk.green("WORM export verified: every object, segment signature and chain link checks out under the pinned key."));
        return;
      }
      for (const error of verdict.errors) console.log(chalk.red(`  ${error}`));
      process.exitCode = 1;
    });

  stores
    .command("backfill")
    .description("Copy guard events written before dual-write into evidence.sqlite")
    .action(async () => {
      const { backfillGuardEvents, compareGuardEventStores } = await import(
        "./storage/consolidation/guardEventConsolidation.js"
      );
      const workspace = process.cwd();
      const legacyDbPath =
        process.env.AMC_GUARD_EVENTS_DB_PATH ?? join(workspace, ".amc", "guard_events.sqlite");
      // Additive and idempotent: it inserts what is absent, rewrites nothing,
      // and never touches the legacy file.
      const { copied } = backfillGuardEvents({ workspace, legacyDbPath });
      console.log(chalk.green(`Copied ${copied} guard event(s) into evidence.sqlite.`));
      const comparison = compareGuardEventStores({ workspace, legacyDbPath });
      console.log(
        comparison.identical
          ? chalk.green("Stores now agree.")
          : chalk.yellow("Stores still differ — run: amc evidence-stores parity")
      );
    });
}

/**
 * Renders a ledger verdict together with what it actually rests on.
 *
 * Every signature is checked against `.amc/keys/monitor_ed25519.pub`, which lives inside the workspace, so someone
 * who can rewrite the evidence can replace that key and re-sign everything (tests/ledgerTrustRootAnchor.test.ts does
 * exactly that). Since P0-09 an unanchored verdict is a failure, not a pass with a note: only a monitor key pinned
 * outside the workspace turns it into evidence, and --allow-unanchored gives an integrity-only result.
 */
export function renderLedgerVerdict(result: {
  ok: boolean;
  trustRoot: { anchored: boolean; monitorFingerprint: string | null; expectedFingerprint: string | null; monitorAdmission?: IssuerAdmission };
}, allowUnanchored = false): string {
  const fingerprint = result.trustRoot.monitorFingerprint;
  if (!result.ok) return chalk.red("Ledger verification FAILED");
  if (result.trustRoot.anchored) {
    return `${chalk.green("Ledger verification PASSED")}\n${chalk.gray(`  Anchored to the pinned monitor key ${fingerprint ?? ""}`)}`;
  }
  const admission = result.trustRoot.monitorAdmission;
  if (admission && isKeyRefused(admission)) {
    return chalk.red(`Ledger verification FAILED: monitor key ${admission.status}. ${admission.detail ?? ""}`);
  }
  const headline = allowUnanchored
    ? chalk.yellow("Ledger integrity verified, UNTRUSTED: UNANCHORED (--allow-unanchored). This proves internal consistency only.")
    : chalk.red(LEDGER_UNANCHORED_MESSAGE);
  // The full key id, so an operator can compare it with the fingerprint recorded outside the workspace and pin that.
  return `${headline}\n${chalk.gray(`  Signed by monitor key ${fingerprint ?? "(absent)"}, read from inside the workspace.`)}`;
}
