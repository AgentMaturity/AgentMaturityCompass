#!/usr/bin/env node
/**
 * Regenerates docs/AMC_QUESTION_BANK_FULL.json from the live question bank.
 *
 * The committed export was a hand-maintained snapshot holding 111 of the bank's
 * 244 questions while calling itself "FULL". Generating it removes the drift.
 *
 * Usage: node scripts/gen-question-bank-export.mjs [--check]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const outPath = join(root, "docs/AMC_QUESTION_BANK_FULL.json");
const built = join(root, "dist/diagnostic/questionBank.js");

if (!existsSync(built)) {
  console.error("dist/diagnostic/questionBank.js missing; run npm run build first.");
  process.exit(1);
}

const mod = await import(built);
const questions = Object.values(mod).find((v) => Array.isArray(v) && v.length > 100);
if (!questions) {
  console.error("Could not locate the question bank array in the built module.");
  process.exit(1);
}

const payload = {
  _comment:
    "Generated from src/diagnostic/questionBank.ts. Do not edit by hand; regenerate with: node scripts/gen-question-bank-export.mjs",
  generatedFrom: "src/diagnostic/questionBank.ts",
  questionCount: questions.length,
  questions
};
const next = `${JSON.stringify(payload, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = existsSync(outPath) ? readFileSync(outPath, "utf8") : "";
  if (current !== next) {
    console.error(
      `docs/AMC_QUESTION_BANK_FULL.json is stale (bank has ${questions.length} questions). ` +
        "Run: node scripts/gen-question-bank-export.mjs"
    );
    process.exit(1);
  }
  console.log(`Question bank export matches the bank (${questions.length} questions).`);
  process.exit(0);
}

writeFileSync(outPath, next);
console.log(`Wrote ${questions.length} questions to docs/AMC_QUESTION_BANK_FULL.json`);
