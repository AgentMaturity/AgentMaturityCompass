/**
 * Regulatory-currency schema for industry packs.
 *
 * Pack content keeps its free-text `regulatoryBasis`, `complianceFrameworks`
 * and question `regulatoryRef` strings. This module resolves those strings to
 * catalogued instruments (regulatoryCatalogue.ts) that carry machine-readable
 * currency: citation, jurisdiction, url, effectiveDate, lastReviewed and status.
 *
 * The pack-level fields (version, lastReviewed, regulatoryReferences) follow
 * the "PackCurrencyFields v1" contract shared with the pack-audit module:
 * RegulatoryReference = { citation: string; jurisdiction: string; url?;
 * effectiveDate?; lastReviewed?; status: in-force | applies-from | proposed |
 * repealed | unverified }. The audit side declares the same shape structurally.
 *
 * Evidence rule: an instrument may only claim a status other than
 * "unverified" when it names the official source it was checked against
 * (an https url on OFFICIAL_SOURCE_HOSTS + retrievedAt). An "unverified"
 * instrument carries no url, retrievedAt or effectiveDate.
 */
import { frameworkChoices, normalizeFrameworkName, type ComplianceFramework } from "../../compliance/frameworks.js";
import { REGULATORY_CATALOGUE } from "./regulatoryCatalogue.js";
import type { IndustryPack } from "../industryPacks.js";

/** PackCurrencyFields v1 status enum. */
export const REGULATORY_STATUSES = [
  "in-force",      // binding law in force (later-applying obligations go in milestones), or the current edition of a standard/framework
  "applies-from",  // adopted; no obligation applies before effectiveDate
  "proposed",      // proposal not yet adopted
  "repealed",      // repealed act, or a withdrawn/superseded edition (see supersededBy)
  "unverified",    // not confirmed against an official source in the last review
] as const;
export type RegulatoryStatus = (typeof REGULATORY_STATUSES)[number];

export type RegulatoryInstrumentKind = "law" | "standard" | "guidance" | "treaty" | "framework" | "policy";

export interface RegulatoryMilestone {
  date: string;
  scope: string;
}

export interface RegulatoryInstrument {
  id: string;
  citation: string;
  jurisdiction: string;
  kind: RegulatoryInstrumentKind;
  status: RegulatoryStatus;
  lastReviewed: string;
  /** Official or primary source the status was checked against. Required unless status is "unverified". */
  url?: string;
  /** ISO date the source was read. Required unless status is "unverified". */
  retrievedAt?: string;
  /** Entry-into-force or first application date as listed by the source; phased dates go in milestones. */
  effectiveDate?: string;
  milestones?: RegulatoryMilestone[];
  supersededBy?: string;
  /** Present when the instrument is one of AMC's built-in compliance frameworks. */
  frameworkId?: ComplianceFramework;
  note?: string;
  /** Free-text spellings used in pack content; matched exactly or as a prefix followed by a separator. */
  aliases: string[];
}

/** A pack's regulatoryBasis entry with its resolved currency (PackCurrencyFields v1, plus text and instrumentId). */
export interface RegulatoryReference {
  /** Catalogue citation; the pack's own regulatoryBasis text when the entry does not resolve. */
  citation: string;
  /** Catalogue jurisdiction; UNRESOLVED_JURISDICTION when the entry does not resolve. */
  jurisdiction: string;
  url?: string;
  effectiveDate?: string;
  lastReviewed?: string;
  status: RegulatoryStatus;
  /** The regulatoryBasis text this reference was derived from. */
  text: string;
  instrumentId: string | null;
}

/** A pack's complianceFrameworks entry, normalized. */
export interface ComplianceFrameworkRef {
  label: string;
  /** Built-in AMC framework id when the label normalizes to one. */
  frameworkId: ComplianceFramework | null;
  /** Catalogue instrument when the label is an external framework. */
  instrumentId: string | null;
  external: boolean;
}

export const PACK_REVIEW_MAX_AGE_DAYS = 365;
/** Minimum questions per pack: the 15-question median measured on 2026-10-03, minus 2 (raised to 15 by the depth-floor commit). */
export const PACK_QUESTION_FLOOR = 13;
/** Content version stamped on every pack by the October 2026 review. */
export const PACK_CONTENT_VERSION = "2026.10";
export const UNRESOLVED_JURISDICTION = "unresolved";

