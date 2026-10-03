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
}

export interface RegisterObligation {
  ref: string;
  summary: string;
  verified: boolean;
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
}

export interface RegulatoryRegister {
  schemaVersion: 1;
  policy: { reviewWindowDays: number; note: string };
  entries: RegulatoryRegisterEntry[];
}

export const REGULATORY_REGISTER = registerData as RegulatoryRegister;

export function getRegisterEntry(id: string): RegulatoryRegisterEntry | undefined {
  return REGULATORY_REGISTER.entries.find((entry) => entry.id === id);
}

export function getRegisterEntriesForStation(station: Domain): RegulatoryRegisterEntry[] {
  return REGULATORY_REGISTER.entries.filter((entry) => entry.stations.includes(station));
}
