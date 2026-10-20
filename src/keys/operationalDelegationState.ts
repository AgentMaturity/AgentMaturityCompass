import { boundProviderKey, assertKeysetComplete, keysetFileRel } from "./keyset.js";
import { readContainedOrNull } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { signingKeyId } from "./algorithmPolicy.js";
import { operationalDelegationChain, type OperationalGrant } from "./operationalDelegation.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { KeyProviderError, type KeyProviderId } from "./provider.js";

export interface OperationalDelegationState { current: OperationalGrant; chain: OperationalGrant[]; provider: KeyProviderId }
export const delegationArchiveRel = (sha256: string) => `keys/delegations/${sha256}.json`;
export const delegationIssuerRel = (keyId: string) => `keys/delegation-issuers/${keyId}.pub`;

/** Exact-purpose candidates. Every byte is pinned by the committed key set, including retired issuer PEMs. */
export function operationalIssuerCandidates(workspace: string): string[] {
  const keyset = assertKeysetComplete(workspace);
  if (!keyset) return [];
  return Object.entries(keyset.files).flatMap(([rel, expected]) => {
    const match = /^keys\/delegation-issuers\/([0-9a-f]{64})\.pub$/.exec(rel);
    if (!match) return [];
    const bytes = readContainedOrNull(workspace, keysetFileRel(rel), 64 * 1024);
    if (bytes === null || sha256Hex(bytes) !== expected || signingKeyId(bytes.toString("utf8")) !== match[1]) throw new Error("delegation issuer archive changed");
    return [bytes.toString("utf8")];
  });
}

/** Current pointer is only usable when this exact immutable statement is named by the committed binding. */
export function readOperationalDelegationState(workspace: string): OperationalDelegationState | null {
  const bound = boundProviderKey(workspace, "ledger-row");
  if (bound === null) return null;
  const keyset = assertKeysetComplete(workspace)!;
  const sha256 = bound.binding.delegationSha256;
  const fail = (message: string): never => { throw new KeyProviderError("KEY_DELEGATION_INVALID", bound.binding.provider, message); };
  if (sha256 === undefined) return fail("this provider binding has no operational cutover; renew amc keys rotate --purpose ledger-row");
  const archive = (digest: string): Buffer | null => {
    if (!/^[0-9a-f]{64}$/.test(digest)) return fail("invalid delegation archive digest");
    const rel = delegationArchiveRel(digest);
    const bytes = readContainedOrNull(workspace, keysetFileRel(rel), 64 * 1024);
    if (keyset.files[rel] !== digest || bytes === null || sha256Hex(bytes) !== digest) return fail("delegation archive is not pinned or has changed");
    return bytes;
  };
  const current = archive(sha256)!;
  const pointer = readContainedOrNull(workspace, keysetFileRel("keys/delegations/ledger-row.json"), 64 * 1024);
  if (pointer === null || sha256Hex(pointer) !== sha256) return fail("current delegation copy does not match the committed binding");
  const chain = operationalDelegationChain(current, archive, operationalIssuerCandidates(workspace), workspaceIdFromDirectory(workspace));
  const latest = chain.at(-1)!;
  if (latest.statement.issuerKeyId !== bound.binding.keyId) return fail("current delegation issuer is not the committed provider key");
  return { current: latest, chain, provider: bound.binding.provider };
}
