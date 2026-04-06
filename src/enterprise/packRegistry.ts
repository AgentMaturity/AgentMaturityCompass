import { listIndustryPackIds, type IndustryPackId } from "../domains/industryPacks.js";
import type { LicenseTier } from "./tiers.js";

export interface IndustryPackRegistryEntry {
  readonly packId: IndustryPackId;
  readonly availability: LicenseTier;
}

const packAvailabilityOverrides: Partial<Record<IndustryPackId, LicenseTier>> = {};

export function getIndustryPackAvailability(packId: IndustryPackId): LicenseTier {
  return packAvailabilityOverrides[packId] ?? "ENTERPRISE";
}

export function listIndustryPackRegistry(): readonly IndustryPackRegistryEntry[] {
  return listIndustryPackIds().map((packId) => ({
    packId,
    availability: getIndustryPackAvailability(packId)
  }));
}

export function listIndustryPacksByAvailability(
  tier: LicenseTier
): readonly IndustryPackRegistryEntry[] {
  return listIndustryPackRegistry().filter((entry) => entry.availability === tier);
}
