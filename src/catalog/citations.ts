/**
 * Law-as-data citation rules (P1-09). Reuses P0-25: the shared official-host list (`isSharedOfficialUrl`, a superset
 * of the S5 register's hosts) and the superseded-instrument denylist. Cross-checks each citation against the S5
 * register (src/compliance/regulatory/register.json); the catalog references no other instrument registry.
 */
import { isSharedOfficialUrl } from "../compliance/citations/officialHosts.js";
import { SUPERSEDED_INSTRUMENTS } from "../compliance/citations/supersededInstruments.js";
import { getRegisterEntry, REGULATORY_REGISTER, type RegulatoryRegisterEntry } from "../compliance/regulatory/index.js";
import type { CatalogIssue } from "./schema.js";
import type { Citation, CitationStatusType, SupportLevel } from "./types.js";

export interface CitationContext {
  file: string;
  controlId: string;
  support: SupportLevel;
  /** Issue path of this citation, e.g. `citations.0`. */
  path: string;
  /** YYYY-MM-DD the check runs at. */
  asOf: string;
  /** Hosts from catalog/publisher-hosts.yaml; allowed for voluntary-standard citations only. */
  publisherHosts: readonly string[];
}

/** Which register entries each status type may cite. `null`: no register rule for that type. */
const REGISTER_AGREES: Readonly<Record<CitationStatusType, ((e: RegulatoryRegisterEntry) => boolean) | null>> = {
  "binding-now": (e) => (e.status === "in-force" || e.status === "partially-applicable") && e.bindingForce === "binding",
  "binding-future": (e) => e.status === "enacted-not-yet-applicable",
  draft: (e) => e.status === "proposed",
  "supervisory-guidance": (e) => e.bindingForce === "voluntary",
  "voluntary-standard": (e) => e.bindingForce === "voluntary",
  contractual: null,
  "conformity-scheme": null
};

const DAY_MS = 86_400_000;
const isReviewedContent = (support: SupportLevel) => support === "reviewed" || support === "qualified";

function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function validateCitation(c: Citation, ctx: CitationContext): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const add = (code: string, field: string, message: string, severity: CatalogIssue["severity"] = "error") =>
    issues.push({ code, severity, file: ctx.file, controlId: ctx.controlId, path: `${ctx.path}.${field}`, message: `${c.key}: ${message}` });

  const host = hostOf(c.url);
  const publisherHost = host !== null && ctx.publisherHosts.some((h) => host === h || host.endsWith(`.${h}`));
  if (!isSharedOfficialUrl(c.url) && !(publisherHost && c.statusType === "voluntary-standard")) {
    add("CAT_CITATION_HOST", "url", host === null
      ? `url ${c.url} is not an https url`
      : `host ${host} is not on the shared official host list${publisherHost ? " (publisher hosts are for voluntary-standard citations only)" : " or in catalog/publisher-hosts.yaml"}`);
  }

  if (c.registerId === null) {
    add("CAT_NO_REGISTER_ENTRY", "registerId", "no S5 register entry; the control cannot leave experimental until one exists",
      ctx.support === "experimental" ? "warning" : "error");
  } else {
    const entry = getRegisterEntry(c.registerId);
    if (!entry) {
      add("CAT_CITATION_REGISTER", "registerId", `register entry ${c.registerId} does not exist`);
    } else if (entry.status === "superseded" && c.superseded === null) {
      add("CAT_CITATION_SUPERSEDED", "registerId", `register entry ${c.registerId} is superseded${entry.supersededBy ? ` by ${entry.supersededBy}` : ""}; cite the successor or set superseded`);
    } else if (c.superseded === null && REGISTER_AGREES[c.statusType]?.(entry) === false) {
      add("CAT_CITATION_STATUS_MISMATCH", "statusType", `statusType ${c.statusType} disagrees with register entry ${c.registerId} (${entry.status}, ${entry.bindingForce})`);
    }
  }

  if (c.superseded === null) {
    for (const s of SUPERSEDED_INSTRUMENTS) {
      if (s.pattern.test(c.instrument) || s.pattern.test(c.clause)) {
        add("CAT_CITATION_SUPERSEDED", "instrument", `cites ${s.id}, superseded by ${s.replacement}; cite the successor or set superseded`);
      }
    }
  }

  if (c.retrieval.state === "verified") {
    const { retrievedAt } = c.retrieval;
    if (retrievedAt > ctx.asOf) {
      add("CAT_CITATION_RETRIEVAL", "retrieval.retrievedAt", `retrievedAt ${retrievedAt} is after ${ctx.asOf}`);
    } else {
      const ageDays = Math.floor((Date.parse(ctx.asOf) - Date.parse(retrievedAt)) / DAY_MS);
      const window = REGULATORY_REGISTER.policy.reviewWindowDays;
      if (ageDays > window) {
        add("CAT_CITATION_STALE", "retrieval.retrievedAt", `retrieved ${ageDays} days ago, beyond the register's ${window}-day review window`,
          isReviewedContent(ctx.support) ? "error" : "warning");
      }
    }
  }
  return issues;
}
