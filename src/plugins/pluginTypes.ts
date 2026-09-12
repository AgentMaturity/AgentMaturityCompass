import { z } from "zod";

export const pluginRiskCategorySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type PluginRiskCategory = z.infer<typeof pluginRiskCategorySchema>;

export const pluginArtifactKindSchema = z.enum([
  "policy_pack",
  "assurance_pack",
  "compliance_map",
  "adapter",
  "outcome_template",
  "casebook_template",
  "transform_overlay",
  "transform_intervention_library",
  "learn_md",
  "extension_module"
]);
export type PluginArtifactKind = z.infer<typeof pluginArtifactKindSchema>;

export const pluginRegistryTypeSchema = z.enum(["file", "http"]);
export type PluginRegistryType = z.infer<typeof pluginRegistryTypeSchema>;

export const pluginInstallActionSchema = z.enum(["install", "upgrade", "remove"]);
export type PluginInstallAction = z.infer<typeof pluginInstallActionSchema>;

export interface PluginCatalogEntry {
  id: string;
  version: string;
  sha256: string;
  publisherFingerprint: string;
  riskCategory: PluginRiskCategory;
  sourceRegistryId: string;
}
