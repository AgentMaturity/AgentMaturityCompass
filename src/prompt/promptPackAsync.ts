import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { captureOrgPairsAuthority, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { describePolicySigner, assertPolicySignerCurrent } from "../crypto/signing/signer.js";
import { prepareFileSignatureWithAuditor } from "../org/orgSigner.js";
import { capturePurposePublication } from "../keys/purposePublication.js";
import { boundProviderKey } from "../keys/keyset.js";
import { vaultStatus } from "../vault/vault.js";
import { resolveAgentId } from "../fleet/paths.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { appendTransparencyEntryAsync } from "../transparency/asyncWorkspaceAppend.js";
import { promptLintSchema, promptPackSignatureSchema } from "./promptPackSchema.js";
import { promptLatestPackPath, promptLatestPackShaPath, promptLatestLintPath, promptSnapshotsDir } from "./promptPolicyStore.js";
import { prepareCompiledPromptPackAsync, promptCompilerInputPaths, PromptPackPreparationError } from "./promptCompilerAsync.js";
import { promptArchiveBytes } from "./promptArchive.js";
import { capturePromptFiles, assertPromptFilesCurrent, publishPromptFiles, type PromptFiles, PromptPublicationError } from "./promptPublication.js";

export function capturePromptPackAuthority(workspace: string, beforePublish: (() => void) | undefined, logs: boolean) {
  const descriptor = Object.freeze({ ...describePolicySigner(workspace, "BUNDLE") });
  const logSigners = logs ? [describePolicySigner(workspace, "TRANSPARENCY_ROOT"), describePolicySigner(workspace, "MERKLE_ROOT")] : [];
  const localLog = logSigners.some(row => row.mode === "VAULT");
  if (localLog) capturePurposePublication(workspace, "artifact-seal");
  const fileLog = localLog && boundProviderKey(workspace, "artifact-seal") === null;
  const bundle = captureOrgPairsAuthority(workspace, beforePublish);
  const assertCurrent = () => { bundle(); assertPolicySignerCurrent(workspace, descriptor);
    for (const signer of logSigners) assertPolicySignerCurrent(workspace, signer);
    if (fileLog && !vaultStatus(workspace).unlocked) throw new Error("vault locked; unlock required for signing"); };
  assertCurrent(); return { descriptor, assertCurrent };
}
function noInputAlias(outputs: PromptFiles, inputs: PromptFiles) {
  for (const output of outputs) for (const input of inputs)
    if (output.path === input.path || (output.identity !== null && output.identity === input.identity)) throw new Error("prompt output must differ from its selected input files");
}
async function archive(workspace: string, compiled: Awaited<ReturnType<typeof prepareCompiledPromptPackAsync>>, original: ReturnType<typeof capturePromptPackAuthority>) {
  const assertInputs = () => { original.assertCurrent(); compiled.assertCurrent(); };
  assertInputs();
  const pack = await prepareFileSignatureWithAuditor(workspace, "pack.json", Buffer.from(canonicalize(compiled.compiled.pack)), "BUNDLE"); assertInputs(); pack.assertCurrent();
  const lintBytes = Buffer.from(`${canonicalize(promptLintSchema.parse(compiled.compiled.lint))}\n`);
  const lint = await prepareFileSignatureWithAuditor(workspace, "lint.json", lintBytes, "BUNDLE"); assertInputs(); pack.assertCurrent(); lint.assertCurrent();
  const signature = promptPackSignatureSchema.parse(JSON.parse(pack.signatureBytes));
  const signerPub = signature.envelope ? Buffer.from(signature.envelope.pubkeyB64, "base64").toString("utf8") : original.descriptor.publicKeyPem;
  if (signerPub !== original.descriptor.publicKeyPem) throw new Error("prompt pack signer changed while preparing");
  const bytes = promptArchiveBytes(compiled.compiled, signature, signerPub, lint.signatureBytes);
  const assertCurrent = () => { assertInputs(); pack.assertCurrent(); lint.assertCurrent(); };
  assertCurrent(); return { bytes, signature, assertCurrent };
}
/** Actual direct producer: checked pack+lint signatures precede the selected archive publication. */
export async function buildPromptPackArtifactAsync(params: { workspace: string; agentId?: string; outFile: string }, options: OrgPairsOptions = {}) {
  const input = { workspace: params.workspace, agentId: resolveAgentId(params.workspace, params.agentId ?? "default"), outFile: resolve(params.outFile) };
  const original = capturePromptPackAuthority(input.workspace, options.beforePublish, false), before = capturePromptFiles([input.outFile]);
  const inputFiles = capturePromptFiles(promptCompilerInputPaths(input.workspace, input.agentId)); noInputAlias(before, inputFiles);
  const compiled = await prepareCompiledPromptPackAsync(input, { beforePublish: original.assertCurrent, assertInputsCurrent: options.assertInputsCurrent });
  const prepared = await archive(input.workspace, compiled, original);
  publishPromptFiles(input.workspace, before, [{ path: input.outFile, bytes: prepared.bytes }], prepared.assertCurrent);
  return { outFile: input.outFile, sha256: sha256Hex(prepared.bytes), pack: compiled.compiled.pack, signature: prepared.signature,
    lint: compiled.compiled.lint, providerFiles: compiled.compiled.providerFiles };
}
export class PromptBuildPublicationError extends Error {
  readonly code = "PROMPT_BUILD_INCOMPLETE";
  constructor(readonly completedPrerequisites: readonly string[], readonly completedPaths: readonly string[], readonly completedLogHashes: readonly string[], cause: unknown) {
    super("prompt build did not complete; published prerequisites, members and logs are retained", { cause }); this.name = "PromptBuildPublicationError";
  }
}
/** Actual managed pack producer; no remote work or await is inside the final prompt publication lock. */
export async function buildPromptPackForApiAsync(params: { workspace: string; agentId?: string; outFile?: string }, options: OrgPairsOptions = {}) {
  const input = { workspace: params.workspace, agentId: resolveAgentId(params.workspace, params.agentId ?? "default"), outFile: params.outFile };
  const original = capturePromptPackAuthority(input.workspace, options.beforePublish, true), assertInputs = options.assertInputsCurrent;
  const ownedTemp = input.outFile ? null : mkdtempSync(join(tmpdir(), "amc-prompt-build-"));
  const outFile = input.outFile ? resolve(input.workspace, input.outFile) : join(ownedTemp!, `${input.agentId}.amcprompt`);
  const latestPath = promptLatestPackPath(input.workspace, input.agentId), latestShaPath = promptLatestPackShaPath(input.workspace, input.agentId), lintPath = promptLatestLintPath(input.workspace, input.agentId);
  let prerequisites: readonly string[] = [], published: PromptFiles = [], logs: string[] = [], failure: unknown;
  let completedPaths: readonly string[] = [];
  try {
    const before = capturePromptFiles([outFile, latestPath, latestShaPath, lintPath, `${lintPath}.sig`]);
    const inputFiles = capturePromptFiles(promptCompilerInputPaths(input.workspace, input.agentId)); noInputAlias(before, inputFiles);
    const compiled = await prepareCompiledPromptPackAsync(input, { beforePublish: original.assertCurrent, assertInputsCurrent: assertInputs }); prerequisites = compiled.completedPrerequisites;
    // This derived timestamp path is selected after compilation, exactly where the original recipe selected it.
    const snapshotPath = join(promptSnapshotsDir(input.workspace, input.agentId), `${compiled.compiled.pack.generatedTs}.amcprompt`), snapshotShaPath = `${snapshotPath}.sha256`;
    const chosen = [snapshotPath, snapshotShaPath].filter(path => !before.some(row => row.path === resolve(path)));
    const allBefore = [...before, ...capturePromptFiles(chosen)]; noInputAlias(allBefore, inputFiles);
    const prepared = await archive(input.workspace, compiled, original), lintBytes = Buffer.from(JSON.stringify(promptLintSchema.parse(compiled.compiled.lint), null, 2));
    assertInputs?.(); original.assertCurrent(); prepared.assertCurrent();
    const latestLint = await prepareFileSignatureWithAuditor(input.workspace, lintPath, lintBytes, "BUNDLE");
    const assertCurrent = () => { assertInputs?.(); original.assertCurrent(); prepared.assertCurrent(); latestLint.assertCurrent(); };
    assertCurrent(); const sha256 = sha256Hex(prepared.bytes), checksum = Buffer.from(`${sha256}\n`);
    published = publishPromptFiles(input.workspace, allBefore, [{ path: outFile, bytes: prepared.bytes }, { path: latestPath, bytes: prepared.bytes },
      { path: snapshotPath, bytes: prepared.bytes }, { path: latestShaPath, bytes: checksum }, { path: snapshotShaPath, bytes: checksum },
      { path: lintPath, bytes: lintBytes }, { path: `${lintPath}.sig`, bytes: Buffer.from(latestLint.signatureBytes) }], assertCurrent);
    completedPaths = published.map(row => row.path);
    const afterPublication = () => { assertCurrent(); assertPromptFilesCurrent(published); };
    afterPublication();
    const created = await appendTransparencyEntryAsync({ workspace: input.workspace, type: "PROMPT_PACK_CREATED", agentId: input.agentId,
      artifact: { kind: "policy", id: compiled.compiled.pack.packId, sha256 } }, { beforeCommit: afterPublication }); logs.push(created.hash);
    if (compiled.compiled.lint.status === "FAIL") {
      afterPublication();
      const failed = await appendTransparencyEntryAsync({ workspace: input.workspace, type: "PROMPT_LINT_FAILED", agentId: input.agentId,
        artifact: { kind: "policy", id: compiled.compiled.pack.packId, sha256: sha256Hex(Buffer.from(canonicalize(compiled.compiled.lint))) } }, { beforeCommit: afterPublication }); logs.push(failed.hash);
    }
    afterPublication();
    return { outFile, sha256, pack: compiled.compiled.pack, signature: prepared.signature, lint: compiled.compiled.lint, providerFiles: compiled.compiled.providerFiles,
      agentId: input.agentId, persisted: { latestPath, latestShaPath, snapshotPath, snapshotShaPath, sha256 }, lintSaved: { path: lintPath, sigPath: `${lintPath}.sig` } };
  } catch (cause) {
    if (cause instanceof PromptPackPreparationError) prerequisites = cause.completedPrerequisites;
    if (cause instanceof PromptPublicationError) completedPaths = cause.completedPaths.map(path => resolve(input.workspace, path));
    failure = cause; throw new PromptBuildPublicationError(prerequisites, Object.freeze([...completedPaths]), Object.freeze([...logs]), cause);
  } finally { if (ownedTemp !== null) { try { rmSync(ownedTemp, { recursive: true, force: true }); }
    catch (cleanup) { throw new PromptBuildPublicationError(prerequisites, Object.freeze([...completedPaths]), Object.freeze([...logs]), failure === undefined ? cleanup : new AggregateError([failure, cleanup])); } } }
}
