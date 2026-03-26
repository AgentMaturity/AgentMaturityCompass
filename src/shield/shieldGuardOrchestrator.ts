/**
 * AMC Shield — Integrated Runtime Protection Engine
 * Unified detection and enforcement for real-time protection
 * Provides sophisticated detection aligned with AMC's unique maturity framework
 */

import { guardCheck, type GuardCheckInput } from './guardEngine.js';
import { detect, type DetectorResult } from './detector.js';
import { analyzeAdvancedThreats, type AdvancedThreatInput, type AdvancedThreatAssessment } from './advancedThreats.js';
import { dynamicAttackGenerator, type AttackContext, type GeneratedAttack } from './dynamicAttackGenerator.js';
import { emitGuardEvent } from '../enforce/evidenceEmitter.js';
import type { GuardCheckResult, RiskTier, TargetProfile } from '../types.js';
import type { ContextGraph } from '../context/contextGraph.js';

export interface ShieldGuardConfig {
  enableRealTimeProtection: boolean;
  enableAdaptiveLearning: boolean;
  enableThreatIntelligence: boolean;
  sophisticationThreshold: number; // 0-1, higher = more sophisticated attacks
  responseLatencyMs: number; // Max acceptable response time
  evidenceRetention: 'minimal' | 'standard' | 'comprehensive';
  maturityLevel: 0 | 1 | 2 | 3 | 4 | 5; // AMC maturity level for enforcement
}

export interface ProtectionRequest {
  input: string;
  context: ContextGraph;
  targetProfile: TargetProfile;
  sessionId?: string;
  riskTier?: RiskTier;
  metadata?: Record<string, any>;
}

/**
 * Pre-Action Trust Gate Request
 * Based on: TrustBench (March 9, 2026) — runtime trust verification before each action.
 * Validates trust conditions before tool calls, not just post-hoc.
 */
export interface PreActionTrustGateRequest {
  action: string;                          // The action about to be executed
  toolName: string;                        // Target tool
  parameters: Record<string, unknown>;     // Parameters being passed
  sessionId: string;
  instructionSource: 'system' | 'developer' | 'user' | 'tool';  // IH-Challenge hierarchy
  sensitiveDataFields?: string[];          // Fields containing PII/sensitive data
  trustContext: {
    lastVerifiedAt?: number;               // Timestamp of last trust verification
    cumulativeConfidence?: number;          // Compounded confidence (UProp)
    stepNumber?: number;                    // Current step in multi-step workflow
    previousActions?: string[];            // Audit trail of prior actions
  };
}

export interface PreActionTrustGateResult {
  allowed: boolean;
  reason: string;
  trustScore: number;                      // 0-1 trust score for this action
  checks: {
    instructionHierarchyValid: boolean;    // IH-Challenge: source has authority
    dataLeakageRisk: 'none' | 'low' | 'medium' | 'high';  // "You Told Me to Do It"
    credentialFreshness: 'valid' | 'stale' | 'expired';
    uncertaintyAcceptable: boolean;        // UProp: cumulative confidence above threshold
  };
  recommendations: string[];
  evidenceId: string;
}

export interface ProtectionResult {
  allowed: boolean;
  confidence: number;
  threatLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  detectedAttacks: DetectorResult[];
  advancedThreats: AdvancedThreatAssessment;
  guardDecision: GuardCheckResult;
  responseTime: number;
  evidenceId: string;
  recommendations: string[];
  adaptiveLearning?: {
    newPatterns: string[];
    updatedRules: string[];
  };
}

export interface ThreatIntelligenceUpdate {
  source: string;
  timestamp: number;
  newVectors: string[];
  patchedVulnerabilities: string[];
  emergingThreats: string[];
}

/**
 * Real-time Protection Engine - Core orchestration
 */
export class ShieldGuardOrchestrator {
  private config: ShieldGuardConfig;
  private threatIntelligence: Map<string, ThreatIntelligenceUpdate> = new Map();
  private adaptivePatterns: Map<string, number> = new Map(); // pattern -> confidence
  private performanceMetrics: {
    totalRequests: number;
    blockedRequests: number;
    averageLatency: number;
    falsePositives: number;
    falseNegatives: number;
  } = {
    totalRequests: 0,
    blockedRequests: 0,
    averageLatency: 0,
    falsePositives: 0,
    falseNegatives: 0
  };

