import { getDomainPackQuestions } from "../../score/domainPacks.js";
import { requiredLevelForQuestion } from "../domainAssessmentEngine.js";
import { getDomainMetadata, type Domain } from "../domainRegistry.js";
import { getIndustryPacksByStation } from "../industryPacks.js";
import type { ConformanceRequirementKind } from "./conformanceSchema.js";

/**
 * Minimum response level for a sector-pack question. `scoreIndustryPack`
 * (industryPacks.ts) records any response below L3 as a compliance gap; the
 * conformance applies the same line, without the percentage around it.
 */
export const INDUSTRY_PACK_MINIMUM_LEVEL = 3;

/**
 * Scenario packs every station must have measured. `injection` is the pack
 * `amc ci red-team` runs when no `--plugins` are given (src/cli.ts); a station
 * profile (F1) or the caller may add more, never fewer.
 */
export const DEFAULT_SCENARIO_PACK_IDS: readonly string[] = ["injection"];

/**
 * The slice of a station operating profile the conformance reads. The CLI
 * adapts a signed operating profile (src/domains/operatingProfiles) to it.
 */
export interface ConformanceStationProfile {
  id: string;
  source: string;
  /** Restricts the sector packs assessed; defaults to every pack of the station. */
  industryPackIds?: string[];
  requiredAssurancePacks?: string[];
  requiredScenarioPacks?: string[];
}

export interface RequirementSpec {
  id: string;
  kind: ConformanceRequirementKind;
  title: string;
  source: string;
  regulatoryRef?: string;
  criterion: string;
  questionId?: string;
  /** Questions only: the lowest response level that meets the requirement. */
  minimumLevel?: number;
  packId?: string;
}

/** The AMC data files requirements are derived from. */
type StationDataFile = "src/domains/industryPacks.ts" | "src/score/domainPacks.ts" | "src/domains/domainRegistry.ts";

/** A requirement's source: the station data file and the entry in it. */
function stationDataSource(file: StationDataFile, entry: string): string {
  return `${file}#${entry}`;
}

function questionCriterion(minimumLevel: number): string {
  return `response level >= L${minimumLevel} from a sealed ledger session within the maximum evidence age; ` +
    "a self-reported answer supports L1 at most (design rule 1)";
}

function uniqueInOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function sectorPackRequirements(station: Domain, profile?: ConformanceStationProfile): RequirementSpec[] {
  const restrict = profile?.industryPackIds ? new Set(profile.industryPackIds) : null;
  const packs = getIndustryPacksByStation(station).filter((pack) => restrict === null || restrict.has(pack.id));
  return packs.flatMap((pack) =>
    pack.questions.map((question) => ({
      id: `industry-pack:${pack.id}:${question.id}`,
      kind: "industry-pack-question" as const,
      title: `${pack.name} — ${question.id} (${question.dimension})`,
      source: stationDataSource("src/domains/industryPacks.ts", pack.id),
      regulatoryRef: question.regulatoryRef,
      criterion: questionCriterion(INDUSTRY_PACK_MINIMUM_LEVEL),
      questionId: question.id,
      minimumLevel: INDUSTRY_PACK_MINIMUM_LEVEL,
      packId: pack.id
    }))
  );
}

function domainQuestionRequirements(station: Domain): RequirementSpec[] {
  return getDomainPackQuestions(station).map((question) => ({
    id: `domain-question:${station}:${question.id}`,
    kind: "domain-question" as const,
    title: `${station} domain pack — ${question.id} (${question.dimension})`,
    source: stationDataSource("src/score/domainPacks.ts", station),
    regulatoryRef: question.regulatoryRef,
    criterion: questionCriterion(requiredLevelForQuestion(question)),
    questionId: question.id,
    minimumLevel: requiredLevelForQuestion(question)
  }));
}

function packRequirement(kind: "assurance-pack" | "scenario-pack", packId: string, source: string): RequirementSpec {
  return {
    id: `${kind}:${packId}`,
    kind,
    title: `${kind === "assurance-pack" ? "Assurance" : "Scenario"} pack ${packId}`,
    source,
    criterion: "every scenario of the pack measured against the agent in a sealed assurance run with ledger provenance, and passed",
    packId
  };
}

/**
 * Derives the requirement list for a station: every sector-pack question,
 * every domain-pack question, the registry's assurance packs plus any the
 * profile adds, and the scenario baseline plus any the profile adds. A pack
 * named under both assurance and scenario lists is kept once, as assurance.
 */
export function deriveStationRequirements(station: Domain, profile?: ConformanceStationProfile): RequirementSpec[] {
  const metadata = getDomainMetadata(station);
  const assurancePackIds = uniqueInOrder([...metadata.assurancePacks, ...(profile?.requiredAssurancePacks ?? [])]);
  const assuranceSet = new Set(assurancePackIds);
  const scenarioPackIds = uniqueInOrder([...DEFAULT_SCENARIO_PACK_IDS, ...(profile?.requiredScenarioPacks ?? [])]).filter(
    (packId) => !assuranceSet.has(packId)
  );
  const registrySource = stationDataSource("src/domains/domainRegistry.ts", `${station}.assurancePacks`);
  const profileSource = profile ? `profile:${profile.id}` : null;

  return [
    ...sectorPackRequirements(station, profile),
    ...domainQuestionRequirements(station),
    ...assurancePackIds.map((packId) =>
      packRequirement("assurance-pack", packId, metadata.assurancePacks.includes(packId) ? registrySource : profileSource ?? registrySource)
    ),
    ...scenarioPackIds.map((packId) =>
      packRequirement(
        "scenario-pack",
        packId,
        DEFAULT_SCENARIO_PACK_IDS.includes(packId) ? "DEFAULT_SCENARIO_PACK_IDS (amc ci red-team default plugin)" : profileSource ?? "caller"
      )
    )
  ];
}
