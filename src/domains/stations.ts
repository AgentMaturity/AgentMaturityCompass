/**
 * The seven-station taxonomy (decided 5 Oct 2026): every domain, pack and
 * regulation belongs to at least one of Education, Environment, Health,
 * Wealth, Technology, Mobility and Governance. Jurisdiction and role stay
 * filters, not stations.
 *
 * `Station` is the same set of ids as `Domain`; `parseStation` returns a
 * `Domain` as a `Station`, so the two cannot drift apart without a compile
 * error. Station tags classify; they never change a score, level or status.
 */
import { parseDomain, type Domain } from "./domainRegistry.js";
import type { IndustryPackId } from "./industryPacks.js";

/** Order carries no meaning; compare as sets. */
export const STATIONS = ["education", "environment", "health", "wealth", "technology", "mobility", "governance"] as const satisfies readonly Domain[];
export type Station = (typeof STATIONS)[number];

/** Station names as the agentmaturity.co station pages title them (`AMC — <TITLE> Station`). */
export const STATION_TITLES: Record<Station, string> = {
  education: "Education",
  environment: "Environment",
  health: "Health",
  wealth: "Wealth",
  technology: "Technology",
  mobility: "Mobility",
  governance: "Governance"
};

/** Exact id check; prototype keys such as `__proto__` and `constructor` are never stations. */
export function isStation(value: string): value is Station {
  return Object.hasOwn(STATION_TITLES, value);
}

/** Accepts an id, a title or a domain alias (`finance`, `insurance`, `supply-chain`, ...). */
export function parseStation(value: string): Station {
  let domain: Domain;
  try {
    domain = parseDomain(value);
  } catch {
    throw new Error(`Unknown station: ${value}. Expected one of: ${STATIONS.join(", ")}.`);
  }
  return domain;
}

/** The stations a profile or overlay covers; `stations` includes `primary`. */
export interface StationScope {
  primary: Station;
  stations: readonly Station[];
}

/** A cross-station profile (P2-28 supplies the data and the compiler merge). */
export interface CrossStationProfile extends StationScope {
  id: string;
  name: string;
  exampleAgents: readonly string[];
  adds: string;
}

/** Errors in a scope read from data; an empty list means the scope is valid. */
export function validateStationScope(scope: StationScope, opts: { minStations?: number } = {}): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const station of scope.stations) {
    if (!isStation(station)) errors.push(`unknown station: ${station}`);
    else if (seen.has(station)) errors.push(`duplicate station: ${station}`);
    seen.add(station);
  }
  if (!isStation(scope.primary)) errors.push(`unknown primary station: ${scope.primary}`);
  else if (!seen.has(scope.primary)) errors.push(`primary station ${scope.primary} is not in stations`);
  const minStations = opts.minStations ?? 1;
  if (seen.size < minStations) errors.push(`needs at least ${minStations} station(s), has ${seen.size}`);
  return errors;
}

/** One Layer 1 domain row: where its overlay is filed and which packs and website pages it covers. */
export interface StationDomain {
  id: string;
  /** The strategy's Layer 1 overlay row; null when the domain has none. */
  overlayRow: string | null;
  station: Station;
  /** Further stations the row's overlay also binds (a "Health × Technology" row). */
  alsoStations: readonly Station[];
  wave: 1 | 2 | 3 | 4 | null;
  /** `<h3>` names on website/station-<station>.html; pack `name` fields may differ. */
  websiteNames: readonly string[];
  packIds: readonly IndustryPackId[];
}

function row(
  id: string,
  overlayRow: string | null,
  station: Station,
  alsoStations: readonly Station[],
  wave: StationDomain["wave"],
  websiteNames: readonly string[],
  packIds: readonly IndustryPackId[]
): StationDomain {
  return { id, overlayRow, station, alsoStations, wave, websiteNames, packIds };
}