  constructor(config: ShieldGuardConfig) {
    this.config = config;
    this.initializeThreatIntelligence();
  }

  /**
   * Main protection endpoint - integrates Shield detection with Guard enforcement
   */
  async protect(request: ProtectionRequest): Promise<ProtectionResult> {
    const startTime = Date.now();
    const evidenceId = this.generateEvidenceId();

    emitGuardEvent({
      agentId: request.sessionId || 'system', moduleCode: 'protection_request_started',
      decision: 'allow', reason: 'Protection request initiated', severity: 'low',
      meta: { evidenceId, inputLength: request.input.length, riskTier: request.riskTier }
    });

    try {
      // Phase 1: Shield Detection (parallel execution for speed)
      const [detectorResult, advancedThreats] = await Promise.all([
        this.runShieldDetection(request.input, evidenceId),
        this.runAdvancedThreatAnalysis(request, evidenceId)
      ]);

      // Phase 2: Guard Enforcement (based on detection results)
      const guardDecision = await this.runGuardEnforcement(request, detectorResult, advancedThreats);

      // Phase 3: Adaptive Learning (if enabled)
      const adaptiveLearning = this.config.enableAdaptiveLearning 
        ? await this.updateAdaptiveLearning(request.input, detectorResult, guardDecision)
        : undefined;

      // Phase 4: Generate final decision
      const result = this.synthesizeProtectionResult({
        detectorResult,
        advancedThreats,
        guardDecision,
        adaptiveLearning,
        evidenceId,
        responseTime: Date.now() - startTime
      });

      // Update metrics
      this.updateMetrics(result);

      emitGuardEvent({
        agentId: request.sessionId || 'system', moduleCode: 'protection_request_completed',
        decision: result.allowed ? 'allow' : 'deny', reason: `Threat level: ${result.threatLevel}`, severity: 'low',
        meta: { evidenceId, allowed: result.allowed, threatLevel: result.threatLevel, responseTime: result.responseTime }
      });

      return result;

    } catch (error) {
      emitGuardEvent({
        agentId: 'system', moduleCode: 'protection_request_failed',
        decision: 'deny', reason: error instanceof Error ? error.message : 'Unknown error', severity: 'high',
        meta: { evidenceId }
      });
      
      // Fail-safe: allow request but log the failure
      return this.createFailSafeResult(evidenceId, Date.now() - startTime);
    }
  }

