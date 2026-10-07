#!/usr/bin/env node
/**
 * P1-07: every requirement of an evaluated diagnostic gate must be producible by a registered, non-synthetic emitter.
 *
 * Fails when:
 *  - a registry entry's module is missing, lacks the literal it claims to write, lives in the dogfood seeder, is
 *    synthetic, or is an importer that is not self_reported;
 *  - a literal `auditType` emission in src/ has neither a registry entry nor a NON_MATURITY_AUDIT_MODULES line;
 *  - an evidence map names an unknown question or an unregistered, non-observed or wrong-level emitter;
 *  - an evaluated gate names an event type, audit type or metric key no admissible emitter writes, carries a
 *    keyword, meta-key or artifact-pattern requirement, admits SELF_REPORTED above L1, or evaluates L4 or L5.
 *
 * Prints, per level, how many questions are reachable, capped (evaluable but blocked by a lower level that is not)
 * and not evaluable. Reads the built modules: run `npm run build` first.
 *
 * Usage: node scripts/check-gate-reachability.mjs
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const dist = (path) => pathToFileURL(join(root, "dist", path)).href;
if (!existsSync(join(root, "dist/diagnostic/evidenceEmitters.js"))) {
  console.error("dist/diagnostic/evidenceEmitters.js missing; run npm run build first.");
  process.exit(1);
}

const { EVIDENCE_EMITTERS, NON_MATURITY_AUDIT_MODULES } = await import(dist("diagnostic/evidenceEmitters.js"));
const { EVIDENCE_MAPS, NOT_YET_EVIDENCEABLE } = await import(dist("diagnostic/evidenceMaps/index.js"));
const { getQuestionSet } = await import(dist("diagnostic/questionSets.js"));

const failures = [];
const fail = (message) => failures.push(message);

// 1. Registry truth.
const ids = new Set();
for (const entry of EVIDENCE_EMITTERS) {
  if (ids.has(entry.id)) fail(`duplicate emitter id ${entry.id}`);
  ids.add(entry.id);
  if (entry.module.startsWith("src/dogfood/")) fail(`${entry.id}: the dogfood seeder is never an emitter`);
  if (entry.claimKind === "synthetic_example") fail(`${entry.id}: synthetic emitters cannot evidence a level`);
  if (/import|ingest/i.test(entry.module) && entry.claimKind !== "self_reported") fail(`${entry.id}: importers are self_reported`);
  if (entry.levelUse.length === 0) fail(`${entry.id}: levelUse is empty`);
  const path = join(root, entry.module);
  const literal = `"${entry.auditType ?? entry.metricKey ?? entry.eventType}"`;
  if (!existsSync(path)) fail(`${entry.id}: module ${entry.module} does not exist`);
  else if (!readFileSync(path, "utf8").includes(literal)) fail(`${entry.id}: ${entry.module} never writes ${literal}`);
}

// 2. Every literal audit emission is registered or classified as non-maturity.
const registeredAuditTypes = new Set(EVIDENCE_EMITTERS.flatMap((entry) => (entry.auditType ? [entry.auditType] : [])));
const nonMaturityModules = new Set(NON_MATURITY_AUDIT_MODULES.map((row) => row.module));
for (const row of NON_MATURITY_AUDIT_MODULES) {
  if (!existsSync(join(root, row.module))) fail(`NON_MATURITY_AUDIT_MODULES names missing module ${row.module}`);
  if (!row.why || row.why.length < 10) fail(`NON_MATURITY_AUDIT_MODULES ${row.module} says no reason`);
}
const SKIP = new Set(["src/diagnostic/questionBank.ts", "src/diagnostic/evidenceEmitters.ts"]);
function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (entry.name.endsWith(".ts")) out.push(relative(root, full).split("\\").join("/"));
  }
  return out;
}
let auditLiterals = 0;
for (const file of sourceFiles(join(root, "src"))) {
  if (SKIP.has(file) || file.startsWith("src/dogfood/") || file.startsWith("src/diagnostic/evidenceMaps/")) continue;
  for (const match of readFileSync(join(root, file), "utf8").matchAll(/auditType\s*[:=]\s*"([A-Z0-9_]+)"/g)) {
    auditLiterals += 1;
    if (!registeredAuditTypes.has(match[1]) && !nonMaturityModules.has(file)) {
      fail(`${file} emits auditType ${match[1]} with no registry entry and no NON_MATURITY_AUDIT_MODULES line`);
    }
  }
}

// 3. Evidence maps name real questions and admissible emitters.
const lifecycle = getQuestionSet({ version: "lifecycle" }).questions;
const known = new Set(lifecycle.map((question) => question.id));
const emitterById = new Map(EVIDENCE_EMITTERS.map((entry) => [entry.id, entry]));
for (const map of EVIDENCE_MAPS) {
  if (!known.has(map.questionId)) fail(`evidence map names unknown question ${map.questionId}`);
  if (!map.because || map.because.length < 40) fail(`evidence map ${map.questionId} has no checkable because`);
  for (const [level, list] of [["L2", map.l2], ["L3", map.l3]]) {
    for (const id of list) {
      const entry = emitterById.get(id);
      if (!entry) fail(`${map.questionId} ${level} names unregistered emitter ${id}`);
      else if (entry.claimKind !== "observed") fail(`${map.questionId} ${level} names ${id}, which is ${entry.claimKind}`);
      else if (!entry.levelUse.includes(level)) fail(`${map.questionId} ${level} names ${id}, whose levelUse excludes ${level}`);
    }
  }
}
for (const row of NOT_YET_EVIDENCEABLE) {
  if (!known.has(row.questionId)) fail(`NOT_YET_EVIDENCEABLE names unknown question ${row.questionId}`);
}

// 4. Every requirement of every evaluated gate has an admissible emitter.
let requirements = 0;
const admissible = (level, predicate) =>
  EVIDENCE_EMITTERS.some((entry) => predicate(entry) && entry.levelUse.includes(level) && entry.claimKind !== "synthetic_example");
for (const question of lifecycle) {
  for (const gate of question.gates) {
    if (gate.level === 0 || gate.notEvaluated) continue;
    const level = `L${gate.level}`;
    const where = `${question.id} ${level}`;
    if (gate.level >= 4) fail(`${where} is evaluated; L4 and L5 stay not_evaluated until their emitters exist`);
    if (gate.level >= 2 && (gate.acceptedTrustTiers ?? []).includes("SELF_REPORTED")) fail(`${where} admits SELF_REPORTED`);
    for (const key of ["textRegex", "metaKeys", "artifactPatterns"]) {
      if ((gate.mustInclude[key] ?? []).length > 0) fail(`${where} requires ${key}, which no emitter registers (keyword and field matches never count)`);
    }
    for (const type of gate.requiredEvidenceTypes) {
      requirements += 1;
      if (!admissible(level, (entry) => entry.eventType === type)) fail(`${where} requires event type ${type} with no admissible emitter`);
    }
    for (const auditType of gate.mustInclude.auditTypes ?? []) {
      requirements += 1;
      if (!admissible(level, (entry) => entry.auditType === auditType)) fail(`${where} requires auditType ${auditType} with no admissible emitter`);
    }
    for (const metricKey of gate.mustInclude.metricKeys ?? []) {
      requirements += 1;
      if (!admissible(level, (entry) => entry.metricKey === metricKey)) fail(`${where} requires metricKey ${metricKey} with no admissible emitter`);
    }
  }
}

// 5. The reachability table.
function table(title, questions) {
  console.log(`\n${title} (${questions.length} questions)`);
  console.log("| Level | Reachable | Capped | Not evaluable |");
  console.log("|---|---:|---:|---:|");
  for (let level = 1; level <= 5; level += 1) {
    let reachable = 0;
    let capped = 0;
    let notEvaluable = 0;
    for (const question of questions) {
      if (question.gates[level].notEvaluated) notEvaluable += 1;
      else if (question.gates.slice(1, level).some((gate) => gate.notEvaluated)) capped += 1;
      else reachable += 1;
    }
    console.log(`| L${level} | ${reachable} | ${capped} | ${notEvaluable} |`);
  }
}
table("Default bank (amc-legacy-240-v1)", getQuestionSet().questions);
table("Lifecycle set (amc-lifecycle-2026-v1)", lifecycle);
console.log(`\n${EVIDENCE_EMITTERS.length} registered emitters, ${EVIDENCE_MAPS.length} evidence maps, ${auditLiterals} literal audit emissions classified, ${requirements} evaluated gate requirements checked.`);

if (failures.length > 0) {
  console.error(`\ncheck:gates failed with ${failures.length} problem(s):`);
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}
console.log("check:gates: every evaluated gate requirement has a registered, non-synthetic emitter.");
