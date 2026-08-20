/**
 * fixGenerator.ts — Reasons from gaps to module-based fixes with
 * expanded MODULE_MAP covering all AMC domains and FixPlan with coverage stats.
 */

export interface Gap {
  qid: string;
  description: string;
  dimension: string;
}

export interface Fix {
  qid: string;
  moduleName: string;
  code: string;
  description: string;
  /**
   * Match quality of the gap-to-module lookup, NOT a predicted success rate.
   *
   * 0.75 = exact module mapping, 0.65 = partial key match, 0.5 = generic
   * fallback. Nothing here estimates whether the generated fix will work; the
   * value describes how confidently the gap was routed to a module.
   */
  matchConfidence: number;
  effort: 'low' | 'medium' | 'high';
}

export interface FixPlan {
  gaps: Gap[];
  fixes: Fix[];
  coverage: number;
  unfixed: Gap[];
  effortSummary: { low: number; medium: number; high: number };
}

/* ── Expanded MODULE_MAP ─────────────────────────────────────────── */

const MODULE_MAP: Record<string, { module: string; template: string; effort: 'low' | 'medium' | 'high' }> = {
  // Shield
  'shield': { module: 'shield/analyzer', template: 'import { analyzeSkill } from "./shield/analyzer.js";\nconst result = analyzeSkill(code);', effort: 'medium' },
  'injection': { module: 'shield/injectionDetector', template: 'import { detectInjection } from "./shield/injectionDetector.js";\nconst result = detectInjection(input);', effort: 'low' },
  'sanitization': { module: 'shield/sanitizer', template: 'import { sanitize } from "./shield/sanitizer.js";\nconst clean = sanitize(input);', effort: 'low' },
  'skill': { module: 'shield/analyzer', template: 'import { analyzeSkill } from "./shield/analyzer.js";\nconst result = analyzeSkill(code);', effort: 'medium' },

  // Enforce
  'enforce': { module: 'enforce/policyFirewall', template: 'import { PolicyFirewall } from "./enforce/policyFirewall.js";\nconst fw = new PolicyFirewall();\nfw.addRule({ id: "r1", pattern: ".*", action: "allow" });', effort: 'medium' },
  'policy': { module: 'enforce/policyFirewall', template: 'import { PolicyFirewall } from "./enforce/policyFirewall.js";\nconst fw = new PolicyFirewall();', effort: 'medium' },
  'governance': { module: 'enforce/governor', template: 'import { Governor } from "./enforce/governor.js";\nconst gov = new Governor();', effort: 'high' },
  'budget': { module: 'budgets/budgets', template: 'import { evaluateBudgetStatus } from "./budgets/budgets.js";\nconst status = evaluateBudgetStatus(agentId);', effort: 'medium' },

  // Vault
  'vault': { module: 'vault/dlp', template: 'import { scanForPII } from "./vault/dlp.js";\nconst result = scanForPII(text);', effort: 'low' },
  'privacy': { module: 'vault/dlp', template: 'import { scanForPII } from "./vault/dlp.js";\nconst result = scanForPII(text);', effort: 'low' },
  'data-classification': { module: 'vault/dataClassification', template: 'import { classifyData } from "./vault/dataClassification.js";\nconst cls = classifyData(content);', effort: 'medium' },
  'pii': { module: 'vault/dlp', template: 'import { scanForPII } from "./vault/dlp.js";\nconst result = scanForPII(text);', effort: 'low' },

  // Watch
  'watch': { module: 'watch/outputAttestation', template: 'import { attestOutput } from "./watch/outputAttestation.js";\nconst att = attestOutput(output);', effort: 'medium' },
  'attestation': { module: 'watch/outputAttestation', template: 'import { attestOutput } from "./watch/outputAttestation.js";\nconst att = attestOutput(output);', effort: 'medium' },
  'audit': { module: 'audit/auditApi', template: 'import { auditReadinessGate } from "./audit/auditApi.js";\nconst ready = auditReadinessGate(workspace);', effort: 'high' },
  'ledger': { module: 'ledger/ledger', template: 'import { openLedger } from "./ledger/ledger.js";\nconst ledger = openLedger(agentId);', effort: 'medium' },

  // Score
  'score': { module: 'score/formalSpec', template: 'import { computeMaturityScore } from "./score/formalSpec.js";\nconst score = computeMaturityScore(evidence);', effort: 'medium' },
  'diagnostic': { module: 'diagnostic/runner', template: 'import { runDiagnostic } from "./diagnostic/runner.js";\nconst result = await runDiagnostic(agentId);', effort: 'medium' },
  'maturity': { module: 'score/formalSpec', template: 'import { computeMaturityScore } from "./score/formalSpec.js";\nconst score = computeMaturityScore(evidence);', effort: 'medium' },

  // Product
  'reliability': { module: 'ops/circuitBreaker', template: 'import { withCircuitBreaker } from "./ops/circuitBreaker.js";\nconst result = await withCircuitBreaker("svc", fn);', effort: 'medium' },
  'monitoring': { module: 'ledger/monitor', template: 'import { startMonitor } from "./ledger/monitor.js";\nstartMonitor(agentId);', effort: 'low' },
  'transparency': { module: 'transparency/merkleIndexStore', template: 'import { rebuildTransparencyMerkle } from "./transparency/merkleIndexStore.js";', effort: 'high' },
  'compliance': { module: 'compliance/complianceEngine', template: 'import { generateComplianceReport } from "./compliance/complianceEngine.js";', effort: 'high' },
  'learning': { module: 'learning/correctionMemory', template: 'import { extractLessonsFromCorrections } from "./learning/correctionMemory.js";', effort: 'medium' },
  'memory': { module: 'learning/correctionMemory', template: 'import { initLessonTables, insertLesson } from "./learning/correctionMemory.js";', effort: 'medium' },
};