  /**
   * Pre-Action Trust Gate — Runtime trust verification before each tool call.
   * Based on TrustBench (Mar 2026), IH-Challenge (Mar 2026), "You Told Me to Do It" (Mar 2026).
   *
   * Validates:
   * 1. Instruction hierarchy: does the source have authority for this action?
   * 2. Data leakage risk: are sensitive fields being sent to an external tool?
   * 3. Credential freshness: are credentials stale?
   * 4. Uncertainty threshold: is cumulative confidence acceptable for this action?
   */
  async preActionTrustGate(request: PreActionTrustGateRequest): Promise<PreActionTrustGateResult> {
    const evidenceId = this.generateEvidenceId();
    const recommendations: string[] = [];

    // Check 1: Instruction Hierarchy (IH-Challenge)
    const HIERARCHY_ORDER = { system: 4, developer: 3, user: 2, tool: 1 };
    const sourceAuthority = HIERARCHY_ORDER[request.instructionSource] ?? 0;
    // Tool-level instructions should not trigger sensitive actions
    const instructionHierarchyValid = sourceAuthority >= 2; // At minimum user-level
    if (!instructionHierarchyValid) {
      recommendations.push(
        `Action requested by ${request.instructionSource}-level instruction. ` +
        `Sensitive actions require at least user-level authority.`
      );
    }

    // Check 2: Data Leakage Risk ("You Told Me to Do It")
    const sensitiveFields = request.sensitiveDataFields ?? [];
    const hasSensitiveData = sensitiveFields.length > 0;
    const isExternalTool = /external|webhook|api|analytics|third.?party/i.test(request.toolName);
    let dataLeakageRisk: 'none' | 'low' | 'medium' | 'high' = 'none';
    if (hasSensitiveData && isExternalTool) {
      dataLeakageRisk = sensitiveFields.length > 3 ? 'high' : 'medium';
      recommendations.push(
        `${sensitiveFields.length} sensitive field(s) being sent to external tool "${request.toolName}". ` +
        `Review data flow for instructional leakage risk.`
      );
    } else if (hasSensitiveData) {
      dataLeakageRisk = 'low';
    }

    // Check 3: Credential Freshness
    const now = Date.now();
    const lastVerified = request.trustContext.lastVerifiedAt ?? 0;
    const stalenessMs = now - lastVerified;
    const STALE_THRESHOLD = 30 * 60 * 1000; // 30 minutes
    const EXPIRED_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours
    let credentialFreshness: 'valid' | 'stale' | 'expired' = 'valid';
    if (stalenessMs > EXPIRED_THRESHOLD) {
      credentialFreshness = 'expired';
      recommendations.push('Credentials expired (>24h). Re-authentication required.');
    } else if (stalenessMs > STALE_THRESHOLD) {
      credentialFreshness = 'stale';
      recommendations.push('Credentials stale (>30min). Re-validation recommended.');
    }

    // Check 4: Uncertainty Threshold (UProp)
    const cumulativeConfidence = request.trustContext.cumulativeConfidence ?? 1.0;
    const UNCERTAINTY_THRESHOLD = 0.6; // Below 60% cumulative confidence = defer to human
    const uncertaintyAcceptable = cumulativeConfidence >= UNCERTAINTY_THRESHOLD;
    if (!uncertaintyAcceptable) {
      recommendations.push(
        `Cumulative confidence (${(cumulativeConfidence * 100).toFixed(1)}%) ` +
        `below threshold (${UNCERTAINTY_THRESHOLD * 100}%). Human deferral recommended.`
      );
    }

    // Synthesize trust score
    let trustScore = 1.0;
    if (!instructionHierarchyValid) trustScore -= 0.3;
    if (dataLeakageRisk === 'high') trustScore -= 0.4;
    else if (dataLeakageRisk === 'medium') trustScore -= 0.2;
    if (credentialFreshness === 'expired') trustScore -= 0.3;
    else if (credentialFreshness === 'stale') trustScore -= 0.1;
    if (!uncertaintyAcceptable) trustScore -= 0.2;
    trustScore = Math.max(0, trustScore);

    const allowed = trustScore >= 0.5 && credentialFreshness !== 'expired';

    emitGuardEvent({
      agentId: request.sessionId, moduleCode: 'pre_action_trust_gate',
      decision: allowed ? 'allow' : 'deny',
      reason: `Trust score: ${trustScore.toFixed(2)}, ` +
              `hierarchy: ${instructionHierarchyValid}, ` +
              `leakage: ${dataLeakageRisk}, ` +
              `credentials: ${credentialFreshness}`,
      severity: allowed ? 'low' : 'high',
      meta: { evidenceId, action: request.action, toolName: request.toolName, trustScore }
    });

    return {
      allowed,
      reason: allowed
        ? `Action permitted (trust: ${trustScore.toFixed(2)})`
        : `Action blocked (trust: ${trustScore.toFixed(2)}). ${recommendations[0] || ''}`,
      trustScore,
      checks: { instructionHierarchyValid, dataLeakageRisk, credentialFreshness, uncertaintyAcceptable },
      recommendations,
      evidenceId,
    };
  }

  /**
   * Shield Detection Phase - Multi-layered threat detection
   */
  private async runShieldDetection(input: string, evidenceId: string): Promise<DetectorResult[]> {
    const results: DetectorResult[] = [];

    // Layer 1: Basic pattern detection (fast)
    const basicDetection = detect(input);
    results.push(basicDetection);

    // Layer 2: Dynamic pattern matching (adaptive)
    if (this.config.enableAdaptiveLearning) {
      const adaptiveDetection = await this.runAdaptiveDetection(input);
      results.push(adaptiveDetection);
    }

    // Layer 3: Threat intelligence matching
    if (this.config.enableThreatIntelligence) {
      const threatIntelDetection = await this.runThreatIntelligenceDetection(input);
      results.push(threatIntelDetection);
    }

    emitGuardEvent({
      agentId: 'system', moduleCode: 'shield_detection_completed',
      decision: 'allow', reason: 'Shield detection completed', severity: 'low',
      meta: { evidenceId, layersExecuted: results.length, threatsDetected: results.reduce((sum, r) => sum + r.attacks.length, 0) }
    });

    return results;
  }

