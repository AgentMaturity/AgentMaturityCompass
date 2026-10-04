/**
 * Regulatory currency register — the sourced list of instruments that govern
 * AI agents across AMC's seven stations.
 *
 * The data lives in register.json so scripts/check-regulatory-currency.mjs can
 * read it without a build; that script is the validator and currency gate.
 * Every entry records official sources with retrievedAt, the date it was last
 * reviewed, and per-fact verified flags. Unverified facts stay marked as such.
 */

import type { Domain } from "../../domains/domainRegistry.js";
import registerData from "./register.json" with { type: "json" };

export type RegisterStatus =
  | "in-force"
  | "partially-applicable"
  | "enacted-not-yet-applicable"
  | "published"
  | "proposed"
  | "superseded";

export interface RegisterSource {
  title: string;
  url: string;
  publisher: string;
  /** YYYY-MM-DD or UTC date-time when the source was read (or attempted). */
  retrievedAt: string;
  /** False when the page could not be read (bot challenge, timeout); `note` says why. */
  fetched: boolean;
  note?: string;
}

export interface RegisterKeyDate {
  /** Stable id; EU AI Act ids mirror EU_AI_ACT_TIMELINE keys in euAiActClassifier.ts. */
  id: string;
  /** YYYY-MM-DD, or YYYY-MM / YYYY when the source gives no day. */
  date: string;
  event: string;
  verified: boolean;
  /** Official page the date was read from (or sought on, when verified is false). */
  url: string;
  /** YYYY-MM-DD or UTC date-time when `url` was read; a named program receipt's date when `basis` cites one. */
  retrievedAt: string;
  basis?: string;
  note?: string;
  /** A retrieval observation (e.g. "page returns 404"), not a legal date; calendars skip it. */
  observation?: boolean;
}

export interface RegisterObligation {
  ref: string;
  summary: string;
  verified: boolean;
  basis?: string;
}

export interface RegulatoryRegisterEntry {
  id: string;
  jurisdiction: string;
  instrument: string;
  citation: string;
  bindingForce: "binding" | "voluntary";
  status: RegisterStatus;
  stations: Domain[];
  agentObligations: RegisterObligation[];
  keyDates: RegisterKeyDate[];
  sources: RegisterSource[];
  /** YYYY-MM-DD of the last review against the sources. */
  lastReviewed: string;
  /** True only when every encoded date and obligation was verified and nothing is open. */
  verified: boolean;
  openQuestions: string[];
  /** Industry pack ids (industryPacks.ts / industryPackManifest.ts); prefixed ids name code surfaces (assurance:, compliance:, score:). */
  affectedPacks?: string[];
  /** Finer status where `status` is coarse: "superseded" covers revoked and withdrawn instruments. */
  taskStatus?: "in force" | "applies from" | "proposed" | "withdrawn" | "superseded";
  /** Register entry ids this entry replaces; reciprocal with `supersededBy`. */
  supersedes?: string[];
  supersededBy?: string;
  /** Predecessor instruments that have no register entry. */
  supersedesInstruments?: string[];
  codeSurfaces?: string[];
  catalogueIds?: string[];
  /** Program receipt rows the entry was built from. */
  digestRows?: string[];
  provenance?: string[];
}

export interface RegulatoryRegister {
  schemaVersion: 1;
  policy: { reviewWindowDays: number; note: string; officialHostsNote: string; officialHosts: string[] };
  entries: RegulatoryRegisterEntry[];
}

export const REGULATORY_REGISTER = registerData as RegulatoryRegister;

/**
 * Official-host allowlist (regulators, legislatures, official journals,
 * standards bodies). scripts/check-regulatory-currency.mjs reads the same
 * list from register.json and fails on any source outside it.
 */
export const OFFICIAL_SOURCE_HOSTS: readonly string[] = Object.freeze([...REGULATORY_REGISTER.policy.officialHosts]);

/** True when the URL is https and its hostname is an allowlisted host or a subdomain of one. */
export function isOfficialSourceUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  return parsed.protocol === "https:" && OFFICIAL_SOURCE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export function getRegisterEntry(id: string): RegulatoryRegisterEntry | undefined {
  return REGULATORY_REGISTER.entries.find((entry) => entry.id === id);
}

export function getRegisterEntriesForStation(station: Domain): RegulatoryRegisterEntry[] {
  return REGULATORY_REGISTER.entries.filter((entry) => entry.stations.includes(station));
}