/** The Layer 1 domain map: 19 rows over all 41 packs and the 40 website domain names. */
export const STATION_DOMAINS: readonly StationDomain[] = [
  row("environment.energy-utilities-water", "Environment · energy, utilities and water", "environment", [], 3,
    ["Ubiquity to Utility", "Sip to Sanitation"], ["ubiquity-to-utility", "sip-to-sanitation"]),
  row("environment.food-textiles-manufacturing", "Environment · food, textiles, manufacturing and biodiversity", "environment", [], 4,
    ["Farm to Fork", "Weave to Wear", "Material to Machines", "Source to Sustenance"],
    ["farm-to-fork", "weave-to-wear", "material-to-machines", "source-to-sustenance"]),
  row("health.care-delivery-records", "Health · care delivery and records", "health", [], 1,
    ["Digital Health Record", "Wellness Management", "Patient Lifecycle", "Clinical Lifecycle", "Professional Practice"],
    ["digital-health-record", "wellness-management", "patient-lifecycle", "clinical-lifecycle", "professional-practice"]),
  row("health.devices-diagnostics", "Health × Technology · medical devices and diagnostics", "health", ["technology"], 2,
    ["Life Technology"], ["life-technology"]),
  row("health.pharma-trials", "Health · pharma, trials and specialized medicine", "health", [], 2,
    ["Drug Discovery", "Clinical Trials", "Specialized Medicine"], ["drug-discovery", "clinical-trials", "specialized-medicine"]),
  row("wealth.banking-finance-ops", "Wealth · banking, lending and finance operations", "wealth", [], 1, [], []),
  row("wealth.payments", "Wealth × Technology · payments and agentic commerce", "wealth", ["technology"], 2,
    ["Digital Payments"], ["digital-payments"]),
  row("wealth.insurance", "Wealth · insurance", "wealth", [], 1, [], []),
  row("wealth.capital-markets", "Wealth · capital markets", "wealth", [], 2, [], []),
  row("wealth.future-of-work", "Wealth · future of work and employment", "wealth", [], 3, ["Future of Work"], ["future-of-work"]),
  row("wealth.inclusion-digital-assets", "Wealth · inclusion, sustainable finance and digital assets", "wealth", [], 4,
    ["No Poverty", "Circular Economy", "Blockchain & DeFi"], ["no-poverty", "circular-economy", "blockchain"]),
  row("education.schools-skills", "Education · schools, universities, skills and accessibility", "education", [], 3,
    ["K-12 Education", "Higher Education", "Skills & Vocational", "Specialized Education", "Differently Abled"],
    ["k12-pm3", "higher-education", "skills-training", "specialized-education", "differently-abled"]),
  row("mobility.ports-logistics-cities", "Mobility · ports, logistics, real estate and smart cities", "mobility", [], 3,
    ["Sustainable Communities", "Sustainable Ports", "Sustainable Real Estate"],
    ["sustainable-communities", "sustainable-ports", "sustainable-real-estate", "freight-3pl-warehouse"]),
  row("mobility.vehicles-aviation", "Mobility × Technology · autonomous and connected vehicles, aviation", "mobility", ["technology"], 4, [], []),
  row("technology.platforms-data", "Technology · AI platforms, IoT, content and cross-border data", "technology", [], 2,
    ["Cognition to Intelligence", "Networked Ecosystems", "OS for Sustainable Outcomes", "Infotainment", "Partnerships for Prosperity"],
    ["cognition-to-intelligence", "networked-ecosystems", "os-sustainable-outcomes", "infotainment", "partnerships-prosperity"]),
  row("governance.public-services", "Governance · public services and procurement", "governance", [], 2,
    ["Citizen Services", "Public & Private Collaboration"], ["citizen-services", "public-private-collaboration"]),
  row("governance.law-rights-democracy", "Governance · law, rights and democracy", "governance", [], 3,
    ["Petition to Law", "Digital Citizens & Rights", "Dance of Democracy"], ["petition-to-law", "digital-citizens-rights", "dance-of-democracy"]),
  row("governance.defense", "Governance × Technology · defense", "governance", ["technology"], 3, [], []),
  // No Layer 1 row matches these two website domains; Sid decides where they belong.
  row("mobility.unplaced", null, "mobility", [], null,
    ["Virtual Infrastructure", "Privacy & Security"], ["virtual-infrastructure", "privacy-security-mobility"])
];

/** The pack's domain row station first, then the row's `alsoStations`. Throws for a pack no row covers. */
export function stationsForPack(id: IndustryPackId): Station[] {
  const domain = STATION_DOMAINS.find((entry) => entry.packIds.includes(id));
  if (!domain) throw new Error(`Industry pack ${id} has no row in STATION_DOMAINS`);
  return [domain.station, ...domain.alsoStations];
}

/** Domain rows filed under the station (its own rows, not rows that only list it in `alsoStations`). */
export function domainsForStation(station: Station): StationDomain[] {
  return STATION_DOMAINS.filter((entry) => entry.station === station);
}