  /**
   * Advanced Threat Analysis - Sophisticated attack pattern analysis
   */
  private async runAdvancedThreatAnalysis(
    request: ProtectionRequest, 
    evidenceId: string
  ): Promise<AdvancedThreatAssessment> {
    const threatInput: AdvancedThreatInput = {
      prompt: request.input,
      response: '', // We don't have response yet, but can analyze prompt
      extraSignals: this.extractThreatSignals(request),
      decisionFlow: this.buildDecisionFlow(request)
    };

    const assessment = analyzeAdvancedThreats(threatInput);

    emitGuardEvent({
      agentId: 'system', moduleCode: 'advanced_threat_analysis_completed',
      decision: assessment.threatDetected ? 'warn' : 'allow',
      reason: `Risk score: ${assessment.overallRiskScore0to100}`, severity: assessment.threatDetected ? 'high' : 'low',
      meta: { evidenceId, overallRiskScore: assessment.overallRiskScore0to100, threatDetected: assessment.threatDetected, severityLevel: assessment.overallSeverity }
    });

    return assessment;
  }

  /**
   * Guard Enforcement Phase - Policy-based decision making
   */
  private async runGuardEnforcement(
    request: ProtectionRequest,
    detectorResults: DetectorResult[],
    advancedThreats: AdvancedThreatAssessment
  ): Promise<GuardCheckResult> {
    // Enhance guard input with detection results
    const enhancedInput: GuardCheckInput = {
      contextGraph: request.context,
      signedTargetProfile: request.targetProfile,
      proposedActionOrOutput: request.input,
      taskMetadata: {
        riskTier: this.calculateRiskTier(detectorResults, advancedThreats),
        actionType: 'user_input_processing'
      }
    };

    const guardResult = guardCheck(enhancedInput);

    // Apply maturity-level specific enforcement
    return this.applyMaturityEnforcement(guardResult, detectorResults, advancedThreats);
  }

  /**
   * Adaptive Learning - Learn from new attack patterns
   */
  private async updateAdaptiveLearning(
    input: string,
    detectorResults: DetectorResult[],
    guardDecision: GuardCheckResult
  ): Promise<{ newPatterns: string[]; updatedRules: string[] }> {
    const newPatterns: string[] = [];
    const updatedRules: string[] = [];

    // Extract new patterns from detected attacks
    detectorResults.forEach(result => {
      result.attacks.forEach(attack => {
        const pattern = this.extractPattern(attack.pattern, input);
        if (pattern && !this.adaptivePatterns.has(pattern)) {
          this.adaptivePatterns.set(pattern, attack.confidence);
          newPatterns.push(pattern);
        }
      });
    });

    // Update rule confidence based on guard decision accuracy
    if (!guardDecision.pass) {
      updatedRules.push('increased_sensitivity_for_detected_patterns');
    }

    return { newPatterns, updatedRules };
  }

  /**
   * Synthesize final protection result
   */
  private synthesizeProtectionResult(params: {
    detectorResult: DetectorResult[];
    advancedThreats: AdvancedThreatAssessment;
    guardDecision: GuardCheckResult;
    adaptiveLearning?: { newPatterns: string[]; updatedRules: string[] };
    evidenceId: string;
    responseTime: number;
  }): ProtectionResult {
    const { detectorResult, advancedThreats, guardDecision, adaptiveLearning, evidenceId, responseTime } = params;

    // Calculate overall threat level
    const maxDetectorRisk = Math.max(...detectorResult.map(r => r.riskScore));
    const advancedRisk = advancedThreats.overallRiskScore0to100 / 100;
    const overallRisk = Math.max(maxDetectorRisk, advancedRisk);

    const threatLevel = this.calculateThreatLevel(overallRisk);
    const confidence = this.calculateConfidence(detectorResult, advancedThreats, guardDecision);

    // Final decision based on guard result and threat level
    const allowed = guardDecision.pass && threatLevel !== 'critical';

    return {
      allowed,
      confidence,
      threatLevel,
      detectedAttacks: detectorResult,
      advancedThreats,
      guardDecision,
      responseTime,
      evidenceId,
      recommendations: this.generateRecommendations(detectorResult, advancedThreats, guardDecision),
      adaptiveLearning
    };
  }

