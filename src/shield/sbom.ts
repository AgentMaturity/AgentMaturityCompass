import { emitGuardEvent } from '../enforce/evidenceEmitter.js';
/**
 * Software Bill of Materials (SBOM) generator — CycloneDX-compatible format.
 */

export interface SbomComponent {
  name: string;
  version: string;
  source: string;
  cveAlerts: string[];
}

export interface SbomResult {
  components: SbomComponent[];
  format: 'CycloneDX-compatible';
  highRiskCount: number;
}

const KNOWN_VULN_PACKAGES: Record<string, string[]> = {
  'lodash': ['CVE-2020-28500', 'CVE-2021-23337'],
  'minimist': ['CVE-2021-44906'],
  'node-fetch': ['CVE-2022-0235'],
  'glob-parent': ['CVE-2020-28469'],
  'tar': ['CVE-2021-37701'],
};

export function generateSbom(dependencies: Record<string, string>): SbomResult {
  const components: SbomComponent[] = [];
  let highRiskCount = 0;

  for (const [name, version] of Object.entries(dependencies)) {
    const cveAlerts = KNOWN_VULN_PACKAGES[name] ?? [];
    if (cveAlerts.length > 0) highRiskCount++;
    components.push({ name, version, source: 'npm', cveAlerts });
  }

  emitGuardEvent({ agentId: 'system', moduleCode: 'S4', decision: 'allow', reason: 'S4 observation (no allow/deny decision was made here)', severity: 'medium' });
  return { components, format: 'CycloneDX-compatible', highRiskCount };
}