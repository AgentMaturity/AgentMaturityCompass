import { applyPolicyPack } from "./packApply.js";
import { applyPolicyPackAsync } from "./packPublication.js";
import { getPolicyPack, listPolicyPacks } from "./builtInPacks.js";
import { diffPolicyPack } from "./packDiff.js";

export function policyPackListCli(): Array<{
  id: string;
  name: string;
  archetypeId: string;
  riskTier: string;
  description: string;
}> {
  return listPolicyPacks().map((pack) => ({
    id: pack.id,
    name: pack.name,
    archetypeId: pack.archetypeId,
    riskTier: pack.riskTier,
    description: pack.description
  }));
}

export function policyPackDescribeCli(packId: string) {
  const pack = getPolicyPack(packId);
  if (!pack) {
    throw new Error(`unknown policy pack: ${packId}`);
  }
  return pack;
}

export function policyPackDiffCli(params: {
  workspace: string;
  agentId?: string;
  packId: string;
}) {
  return diffPolicyPack(params);
}

export function policyPackApplyCli(params: {
  workspace: string;
  agentId?: string;
  packId: string;
}) {
  return applyPolicyPack(params);
}

/** Maintained async path; legacy policyPackApplyCli remains synchronous. */
export function policyPackApplyCliAsync(params: Parameters<typeof policyPackApplyCli>[0], options: {
  beforePublish?: () => void; recordEffect?: (effect: string) => void;
} = {}) {
  const input = { ...params }, beforePublish = options.beforePublish, recordEffect = options.recordEffect;
  return applyPolicyPackAsync(input, { beforePublish, recordEffect });
}
