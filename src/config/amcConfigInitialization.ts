/** Fixed initializer recipe: early YAML body, then best-effort late raw CONFIG-SIGNATURE sidecar. */
import { randomBytes } from "node:crypto";
import { closeSync, constants, fchmodSync, fstatSync, lstatSync, openSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import YAML from "yaml";
import { parseAMCConfigBytes } from "../workspace.js";
import { canonicalSigningKey, verifyWithKey } from "../keys/algorithmPolicy.js";
import { assertKeysetComplete, boundProviderKey, keysetCommittedMark } from "../keys/keyset.js";
import { keyPolicy, loadKeysConfig, parseKeysSection } from "../keys/keysConfig.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { assertSigningKeyUsable, assertVaultMaySign, getSigningPublicKeyPem } from "../keys/signingKeys.js";
import { assertOrgPairsCurrent, captureOrgFiles, captureOrgPairs, orgPairBytes } from "../org/preparedOrgPairs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { vaultStatus } from "../vault/vault.js";
import { captureConfigSignatureAuthority } from "./configSignaturePair.js";
import { withAmcConfigPublicationLock } from "./configPublicationLock.js";

type Progress = { path: string; stage: string; attempted: true; returned: boolean; acknowledged?: boolean };
class AmcInitializationNativeError extends Error {
  readonly code = "AMC_INITIALIZATION_NATIVE_PARTIAL";
  constructor(cause: unknown, readonly closeCauses: readonly unknown[], readonly cleanupCauses: readonly unknown[], readonly progress: readonly Readonly<Progress>[]) {
    super("AMC initializer native publication did not complete; prior effects remain", { cause });
    this.name = "AmcInitializationNativeError";
  }
}

/** Original public equality only. No private-key probe, implicit unlock, or new generation is acquired here. */
export function captureAmcConfigInitialization(workspace: string, trustBoundaryMode?: "isolated" | "shared") {
  const noSignAtEntry = process.env.AMC_NO_SIGN === "1";
  const enabled = () => { if (noSignAtEntry || process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize mature workspace signing"); };
  enabled();
  const mark = keysetCommittedMark(workspace);
  if (mark === null) throw new Error("mature initialization needs the original committed key-set mark");
  const originalMark = canonicalize(mark), keyset = assertKeysetComplete(workspace);
  if (keyset === null) throw new Error("mature initialization needs an existing complete key set");
  const originalKeyset = canonicalize(keyset), file = join(workspace, ".amc", "amc.config.yaml"), sigPath = `${file}.sig`;
  const previous = captureOrgPairs([file]), originalBytes = orgPairBytes(previous, file);
  const config = parseAMCConfigBytes(originalBytes);
  if (trustBoundaryMode) config.security.trustBoundaryMode = trustBoundaryMode;
  const bytes = Buffer.from(YAML.stringify(config)), digest = sha256Hex(bytes);
  const originalPolicy = canonicalize(keyPolicy(parseKeysSection(originalBytes)));
  const bound = boundProviderKey(workspace, "config-signature"), originalBinding = canonicalize(bound), holder = bound?.binding.provider ?? "file";
  const publicKeyPem = bound?.publicKeyPem ?? getSigningPublicKeyPem(workspace, "config-signature"), algorithm = canonicalSigningKey(publicKeyPem)?.algorithm;
  if (algorithm === undefined) throw new Error("original initializer config signer is unsupported");
  // Already-unlocked is a bounded eligibility observation, not proof of a v2 private envelope or original cached key.
  if (holder === "file" && !vaultStatus(workspace).unlocked) throw new Error("unlock the original config vault before mature initialization");
  const expected = new Map(previous.members.map(row => [row.path, row]));
  const progress: Progress[] = [], returnedPaths: string[] = [];
  let bodyPublished = false, lateEntered = false, signatureCurrent: (() => void) | null = null;
  let lateFailure: { cause: unknown } | null = null;
  const snapshot = () => Object.freeze(progress.map(row => Object.freeze({ ...row })));
  const publicCurrent = () => {
    enabled();
    if (canonicalize(keysetCommittedMark(workspace)) !== originalMark || canonicalize(assertKeysetComplete(workspace)) !== originalKeyset
      || canonicalize(keyPolicy(loadKeysConfig(workspace))) !== originalPolicy
      || canonicalize(boundProviderKey(workspace, "config-signature")) !== originalBinding)
      throw new Error("original initializer config authority changed; prior vault/native effects remain");
    assertSigningKeyUsable(workspace, "config-signature", publicKeyPem, holder);
    const policy = keyPolicy(loadKeysConfig(workspace));
    if (!policy.allowed.includes(algorithm) || (holder === "file" && policy.requireNonExportable)) throw new Error("original initializer config policy refuses signing");
    if (holder === "file") {
      if (!vaultStatus(workspace).unlocked) throw new Error("original initializer config vault is locked");
      assertVaultMaySign(workspace, "config-signature");
      if (getSigningPublicKeyPem(workspace, "config-signature") !== publicKeyPem) throw new Error("original initializer public config key changed");
    }
    enabled();
  };
  const assertCurrent = () => { publicCurrent(); signatureCurrent?.(); publicCurrent(); assertOrgPairsCurrent({ members: [...expected.values()] }); };
  const operation = <T>(path: string, stage: string, run: () => T): T => {
    const row: Progress = { path, stage, attempted: true, returned: false }; progress.push(row);
    const result = run(); row.returned = true; return result;
  };
  // Only the two fixed AMC members reach this native writer. No caller supplies a destination or prepared authority.
  const writeMember = (sidecar: boolean, intended: Buffer, beforeMember: () => void) => {
    const destination = sidecar ? sigPath : file;
    const temporary = operation(destination, "stage-name", () => join(dirname(file), `.amc-init-${randomBytes(12).toString("hex")}.tmp`));
    let descriptor: number | null = null, identity: string | null = null, renamed = false, failed = false, primary: unknown;
    const closeCauses: unknown[] = [], cleanupCauses: unknown[] = [];
    try {
      beforeMember(); assertCurrent();
      descriptor = operation(temporary, "open-exclusive", () => openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600));
      const opened = operation(temporary, "fstat-open", () => fstatSync(descriptor!)); identity = `${opened.dev}:${opened.ino}`;
      if (!opened.isFile() || opened.nlink !== 1) throw new Error("initializer staging member is not a private regular file");
      operation(temporary, "write", () => writeFileSync(descriptor!, intended));
      operation(temporary, "chmod", () => fchmodSync(descriptor!, 0o644));
    } catch (cause) { failed = true; primary = cause; }
    finally {
      if (descriptor !== null) {
        try { operation(temporary, "close", () => closeSync(descriptor!)); }
        catch (cause) { closeCauses.push(cause); }
      }
    }
    if (!failed && closeCauses.length === 0) {
      try {
        const staged = captureOrgFiles([temporary]).members[0]!, stat = lstatSync(temporary);
        if (staged.identity !== identity || staged.mode !== 0o644 || staged.bytes === null || !staged.bytes.equals(intended) || stat.nlink !== 1)
          throw new Error("initializer staging identity or bytes changed before rename");
        beforeMember(); assertCurrent();
        operation(destination, "rename", () => renameSync(temporary, destination)); renamed = true; returnedPaths.push(destination);
        const own = operation(destination, "acknowledge", () => captureOrgFiles([destination]).members[0]!);
        if (own.identity !== identity || own.mode !== 0o644 || own.bytes === null || !own.bytes.equals(intended))
          throw new Error("initializer AMC destination is not its returned staging inode and bytes");
        progress[progress.length - 1]!.acknowledged = true; expected.set(destination, own);
      } catch (cause) { failed = true; primary = cause; }
    }
    if (!renamed && identity !== null) {
      try {
        let currentIdentity: string | null = null;
        try { const current = lstatSync(temporary); currentIdentity = `${current.dev}:${current.ino}`; }
        catch (cause) { if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause; }
        if (currentIdentity !== null) {
          if (currentIdentity !== identity) throw new Error("initializer does not own the remaining staging pathname; cleanup refused");
          operation(temporary, "cleanup", () => unlinkSync(temporary));
        }
      } catch (cause) { cleanupCauses.push(cause); }
    }
    if (failed || closeCauses.length > 0 || cleanupCauses.length > 0)
      throw new AmcInitializationNativeError(failed ? primary : closeCauses[0] ?? cleanupCauses[0], Object.freeze(closeCauses), Object.freeze(cleanupCauses), snapshot());
  };
  publicCurrent(); assertCurrent();
  return Object.freeze({
    assertCurrent,
    get nativeProgress() { return snapshot(); },
    get returnedPaths(): readonly string[] { return Object.freeze([...returnedPaths]); },
    get lateSignatureFailure() { return lateFailure; },
    publishBody(beforeMember: () => void) {
      if (bodyPublished) throw new Error("initializer AMC body was already published");
      beforeMember(); assertCurrent();
      operation(file, "amc-config-lock", () => withAmcConfigPublicationLock(workspace, () => {
        beforeMember(); assertCurrent(); writeMember(false, bytes, beforeMember); bodyPublished = true;
      }));
      beforeMember(); assertCurrent();
    },
    async signLate(beforeMember: () => void): Promise<void> {
      if (!bodyPublished || lateEntered) throw new Error("initializer AMC signature stage is out of order");
      lateEntered = true;
      try {
        beforeMember(); assertCurrent();
        const original = captureConfigSignatureAuthority(workspace);
        // The real local gate may have migrated; never adopt a changed generation after earlier waits.
        beforeMember(); assertCurrent(); original.assertCurrent();
        const beforeSign = () => { beforeMember(); assertCurrent(); original.assertCurrent(); enabled(); };
        const signed = await signWithPurposeKey(workspace, "config-signature", Buffer.from(digest, "hex"), { beforeSign });
        beforeSign();
        const checked = () => {
          enabled(); original.assertCurrent(); assertPurposePublicationCurrent(workspace, original.captured, signed);
          if (!verifyWithKey(Buffer.from(digest, "hex"), publicKeyPem, signed.signature))
            throw new Error("initializer AMC response is not the original config signer's actual signature");
          enabled();
        };
        checked(); signatureCurrent = checked;
        operation(sigPath, "amc-config-lock", () => withAmcConfigPublicationLock(workspace, () => {
          beforeMember(); assertCurrent();
          // Date remains selected at the actual old sidecar publication stage, after Sign.
          const sidecar = Buffer.from(JSON.stringify({ configSha256: digest, signature: signed.signature.toString("base64"), signedTs: Date.now(), signer: "auditor" }, null, 2));
          writeMember(true, sidecar, beforeMember); beforeMember(); assertCurrent();
        }));
      } catch (cause) { lateFailure = Object.freeze({ cause }); throw cause; }
    }
  });
}
