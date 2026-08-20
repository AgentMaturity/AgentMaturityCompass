import { emitGuardEvent } from './evidenceEmitter.js';
export interface TemplatePolicy {
  maxVars?: number;
  maxOutputLength?: number;
  allowHtml?: boolean;
}

export interface TemplateResult {
  rendered: string;
  variablesUsed: string[];
  warnings: string[];
  blocked: boolean;
}

const DANGEROUS_VARS = ['constructor', '__proto__', 'prototype', '__defineGetter__', '__defineSetter__'];
const VAR_PATTERN = /\{\{([^}]+)\}\}/g;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function renderTemplate(template: string, vars: Record<string, string>, policy?: TemplatePolicy): TemplateResult {
  const warnings: string[] = [];
  const variablesUsed: string[] = [];
  const p = policy || {};

  // Check for dangerous variable references
  const matches = template.matchAll(VAR_PATTERN);
  for (const m of matches) {
    const varName = m[1]!.trim();
    if (DANGEROUS_VARS.includes(varName)) {
      emitGuardEvent({ agentId: 'system', moduleCode: 'E32', decision: 'allow', reason: 'E32 observation (no allow/deny decision was made here)', severity: 'low' });
      return { rendered: '', variablesUsed: [], warnings: [`Blocked: dangerous variable reference {{${varName}}}`], blocked: true };
    }
  }

  // Check for nested templates in values
  for (const [k, v] of Object.entries(vars)) {
    if (/\{\{.*\}\}/.test(v)) {
      warnings.push(`Variable "${k}" contains template syntax (nested templates disallowed)`);
      vars[k] = v.replace(/\{\{/g, '{ {').replace(/\}\}/g, '} }');
    }
  }

  if (p.maxVars && Object.keys(vars).length > p.maxVars) {
    warnings.push(`Variable count ${Object.keys(vars).length} exceeds max ${p.maxVars}`);
  }

  let rendered = template;
  rendered = rendered.replace(VAR_PATTERN, (_match: string, varName: string): string => {
    const trimmed = varName.trim();
    if (trimmed in vars) {
      variablesUsed.push(trimmed);
      const val = vars[trimmed]!;
      return p.allowHtml ? val : escapeHtml(val);
    }
    warnings.push(`Unresolved variable: {{${trimmed}}}`);
    return `{{${trimmed}}}`;
  });

  if (p.maxOutputLength && rendered.length > p.maxOutputLength) {
    rendered = rendered.slice(0, p.maxOutputLength);
    warnings.push('Output truncated to max length');
  }

  emitGuardEvent({ agentId: 'system', moduleCode: 'E32', decision: 'allow', reason: 'E32 observation (no allow/deny decision was made here)', severity: 'low' });
  return { rendered, variablesUsed, warnings, blocked: false };
}