/* ── Generate single fix ─────────────────────────────────────────── */

export function generateFix(gap: Gap, availableModules: string[]): Fix | null {
  const dim = gap.dimension.toLowerCase();

  // Direct match
  const mapping = MODULE_MAP[dim];
  if (mapping && availableModules.includes(mapping.module)) {
    return {
      qid: gap.qid,
      moduleName: mapping.module,
      code: mapping.template,
      description: `Fix for ${gap.description}: integrate ${mapping.module}`,
      matchConfidence: 0.75, // exact module mapping
      effort: mapping.effort,
    };
  }

  // Partial match in MODULE_MAP keys
  for (const [key, m] of Object.entries(MODULE_MAP)) {
    if (dim.includes(key) || key.includes(dim)) {
      if (availableModules.includes(m.module)) {
        return {
          qid: gap.qid,
          moduleName: m.module,
          code: m.template,
          description: `Fix for ${gap.description}: integrate ${m.module}`,
          matchConfidence: 0.65, // partial key match
          effort: m.effort,
        };
      }
    }
  }

  // Fuzzy match against available modules
  const match = availableModules.find(m => m.toLowerCase().includes(dim));
  if (match) {
    return {
      qid: gap.qid,
      moduleName: match,
      code: `// TODO: integrate ${match} to address ${gap.description}`,
      description: `Suggested fix: integrate ${match}`,
      matchConfidence: 0.5, // generic fallback
      effort: 'medium',
    };
  }

  return null;
}

/* ── Generate fix plan ───────────────────────────────────────────── */

export function generateFixPlan(gaps: Gap[], availableModules: string[]): FixPlan {
  const fixes: Fix[] = [];
  const unfixed: Gap[] = [];

  for (const gap of gaps) {
    const fix = generateFix(gap, availableModules);
    if (fix) fixes.push(fix); else unfixed.push(gap);
  }

  const coverage = gaps.length > 0 ? fixes.length / gaps.length : 1;
  const effortSummary = { low: 0, medium: 0, high: 0 };
  for (const f of fixes) effortSummary[f.effort]++;

  return { gaps, fixes, coverage, unfixed, effortSummary };
}
