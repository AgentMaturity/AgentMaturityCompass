#!/usr/bin/env node
/**
 * Validates tracked qualification receipts: qualification/<YYYY-MM-DD>-<KEY>/
 * holds receipt.json (qualification/receipt.schema.json) and README.md.
 * Beyond the schema it checks the folder name, test totals, notes for failed
 * commands, artifact hashes, the 1 MB file limit and that no key material is
 * committed. An empty or missing root passes.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020.js").default;

const MAX_BYTES = 1_048_576;
const SCHEMA_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../qualification/receipt.schema.json");
const FORBIDDEN_NAME = /(\.pem|\.key|\.p12|\.amcvault)$|^\.env/;
const FOLDER = /^(\d{4}-\d{2}-\d{2})-(.+)$/;

let validateSchema;
function schemaValidator() {
  validateSchema ??= new Ajv2020({ allErrors: true }).compile(JSON.parse(readFileSync(SCHEMA_PATH, "utf8")));
  return validateSchema;
}

/** Dirents are lstat-based, so a symlink is never followed. */
function walk(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walk(join(dir, entry.name), relative) : [{ relative, symlink: entry.isSymbolicLink() }];
  });
}

/** Contents of a regular file, or null for anything else (missing, directory, symlink). */
function readRegular(path, encoding) {
  return existsSync(path) && lstatSync(path).isFile() ? readFileSync(path, encoding) : null;
}

/** A real calendar date: 2026-02-30 is not one. */
function isRealDate(date) {
  const time = Date.parse(`${date}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === date;
}

/** Size, symlink and secret rules apply to every file under the root. */
function checkFiles(dir, errors) {
  for (const { relative, symlink } of walk(dir)) {
    if (symlink) {
      errors.push(`${relative}: symlinks are not allowed; commit the file itself.`);
      continue;
    }
    const path = join(dir, relative);
    const name = posix.basename(relative);
    const size = lstatSync(path).size;
    if (size > MAX_BYTES) errors.push(`${relative}: ${size} bytes exceeds the ${MAX_BYTES}-byte limit; summarise the log and keep its hash.`);
    if (FORBIDDEN_NAME.test(name)) errors.push(`${relative}: key, credential and vault files (${name}) must not be committed.`);
    else if (size <= MAX_BYTES && readFileSync(path, "utf8").includes("PRIVATE KEY-----")) {
      errors.push(`${relative}: contains private key material.`);
    }
  }
}

function checkReceipt(dir, folder, errors) {
  const prefix = (message) => { errors.push(`${folder}: ${message}`); };
  const match = FOLDER.exec(folder);
  if (!match) return prefix("folder name must be <YYYY-MM-DD>-<KEY>.");
  const readme = readRegular(join(dir, folder, "README.md"), "utf8");
  if (readme === null || readme.trim() === "") prefix("README.md is missing or empty.");
  const receiptText = readRegular(join(dir, folder, "receipt.json"), "utf8");
  if (receiptText === null) return prefix("receipt.json is missing.");
  let receipt;
  try {
    receipt = JSON.parse(receiptText);
  } catch (error) {
    return prefix(`receipt.json is not valid JSON (${error.message}).`);
  }
  const validate = schemaValidator();
  if (!validate(receipt)) {
    for (const issue of validate.errors) {
      const extra = issue.params?.additionalProperty ? ` (${issue.params.additionalProperty})` : "";
      prefix(`receipt.json${issue.instancePath} ${issue.message}${extra}.`);
    }
    return undefined;
  }
  if (!isRealDate(receipt.date)) prefix(`receipt date ${receipt.date} is not a real date.`);
  if (receipt.date !== match[1]) prefix(`folder date ${match[1]} differs from receipt date ${receipt.date}.`);
  if (receipt.key !== match[2]) prefix(`folder key ${match[2]} differs from receipt key ${receipt.key}.`);
  const { tests } = receipt;
  if (tests && tests.passed + tests.failed + tests.skipped !== tests.total) {
    prefix(`tests: passed + failed + skipped (${tests.passed + tests.failed + tests.skipped}) differs from total ${tests.total}.`);
  }
  if (receipt.commands.some((command) => command.exit !== 0) && receipt.notes.trim() === "") {
    prefix("a command exited non-zero; explain it in notes.");
  }
  for (const artifact of receipt.artifacts) {
    const normalized = posix.normalize(artifact.path);
    // Backslashes and drive letters are separators or roots on Windows only; reject them everywhere.
    if (/\\|^[A-Za-z]:/.test(artifact.path) || posix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../")) {
      prefix(`artifact ${artifact.path} must be inside the folder.`);
      continue;
    }
    const path = join(dir, folder, normalized);
    if (!lstatSync(path, { throwIfNoEntry: false })) {
      prefix(`artifact ${artifact.path} is missing.`);
      continue;
    }
    const content = readRegular(path);
    if (content === null) {
      prefix(`artifact ${artifact.path} must be a regular file, not a directory or symlink.`);
      continue;
    }
    const actual = createHash("sha256").update(content).digest("hex");
    if (actual !== artifact.sha256) prefix(`artifact ${artifact.path} sha256 is ${actual}, receipt says ${artifact.sha256}.`);
  }
  return receipt;
}

/** @returns {{ ok: boolean; receipts: object[]; errors: string[] }} */
export function validateQualificationDir(dir) {
  const errors = [];
  const receipts = [];
  if (!existsSync(dir)) return { ok: true, receipts, errors };
  checkFiles(dir, errors);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const receipt = checkReceipt(dir, entry.name, errors);
    if (receipt) receipts.push(receipt);
  }
  return { ok: errors.length === 0, receipts, errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const index = args.indexOf("--root");
  const root = index === -1 ? "qualification" : args[index + 1];
  if (!root) {
    console.error("--root needs a directory.");
    process.exit(1);
  }
  const result = validateQualificationDir(root);
  for (const error of result.errors) console.error(error);
  console.log(result.ok
    ? `Qualification receipts valid: ${result.receipts.length} receipt(s) under ${root}.`
    : `Qualification receipts invalid: ${result.errors.length} problem(s).`);
  process.exit(result.ok ? 0 : 1);
}
