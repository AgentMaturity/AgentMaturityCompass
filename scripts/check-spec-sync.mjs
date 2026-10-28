#!/usr/bin/env node
// P1-30: the AMC Core Spec's normative tables are generated from the code they describe, so they cannot drift (gap G6).
//   --write  regenerate every <!-- amc:spec:<name> --> region under spec/ from the code (build first: reads dist/)
//   --check  fail when a region is stale or missing, when a spec file lacks the licence line, or when the spec cites a
//            schema $id that spec/schemas/index.json does not list
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { prohibitedTruthClaims } from "./docs-drift-check.mjs";
import { isEntrypoint } from "./lib/entrypoint.mjs";

// D-04 (licences) is not recorded yet, so the spec ships under the repository licence (LICENSE: MIT). When Sid
// records D-04, change this line and run --write; option A would make it CC-BY-4.0.
export const SPEC_LICENCE = "MIT";
export const SPEC_LICENCE_LINE = `<!-- SPDX-License-Identifier: ${SPEC_LICENCE} -->`;
export const REGION_NAMES = ["levels", "claim-kinds", "banned-wording", "schema-ids", "receipt-states"];

const SPEC_DIRS = ["core", "annex", "rfcs"];
const ID_PATTERN = /https:\/\/agentmaturity\.co\/spec\/schemas\/v\d\/[a-z0-9.-]+\.schema\.json/g;
const REGION = /<!-- amc:spec:([a-z-]+) -->\n[\s\S]*?<!-- \/amc:spec:\1 -->/g;

/** The files P1-30 owns: spec/README.md, spec/CHANGELOG.md and every Markdown file in spec/core, spec/annex, spec/rfcs. */
export function specFiles(root) {
  const spec = resolve(root, "spec");
  const nested = SPEC_DIRS.flatMap((dir) => {
    const full = join(spec, dir);
    return existsSync(full) ? readdirSync(full).filter((name) => name.endsWith(".md")).sort().map((name) => join(full, name)) : [];
  });
  return [join(spec, "README.md"), join(spec, "CHANGELOG.md"), ...nested].filter((file) => existsSync(file));
}

/** The code's own exports: P1-07's level definitions and bands, P0-08's claim kinds, D-03's banned wording, P1-01's $ids,
 * P1-03's receipt transitions. */
export async function loadSources(root) {
  const dist = (path) => {
    const file = resolve(root, "dist", path);
    if (!existsSync(file)) throw new Error(`check-spec-sync: dist/${path} is missing: run npm run build first`);
    return import(pathToFileURL(file).href);
  };
  const { LEVEL_SEMANTICS, LEVEL_BANDS } = await dist("diagnostic/levelSemantics.js");
  const { CLAIM_KINDS } = await dist("claims/eligibility/types.js");
  const { ALLOWED_TRANSITIONS } = await dist("actions/receiptStates.js");
  const index = JSON.parse(readFileSync(resolve(root, "spec/schemas/index.json"), "utf8"));
  return {
    levels: LEVEL_SEMANTICS,
    bands: LEVEL_BANDS,
    claimKinds: CLAIM_KINDS,
    bannedPatterns: prohibitedTruthClaims,
    schemaIds: index.schemas.map((row) => row.$id),
    receiptTransitions: ALLOWED_TRANSITIONS
  };
}

const cell = (text) => String(text).replace(/\|/g, "/");

export function renderRegions(sources) {
  const bandOf = (level) => sources.bands[`L${level}`];
  return {
    levels: [
      "| Level | Name | Requires (each level includes every level below it) | Band of an averaged level |",
      "| --- | --- | --- | --- |",
      ...sources.levels.map(({ level, name, requires }) => {
        const band = bandOf(level);
        return `| L${level} | ${cell(name)} | ${cell(requires)} | ${band ? `${band[0]} to ${band[1]}` : "none"} |`;
      })
    ].join("\n"),
    "claim-kinds": sources.claimKinds.map((kind) => `- \`${kind}\``).join("\n"),
    "banned-wording": sources.bannedPatterns.map((pattern) => `- \`${String(pattern).replace(/`/g, "'")}\``).join("\n"),
    "schema-ids": sources.schemaIds.map((id) => `- \`${id}\``).join("\n"),
    "receipt-states": [
      "| From | Allowed next states |",
      "| --- | --- |",
      ...Object.entries(sources.receiptTransitions).map(([from, next]) =>
        `| ${from === "none" ? "(no receipt yet)" : `\`${from}\``} | ${next.length ? next.map((state) => `\`${state}\``).join(", ") : "none (terminal)"} |`)
    ].join("\n")
  };
}

/** The spec with every generated region rewritten from `sources`. */
function regenerate(text, regions) {
  return text.replace(REGION, (whole, name) =>
    name in regions ? `<!-- amc:spec:${name} -->\n${regions[name]}\n<!-- /amc:spec:${name} -->` : whole);
}

export function checkSpec(root, sources) {
  const regions = renderRegions(sources);
  const known = new Set(sources.schemaIds);
  const failures = [];
  const seen = new Set();
  const files = specFiles(root);
  if (files.length === 0) return ["spec/: no Core Spec files found (spec/README.md, spec/core/*.md)"];
  for (const file of files) {
    const rel = file.slice(resolve(root).length + 1);
    const text = readFileSync(file, "utf8");
    if (text.split("\n", 1)[0] !== SPEC_LICENCE_LINE) failures.push(`${rel}: first line must be ${SPEC_LICENCE_LINE}`);
    for (const match of text.matchAll(REGION)) {
      const name = match[1];
      seen.add(name);
      if (!(name in regions)) failures.push(`${rel}: unknown generated region amc:spec:${name}`);
      else if (regenerate(match[0], regions) !== match[0]) failures.push(`${rel}: amc:spec:${name} is stale: run node scripts/check-spec-sync.mjs --write`);
    }
    for (const id of text.match(ID_PATTERN) ?? []) {
      if (!known.has(id)) failures.push(`${rel}: cites ${id}, which spec/schemas/index.json does not list`);
    }
  }
  for (const name of REGION_NAMES) if (!seen.has(name)) failures.push(`spec/: generated region amc:spec:${name} is missing`);
  return failures;
}

export function writeSpec(root, sources) {
  const regions = renderRegions(sources);
  let changed = 0;
  for (const file of specFiles(root)) {
    const text = readFileSync(file, "utf8");
    const next = regenerate(text, regions);
    if (next !== text) {
      writeFileSync(file, next);
      changed += 1;
    }
  }
  return changed;
}

if (isEntrypoint(import.meta.url)) {
  const mode = process.argv[2];
  if (mode !== "--write" && mode !== "--check") {
    console.error("usage: node scripts/check-spec-sync.mjs --write|--check");
    process.exit(2);
  }
  const root = process.cwd();
  const sources = await loadSources(root);
  if (mode === "--write") {
    console.log(`check-spec-sync: rewrote ${writeSpec(root, sources)} spec file(s)`);
  }
  const failures = checkSpec(root, sources);
  if (failures.length > 0) {
    console.error(`check-spec-sync: ${failures.length} failure(s)`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(`check-spec-sync: ${specFiles(root).length} spec files in sync with the code`);
}
