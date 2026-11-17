/**
 * `amc keys list|rotate|revoke|export-public` (P1-08, freeze exception P1-08). Rotation and revocation write signed,
 * anchored statements and lists in this workspace; they never change a verifier's pins by themselves.
 */
import { existsSync, readFileSync } from "node:fs";
import type { Command } from "commander";
import { exportPublicKey, listKeys, resumeKeyRotation, revokeKeyAsync, rotatePurposeKeys, type KeyRevocationReason } from "./purposeKeys.js";
import { acceptAdoptedKeyset, boundProviderKey, quarantineUnboundPurposeFiles, restoreCommittedKeyset } from "./keyset.js";
import { configuredRef, loadKeysConfig } from "./keysConfig.js";
import { bindPurposeProviderKey, exportPurposePublicKey } from "./purposeProviders.js";
import { unlockVault, vaultEnvelopeKeyIds } from "../vault/vault.js";
import { ROTATION_REASONS, type RotationReason } from "./rotationStatement.js";
import { assertOwnerMode } from "../mode/mode.js";
import { promptPassphrase } from "../vault/vaultCli.js";
import { isLocalPurpose, type LocalPurpose } from "../vault/vaultPayload.js";
import { transitionConfigSignatureProvider } from "./configProviderTransition.js";
import { resumeArtifactBlobAnchors } from "./artifactBlobAnchors.js";
import { CONFIG_REL } from "./keysConfig.js";
import { join, resolve } from "node:path";
import { vaultPassphraseFromEnv } from "../vault/passphraseFile.js";

function purposeOption(value: string | undefined): LocalPurpose {
  if (value === undefined || !isLocalPurpose(value)) {
    throw new Error("--purpose must be one of ledger-row, receipt, artifact-seal, revocation-list, config-signature, lease, session");
  }
  return value;
}

interface RotateOptions {
  purpose?: string; reason?: string; overlapDays?: string; rootKey?: string[]; resume?: boolean; restore?: boolean;
  accept?: string; digest?: string; allowGap?: string; quarantineUnboundPub?: boolean;
  configCandidate?: string;
}

