export { PolicyFirewall } from './policyFirewall.js';
export type { PolicyDecision, PolicyResult, PolicyRule } from './policyFirewall.js';
export { checkExec } from './execGuard.js';
export type { ExecGuardResult } from './execGuard.js';
export { CircuitBreaker } from './circuitBreaker.js';
export type { CircuitState, CircuitBreakerConfig, CircuitCheckResult } from './circuitBreaker.js';
export { StepUpAuth } from './stepUpAuth.js';
export type { RiskLevel, StepUpRequest, StepUpDecision } from './stepUpAuth.js';
export { detectAto } from './atoDetection.js';
export type { AtoResult } from './atoDetection.js';
export { TaintTracker } from './taintTracker.js';
export type { TaintedValue } from './taintTracker.js';
export { checkNumeric } from './numericChecker.js';
export type { NumericCheckResult } from './numericChecker.js';
export { lintConfig } from './configLinter.js';
export type { LintFinding, LintResult } from './configLinter.js';
export { ModeSwitcher } from './modeSwitcher.js';
export type { AgentMode } from './modeSwitcher.js';
export { verifyCrossSources } from './crossSourceVerifier.js';
export type { VerificationResult } from './crossSourceVerifier.js';
export { checkPayee } from './payeeGuard.js';
export type { PayeeCheckResult } from './payeeGuard.js';
export { ModelSwitchboard } from './modelSwitchboard.js';
export type { EnforceRouteDecision, EnforceRoutingProfile } from './modelSwitchboard.js';
export { scanMdns } from './mdnsController.js';
export type { MdnsResult } from './mdnsController.js';
export { checkProxy } from './reverseProxyGuard.js';
export type { ProxyGuardResult } from './reverseProxyGuard.js';
export { checkPhishing } from './antiPhishing.js';
export type { PhishingResult } from './antiPhishing.js';
export { blindSecrets } from './secretBlind.js';
export type { SecretBlindResult } from './secretBlind.js';
export { createEvidenceContract } from './evidenceContract.js';
export type { EvidenceContract } from './evidenceContract.js';
export { checkTemporalAccess } from './temporalControls.js';
export type { TemporalResult } from './temporalControls.js';
export { checkGeoFence } from './geoFence.js';
export type { GeoFenceResult } from './geoFence.js';
export { guardClipboard } from './clipboardGuard.js';
export type { ClipboardResult } from './clipboardGuard.js';
export { renderTemplate } from './templateEngine.js';
export type { TemplateResult } from './templateEngine.js';

// ── AgentSpec-style declarative safety DSL ────────────────────────
export { SafetyEngine, parseDSLRule, parseDSLRules } from './safetyDSL.js';
export type {
  SafetyConstraint, ConstraintAction, Condition,
  SafetyEvalResult, ConstraintEvalResult, ParsedRule,
} from './safetyDSL.js';

// ── Semantic guardrails ───────────────────────────────────────────
export { SemanticGuardrails } from './semanticGuardrails.js';
export type {
  TopicRule, ToneRule, ContentBoundary, SteeringRule,
  GuardrailConfig, GuardrailViolation, GuardrailResult,
  GuardrailAction, TopicCategory,
} from './semanticGuardrails.js';

// ── Formal Verification (proof trees, TLA+, certificates) ─────────────────
export {
  CORE_SAFETY_PROPERTIES,
  checkInvariants,
  boundedModelCheck,
  verifyPolicyComposition,
  generateTLASpec,
  generateTLCConfig,
  verifyCertificate,
} from './formalVerification.js';
export type {
  ProofNode,
  InferenceRule,
  Proposition,
  ProofCertificate,
  SystemState,
  FormalProperty,
  InvariantCheckResult,
  PolicyCompositionResult,
  PolicyConflict,
  ResolvedPolicy,
  PolicyRule as FormalPolicyRule,
} from './formalVerification.js';
