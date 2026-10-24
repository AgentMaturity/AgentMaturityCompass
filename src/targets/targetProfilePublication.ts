import { join, resolve } from "node:path";
import type { TargetProfile } from "../types.js";
import { assertOwnerMode } from "../mode/mode.js";
import { capturePublicConfigAuthority, withConfigSignaturePairLock } from "../config/configSignaturePair.js";
import { assertKeysetComplete, keysetDeclared } from "../keys/keyset.js";
import { getAgentPaths, getCurrentAgent } from "../fleet/paths.js";
import { assertOrgPairsCurrent, captureOrgFiles, orgPairBytes, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { createMaintainedCompatibleTargetProfile, loadTargetProfile } from "./targetProfile.js";
import { captureConfigSignatureAuthority } from "../config/configSignaturePair.js";
import { verifyWithKey } from "../keys/algorithmPolicy.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { targetProfilePayload } from "./targetProfile.js";

/** Internal v1 raw CONFIG-SIGNATURE preparation. No artifact envelope, alternate purpose, or signer fallback. */
export async function prepareTargetProfileSignatureAsync(params: {
  workspace: string; name: string; contextGraphHash: string; mapping: Record<string, number>;
}, assertInputsCurrent?: () => void) {
  const workspace = params.workspace, payload = targetProfilePayload({ ...params, mapping: structuredClone(params.mapping) });
  assertInputsCurrent?.();
  const original = captureConfigSignatureAuthority(workspace), digest = Buffer.from(sha256Hex(canonicalize(payload)), "hex");
  const beforeSign = () => { assertInputsCurrent?.(); original.assertCurrent(); };
  beforeSign();
  const signed = await signWithPurposeKey(workspace, "config-signature", digest, { beforeSign });
  beforeSign();
  const signature = signed.signature.toString("base64");
  const assertCurrent = () => {
    original.assertCurrent(); assertPurposePublicationCurrent(workspace, original.captured, signed);
    if (!verifyWithKey(digest, original.publicKeyPem, Buffer.from(signature, "base64")))
      throw new Error("prepared target signature does not match the original actual config signer");
  };
  assertCurrent();
  const bytes = Buffer.from(JSON.stringify({ ...payload, signature }, null, 2));
  // The old-destination input gate is preparation-only. Scaffold publication retains its own expected-state CAS.
  return Object.freeze({ assertCurrent, get bytes() { return Buffer.from(bytes); } });
}

interface TargetInput { name: string; contextGraphHash: string; mapping?: Record<string, number> }
interface TargetEffects {
  compatibilityPreSignPassed: boolean; compatibilityReturned: boolean;
  lockAttempted: boolean; lockEntered: boolean; lockReturned: boolean; directoryAttempted: boolean; directoryReturned: boolean;
  writeAttempted: boolean; writeReturned: boolean; acknowledged: boolean;
}
export class TargetProfilePublicationError extends Error {
  readonly code = "TARGET_PROFILE_INCOMPLETE";
  constructor(readonly phase: string, readonly targetPath: string | null, readonly targetSha256: string | null,
    readonly effects: Readonly<TargetEffects>, cause: unknown) {
    super("target publication did not complete; native and earlier target/audit effects may remain", { cause });
    this.name = "TargetProfilePublicationError";
  }
}

/** Actual input selection only; no key/private/native publication is selected by a caller witness. */
function targetSelection(workspace: string, agentId?: string) {
  const usedInput = () => agentId && agentId.trim().length > 0 ? ["explicit", agentId]
    : process.env.AMC_AGENT_ID && process.env.AMC_AGENT_ID.trim().length > 0 ? ["environment", process.env.AMC_AGENT_ID]
    : ["current", getCurrentAgent(workspace)];
  const input = usedInput(), paths = getAgentPaths(workspace, agentId), root = resolve(workspace);
  if (canonicalize(input) !== canonicalize(usedInput())) throw new Error("target agent input changed while selecting paths");
  return { input, paths, root };
}

/** Private fixed operation shared only by the two actual maintained target recipes. */
function captureTargetPublication(workspace: string, agentId: string | undefined, actor: (root: string) => void, readPrevious: boolean) {
  const noSign = process.env.AMC_NO_SIGN === "1";
  let root = workspace, selection: ReturnType<typeof targetSelection> | null = null;
  let publicCurrent: (() => void) | null = null, complete: string | null = null, fresh = false;
  let kind: "signed" | "compatible" | null = null, failure: { cause: unknown } | null = null;
  let started = false, previous: OrgPairsSnapshot | null = null, own: OrgPairsSnapshot | null = null;
  let preparedCurrent: (() => void) | null = null;
  let phase = "entry", file: string | null = null, targetSha256: string | null = null;
  const effects: TargetEffects = { compatibilityPreSignPassed: false, compatibilityReturned: false,
    lockAttempted: false, lockEntered: false, lockReturned: false, directoryAttempted: false, directoryReturned: false,
    writeAttempted: false, writeReturned: false, acknowledged: false };
  const checked = (operation: () => void) => {
    if (failure !== null) throw failure.cause;
    try { operation(); } catch (cause) { if (failure === null) failure = { cause }; throw failure.cause; }
  };
  const observe = (operation?: () => void) => {
    try { if (operation) checked(operation); else current(); } catch { /* Sticky and silent until the real pre-Sign slot. */ }
  };
  observe(() => {
    selection = targetSelection(workspace, agentId); root = selection.root;
    const selected = assertKeysetComplete(root), declared = keysetDeclared(root);
    if (selected === null) {
      if (declared) throw new Error("target public key state is declared without a complete key set");
      fresh = true; kind = "compatible";
    } else {
      complete = canonicalize(selected); kind = noSign ? "compatible" : "signed";
      if (!noSign) publicCurrent = capturePublicConfigAuthority(root);
    }
  });
  const intrinsic = () => {
    if ((process.env.AMC_NO_SIGN === "1") !== noSign) throw new Error("original target no-sign choice changed");
    if (selection === null || canonicalize(targetSelection(workspace, agentId)) !== canonicalize(selection))
      throw new Error("original target workspace or agent/path selection changed");
    if (kind === "signed") publicCurrent!();
    else if (!effects.compatibilityReturned) {
      const selected = assertKeysetComplete(root), declared = keysetDeclared(root);
      if (fresh ? selected !== null || declared : selected === null || canonicalize(selected) !== complete)
        throw new Error("original target compatibility public state changed before signing");
    }
    // Genuine prepared state has no caller callback; preimages retire only at actual owned acknowledgement.
    preparedCurrent?.();
    if (own !== null) assertOrgPairsCurrent(own); else if (previous !== null) assertOrgPairsCurrent(previous);
  };
  function current() {
    checked(() => { intrinsic(); actor(root); intrinsic(); });
  }
  const incomplete = (cause: unknown) => new TargetProfilePublicationError(phase, file, targetSha256, Object.freeze({ ...effects }), cause);
  const assertCurrent = () => {
    try {
      if (own === null || !effects.acknowledged) throw new Error("target publication has not completed");
      current(); preparedCurrent?.(); assertOrgPairsCurrent(own);
    } catch (cause) {
      if (failure === null) failure = { cause };
      if (effects.lockAttempted || effects.directoryAttempted || effects.writeAttempted) throw incomplete(failure.cause);
      throw failure.cause;
    }
  };
  return Object.freeze({ workspace: root, observe: () => observe(), assertCurrent, async publish(input: TargetInput) {
    if (started) throw new Error("target publication attempt already entered; inspect its effects before retrying");
    started = true; const params = { ...input };
    phase = "selected-input";
    observe(() => {
      intrinsic();
      file = join(selection!.paths.targetsDir, `${params.name}.target.json`);
      const legacy = join(workspace, ".amc", "targets", `${params.name}.target.json`);
      const selected = readPrevious && !pathExists(file) && pathExists(legacy) ? legacy : file;
      previous = captureOrgFiles(readPrevious ? [selected, file] : [file]);
    });
    const oldTarget = readPrevious ? (() => {
      try { return loadTargetProfile(workspace, params.name, agentId); } catch { return null; }
    })() : null;
    observe(() => { if (previous !== null) assertOrgPairsCurrent(previous); });
    const mapping = params.mapping ?? oldTarget?.mapping ?? {};
    const beforeSign = () => checked(() => { current(); assertOrgPairsCurrent(previous!); });
    try {
      phase = "signature";
      let bytes: Buffer;
      if (kind === "compatible") {
        const profile = createMaintainedCompatibleTargetProfile({ workspace, name: params.name, contextGraphHash: params.contextGraphHash, mapping }, () => {
          beforeSign(); effects.compatibilityPreSignPassed = true;
        });
        effects.compatibilityReturned = true;
        bytes = Buffer.from(JSON.stringify(profile, null, 2));
      } else {
        const prepared = await prepareTargetProfileSignatureAsync({ workspace: root, name: params.name, contextGraphHash: params.contextGraphHash, mapping }, beforeSign);
        preparedCurrent = prepared.assertCurrent; bytes = prepared.bytes;
      }
      targetSha256 = sha256Hex(bytes); const profile = JSON.parse(bytes.toString("utf8")) as TargetProfile;
      current(); preparedCurrent?.(); assertOrgPairsCurrent(previous!);
      phase = "lock";
      effects.lockAttempted = true;
      withConfigSignaturePairLock(root, () => {
        effects.lockEntered = true;
        current(); preparedCurrent?.(); assertOrgPairsCurrent(previous!);
        phase = "directory";
        effects.directoryAttempted = true;
        ensureDir(selection!.paths.targetsDir);
        effects.directoryReturned = true;
        current(); preparedCurrent?.(); assertOrgPairsCurrent(previous!);
        phase = "write";
        effects.writeAttempted = true;
        writeFileAtomic(file!, bytes, 0o644);
        effects.writeReturned = true;
        phase = "readback";
        const written = captureOrgFiles([file!]), actual = orgPairBytes(written, file!);
        if (written.members[0]!.mode !== 0o644 || actual === null || !actual.equals(bytes))
          throw new Error("target output differs from the exact prepared bytes or mode");
        own = written;
        effects.acknowledged = true;
      });
      effects.lockReturned = true;
      phase = "return";
      assertCurrent();
      return { oldTarget, profile, targetPath: file! };
    } catch (cause) {
      if (failure === null) failure = { cause };
      if (effects.lockAttempted || effects.directoryAttempted || effects.writeAttempted) throw incomplete(failure.cause);
      throw failure.cause;
    }
  } });
}

/** Fixed wizard recipe: no old-target load and no caller compatibility/provider selector. */
export function captureTargetWizardPublication(workspace: string, agentId?: string) {
  const target = captureTargetPublication(workspace, agentId, root => assertOwnerMode(root, "target set"), false);
  target.observe(); return target;
}
/** Fixed Studio recipe: preserve its genuine old-target nullish mapping fallback. */
export function captureStudioTargetPublication(workspace: string, agentId: string, actor: () => void) {
  return captureTargetPublication(workspace, agentId, () => actor(), true);
}
