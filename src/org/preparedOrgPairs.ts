import { lstatSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { assertPolicySignerCurrent, describePolicySigner, signDigestWithPolicy } from "../crypto/signing/signer.js";
import { prepareFileSignatureWithAuditor } from "./orgSigner.js";
import { verifyAuditorSignatureBytes } from "./orgSignatureBytes.js";
import { canonicalize } from "../utils/json.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { assertKeysetComplete, boundProviderKey } from "../keys/keyset.js";
import { capturePurposePublication } from "../keys/purposePublication.js";
import { keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { assertSigningKeyUsable, getSigningKey } from "../keys/signingKeys.js";
import { vaultStatus } from "../vault/vault.js";
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { inCheckPass } from "../utils/checkPass.js";

/** Fixed BUNDLE operation gate. Capture before the caller's FIRST await, not after a prerequisite. */
export function captureOrgPairsAuthority(workspace: string, beforePublish?: () => void): () => void {
  const enabled = () => { if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing"); };
  enabled(); const actor = beforePublish; actor?.(); enabled();
  const descriptor = Object.freeze({ ...describePolicySigner(workspace, "BUNDLE") });
  // The existing purpose seam performs only its normal local unlock/migration gate, before the full snapshot.
  const purpose = descriptor.mode === "VAULT" ? capturePurposePublication(workspace, "artifact-seal") : null;
  const keyset = canonicalize(assertKeysetComplete(workspace)), trust = canonicalize(loadTrustConfig(workspace));
  const holder = descriptor.mode === "VAULT" ? boundProviderKey(workspace, "artifact-seal")?.binding.provider ?? "file" : null;
  const selectedPolicy = purpose === null ? null : canonicalize(keyPolicy(loadKeysConfig(workspace)));
  const assertCurrent = inCheckPass(() => {
    enabled(); actor?.(); enabled();
    assertPolicySignerCurrent(workspace, descriptor);
    if (canonicalize(assertKeysetComplete(workspace)) !== keyset || canonicalize(loadTrustConfig(workspace)) !== trust)
      throw new Error("original BUNDLE operation authority changed before publication");
    if (purpose !== null && holder !== null) {
      const current = assertKeysetComplete(workspace), policy = keyPolicy(loadKeysConfig(workspace));
      if (current === null || canonicalize(current) !== purpose.keyset || canonicalize(policy) !== selectedPolicy || !policy.allowed.includes(descriptor.algorithm)
        || (holder === "file" && policy.requireNonExportable)) throw new Error("original BUNDLE purpose authority is refused");
      assertSigningKeyUsable(workspace, "artifact-seal", descriptor.publicKeyPem, holder);
      if (holder === "file") {
        if (!vaultStatus(workspace).unlocked) throw new Error("original BUNDLE vault is locked; unlock before publication");
        if (publicKeyFromPrivate(getSigningKey(workspace, "artifact-seal")) !== descriptor.publicKeyPem)
          throw new Error("original BUNDLE vault key changed or is unavailable");
      }
    }
  });
  assertCurrent(); return assertCurrent;
}

interface Member { readonly path: string; readonly bytes: Buffer | null; readonly mode: number | null; readonly identity: string | null }
export interface OrgPairsSnapshot { readonly members: readonly Member[] }
export interface OrgPairsOptions { beforePublish?: () => void; assertInputsCurrent?: () => void }
export interface OrgPairWrite { path: string; bytes: Uint8Array }
function read(path: string): Member {
  try {
    const first = lstatSync(path);
    if (!first.isFile()) throw new Error("signed pair member must be a regular file");
    const bytes = readFileSync(path), last = lstatSync(path);
    if (first.dev !== last.dev || first.ino !== last.ino || first.size !== last.size || first.mtimeMs !== last.mtimeMs)
      throw new Error("signed pair member changed while being read");
    return { path, bytes, mode: last.mode & 0o777, identity: `${last.dev}:${last.ino}` };
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { path, bytes: null, mode: null, identity: null }; throw error; }
}
export function captureOrgFiles(paths: readonly string[]): OrgPairsSnapshot {
  return { members: [...new Set(paths)].map(read) };
}
export function captureOrgPairs(paths: readonly string[]): OrgPairsSnapshot {
  return captureOrgFiles(paths.flatMap(path => [path, `${path}.sig`]));
}
export function assertOrgPairsCurrent(before: OrgPairsSnapshot): void {
  for (const old of before.members) {
    const next = read(old.path);
    if (old.mode !== next.mode || old.identity !== next.identity || (old.bytes === null ? next.bytes !== null : next.bytes === null || !old.bytes.equals(next.bytes)))
      throw new Error("signed pair inputs or destinations changed while signing; retry");
  }
}
export function orgPairBytes(before: OrgPairsSnapshot, path: string): Buffer | null {
  const row = before.members.find(member => member.path === path);
  if (row === undefined) throw new Error("file was not captured in the signed pair snapshot");
  return row.bytes === null ? null : Buffer.from(row.bytes);
}
export class OrgPairsPublicationError extends Error {
  readonly code = "ORG_PAIRS_PARTIAL";
  constructor(readonly publishedPaths: readonly string[], readonly attemptedPath: string, cause: unknown) {
    super("signed file publication is incomplete; inspect committed members before retrying", { cause }); this.name = "OrgPairsPublicationError";
  }
}
function plan(writes: readonly OrgPairWrite[], previous?: OrgPairsSnapshot) {
  const own = writes.map(row => ({ path: row.path, bytes: Buffer.from(row.bytes) }));
  if (new Set(own.map(row => row.path)).size !== own.length) throw new Error("duplicate signed pair destination");
  const captured = previous ?? captureOrgPairs(own.map(row => row.path));
  const before = { members: captured.members.map(row => ({ ...row, bytes: row.bytes === null ? null : Buffer.from(row.bytes) })) };
  for (const row of own) if (!before.members.some(member => member.path === row.path) || !before.members.some(member => member.path === `${row.path}.sig`))
    throw new Error("signed pair destination was not captured");
  return { own, before };
}
function publish(workspace: string, planned: ReturnType<typeof plan>, signatures: readonly string[], assertCurrent: () => void, options: OrgPairsOptions) {
  // ponytail: one short common lock; preparation never waits for providers under this lock.
  return withControlFileLock({ root: join(workspace, ".amc"), name: "org-auditor-pairs", operation: () => {
    options.beforePublish?.(); options.assertInputsCurrent?.(); assertCurrent(); assertOrgPairsCurrent(planned.before);
    const expected: { members: Member[] } = { members: planned.before.members.map(row => ({ ...row, bytes: row.bytes === null ? null : Buffer.from(row.bytes) })) };
    const published: string[] = []; let attempted = "";
    const writeMember = (path: string, bytes: Uint8Array) => {
      attempted = ""; // No native member write has been entered for this step.
      // External continuations precede original checked authority and the last expected-own/original-remaining CAS.
      options.beforePublish?.(); assertCurrent(); assertOrgPairsCurrent(expected);
      attempted = relative(workspace, path); writeFileAtomic(path, bytes, 0o644); published.push(attempted);
      const own = read(path);
      if (own.mode !== 0o644 || own.bytes === null || !own.bytes.equals(Buffer.from(bytes)))
        throw new Error("published signed pair member differs from the exact prepared bytes or mode");
      const memberIndex = expected.members.findIndex(row => row.path === path);
      if (memberIndex < 0) throw new Error("published signed pair member was not captured");
      expected.members[memberIndex] = own; // Adopt own stable identity only after exact postimage validation.
    };
    try {
      for (let index = 0; index < planned.own.length; index += 1) {
        const row = planned.own[index]!; ensureDir(dirname(row.path));
        writeMember(row.path, row.bytes);
        writeMember(`${row.path}.sig`, Buffer.from(signatures[index]!));
      }
      attempted = ""; options.beforePublish?.(); assertCurrent(); assertOrgPairsCurrent(expected);
    } catch (error) { if (published.length === 0 && attempted === "") throw error; throw new OrgPairsPublicationError(Object.freeze([...published]), attempted, error); }
    return { paths: planned.own.map(row => ({ path: row.path, sigPath: `${row.path}.sig` })), assertCurrent: () => assertOrgPairsCurrent(expected) };
  } });
}
/** Fixed BUNDLE compatibility writer; prepare all signatures before replacing any body. */
export function publishOrgPairs(workspace: string, writes: readonly OrgPairWrite[], options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  options.beforePublish?.(); const planned = plan(writes, previous);
  const signatures = planned.own.map(row => {
    const signed = signDigestWithPolicy({ workspace, kind: "BUNDLE", digestHex: sha256Hex(row.bytes) });
    return JSON.stringify({ digestSha256: signed.digestSha256, signature: signed.signature, signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope }, null, 2);
  });
  return publish(workspace, planned, signatures, () => {
    for (let index = 0; index < planned.own.length; index += 1) if (!verifyAuditorSignatureBytes(workspace, "BUNDLE", planned.own[index]!.bytes, Buffer.from(signatures[index]!)).valid)
      throw new Error("prepared synchronous signed pair is not admitted by current BUNDLE authority");
  }, options).paths;
}
/** Internal fixed BUNDLE preparation. Retain the original gate across a real later log/scheduler phase. */
export async function prepareOrgPairsAsync(workspace: string, writes: readonly OrgPairWrite[], options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  const beforePublish = captureOrgPairsAuthority(workspace, options.beforePublish), assertInputsCurrent = options.assertInputsCurrent;
  beforePublish(); const planned = plan(writes, previous), prepared: Awaited<ReturnType<typeof prepareFileSignatureWithAuditor>>[] = [];
  const beforeSign = inCheckPass(() => { beforePublish(); assertInputsCurrent?.(); beforePublish(); assertOrgPairsCurrent(planned.before); });
  for (const row of planned.own) { beforeSign(); prepared.push(await prepareFileSignatureWithAuditor(workspace, row.path, row.bytes, "BUNDLE", beforeSign)); beforePublish(); }
  let assertPublishedCurrent: (() => void) | null = null;
  const assertCurrent = inCheckPass(() => { beforePublish?.(); for (const row of prepared) row.assertCurrent();
    // Retain the exact own identities validated inside publication; never adopt a fresh byte-equivalent winner.
    assertPublishedCurrent?.();
  });
  return Object.freeze({ assertCurrent, publish() {
    const result = publish(workspace, planned, prepared.map(row => row.signatureBytes), assertCurrent, { beforePublish, assertInputsCurrent });
    assertPublishedCurrent = result.assertCurrent; return result.paths;
  } });
}
export async function publishOrgPairsAsync(workspace: string, writes: readonly OrgPairWrite[], options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  return (await prepareOrgPairsAsync(workspace, writes, options, previous)).publish();
}
