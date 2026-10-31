/** Fixed two-document raw config-purpose publisher for maintained casebook init/add. */
import { resolve } from "node:path";
import { captureConfigSignatureAuthority, withConfigSignaturePairLock } from "../config/configSignaturePair.js";
import { captureOrgFiles, assertOrgPairsCurrent, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { signWithPurposeKey, type PurposeSignature } from "../keys/purposeProviders.js";
import { physicalPathWithMissingSuffix } from "../utils/pathSafety.js";
import { writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";

interface Document { path: string; bytes: Uint8Array }
export interface CasebookPublicationOptions { beforePublish?: () => void; protectedInputs?: readonly string[] }
interface PublicationInput extends CasebookPublicationOptions { workspace: string; index: Document; selectedCase: Document }
class CasebookPublicationError extends Error {
  readonly code = "CASEBOOK_PUBLICATION_INCOMPLETE";
  constructor(readonly phase: string, readonly publishedPaths: readonly string[], readonly acknowledgedPaths: readonly string[],
    readonly attemptedPath: string | null, cause: unknown) {
    super("casebook publication did not complete; inspect returned and acknowledged members before retrying", { cause });
    this.name = "CasebookPublicationError";
  }
}

async function publish(input: PublicationInput, operation: "initialize" | "add", previousIndex?: OrgPairsSnapshot) {
  const workspace = resolve(input.workspace), actor = input.beforePublish;
  const index = { path: resolve(input.index.path), bytes: Buffer.from(input.index.bytes) };
  const selectedCase = { path: resolve(input.selectedCase.path), bytes: Buffer.from(input.selectedCase.bytes) };
  const paths = [index.path, `${index.path}.sig`, selectedCase.path, `${selectedCase.path}.sig`];
  const physical = paths.map(physicalPathWithMissingSuffix);
  const protectedInputs = (input.protectedInputs ?? []).map(path => ({ path: resolve(path), physical: physicalPathWithMissingSuffix(resolve(path)) }));
  if (new Set(paths).size !== paths.length || new Set(physical).size !== physical.length)
    throw new Error("casebook publication destinations must differ");
  const stable = () => {
    actor?.();
    if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize casebook signing");
    if (paths.some((path, position) => physicalPathWithMissingSuffix(path) !== physical[position]))
      throw new Error("casebook publication physical selection changed");
    for (const source of protectedInputs) {
      if (physicalPathWithMissingSuffix(source.path) !== source.physical || physical.includes(source.physical))
        throw new Error("casebook output aliases a consumed source or its source selection changed");
    }
  };
  stable();
  const before = withConfigSignaturePairLock(workspace, () => {
    if (previousIndex === undefined) return captureOrgFiles(paths);
    if (previousIndex.members.length !== 2 || !paths.slice(0, 2).every(path => previousIndex.members.some(row => row.path === path)))
      throw new Error("casebook original index pair was not captured");
    assertOrgPairsCurrent(previousIndex);
    const cases = captureOrgFiles(paths.slice(2));
    if (cases.members.some(row => row.bytes !== null)) throw new Error("generated case destination already exists; retry");
    return { members: [...previousIndex.members.map(row => ({ ...row, bytes: row.bytes === null ? null : Buffer.from(row.bytes) })), ...cases.members] };
  });
  const identities = before.members.flatMap(row => row.identity === null ? [] : [row.identity]);
  if (new Set(identities).size !== identities.length) throw new Error("casebook publication destinations must not share an inode");
  const assertNoProtectedAliases = (snapshot: OrgPairsSnapshot) => {
    const destinations = snapshot.members.flatMap(row => row.identity === null ? [] : [row.identity]);
    if (captureOrgFiles(protectedInputs.map(row => row.path)).members.some(row => row.identity !== null && destinations.includes(row.identity)))
      throw new Error("casebook output hardlinks a consumed source");
  };
  assertNoProtectedAliases(before);
  const original = captureConfigSignatureAuthority(workspace), signatures: PurposeSignature[] = [];
  const assertAuthority = () => {
    stable(); original.assertCurrent();
    for (const signed of signatures) assertPurposePublicationCurrent(workspace, original.captured, signed);
  };
  const beforeSign = () => withConfigSignaturePairLock(workspace, () => { assertAuthority(); assertNoProtectedAliases(before); assertOrgPairsCurrent(before); });
  const documents = [selectedCase, index], sidecars: Buffer[] = [];
  for (const document of documents) {
    const digestSha256 = sha256Hex(document.bytes);
    const signed = await signWithPurposeKey(workspace, "config-signature", Buffer.from(digestSha256, "hex"), { beforeSign });
    signatures.push(signed); beforeSign();
    sidecars.push(Buffer.from(JSON.stringify({ digestSha256, signature: signed.signature.toString("base64"), signedTs: Date.now(), signer: "auditor" }, null, 2)));
  }
  const writes = operation === "initialize"
    ? [{ path: index.path, bytes: index.bytes }, { path: selectedCase.path, bytes: selectedCase.bytes },
      { path: `${selectedCase.path}.sig`, bytes: sidecars[0]! }, { path: `${index.path}.sig`, bytes: sidecars[1]! }]
    : [{ path: selectedCase.path, bytes: selectedCase.bytes }, { path: `${selectedCase.path}.sig`, bytes: sidecars[0]! },
      { path: index.path, bytes: index.bytes }, { path: `${index.path}.sig`, bytes: sidecars[1]! }];
  const expected = new Map(before.members.map(row => [row.path, row]));
  const currentExpected = (): OrgPairsSnapshot => ({ members: [...expected.values()] });
  const returned: string[] = [], acknowledged: string[] = [];
  let attemptedPath: string | null = null, phase = "publication-lock", operationFailed = false, operationFailure: unknown;
  const assertExpected = () => { assertAuthority(); assertNoProtectedAliases(currentExpected()); assertOrgPairsCurrent(currentExpected()); };
  const incomplete = (cause: unknown) => new CasebookPublicationError(phase, Object.freeze([...returned]),
    Object.freeze([...acknowledged]), attemptedPath, cause);
  try {
    withConfigSignaturePairLock(workspace, () => {
      try {
        for (const member of writes) {
          phase = "member-gate"; assertExpected(); attemptedPath = member.path; phase = "member-write";
          writeFileAtomic(member.path, member.bytes, 0o644); returned.push(member.path); phase = "member-acknowledgment";
          const own = captureOrgFiles([member.path]).members[0]!;
          if (own.bytes === null || !own.bytes.equals(member.bytes) || own.mode !== 0o644)
            throw new Error("casebook member differs from exact prepared bytes or mode");
          expected.set(member.path, own); acknowledged.push(member.path); attemptedPath = null;
        }
        phase = "publication-final"; assertExpected(); phase = "publication-cleanup";
      } catch (cause) { operationFailed = true; operationFailure = cause; throw cause; }
    });
    phase = "return"; assertExpected();
  } catch (cause) {
    const failure = operationFailed && cause !== operationFailure
      ? new AggregateError([operationFailure, cause], "casebook publication and lock cleanup failed", { cause: operationFailure }) : cause;
    if (returned.length || attemptedPath !== null) throw incomplete(failure);
    throw failure;
  }
  return Object.freeze({ path: index.path, sigPath: `${index.path}.sig`, casePath: selectedCase.path, caseSigPath: `${selectedCase.path}.sig`,
    assertCurrent() { try { assertExpected(); } catch (cause) { throw incomplete(cause); } } });
}

export function publishCasebookInitializationAsync(input: PublicationInput) { return publish(input, "initialize"); }
export function publishCasebookAdditionAsync(input: PublicationInput, previousIndex: OrgPairsSnapshot) { return publish(input, "add", previousIndex); }
