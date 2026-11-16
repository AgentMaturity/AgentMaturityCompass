/**
 * safetyDSL.ts — AgentSpec-style declarative safety constraint language. Not enforced: nothing in AMC's decision paths
 * evaluates these rules; a rule written here changes no decision.
 *
 * Inspired by ICSE 2026 AgentSpec paper and NeMo Guardrails Colang DSL.
 * Provides a declarative language for defining runtime safety constraints
 * that agents must satisfy.
 *
 * Syntax example:
 *   WHEN agent.action == "send_email" AND context.pii_detected == true
 *   THEN DENY WITH "Cannot send email containing PII"
 *
 *   WHEN agent.tool == "database_write" AND agent.risk_tier >= "high"
 *   THEN REQUIRE_APPROVAL WITH "High-risk DB write needs approval"
 *
 *   WHEN output.sentiment == "angry" AND output.confidence < 0.5
 *   THEN ESCALATE WITH "Low confidence angry response needs review"
 *
 * Constraint types:
 *   - DENY: Block the action entirely
 *   - ALLOW: Explicitly permit
 *   - REQUIRE_APPROVAL: Human-in-the-loop
 *   - ESCALATE: Route to specialist
 *   - LOG: Record for audit
 *   - SANITIZE: Clean the output before passing through
 *   - RATE_LIMIT: Enforce rate constraints
 */

import { randomUUID } from 'node:crypto';

/* ── Types ──────────────────────────────────────────────────────── */

export type ConstraintAction = 'DENY' | 'ALLOW' | 'REQUIRE_APPROVAL' | 'ESCALATE' | 'LOG' | 'SANITIZE' | 'RATE_LIMIT';

export type ComparisonOp = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'matches' | 'in';

export interface Condition {
  field: string;        // e.g. "agent.action", "output.pii_detected", "context.risk_tier"
  operator: ComparisonOp;
  value: string | number | boolean | string[];
}

export interface SafetyConstraint {
  id: string;
  name: string;
  description?: string;
  /** Conditions joined by AND */
  conditions: Condition[];
  action: ConstraintAction;
  message: string;
  /** Priority (lower = higher priority) */
  priority: number;
  /** Whether this constraint is active */
  enabled: boolean;
  /** Rate limit config (only for RATE_LIMIT action) */
  rateLimit?: { maxPerMinute: number; maxPerHour: number };
  /** Tags for grouping */
  tags: string[];
}

export interface ConstraintContext {
  agent: {
    id: string;
    type: string;
    action?: string;
    tool?: string;
    risk_tier?: string;
  };
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface ConstraintEvalResult {
  constraintId: string;
  constraintName: string;
  matched: boolean;
  action: ConstraintAction;
  message: string;
  matchedConditions: string[];
  priority: number;
}

export interface SafetyEvalResult {
  /** Overall decision (most restrictive matched constraint) */
  decision: ConstraintAction;
  /** Whether the action is allowed */
  allowed: boolean;
  /** All constraints that matched */
  matchedConstraints: ConstraintEvalResult[];
  /** The constraint that determined the final decision */
  decidingConstraint?: ConstraintEvalResult;
  /** Evaluation timestamp */
  timestamp: number;
  /** Total constraints evaluated */
  totalEvaluated: number;
}

/* ── DSL Parser ──────────────────────────────────────────────────── */

export interface ParsedRule {
  conditions: Condition[];
  action: ConstraintAction;
  message: string;
}

/**
 * Parse a single DSL rule string.
 * Format: WHEN <conditions> THEN <action> WITH "<message>"
 */
export function parseDSLRule(rule: string): ParsedRule | { error: string } {
  const whenMatch = rule.match(/^WHEN\s+(.+?)\s+THEN\s+(\w+)\s+WITH\s+"([^"]+)"$/i);
  if (!whenMatch) {
    return { error: 'Invalid rule syntax. Expected: WHEN <conditions> THEN <action> WITH "<message>"' };
  }

  const conditionStr = whenMatch[1]!;
  const actionStr = whenMatch[2]!.toUpperCase();
  const message = whenMatch[3]!;

  // Validate action
  const validActions: ConstraintAction[] = ['DENY', 'ALLOW', 'REQUIRE_APPROVAL', 'ESCALATE', 'LOG', 'SANITIZE', 'RATE_LIMIT'];
  if (!validActions.includes(actionStr as ConstraintAction)) {
    return { error: `Invalid action: ${actionStr}. Valid: ${validActions.join(', ')}` };
  }

  // Parse conditions (split by AND)
  const condParts = conditionStr.split(/\s+AND\s+/i);
  const conditions: Condition[] = [];

