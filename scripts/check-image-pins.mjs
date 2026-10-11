#!/usr/bin/env node
/**
 * Image pin check (P0-35). Every image AMC builds must start from a base pinned by digest, so the same source
 * cannot produce a different image when an upstream tag moves.
 *
 * Scans `Dockerfile`, `docker/*Dockerfile*` and `deploy/**\/Dockerfile*`. Fails on:
 * - a `FROM` image without `@sha256:<64 lowercase hex>`; a previous stage name and `scratch` pass;
 * - `FROM ${VAR}` / `FROM $VAR` unless `ARG VAR=<default>` is declared and pinned;
 * - an `ARG *_IMAGE=<default>` or `# syntax=<frontend>` that is not pinned;
 * - `docker/Dockerfile.quickstart` without a `sha256sum -c` tarball check outside comments;
 * - a tree with no Dockerfile at all (fail closed).
 *
 * Usage: node scripts/check-image-pins.mjs [--root <dir>]
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isEntrypoint } from "./lib/entrypoint.mjs";

const PINNED = /@sha256:[a-f0-9]{64}$/;
const VARIABLE = /^\$\{?(\w+)\}?$/;
const NOT_PINNED = "is not pinned by @sha256:<64 hex>";
const QUICKSTART = "docker/Dockerfile.quickstart";

function dockerfiles(root) {
  const found = [];
  if (existsSync(join(root, "Dockerfile"))) found.push("Dockerfile");
  for (const [dir, recursive] of [["docker", false], ["deploy", true]]) {
    if (!existsSync(join(root, dir))) continue;
    for (const entry of readdirSync(join(root, dir), { recursive, withFileTypes: true })) {
      const ok = entry.isFile() && (recursive ? entry.name.startsWith("Dockerfile") : entry.name.includes("Dockerfile"));
      if (ok) found.push(relative(root, join(entry.parentPath ?? entry.path, entry.name)).split("\\").join("/"));
    }
  }
  return found.sort();
}

/** Findings for one Dockerfile's text; `file` only labels them. */
export function findUnpinned(text, file) {
  const errors = [];
  const args = new Map();
  const stages = new Set(["scratch"]);
  // Join continuation lines but keep the first line's number for each instruction.
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    let line = lines[i].trim();
    while (line.endsWith("\\") && i + 1 < lines.length) line = `${line.slice(0, -1).trim()} ${lines[++i].trim()}`;
    const syntax = /^#\s*syntax\s*=\s*(\S+)/i.exec(line);
    if (syntax && !PINNED.test(syntax[1])) errors.push(`${file}:${lineNo} # syntax=${syntax[1]} ${NOT_PINNED}`);
    const arg = /^ARG\s+(\w+)(?:=(\S*))?/i.exec(line);
    if (arg) {
      const value = arg[2]?.replace(/^(["'])(.*)\1$/, "$2");
      args.set(arg[1], value);
      if (arg[1].endsWith("_IMAGE") && value !== undefined && !PINNED.test(value)) {
        errors.push(`${file}:${lineNo} ARG ${arg[1]} default ${value} ${NOT_PINNED}`);
      }
    }
    const from = /^FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/i.exec(line);
    if (!from) continue;
    const image = from[1];
    const variable = VARIABLE.exec(image)?.[1];
    if (variable) {
      const value = args.get(variable);
      if (!value) errors.push(`${file}:${lineNo} FROM ${image} has no pinned ARG default`);
      else if (!PINNED.test(value)) errors.push(`${file}:${lineNo} FROM ${image} resolves to ${value}, which ${NOT_PINNED}`);
    } else if (!stages.has(image.toLowerCase()) && !PINNED.test(image)) {
      errors.push(`${file}:${lineNo} FROM ${image} ${NOT_PINNED}`);
    }
    if (from[2]) stages.add(from[2].toLowerCase());
  }
  return errors;
}

/** Scans the tree at `root`; returns the files checked and every finding. */
export function checkImagePins(root) {
  const files = dockerfiles(root);
  if (files.length === 0) return { files, errors: ["no Dockerfile found to check"] };
  const errors = [];
  for (const file of files) {
    const text = readFileSync(join(root, file), "utf8");
    errors.push(...findUnpinned(text, file));
    const code = text.split("\n").filter((line) => !line.trim().startsWith("#")).join("\n");
    if (file === QUICKSTART && !/\bsha256sum\s+-c\b/.test(code)) {
      errors.push(`${QUICKSTART} does not verify its tarball with sha256sum -c`);
    }
  }
  return { files, errors };
}

if (isEntrypoint(import.meta.url)) {
  const argv = process.argv.slice(2);
  const rootIndex = argv.indexOf("--root");
  if (argv.length !== (rootIndex >= 0 ? 2 : 0) || (rootIndex >= 0 && !argv[rootIndex + 1])) {
    console.error("usage: node scripts/check-image-pins.mjs [--root <dir>]");
    process.exit(2);
  }
  const root = rootIndex >= 0 ? resolve(argv[rootIndex + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const { files, errors } = checkImagePins(root);
  for (const error of errors) console.error(error);
  console.log(`image-pins: files=${files.length} errors=${errors.length}`);
  process.exitCode = errors.length > 0 ? 1 : 0;
}
