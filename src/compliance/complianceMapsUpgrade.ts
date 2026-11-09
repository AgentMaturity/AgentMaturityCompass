import { builtInComplianceMappings } from "./builtInMappings.js";
import type { ComplianceMapsFile } from "./mappingSchema.js";

/**
 * The upgrade path for a workspace whose signed `.amc/compliance-maps.yaml` predates a built-in framework
 * (SH-TRUST-04): keep every mapping the operator has, and append the built-in mappings of each framework the file does
 * not mention at all. A framework the file already has, in any form, is left exactly as the operator signed it; nothing
 * is removed or rewritten. The caller re-signs the result (`amc compliance init --merge`).
 */
export function mergeMissingBuiltInFrameworks(existing: ComplianceMapsFile): ComplianceMapsFile {
  const present = new Set(existing.complianceMaps.mappings.map((row) => row.framework));
  const added = builtInComplianceMappings.filter((row) => !present.has(row.framework));
  return { complianceMaps: { version: 1, mappings: [...existing.complianceMaps.mappings, ...added] } };
}
