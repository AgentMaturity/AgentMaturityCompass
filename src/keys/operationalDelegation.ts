import { admitKey } from "../trust/admission.js";
import type { TrustContext } from "../trust/trustContext.js";
import { sha256Hex } from "../utils/hash.js";
import { signingKeyId, verifyWithKey } from "./algorithmPolicy.js";
import { admitDelegatedRow, parseDelegation, verifyDelegation, type KeyDelegationV2 } from "./delegation.js";
import { DELEGATION_META, DELEGATION_STREAMS, delegationRowMarkerSchema, type DelegationStream } from "./delegationScope.js";

export interface OperationalGrant { sha256: string; bytes: Buffer; statement: KeyDelegationV2; issuerPublicKeyPem: string }
export interface DelegationRow { id: string; ts: number; hash: string; previousHash: string; signature: string; metaJson: string }
export type DelegationRows = Readonly<Record<DelegationStream, readonly DelegationRow[]>>;
export interface DelegationCheckpoint { sequence: number; sha256: string; signature: string; providerKeyId?: string; claimedAt: string }

/** A signed cutover classifies even legacy rows; its issuer needs admission when the new epoch is still empty. */
function boundaryProblems(chain: readonly OperationalGrant[], trust: TrustContext): string[] {
  return chain.flatMap(grant => {
    const issuer = admitKey({ publicKeyPem: grant.issuerPublicKeyPem, purpose: "ledger-row", signature: `delegation:${grant.sha256}`,
      context: trust, claimedSignedAt: grant.statement.notBefore });
    return issuer.status === "admitted" ? [] : [`delegation ${grant.sha256}: cutover issuer ${issuer.status}`];
  });
}

/** Oldest first. PEMs are candidates, not authority; row admission below checks the caller's TrustContext. */
export function operationalDelegationChain(currentBytes: Buffer, archived: (sha256: string) => Buffer | null,
  issuerCandidates: readonly string[], workspaceId: string): OperationalGrant[] {
  const reversed: OperationalGrant[] = [];
  const seen = new Set<string>();
  let bytes: Buffer | null = currentBytes;
  while (bytes !== null) {
    const sha256 = sha256Hex(bytes);
    if (seen.has(sha256)) throw new Error("delegation archive cycle");
    seen.add(sha256);
    const signed = parseDelegation(bytes);
    if (signed.delegation.version !== 2) throw new Error("operational ledger delegation requires a signed v2 cutover");
    const statement = signed.delegation;
    if (statement.scope.workspaceId !== workspaceId) throw new Error("delegation is for another workspace");
    const issuerPublicKeyPem = issuerCandidates.find(pem => signingKeyId(pem) === statement.issuerKeyId);
    if (!issuerPublicKeyPem) throw new Error("delegation issuer public key is missing");
    const verdict = verifyDelegation(bytes, { issuerPublicKeyPems: [issuerPublicKeyPem], at: new Date(statement.notBefore) });
    if (!verdict.valid) throw new Error(verdict.reason);
    reversed.push({ sha256, bytes, statement, issuerPublicKeyPem });
    const prior = statement.scope.previousDelegationSha256;
    bytes = prior === null ? null : archived(prior);
    if (prior !== null && (bytes === null || sha256Hex(bytes) !== prior)) throw new Error("prior delegation archive is missing or changed");
  }
  const chain = reversed.reverse();
  for (const [index, grant] of chain.entries()) {
    const prior = chain[index - 1];
    if (grant.statement.scope.sequence !== index + 1
      || grant.statement.scope.previousDelegationSha256 !== (prior?.sha256 ?? null)) throw new Error("delegation sequence or predecessor mismatch");
    if (prior) {
      for (const stream of DELEGATION_STREAMS) {
        if (grant.statement.scope.starts[stream].count < prior.statement.scope.starts[stream].count) throw new Error("delegation cutover moved backwards");
      }
      if (grant.statement.scope.checkpoints.sequence < prior.statement.scope.checkpoints.sequence) throw new Error("checkpoint cutover moved backwards");
    }
  }
  return chain;
}

/**
 * Whole global prefixes only, including all three streams. Existing callers must also recompute every row hash.
 * A subset must never be padded with empty streams: signed start counts and heads below deliberately refuse it.
 */
