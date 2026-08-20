import { emitGuardEvent } from '../enforce/evidenceEmitter.js';
export interface SkillManifest {
  name?: string;
  version?: string;
  permissions?: string[];
  author?: string;
  description?: string;
  [key: string]: unknown;
}

export interface PermissionCheck {
  permission: string;
  dangerous: boolean;
  wildcarded: boolean;
}

export interface ManifestValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  permissions: PermissionCheck[];
}

const DANGEROUS_PATTERNS = [
  /^filesystem\.write$/,
  /^network\..*/,
  /^exec\..*/,
  /^system\.admin$/,
];

const REQUIRED_FIELDS: (keyof SkillManifest)[] = ['name', 'version', 'permissions', 'author', 'description'];

export function validateManifest(manifest: SkillManifest): ManifestValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const permissions: PermissionCheck[] = [];

  for (const field of REQUIRED_FIELDS) {
    if (manifest[field] === undefined || manifest[field] === null || manifest[field] === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (manifest.permissions && Array.isArray(manifest.permissions)) {
    for (const perm of manifest.permissions) {
      const wildcarded = perm.includes('*');
      const dangerous = DANGEROUS_PATTERNS.some(p => p.test(perm));
      permissions.push({ permission: perm, dangerous, wildcarded });
      if (wildcarded) warnings.push(`Wildcard permission: ${perm}`);
      if (dangerous) warnings.push(`Dangerous permission: ${perm}`);
    }
  }

    const __s6Allowed = errors.length === 0;
  emitGuardEvent({ agentId: 'system', moduleCode: 'S6', severity: 'medium', decision: __s6Allowed ? 'allow' : 'deny', reason: `S6 ${__s6Allowed ? 'allowed' : 'denied'}` });
  return { valid: errors.length === 0,
    errors,
    warnings,
    permissions,
  };
}