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
import { multiTurnSafetyPack } from "./multi-turn-safety.js";
import { roleSupportFraudPack } from "./roleSupportFraudPack.js";
import { roleDeploySabotagePack } from "./roleDeploySabotagePack.js";
import { modelRoutePoisoningPack } from "./modelRoutePoisoningPack.js";
import { supplyChainAttackPack } from "./supplyChainAttackPack.js";
import { tocTouPack } from "./tocTouPack.js";
import { resourceExhaustionPack } from "./resourceExhaustionPack.js";
import { compoundThreatPack } from "./compoundThreatPack.js";
import { memoryPoisoningPack } from "./memoryPoisoningPack.js";
import { timingSideChannelPack } from "./timingSideChannelPack.js";
import { disempowermentPack } from "./disempowermentPack.js";
import { dlpExfiltrationPack } from "./dlpExfiltrationPack.js";
import { sbomSupplyChainPack } from "./sbomSupplyChainPack.js";
import { supplyChainIntegrityPack } from "./supply-chain-integrity.js";
import { operationalDisciplinePack } from "./operational-discipline.js";
import { ragPoisoningPack } from "./ragPoisoningPack.js";
import { circuitBreakerReliabilityPack } from "./circuitBreakerReliabilityPack.js";
import { honeytokenDetectionPack } from "./honeytokenDetectionPack.js";
import { configLintPack } from "./configLintPack.js";
import { stepupApprovalBypassPack } from "./stepupApprovalBypassPack.js";
import { taintPropagationPack } from "./taintPropagationPack.js";
import { healthcarePHIPack } from "./healthcarePHIPack.js";
import { hipaaCompliancePack } from "./hipaaCompliancePack.js";
import { financialModelRiskPack } from "./financialModelRiskPack.js";
import { safetyCriticalSILPack } from "./safetyCriticalSILPack.js";
import { educationFERPAPack } from "./educationFERPAPack.js";
import { environmentalInfraPack } from "./environmentalInfraPack.js";
import { mobilityFunctionalSafetyPack } from "./mobilityFunctionalSafetyPack.js";
import { governanceNISTRMFPack } from "./governanceNISTRMFPack.js";
import { technologyGDPRSOCPack } from "./technologyGDPRSOCPack.js";
import { wealthManagementMiFIDPack } from "./wealthManagementMiFIDPack.js";
import { memoryMaturityPack } from "./memoryMaturityPack.js";
import { humanOversightQualityPack } from "./humanOversightQualityPack.js";
import { instructionCompliancePack } from "./instructionCompliancePack.js";
import { contentProvenancePack } from "./contentProvenancePack.js";
import { contextLeakagePack } from "./context-leakage.js";
import { excessiveAgencyPack } from "./excessiveAgencyPack.js";
import { behavioralContractViolationPack } from "./behavioralContractViolationPack.js";
import { overreliancePack } from "./overreliancePack.js";
import { advancedThreatsPack } from "./advancedThreatsPack.js";
import { adversarialRobustnessPack } from "./adversarial-robustness.js";
import { approvalTheaterPack } from "./approvalTheaterPack.js";
import { toolMisusePack } from "./toolMisusePack.js";
import { truthfulnessPack } from "./truthfulnessPack.js";
import { sandboxBoundaryPack } from "./sandboxBoundaryPack.js";
import { notaryAttestationPack } from "./notaryAttestationPack.js";
import { euAiActArticlePack } from "./euAiActArticlePack.js";
import { iso42005Pack } from "./iso42005Pack.js";
import { owaspGenAiPack } from "./owaspGenAiPack.js";
import { sycophancyPack } from "./sycophancyPack.js";
import { selfPreservationPack } from "./selfPreservationPack.js";
import { sabotagePack } from "./sabotagePack.js";
import { selfPreferentialBiasPack } from "./selfPreferentialBiasPack.js";
import { overCompliancePack } from "./overCompliancePack.js";
import { falsePremisePack } from "./falsePremisePack.js";
import { misleadingContextPack } from "./misleadingContextPack.js";
import { promptCachePoisoningPack } from "./promptCachePoisoningPack.js";
import { agenticLoopGovernancePack } from "./agenticLoopGovernancePack.js";
import { delegationTrustChainPack } from "./delegationTrustChainPack.js";
import { codingAgentEscapePack } from "./codingAgentEscapePack.js";
import { evaluationReliabilityPack } from "./evaluationReliabilityPack.js";
import { toolSchemaDriftPack } from "./toolSchemaDriftPack.js";
import { costEfficiencyPack } from "./costEfficiencyPack.js";
import { contextWindowManagementPack } from "./contextWindowManagementPack.js";
import { agentIdentitySpoofingPack } from "./agentIdentitySpoofingPack.js";
import { reasoningObservabilityPack } from "./reasoningObservabilityPack.js";
import { globalAIRegulatoryPack } from "./globalAIRegulatoryPack.js";
import { valueCoherencePack } from "./valueCoherencePack.js";
import { piiDetectionLeakagePack } from "./piiDetectionLeakagePack.js";
import { financialSOXPack } from "./financialSOXPack.js";
import { pharmaCompliancePack } from "./pharmaCompliancePack.js";
import { legalCompliancePack } from "./legalCompliancePack.js";
import { informationExtractionPack } from "./informationExtractionPack.js";
import { harmBenchPack } from "./harmbench-pack.js";
import { nvidiaAegisPack } from "./nvidia-aegis-pack.js";
import { cyberSecEvalPack } from "./cyberseceval-pack.js";
import { beaverTailsPack } from "./beavertails-pack.js";
import { doNotAnswerPack } from "./donotanswer-pack.js";
import { toxicChatPack } from "./toxic-chat-pack.js";
import { xsTestPack } from "./xstest-pack.js";
// Research Gap Packs (March 2026 papers)
import { runtimeTrustGatePack } from "./runtimeTrustGatePack.js";
import { instructionHierarchyPack } from "./instructionHierarchyPack.js";
import { instructionalLeakagePack } from "./instructionalLeakagePack.js";
import { emergentMultiAgentRiskPack } from "./emergentMultiAgentRiskPack.js";
import { evaluationFreshnessPack } from "./evaluationFreshnessPack.js";
import { uncertaintyPropagationPack } from "./uncertaintyPropagationPack.js";
import { inputFaultResiliencePack } from "./inputFaultResiliencePack.js";
import { thoughtSafetyAuditPack } from "./thoughtSafetyAuditPack.js";
import { reasoningLockDetectionPack } from "./reasoningLockDetectionPack.js";
import { multiTurnToolAttackPack } from "./multiTurnToolAttackPack.js";

