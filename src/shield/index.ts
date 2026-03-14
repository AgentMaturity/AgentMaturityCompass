export { analyzeSkill } from './analyzer.js';
export type { AnalyzerFinding, AnalyzerResult } from './analyzer.js';
export { sandboxCheck } from './behavioralSandbox.js';
export type { SandboxResult } from './behavioralSandbox.js';
export { generateSbom } from './sbom.js';
export type { SbomComponent, SbomResult } from './sbom.js';
export { checkReputation } from './reputation.js';
export type { ReputationResult } from './reputation.js';
export { detonateAttachment } from './attachmentDetonation.js';
export type { DetonationResult } from './attachmentDetonation.js';
export { quarantineCheck } from './downloadQuarantine.js';
export type { QuarantineResult } from './downloadQuarantine.js';
export { checkIntegrity } from './conversationIntegrity.js';
export type { IntegrityResult } from './conversationIntegrity.js';
export { checkThreatIntel, getStats as getThreatIntelStats } from './threatIntel.js';
export type { ThreatMatch, ThreatIntelResult } from './threatIntel.js';
export { fingerprint } from './uiFingerprint.js';
export type { FingerprintResult } from './uiFingerprint.js';
export { validateManifest } from './manifest.js';
export type { ManifestValidation as ManifestResult } from './manifest.js';
export { checkRegistry } from './registry.js';
export type { RegistryCheckResult } from './registry.js';
export { checkIngress } from './ingress.js';
export type { IngressResult } from './ingress.js';
export { sanitize } from './sanitizer.js';
export type { SanitizeResult } from './sanitizer.js';
export { detect } from './detector.js';
export type { DetectorResult } from './detector.js';
export { checkOAuthScopes } from './oauthScope.js';
export type { OAuthScopeResult } from './oauthScope.js';
export {
  analyzeAdvancedThreats,
  assessCompoundThreat,
  assessTocTou,
  assessDecompositionAttack,
  assessShutdownResistance,
  assessCorrigibility
} from "./advancedThreats.js";
export type {
  ThreatSeverity,
  ThreatSignal,
  DecisionFlowEvent,
  ShutdownEvent,
  CorrectionEvent,
  AdvancedThreatInput,
  CompoundThreatAssessment,
  TocTouAssessment,
  DecompositionAssessment,
  ShutdownResistanceAssessment,
  CorrigibilityAssessment,
  AdvancedThreatAssessment
} from "./advancedThreats.js";

// ── Guard engine (runtime enforcement — Guard IS Shield) ──────────────
export { guardCheck } from './guardEngine.js';
export type { GuardCheckInput } from './guardEngine.js';

// ── Validator library (2026-02-21) ────────────────────────────────────
export {
  validatePII, validateSecretLeakage, validatePromptInjection,
  validateMedicalAdvice, validateFinancialAdvice, validateToxicity,
  validateCompetitorMention, validateCustomBlocklist,
  runAllValidators, aggregateValidationResults,
} from "./validators/index.js";
export type { ValidationResult as ShieldValidationResult, ValidationViolation, ValidatorConfig } from "./validators/index.js";

// ── Trust Pipeline (end-to-end trust orchestration) ──────────────────────
export { runTrustPipeline } from './trustPipeline.js';
export type { TrustPipelineInput, TrustPipelineResult } from './trustPipeline.js';

// ── Continuous Red Team (evolutionary adversarial testing) ────────────────
export { ContinuousRedTeam } from './continuousRedTeam.js';
export type {
  RedTeamConfig,
  RedTeamTarget,
  AttackResult,
  RedTeamRound,
  RedTeamReport,
  RegressionAlert,
} from './continuousRedTeam.js';