export async function rotateKeysForCli(workspace: string, opts: RotateOptions): Promise<unknown> {
  const repairs = [opts.restore, opts.accept !== undefined, opts.quarantineUnboundPub].filter(Boolean).length;
  if (repairs > 0) {
    if (repairs > 1 || opts.resume || opts.purpose !== undefined || opts.reason !== undefined || opts.rootKey !== undefined || opts.configCandidate !== undefined) {
      throw new Error("--restore, --accept and --quarantine-unbound-pub each run alone");
    }
    assertOwnerMode(workspace, "keys rotate (key-set repair)");
    // Every repair opens the workspace vault with the owner's passphrase.
    const passphrase = vaultPassphraseFromEnv() ?? (await promptPassphrase("Vault passphrase (owner):"));
    const vaultKeyIds = (bytes: Buffer) => vaultEnvelopeKeyIds(bytes.toString("utf8"), passphrase);
    if (opts.quarantineUnboundPub) return quarantineUnboundPurposeFiles(workspace, { vaultKeyIds });
    if (opts.accept !== undefined) {
      if (!/^[1-9][0-9]{0,15}$/.test(opts.accept) || !/^[0-9a-f]{64}$/i.test(opts.digest ?? "")) throw new Error("--accept <generation> needs --digest <sha256>, as `amc keys list` shows it on the committing machine");
      return acceptAdoptedKeyset(workspace, { generation: Number(opts.accept), digest: opts.digest!, vaultKeyIds, allowGap: opts.allowGap });
    }
    return restoreCommittedKeyset(workspace, { vaultKeyIds });
  }
  if (opts.resume) {
    if (opts.purpose !== undefined || opts.reason !== undefined || opts.rootKey !== undefined || opts.configCandidate !== undefined) throw new Error("--resume takes no other options");
    const passphrase = vaultPassphraseFromEnv() ?? (await promptPassphrase("Vault passphrase (owner):"));
    const result = resumeKeyRotation(workspace, passphrase);
    if (boundProviderKey(workspace, "artifact-seal")?.binding.blobIndexAuthoritySha256 !== undefined) unlockVault(workspace, passphrase);
    const artifactAnchors = await resumeArtifactBlobAnchors(workspace);
    return artifactAnchors === null ? result : { ...result, artifactAnchors };
  }
  const purpose = purposeOption(opts.purpose);
  if (opts.configCandidate !== undefined && purpose !== "config-signature") throw new Error("--config-candidate only works with --purpose config-signature");
  if (purpose === "config-signature" && (opts.configCandidate !== undefined || boundProviderKey(workspace, purpose) !== null
    || configuredRef(loadKeysConfig(workspace), purpose) !== null)) {
    if (opts.rootKey !== undefined || opts.reason === "key-compromise") throw new Error("provider key-compromise config transitions need explicit pinned-root handling and are not supported yet");
    if (opts.reason !== undefined && !(ROTATION_REASONS as readonly string[]).includes(opts.reason)) throw new Error(`--reason must be one of ${ROTATION_REASONS.join(", ")}`);
    const candidate = readFileSync(opts.configCandidate ?? join(workspace, CONFIG_REL));
    return transitionConfigSignatureProvider(workspace, candidate, {
      passphrase: vaultPassphraseFromEnv() ?? (await promptPassphrase("Vault passphrase (owner):")),
      reason: opts.reason as RotationReason | undefined, overlapDays: opts.overlapDays === undefined ? undefined : Number(opts.overlapDays)
    });
  }
  // P2-08: a purpose whose keys.refs names a provider key is bound to that key (and, for ledger-row, its delegation renewed).
  if (configuredRef(loadKeysConfig(workspace), purpose) !== null) {
    if (opts.reason !== undefined || opts.overlapDays !== undefined || opts.rootKey !== undefined) throw new Error("--reason, --overlap-days and --root-key do not apply to a provider key (keys.refs); it is bound, not generated");
    return bindPurposeProviderKey(workspace, purpose, { passphrase: vaultPassphraseFromEnv() ?? (await promptPassphrase("Vault passphrase (owner):")) });
  }
  if (opts.reason !== undefined && !(ROTATION_REASONS as readonly string[]).includes(opts.reason)) throw new Error(`--reason must be one of ${ROTATION_REASONS.join(", ")}`);
  const overlapDays = opts.overlapDays === undefined ? undefined : Number(opts.overlapDays);
  const passphrase = vaultPassphraseFromEnv() ?? (await promptPassphrase("Passphrase for key rotation:"));
  return rotatePurposeKeys({
    workspace, purposes: [purpose], reason: opts.reason as RotationReason | undefined, overlapDays, passphrase,
    rootPrivateKeyPems: (opts.rootKey ?? []).map(path => readFileSync(path, "utf8"))
  });
}

/** `amc keys revoke --passport`: records the revocation here and publishes the signed list; 1 when the list was not signed. */
async function revokePassportForCli(workspace: string, target: string, reason: string): Promise<number> {
  assertOwnerMode(workspace, "keys revoke --passport");
  const { passportRevokeForApi } = await import("../passport/passportApi.js");
  const { inspectPassportArtifact } = await import("../passport/passportArtifact.js");
  // A .amcpass file, or the id of one under .amc/passport/exports.
  const file = target.endsWith(".amcpass") && existsSync(resolve(workspace, target)) ? resolve(workspace, target) : undefined;
  const passportId = file === undefined ? target : inspectPassportArtifact(file).passport.passportId;
  const out = passportRevokeForApi({ workspace, passportId, reason, ...(file === undefined ? {} : { file }) });
  if (out === null) throw new Error(`no passport ${passportId} was exported from this workspace; pass its .amcpass file instead`);
  console.log(`Passport ${passportId} is revoked on this machine.`);
  if (out.signedList === null) {
    console.error(`The signed passport revocation list was not published, so people outside this workspace cannot see it yet: ${out.signedListError}`);
    console.error("Unlock the vault (amc vault unlock) and run this command again.");
    return 1;
  }
  console.log(`Signed revocation list: ${out.signedList.path}`);
  console.log(`List ${out.signedList.listId}, sequence ${out.signedList.sequence}, issued ${out.signedList.issuedAt}.`);
  console.log("Share this file with the people who check your passports; amc-verify reads it with --revocation-list.");
  return 0;
}

