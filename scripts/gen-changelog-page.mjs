#!/usr/bin/env node
/**
 * Renders the newest CHANGELOG.md release into website/changelog.html.
 *
 * The page was hand-maintained, so every release broke
 * publicChangelogBrand.test.ts: the test requires an `<h2 id="release-x-y-z">`
 * matching package.json plus every bullet of the newest section, and cutting a
 * version satisfied neither until someone edited the HTML by hand. Same drift
 * shape as the counts and the API reference — a published claim kept true by
 * memory rather than by a generator.
 *
 * Only the newest entry is generated; older entries on the page are left alone
 * so previously published wording is never silently rewritten.
 *
 *   node scripts/gen-changelog-page.mjs           rewrite the page
 *   node scripts/gen-changelog-page.mjs --check   fail if it is stale
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const check = process.argv.includes("--check");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
const pagePath = join(root, "website", "changelog.html");
const page = readFileSync(pagePath, "utf8");

const version = pkg.version;
const slug = version.replaceAll(".", "-");
const anchor = version.replaceAll(".", "");

const sections = changelog.split(/^## /m);
const latestHeader = /^(\d+\.\d+\.\d+)/.exec(sections[1] ?? "")?.[1];
if (latestHeader !== version) {
  console.error(
    `changelog page: CHANGELOG.md newest entry is ${latestHeader ?? "(none)"}, package.json is ${version}.\n` +
      `  Run: npx changeset version`
  );
  process.exit(1);
}

const escape = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** `code` spans become <code>, matching the existing page's markup. */
const renderInline = (text) =>
  escape(text).replace(/`([^`]+)`/g, "<code>$1</code>");

const groupsFor = (section) => {
  const groups = [];
  // `\Z` is a Python anchor, not a JavaScript one — in JS it is a literal "Z",
  // so the final group in a section (usually Patch) never matched and its
  // bullets were silently dropped from the page. `(?![\s\S])` is end-of-input.
  for (const match of section.matchAll(/^### (.+?) Changes$\n([\s\S]*?)(?=^### |(?![\s\S]))/gm)) {
    const kind = match[1];
    const bullets = Array.from(match[2].matchAll(/^- (?:[a-f0-9]+: )?(.+)$/gm), (m) => m[1]);
    if (bullets.length > 0) groups.push({ kind, bullets });
  }
  return groups;
};

const groups = groupsFor(sections[1] ?? "");
if (groups.length === 0) {
  console.error(`changelog page: no change bullets found under ## ${version} in CHANGELOG.md`);
  process.exit(1);
}

const summary =
  groups.find((g) => g.kind === "Minor")?.bullets[0] ??
  groups[0].bullets[0];

const entry = `    <article class="release-entry" aria-labelledby="release-${slug}">
      <header class="release-header">
        <div>
          <p class="release-kicker">Current release</p>
          <h2 id="release-${slug}">${version}</h2>
        </div>
        <a class="release-source-link" href="https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/CHANGELOG.md#${anchor}" target="_blank" rel="noopener">Verify source entry</a>
      </header>

      <p class="release-summary">${renderInline(summary)}</p>
${groups
  .map(
    (group) => `
      <section class="change-group" aria-labelledby="release-${slug} ${group.kind.toLowerCase()}-changes-${slug}">
        <h3 id="${group.kind.toLowerCase()}-changes-${slug}">${group.kind} changes</h3>
        <ul>
${group.bullets.map((b) => `          <li>${renderInline(b)}</li>`).join("\n")}
        </ul>
      </section>`
  )
  .join("\n")}
    </article>`;

// Demote whatever currently claims to be the current release, then prepend.
const alreadyPublished = page.includes(`<h2 id="release-${slug}">`);
const demoted = page.replace(
  /<p class="release-kicker">Current release<\/p>/,
  '<p class="release-kicker">Previous release</p>'
);
const marker = '    <article class="release-entry"';
const at = demoted.indexOf(marker);
if (at === -1) {
  console.error("changelog page: could not find the first <article class=\"release-entry\"> to insert before.");
  process.exit(1);
}
const updated = alreadyPublished ? page : `${demoted.slice(0, at)}${entry}\n\n${demoted.slice(at)}`;

if (check) {
  const missing = [];
  if (!page.includes(`<h2 id="release-${slug}">${version}</h2>`)) {
    missing.push(`no <h2 id="release-${slug}"> section`);
  }
  // Compare what a reader sees: tags collapse to a space, entities decode, and
  // trailing punctuation rejoins the word before it. Checking the raw HTML
  // reported bullets containing `<controlId>` as missing when they render fine.
  const visible = page
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:)\]])(?=\s|$)/g, "$1")
    .replace(/([(\[])\s+/g, "$1")
    .trim();
  for (const group of groups) {
    for (const bullet of group.bullets) {
      if (!visible.includes(bullet.replaceAll("`", ""))) {
        missing.push(`bullet not on the page: ${bullet.slice(0, 60)}...`);
      }
    }
  }
  if (missing.length > 0) {
    console.error(
      `website/changelog.html is stale for ${version}:\n` +
        missing.map((m) => `  - ${m}`).join("\n") +
        `\n  Run: node scripts/gen-changelog-page.mjs`
    );
    process.exit(1);
  }
  console.log(`website/changelog.html is current for ${version}.`);
  process.exit(0);
}

writeFileSync(pagePath, updated);
console.log(
  alreadyPublished
    ? `website/changelog.html already carries ${version}.`
    : `website/changelog.html updated for ${version}.`
);
