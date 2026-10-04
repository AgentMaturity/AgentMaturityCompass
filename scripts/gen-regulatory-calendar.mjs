#!/usr/bin/env node
/**
 * Renders docs/REGULATORY_CALENDAR.md from the regulatory register
 * (GLOBAL_FRAMEWORKS and EU_AI_ACT_RISK_MATRIX in src/compliance/globalRegulatory.ts)
 * plus the curated, source-linked milestones in
 * docs/industries/_data/regulatory-milestones.json. The pure renderer lives in
 * scripts/lib/regulatoryCalendarRender.mjs.
 *
 * The source is loaded through tsx (already a devDependency) so the calendar
 * follows src, not a possibly stale dist/; dist/ is the fallback.
 *
 * Usage: node scripts/gen-regulatory-calendar.mjs [--check] [--data <register.json>] [--milestones <file.json>] [--out <file.md>]
 *   --check       exit 1 if the calendar differs from a fresh render (drift), 0 if equal
 *   --data        render a JSON register (an array, or {frameworks, euRiskMatrix?, milestones?}) instead of src;
 *                 milestones then come from that file (none if absent), not from the sidecar
 *   --milestones  curated milestones file (default docs/industries/_data/regulatory-milestones.json)
 *   --out         calendar path (default docs/REGULATORY_CALENDAR.md)
 * Exit 2 means the register or the milestones could not be loaded or are malformed
 * (including a milestone without an official source or retrievedAt).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MILESTONES_PATH, REGISTER_SRC, renderCalendar } from "./lib/regulatoryCalendarRender.mjs";

export { renderCalendar };

const REGISTER_DIST = "dist/compliance/globalRegulatory.js";
const DEFAULT_OUT = "docs/REGULATORY_CALENDAR.md";

/**
 * dist/ is used only when tsx itself is not installed. If tsx is present but
 * src fails to load, that error stands: falling back would let a stale build
 * pass --check while src is broken.
 */
async function loadRegister(root) {
  let tsImport;
  try {
    ({ tsImport } = await import("tsx/esm/api"));
  } catch {
    const built = join(root, REGISTER_DIST);
    if (!existsSync(built)) throw new Error(`tsx is not installed and ${REGISTER_DIST} is missing; run pnpm install or pnpm build`);
    const mod = await import(pathToFileURL(built).href);
    return { frameworks: mod.GLOBAL_FRAMEWORKS, euRiskMatrix: mod.EU_AI_ACT_RISK_MATRIX };
  }
  const mod = await tsImport(pathToFileURL(join(root, REGISTER_SRC)).href, import.meta.url);
  return { frameworks: mod.GLOBAL_FRAMEWORKS, euRiskMatrix: mod.EU_AI_ACT_RISK_MATRIX };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(args) {
  const root = process.cwd();
  const outPath = resolve(root, argValue(args, "--out") ?? DEFAULT_OUT);
  const dataPath = argValue(args, "--data");
  let next;
  try {
    let register;
    let milestones;
    if (dataPath) {
      const raw = readJson(resolve(root, dataPath));
      register = Array.isArray(raw) ? { frameworks: raw } : { frameworks: raw?.frameworks, euRiskMatrix: raw?.euRiskMatrix };
      milestones = Array.isArray(raw) ? [] : raw?.milestones ?? [];
    } else {
      register = await loadRegister(root);
      milestones = readJson(resolve(root, MILESTONES_PATH)).milestones;
    }
    const milestonesPath = argValue(args, "--milestones");
    if (milestonesPath) milestones = readJson(resolve(root, milestonesPath)).milestones;
    next = renderCalendar(register.frameworks, { euRiskMatrix: register.euRiskMatrix ?? [], milestones });
  } catch (error) {
    console.error(`gen-regulatory-calendar: ${error.message}`);
    return 2;
  }
  if (args.includes("--check")) {
    const current = existsSync(outPath) ? readFileSync(outPath, "utf8") : null;
    if (current !== next) {
      console.error(`${outPath} is stale or hand-edited. Run: node scripts/gen-regulatory-calendar.mjs`);
      return 1;
    }
    console.log(`Regulatory calendar matches the register (${outPath}).`);
    return 0;
  }
  writeFileSync(outPath, next);
  console.log(`Wrote ${outPath}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
