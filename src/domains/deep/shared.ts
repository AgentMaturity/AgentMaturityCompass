/**
 * Shared shape and helpers for the hand-written deep industry questions.
 * `deepIndustryPacks.ts` re-exports the types; station files import from here
 * so there is no runtime import cycle with the facade.
 */

import type { Domain } from "../domainRegistry.js";

export interface RegulationSource {
  title: string;
  url: string;
  retrievedAt: string;
  verified: boolean;
  note?: string;
}

export interface DeepIndustryQuestion {
  id: string;
  industry: string;
  station: Domain;
  /** Industry pack ids (see listIndustryPackIds()) whose scope this control applies to. */
  packIds?: string[];
  regulation: string;
  section: string;
  question: string;
  evaluationCriteria: string[];
  levels: Record<number, string>;
  evidenceTypes: string[];
  source: RegulationSource;
}

export const RETRIEVED_AT = "2026-10-03";

/** A note without `verified` means the provision could not be confirmed; pass `verified` for a confirmed provision with a caveat. */
export function source(title: string, url: string, note?: string, verified = note === undefined): RegulationSource {
  return note ? { title, url, retrievedAt: RETRIEVED_AT, verified, note } : { title, url, retrievedAt: RETRIEVED_AT, verified };
}

export function levels(l1: string, l2: string, l3: string, l4: string, l5: string): Record<number, string> {
  return { 1: l1, 2: l2, 3: l3, 4: l4, 5: l5 };
}

export const AI_ACT_DESK = "https://ai-act-service-desk.ec.europa.eu/en/ai-act";

export const OMNIBUS_DATES = "Annex III high-risk obligations apply from 2 December 2027 per Regulation (EU) 2026/1744 (Digital Omnibus on AI), read from the EUR-Lex summary of the amending act; the amended Art. 113 wording was not read in full.";

/** An AI Act provision read on the AI Act Service Desk explorer (consolidated text) on RETRIEVED_AT. */
export function aiActSource(page: `article-${number}` | "annex-3", note?: string): RegulationSource {
  const label = page === "annex-3" ? "Annex III" : `Art. ${page.slice("article-".length)}`;
  return source(`Regulation (EU) 2024/1689 ${label} (AI Act Service Desk)`, `${AI_ACT_DESK}/${page}`, note, true);
}

/** A CFR section on govinfo; `edition` is the annual CFR edition that was fetched. */
export function cfrSource(title: number, volume: number, section: string, heading: string, edition: number): RegulationSource {
  const slug = section.replace(".", "-");
  return source(
    `${title} CFR §${section} ${heading} (CFR ${edition} edition)`,
    `https://www.govinfo.gov/content/pkg/CFR-${edition}-title${title}-vol${volume}/xml/CFR-${edition}-title${title}-vol${volume}-sec${slug}.xml`,
  );
}
