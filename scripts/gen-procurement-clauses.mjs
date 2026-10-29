#!/usr/bin/env node
/**
 * Renders docs/PROCUREMENT_CLAUSES.md from the clause library docs/procurement-clauses.json (P3-19).
 *
 * Usage: node scripts/gen-procurement-clauses.mjs [--write | --check] [--data <clauses.json>] [--out <file.md>]
 *   --write  validate the library and write the Markdown (the default)
 *   --check  exit 1 if the Markdown differs from a fresh render, 0 if equal
 * Exit 2 means the library could not be read or failed validation.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prohibitedTruthClaims } from "./docs-drift-check.mjs";
import { isEntrypoint } from "./lib/entrypoint.mjs";

const DEFAULT_DATA = "docs/procurement-clauses.json";
const DEFAULT_OUT = "docs/PROCUREMENT_CLAUSES.md";
const REGIMES = ["us-federal", "rbi", "dora", "general"];
const STATUSES = ["experimental", "counsel-reviewed"];
export const NOT_PROVIDED = "not provided by AMC";
/** The one clause allowed to quote the banned words, and only inside double quotes. */
const VOCABULARY_CLAUSE = "PC-CLAIM-VOCABULARY";
const BANNED = [...prohibitedTruthClaims, /\bguarantee/i];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REGIME_LABELS = { "us-federal": "US federal (M-25-22 style)", rbi: "RBI outsourcing", dora: "EU DORA", general: "General" };

const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;

function sourceErrors(id, source, i, root) {
  const at = `${id}: sources[${i}]`;
  const errors = [];
  if (!nonEmpty(source?.citation)) errors.push(`${at} has no citation`);
  if (!DATE.test(source?.verifiedAt ?? "")) errors.push(`${at} has no verifiedAt date`);
  const hasUrl = source?.url !== undefined;
  const hasPath = source?.path !== undefined;
  if (hasUrl === hasPath) errors.push(`${at} needs exactly one of url or path`);
  if (hasUrl && !/^https:\/\/\S+$/.test(source.url)) errors.push(`${at} url is not https`);
  if (hasPath && !(nonEmpty(source.path) && existsSync(resolve(root, source.path)))) errors.push(`${at} path ${source.path} does not exist`);
  return errors;
}

function bannedErrors(clause) {
  const text = `${clause.title} ${clause.text} ${clause.limits ?? ""}`;
  const checked = clause.id === VOCABULARY_CLAUSE ? text.replace(/"[^"]*"/g, '""') : text;
  return BANNED.filter((pattern) => pattern.test(checked)).map((pattern) => `${clause.id}: text uses banned wording ${pattern}`);
}

function clauseErrors(clause, root) {
  const id = nonEmpty(clause?.id) ? clause.id : "<no id>";
  const errors = [];
  if (!/^PC-[A-Z0-9-]+$/.test(clause?.id ?? "")) errors.push(`${id}: id must match PC-[A-Z0-9-]+`);
  for (const field of ["title", "text", "amcArtifact"]) if (!nonEmpty(clause?.[field])) errors.push(`${id}: ${field} is empty`);
  if (clause?.limits !== undefined && !nonEmpty(clause.limits)) errors.push(`${id}: limits is empty`);
  const regimes = Array.isArray(clause?.regimes) ? clause.regimes : [];
  if (regimes.length === 0 || regimes.some((r) => !REGIMES.includes(r)) || new Set(regimes).size !== regimes.length) {
    errors.push(`${id}: regimes must be a non-empty subset of ${REGIMES.join(", ")}`);
  }
  const sources = Array.isArray(clause?.sources) ? clause.sources : [];
  if (sources.length === 0) errors.push(`${id}: has no sources`);
  sources.forEach((source, i) => errors.push(...sourceErrors(id, source, i, root)));
  if (regimes.some((r) => r !== "general") && !sources.some((s) => s?.url !== undefined)) {
    errors.push(`${id}: a regulatory clause needs at least one source with a url`);
  }
  if (!STATUSES.includes(clause?.status)) errors.push(`${id}: status must be one of ${STATUSES.join(", ")}`);
  if (clause?.status === "counsel-reviewed") {
    if (!nonEmpty(clause.reviewer)) errors.push(`${id}: counsel-reviewed needs a reviewer`);
    if (!DATE.test(clause.reviewedAt ?? "")) errors.push(`${id}: counsel-reviewed needs a reviewedAt date`);
  } else if (clause?.reviewer != null || clause?.reviewedAt != null) {
    errors.push(`${id}: an experimental clause names no reviewer or reviewedAt`);
  }
  if (nonEmpty(clause?.title) && nonEmpty(clause?.text)) errors.push(...bannedErrors(clause));
  return errors;
}

