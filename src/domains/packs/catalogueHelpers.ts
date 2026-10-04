/**
 * Builders for regulatory-catalogue entries. Each "verified" builder records the
 * official source actually read during the review; `unverified` records none.
 */
import type {
  RegulatoryInstrument,
  RegulatoryInstrumentKind,
  RegulatoryMilestone,
  RegulatoryStatus,
} from "./regulatorySchema.js";

/** Date of the October 2026 regulatory-currency review. */
export const REVIEWED = "2026-10-03";

type Extra = Partial<Omit<RegulatoryInstrument, "id" | "citation" | "aliases">>;

const OP_NOTE =
  "In-force flag and dates read from Publications Office CELLAR metadata (publications.europa.eu/webapi/rdf/sparql) on the review date.";

/** EU act verified against Publications Office metadata; url is the act's ELI. */
export function eu(
  id: string,
  eli: string,
  citation: string,
  status: RegulatoryStatus,
  effectiveDate: string | undefined,
  aliases: string[],
  extra: Extra = {}
): RegulatoryInstrument {
  return {
    id, citation, jurisdiction: "EU", kind: "law", status, lastReviewed: REVIEWED,
    url: `https://data.europa.eu/eli/${eli}/oj`, retrievedAt: REVIEWED, effectiveDate, aliases,
    ...extra,
    note: extra.note ? `${extra.note} ${OP_NOTE}` : OP_NOTE,
  };
}

/** Any instrument verified against the named official page or API. */
export function verified(
  id: string,
  citation: string,
  jurisdiction: string,
  kind: RegulatoryInstrumentKind,
  status: RegulatoryStatus,
  url: string,
  aliases: string[],
  extra: Extra = {}
): RegulatoryInstrument {
  return { id, citation, jurisdiction, kind, status, lastReviewed: REVIEWED, url, retrievedAt: REVIEWED, aliases, ...extra };
}

/** US CFR part verified via the Federal Register API listing of final rules affecting it. */
export function cfr(
  id: string,
  title: number,
  part: number,
  citation: string,
  aliases: string[],
  extra: Extra = {}
): RegulatoryInstrument {
  const url = `https://www.federalregister.gov/api/v1/documents.json?conditions%5Btype%5D%5B%5D=RULE&conditions%5Bcfr%5D%5Btitle%5D=${title}&conditions%5Bcfr%5D%5Bpart%5D=${part}`;
  return verified(id, citation, "US", "law", "in-force", url, aliases, extra);
}

/** Listed in pack content but not confirmed against an official source in this review. */
export function unverified(
  id: string,
  citation: string,
  jurisdiction: string,
  kind: RegulatoryInstrumentKind,
  aliases: string[],
  note?: string
): RegulatoryInstrument {
  return { id, citation, jurisdiction, kind, status: "unverified", lastReviewed: REVIEWED, aliases, ...(note ? { note } : {}) };
}

export function milestones(...pairs: Array<[string, string]>): RegulatoryMilestone[] {
  return pairs.map(([date, scope]) => ({ date, scope }));
}