const assurancePacks: AssurancePackDefinition[] = [
  injectionPack,
  exfiltrationPack,
  toolMisusePack,
  truthfulnessPack,
  sandboxBoundaryPack,
  notaryAttestationPack,
  unsafeToolPack,
  hallucinationPack,
  governanceBypassPack,
  dualityPack,
  chainEscalationPack,
  encodedInjectionPack,
  crossAgentCollusionPack,
  silentFailurePack,
  policyConfusionPack,
  multiTurnSafetyPack,
  roleSupportFraudPack,
  roleDeploySabotagePack,
  modelRoutePoisoningPack,
  supplyChainAttackPack,
  tocTouPack,
  resourceExhaustionPack,
  compoundThreatPack,
  memoryPoisoningPack,
  timingSideChannelPack,
  disempowermentPack,
  dlpExfiltrationPack,
  sbomSupplyChainPack,
  supplyChainIntegrityPack,
  operationalDisciplinePack,
  ragPoisoningPack,
  circuitBreakerReliabilityPack,
  honeytokenDetectionPack,
  configLintPack,
  stepupApprovalBypassPack,
  taintPropagationPack,
  healthcarePHIPack,
  hipaaCompliancePack,
  financialModelRiskPack,
  safetyCriticalSILPack,
  educationFERPAPack,
  environmentalInfraPack,
  mobilityFunctionalSafetyPack,
  governanceNISTRMFPack,
  technologyGDPRSOCPack,
  wealthManagementMiFIDPack,
  memoryMaturityPack,
  humanOversightQualityPack,
  instructionCompliancePack,
  contentProvenancePack,
  contextLeakagePack,
  excessiveAgencyPack,
  behavioralContractViolationPack,
  overreliancePack,
  adversarialRobustnessPack,
  advancedThreatsPack,
  approvalTheaterPack,
  euAiActArticlePack,
  iso42005Pack,
  owaspGenAiPack,
  sycophancyPack,
  selfPreservationPack,
  sabotagePack,
  selfPreferentialBiasPack,
  overCompliancePack,
  falsePremisePack,
  misleadingContextPack,
  promptCachePoisoningPack,
  agenticLoopGovernancePack,
  delegationTrustChainPack,
  codingAgentEscapePack,
  evaluationReliabilityPack,
  toolSchemaDriftPack,
  costEfficiencyPack,
  contextWindowManagementPack,
  agentIdentitySpoofingPack,
  reasoningObservabilityPack,
  globalAIRegulatoryPack,
  valueCoherencePack,
  piiDetectionLeakagePack,
  financialSOXPack,
  pharmaCompliancePack,
  legalCompliancePack,
  informationExtractionPack,
  // Research Dataset Integration Packs
  harmBenchPack,
  nvidiaAegisPack,
  cyberSecEvalPack,
  beaverTailsPack,
  doNotAnswerPack,
  toxicChatPack,
  xsTestPack,
  // Research Gap Packs (March 2026 papers)
  runtimeTrustGatePack,
  instructionHierarchyPack,
  instructionalLeakagePack,
  emergentMultiAgentRiskPack,
  evaluationFreshnessPack,
  uncertaintyPropagationPack,
  inputFaultResiliencePack,
  thoughtSafetyAuditPack,
  reasoningLockDetectionPack,
  multiTurnToolAttackPack,
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

