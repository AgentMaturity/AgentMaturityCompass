#!/usr/bin/env node
/**
 * P0-34: the one release-preparation command. It never publishes, tags, commits or pushes.
 *
 *   npm run release:prepare -- 2.0.0
 *     1. With pending changesets: refuse unless they give 2.0.0 from the last published version
 *        (website/publication-status.json); regenerate docs/releases/2.0.0.md from them (refusing a missing
 *        migration item or a banned claim word); set package.json to the published version and run
 *        `changeset version`, so it never versions on top of the unpublished 1.2.0.
 *     2. Fold CHANGELOG sections of never-published versions (1.2.0) into the release section: one heading.
 *     3. Sync the version-coupled files (install channel, Helm appVersion, "<version> source" prose, the
 *        changelog page and sbom.json), build, and run check-release-candidate.
 *     4. Dry runs: check-pack-contents (listing and secret scan), `npm publish --dry-run` (its prepack runs the
 *        full release gate) and the packed-install check.
 *   node scripts/release-prepare.mjs --version-only [X.Y.Z]
 *     Steps 1 to 3 only; npm-publish.yml's version PR runs this.
 *
 * Idempotent: once versioned there is nothing pending, so a rerun rewrites nothing that is current and repeats
 * steps 3 and 4.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.mjs";
import { generateReleaseNotes, plannedVersion, publishedVersion, readChangesets } from "./release-notes.mjs";

const GROUP_ORDER = ["Major Changes", "Minor Changes", "Patch Changes"];
const SOURCE_PROSE = ["docs/GETTING_STARTED.md", "docs/INSTALL.md", "docs/NATIVE_AGENT_WORKFLOW.md", "website/install-channel.json"];

const headingOf = (part) => /^## \[?([^\]\s]+)/.exec(part)?.[1];

/** Merge the `### ` groups of sections between `## <target>` and `## <published>` into the target section. */
export function foldChangelog(text, target, published) {
  const parts = text.split(/^(?=## )/m);
  if (headingOf(parts[1] ?? "") !== target) {
    throw new Error(`CHANGELOG.md's first release is ${headingOf(parts[1] ?? "") ?? "(none)"}, expected ${target}`);
  }
  const end = parts.findIndex((part, index) => index > 1 && headingOf(part) === published);
  const folded = end < 0 ? [] : parts.slice(2, end);
  if (folded.length === 0) return { text, versions: [] };
  const groups = new Map();
  for (const section of [parts[1], ...folded]) {
    const [lead, ...subsections] = section.split(/^(?=### )/m);
    if (lead.replace(/^## .*$/m, "").trim()) throw new Error(`CHANGELOG.md ## ${headingOf(section)} has text outside a ### group`);
    for (const subsection of subsections) {
      const title = subsection.slice(4, subsection.indexOf("\n")).trim();
      const body = subsection.slice(subsection.indexOf("\n") + 1).trim();
      groups.set(title, [...(groups.get(title) ?? []), ...(body ? [body] : [])]);
    }
  }
  const rank = (title) => (GROUP_ORDER.includes(title) ? GROUP_ORDER.indexOf(title) : GROUP_ORDER.length);
  const titles = [...groups.keys()].sort((a, b) => rank(a) - rank(b));
  const merged = `## ${target}\n\n${titles.map((title) => `### ${title}\n\n${groups.get(title).join("\n")}\n`).join("\n")}\n`;
  return { text: `${parts[0]}${merged}${parts.slice(end).join("")}`, versions: folded.map(headingOf) };
}

/** Prose that names the source version ("**1.2.0 source**", "current 1.2.0 source package") follows the release. */
export function syncVersionText(text, version) {
  return text.replace(/\b\d+\.\d+\.\d+(?=(?:\*\*)? source\b)/g, version);
}

/** Changelog page entries for versions CHANGELOG.md no longer lists (folded, never published) are removed. */
export function dropUnlistedPageEntries(page, versions) {
  return page.replace(/ {4}<article class="release-entry" aria-labelledby="release-(\d+-\d+-\d+)">[\s\S]*?<\/article>\n\n?/g,
    (entry, slug) => (versions.includes(slug.replaceAll("-", ".")) ? entry : ""));
}

function rewrite(root, path, transform) {
  const full = join(root, path);
  if (!existsSync(full)) return false;
  const before = readFileSync(full, "utf8");
  const after = transform(before);
  if (after !== before) writeFileSync(full, after);
  return after !== before;
}

function defaultRun(root) {
  return (command, args) => {
    const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
    if (result.status !== 0) throw new Error(`${[command, ...args].join(" ")} failed (exit ${result.status ?? result.signal})`);
  };
}

/** @param {{ root?: string; version?: string; versionOnly?: boolean; run?: (command: string, args: string[]) => void; log?: (line: string) => void }} options */
export function prepareRelease({ root = process.cwd(), version, versionOnly = false, run = defaultRun(root), log = console.log } = {}) {
  const changesets = readChangesets(root);
  const packagePath = join(root, "package.json");
  const node = (...args) => run(process.execPath, args);
  let target = version;
  if (changesets.length > 0) {
    const plan = plannedVersion(root, changesets);
    target ??= plan.version;
    if (plan.version !== target) {
      throw new Error(`the pending changesets give ${plan.version} (${plan.level} from the published ${plan.published}), not ${target}`);
    }
    const notes = generateReleaseNotes(root, target, changesets);
    if (notes.problems.length) throw new Error(`${notes.relative}: ${notes.problems.join("; ")}`);
    writeFileSync(notes.path, notes.after);
    log(`${notes.relative}: regenerated from ${changesets.length} changesets.`);
    rewrite(root, "package.json", (text) => text.replace(/("version":\s*")[^"]+(")/, `$1${plan.published}$2`));
    run(join(root, "node_modules", ".bin", "changeset"), ["version"]);
    const versioned = JSON.parse(readFileSync(packagePath, "utf8")).version;
    if (versioned !== target) throw new Error(`changeset version produced ${versioned}, expected ${target}`);
  } else {
    const current = JSON.parse(readFileSync(packagePath, "utf8")).version;
    if (!target || current !== target) throw new Error(`no pending changesets, and package.json is ${current}, not ${target ?? "(no target given)"}`);
    log(`No pending changesets: ${target} is already versioned; the notes stay as generated.`);
  }

  const fold = foldChangelog(readFileSync(join(root, "CHANGELOG.md"), "utf8"), target, publishedVersion(root));
  if (fold.versions.length) {
    writeFileSync(join(root, "CHANGELOG.md"), fold.text);
    log(`CHANGELOG.md: folded never-published ${fold.versions.join(", ")} into ${target}.`);
  }
  const listed = [...readFileSync(join(root, "CHANGELOG.md"), "utf8").matchAll(/^## \[?(\d+\.\d+\.\d+)/gm)].map((match) => match[1]);
  rewrite(root, "website/changelog.html", (page) => dropUnlistedPageEntries(page, listed));
  rewrite(root, "website/install-channel.json", (text) => text.replace(/("packageVersion":\s*")[^"]+(")/, `$1${target}$2`));
  rewrite(root, "deploy/helm/amc/Chart.yaml", (text) => text.replace(/^appVersion: .*$/m, `appVersion: "${target}"`));
  for (const path of SOURCE_PROSE) rewrite(root, path, (text) => syncVersionText(text, target));

  run("npm", ["run", "build"]);
  const sbomPath = join(root, "sbom.json");
  const sbomVersion = existsSync(sbomPath) ? JSON.parse(readFileSync(sbomPath, "utf8"))?.metadata?.component?.version : null;
  if (sbomVersion !== target) node("dist/cli.js", "release", "sbom", "--out", "sbom.json");
  node("scripts/gen-changelog-page.mjs");
  node("scripts/check-release-candidate.mjs");
  if (versionOnly) return target;

  node("scripts/check-pack-contents.mjs");
  run("npm", ["publish", "--dry-run"]);
  node("scripts/packed-install-check.mjs", "--no-build");
  log(`Release ${target} is prepared and its dry runs passed. Review and commit the result, then follow docs/RELEASE_RUNBOOK.md;`
    + ` publishing is the v${target} tag push that runs release.yml (P0-39).`);
  return target;
}

if (isEntrypoint(import.meta.url)) {
  const args = process.argv.slice(2);
  const version = args.find((arg) => !arg.startsWith("--"));
  if (version !== undefined && !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`release:prepare: "${version}" is not a release version (X.Y.Z)`);
    process.exit(2);
  }
  if (version === undefined && !args.includes("--version-only")) {
    console.error("usage: npm run release:prepare -- <X.Y.Z>   (or --version-only [X.Y.Z])");
    process.exit(2);
  }
  try {
    prepareRelease({ version, versionOnly: args.includes("--version-only") });
  } catch (error) {
    console.error(`release:prepare: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
