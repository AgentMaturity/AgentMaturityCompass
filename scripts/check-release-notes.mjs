#!/usr/bin/env node
/**
 * P1-41: the claim-word check for published release notes.
 *
 *   node scripts/check-release-notes.mjs <notes.md>...
 *
 * Fails on any whole-word, case-insensitive use of a banned claim word, negated or not (truth rule 4 bans the word
 * itself in release notes), except inside inline code, so a removed string such as `Certified: Yes` can be quoted.
 * Stricter than the docs-drift rule (scripts/docs-drift-check.mjs), which lets a negated or quoted word pass.
 * CI runs it on docs/releases/*.md; release.yml runs it on the tag's notes before publishing.
 */
import { readFileSync } from "node:fs";
import { isEntrypoint } from "./lib/entrypoint.mjs";

export const BANNED_RELEASE_WORDS = [
  /\bcertified\b/i,
  /\bcertification[\s-]+read(?:y|iness)\b/i,
  /\bcompliant\b/i,
  /\bguaranteed\b/i,
  /\bexactly[\s-]+once\b/i,
  /(?<!\w)10[x×](?!\w)/i
];

/** @returns {{ line: number; word: string; context: string }[]} in line order */
export function findBannedWords(text, banned = BANNED_RELEASE_WORDS) {
  return text.split("\n").flatMap((line, index) => {
    const prose = line.replace(/`[^`]+`/g, (code) => " ".repeat(code.length));
    return banned.flatMap((pattern) => [...prose.matchAll(new RegExp(pattern.source, "gi"))])
      .sort((a, b) => a.index - b.index)
      .map((match) => ({ line: index + 1, word: match[0], context: line.trim() }));
  });
}

/** One message per banned word or unreadable file; empty means every file passed. */
export function checkReleaseNotesFiles(paths) {
  if (paths.length === 0) return ["no release notes file given"];
  return paths.flatMap((path) => {
    let text;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      return [`${path}: cannot read the release notes`];
    }
    return findBannedWords(text).map((hit) => `${path}:${hit.line}: banned claim word "${hit.word}": ${hit.context}`);
  });
}

if (isEntrypoint(import.meta.url)) {
  const paths = process.argv.slice(2);
  const failures = checkReleaseNotesFiles(paths);
  for (const failure of failures) console.error(failure);
  if (failures.length) process.exitCode = 1;
  else console.log(`Release notes claim words: ${paths.length} file(s) checked, none banned.`);
}
