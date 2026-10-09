/**
 * `amc verify --repair [--apply [--yes]]` (P0-45). Plan mode diagnoses and changes nothing. --apply moves a failing
 * evidence store into .amc/quarantine/ after a confirmation, a legal-hold check and a signing pre-flight, and writes a
 * receipt signed as REPAIR_RECEIPT. Exit codes: 0 verified, nothing to do or archive done; 1 verification failed and
 * nothing changed; 2 refused.
 */
import { createInterface } from "node:readline/promises";
import chalk from "chalk";
import { holdVerdict } from "./residency/legalHoldRegistry.js";
import { signDigestWithPolicy } from "./crypto/signing/signer.js";
import {
  applyVerifyRepair, archivedStores, planVerifyRepair, QUARANTINE_DIR, RepairRefused, type HoldState, type RepairPlan
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

async function applyPlan(workspace: string, plan: RepairPlan, yes: boolean): Promise<number> {
  if (!await confirmArchive(yes)) {
    console.log(chalk.red("Refused: --apply needs a typed confirmation on a terminal, or --yes. Nothing has been changed."));
    return 2;
  }
  try {
    const { receipt } = applyVerifyRepair(workspace, plan, {
      legalHolds: () => workspaceLegalHolds(workspace),
      sign: (digestHex) => signDigestWithPolicy({ workspace, kind: "REPAIR_RECEIPT", digestHex })
    });
    console.log(chalk.green(`Archived ${receipt.moved.length} file(s) to ${QUARANTINE_DIR}/${receipt.id}/`));
    console.log(`Receipt: ${QUARANTINE_DIR}/${receipt.id}/repair-receipt.json (signed as REPAIR_RECEIPT)`);
    console.log(chalk.gray("To restore: move each file back to the path its receipt names, then run amc verify."));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(error instanceof RepairRefused ? `Refused: ${message}. Nothing has been changed.` : `Repair aborted: ${message}`));
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
    if (plan.action === "archive_evidence_store" && opts.apply) {
      code = await applyPlan(workspace, plan, opts.yes);
    } else {
      console.log("Nothing has been changed.");
      if (plan.action === "archive_evidence_store") {
        console.log(chalk.gray("Run amc verify --repair --apply to archive the store (asks to type archive; --yes in scripts)."));
      }
      code = 1;
    }
  }
  printArchivedStoreNote(workspace);
  return code;
}
