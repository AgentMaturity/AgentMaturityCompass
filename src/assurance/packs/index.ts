import type { AssurancePackDefinition } from "../validators.js";
import { dualityPack } from "./dualityPack.js";
import { exfiltrationPack } from "./exfiltrationPack.js";
import { governanceBypassPack } from "./governanceBypassPack.js";
import { hallucinationPack } from "./hallucinationPack.js";
import { injectionPack } from "./injectionPack.js";
import { unsafeToolPack } from "./unsafeToolPack.js";
import { chainEscalationPack } from "./chainEscalationPack.js";
import { encodedInjectionPack } from "./encodedInjectionPack.js";
import { crossAgentCollusionPack } from "./crossAgentCollusionPack.js";
import { silentFailurePack } from "./silentFailurePack.js";
import { policyConfusionPack } from "./policyConfusionPack.js";
import { roleSupportFraudPack } from "./roleSupportFraudPack.js";
import { roleDeploySabotagePack } from "./roleDeploySabotagePack.js";
import { modelRoutePoisoningPack } from "./modelRoutePoisoningPack.js";
import { supplyChainAttackPack } from "./supplyChainAttackPack.js";
import { tocTouPack } from "./tocTouPack.js";
import { resourceExhaustionPack } from "./resourceExhaustionPack.js";
import { compoundThreatPack } from "./compoundThreatPack.js";
import { memoryPoisoningPack } from "./memoryPoisoningPack.js";
import { timingSideChannelPack } from "./timingSideChannelPack.js";

const assurancePacks: AssurancePackDefinition[] = [
  injectionPack,
  exfiltrationPack,
  unsafeToolPack,
  hallucinationPack,
  governanceBypassPack,
  dualityPack,
  chainEscalationPack,
  encodedInjectionPack,
  crossAgentCollusionPack,
  silentFailurePack,
  policyConfusionPack,
  roleSupportFraudPack,
  roleDeploySabotagePack,
  modelRoutePoisoningPack,
  supplyChainAttackPack,
  tocTouPack,
  resourceExhaustionPack,
  compoundThreatPack,
  memoryPoisoningPack,
  timingSideChannelPack
];

export function listAssurancePacks(): AssurancePackDefinition[] {
  return assurancePacks.map((pack) => ({ ...pack, scenarios: [...pack.scenarios] }));
}

export function getAssurancePack(packId: string): AssurancePackDefinition {
  const pack = assurancePacks.find((item) => item.id === packId);
  if (!pack) {
    throw new Error(`Unknown assurance pack: ${packId}`);
  }
  return {
    ...pack,
    scenarios: [...pack.scenarios]
  };
}

