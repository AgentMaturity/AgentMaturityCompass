/**
 * Law-as-data register entries (P1-18), format v1: one entry per clause of a jurisdiction's register, each with a
 * dated, sourced and hashed citation and the S5 register entry it belongs to. The format is jurisdiction-neutral:
 * catalog/registers/<id>.json holds one register file, and later registers (EU, watch lists) reuse it. Every entry is
 * agent-drafted and unreviewed until a named legal reviewer fills `legalReviewer`. docs/catalog/REGISTER.md describes
 * every field, rule and issue code.
 */
import { z } from "zod";
import { CITATION_STATUS_TYPES } from "../compliance/citations/citationRecord.js";
import { getRegisterEntry, isOfficialSourceUrl } from "../compliance/regulatory/index.js";
import { REGULATORY_CLOCK_TABLE } from "../incidents/regulatoryClocksTable.js";
import { STATIONS, type CatalogIssue, type Vocabulary } from "./schema.js";

const text = z.string().min(1);
const term = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, "must be a vocabulary term");
const PARTIAL_DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

/** A real calendar date written YYYY-MM-DD, or YYYY-MM / YYYY when the source gives no day. */
export function isPartialDate(value: string): boolean {
  const m = PARTIAL_DATE.exec(value);
  if (!m) return false;
  const iso = `${m[1]}-${m[2] ?? "01"}-${m[3] ?? "01"}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso;
}
/** The first day a partial date can mean, for ordering. */
const earliest = (value: string): string => `${value}-01-01`.slice(0, 10);
const partialDate = z.string().regex(PARTIAL_DATE, "must be YYYY-MM-DD, YYYY-MM or YYYY").refine(isPartialDate, "must be a real calendar date");

function flag(ctx: z.RefinementCtx, code: string, path: PropertyKey[], message: string): void {
  ctx.addIssue({ code: "custom", path, message, params: { code } });
}

export const registerEntrySchema = z.strictObject({
  id: term,
  row: text,
  stations: z.array(z.enum(STATIONS)).min(1),
  meaning: text,
  keyDatesText: text,
  statusText: text,
  scope: text.optional(),
  clock: z.strictObject({ duration: text, trigger: text.optional(), threshold: text.optional(), clockId: term.optional() }).optional(),
  citation: z.strictObject({
    instrument: text,
    clause: text,
    edition: text,
    jurisdiction: term,
    statusType: z.enum(CITATION_STATUS_TYPES),
    effectiveDate: partialDate.nullable(),
    complianceDueDate: partialDate.nullable(),
    dateQualifier: z.literal("about").optional(),
    url: text,
    contentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/, "must be sha256: and 64 lowercase hex").nullable(),
    retrievedAt: z.iso.date().nullable(),
    legalReviewer: z.strictObject({ name: text, credential: text, reviewedAt: z.iso.date() }).nullable()
  }),
  dateNotes: text.optional(),
  sourceKind: z.enum(["official", "secondary"]),
  sourceNote: text.optional(),
  flags: z.strictObject({
    reverify: text.optional(),
    litigationExposed: z.boolean().optional(),
    /** The legal reviewer's rationale for clearing a litigation flag the register's policy sets. */
    litigationCleared: text.optional(),
    applicationUncertain: text.optional(),
    pending: z.boolean().optional()
  }),
  s5RegisterId: term
}).superRefine((e, ctx) => {
  const c = e.citation;
  if (new Set(e.stations).size !== e.stations.length) flag(ctx, "CAT_SCHEMA", ["stations"], "duplicate station");
  if (c.effectiveDate && c.complianceDueDate && earliest(c.complianceDueDate) < earliest(c.effectiveDate)) {
    flag(ctx, "CAT_SCHEMA", ["citation", "complianceDueDate"], "complianceDueDate is before effectiveDate");
  }
  if ((c.effectiveDate === null || c.complianceDueDate === null) && !e.dateNotes) {
    flag(ctx, "CAT_SCHEMA", ["dateNotes"], "dateNotes says why a date is null");
  }
  if (c.dateQualifier && c.effectiveDate === null && c.complianceDueDate === null) flag(ctx, "CAT_SCHEMA", ["citation", "dateQualifier"], "dateQualifier needs a date");
  if (c.contentHash !== null && c.retrievedAt === null) flag(ctx, "CAT_REGISTER_SOURCE", ["citation", "retrievedAt"], "a contentHash needs the retrievedAt of the bytes it hashes");
  if (c.contentHash === null && !e.sourceNote) {
    flag(ctx, "CAT_REGISTER_SOURCE", ["sourceNote"], c.retrievedAt === null
      ? "an entry without a contentHash is unverified and needs a sourceNote giving the reason"
      : "a retrievedAt without a contentHash needs a sourceNote saying what was read and why no hash exists");
  }
  if (e.flags.pending && c.statusType !== "draft") flag(ctx, "CAT_SCHEMA", ["flags", "pending"], "pending marks a draft instrument");
  if (e.flags.litigationCleared && c.legalReviewer === null) flag(ctx, "CAT_REGISTER_LITIGATION", ["flags", "litigationCleared"], "only a legal reviewer clears a litigation flag");
});
export type RegisterEntry = z.infer<typeof registerEntrySchema>;

export const registerFileSchema = z.strictObject({
  registerVersion: z.literal(1),
  id: term,
  title: text,
  jurisdiction: term,
  policy: z.strictObject({
    /** Entries whose jurisdiction starts with a prefix carry `flags.litigationExposed` unless a legal reviewer cleared it. */
    litigationRules: z.array(z.strictObject({ jurisdictionPrefix: text, s5RegisterId: term, reason: text }))
  }),
  entries: z.array(registerEntrySchema).min(1)
});
export type RegisterFile = z.infer<typeof registerFileSchema>;

const PLAN_KEY = /^[A-Z][A-Z0-9]*-\d+$/;
const jurisdictionProfileSchema = z.strictObject({
  id: term,
  name: text,
  registerEntryIds: z.array(term),
  otherInstruments: z.array(z.strictObject({ name: text, s5RegisterId: term.nullable(), ownerKey: z.string().regex(PLAN_KEY, "must be a plan key") })),
  litigationExposed: z.boolean()
});
export const jurisdictionProfilesSchema = z.array(jurisdictionProfileSchema).min(1);
export type JurisdictionProfile = z.infer<typeof jurisdictionProfileSchema>;

export interface RegisterContext {
  /** Catalog-relative file, for issues. */
  file: string;
  /** YYYY-MM-DD the check runs at; a later retrievedAt is refused. */
  asOf: string;
  vocabulary?: Vocabulary | null;
}

/**
 * Rules across one register file and the S5 register: unique ids; the host rule (`sourceKind` is official exactly when
 * the URL is on S5's official hosts, and a secondary entry carries no legal reviewer); the S5 entry exists and covers
 * the entry's stations; the litigation rules; vocabulary jurisdictions; F4 clock ids; no future retrieval.
 */
export function validateRegister(register: RegisterFile, ctx: RegisterContext): CatalogIssue[] {
  const out: CatalogIssue[] = [];
  register.entries.forEach((e, i) => {
    const add = (code: string, path: string, message: string) =>
      out.push({ code, severity: "error", file: ctx.file, controlId: null, path: `entries.${i}.${path}`, message: `${e.id}: ${message}` });
    if (register.entries.findIndex((x) => x.id === e.id) !== i) add("CAT_DUPLICATE_ID", "id", "duplicate entry id");
    const c = e.citation;
    const official = isOfficialSourceUrl(c.url);
    if (e.sourceKind !== (official ? "official" : "secondary")) {
      add("CAT_REGISTER_HOST", "sourceKind", `sourceKind ${e.sourceKind}, but ${c.url} is ${official ? "" : "not "}on the S5 official hosts`);
    }
    if (!official && c.legalReviewer !== null) add("CAT_REGISTER_HOST", "citation.legalReviewer", "a secondary-source entry cannot carry a legal reviewer");
    if (!c.url.startsWith("https://")) add("CAT_REGISTER_HOST", "citation.url", "the url must be https");
    const s5 = getRegisterEntry(e.s5RegisterId);
    if (!s5) add("CAT_REGISTER_S5", "s5RegisterId", `S5 register entry ${e.s5RegisterId} does not exist`);
    else {
      const missing = e.stations.filter((s) => !s5.stations.includes(s));
      if (missing.length) add("CAT_REGISTER_STATIONS", "stations", `S5 entry ${s5.id} lacks stations ${missing.join(", ")}`);
    }
    for (const rule of register.policy.litigationRules) {
      if (c.jurisdiction.startsWith(rule.jurisdictionPrefix) && e.flags.litigationExposed !== true && !e.flags.litigationCleared) {
        add("CAT_REGISTER_LITIGATION", "flags.litigationExposed", `${c.jurisdiction} entries carry litigationExposed (${rule.reason}; S5 ${rule.s5RegisterId})`);
      }
    }
    if (ctx.vocabulary && !ctx.vocabulary.jurisdictions.includes(c.jurisdiction)) add("CAT_VOCAB", "citation.jurisdiction", `"${c.jurisdiction}" is not a jurisdictions term`);
    if (e.clock?.clockId && !REGULATORY_CLOCK_TABLE.some((k) => k.clockId === e.clock?.clockId)) {
      add("CAT_CLOCK_UNKNOWN", "clock.clockId", `${e.clock.clockId} is not in REGULATORY_CLOCK_TABLE`);
    }
    if (c.retrievedAt !== null && c.retrievedAt > ctx.asOf) add("CAT_REGISTER_RETRIEVAL", "citation.retrievedAt", `retrievedAt ${c.retrievedAt} is after ${ctx.asOf}`);
  });
  for (const rule of register.policy.litigationRules) {
    if (!getRegisterEntry(rule.s5RegisterId)) {
      out.push({ code: "CAT_REGISTER_S5", severity: "error", file: ctx.file, controlId: null, path: "policy.litigationRules", message: `S5 register entry ${rule.s5RegisterId} does not exist` });
    }
  }
  return out;
}

/** Profile entry ids resolve in the registers, S5 ids resolve, and a profile with a litigation-exposed entry says so. */
export function validateJurisdictionProfiles(profiles: readonly JurisdictionProfile[], registers: readonly RegisterFile[], file: string): CatalogIssue[] {
  const entries = new Map(registers.flatMap((r) => r.entries.map((e): [string, RegisterEntry] => [e.id, e])));
  const out: CatalogIssue[] = [];
  profiles.forEach((p, i) => {
    const add = (code: string, path: string, message: string) =>
      out.push({ code, severity: "error", file, controlId: null, path: `${i}.${path}`, message: `${p.id}: ${message}` });
    if (profiles.findIndex((x) => x.id === p.id) !== i) add("CAT_DUPLICATE_ID", "id", "duplicate profile id");
    for (const id of p.registerEntryIds) if (!entries.has(id)) add("CAT_REGISTER_ENTRY", "registerEntryIds", `register entry ${id} does not exist`);
    for (const x of p.otherInstruments) if (x.s5RegisterId !== null && !getRegisterEntry(x.s5RegisterId)) add("CAT_REGISTER_S5", "otherInstruments", `S5 register entry ${x.s5RegisterId} does not exist`);
    if (!p.litigationExposed && p.registerEntryIds.some((id) => entries.get(id)?.flags.litigationExposed)) {
      add("CAT_REGISTER_LITIGATION", "litigationExposed", "lists a litigation-exposed entry, so the profile is litigation-exposed");
    }
  });
  return out;
}

/**
 * Entries whose stated status should have changed by `asOf` (YYYY-MM-DD): a binding-future entry whose compliance
 * date (or, without one, its effective date) has arrived. P1-34's currency review works this list; nothing here
 * changes an entry's status.
 */
export function statusReviewDue(entries: readonly RegisterEntry[], asOf: string): Array<{ id: string; reason: string }> {
  return entries.flatMap((e) => {
    const date = e.citation.complianceDueDate ?? e.citation.effectiveDate;
    if (e.citation.statusType !== "binding-future" || date === null || earliest(date) > asOf) return [];
    return [{ id: e.id, reason: `status review due: binding-future, but ${date} is on or before ${asOf}` }];
  });
}