  for (const part of condParts) {
    const trimmed = part.trim();
    // Match: field operator value
    const condMatch = trimmed.match(/^([\w.]+)\s*(==|!=|>=|<=|>|<|contains|matches|in)\s*(.+)$/);
    if (!condMatch) {
      return { error: `Invalid condition: ${trimmed}` };
    }

    const field = condMatch[1]!;
    const operator = condMatch[2] as ComparisonOp;
    let value: string | number | boolean | string[] = condMatch[3]!.trim();

    // Parse value type
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (/^\d+(\.\d+)?$/.test(value as string)) value = parseFloat(value as string);
    else if ((value as string).startsWith('"') && (value as string).endsWith('"')) value = (value as string).slice(1, -1);
    else if ((value as string).startsWith('[') && (value as string).endsWith(']')) {
      try { value = JSON.parse(value as string); } catch { /* keep as string */ }
    }

    conditions.push({ field, operator, value });
  }

  return { conditions, action: actionStr as ConstraintAction, message };
}

/**
 * Parse multiple DSL rules (one per line, blank lines and # comments ignored)
 */
export function parseDSLRules(dsl: string): { rules: ParsedRule[]; errors: Array<{ line: number; error: string }> } {
  const lines = dsl.split('\n');
  const rules: ParsedRule[] = [];
  const errors: Array<{ line: number; error: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line || line.startsWith('#')) continue;

    const result = parseDSLRule(line);
    if ('error' in result) {
      errors.push({ line: i + 1, error: result.error });
    } else {
      rules.push(result);
    }
  }

  return { rules, errors };
}

/* ── Condition evaluation ────────────────────────────────────────── */

