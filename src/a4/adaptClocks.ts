/**
 * Adapt's regulatory clock candidates (P1-61; design §10.3 Understand). The clock table decides nothing: a clock listed
 * for a station is a candidate the operator must confirm (src/incidents/regulatoryClocksTable.ts), so every candidate is
 * NEEDS_CLASSIFICATION whatever the declared jurisdictions say. Whether the clock's jurisdiction is among them is kept
 * beside it as data, never used to drop it: an undeclared jurisdiction can still bind (extraterritorial reach). Every row
 * carries CLOCK_REVIEW_STATUS verbatim and its source's `verified` flag as the table records it. P3-23 adds overlay rules.
 */
import type { Station } from "../domains/stations.js";
import { CLOCK_REVIEW_STATUS, clocksForStation } from "../incidents/regulatoryClocks.js";

export interface AdaptClockCandidate {
  readonly clockId: string;
  readonly instrument: string;
  readonly article: string;
  readonly authority: string;
  readonly jurisdiction: string;
  readonly deadline: string;
  readonly condition: string;
  readonly stations: readonly string[];
  readonly source: { readonly url: string; readonly verified: boolean; readonly reason: string | null };
  /** Whether the clock's jurisdiction (its leading term, "US" of "US-TX") is among the declared ones; data only. */
  readonly jurisdictionDeclared: "declared" | "not_declared" | "unknown";
  readonly status: "NEEDS_CLASSIFICATION";
  readonly reviewStatus: typeof CLOCK_REVIEW_STATUS;
}

/** The clocks of every station, once each, in table order. `jurisdictions` null means unknown. */
export function clockCandidates(stations: readonly Station[], jurisdictions: readonly string[] | null): AdaptClockCandidate[] {
  const seen = new Set<string>();
  return stations.flatMap((station) => clocksForStation(station)).filter((clock) => !seen.has(clock.clockId) && seen.add(clock.clockId))
    .map((clock) => {
      const root = clock.jurisdiction.split(/[-\s(]/)[0] ?? clock.jurisdiction;
      return {
        clockId: clock.clockId, instrument: clock.instrument, article: clock.article, authority: clock.authority, jurisdiction: clock.jurisdiction,
        deadline: `${clock.deadline.amount} ${clock.deadline.unit} from ${clock.trigger}`, condition: clock.condition, stations: [...clock.stations],
        source: { url: clock.source.url, verified: clock.source.verified, reason: clock.source.reason ?? null },
        jurisdictionDeclared: jurisdictions === null ? "unknown" : jurisdictions.includes(root) ? "declared" : "not_declared",
        status: "NEEDS_CLASSIFICATION", reviewStatus: CLOCK_REVIEW_STATUS
      };
    });
}
