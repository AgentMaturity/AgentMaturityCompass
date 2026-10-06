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
  trustRoot: { anchored: boolean; monitorFingerprint: string | null; expectedFingerprint: string | null };
}, allowUnanchored = false): string {
  const fingerprint = result.trustRoot.monitorFingerprint;
  if (!result.ok) return chalk.red("Ledger verification FAILED");
  if (result.trustRoot.anchored) {
    return `${chalk.green("Ledger verification PASSED")}\n${chalk.gray(`  Anchored to the pinned monitor key ${fingerprint?.slice(0, 16)}…`)}`;
  }
  const headline = allowUnanchored
    ? chalk.yellow("Ledger integrity verified, UNTRUSTED: UNANCHORED (--allow-unanchored). This proves internal consistency only.")
    : chalk.red(LEDGER_UNANCHORED_MESSAGE);
  return `${headline}\n${chalk.gray(`  Signed by monitor key ${fingerprint?.slice(0, 16) ?? "(absent)"}…, read from inside the workspace.`)}`;
}
