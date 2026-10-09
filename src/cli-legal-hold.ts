import { resolve } from "node:path";
import chalk from "chalk";

export interface LegalHoldCommandOptions {
  issue: boolean;
  release?: string;
  list: boolean;
  init: boolean;
  rebind: boolean;
  acceptUnverifiedLegacy: boolean;
  tenant?: string;
  reason?: string;
  issuedBy?: string;
}

export async function runLegalHoldCommand(opts: LegalHoldCommandOptions, workspace: string): Promise<void> {
  opts = { ...opts };
  workspace = resolve(workspace);
  if (opts.rebind && !opts.init) throw new Error("--rebind requires --init.");
  if (opts.acceptUnverifiedLegacy && opts.release === undefined)
    throw new Error("--accept-unverified-legacy requires --release <id>.");
  const operations = Number(opts.issue) + Number(opts.release !== undefined) + Number(opts.list) + Number(opts.init);
  if (operations > 1) throw new Error("Choose one operation: --issue, --release, --list, or --init.");
  if (opts.release !== undefined && !opts.release.trim()) throw new Error("--release requires a nonempty hold ID.");
  if (operations === 0) {
    console.log(chalk.red("Use --issue with --tenant/--reason/--issued-by, --release <id>, or --list."));
    return;
  }

  if (opts.init) {
    const registry = await import("./residency/legalHoldRegistry.js");
    const snapshot = registry.initLegalHoldRegistry(workspace, { rebind: opts.rebind });
    console.log(snapshot.unverifiedLegacy.length > 0
      ? chalk.yellow(`Legal hold registry: ${snapshot.holdsChecked} records checked; existing records preserved. ${snapshot.unverifiedLegacy.length} unverified legacy records still block deletion.`)
      : chalk.green(`Legal hold registry ready: ${snapshot.holdsChecked} records checked; existing records preserved.`));
    for (const legacy of snapshot.unverifiedLegacy) {
      console.log(`  Unverified legacy hold: ${legacy.holdId} — raw SHA-256: ${legacy.sha256}`);
    }
    return;
  }

  const dr = await import("./compliance/dataResidency.js");
  if (opts.list) {
    const holds = dr.getActiveLegalHolds(opts.tenant, workspace);
    if (holds.length === 0) {
      console.log(chalk.green("No active legal holds."));
      return;
    }
    for (const h of holds) {
      console.log(`  ${chalk.bold(h.holdId)} — Tenant: ${h.tenantId} — ${h.reason} (by ${h.issuedBy})`);
    }
    return;
  }
  if (opts.release !== undefined) {
    let released: boolean;
    if (opts.acceptUnverifiedLegacy) {
      const registry = await import("./residency/legalHoldRegistry.js");
      released = registry.releaseScopedLegalHold(workspace, opts.release, { acceptUnverifiedLegacy: true });
    } else {
      released = dr.releaseLegalHold(opts.release, workspace);
    }
    console.log(released ? chalk.green(`Legal hold ${opts.release} released.`) : chalk.red("Hold not found or already released."));
    return;
  }
  if (opts.issue && opts.tenant && opts.reason && opts.issuedBy) {
    const hold = dr.issueLegalHold({ tenantId: opts.tenant, reason: opts.reason, issuedBy: opts.issuedBy }, workspace);
    console.log(chalk.green(`Legal hold issued: ${hold.holdId}`));
    return;
  }
  console.log(chalk.red("Use --issue with --tenant/--reason/--issued-by, --release <id>, or --list."));
}
