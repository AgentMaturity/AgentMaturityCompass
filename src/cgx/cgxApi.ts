import { appendTransparencyEntry } from "../transparency/logChain.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { buildCgxGraphRunAsync, CgxOutputsPartialError } from "./cgxBuilder.js";
import { appendTransparencyEntryAsync } from "../transparency/asyncWorkspaceAppend.js";
import { captureOrgPairsAuthority, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { pathExists } from "../utils/fs.js";
import { cgxPolicyPath, initCgxPolicyAsync, loadCgxPolicyAsync, loadCgxPolicyReadOnly, saveCgxPolicyAsync } from "./cgxStore.js";
import { prepareBuiltCgxContextPackAsync } from "./cgxContextPack.js";
import { buildCgxGraph } from "./cgxBuilder.js";
import { buildCgxContextPack } from "./cgxContextPack.js";
import {
  initCgxPolicy,
  loadCgxPolicy,
  loadLatestCgxContextPack,
  loadLatestCgxGraph,
  saveCgxContextPack,
  saveCgxPolicy,
  verifyCgxPolicySignature
} from "./cgxStore.js";
import { verifyCgxWorkspace } from "./cgxVerifier.js";
import type { CgxPolicy, CgxScope } from "./cgxSchema.js";

function normalizeScope(params: {
  scope: "workspace" | "agent";
  targetId?: string | null;
}): CgxScope {
  if (params.scope === "workspace") {
    return {
      type: "workspace",
      id: "workspace"
    };
  }
  const id = (params.targetId ?? "default").trim();
  if (!id) {
    throw new Error("agent scope requires targetId");
  }
  return {
    type: "agent",
    id
  };
}

export function cgxInitForApi(workspace: string) {
  return initCgxPolicy(workspace);
}

export function cgxPolicyForApi(workspace: string): {
  policy: CgxPolicy;
  signature: ReturnType<typeof verifyCgxPolicySignature>;
} {
  return {
    policy: loadCgxPolicy(workspace),
    signature: verifyCgxPolicySignature(workspace)
  };
}

export function cgxPolicyApplyForApi(params: {
  workspace: string;
  policy: CgxPolicy;
}) {
  return saveCgxPolicy(params.workspace, params.policy);
}

export function cgxBuildForApi(params: {
  workspace: string;
  scope: "workspace" | "agent";
  targetId?: string | null;
}) {
  const scope = normalizeScope({
    scope: params.scope,
    targetId: params.targetId
  });
  const built = buildCgxGraph({
    workspace: params.workspace,
    scope,
    persist: true
  });

  let packSaved: ReturnType<typeof saveCgxContextPack> | null = null;
  let packHash: string | null = null;
  if (scope.type === "agent") {
    const pack = buildCgxContextPack({
      workspace: params.workspace,
      agentId: scope.id
    });
    packSaved = saveCgxContextPack(params.workspace, scope.id, pack);
    packHash = sha256Hex(canonicalize(pack));
    appendTransparencyEntry({
      workspace: params.workspace,
      type: "CGX_PACK_CREATED",
      agentId: scope.id,
      artifact: {
        kind: "policy",
        id: `cgx-pack-${scope.id}-${pack.generatedTs}`,
        sha256: packHash
      }
    });
  }

  return {
    ...built,
    packSaved,
    packHash
  };
}

export function cgxLatestGraphForApi(params: {
  workspace: string;
  scope: "workspace" | "agent";
  targetId?: string | null;
}) {
  const scope = normalizeScope({
    scope: params.scope,
    targetId: params.targetId
  });
  return loadLatestCgxGraph(params.workspace, scope);
}

export function cgxLatestPackForApi(params: {
  workspace: string;
  agentId?: string | null;
}) {
  const agentId = (params.agentId ?? "default").trim() || "default";
  return loadLatestCgxContextPack(params.workspace, agentId);
}

export function cgxVerifyForApi(workspace: string) {
  return verifyCgxWorkspace(workspace);
}

export async function cgxInitForApiAsync(workspace: string, options: OrgPairsOptions = {}) { return initCgxPolicyAsync(workspace, options); }
export async function cgxPolicyForApiAsync(workspace: string, options: OrgPairsOptions = {}) {
  if (pathExists(cgxPolicyPath(workspace))) return { policy: loadCgxPolicyReadOnly(workspace), signature: verifyCgxPolicySignature(workspace) };
  const original = captureOrgPairsAuthority(workspace, options.beforePublish);
  await loadCgxPolicyAsync(workspace, { ...options, beforePublish: original }); original(); return { policy: loadCgxPolicyReadOnly(workspace), signature: verifyCgxPolicySignature(workspace) };
}
export async function cgxPolicyApplyForApiAsync(params: { workspace: string; policy: CgxPolicy }, options: OrgPairsOptions = {}) {
  return saveCgxPolicyAsync(params.workspace, params.policy, options);
}
export async function cgxBuildForApiAsync(params: Parameters<typeof cgxBuildForApi>[0], options: OrgPairsOptions = {}) {
  options = { ...options }; params = { ...params }; options = { ...options, beforePublish: captureOrgPairsAuthority(params.workspace, options.beforePublish) };
  const scope = normalizeScope({ scope: params.scope, targetId: params.targetId });
  const graphAttempt = await buildCgxGraphRunAsync({ workspace: params.workspace, scope, persist: true }, options), built = graphAttempt.result;
  let packSaved: ReturnType<typeof saveCgxContextPack> | null = null, packHash: string | null = null;
  if (scope.type === "agent") {
    try {
      const prepared = await prepareBuiltCgxContextPackAsync({ workspace: params.workspace, agentId: scope.id }, { beforePublish: () => { options.beforePublish?.(); graphAttempt.assertCurrent(); } });
      packSaved = prepared.publish(); packHash = sha256Hex(canonicalize(prepared.pack));
      try { prepared.assertCurrent(); await appendTransparencyEntryAsync({ workspace: params.workspace, type: "CGX_PACK_CREATED", agentId: scope.id,
        artifact: { kind: "policy", id: `cgx-pack-${scope.id}-${prepared.pack.generatedTs}`, sha256: packHash } }, { beforeCommit: prepared.assertCurrent }); }
      catch (error) { throw new CgxOutputsPartialError([...(built.saved ? [built.saved.latestPath, built.saved.latestSigPath, built.saved.snapshotPath, built.saved.snapshotSigPath] : []), packSaved.path, packSaved.sigPath], "pack-transparency", error, built.transparencyHash === null ? [] : [built.transparencyHash]); }
    } catch (error) { if (error instanceof CgxOutputsPartialError) throw error;
      throw new CgxOutputsPartialError(built.saved ? [built.saved.latestPath, built.saved.latestSigPath, built.saved.snapshotPath, built.saved.snapshotSigPath] : [], "pack-after-graph", error, built.transparencyHash === null ? [] : [built.transparencyHash]); }
  }
  return { ...built, packSaved, packHash };
}
