#!/usr/bin/env node
/**
 * P0-34: regenerate the two generated blocks of docs/releases/<version>.md from the pending .changeset/*.md, and
 * refuse notes whose "## Migration" section does not cite every breaking (major) changeset by name or that use a
 * banned claim word (D-03 vocabulary, scripts/docs-drift-check.mjs). Everything outside the blocks is hand-written.
 *
 *   npm run release:notes [-- --version X.Y.Z] [-- --check]
 *
 * The version defaults to the one `changeset version` gives from the last published release (plannedVersion).
 * Run it before the changesets are consumed; release:prepare does. With none pending, the notes are final and stay.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findTruthClaims } from "./docs-drift-check.mjs";
import { isEntrypoint } from "./lib/entrypoint.mjs";

const PACKAGE = "agent-maturity-compass";
const LEVELS = ["major", "minor", "patch"];

/** @returns {{ slug: string; level: "major" | "minor" | "patch"; body: string }[]} */
export function readChangesets(root) {
  const dir = join(root, ".changeset");
  return readdirSync(dir).filter((file) => file.endsWith(".md") && file !== "README.md").sort().map((file) => {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(readFileSync(join(dir, file), "utf8"));
    const level = match && new RegExp(`["']?${PACKAGE}["']?\\s*:\\s*["']?(major|minor|patch)\\b`).exec(match[1])?.[1];
    if (!level) throw new Error(`.changeset/${file} names no ${PACKAGE} bump in its front matter`);
    return { slug: file.slice(0, -3), level, body: match[2].trim() };
  });
}

export function bumpVersion(version, level) {
  const [major, minor, patch] = version.split(".").map(Number);
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** The last npm release, as website/publication-status.json records it (update that record when a release ships). */
export function publishedVersion(root) {
  const status = JSON.parse(readFileSync(join(root, "website", "publication-status.json"), "utf8"));
  const published = status.channels?.npm?.version;
  if (!/^\d+\.\d+\.\d+$/.test(published ?? "")) throw new Error("website/publication-status.json records no published npm version");
  return published;
}

/** The version the pending changesets give from the last published release. */
export function plannedVersion(root, changesets = readChangesets(root)) {
  const published = publishedVersion(root);
  const level = LEVELS.find((candidate) => changesets.some((changeset) => changeset.level === candidate)) ?? null;
  return { published, level, version: level ? bumpVersion(published, level) : null };
}

/** The changeset's first paragraph, cut at a sentence boundary near `max` characters. */
export function summaryOf(body, max) {
  const paragraph = body.split(/\n\s*\n/)[0].replace(/\s+/g, " ").trim().replace(/^- /, "")
    .replace(/^Breaking:\s*(\w?)/, (_, first) => first.toUpperCase());
  if (paragraph.length <= max) return paragraph;
  const sentences = paragraph.split(/(?<=[.!?])\s+(?=[A-Z`"(])/);
  let summary = sentences[0];
  for (const sentence of sentences.slice(1)) {
    if (summary.length + 1 + sentence.length > max) break;
    summary = `${summary} ${sentence}`;
  }
  return summary;
}

export function renderBlocks(changesets) {
  const list = (level, max) => {
    const lines = changesets.filter((changeset) => changeset.level === level)
      .map((changeset) => `- ${summaryOf(changeset.body, max)} (\`${changeset.slug}\`)`);
    return lines.length ? lines.join("\n") : "- None.";
  };
  const count = (level) => changesets.filter((changeset) => changeset.level === level).length;
  return {
    breaking: `This release consumes ${changesets.length} changesets: ${count("major")} breaking (major), ${count("minor")} minor`
      + ` and ${count("patch")} patch.\n\n${list("major", 600)}`,
    changes: `### New and changed behaviour\n\n${list("minor", 300)}\n\n### Fixes\n\n${list("patch", 300)}`
  };
}

export function applyBlocks(text, blocks) {
  let out = text;
  for (const [name, content] of Object.entries(blocks)) {
    const pattern = new RegExp(`<!-- release-notes:${name} -->[\\s\\S]*?<!-- /release-notes:${name} -->`);
    if (!pattern.test(out)) throw new Error(`release notes lack the <!-- release-notes:${name} --> block`);
    out = out.replace(pattern, () => `<!-- release-notes:${name} -->\n${content}\n<!-- /release-notes:${name} -->`);
  }
  return out;
}

/** Breaking changesets that the hand-written "## Migration" section does not name as `slug`. */
export function uncoveredBreaking(text, changesets) {
  const start = text.search(/^## Migration\b/m);
  const rest = start < 0 ? "" : text.slice(start + 1);
  const end = rest.search(/^## /m);
  const section = end < 0 ? rest : rest.slice(0, end);
  return changesets.filter((changeset) => changeset.level === "major" && !section.includes(`\`${changeset.slug}\``))
    .map((changeset) => changeset.slug);
}

export function generateReleaseNotes(root, version, changesets = readChangesets(root)) {
  const relative = `docs/releases/${version}.md`;
  const path = join(root, relative);
  if (!existsSync(path)) throw new Error(`${relative} is missing: write its hand-written sections first, as in docs/releases/2.0.0.md`);
  const before = readFileSync(path, "utf8");
  const after = applyBlocks(before, renderBlocks(changesets));
  const problems = [
    ...uncoveredBreaking(after, changesets).map((slug) => `breaking changeset \`${slug}\` is not cited in the Migration section`),
    ...findTruthClaims(relative, after).map((claim) => `line ${claim.line}: banned claim word "${claim.match}": ${claim.context}`)
  ];
  return { path, relative, before, after, problems };
}

if (isEntrypoint(import.meta.url)) {
  const root = process.cwd();
  const args = process.argv.slice(2);
  const changesets = readChangesets(root);
  if (changesets.length === 0) {
    console.log("No pending changesets: the release notes were generated before they were consumed and stay as they are.");
  } else {
    const at = args.indexOf("--version");
    const version = at >= 0 ? args[at + 1] : plannedVersion(root, changesets).version;
    const notes = generateReleaseNotes(root, version, changesets);
    for (const problem of notes.problems) console.error(`${notes.relative}: ${problem}`);
    if (args.includes("--check")) {
      if (notes.after !== notes.before) console.error(`${notes.relative} is stale: run npm run release:notes`);
      if (notes.after !== notes.before || notes.problems.length) process.exitCode = 1;
    } else {
      writeFileSync(notes.path, notes.after);
      console.log(`${notes.relative}: ${changesets.length} changesets rendered.`);
      if (notes.problems.length) process.exitCode = 1;
    }
  }
}