  /**
   * Generate contextual recommendations
   */
  private generateRecommendations(
    detectorResults: DetectorResult[],
    advancedThreats: AdvancedThreatAssessment,
    guardDecision: GuardCheckResult
  ): string[] {
    const recommendations: string[] = [];

    // Based on detected attacks
    detectorResults.forEach(result => {
      if (result.attacks.length > 0) {
        const attackTypes = [...new Set(result.attacks.map(a => a.type))];
        attackTypes.forEach(type => {
          recommendations.push(`Implement ${type} protection measures`);
        });
      }
    });

    // Based on advanced threats
    if (advancedThreats.threatDetected) {
      if (advancedThreats.compound.detected) {
        recommendations.push('Deploy compound attack detection');
      }
      if (advancedThreats.toctou.vulnerable) {
        recommendations.push('Implement time-of-check-time-of-use protection');
      }
      if (advancedThreats.decomposition.detected) {
        recommendations.push('Add request decomposition analysis');
      }
    }

    // Based on guard decision
    if (!guardDecision.pass) {
      recommendations.push(...guardDecision.requiredRemediations);
      recommendations.push(...guardDecision.requiredEscalations);
    }

    // Maturity-specific recommendations
    if (this.config.maturityLevel < 3) {
      recommendations.push('Upgrade to L3+ maturity for enhanced protection');
    }

    return [...new Set(recommendations)]; // Remove duplicates
  }

  /**
   * Adaptive pattern detection using learned patterns
   */
  private async runAdaptiveDetection(input: string): Promise<DetectorResult> {
    const attacks: any[] = [];
    let totalRisk = 0;

    for (const [pattern, confidence] of this.adaptivePatterns.entries()) {
      const regex = new RegExp(pattern, 'i');
      const match = regex.exec(input);
      
      if (match) {
        attacks.push({
          type: 'adaptive_pattern',
          pattern: pattern,
          confidence: confidence,
          position: match.index
        });
        totalRisk += confidence;
      }
    }

    return {
      detected: attacks.length > 0,
      attacks,
      riskScore: Math.min(totalRisk, 1.0),
      confidence: attacks.length > 0 ? Math.max(...attacks.map(a => a.confidence)) : 0
    };
  }

  /**
   * Threat intelligence based detection
   */
  private async runThreatIntelligenceDetection(input: string): Promise<DetectorResult> {
    const attacks: any[] = [];
    let maxRisk = 0;

    for (const [source, intel] of this.threatIntelligence.entries()) {
      for (const vector of intel.newVectors) {
        if (input.toLowerCase().includes(vector.toLowerCase())) {
          attacks.push({
            type: 'threat_intelligence',
            pattern: vector,
            confidence: 0.8,
            position: input.toLowerCase().indexOf(vector.toLowerCase()),
            source: source
          });
          maxRisk = Math.max(maxRisk, 0.8);
        }
      }
    }

    return {
      detected: attacks.length > 0,
      attacks,
      riskScore: maxRisk,
      confidence: maxRisk
    };
  }

  /**
   * Helper methods
   */
  private extractThreatSignals(request: ProtectionRequest): any[] {
    // Extract contextual threat signals
    return [];
  }

  private buildDecisionFlow(request: ProtectionRequest): any[] {
    // Build decision flow for TOCTOU analysis
    return [];
  }

  private calculateRiskTier(detectorResults: DetectorResult[], advancedThreats: AdvancedThreatAssessment): RiskTier {
    const maxRisk = Math.max(
      ...detectorResults.map(r => r.riskScore),
      advancedThreats.overallRiskScore0to100 / 100
    );

    if (maxRisk >= 0.8) return 'high';
    if (maxRisk >= 0.6) return 'med';
    return 'low';
  }