export function registerKeysCommands(program: Command): void {
  const keys = program.command("keys").description("Purpose signing keys: list, rotate, revoke and export public keys");
  keys.command("list")
    .description("List each signing purpose's key id, shared keys, history size, rotations, provider, algorithm and protection (public files only)")
    .option("--json", "print JSON")
    .action((opts: { json?: boolean }) => {
      const listed = listKeys(process.cwd());
      if (opts.json) { console.log(JSON.stringify(listed, null, 2)); return; }
      console.log(`key set generation: ${listed.generation ?? "none"}${listed.complete ? "" : ` (INCOMPLETE: ${listed.detail})`}`);
      for (const row of listed.purposes) {
        const holder = `${row.provider} ${row.algorithm} protection=${row.protection} (${row.protectionBasis})${row.providerKeyId ? ` provider key ${row.providerKeyId}` : ""}`;
        console.log(`${row.purpose.padEnd(18)} ${row.keyId ?? "missing"} history=${row.historyKeys} rotations=${row.rotations}${row.sharedWith.length ? ` shared with ${row.sharedWith.join(", ")}` : ""} ${holder}`);
      }
    });
  keys.command("rotate")
    .description("Rotate one purpose's key with a signed, chained statement (or bind the provider key keys.refs names); --resume completes or rolls back an interrupted change")
    .option("--purpose <purpose>", "ledger-row, receipt, artifact-seal, revocation-list, config-signature, lease or session")
    .option("--config-candidate <file>", "with --purpose config-signature: owner-endorsed candidate YAML, published atomically with its provider binding")
    .option("--reason <reason>", `${ROTATION_REASONS.join(", ")} (default: scheduled, or purpose-split for a shared key)`)
    .option("--overlap-days <n>", "days both keys may be valid (0-30, default 7; none for key-compromise)")
    .option("--root-key <file...>", "trust-list root private key file(s) held outside AMC; key-compromise needs one")
    .option("--resume", "complete or roll back an interrupted key change")
    .option("--restore", "owner mode: put back the key set this machine committed, from the copies in AMC home")
    .option("--accept <generation>", "owner mode, on a machine that adopted the key set: accept this newer generation (with --digest)")
    .option("--digest <sha256>", "with --accept: the key-set digest `amc keys list` shows on the committing machine")
    .option("--allow-gap <reason>", "with --accept: accept a generation that skips others, stating why (20+ characters)")
    .option("--quarantine-unbound-pub", "owner mode, with no keyset.json: move purpose key files no key set binds to .amc/quarantine/keys/")
    .action(async (opts: RotateOptions) => {
      console.log(JSON.stringify(await rotateKeysForCli(process.cwd(), opts), null, 2));
    });
  keys.command("revoke")
    .description("Record a retired key's revocation in the workspace's signed, anchored key revocation list; with --passport, a passport's revocation in the signed passport revocation list others can check")
    .option("--purpose <purpose>", "the purpose the key served (required without --passport)")
    .option("--key-id <id>", "64 hex key id (required without --passport)")
    .option("--passport <id|file.amcpass>", "revoke this passport instead of a key, and publish the signed passport revocation list")
    .requiredOption("--reason <reason>", "key-compromise, superseded or unspecified; for a passport, a short reason in words")
    .action(async (opts: { purpose?: string; keyId?: string; passport?: string; reason: string }) => {
      if (opts.passport !== undefined) { process.exitCode = await revokePassportForCli(process.cwd(), opts.passport, opts.reason); return; }
      if (opts.purpose === undefined || opts.keyId === undefined) throw new Error("amc keys revoke needs --purpose and --key-id, or --passport <passportId>");
      const passphrase = vaultPassphraseFromEnv() ?? (await promptPassphrase("Vault passphrase (owner):"));
      const revoked = await revokeKeyAsync(process.cwd(), purposeOption(opts.purpose), opts.keyId, opts.reason as KeyRevocationReason, passphrase);
      console.log(JSON.stringify(revoked, null, 2));
      if (revoked.trustConfig.status === "refused") {
        console.error(`The revocation is recorded, but .amc/trust.yaml is refused (${revoked.trustConfig.reason}). Recover with: ${revoked.trustConfig.recovery}`);
      }
    });
  keys.command("export-public")
    .description("Print a purpose's public key, key id and proof of possession, for an organisation's trust list")
    .requiredOption("--purpose <purpose>", "the purpose to export")
    .action(async (opts: { purpose: string }) => {
      const purpose = purposeOption(opts.purpose);
      // A provider-held key (P2-08): its public key and a proof of possession signed by the provider, nothing else.
      const exported = boundProviderKey(process.cwd(), purpose) === null ? exportPublicKey(process.cwd(), purpose) : await exportPurposePublicKey(process.cwd(), purpose);
      console.log(JSON.stringify(exported, null, 2));
    });
}
