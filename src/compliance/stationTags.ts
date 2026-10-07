/**
 * Station tags for compliance mappings and catalogue instruments (P1-13).
 *
 * Tags classify and filter; they never change a score, level or status. The
 * framework-to-station rows follow the strategy's register rows, are
 * agent-encoded and stay experimental until an expert reviews them.
 */
import { listDomainMetadata, listIndustryAssurancePackStations } from "../domains/domainRegistry.js";
import { listIndustryPacks } from "../domains/industryPacks.js";
import { resolveRegulatoryInstrument, resolveRegulatoryRefParts } from "../domains/packs/regulatorySchema.js";
import { STATIONS, isStation, stationsForPack, type Station } from "../domains/stations.js";
import type { ComplianceFramework } from "./frameworks.js";
import type { ComplianceMapping } from "./mappingSchema.js";
import { REGULATORY_REGISTER } from "./regulatory/index.js";

const LAYER_0 = "Cross-cutting: the Layer 0 baseline applies to every station.";

/** Stations each built-in framework binds. The Record type makes every new framework name its stations. */
export const FRAMEWORK_STATIONS: Record<ComplianceFramework, readonly Station[]> = {
  SOC2: STATIONS,
  NIST_AI_RMF: STATIONS,
  ISO_27001: STATIONS,
  ISO_42001: STATIONS,
  MITRE_ATLAS: STATIONS,
  OWASP_API_TOP10: STATIONS,
  EU_AI_ACT: STATIONS,
  GDPR: STATIONS,
  HIPAA: ["health", "technology"],
  PCI_DSS: ["wealth", "technology"],
  SOX: ["wealth"],
  FEDRAMP: ["governance", "technology"]
};

/** One line per framework: why it binds those stations. */
export const FRAMEWORK_STATION_BASIS: Record<ComplianceFramework, string> = {
  SOC2: LAYER_0,
  NIST_AI_RMF: LAYER_0,
  ISO_27001: LAYER_0,
  ISO_42001: LAYER_0,
  MITRE_ATLAS: LAYER_0,
  OWASP_API_TOP10: LAYER_0,
  EU_AI_ACT: "The strategy's EU register row says \"All stations\".",
  GDPR: "The strategy's EU register row says \"All stations\".",
  HIPAA: "Covered entities (health) and their business associates, which include technology vendors.",
  PCI_DSS: "Card-payment data held by financial services and by the technology platforms that process it.",
  SOX: "Financial-reporting controls of public companies, filed under wealth.",
  FEDRAMP: "Federal cloud authorization: agencies (governance) and the cloud services they buy (technology)."
};

/**
 * A mapping's own `stations` when present; otherwise its framework's stations
 * plus the stations of the industry assurance packs in `related.packs`.
 */
export function stationsForMapping(mapping: Pick<ComplianceMapping, "framework" | "stations" | "related">): Station[] {
  if (mapping.stations) return [...new Set(mapping.stations)];
  const stations = new Set<Station>(
    Object.hasOwn(FRAMEWORK_STATIONS, mapping.framework) ? FRAMEWORK_STATIONS[mapping.framework as ComplianceFramework] : []
  );
  for (const packId of mapping.related.packs) {
    for (const station of listIndustryAssurancePackStations(packId)) stations.add(station);
  }
  return [...stations];
}

let instrumentStations: Map<string, Set<Station>> | undefined;

function indexInstrumentStations(): Map<string, Set<Station>> {
  const index = new Map<string, Set<Station>>();
  const add = (instrumentId: string | null | undefined, stations: readonly Station[]): void => {
    if (!instrumentId) return;
    const set = index.get(instrumentId) ?? new Set<Station>();
    for (const station of stations) set.add(station);
    index.set(instrumentId, set);
  };
  for (const pack of listIndustryPacks()) {
    const stations = stationsForPack(pack.id);
    for (const ref of pack.regulatoryReferences ?? []) add(ref.instrumentId, stations);
    for (const ref of pack.complianceFrameworkRefs ?? []) add(ref.instrumentId, stations);
    for (const question of pack.questions) {
      for (const part of resolveRegulatoryRefParts(question.regulatoryRef)) add(part.instrument?.id, stations);
    }
  }
  // Domain rubrics are keyed by station and cite instruments in their metadata.
  for (const domain of listDomainMetadata()) {
    for (const text of [...domain.regulatoryBasis, ...domain.complianceFrameworks]) add(resolveRegulatoryInstrument(text)?.id, [domain.id]);
  }
  for (const entry of REGULATORY_REGISTER.entries) {
    for (const instrumentId of entry.catalogueIds ?? []) add(instrumentId, entry.stations.filter(isStation));
  }
  return index;
}

/**
 * Stations of a regulatory-catalogue instrument, derived from the industry
 * packs and domain rubrics that cite it and the register entries that list it
 * in `catalogueIds`.
 * An instrument nothing cites has no station (an empty list), never a guess.
 */
export function stationsForInstrument(instrumentId: string): Station[] {
  instrumentStations ??= indexInstrumentStations();
  return [...(instrumentStations.get(instrumentId) ?? [])];
}
