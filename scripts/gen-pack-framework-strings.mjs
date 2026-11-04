#!/usr/bin/env node
/**
 * P1-45: regenerate tests/fixtures/packFrameworkStrings.unresolved.json, the distinct industry-pack
 * complianceFrameworks strings that classifyFrameworkString cannot resolve to a built-in family.
 * tests/packFrameworkAliases.test.ts fails when the packs and the fixture disagree. Build first: it reads dist/.
 *
 * Usage: node scripts/gen-pack-framework-strings.mjs [--check]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(root, "tests/fixtures/packFrameworkStrings.unresolved.json");
const check = process.argv.includes("--check");
const unknown = process.argv.slice(2).filter((arg) => arg !== "--check");
if (unknown.length > 0) {
  console.error(`unknown argument ${JSON.stringify(unknown[0])}; usage: node scripts/gen-pack-framework-strings.mjs [--check]`);
  process.exit(2);
}

async function dist(rel) {
  const path = join(root, "dist", rel);
  if (!existsSync(path)) throw new Error(`Build first: dist/${rel} not found (npm run build).`);
  return import(pathToFileURL(path).href);
}

const { listIndustryPacks } = await dist("domains/industryPacks.js");
const { classifyFrameworkString } = await dist("compliance/frameworks.js");
const strings = [...new Set(listIndustryPacks().flatMap((pack) => pack.complianceFrameworks))]
  .filter((value) => classifyFrameworkString(value).framework === null)
  .sort();
const previous = JSON.parse(readFileSync(FIXTURE, "utf8"));
const next = { ...previous, strings };
const text = `${JSON.stringify(next, null, 2)}\n`;
const added = strings.filter((value) => !previous.strings.includes(value));
const removed = previous.strings.filter((value) => !strings.includes(value));
console.log(`pack framework strings: ${strings.length} unresolved; +${added.length} -${removed.length}`);
for (const value of added) console.log(`  + ${value} (${classifyFrameworkString(value).reason})`);
for (const value of removed) console.log(`  - ${value}`);
if (check) process.exit(text === readFileSync(FIXTURE, "utf8") ? 0 : 1);
writeFileSync(FIXTURE, text);