function resolveField(context: ConstraintContext, field: string): unknown {
  const parts = field.split('.');
  let current: unknown = context;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateCondition(condition: Condition, context: ConstraintContext): boolean {
  const actual = resolveField(context, condition.field);
  const expected = condition.value;

  if (actual === undefined || actual === null) return false;

  switch (condition.operator) {
    case '==': return String(actual) === String(expected);
    case '!=': return String(actual) !== String(expected);
    case '>': return Number(actual) > Number(expected);
    case '<': return Number(actual) < Number(expected);
    case '>=': return Number(actual) >= Number(expected);
    case '<=': return Number(actual) <= Number(expected);
    case 'contains':
      if (typeof actual === 'string') return actual.includes(String(expected));
      if (Array.isArray(actual)) return actual.includes(expected);
      return false;
    case 'matches':
      try { return new RegExp(String(expected), 'i').test(String(actual)); }
      catch { return false; }
    case 'in':
      if (Array.isArray(expected)) return expected.includes(String(actual));
      return false;
    default: return false;
  }
}

/* ── Safety Engine ───────────────────────────────────────────────── */

const ACTION_PRIORITY: Record<ConstraintAction, number> = {
  DENY: 0,
  REQUIRE_APPROVAL: 1,
  ESCALATE: 2,
  SANITIZE: 3,
  RATE_LIMIT: 4,
  LOG: 5,
  ALLOW: 6,
};

export class SafetyEngine {
  private constraints = new Map<string, SafetyConstraint>();
  private evalHistory: SafetyEvalResult[] = [];
  private rateLimitCounters = new Map<string, { minute: number[]; hour: number[] }>();

  /** Add a constraint */
  addConstraint(constraint: SafetyConstraint): void {
    this.constraints.set(constraint.id, constraint);
  }

  /** Add constraint from DSL rule string */
  addFromDSL(rule: string, options?: { id?: string; name?: string; priority?: number; tags?: string[] }): SafetyConstraint | { error: string } {
    const parsed = parseDSLRule(rule);
    if ('error' in parsed) return parsed;

    const constraint: SafetyConstraint = {
      id: options?.id ?? randomUUID(),
      name: options?.name ?? `Rule-${this.constraints.size + 1}`,
      conditions: parsed.conditions,
      action: parsed.action,
      message: parsed.message,
      priority: options?.priority ?? 100,
      enabled: true,
      tags: options?.tags ?? [],
    };

    this.constraints.set(constraint.id, constraint);
    return constraint;
  }

  /** Load multiple rules from DSL text */
  loadDSL(dsl: string): { loaded: number; errors: Array<{ line: number; error: string }> } {
    const { rules, errors } = parseDSLRules(dsl);
    let loaded = 0;
    for (const rule of rules) {
      const constraint: SafetyConstraint = {
        id: randomUUID(),
        name: `DSL-Rule-${this.constraints.size + 1}`,
        conditions: rule.conditions,
        action: rule.action,
        message: rule.message,
        priority: 100,
        enabled: true,
        tags: ['dsl-loaded'],
      };
      this.constraints.set(constraint.id, constraint);
      loaded++;
    }
    return { loaded, errors };
  }

  /** Remove a constraint */
  removeConstraint(id: string): boolean {
    return this.constraints.delete(id);
  }

  /** Get all constraints */
  getConstraints(): SafetyConstraint[] {
    return [...this.constraints.values()].sort((a, b) => a.priority - b.priority);
  }

  /** Evaluate all constraints against a context (accepts both ConstraintContext and flat key-value maps) */
  evaluate(context: ConstraintContext | Record<string, string | number | boolean>): SafetyEvalResult & { triggered: ConstraintEvalResult[] } {
    // Convert flat maps to ConstraintContext if needed
    const ctx = this.normalizeContext(context);
    const matched: ConstraintEvalResult[] = [];
    const constraints = this.getConstraints().filter(c => c.enabled);

    for (const constraint of constraints) {
      const matchedConditions: string[] = [];
      let allMatch = true;

      for (const condition of constraint.conditions) {
        if (evaluateCondition(condition, ctx)) {
          matchedConditions.push(`${condition.field} ${condition.operator} ${condition.value}`);
        } else {
          allMatch = false;
          break;
        }
      }

      if (allMatch && constraint.conditions.length > 0) {
        // Rate limit check
        if (constraint.action === 'RATE_LIMIT' && constraint.rateLimit) {
          const exceeded = this.checkRateLimit(constraint.id, constraint.rateLimit);
          if (!exceeded) continue; // Not rate-limited, skip
        }

        matched.push({
          constraintId: constraint.id,
          constraintName: constraint.name,
          matched: true,
          action: constraint.action,
          message: constraint.message,
          matchedConditions,
          priority: constraint.priority,
        });
      }
    }

    // Determine final decision (most restrictive = lowest ACTION_PRIORITY value)
    let decision: ConstraintAction = 'ALLOW';
    let decidingConstraint: ConstraintEvalResult | undefined;

    for (const m of matched) {
      if (ACTION_PRIORITY[m.action] < ACTION_PRIORITY[decision]) {
        decision = m.action;
        decidingConstraint = m;
      }
    }

    const result = {
      decision,
      allowed: decision === 'ALLOW' || decision === 'LOG',
      matchedConstraints: matched,
      triggered: matched, // Alias for matchedConstraints
      decidingConstraint,
      timestamp: Date.now(),
      totalEvaluated: constraints.length,
    };

    this.evalHistory.push(result);
    return result;
  }

  /** Convert flat key-value map to ConstraintContext */
  private normalizeContext(context: ConstraintContext | Record<string, string | number | boolean>): ConstraintContext {
    // If it already has an 'agent' object, treat as ConstraintContext
    if ('agent' in context && typeof (context as Record<string, unknown>).agent === 'object') {
      return context as ConstraintContext;
    }
    // Otherwise it's a flat map like { 'agent.action': 'send_email' }
    // Build a nested ConstraintContext from dot-separated keys
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(context)) {
      const parts = key.split('.');
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!(parts[i]! in current)) current[parts[i]!] = {};
        current = current[parts[i]!];
      }
      current[parts[parts.length - 1]!] = value;
    }
    if (!result.agent) result.agent = { id: 'unknown', type: 'unknown' };
    if (!result.agent.id) result.agent.id = 'unknown';
    if (!result.agent.type) result.agent.type = 'unknown';
    return result as ConstraintContext;
  }

  private checkRateLimit(constraintId: string, limit: { maxPerMinute: number; maxPerHour: number }): boolean {
    const now = Date.now();
    let counters = this.rateLimitCounters.get(constraintId);
    if (!counters) {
      counters = { minute: [], hour: [] };
      this.rateLimitCounters.set(constraintId, counters);
    }

    // Clean old entries
    counters.minute = counters.minute.filter(t => now - t < 60_000);
    counters.hour = counters.hour.filter(t => now - t < 3600_000);

    const exceeded = counters.minute.length >= limit.maxPerMinute || counters.hour.length >= limit.maxPerHour;
    counters.minute.push(now);
    counters.hour.push(now);
    return exceeded;
  }

  /** Get evaluation history */
  getHistory(): SafetyEvalResult[] { return [...this.evalHistory]; }

  /** Clear history */
  clearHistory(): void { this.evalHistory = []; }

  /** Get stats */
  getStats(): { totalConstraints: number; totalEvaluations: number; denyRate: number; approvalRate: number } {
    const total = this.evalHistory.length;
    const denies = this.evalHistory.filter(e => e.decision === 'DENY').length;
    const approvals = this.evalHistory.filter(e => e.decision === 'REQUIRE_APPROVAL').length;
    return {
      totalConstraints: this.constraints.size,
      totalEvaluations: total,
      denyRate: total > 0 ? denies / total : 0,
      approvalRate: total > 0 ? approvals / total : 0,
    };
  }

  get constraintCount(): number { return this.constraints.size; }
}
