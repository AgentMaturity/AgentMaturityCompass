import { emitGuardEvent } from '../enforce/evidenceEmitter.js';
export interface OAuthScopeResult {
  valid: boolean;
  granted: string[];
  denied: string[];
  excessive: string[];
  suggestions: string[];
}

const HIERARCHY: Record<string, number> = { read: 0, write: 1, admin: 2 };

function scopeMatches(allowed: string, requested: string): boolean {
  if (allowed === requested) return true;
  // Wildcard: "user:*" matches "user:read"
  if (allowed.endsWith(':*')) {
    const prefix = allowed.slice(0, -1);
    if (requested.startsWith(prefix)) return true;
  }
  // Hierarchy: "user:write" grants "user:read"
  const [aNs, aLevel] = allowed.split(':');
  const [rNs, rLevel] = requested.split(':');
  if (aNs && rNs && aNs === rNs && aLevel && rLevel && aLevel in HIERARCHY && rLevel in HIERARCHY) {
    if (HIERARCHY[aLevel]! >= HIERARCHY[rLevel]!) return true;
  }
  return false;
}

export function checkOAuthScopes(requested: string[], allowed: string[]): OAuthScopeResult {
  const granted: string[] = [];
  const denied: string[] = [];

  for (const req of requested) {
    if (allowed.some(a => scopeMatches(a, req))) {
      granted.push(req);
    } else {
      denied.push(req);
    }
  }

  // Excessive: allowed scopes not needed by any request
  const excessive: string[] = [];
  for (const a of allowed) {
    const needed = requested.some(r => scopeMatches(a, r));
    if (!needed) excessive.push(a);
  }

  // Suggestions: for denied scopes, suggest minimal grant
  const suggestions: string[] = [];
  for (const d of denied) {
    const [ns, level] = d.split(':');
    if (ns && level) {
      suggestions.push(`Add "${d}" or "${ns}:*" to allowed scopes`);
    } else {
      suggestions.push(`Add "${d}" to allowed scopes`);
    }
  }

    const __s12Allowed = denied.length === 0;
  emitGuardEvent({ agentId: 'system', moduleCode: 'S12', severity: 'medium', decision: __s12Allowed ? 'allow' : 'deny', reason: `S12 ${__s12Allowed ? 'allowed' : 'denied'}` });
  return { valid: denied.length === 0,
    granted,
    denied,
    excessive,
    suggestions,
  };
}