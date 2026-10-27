import { closeSync, constants, fstatSync, ftruncateSync, lstatSync, mkdtempSync, openSync, readdirSync, readlinkSync, readSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { vaultPaths } from "../vault/vault.js";
import { captureOrgFiles, assertOrgPairsCurrent, orgPairBytes } from "../org/preparedOrgPairs.js";
import { capturePassportDirectories } from "../passport/passportPublication.js";
import { assertKeysetComplete, keysetFileRel, keysetPaths } from "../keys/keyset.js";
import { physicalPathWithMissingSuffix, isWithin } from "../utils/pathSafety.js";
import { canonicalize } from "../utils/json.js";
import { isSha256HexDigest, sha256Hex } from "../utils/hash.js";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { currentTreeAlgorithm } from "./merkleIndexStore.js";
import { captureMerkleProducerSigner, rebuildTransparencyMerkleAttemptAsync } from "./merkleProducerPublication.js";
import { merkleCurrentRootPath, merkleCurrentRootSigPath, merkleMigrationPath, merkleMigrationSigPath, merkleFrontierPath, merkleLeavesPath, merkleRootsPath, merklePendingPath } from "./merklePaths.js";
import { workspaceLogPath, workspaceSealPath, workspaceSealSigPath } from "./workspacePublication.js";
import { merkleRootRowSchema, rootSignatureSchema } from "./merkleRows.js";
import { merkleProofPayloadSchema, merkleProofSignatureSchema } from "./proofSchema.js";
import { transparencyEntrySchema } from "./logSchema.js";
import { entryInclusionProof, entryLeafHash } from "./merkle.js";
import { consistencyProof, rootHash } from "./rfc9162.js";
import { anchorsDir, checkpointNotePath, latestAnchorFiles } from "./anchors/anchor.js";
import { verifyWorkspaceLogSignature } from "./workspaceSignature.js";

interface ProofProgress {
  phase: string; outFile: string; coldInitializationAttempted: boolean; coldInitializationReturned: boolean;
  stage: string | null; archiveStage: string | null; stageReturns: readonly string[];
  archiveOpenAttempted: boolean; archiveOpened: boolean; archiveCallEntered: boolean; archiveReturned: boolean;
  archiveCloseAttempted: boolean; archiveClosed: boolean; outputOpenAttempted: boolean; outputOpened: boolean;
  truncateAttempted: boolean; truncateReturned: boolean; truncateAcknowledged: boolean;
  outputWriteAttempted: boolean; outputWriteReturned: boolean; outputAcknowledged: boolean;
  outputCloseAttempted: boolean; outputClosed: boolean; cleanupAttempts: readonly string[]; cleanupReturns: readonly string[];
  outputDirectoryReturns: readonly string[];
}
class MerkleProofPublicationError extends Error {
  readonly code = "MERKLE_PROOF_PUBLICATION_INCOMPLETE";
  constructor(readonly progress: Readonly<ProofProgress>, cause: unknown, readonly closeCauses: readonly unknown[], readonly cleanupCauses: readonly unknown[]) {
    super("Merkle proof publication did not complete; inspect cold initialization, archive, output and cleanup progress before retrying", { cause });
    this.name = "MerkleProofPublicationError";
  }
}
function anchorSelection(workspace: string) {
  let names: string[];
  try { names = readdirSync(anchorsDir(workspace)).filter(name => /^([1-9][0-9]*)\.([a-z0-9][a-z0-9._-]{0,63})\.json$/.test(name)); }
  catch (cause) { if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause; names = []; }
  names.sort((a, b) => Number(b.slice(0, b.indexOf("."))) - Number(a.slice(0, a.indexOf("."))) || a.localeCompare(b));
  const newest = names[0], anchor = latestAnchorFiles(workspace);
  return { names, anchor, paths: newest === undefined ? [] : [checkpointNotePath(workspace, Number(newest.slice(0, newest.indexOf(".")))), join(anchorsDir(workspace), newest)] };
}
function anchorStamp(value: ReturnType<typeof anchorSelection>) {
  return canonicalize({ names: value.names, paths: value.paths, anchor: value.anchor === null ? null : {
    note: value.anchor.note.toString("base64"), receipt: value.anchor.receipt.toString("base64"), treeSize: value.anchor.treeSize, rootHash: value.anchor.rootHash } });
}
function rootAdmission(workspace: string, rootBytes: Buffer, sidecar: Buffer) {
  const row = merkleRootRowSchema.parse(JSON.parse(rootBytes.toString("utf8"))), signed = rootSignatureSchema.parse(JSON.parse(sidecar.toString("utf8")));
  const digest = sha256Hex(rootBytes);
  if (signed.digestSha256 !== digest || !verifyWorkspaceLogSignature(workspace, "MERKLE_ROOT", digest, signed))
    throw new Error("proof export requires the captured signed root to be currently admitted for MERKLE_ROOT");
  return row;
}
function proofSources(workspace: string) {
  return [workspaceLogPath(workspace), workspaceSealPath(workspace), workspaceSealSigPath(workspace),
    merkleCurrentRootPath(workspace), merkleCurrentRootSigPath(workspace), merkleMigrationPath(workspace), merkleMigrationSigPath(workspace)];
}
function authorityAliases(workspace: string) {
  const keyset = assertKeysetComplete(workspace), keys = keysetPaths(workspace), vault = vaultPaths(workspace), base = resolve(workspace, ".amc");
  return [keys.keyset, keys.pending, vault.vaultFile, vault.metaFile, vault.previousVaultFile, ...(keyset === null ? [] : Object.keys(keyset.files).map(path => join(workspace, keysetFileRel(path)))),
    ...["amc.config.yaml", "amc.config.yaml.sig", "trust.yaml", "trust.yaml.sig", "mode.json", "users.yaml", "users.yaml.sig"].map(path => join(base, path)),
    merkleFrontierPath(workspace), merkleLeavesPath(workspace), merkleRootsPath(workspace), merklePendingPath(workspace)];
}
/** Preserve existing proof-output containment, regular-file and single-link rules, including an operator-chosen outside export. */
function outputPolicy(workspace: string, outFile: string, physical: string) {
  const root = resolve(workspace), physicalRoot = physicalPathWithMissingSuffix(root);
  if (outFile === root || physical === physicalRoot) throw new Error("proof output must be a regular, singly linked file");
  if (isWithin(root, outFile)) {
    if (physical !== join(physicalRoot, relative(root, outFile))) throw new Error("proof output parent must be an unlinked directory");
    let parent = physicalRoot;
    for (const part of relative(physicalRoot, dirname(physical)).split(sep).filter(Boolean)) {
      parent = join(parent, part);
      try { if (!lstatSync(parent).isDirectory()) throw new Error("proof output parent must be an unlinked directory"); }
      catch (cause) { if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause; }
    }
  }
  try { const row = lstatSync(physical); if (!row.isFile() || row.nlink !== 1) throw new Error("proof output must be a regular, singly linked file"); }
  catch (cause) { if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause; }
}
async function exportProof(input: { workspace: string; entryHash: string; outFile: string }, beforePublish: (() => void) | undefined, initialize: boolean) {
  const params = { ...input }, workspace = params.workspace, outFile = resolve(workspace, params.outFile);
  if (typeof params.entryHash !== "string" || !isSha256HexDigest(params.entryHash)) throw new Error("proof entry hash must be a canonical sha256 hex digest");
  beforePublish?.();
  const signer = captureMerkleProducerSigner(workspace), physical = physicalPathWithMissingSuffix(outFile), modeMask = process.umask();
  outputPolicy(workspace, outFile, physical);
  let output = captureOrgFiles([physical]), sources = captureOrgFiles(proofSources(workspace));
  const directories = capturePassportDirectories([dirname(physical)]), algorithm = currentTreeAlgorithm(workspace);
  const anchor = algorithm === "rfc9162-sha256" ? anchorSelection(workspace) : null;
  const anchorFiles = captureOrgFiles(anchor?.paths ?? []), publicKey = getPublicKeyHistory(workspace, "auditor")[0] ?? "";
  const aliases = [...proofSources(workspace), ...authorityAliases(workspace), ...(anchor?.paths ?? [])];
  const namespacePaths = [join(workspace, ".amc", "keys"), join(workspace, ".amc", "studio", "sessions"), anchorsDir(workspace), dirname(merkleCurrentRootPath(workspace))];
  const protectedNamespaces = namespacePaths.map(path => physicalPathWithMissingSuffix(path));
  const aliasPhysical = aliases.map(path => physicalPathWithMissingSuffix(path));
  let cold: Awaited<ReturnType<typeof rebuildTransparencyMerkleAttemptAsync>> | null = null;
  let phase = "input-capture", coldInitializationAttempted = false, coldInitializationReturned = false;
  let stage: string | null = null, archiveStage: string | null = null, stageDirectory: { dev: number; ino: number; mode: number } | null = null,
    archiveDirectory: { dev: number; ino: number; mode: number } | null = null, archiveFd: number | null = null, outputFd: number | null = null;
  const stageReturns: string[] = [], cleanupAttempts: string[] = [], cleanupReturns: string[] = [], closeCauses: unknown[] = [], cleanupCauses: unknown[] = [];
  let archiveOpenAttempted = false, archiveOpened = false, archiveCallEntered = false, archiveReturned = false, archiveCloseAttempted = false, archiveClosed = false;
  let outputOpenAttempted = false, outputOpened = false, truncateAttempted = false, truncateReturned = false, truncateAcknowledged = false;
  let outputWriteAttempted = false, outputWriteReturned = false, outputAcknowledged = false, outputCloseAttempted = false, outputClosed = false;
  let failed = false, primary: unknown, result: { outFile: string; proof: ReturnType<typeof merkleProofPayloadSchema.parse> } | null = null;
  const progress = (): Readonly<ProofProgress> => Object.freeze({ phase, outFile, coldInitializationAttempted, coldInitializationReturned, stage, archiveStage,
    stageReturns: Object.freeze([...stageReturns]), archiveOpenAttempted, archiveOpened, archiveCallEntered, archiveReturned, archiveCloseAttempted, archiveClosed,
    outputOpenAttempted, outputOpened, truncateAttempted, truncateReturned, truncateAcknowledged, outputWriteAttempted, outputWriteReturned, outputAcknowledged,
    outputCloseAttempted, outputClosed, cleanupAttempts: Object.freeze([...cleanupAttempts]), cleanupReturns: Object.freeze([...cleanupReturns]), outputDirectoryReturns: Object.freeze([...directories.created]) });
  const stableWithoutOutput = () => {
    beforePublish?.(); signer.assertCurrent(); cold?.assertCurrent(); directories.assertCurrent();
    if (process.umask() !== modeMask || physicalPathWithMissingSuffix(outFile) !== physical) throw new Error("original proof output selection or mode changed");
    outputPolicy(workspace, outFile, physical);
    if ((getPublicKeyHistory(workspace, "auditor")[0] ?? "") !== publicKey) throw new Error("original proof public-key selection changed");
    if (anchor !== null) { if (anchorStamp(anchorSelection(workspace)) !== anchorStamp(anchor)) throw new Error("original proof public-anchor selection changed"); assertOrgPairsCurrent(anchorFiles); }
    for (let index = 0; index < namespacePaths.length; index++) {
      if (physicalPathWithMissingSuffix(namespacePaths[index]!) !== protectedNamespaces[index]) throw new Error("proof authority namespace physical selection changed");
      if (isWithin(protectedNamespaces[index]!, physical)) throw new Error("proof output enters a known authority or anchor namespace");
    }
    const outputRow = captureOrgFiles([physical]).members[0]!;
    const aliasIdentity = (path: string) => { try { const row = lstatSync(path); return `${row.dev}:${row.ino}`; }
      catch (cause) { if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null; throw cause; } };
    for (let index = 0; index < aliases.length; index++) if (physicalPathWithMissingSuffix(aliases[index]!) !== aliasPhysical[index]
      || aliasPhysical[index] === physical || (outputRow.identity !== null && aliasIdentity(aliases[index]!) === outputRow.identity)) throw new Error("proof output aliases a known consumed or authority file");
  };
  const stable = () => { stableWithoutOutput(); assertOrgPairsCurrent(output); };
  const inputGate = () => { stable(); assertOrgPairsCurrent(sources); if (currentTreeAlgorithm(workspace) !== algorithm) throw new Error("original proof tree decision changed"); };
  const acknowledgeOutput = (bytes: Buffer, identity: string | null, mode: number) => {
    const own = captureOrgFiles([physical]), row = own.members[0]!, opened = fstatSync(outputFd!);
    if (row.bytes === null || !row.bytes.equals(bytes) || row.mode !== mode || (identity !== null && row.identity !== identity)
      || row.identity !== `${opened.dev}:${opened.ino}` || !opened.isFile() || opened.nlink !== 1) throw new Error("returned proof output differs from exact expected bytes, mode or owned inode");
    output = own;
  };
  try {
    inputGate(); phase = "output-directory-preparation"; directories.create(inputGate); inputGate();
    if (initialize && (!pathExists(merkleCurrentRootPath(workspace)) || !pathExists(merkleCurrentRootSigPath(workspace)))) {
      phase = "cold-initialization"; coldInitializationAttempted = true;
      cold = await rebuildTransparencyMerkleAttemptAsync(workspace, { beforePublish: stable, assertInputsCurrent: inputGate });
      coldInitializationReturned = true; cold.assertCurrent();
      const rootMembers = captureOrgFiles([merkleCurrentRootPath(workspace), merkleCurrentRootSigPath(workspace)]);
      if (!orgPairBytes(rootMembers, merkleCurrentRootPath(workspace))?.equals(cold.rootBytes)
        || !orgPairBytes(rootMembers, merkleCurrentRootSigPath(workspace))?.equals(cold.signatureBytes)
        || rootMembers.members.some(row => row.mode !== 0o644)) throw new Error("cold proof initialization differs from its genuine prepared root");
      sources = { members: [...sources.members.filter(row => row.path !== merkleCurrentRootPath(workspace) && row.path !== merkleCurrentRootSigPath(workspace)), ...rootMembers.members] };
    }
    inputGate();
    const rootBytes = orgPairBytes(sources, merkleCurrentRootPath(workspace)), rootSig = orgPairBytes(sources, merkleCurrentRootSigPath(workspace));
    if (rootBytes === null || rootSig === null) throw new Error("proof signed root or signature missing");
    const signedRow = rootAdmission(workspace, rootBytes, rootSig);
    const hashes = (orgPairBytes(sources, workspaceLogPath(workspace))?.toString("utf8") ?? "").split(/\r?\n/).map(line => line.trim()).filter(Boolean)
      .map(line => transparencyEntrySchema.parse(JSON.parse(line) as unknown).hash);
    const index = hashes.indexOf(params.entryHash); if (index < 0) throw new Error(`entry hash not found in transparency log: ${params.entryHash}`);
    const inclusion = entryInclusionProof(algorithm, hashes, index);
    const proof = merkleProofPayloadSchema.parse({ v: 1, ts: Date.now(), entryHash: params.entryHash, leafIndex: index, merkleRoot: inclusion.root,
      proofPath: inclusion.proofPath, rootSignatureFingerprint: sha256Hex(Buffer.from(publicKey, "utf8")), ...(algorithm === "rfc9162-sha256" ? { algorithm, treeSize: hashes.length } : {}) });
    if (signedRow.root !== proof.merkleRoot || (signedRow.algorithm ?? "amc-legacy-v1") !== (proof.algorithm ?? "amc-legacy-v1")
      || (proof.algorithm === "rfc9162-sha256" && signedRow.leafCount !== proof.treeSize))
      throw new Error("the proof's root is not the signed current root; run `amc transparency merkle rebuild` first");
    const rootGate = () => { inputGate(); rootAdmission(workspace, rootBytes, rootSig); };
    const writes = [{ name: "proof.json", bytes: Buffer.from(JSON.stringify(proof, null, 2)) }, { name: "root.json", bytes: rootBytes }, { name: "root.sig", bytes: rootSig }];
    if (anchor?.anchor) {
      const leaves = hashes.slice(0, signedRow.leafCount).map(hash => entryLeafHash("rfc9162-sha256", hash));
      if (anchor.anchor.treeSize > leaves.length || rootHash(leaves.slice(0, anchor.anchor.treeSize)) !== anchor.anchor.rootHash)
        throw new Error(`the log no longer extends its publicly anchored tree of ${anchor.anchor.treeSize} leaves`);
      writes.push({ name: "anchor.note", bytes: anchor.anchor.note }, { name: "anchor.receipt.json", bytes: anchor.anchor.receipt },
        { name: "anchor.consistency.json", bytes: Buffer.from(JSON.stringify({ hashes: consistencyProof(leaves, anchor.anchor.treeSize) }, null, 2)) });
    }
    phase = "stage-create"; rootGate(); stage = mkdtempSync(join(tmpdir(), "amc-proof-"));
    if (isWithin(stage, physical)) throw new Error("proof output overlaps its private stage");
    stageDirectory = lstatSync(stage); const names = [...writes.map(row => row.name), "proof.sig", "auditor.pub"];
    const stageExpected = new Map(captureOrgFiles(names.map(name => join(stage!, name))).members.map(row => [row.path, row]));
    const stageGate = () => { rootGate(); const now = lstatSync(stage!);
      if (!now.isDirectory() || now.dev !== stageDirectory!.dev || now.ino !== stageDirectory!.ino || now.mode !== stageDirectory!.mode) throw new Error("proof private stage changed");
      assertOrgPairsCurrent({ members: [...stageExpected.values()] });
      const expectedNames = names.filter(name => stageExpected.get(join(stage!, name))!.bytes !== null).sort();
      if (canonicalize(readdirSync(stage!).sort()) !== canonicalize(expectedNames)) throw new Error("proof private stage member roster changed"); };
    const writeStage = (name: string, bytes: Buffer) => {
      phase = `stage:${name}`; stageGate(); const path = join(stage!, name); writeFileAtomic(path, bytes, 0o644); stageReturns.push(path);
      const own = captureOrgFiles([path]).members[0]!; if (own.mode !== 0o644 || own.bytes === null || !own.bytes.equals(bytes)) throw new Error("proof private member differs from prepared bytes");
      stageExpected.set(path, own);
    };
    for (const row of writes) writeStage(row.name, row.bytes);
    phase = "proof-sign"; const proofBytes = writes[0]!.bytes, digest = sha256Hex(proofBytes), signed = await signer.sign(digest, stageGate);
    const signature = merkleProofSignatureSchema.parse({ digestSha256: digest, signature: signed.signature, signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope });
    writeStage("proof.sig", Buffer.from(JSON.stringify(signature, null, 2))); writeStage("auditor.pub", Buffer.from(publicKey, "utf8"));
    phase = "archive-stage-create"; stageGate(); archiveStage = mkdtempSync(join(tmpdir(), "amc-proof-archive-"));
    if (isWithin(archiveStage, physical)) throw new Error("proof output overlaps its private archive stage");
    archiveDirectory = lstatSync(archiveStage);
    const archiveGate = () => { stageGate(); const now = lstatSync(archiveStage!);
      if (!now.isDirectory() || now.dev !== archiveDirectory!.dev || now.ino !== archiveDirectory!.ino || now.mode !== archiveDirectory!.mode) throw new Error("proof private archive stage changed"); };
    const archivePath = join(archiveStage, "proof.amcproof"); archiveGate(); phase = "archive-open"; archiveOpenAttempted = true;
    archiveFd = openSync(archivePath, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); archiveOpened = true;
    const originalArchive = fstatSync(archiveFd);
    if (!originalArchive.isFile() || originalArchive.nlink !== 1 || originalArchive.size !== 0 || (originalArchive.mode & 0o777) !== (0o600 & ~modeMask)) throw new Error("created proof archive descriptor differs from its expected empty private file");
    phase = "archive-tar"; archiveGate(); archiveCallEntered = true;
    const tar = spawnSync("tar", ["-czf", "-", "-C", stage, "."], { encoding: "utf8", stdio: ["ignore", archiveFd, "pipe"] }); archiveReturned = true;
    if (tar.status !== 0) throw new Error(`failed to create merkle proof bundle: ${(tar.stderr ?? "").trim()}`, tar.error === undefined ? undefined : { cause: tar.error });
    archiveGate();
    const archived = fstatSync(archiveFd), namedArchive = lstatSync(archivePath);
    if (!archived.isFile() || archived.nlink !== 1 || archived.dev !== originalArchive.dev || archived.ino !== originalArchive.ino || archived.mode !== originalArchive.mode
      || archived.dev !== namedArchive.dev || archived.ino !== namedArchive.ino) throw new Error("proof private archive descriptor changed");
    const archive = Buffer.alloc(archived.size);
    for (let offset = 0; offset < archive.length;) { const count = readSync(archiveFd, archive, offset, archive.length - offset, offset); if (count === 0) throw new Error("proof archive ended during descriptor read"); offset += count; }
    const archiveAfter = fstatSync(archiveFd); if (archiveAfter.size !== archived.size || archiveAfter.mtimeMs !== archived.mtimeMs || archiveAfter.ctimeMs !== archived.ctimeMs || archiveAfter.mode !== archived.mode) throw new Error("proof archive changed during descriptor read");
    phase = "archive-close"; archiveCloseAttempted = true;
    try { closeSync(archiveFd); archiveClosed = true; archiveFd = null; } catch (cause) { closeCauses.push(cause); throw cause; }
    stageGate(); phase = "output-directories"; directories.create(stageGate); stageGate();
    phase = "output-open"; outputOpenAttempted = true; const oldOutput = output.members[0]!;
    outputFd = openSync(physical, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK | (oldOutput.bytes === null ? constants.O_EXCL : 0), 0o644); outputOpened = true;
    stableWithoutOutput();
    if (process.platform === "linux" && readlinkSync(`/proc/self/fd/${outputFd}`) !== physical) throw new Error("proof output changed while opening");
    acknowledgeOutput(oldOutput.bytes ?? Buffer.alloc(0), oldOutput.identity, oldOutput.mode ?? (0o644 & ~modeMask)); stageGate();
    const ownedIdentity = output.members[0]!.identity, outputMode = output.members[0]!.mode!;
    phase = "output-truncate"; truncateAttempted = true; ftruncateSync(outputFd, 0); truncateReturned = true;
    acknowledgeOutput(Buffer.alloc(0), ownedIdentity, outputMode); truncateAcknowledged = true; stageGate();
    phase = "output-write"; outputWriteAttempted = true; writeFileSync(outputFd, archive); outputWriteReturned = true;
    acknowledgeOutput(archive, ownedIdentity, outputMode); outputAcknowledged = true; stageGate();
    phase = "output-close"; outputCloseAttempted = true;
    try { closeSync(outputFd); outputClosed = true; outputFd = null; } catch (cause) { closeCauses.push(cause); throw cause; }
    stageGate(); result = { outFile, proof };
  } catch (cause) { failed = true; primary = cause; }
  finally {
    if (archiveFd !== null && !archiveCloseAttempted) { archiveCloseAttempted = true; try { closeSync(archiveFd); archiveClosed = true; } catch (cause) { closeCauses.push(cause); } }
    if (outputFd !== null && !outputCloseAttempted) { outputCloseAttempted = true; try { closeSync(outputFd); outputClosed = true; } catch (cause) { closeCauses.push(cause); } }
    for (const selected of [{ path: stage, owned: stageDirectory }, { path: archiveStage, owned: archiveDirectory }]) if (selected.path !== null) {
      try { const now = lstatSync(selected.path);
        // oxlint-disable-next-line no-unsafe-finally -- The local cleanup catch handles this throw; it does not leave the finally.
        if (selected.owned === null || !now.isDirectory() || now.dev !== selected.owned.dev || now.ino !== selected.owned.ino || now.mode !== selected.owned.mode) throw new Error("proof cleanup refuses an unacknowledged stage directory");
        cleanupAttempts.push(selected.path); rmSync(selected.path, { recursive: true, force: true }); cleanupReturns.push(selected.path);
      } catch (cause) { cleanupCauses.push(cause); }
    }
  }
  if (failed || closeCauses.length > 0 || cleanupCauses.length > 0) throw new MerkleProofPublicationError(progress(), failed ? primary : closeCauses[0] ?? cleanupCauses[0], Object.freeze([...closeCauses]), Object.freeze([...cleanupCauses]));
  if (result === null) throw new Error("Merkle proof producer returned no result");
  try { phase = "final-continuation"; inputGate(); rootAdmission(workspace, orgPairBytes(sources, merkleCurrentRootPath(workspace))!, orgPairBytes(sources, merkleCurrentRootSigPath(workspace))!); }
  catch (cause) { throw new MerkleProofPublicationError(progress(), cause, Object.freeze([...closeCauses]), Object.freeze([...cleanupCauses])); }
  return result;
}
export async function exportTransparencyProofBundleAsync(params: { workspace: string; entryHash: string; outFile: string }, options: { beforePublish?: () => void } = {}) {
  return exportProof(params, options.beforePublish, false);
}
/** CLI compatibility initializes missing roots before export; Studio's direct-export sibling does not add that phase. */
export async function exportInitializedTransparencyProofBundleAsync(params: { workspace: string; entryHash: string; outFile: string }, options: { beforePublish?: () => void } = {}) {
  return exportProof(params, options.beforePublish, true);
}
