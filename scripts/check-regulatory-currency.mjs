#!/usr/bin/env node
/**
 * Regulatory currency check for src/compliance/regulatory/register.json.
 *
 * Fails (exit 1) when any entry is malformed, has no source with a URL and
 * retrievedAt, cites a host outside policy.officialHosts, carries a verified
 * flag its contents do not support, or was last reviewed longer ago than
 * policy.reviewWindowDays. Prints `entries=N verified=M unverified=K` either
 * way; --json prints every entry with its currency and sources instead.
 * Unknown flags are rejected (exit 1).
 *
 * Usage: node scripts/check-regulatory-currency.mjs [--register <path>] [--as-of|--now YYYY-MM-DD] [--json]
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_REGISTER_PATH = join(root, "src/compliance/regulatory/register.json");

export const STATIONS = ["health", "education", "environment", "mobility", "governance", "technology", "wealth"];
export const STATUSES = ["in-force", "partially-applicable", "enacted-not-yet-applicable", "published", "proposed", "superseded"];
const DAY_MS = 86_400_000;
const PARTIAL_DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const FULL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/;

/** Parse YYYY, YYYY-MM or YYYY-MM-DD (or a UTC date-time) to epoch ms; NaN when invalid or not a real calendar date. */
export function parseRegisterDate(value) {
  if (typeof value !== "string" || !(PARTIAL_DATE.test(value) || DATE_TIME.test(value))) return Number.NaN;
  const [y, m = "01", d = "01"] = value.slice(0, 10).split("-");
  const ms = Date.parse(DATE_TIME.test(value) ? value : `${y}-${m}-${d}T00:00:00Z`);
  const back = new Date(ms).toISOString().slice(0, 10);
  return back === `${y}-${m}-${d}` ? ms : Number.NaN;
}

const isText = (v) => typeof v === "string" && v.trim().length > 0;

/** Same rule as isOfficialSourceUrl in src/compliance/regulatory/index.ts. */
export function isOfficialHost(url, officialHosts) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return officialHosts.some((h) => host === h || host.endsWith(`.${h}`));
}

function checkEntry(entry, asOfMs, windowDays, officialHosts) {
  const errs = [];
  const at = (msg) => errs.push(`${entry?.id ?? "<no id>"}: ${msg}`);
  for (const key of ["id", "jurisdiction", "instrument", "citation", "lastReviewed"]) if (!isText(entry[key])) at(`missing ${key}`);
  if (!["binding", "voluntary"].includes(entry.bindingForce)) at(`bindingForce must be binding|voluntary`);
  if (!STATUSES.includes(entry.status)) at(`status ${JSON.stringify(entry.status)} not one of ${STATUSES.join("|")}`);
  if (!Array.isArray(entry.stations) || entry.stations.length === 0 || entry.stations.some((s) => !STATIONS.includes(s))) at("stations must be a non-empty subset of the seven stations");
  if (!Array.isArray(entry.openQuestions) || entry.openQuestions.some((q) => !isText(q))) at("openQuestions must be an array of strings");

  const obligations = Array.isArray(entry.agentObligations) ? entry.agentObligations : [];
  if (obligations.length === 0) at("needs at least one agentObligation");
  for (const o of obligations) if (!isText(o.ref) || !isText(o.summary) || typeof o.verified !== "boolean") at(`obligation ${JSON.stringify(o.ref)} needs ref, summary and boolean verified`);

  const keyDates = Array.isArray(entry.keyDates) ? entry.keyDates : [];
  if (keyDates.length === 0) at("needs at least one keyDate");
  const dateIds = new Set();
  for (const k of keyDates) {
    if (!isText(k.id) || dateIds.has(k.id)) at(`keyDate id ${JSON.stringify(k.id)} missing or duplicated`);
    dateIds.add(k.id);
    if (Number.isNaN(parseRegisterDate(k.date)) || DATE_TIME.test(k.date)) at(`keyDate ${k.id} has invalid date ${JSON.stringify(k.date)}`);
    if (!isText(k.event) || typeof k.verified !== "boolean") at(`keyDate ${k.id} needs event and boolean verified`);
  }

  const sources = Array.isArray(entry.sources) ? entry.sources : [];
  if (sources.length === 0) at("has no source");
  for (const s of sources) {
    if (!isText(s.title) || !isText(s.publisher) || typeof s.fetched !== "boolean") at(`source ${JSON.stringify(s.url)} needs title, publisher and boolean fetched`);
    if (!isText(s.url) || !/^https:\/\/[^\s]+$/.test(s.url)) at(`source url ${JSON.stringify(s.url)} must be https`);
    else if (!isOfficialHost(s.url, officialHosts)) at(`source ${s.url} is not on an official host (policy.officialHosts)`);
    const got = parseRegisterDate(s.retrievedAt);
    if (Number.isNaN(got)) at(`source ${s.url} lacks a valid retrievedAt`);
    else if (got > asOfMs + DAY_MS) at(`source ${s.url} retrievedAt ${s.retrievedAt} is in the future`);
    if (s.fetched === false && !isText(s.note)) at(`source ${s.url} was not fetched and needs a note saying why`);
  }

  const unverifiedParts = [...obligations, ...keyDates].filter((x) => x.verified !== true).length
    + (sources.some((s) => s.fetched === true) ? 0 : 1)
    + (Array.isArray(entry.openQuestions) ? entry.openQuestions.length : 0);
  if (typeof entry.verified !== "boolean") at("verified must be boolean");
  else if (entry.verified && unverifiedParts > 0) at("verified=true but it has unverified dates/obligations, open questions or no fetched source");
  else if (!entry.verified && unverifiedParts === 0) at("verified=false but nothing is unverified or open; say what is unconfirmed");

  const reviewed = parseRegisterDate(entry.lastReviewed);
  if (!FULL_DATE.test(entry.lastReviewed ?? "") || Number.isNaN(reviewed)) at(`lastReviewed ${JSON.stringify(entry.lastReviewed)} is not a YYYY-MM-DD date`);
  else if (reviewed > asOfMs + DAY_MS) at(`lastReviewed ${entry.lastReviewed} is in the future`);
  else {
    const ageDays = Math.floor((asOfMs - reviewed) / DAY_MS);
    if (ageDays > windowDays) at(`lastReviewed ${entry.lastReviewed} is ${ageDays} days old; policy window is ${windowDays} days`);
  }
  return errs;
}

