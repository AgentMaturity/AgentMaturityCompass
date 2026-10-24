import { readFileSync, lstatSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { captureOrgPairs, assertOrgPairsCurrent } from "../org/preparedOrgPairs.js";
import { prepareFileSignatureWithAuditor } from "../org/orgSigner.js";
import { assertPolicySignerCurrent, describePolicySigner, signDigestWithPolicy } from "../crypto/signing/signer.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { sha256Hex } from "../utils/hash.js";
import { capturePurposePublication } from "../keys/purposePublication.js";
import { assertKeysetComplete } from "../keys/keyset.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { canonicalize } from "../utils/json.js";
import { assertOwnerMode } from "../mode/mode.js";
import { appendTransparencyEntryAsync, type TransparencyAppendInput } from "../transparency/asyncWorkspaceAppend.js";
import { dispatchIntegrationEvent } from "../integrations/integrationDispatcher.js";

type Command = "transform init" | "transform map apply" | "transform plan" | "transform track" | "transform attest";
export interface TransformPublicationChecks { beforePublish?: () => void; assertInputsCurrent?: () => void }
export class TransformPublicationError extends Error {
  readonly code = "TRANSFORM_PUBLICATION_PARTIAL";
  constructor(readonly publishedPaths: readonly string[], readonly attemptedPhase: string, cause: unknown, readonly knownTransparencyHash: string | null = null) {
    super("transformation publication is incomplete; inspect acknowledged members and the attempted phase before retrying", { cause });
    this.name = "TransformPublicationError";
  }
}

/** Internal fixed transformation wire recipes. Plan-id files use config-signature; every other member uses artifact-seal. */
export async function prepareTransformPairs(workspace: string, command: Command,
  writes: readonly { path: string; bytes: Uint8Array }[], checks: TransformPublicationChecks = {}) {
  const own = writes.map(row => ({ path: row.path, bytes: Buffer.from(row.bytes) }));
  if (new Set(own.map(row => row.path)).size !== own.length) throw new Error("duplicate transformation destination");
  const beforePublish = checks.beforePublish, assertInputsCurrent = checks.assertInputsCurrent;
  assertOwnerMode(workspace, command); beforePublish?.(); assertInputsCurrent?.();
  const before = captureOrgPairs(own.map(row => row.path));
  const kinds = own.map(row => row.path.replaceAll("\\", "/").includes("/transform/plans/") && row.path.endsWith(".json") ? "TRANSFORM_PLAN" as const : "BUNDLE" as const);
  const descriptors = [...new Set(kinds)].map(kind => ({ kind, descriptor: describePolicySigner(workspace, kind) }));
  // Warm the two actual purposes before pinning the complete generation; no provider waits occur under the publication lock.
  for (const row of descriptors) if (row.descriptor.mode === "VAULT") capturePurposePublication(workspace, row.kind === "TRANSFORM_PLAN" ? "config-signature" : "artifact-seal");
  const generation = canonicalize(assertKeysetComplete(workspace)), policy = JSON.stringify(loadTrustConfig(workspace));
  const prepared: Awaited<ReturnType<typeof prepareFileSignatureWithAuditor>>[] = [];
  for (let index = 0; index < own.length; index += 1) {
    const row = own[index]!;
    prepared.push(await prepareFileSignatureWithAuditor(workspace, row.path, row.bytes, kinds[index]!));
  }
  const assertCurrent = () => {
    assertOwnerMode(workspace, command);
    for (const row of descriptors) assertPolicySignerCurrent(workspace, row.descriptor);
    if (canonicalize(assertKeysetComplete(workspace)) !== generation || JSON.stringify(loadTrustConfig(workspace)) !== policy)
      throw new Error("original transformation signing authority changed while signing");
    for (const row of prepared) row.assertCurrent();
  };
  const assertPublished = () => {
    for (let index = 0; index < own.length; index += 1) {
      const row = own[index]!;
      for (const member of [{ path: row.path, bytes: row.bytes }, { path: `${row.path}.sig`, bytes: Buffer.from(prepared[index]!.signatureBytes) }]) {
        const stat = lstatSync(member.path);
        if (!stat.isFile() || (stat.mode & 0o777) !== 0o644 || !readFileSync(member.path).equals(member.bytes))
          throw new Error("published transformation member changed before its later effect");
      }
    }
  };
  const assertCommittedCurrent = () => { beforePublish?.(); assertCurrent(); assertPublished(); };
  return Object.freeze({ assertCurrent, assertCommittedCurrent, publish() {
    return withControlFileLock({ root: join(workspace, ".amc"), name: "org-auditor-pairs", operation: () => {
      beforePublish?.(); assertInputsCurrent?.(); assertCurrent(); assertOrgPairsCurrent(before);
      const published: string[] = []; let phase = "directory";
      try {
        for (let index = 0; index < own.length; index += 1) {
          const row = own[index]!; ensureDir(dirname(row.path));
          phase = relative(workspace, row.path); writeFileAtomic(row.path, row.bytes, 0o644); published.push(phase);
          phase = relative(workspace, `${row.path}.sig`); writeFileAtomic(`${row.path}.sig`, prepared[index]!.signatureBytes, 0o644); published.push(phase);
        }
      } catch (cause) { throw new TransformPublicationError(Object.freeze([...published]), phase, cause); }
      return own.map(row => ({ path: row.path, sigPath: `${row.path}.sig` }));
    } });
  } });
}

/** A later failure cannot undo already published pairs. Dispatch retains its existing best-effort contract. */
export interface TransformDispatchWarning { phase: "integration-dispatch"; message: string; readonly cause?: unknown }
export async function finishTransformPublication(prepared: { assertCommittedCurrent(): void }, publishedPaths: readonly string[],
  log: TransparencyAppendInput, events: readonly Parameters<typeof dispatchIntegrationEvent>[0][] = []): Promise<TransformDispatchWarning[]> {
  const acknowledged = Object.freeze(publishedPaths.map(path => relative(log.workspace, path)));
  let transparencyHash: string | null = null;
  try {
    const entry = await appendTransparencyEntryAsync(log, { beforeCommit: prepared.assertCommittedCurrent }); transparencyHash = entry.hash;
    prepared.assertCommittedCurrent();
  } catch (cause) { throw new TransformPublicationError(acknowledged, transparencyHash === null ? "transparency" : "after-transparency", cause, transparencyHash); }
  const warnings: TransformDispatchWarning[] = [];
  for (const event of events) {
    try {
      prepared.assertCommittedCurrent(); await dispatchIntegrationEvent(event); prepared.assertCommittedCurrent();
    } catch (cause) {
      // Dispatcher has no final actor hook. Its suffix remains a separate integration dependency, never an atomic pair effect.
      const warning: TransformDispatchWarning = { phase: "integration-dispatch", message: "integration dispatch unavailable after durable transformation publication; delivery progress may already exist" };
      Object.defineProperty(warning, "cause", { value: cause, enumerable: false }); warnings.push(warning);
    }
  }
  return warnings;
}

/** Retained synchronous compatibility joins the same pair lock, prepares before writes and refuses unadmitted ephemeral output. */
export function publishTransformPairs(workspace: string, command: Command, input: readonly { path: string; bytes: Uint8Array }[]) {
  const writes = input.map(row => ({ path: row.path, bytes: Buffer.from(row.bytes) }));
  if (new Set(writes.map(row => row.path)).size !== writes.length) throw new Error("duplicate transformation destination");
  assertOwnerMode(workspace, command);
  const before = captureOrgPairs(writes.map(row => row.path));
  const prepared = writes.map(row => {
    const kind = row.path.replaceAll("\\", "/").includes("/transform/plans/") && row.path.endsWith(".json") ? "TRANSFORM_PLAN" as const : "BUNDLE" as const;
    const signed = signDigestWithPolicy({ workspace, kind, digestHex: sha256Hex(row.bytes) });
    return { kind, bytes: Buffer.from(JSON.stringify({ digestSha256: signed.digestSha256, signature: signed.signature,
      signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope }, null, 2)) };
  });
  return withControlFileLock({ root: join(workspace, ".amc"), name: "org-auditor-pairs", operation: () => {
    assertOwnerMode(workspace, command);
    for (let index = 0; index < writes.length; index += 1) if (!verifyAuditorSignatureBytes(workspace, prepared[index]!.kind, writes[index]!.bytes, prepared[index]!.bytes).valid)
      throw new Error("prepared transformation signature is not admitted by its actual purpose");
    assertOrgPairsCurrent(before);
    const published: string[] = []; let phase = "directory";
    try {
      for (let index = 0; index < writes.length; index += 1) {
        const row = writes[index]!; ensureDir(dirname(row.path));
        phase = relative(workspace, row.path); writeFileAtomic(row.path, row.bytes, 0o644); published.push(phase);
        phase = relative(workspace, `${row.path}.sig`); writeFileAtomic(`${row.path}.sig`, prepared[index]!.bytes, 0o644); published.push(phase);
      }
    } catch (cause) { throw new TransformPublicationError(Object.freeze([...published]), phase, cause); }
    return writes.map(row => ({ path: row.path, sigPath: `${row.path}.sig` }));
  } });
}
