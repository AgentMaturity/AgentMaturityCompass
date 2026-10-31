#!/usr/bin/env node
/**
 * P0-34: a tag may publish only a fully versioned candidate. Fails when package.json's version is not the first
 * `## ` heading of CHANGELOG.md, when that heading appears more than once, when changesets are still pending, or
 * when docs/releases/<version>.md is missing. release.yml runs it before publishing; release:prepare runs it last.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.mjs";

/** @param {{ version: string; changelog: string; changesetFiles: string[]; notesExist: boolean }} input */
export function checkReleaseCandidate({ version, changelog, changesetFiles, notesExist }) {
  const failures = [];
  const pending = changesetFiles.filter((file) => file.endsWith(".md") && file !== "README.md");
  if (pending.length) failures.push(`pending changesets in .changeset/: ${pending.join(", ")}`);
  const headings = [...changelog.matchAll(/^## \[?([^\]\s]+)/gm)].map((match) => match[1]);
  const first = headings[0] ?? "(none)";
  if (first !== version) failures.push(`CHANGELOG.md's first release heading is ${first}, package.json is ${version}`);
  const count = headings.filter((heading) => heading === version).length;
  if (count > 1) failures.push(`CHANGELOG.md has ${count} "## ${version}" headings; expected exactly one`);
  if (!notesExist) failures.push(`docs/releases/${version}.md is missing`);
  return failures;
}

export function readReleaseCandidate(root = process.cwd()) {
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return {
    version,
    changelog: readFileSync(join(root, "CHANGELOG.md"), "utf8"),
    changesetFiles: readdirSync(join(root, ".changeset")),
    notesExist: existsSync(join(root, "docs", "releases", `${version}.md`))
  };
}

if (isEntrypoint(import.meta.url)) {
  const candidate = readReleaseCandidate();
  const failures = checkReleaseCandidate(candidate);
  for (const failure of failures) console.error(`release candidate: ${failure}`);
  if (failures.length) process.exitCode = 1;
  else console.log(`Release candidate ${candidate.version}: one CHANGELOG heading, release notes present, no pending changesets.`);
}