export function verifyOperationalRows(chain: readonly OperationalGrant[], rows: DelegationRows,
  legacyPublicKeyPems: readonly string[], trust: TrustContext): { errors: string[]; uses: ReadonlyMap<string, number> } {
  const errors = boundaryProblems(chain, trust);
  const uses = new Map<string, number>();
  const indices = new Set<string>();
  for (const stream of DELEGATION_STREAMS) {
    const prefix = rows[stream];
    const genesis = stream === "sqlite-outcome" ? "GENESIS_OUTCOME" : "GENESIS";
    for (const grant of chain) {
      const start = grant.statement.scope.starts[stream];
      const head = start.count === 0 ? genesis : prefix[start.count - 1]?.hash;
      if (head !== start.head) errors.push(`${stream}: signed delegation cutover is absent from this prefix`);
    }
    let previous = genesis;
    let grantIndex = -1;
    for (const [offset, row] of prefix.entries()) {
      if (row.previousHash !== previous) errors.push(`${stream} ${row.id}: previous hash mismatch`);
      previous = row.hash;
      while ((chain[grantIndex + 1]?.statement.scope.starts[stream].count ?? Infinity) < offset + 1) grantIndex++;
      const grant = chain[grantIndex];
      if (!grant) {
        if (!legacyPublicKeyPems.some(pem => verifyWithKey(Buffer.from(row.hash, "hex"), pem, Buffer.from(row.signature, "base64")))) {
          errors.push(`${stream} ${row.id}: legacy row signature invalid`);
        }
        continue;
      }
      let marker: ReturnType<typeof delegationRowMarkerSchema.parse> | null = null;
      try { marker = delegationRowMarkerSchema.parse((JSON.parse(row.metaJson) as Record<string, unknown>)[DELEGATION_META]); } catch { /* refused below */ }
      if (marker === null || marker.sha256 !== grant.sha256) {
        errors.push(`${stream} ${row.id}: current scoped delegation marker missing or mismatched`);
        continue; // No raw-signature fallback, even if the legacy key and delegate are identical.
      }
      const identity = `${marker.sha256}:${marker.useSequence}`;
      if (indices.has(identity)) errors.push(`${stream} ${row.id}: delegation useSequence reused across the global prefixes`);
      indices.add(identity);
      uses.set(marker.sha256, Math.max(uses.get(marker.sha256) ?? 0, marker.useSequence));
      const issuer = admitKey({ publicKeyPem: grant.issuerPublicKeyPem, purpose: "ledger-row", signature: `delegation:${grant.sha256}`,
        context: trust, claimedSignedAt: new Date(row.ts) });
      if (issuer.status !== "admitted") errors.push(`${stream} ${row.id}: delegation issuer ${issuer.status}`);
      const delegate = admitKey({ publicKeyPem: grant.statement.delegatePublicKeyPem, purpose: "ledger-row", signature: row.id,
        context: trust, claimedSignedAt: new Date(row.ts) });
      if (delegate.status === "distrusted" || delegate.status === "revoked") errors.push(`${stream} ${row.id}: delegate key ${delegate.status}`);
      const verdict = admitDelegatedRow({ delegation: grant.bytes, issuerPublicKeyPems: [grant.issuerPublicKeyPem],
        digestHex: row.hash, signatureB64: row.signature, signedAt: new Date(row.ts), eventIndex: marker.useSequence });
      if (!verdict.admitted) errors.push(`${stream} ${row.id}: ${verdict.reason}`);
    }
  }
  return { errors, uses };
}

/** The signed cutoff commits the legacy prefix and closes old provider epochs; archived keys never sign future epochs. */
export function verifyOperationalCheckpoints(chain: readonly OperationalGrant[], checkpoints: readonly DelegationCheckpoint[],
  legacyPublicKeyPems: readonly string[], trust: TrustContext): string[] {
  const errors = boundaryProblems(chain, trust);
  for (const grant of chain) {
    const cutoff = grant.statement.scope.checkpoints;
    const actual = cutoff.sequence === 0 ? null : checkpoints[cutoff.sequence - 1]?.sha256;
    if (actual !== cutoff.sha256) errors.push("provider-signed checkpoint cutoff missing or changed");
  }
  let grantIndex = -1;
  for (const checkpoint of checkpoints) {
    while ((chain[grantIndex + 1]?.statement.scope.checkpoints.sequence ?? Infinity) < checkpoint.sequence) grantIndex++;
    const grant = chain[grantIndex];
    const candidates = grant ? [grant.issuerPublicKeyPem] : legacyPublicKeyPems;
    if (grant) {
      if (checkpoint.providerKeyId !== grant.statement.issuerKeyId) errors.push(`checkpoint ${checkpoint.sequence}: active provider key id missing or mismatched`);
      const admission = admitKey({ publicKeyPem: grant.issuerPublicKeyPem, purpose: "ledger-row", signature: `checkpoint:${checkpoint.sequence}`,
        context: trust, claimedSignedAt: checkpoint.claimedAt });
      if (admission.status !== "admitted") errors.push(`checkpoint ${checkpoint.sequence}: provider issuer ${admission.status}`);
    }
    if (!candidates.some(pem => verifyWithKey(Buffer.from(checkpoint.sha256, "hex"), pem, Buffer.from(checkpoint.signature, "base64")))) {
      errors.push(`checkpoint ${checkpoint.sequence}: signature invalid for its authorized epoch`);
    }
  }
  return errors;
}