/**
 * Hosts accepted as the official source of a verified instrument (exact host or
 * any subdomain). Planner list plus issuing bodies actually read in the review:
 * govinfo.gov (US GPO, Federal Register and CFR text), w3.org (WCAG),
 * pcisecuritystandards.org (PCI DSS), oecd.org (OECD legal instruments) and
 * consort-spirit.org (CONSORT/SPIRIT statements).
 */
export const OFFICIAL_SOURCE_HOSTS = [
  "europa.eu", "nist.gov", "iso.org", "federalregister.gov", "ecfr.gov", "hhs.gov",
  "legislation.gov.uk", "unece.org", "iec.ch", "who.int", "fatf-gafi.org", "ich.org",
  "govinfo.gov", "w3.org", "pcisecuritystandards.org", "oecd.org", "consort-spirit.org",
] as const;

export function isOfficialSourceUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  return OFFICIAL_SOURCE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ALIAS_SEPARATOR = /^[\s§(,;/:.-]/;
const DAY_MS = 86_400_000;

const INSTRUMENTS_BY_ID = new Map(REGULATORY_CATALOGUE.map((inst) => [inst.id, inst]));

export function getRegulatoryInstrument(id: string): RegulatoryInstrument | undefined {
  return INSTRUMENTS_BY_ID.get(id);
}

/** Longest alias that equals the text or prefixes it followed by a separator. */
export function resolveRegulatoryInstrument(
  text: string,
  catalogue: readonly RegulatoryInstrument[] = REGULATORY_CATALOGUE
): RegulatoryInstrument | undefined {
  const needle = text.trim();
  let best: { inst: RegulatoryInstrument; len: number } | undefined;
  for (const inst of catalogue) {
    for (const alias of inst.aliases) {
      const hit = needle === alias || (needle.startsWith(alias) && ALIAS_SEPARATOR.test(needle.slice(alias.length)));
      if (hit && (!best || alias.length > best.len)) best = { inst, len: alias.length };
    }
  }
  return best?.inst;
}

/** Resolves every ";"-separated citation in a question regulatoryRef. Unresolved parts map to undefined. */
export function resolveRegulatoryRefParts(ref: string): Array<{ part: string; instrument?: RegulatoryInstrument }> {
  return ref
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({ part, instrument: resolveRegulatoryInstrument(part) }));
}

export function toRegulatoryReference(text: string): RegulatoryReference {
  const inst = resolveRegulatoryInstrument(text);
  if (!inst) return { citation: text, jurisdiction: UNRESOLVED_JURISDICTION, status: "unverified", text, instrumentId: null };
  return {
    citation: inst.citation,
    jurisdiction: inst.jurisdiction,
    ...(inst.url ? { url: inst.url } : {}),
    ...(inst.effectiveDate ? { effectiveDate: inst.effectiveDate } : {}),
    lastReviewed: inst.lastReviewed,
    status: inst.status,
    text,
    instrumentId: inst.id,
  };
}

/**
 * A label is "known" when normalizeFrameworkName accepts it or it resolves to a
 * catalogue instrument that maps to a built-in framework; otherwise it is
 * "external" and must resolve to a catalogue instrument (the source record).
 */
export function normalizeComplianceFrameworkLabel(label: string): ComplianceFrameworkRef {
  const direct = normalizeFrameworkName(label);
  const inst = resolveRegulatoryInstrument(label);
  const frameworkId = direct ?? inst?.frameworkId ?? null;
  return { label, frameworkId, instrumentId: inst?.id ?? null, external: frameworkId === null };
}

function dateErrors(field: string, value: string | undefined, asOf: Date, maxAgeDays?: number): string[] {
  if (!value) return [`${field} is missing`];
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) return [`${field} "${value}" is not an ISO date`];
  const ageDays = (asOf.getTime() - Date.parse(value)) / DAY_MS;
  if (ageDays < -1) return [`${field} ${value} is in the future`];
  if (maxAgeDays !== undefined && ageDays > maxAgeDays) return [`${field} ${value} is older than ${maxAgeDays} days (review due)`];
  return [];
}

