/** Actual Ledger receipt preparation/minting. Never performs provider work or an implicit unlock. */
import type { KeyObject } from "node:crypto";
import { getReceiptChildKey, vaultStatus } from "../vault/vault.js";
import { canonicalize } from "../utils/json.js";
import { mintReceipt, type MintReceiptInput } from "../receipts/receipt.js";
import { mintDelegatedReceipt } from "../receipts/receiptTransport.js";
import { configuredRef, keyPolicy, loadKeysConfig } from "./keysConfig.js";
import { checkedDescription } from "./provider.js";
import { assertKeysetComplete, keysetIdentity } from "./keyset.js";
import { assertKeyUsableNow, assertSigningKeyUsable, getSigningKey } from "./signingKeys.js";
import { assertReceiptTime, RECEIPT_AUTHORITY_META, type ReceiptStream } from "./receiptAuthority.js";
import { readReceiptAuthorityState, withReceiptAuthorityLock } from "./receiptAuthorityState.js";
import { readReceiptSqlSnapshot, verifyReceiptSqlMath, type ReceiptSqlReader } from "./receiptSqlAuthority.js";

export function prepareReceiptWriter(workspace: string) {
  const state = readReceiptAuthorityState(workspace);
  if (state === null) return null;
  const key = getReceiptChildKey(workspace); current(workspace, state.current.sha256);
  return Object.freeze({ sha256: state.current.sha256, key });
}
function current(workspace: string, expected: string) {
  if (process.env.AMC_NO_SIGN === "1" || !vaultStatus(workspace).unlocked) throw new Error("receipt child signing requires an unlocked signing vault");
  const state = readReceiptAuthorityState(workspace);
  if (state === null || state.current.sha256 !== expected) throw new Error("receipt authority changed; reopen the ledger");
  const named = configuredRef(loadKeysConfig(workspace), "receipt"), binding = state.binding.binding;
  if (named === null || named.provider !== binding.provider || named.id !== binding.id || named.version !== binding.version) throw new Error("receipt configured ref differs from its committed issuer");
  checkedDescription({ ref: { provider: binding.provider, id: binding.id, ...(binding.version === undefined ? {} : { version: binding.version }) },
    keyId: binding.keyId, publicKeyPem: state.binding.publicKeyPem, algorithm: binding.algorithm,
    protection: binding.protection, protectionBasis: binding.protectionBasis, exportable: false }, keyPolicy(loadKeysConfig(workspace)));
  assertSigningKeyUsable(workspace, "receipt", state.binding.publicKeyPem, binding.provider);
  assertKeyUsableNow(workspace, "receipt", state.current.signed.authority.childKeyId, binding.provider);
  assertReceiptTime(state.current.signed, Date.now()); return state;
}
export type PreparedReceiptWriter = ReturnType<typeof prepareReceiptWriter>;
/** SQL already owns its immediate transaction/savepoint. All child work here is local. */
export function withLedgerReceipt<T>(ledger: ReceiptSqlReader, prepared: PreparedReceiptWriter, stream: ReceiptStream, metadata: Record<string, unknown>, ts: number,
  append: (meta: Record<string, unknown>, mint: (input: Omit<MintReceiptInput, "privateKeyPem">) => ReturnType<typeof mintReceipt>) => T): T {
  if (RECEIPT_AUTHORITY_META in metadata) throw new Error("receipt authority metadata is reserved");
  if (!ledger.db.inTransaction) throw new Error("receipt minting requires the existing SQL transaction");
  // BEGIN IMMEDIATE already excludes owner cutover: the default path needs no new file lock or filesystem effect.
  if (readReceiptAuthorityState(ledger.workspace) === null) {
    if (prepared !== null) throw new Error("receipt authority disappeared; reopen the ledger");
    return append(metadata, input => mintReceipt({ ...input, privateKeyPem: getSigningKey(ledger.workspace, "receipt") }));
  }
  return withReceiptAuthorityLock(ledger.workspace, () => {
    if (prepared === null) throw new Error("receipt authority changed; reopen the ledger");
    const active = current(ledger.workspace, prepared.sha256); assertReceiptTime(active.current.signed, ts);
    // The actual live prefix includes uncommitted earlier rows in this caller's transaction, not a stale preparation head.
    verifyReceiptSqlMath(ledger.workspace, readReceiptSqlSnapshot(ledger), active);
    const identity = canonicalize(keysetIdentity(ledger.workspace)), config = canonicalize(loadKeysConfig(ledger.workspace));
    const mint = (input: Omit<MintReceiptInput, "privateKeyPem">) => {
      if (input.ts !== ts || (stream === "sqlite-outcome" && input.kind !== "guard_check")) throw new Error("receipt mint input does not match its operation");
      current(ledger.workspace, prepared.sha256);
      if (canonicalize(keysetIdentity(ledger.workspace)) !== identity || canonicalize(loadKeysConfig(ledger.workspace)) !== config) throw new Error("receipt authority input changed while appending");
      return mintDelegatedReceipt(input, active.current.signed, active.current.issuerPublicKeyPem, prepared.key as KeyObject);
    };
    assertKeysetComplete(ledger.workspace);
    return append({ ...metadata, [RECEIPT_AUTHORITY_META]: { sha256: active.current.sha256, epoch: active.current.signed.authority.epoch } }, mint);
  });
}
