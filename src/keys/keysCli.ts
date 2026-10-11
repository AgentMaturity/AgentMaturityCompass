/**
 * `amc keys list|rotate|revoke|export-public` (P1-08, freeze exception P1-08). Rotation and revocation write signed,
 * anchored statements and lists in this workspace; they never change a verifier's pins by themselves.
 */
import { readFileSync } from "node:fs";
import type { Command } from "commander";
import { exportPublicKey, listKeys, resumeKeyRotation, revokeKey, rotatePurposeKeys, type KeyRevocationReason } from "./purposeKeys.js";
import { acceptAdoptedKeyset, quarantineUnboundPurposeFiles, restoreCommittedKeyset } from "./keyset.js";
import { vaultEnvelopeKeyIds } from "../vault/vault.js";
import { ROTATION_REASONS, type RotationReason } from "./rotationStatement.js";
import { assertOwnerMode } from "../mode/mode.js";
import { promptPassphrase } from "../vault/vaultCli.js";
import { isLocalPurpose, type LocalPurpose } from "../vault/vaultPayload.js";

function purposeOption(value: string | undefined): LocalPurpose {
  if (value === undefined || !isLocalPurpose(value)) {
    throw new Error("--purpose must be one of ledger-row, receipt, artifact-seal, revocation-list, config-signature, lease, session");
  }
  return value;
}

interface RotateOptions {
  purpose?: string; reason?: string; overlapDays?: string; rootKey?: string[]; resume?: boolean; restore?: boolean;
  accept?: string; digest?: string; quarantineUnboundPub?: boolean;
}

export async function rotateKeysForCli(workspace: string, opts: RotateOptions): Promise<unknown> {
  const repairs = [opts.restore, opts.accept !== undefined, opts.quarantineUnboundPub].filter(Boolean).length;
  if (repairs > 0) {
    if (repairs > 1 || opts.resume || opts.purpose !== undefined || opts.reason !== undefined || opts.rootKey !== undefined) {
      throw new Error("--restore, --accept and --quarantine-unbound-pub each run alone");
    }
    assertOwnerMode(workspace, "keys rotate (key-set repair)");
    if (opts.quarantineUnboundPub) return quarantineUnboundPurposeFiles(workspace);
    if (opts.accept !== undefined) {
      if (!/^[1-9][0-9]{0,15}$/.test(opts.accept) || !/^[0-9a-f]{64}$/i.test(opts.digest ?? "")) throw new Error("--accept <generation> needs --digest <sha256>, as `amc keys list` shows it on the committing machine");
      return acceptAdoptedKeyset(workspace, Number(opts.accept), opts.digest!);
    }
    // The vault is checked by its key ids, opened with the owner's passphrase.
    const passphrase = process.env.AMC_VAULT_PASSPHRASE ?? (await promptPassphrase("Passphrase to check the vault:"));
    return restoreCommittedKeyset(workspace, { vaultKeyIds: bytes => vaultEnvelopeKeyIds(bytes.toString("utf8"), passphrase) });
  }
  if (opts.resume) {
    if (opts.purpose !== undefined || opts.reason !== undefined || opts.rootKey !== undefined) throw new Error("--resume takes no other options");
    return resumeKeyRotation(workspace);
  }
  const purpose = purposeOption(opts.purpose);
  if (opts.reason !== undefined && !(ROTATION_REASONS as readonly string[]).includes(opts.reason)) throw new Error(`--reason must be one of ${ROTATION_REASONS.join(", ")}`);
  const overlapDays = opts.overlapDays === undefined ? undefined : Number(opts.overlapDays);
  const passphrase = process.env.AMC_VAULT_PASSPHRASE ?? (await promptPassphrase("Passphrase for key rotation:"));
  return rotatePurposeKeys({
    workspace, purposes: [purpose], reason: opts.reason as RotationReason | undefined, overlapDays, passphrase,
    rootPrivateKeyPems: (opts.rootKey ?? []).map(path => readFileSync(path, "utf8"))
  });
}

export function registerKeysCommands(program: Command): void {
  const keys = program.command("keys").description("Purpose signing keys: list, rotate, revoke and export public keys");
  keys.command("list")
    .description("List each signing purpose's key id, shared keys, history size and rotations (public files only)")
    .option("--json", "print JSON")
    .action((opts: { json?: boolean }) => {
      const listed = listKeys(process.cwd());
      if (opts.json) { console.log(JSON.stringify(listed, null, 2)); return; }
      console.log(`key set generation: ${listed.generation ?? "none"}${listed.complete ? "" : ` (INCOMPLETE: ${listed.detail})`}`);
      for (const row of listed.purposes) {
        console.log(`${row.purpose.padEnd(18)} ${row.keyId ?? "missing"} history=${row.historyKeys} rotations=${row.rotations}${row.sharedWith.length ? ` shared with ${row.sharedWith.join(", ")}` : ""}`);
      }
    });
  keys.command("rotate")
    .description("Rotate one purpose's key with a signed, chained statement; --resume completes or rolls back an interrupted change")
    .option("--purpose <purpose>", "ledger-row, receipt, artifact-seal, revocation-list, config-signature, lease or session")
    .option("--reason <reason>", `${ROTATION_REASONS.join(", ")} (default: scheduled, or purpose-split for a shared key)`)
    .option("--overlap-days <n>", "days both keys may be valid (0-30, default 7; none for key-compromise)")
    .option("--root-key <file...>", "trust-list root private key file(s) held outside AMC; key-compromise needs one")
    .option("--resume", "complete or roll back an interrupted key change")
    .option("--restore", "owner mode: put back the key set this machine committed, from the copies in AMC home")
    .option("--accept <generation>", "owner mode, on a machine that adopted the key set: accept this newer generation (with --digest)")
    .option("--digest <sha256>", "with --accept: the key-set digest `amc keys list` shows on the committing machine")
    .option("--quarantine-unbound-pub", "owner mode, with no keyset.json: move purpose key files no key set binds to .amc/quarantine/keys/")
    .action(async (opts: RotateOptions) => {
      console.log(JSON.stringify(await rotateKeysForCli(process.cwd(), opts), null, 2));
    });
  keys.command("revoke")
    .description("Record a retired key's revocation in the workspace's signed, anchored key revocation list")
    .requiredOption("--purpose <purpose>", "the purpose the key served")
    .requiredOption("--key-id <id>", "64 hex key id")
    .requiredOption("--reason <reason>", "key-compromise, superseded or unspecified")
    .action((opts: { purpose: string; keyId: string; reason: string }) => {
      console.log(JSON.stringify(revokeKey(process.cwd(), purposeOption(opts.purpose), opts.keyId, opts.reason as KeyRevocationReason), null, 2));
    });
  keys.command("export-public")
    .description("Print a purpose's public key, key id and proof of possession, for an organisation's trust list")
    .requiredOption("--purpose <purpose>", "the purpose to export")
    .action((opts: { purpose: string }) => {
      console.log(JSON.stringify(exportPublicKey(process.cwd(), purposeOption(opts.purpose)), null, 2));
    });
}