/** Every problem in the library, as messages; empty when it is valid. */
export function validateLibrary(library, root = process.cwd()) {
  const errors = [];
  if (library?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  for (const field of ["libraryVersion", "specVersion"]) if (!nonEmpty(library?.[field])) errors.push(`${field} is empty`);
  const clauses = Array.isArray(library?.clauses) ? library.clauses : [];
  if (clauses.length === 0) errors.push("clauses is empty");
  const ids = clauses.map((c) => c?.id);
  for (const dup of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) errors.push(`${dup}: duplicate id`);
  for (const clause of clauses) errors.push(...clauseErrors(clause, root));
  return errors;
}

function renderSource(source) {
  const where = source.url ? `<${source.url}>` : `\`${source.path}\``;
  return `- ${source.citation}. ${where} (checked ${source.verifiedAt})`;
}

function renderClause(clause) {
  const review = clause.status === "counsel-reviewed"
    ? `**Status: counsel-reviewed** by ${clause.reviewer} on ${clause.reviewedAt}.`
    : "**Status: experimental.** Agent-drafted and not reviewed by counsel. Not legal advice.";
  return [
    `## ${clause.id} · ${clause.title}`,
    "",
    review,
    "",
    clause.text,
    "",
    `- Regimes: ${clause.regimes.map((r) => REGIME_LABELS[r]).join(", ")}`,
    `- AMC artifact: ${clause.amcArtifact}`,
    ...(clause.limits ? [`- Limits: ${clause.limits}`] : []),
    "",
    "Sources:",
    "",
    ...clause.sources.map(renderSource),
    ""
  ].join("\n");
}

/** The Markdown page for a valid library. */
export function renderLibrary(library) {
  const reviewed = library.clauses.filter((c) => c.status === "counsel-reviewed").length;
  return [
    "# Procurement contract clauses",
    "",
    "<!-- Generated by scripts/gen-procurement-clauses.mjs from docs/procurement-clauses.json. Do not edit by hand. -->",
    "",
    `**Draft. Experimental and unreviewed.** ${reviewed} of ${library.clauses.length} clauses are reviewed by counsel. ` +
      "These clauses are templates, not legal advice. Review them with your own counsel before you use them in a contract. " +
      "AMC output is evidence of conformity, never proof that a law or regulation is met.",
    "",
    `Library version ${library.libraryVersion}, for AMC Core Spec ${library.specVersion}. Each clause keeps its id across ` +
      "versions. A clause marked experimental was drafted by an AI agent and has no counsel sign-off. Square brackets mark " +
      "values the parties fill in. Each source was checked on the date shown; regulations and OMB memoranda change, so " +
      "check each one again before you rely on it.",
    "",
    ...library.clauses.map(renderClause)
  ].join("\n");
}

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function main(args, root = process.cwd()) {
  const outPath = resolve(root, argValue(args, "--out") ?? DEFAULT_OUT);
  let next;
  try {
    const library = JSON.parse(readFileSync(resolve(root, argValue(args, "--data") ?? DEFAULT_DATA), "utf8"));
    const errors = validateLibrary(library, root);
    if (errors.length > 0) throw new Error(`invalid clause library:\n- ${errors.join("\n- ")}`);
    next = renderLibrary(library);
  } catch (error) {
    console.error(`gen-procurement-clauses: ${error.message}`);
    return 2;
  }
  if (args.includes("--check")) {
    if ((existsSync(outPath) ? readFileSync(outPath, "utf8") : null) !== next) {
      console.error(`${outPath} is stale or hand-edited. Run: node scripts/gen-procurement-clauses.mjs --write`);
      return 1;
    }
    console.log(`Procurement clauses match the library (${outPath}).`);
    return 0;
  }
  writeFileSync(outPath, next);
  console.log(`Wrote ${outPath}`);
  return 0;
}

if (isEntrypoint(import.meta.url)) process.exitCode = main(process.argv.slice(2));
