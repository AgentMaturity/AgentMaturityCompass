/** Internal real receipt owner publisher. Normal binder/CLI and root SDK remain unchanged. */
import Database from "better-sqlite3";
import { generateKeyPairSync } from "node:crypto";
import { join, resolve } from "node:path";
import { assertOwnerMode } from "../mode/mode.js";
import { readContainedOrNull } from "../utils/containedFs.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { encryptVaultPayload } from "../vault/vaultCrypto.js";
import { getReceiptChildKey, unlockedPayloadForKeyChange } from "../vault/vault.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { parseBlobIndexAuthority } from "./blobIndexAuthority.js";
import { signingKeyId } from "./algorithmPolicy.js";
import { commitKeyset, type KeysetWrite } from "./keyset.js";
import { prepareReceiptAuthorityOwnerPlan } from "./purposeProviders.js";
import { ReceiptAuthorityCommittedError } from "./receiptOwnerAnchors.js";
import { readOperationalLedgerContext } from "./operationalLedgerReader.js";
import { RECEIPT_AUTHORITY_CURRENT, RECEIPT_AUTHORITY_MAX_HOURS, RECEIPT_CHILD_FILE, encodeReceiptAuthority, issueReceiptAuthority, receiptAuthorityArchive, receiptAuthorityDigest, receiptAuthorityIssuer, receiptChildBytes } from "./receiptAuthority.js";
import { readReceiptAuthorityState, withReceiptAuthorityLock } from "./receiptAuthorityState.js";
import { readReceiptSqlSnapshot, receiptSqlStarts, verifyReceiptSqlMath, type ReceiptSqlSnapshot } from "./receiptSqlAuthority.js";

