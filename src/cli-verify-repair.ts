/**
 * `amc verify --repair [--apply [--yes]]` (P0-45). Plan mode diagnoses and changes nothing. --apply moves a failing
 * evidence store into .amc/quarantine/ after a confirmation, a legal-hold check and a signing pre-flight, and writes a
 * receipt signed as REPAIR_RECEIPT; when every failure is an interrupted legacy session's missing seal it seals those
 * sessions with a signed marker instead (D-INT-8, no confirmation: nothing moves). Exit codes: 0 verified, nothing to
 * do, or the repair done and verified; 1 verification failed and nothing changed; 2 refused.
 */
import { createInterface } from "node:readline/promises";
import chalk from "chalk";
import { holdVerdict, withLegalHoldLock } from "./residency/legalHoldRegistry.js";
import { prepareFileSignatureWithAuditor } from "./org/orgSigner.js";
import { KEY_PROVIDER_ERRORS, KeyProviderError } from "./keys/provider.js";
import {
  prepareVerifyRepairAsync, archivedStores, planVerifyRepair, QUARANTINE_DIR, RepairRefused, RepairPublicationError, sealPlannedSessions,
  type HoldState, type RepairPlan
} from "./ledger/verifyRepair.js";

/** All workspace data kinds and sessions; registry uncertainty remains unknown. */
function workspaceLegalHolds(workspace: string): HoldState {
  try {
    // Preserve the repair executor's existing active/none/unknown contract.
    const verdict = holdVerdict({ workspace });
    if (verdict.verdict === "held") return { state: "active", holdIds: [...verdict.holdIds] };
    if (verdict.verdict === "clear") return { state: "none" };
    return { state: "unknown", reason: verdict.reason };
  } catch (error) {
    return { state: "unknown", reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Prints the archived-store note after any verdict; the note is never optional. */
export function printArchivedStoreNote(workspace: string): void {
  const { receipts, interrupted } = archivedStores(workspace);
  if (receipts.length > 0) {
    console.log(chalk.yellow(`Note: ${receipts.length} archived evidence store(s) failed verification; latest receipt: ${receipts.at(-1)}`));
  }
  for (const dir of interrupted) {
    console.log(chalk.yellow(`Warning: ${dir} holds a repair plan but no receipt; a repair was interrupted. repair-plan.json lists its files.`));
  }
}

function printPlan(plan: RepairPlan): void {
  const counts = Object.entries(plan.errorCounts).map(([kind, count]) => `${kind} ${count}`).join(", ");
  console.log(chalk.red(`Verification FAILED (${counts})`));
  for (const error of plan.errors.slice(0, 10)) console.log(`- ${error}`);
  if (plan.errors.length > 10) console.log(chalk.gray(`  ... and ${plan.errors.length - 10} more`));
  if (plan.action === "seal_interrupted_sessions") {
    console.log("Recovery plan: every failure is an interrupted session's missing seal. --apply would append one signed interrupted-sealed marker to each and seal it:");
    for (const session of plan.sessions ?? []) {
      console.log(`  ${session.sessionId} (${session.runtime}; last signed activity ${Math.floor(session.tailAgeMs / 60_000)} min ago)`);
    }
    console.log(chalk.gray("  Confirm each writer is dead first (amc status, the tool's process): a session written to after its seal fails verification."));
    return;
  }
  if (plan.action === "none") {
    console.log(plan.chainOk
      ? "The evidence chain verified; only configuration signatures failed. Re-sign those configs; the evidence needs no repair."
      : "No evidence store is present to archive. Repair cannot recover evidence that is gone.");
    return;
  }
  if (plan.errorCounts.payload_mismatch) {
    console.log(chalk.yellow("Blob payloads also fail authentication while the vault is locked; unlock it (AMC_VAULT_PASSPHRASE) and re-run before archiving."));
  }
  const total = plan.files.reduce((sum, file) => sum + file.bytes, 0);
  console.log("Recovery plan: archive the evidence store. --apply would move these files:");
  for (const file of plan.files) console.log(`  ${file.path} (${file.bytes} bytes)`);
  console.log(`  ${plan.files.length} file(s), ${total} bytes, to ${QUARANTINE_DIR}/<id>/ with a signed receipt. .amc/reports and every other file stay in place.`);
  console.log(chalk.gray("  A ledger with holes cannot verify, so the whole store moves. Every original byte stays in the quarantine folder."));
}

async function confirmArchive(yes: boolean): Promise<boolean> {
  if (yes) return true;
  if (!process.stdin.isTTY) return false;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await prompt.question("Type archive to move these files into quarantine: ")).trim() === "archive";
  } finally {
    prompt.close();
  }
}

const VAULT_LOCKED = "Refused: the vault is locked; run `amc vault unlock` (or set AMC_VAULT_PASSPHRASE) and retry. Nothing was changed.";

/** seal_interrupted_sessions --apply: seals every planned session or none, then verifies again and prints the verdict. */
function applySeal(workspace: string, plan: RepairPlan, expectedMonitorFingerprint?: string): number {
  try {
    const sealed = sealPlannedSessions(workspace, plan);
    console.log(chalk.green(`Sealed ${sealed.length} interrupted session(s), each with a signed interrupted-sealed marker: ${sealed.join(", ")}`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // vault.ts throws a plain Error for a locked vault, not a KeyProviderError; the sealing transaction has rolled back.
    console.log(chalk.red(message.startsWith("🔐 Vault locked") ? VAULT_LOCKED : `Refused: ${message}. Nothing was changed.`));
    return 2;
  }
  const after = planVerifyRepair(workspace, expectedMonitorFingerprint ? { expectedMonitorFingerprint } : {});
  if (after.verified) console.log(chalk.green("Verification passed."));
  else console.log(chalk.red(`Verification FAILED after sealing: ${after.errors.slice(0, 5).join("; ")}`));
  return after.verified ? 0 : 1;
}

async function applyPlan(workspace: string, plan: RepairPlan, yes: boolean): Promise<number> {
  if (!await confirmArchive(yes)) {
    console.log(chalk.red("Refused: --apply needs a typed confirmation on a terminal, or --yes. Nothing has been changed."));
    return 2;
  }
  try {
    const prepared = await prepareVerifyRepairAsync(workspace, plan, {
      legalHolds: () => workspaceLegalHolds(workspace),
      prepareSignature: (path, bytes, beforeSign) => prepareFileSignatureWithAuditor(workspace, path, bytes, "REPAIR_RECEIPT", beforeSign)
    });
    const { receipt } = withLegalHoldLock(workspace, () => prepared.apply());
    console.log(chalk.green(`Archived ${receipt.moved.length} file(s) to ${QUARANTINE_DIR}/${receipt.id}/`));
    console.log(`Receipt: ${QUARANTINE_DIR}/${receipt.id}/repair-receipt.json (signed as REPAIR_RECEIPT)`);
    console.log(chalk.gray("To restore: move each file back to the path its receipt names, then run amc verify."));
    return 0;
  } catch (error) {
    const message = error instanceof RepairPublicationError ? error.message
      : error instanceof KeyProviderError && Object.hasOwn(KEY_PROVIDER_ERRORS, error.code) ? `${error.code}: repair signing refused before quarantine`
      : error instanceof RepairRefused ? "repair preconditions refused; no evidence was moved"
      : "repair preparation or publication refused; inspect the policy and retained repair plan";
    console.log(chalk.red(error instanceof RepairPublicationError ? `Repair aborted: ${message}` : `Refused: ${message}`));
    return 2;
  }
}

export async function runVerifyRepair(opts: { apply: boolean; yes: boolean; expectedMonitorFingerprint?: string }): Promise<number> {
  const workspace = process.cwd();
  const plan = planVerifyRepair(workspace, opts.expectedMonitorFingerprint ? { expectedMonitorFingerprint: opts.expectedMonitorFingerprint } : {});
  let code: number;
  if (plan.verified) {
    console.log(chalk.green("Verification passed; nothing to repair. Nothing has been changed."));
    code = 0;
  } else {
    printPlan(plan);
    switch (opts.apply ? plan.action : "none") {
      case "archive_evidence_store":
        code = await applyPlan(workspace, plan, opts.yes);
        break;
      case "seal_interrupted_sessions": // --yes is accepted and ignored: nothing moves
        code = applySeal(workspace, plan, opts.expectedMonitorFingerprint);
        break;
      default:
        console.log("Nothing has been changed.");
        if (plan.action === "archive_evidence_store") {
          console.log(chalk.gray("Run amc verify --repair --apply to archive the store (asks to type archive; --yes in scripts)."));
        } else if (plan.action === "seal_interrupted_sessions") {
          console.log(chalk.gray("Run amc verify --repair --apply to seal them."));
        }
        code = 1;
    }
  }
  printArchivedStoreNote(workspace);
  return code;
}