/** Validate a parsed register and evaluate review currency as of `asOf` (YYYY-MM-DD; default today, UTC). */
export function checkRegulatoryCurrency(register, { asOf } = {}) {
  const asOfMs = asOf ? parseRegisterDate(asOf) : Date.parse(new Date().toISOString().slice(0, 10));
  const errors = [];
  if (Number.isNaN(asOfMs)) errors.push(`invalid --as-of ${JSON.stringify(asOf)}`);
  if (register?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  const windowDays = register?.policy?.reviewWindowDays;
  if (!Number.isInteger(windowDays) || windowDays <= 0) errors.push("policy.reviewWindowDays must be a positive integer");
  const rawHosts = register?.policy?.officialHosts;
  const officialHosts = Array.isArray(rawHosts) && rawHosts.length > 0 && rawHosts.every((h) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h)) ? rawHosts : [];
  if (officialHosts.length === 0) errors.push("policy.officialHosts must be a non-empty list of lower-case hostnames");
  const entries = Array.isArray(register?.entries) ? register.entries : [];
  if (entries.length === 0) errors.push("register has no entries");
  const ids = new Set();
  const report = [];
  for (const entry of entries) {
    if (ids.has(entry?.id)) errors.push(`duplicate entry id ${entry.id}`);
    ids.add(entry?.id);
    const entryErrors = Number.isNaN(asOfMs) ? [] : checkEntry(entry ?? {}, asOfMs, windowDays, officialHosts);
    errors.push(...entryErrors);
    report.push({
      id: entry?.id ?? null,
      status: entry?.status ?? null,
      verified: entry?.verified === true,
      lastReviewed: entry?.lastReviewed ?? null,
      windowDays: Number.isInteger(windowDays) ? windowDays : null,
      currency: entryErrors.length === 0 ? "current" : entryErrors.some((e) => e.includes("days old; policy window")) ? "stale" : "invalid",
      sources: (Array.isArray(entry?.sources) ? entry.sources : []).map((s) => ({ url: s?.url ?? null, retrievedAt: s?.retrievedAt ?? null })),
    });
  }
  const verified = entries.filter((e) => e?.verified === true).length;
  return {
    ok: errors.length === 0, errors, entries: entries.length, verified, unverified: entries.length - verified,
    asOf: Number.isNaN(asOfMs) ? null : new Date(asOfMs).toISOString().slice(0, 10),
    allowedHosts: officialHosts, entryReports: report,
  };
}

const VALUE_FLAGS = { "--register": "register", "--as-of": "asOf", "--now": "asOf" };

/** Parse argv strictly: unknown flags, stray values and missing values are errors. */
export function parseArgs(argv) {
  const opts = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--json") opts.json = true;
    else if (flag in VALUE_FLAGS) {
      const value = argv[i + 1];
      if (value === undefined || value === "" || value.startsWith("--")) return { error: `${flag} needs a value` };
      opts[VALUE_FLAGS[flag]] = value;
      i += 1;
    } else return { error: `unknown argument ${JSON.stringify(flag)}; usage: [--register <path>] [--as-of|--now YYYY-MM-DD] [--json]` };
  }
  return { opts };
}

export function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  if (parsed.error) {
    console.error(`regulatory-currency: ${parsed.error}`);
    return 1;
  }
  const path = parsed.opts.register ?? DEFAULT_REGISTER_PATH;
  let register;
  try {
    register = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`regulatory-currency: cannot read ${path}: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const result = checkRegulatoryCurrency(register, { asOf: parsed.opts.asOf });
  if (parsed.opts.json) {
    const { entryReports, ...summary } = result;
    console.log(JSON.stringify({ ...summary, entries: entryReports, counts: { entries: result.entries, verified: result.verified, unverified: result.unverified } }, null, 2));
  }
  else {
    console.log(`entries=${result.entries} verified=${result.verified} unverified=${result.unverified} asOf=${result.asOf}`);
    for (const e of result.errors) console.error(`  FAIL ${e}`);
  }
  return result.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