type Options = Omit<NonNullable<Parameters<typeof prepareReceiptAuthorityOwnerPlan>[1]>, "delegation"> & { hours?: number };
function captured(workspace: string, db: Database.Database): ReceiptSqlSnapshot {
  const context = readOperationalLedgerContext(workspace, { ledger: { workspace, db } });
  if (context.errors.length) throw new Error("receipt owner requires authenticated actual ledger prefixes");
  const snapshot = readReceiptSqlSnapshot({ workspace, db });
  verifyReceiptSqlMath(workspace, snapshot, readReceiptAuthorityState(workspace)); return snapshot;
}
/** Real used owner commit: signatures outside all locks; final SQL lock is synchronous, immediate and timeout zero. */
export async function prepareReceiptAuthorityOwner(workspace: string, options: Options = {}) {
  const root = resolve(workspace); assertOwnerMode(root, "keys rotate");
  if (process.env.AMC_NO_SIGN === "1") throw new Error("receipt authority is unavailable in no-sign mode");
  const { hours = RECEIPT_AUTHORITY_MAX_HOURS, ...opts } = options;
  if (!(Number.isFinite(hours) && hours > 0 && hours <= RECEIPT_AUTHORITY_MAX_HOURS)) throw new Error("receipt authority needs 0 < hours <= 24");
  const passphrase = opts.passphrase ?? process.env.AMC_VAULT_PASSPHRASE;
  if (!passphrase) throw new Error("receipt authority requires the vault passphrase");
  unlockedPayloadForKeyChange(root, passphrase);
  const file = join(root, ".amc/evidence.sqlite"), initial = new Database(file, { readonly: true, fileMustExist: true });
  let before: ReceiptSqlSnapshot;
  try { initial.exec("BEGIN"); before = captured(root, initial); initial.exec("COMMIT"); }
  finally { if (initial.inTransaction) initial.exec("ROLLBACK"); initial.close(); }
  const prior = readReceiptAuthorityState(root), child = generateKeyPairSync("ed25519");
  const childPublicKeyPem = child.publicKey.export({ format: "pem", type: "spki" }).toString(), childKeyId = signingKeyId(childPublicKeyPem)!;
  const privateKeyPem = child.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const plan = await prepareReceiptAuthorityOwnerPlan(root, opts);
  const foreignChildren = prior?.chain.map(grant => grant.signed.authority.childKeyId) ?? [];
  const used = [...Object.values(plan.keyset.keys), ...Object.values(plan.keyset.providers ?? {}).map(binding => binding!.keyId),
    ...(prior?.chain.flatMap(grant => [grant.signed.authority.childKeyId, grant.signed.authority.issuerKeyId]) ?? []), plan.description.keyId];
  for (const [rel, expected] of Object.entries(plan.keyset.files)) if (/^keys\/blob-index-authorities\/[0-9a-f]{64}\.json$/.test(rel)) {
    const bytes = readContainedOrNull(root, `.amc/${rel}`, 64 * 1024);
    if (bytes === null || sha256Hex(bytes) !== expected) throw new Error("blob authority pin changed while receipt owner prepared");
    const body = parseBlobIndexAuthority(bytes).authority; used.push(body.childKeyId, body.issuerKeyId); foreignChildren.push(body.childKeyId);
  }
  if (foreignChildren.includes(plan.description.keyId)) throw new Error("an operation child cannot become the receipt provider issuer");
  if (used.includes(childKeyId)) throw new Error("receipt child is not a fresh distinct operation key");
  const signed = await issueReceiptAuthority(plan.provider, plan.description, { type: "amc.receipt-authority", version: 1, workspaceId: workspaceIdFromDirectory(root),
    purpose: "receipt", operation: "ledger-receipt-token", epoch: (prior?.current.signed.authority.epoch ?? 0) + 1, previousAuthoritySha256: prior?.current.sha256 ?? null,
    starts: receiptSqlStarts(before), childKeyId, childPublicKeyPem, issuerKeyId: plan.description.keyId, notBefore: plan.now.toISOString(), notAfter: new Date(plan.now.getTime() + hours * 3_600_000).toISOString() });
  const bytes = encodeReceiptAuthority(signed), digest = receiptAuthorityDigest(signed);
  const fixed = (path: string, value: string | Buffer, mode = 0o644): KeysetWrite => ({ path: join(root, path), bytes: value, mode });
  const immutable = [fixed(receiptAuthorityArchive(digest), bytes), fixed(receiptAuthorityIssuer(plan.description.keyId), plan.description.publicKeyPem)];
  const immutablePreimages = immutable.map(write => {
    const old = readContainedOrNull(root, write.path.slice(root.length + 1), 64 * 1024);
    if (old !== null && !old.equals(Buffer.from(write.bytes))) throw new Error("immutable receipt authority path already names different bytes"); return old;
  });
  const sealed = JSON.stringify(encryptVaultPayload(receiptChildBytes(signed, privateKeyPem), passphrase), null, 2);
  const writes = [fixed(".amc/keys/receipt-provider.pub", plan.description.publicKeyPem), ...immutable, fixed(RECEIPT_AUTHORITY_CURRENT, bytes), fixed(RECEIPT_CHILD_FILE, sealed, 0o600), ...plan.historyWrites, ...plan.rotationWrites];
  const publication: { committed: ReturnType<typeof commitKeyset> | null } = { committed: null };
  try {
    plan.locked(() => withReceiptAuthorityLock(root, () => {
      const db = new Database(file, { fileMustExist: true, timeout: 0 });
      try {
        db.exec("BEGIN IMMEDIATE"); // no blocking inverted SQL/file lock order
        plan.withAnchorBoundary(() => {
          plan.recheck();
          if (canonicalize(captured(root, db)) !== canonicalize(before) || (readReceiptAuthorityState(root)?.current.sha256 ?? null) !== (prior?.current.sha256 ?? null)) throw new Error("receipt cutover prefix changed while signing; retry");
          for (const [index, write] of immutable.entries()) {
            const current = readContainedOrNull(root, write.path.slice(root.length + 1), 64 * 1024), expected = immutablePreimages[index]!;
            if (expected === null ? current !== null : current === null || !current.equals(expected)) throw new Error("receipt immutable path changed while signing; retry");
          }
          const now = Date.now();
          if (now < Date.parse(signed.authority.notBefore) || now >= Date.parse(signed.authority.notAfter)) throw new Error("receipt authority is outside its final publication window");
          publication.committed = commitKeyset(root, { expectedGeneration: plan.keyset.generation, keys: plan.keyset.keys, writes, statements: plan.rotationDigests,
            providers: { ...plan.keyset.providers, receipt: { ...plan.binding, receiptAuthoritySha256: digest } } });
        });
        db.exec("COMMIT");
      } finally { if (db.inTransaction) db.exec("ROLLBACK"); db.close(); }
    }));
  } catch (cause) { if (publication.committed !== null) throw new ReceiptAuthorityCommittedError(publication.committed.generation, "sql-lock-close", cause); throw cause; }
  if (publication.committed === null) throw new Error("receipt owner did not publish its generation");
  const result: ReturnType<typeof commitKeyset> = publication.committed;
  try { getReceiptChildKey(root); } catch (cause) { throw new ReceiptAuthorityCommittedError(result.generation, "child-open", cause); }
  try { await plan.anchor({ generation: result.generation, keyset: result }); }
  catch (cause) { if (cause instanceof ReceiptAuthorityCommittedError) throw cause; throw new ReceiptAuthorityCommittedError(result.generation, "anchors", cause); }
  return { purpose: "receipt" as const, generation: result.generation, authoritySha256: digest, childKeyId, issuerKeyId: plan.description.keyId, notBefore: signed.authority.notBefore, notAfter: signed.authority.notAfter };
}
