/**
 * Pure residency checks.
 *
 * NOT the residency policy system. Policies are created, stored and queried by
 * src/compliance/dataResidency.ts, which is what `amc` commands use. The two
 * functions here take a policy you already hold and answer a single question,
 * and are exported for callers composing their own checks.
 */
export interface DataRecord {
  classification: string;
  currentRegion: string;
  targetRegion?: string;
}

export interface ResidencyPolicy {
  allowedRegions: string[];
  restrictedClassifications?: Record<string, string[]>;
}

export interface ResidencyResult {
  compliant: boolean;
  violations: string[];
  currentRegion: string;
  allowedRegions: string[];
}

export function checkResidency(data: DataRecord, policy: ResidencyPolicy): ResidencyResult {
  const violations: string[] = [];

  if (!policy.allowedRegions.includes(data.currentRegion)) {
    violations.push(`Current region '${data.currentRegion}' is not in allowed regions: ${policy.allowedRegions.join(', ')}`);
  }

  if (data.targetRegion && !policy.allowedRegions.includes(data.targetRegion)) {
    violations.push(`Target region '${data.targetRegion}' is not in allowed regions: ${policy.allowedRegions.join(', ')}`);
  }

  if (policy.restrictedClassifications) {
    const classRegions = policy.restrictedClassifications[data.classification];
    if (classRegions) {
      if (!classRegions.includes(data.currentRegion)) {
        violations.push(`Classification '${data.classification}' restricts data to regions: ${classRegions.join(', ')}, but current region is '${data.currentRegion}'`);
      }
      if (data.targetRegion && !classRegions.includes(data.targetRegion)) {
        violations.push(`Classification '${data.classification}' restricts data to regions: ${classRegions.join(', ')}, but target region is '${data.targetRegion}'`);
      }
    }
  }

  return {
    compliant: violations.length === 0,
    violations,
    currentRegion: data.currentRegion,
    allowedRegions: policy.allowedRegions,
  };
}

/** Backward-compatible wrapper */
export function checkDataResidency(region: string, allowedRegions: string[]) {
  return { compliant: allowedRegions.includes(region), region, allowedRegions };
}