  private applyMaturityEnforcement(
    guardResult: GuardCheckResult,
    detectorResults: DetectorResult[],
    advancedThreats: AdvancedThreatAssessment
  ): GuardCheckResult {
    // Apply stricter enforcement based on maturity level
    if (this.config.maturityLevel >= 4) {
      // L4+ requires zero tolerance for advanced threats
      if (advancedThreats.threatDetected) {
        guardResult.pass = false;
        guardResult.requiredEscalations.push('Advanced threat detected - L4+ enforcement');
      }
    }

    if (this.config.maturityLevel >= 3) {
      // L3+ requires compound attack protection
      if (advancedThreats.compound.detected) {
        guardResult.pass = false;
        guardResult.requiredRemediations.push('Compound attack blocked - L3+ protection');
      }
    }

    return guardResult;
  }

  private calculateThreatLevel(riskScore: number): 'none' | 'low' | 'medium' | 'high' | 'critical' {
    if (riskScore >= 0.9) return 'critical';
    if (riskScore >= 0.7) return 'high';
    if (riskScore >= 0.5) return 'medium';
    if (riskScore >= 0.2) return 'low';
    return 'none';
  }

  private calculateConfidence(
    detectorResults: DetectorResult[],
    advancedThreats: AdvancedThreatAssessment,
    guardDecision: GuardCheckResult
  ): number {
    const detectorConfidence = detectorResults.length > 0 
      ? Math.max(...detectorResults.map(r => r.confidence))
      : 0.5;
    
    const threatConfidence = advancedThreats.overallRiskScore0to100 / 100;
    const guardConfidence = guardDecision.pass ? 0.8 : 0.9; // Higher confidence when blocking

    return (detectorConfidence + threatConfidence + guardConfidence) / 3;
  }

  private extractPattern(pattern: string, input: string): string | null {
    // Extract generalizable pattern from specific input
    // This is simplified - production would use ML
    return pattern.length > 10 ? pattern.substring(0, 50) : null;
  }

  private generateEvidenceId(): string {
    return `shield_guard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private createFailSafeResult(evidenceId: string, responseTime: number): ProtectionResult {
    return {
      allowed: true, // Fail open for availability
      confidence: 0.1,
      threatLevel: 'none',
      detectedAttacks: [],
      advancedThreats: {} as any,
      guardDecision: { pass: true, requiredRemediations: [], requiredEscalations: [], requiredVerificationSteps: [], requiredEvidenceToProceed: [] },
      responseTime,
      evidenceId,
      recommendations: ['System error occurred - review logs']
    };
  }

  private updateMetrics(result: ProtectionResult): void {
    this.performanceMetrics.totalRequests++;
    if (!result.allowed) this.performanceMetrics.blockedRequests++;
    
    // Update rolling average latency
    this.performanceMetrics.averageLatency = 
      (this.performanceMetrics.averageLatency * (this.performanceMetrics.totalRequests - 1) + result.responseTime) 
      / this.performanceMetrics.totalRequests;
  }

  private initializeThreatIntelligence(): void {
    // Initialize with basic threat intelligence
    // In production, this would connect to external threat feeds
  }

  /**
   * Public API methods
   */
  async updateThreatIntelligence(update: ThreatIntelligenceUpdate): Promise<void> {
    this.threatIntelligence.set(update.source, update);
    
    // Update dynamic attack generator
    await dynamicAttackGenerator.updateThreatIntelligence(update.source, []);
    
    emitGuardEvent({
      agentId: 'system', moduleCode: 'threat_intelligence_updated',
      decision: 'allow', reason: 'Threat intelligence updated', severity: 'low',
      meta: { source: update.source, newVectors: update.newVectors.length, emergingThreats: update.emergingThreats.length }
    });
  }

  getPerformanceMetrics() {
    return { ...this.performanceMetrics };
  }

  async generateTestAttacks(context: AttackContext, count: number = 50): Promise<GeneratedAttack[]> {
    return dynamicAttackGenerator.generateAdaptiveAttacks(context, count);
  }

  updateConfig(newConfig: Partial<ShieldGuardConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

// Export singleton instance
export const shieldGuardOrchestrator = new ShieldGuardOrchestrator({
  enableRealTimeProtection: true,
  enableAdaptiveLearning: true,
  enableThreatIntelligence: true,
  sophisticationThreshold: 0.7,
  responseLatencyMs: 100,
  evidenceRetention: 'comprehensive',
  maturityLevel: 3
});