#!/usr/bin/env node
/**
 * P0-11: checks the channel map and failure policy (docs/security/channel-map.json,
 * schema docs/security/channel-map.schema.json) against the repository.
 *
 *   node scripts/check-threat-model.mjs [map.json]
 *
 * Beyond the schema (status enum, owner keys, ASI01–ASI10 ids, relative paths):
 * ids are unique, every cited path exists, every symbol occurs in its file as a
 * whole identifier, every cited test exists, and every failure row names at
 * least one test or one owner. Paths resolve from the repository root. Exits 1
 * naming each offending entry.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020.js").default;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = join(ROOT, "docs/security/channel-map.schema.json");
const DEFAULT_MAP = join(ROOT, "docs/security/channel-map.json");

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole-identifier match, so `hostAllowed` does not vouch for `hostAllowedX`. */
const hasSymbol = (source, symbol) => new RegExp(`(?<![\\w$])${escape(symbol)}(?![\\w$])`).test(source);

/** `/channels/3/owners/0` -> "channel <id>", so a schema error names its entry. */
function entryFor(map, instancePath) {
  const [, list, index] = instancePath.split("/");
  const entry = Array.isArray(map?.[list]) ? map[list][Number(index)] : undefined;
  if (!entry) return "map";
  return `${list === "channels" ? "channel" : "failure"} ${entry.id ?? `#${index}`}`;
}

function checkThreatModel(map) {
  const validate = new Ajv2020({ allErrors: true, verbose: true }).compile(JSON.parse(readFileSync(SCHEMA, "utf8")));
  if (!validate(map)) {
    return validate.errors.map((error) =>
      `${entryFor(map, error.instancePath)}: ${error.instancePath || "/"} ${error.message} (got ${JSON.stringify(error.data)})`);
  }
  const errors = [];
  for (const [list, label] of [["channels", "channel"], ["failurePolicy", "failure"]]) {
    const seen = new Set();
    for (const { id } of map[list]) {
      if (seen.has(id)) errors.push(`${label} ${id}: duplicate id`);
      seen.add(id);
    }
  }
  for (const channel of map.channels) {
    for (const { path, symbol } of channel.enforcementPoints) {
      const file = join(ROOT, path);
      if (!existsSync(file)) {
        errors.push(`channel ${channel.id}: ${path} does not exist`);
        continue;
      }
      if (!hasSymbol(readFileSync(file, "utf8"), symbol)) {
        errors.push(`channel ${channel.id}: ${symbol} does not occur in ${path}`);
      }
    }
  }
  for (const row of map.failurePolicy) {
    for (const test of row.tests) {
      if (!existsSync(join(ROOT, test))) errors.push(`failure ${row.id}: test ${test} does not exist`);
    }
    if (row.tests.length === 0 && row.owners.length === 0) errors.push(`failure ${row.id}: names no test and no owner`);
  }
  return errors;
}

const mapPath = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_MAP;
let errors;
try {
  errors = checkThreatModel(JSON.parse(readFileSync(mapPath, "utf8")));
} catch (error) {
  errors = [`${mapPath}: ${error instanceof Error ? error.message : String(error)}`];
}
if (errors.length > 0) {
  for (const error of errors) console.error(`check-threat-model: ${error}`);
  process.exit(1);
}
console.log(`check-threat-model: ok (${mapPath})`);
