/**
 * The file provider (P2-08): today's passphrase-encrypted vault, for development. Its keys are software keys that the
 * vault can hand out, so it describes `exportable: true` and keys.requireNonExportable refuses it. `ref.id` is the
 * vault purpose for signing, or a wrap-key name for wrapKey/unwrapKey (an AES-256-GCM key kept as a vault secret).
 */
import { createCipheriv, createDecipheriv, randomBytes, sign } from "node:crypto";
import { getSigningKey, getSigningPublicKeyPem } from "../signingKeys.js";
import { getVaultSecret, setVaultSecret } from "../../vault/vault.js";
import { isLocalPurpose, type LocalPurpose } from "../../vault/vaultPayload.js";
import { signingKeyId } from "../algorithmPolicy.js";
import { KeyProviderError, type KeyProvider, type KeyRef } from "../provider.js";

const WRAP_MAGIC = Buffer.from("AMCFW1", "ascii");

function purposeOf(ref: KeyRef): LocalPurpose {
  if (!isLocalPurpose(ref.id)) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "a file key ref names a vault signing purpose");
  return ref.id;
}

function wrapSecret(workspace: string, ref: KeyRef, create: boolean): Buffer {
  const name = `amc.key-provider.file.wrap:${ref.id}`;
  let value = getVaultSecret(workspace, name);
  if (value === null) {
    if (!create) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "the vault holds no wrap key of that name");
    value = randomBytes(32).toString("base64");
    setVaultSecret(workspace, name, value);
  }
  return Buffer.from(value, "base64");
}

export function fileKeyProvider(workspace: string): KeyProvider {
  return {
    id: "file",
    async describe(ref) {
      const publicKeyPem = getSigningPublicKeyPem(workspace, purposeOf(ref));
      return { ref, algorithm: "ed25519", publicKeyPem, keyId: signingKeyId(publicKeyPem)!, protection: "software", protectionBasis: "configured", exportable: true };
    },
    async sign(ref, message) {
      return sign(null, message, getSigningKey(workspace, purposeOf(ref)));
    },
    async wrapKey(ref, plaintextKey) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", wrapSecret(workspace, ref, true), iv);
      cipher.setAAD(Buffer.from(ref.id, "utf8"));
      const body = Buffer.concat([cipher.update(plaintextKey), cipher.final()]);
      return Buffer.concat([WRAP_MAGIC, iv, cipher.getAuthTag(), body]);
    },
    async unwrapKey(ref, wrapped) {
      const bytes = Buffer.from(wrapped);
      if (bytes.length < WRAP_MAGIC.length + 28 || !bytes.subarray(0, WRAP_MAGIC.length).equals(WRAP_MAGIC)) {
        throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "not a file-provider wrapped key");
      }
      const at = WRAP_MAGIC.length;
      const decipher = createDecipheriv("aes-256-gcm", wrapSecret(workspace, ref, false), bytes.subarray(at, at + 12));
      decipher.setAAD(Buffer.from(ref.id, "utf8"));
      decipher.setAuthTag(bytes.subarray(at + 12, at + 28));
      try {
        return Buffer.concat([decipher.update(bytes.subarray(at + 28)), decipher.final()]);
      } catch {
        throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "the wrapped key does not open under this wrap key");
      }
    }
  };
}