export function validateRegulatoryInstrument(inst: RegulatoryInstrument, asOf: Date = new Date()): string[] {
  const at = `instrument ${inst.id || "<no id>"}`;
  const errors: string[] = [];
  if (!inst.id) errors.push(`${at}: id is empty`);
  if (!inst.citation) errors.push(`${at}: citation is empty`);
  if (!inst.jurisdiction) errors.push(`${at}: jurisdiction is empty`);
  if (!inst.aliases?.length) errors.push(`${at}: no aliases`);
  if (!REGULATORY_STATUSES.includes(inst.status)) errors.push(`${at}: unknown status "${inst.status}"`);
  errors.push(...dateErrors("lastReviewed", inst.lastReviewed, asOf, PACK_REVIEW_MAX_AGE_DAYS).map((e) => `${at}: ${e}`));
  if (inst.status === "unverified") {
    for (const field of ["url", "retrievedAt", "effectiveDate"] as const) {
      if (inst[field] !== undefined) errors.push(`${at}: status "unverified" must not carry ${field} (${inst[field]})`);
    }
  } else {
    if (!inst.url) errors.push(`${at}: status "${inst.status}" requires an https source url (or status "unverified")`);
    else if (!isOfficialSourceUrl(inst.url)) errors.push(`${at}: url ${inst.url} is not an https url on an official source host`);
    errors.push(...dateErrors("retrievedAt", inst.retrievedAt, asOf, PACK_REVIEW_MAX_AGE_DAYS).map((e) => `${at}: ${e}`));
  }
  if (inst.status === "repealed" && !inst.supersededBy) {
    errors.push(`${at}: status "${inst.status}" requires supersededBy`);
  }
  if (inst.effectiveDate !== undefined && !ISO_DATE.test(inst.effectiveDate)) errors.push(`${at}: effectiveDate is not an ISO date`);
  for (const m of inst.milestones ?? []) {
    if (!ISO_DATE.test(m.date) || !m.scope) errors.push(`${at}: malformed milestone ${JSON.stringify(m)}`);
  }
  if (inst.frameworkId && !frameworkChoices().includes(inst.frameworkId)) errors.push(`${at}: unknown frameworkId ${inst.frameworkId}`);
  return errors;
}

const NOT_CURRENT: RegulatoryStatus[] = ["repealed"];

export function validatePackRegulatoryCurrency(pack: IndustryPack, asOf: Date = new Date()): string[] {
  const at = `pack ${pack.id}`;
  const errors = dateErrors("lastReviewed", pack.lastReviewed, asOf, PACK_REVIEW_MAX_AGE_DAYS).map((e) => `${at}: ${e}`);
  if (!pack.version) errors.push(`${at}: version is missing`);
  if (pack.questions.length < PACK_QUESTION_FLOOR) {
    errors.push(`${at}: ${pack.questions.length} questions is below the floor of ${PACK_QUESTION_FLOOR}`);
  }
  for (const text of pack.regulatoryBasis) {
    const inst = resolveRegulatoryInstrument(text);
    if (!inst) errors.push(`${at}: regulatoryBasis "${text}" does not resolve to a catalogued instrument`);
    else if (NOT_CURRENT.includes(inst.status)) errors.push(`${at}: regulatoryBasis "${text}" is ${inst.status} (by ${inst.supersededBy})`);
  }
  for (const label of pack.complianceFrameworks) {
    const ref = normalizeComplianceFrameworkLabel(label);
    if (ref.frameworkId === null && ref.instrumentId === null) {
      errors.push(`${at}: complianceFrameworks "${label}" neither normalizes to a built-in framework nor resolves to a catalogued external instrument`);
    }
    const inst = ref.instrumentId ? INSTRUMENTS_BY_ID.get(ref.instrumentId) : undefined;
    if (inst && NOT_CURRENT.includes(inst.status)) errors.push(`${at}: complianceFrameworks "${label}" is ${inst.status} (by ${inst.supersededBy})`);
  }
  for (const q of pack.questions) {
    for (const { part, instrument } of resolveRegulatoryRefParts(q.regulatoryRef)) {
      if (instrument && NOT_CURRENT.includes(instrument.status)) {
        errors.push(`${at}: ${q.id} regulatoryRef "${part}" is ${instrument.status} (by ${instrument.supersededBy})`);
      }
    }
  }
  return errors;
}

/** Adds the content version and the derived currency fields to a pack. The input object is not modified. */
export function withRegulatoryCurrency(pack: IndustryPack): IndustryPack {
  return {
    ...pack,
    version: pack.version ?? PACK_CONTENT_VERSION,
    regulatoryReferences: pack.regulatoryBasis.map(toRegulatoryReference),
    complianceFrameworkRefs: pack.complianceFrameworks.map(normalizeComplianceFrameworkLabel),
  };
}
