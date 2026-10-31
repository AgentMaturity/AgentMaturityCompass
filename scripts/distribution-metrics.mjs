#!/usr/bin/env node
/**
 * P1-41: the weekly distribution figure for P0-41's Monday status, read from public endpoints without credentials.
 *
 *   node scripts/distribution-metrics.mjs [--write]
 *
 * Prints one dated markdown row:
 *   | Date | npm downloads, last week | GitHub release asset downloads, cumulative |
 * npm's figure is its last-week point count; GitHub's download_count is cumulative since each asset was uploaded. A
 * figure that cannot be read is "not measured (<reason>)", never a number, and the exit code is then 1. With --write
 * the entry (recorded at this machine's clock) is appended to docs/program/distribution-metrics.json, also when a figure
 * is not measured. PyPI is not read: the Python SDK is held per D-12.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.mjs";
import { getPublicJson } from "./lib/publicJson.mjs";

export const NPM_LAST_WEEK = "https://api.npmjs.org/downloads/point/last-week/agent-maturity-compass";
export const GITHUB_RELEASES = "https://api.github.com/repos/AgentMaturity/AgentMaturityCompass/releases";
const PER_PAGE = 100;
const METRICS_FILE = join("docs", "program", "distribution-metrics.json");
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const notMeasured = (reason, source) => ({ status: "not measured", reason, source });

async function npmLastWeek(fetchImpl) {
  const reply = await getPublicJson(fetchImpl, NPM_LAST_WEEK);
  if (!reply.ok) return notMeasured(reply.reason, NPM_LAST_WEEK);
  const { downloads, start, end } = reply.body ?? {};
  if (!count(downloads) || !DAY.test(start ?? "") || !DAY.test(end ?? "")) return notMeasured("unexpected response", NPM_LAST_WEEK);
  return { status: "measured", downloadsLastWeek: downloads, start, end, source: NPM_LAST_WEEK };
}

async function githubReleaseAssets(fetchImpl) {
  const releases = [];
  for (let page = 1; ; page += 1) {
    const reply = await getPublicJson(fetchImpl, `${GITHUB_RELEASES}?per_page=${PER_PAGE}&page=${page}`);
    if (!reply.ok) return notMeasured(reply.reason, GITHUB_RELEASES);
    if (!Array.isArray(reply.body)) return notMeasured("unexpected response", GITHUB_RELEASES);
    for (const release of reply.body) {
      const assets = release?.assets;
      if (typeof release?.tag_name !== "string" || !Array.isArray(assets) || !assets.every((asset) => count(asset?.download_count))) {
        return notMeasured("unexpected response", GITHUB_RELEASES);
      }
      releases.push({ tag: release.tag_name, downloads: assets.reduce((sum, asset) => sum + asset.download_count, 0) });
    }
    if (reply.body.length < PER_PAGE) break;
  }
  const total = releases.reduce((sum, release) => sum + release.downloads, 0);
  return { status: "measured", cumulative: true, total, releases, source: GITHUB_RELEASES };
}

const cell = (figure, measured) => (figure.status === "measured" ? measured(figure) : `not measured (${figure.reason})`);

/** @param {{ fetch?: (url: string, init?: any) => Promise<any>; now?: () => Date; root?: string; write?: boolean }} options */
export async function runDistributionMetrics({ fetch: fetchImpl = globalThis.fetch, now = () => new Date(), root = process.cwd(), write = false } = {}) {
  const recordedAt = now().toISOString();
  const entry = { recordedAt, npm: await npmLastWeek(fetchImpl), githubReleaseAssets: await githubReleaseAssets(fetchImpl) };
  const row = `| ${recordedAt.slice(0, 10)} | ${cell(entry.npm, (npm) => `${npm.downloadsLastWeek} (${npm.start} to ${npm.end})`)} | ${
    cell(entry.githubReleaseAssets, (gh) => `${gh.total} (${gh.releases.map((release) => `${release.tag} ${release.downloads}`).join("; ")})`)} |`;
  if (write) {
    const path = join(root, METRICS_FILE);
    const file = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { schemaVersion: 1, entries: [] };
    if (file.schemaVersion !== 1 || !Array.isArray(file.entries)) throw new Error(`${METRICS_FILE} is not schemaVersion 1 with an entries array`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ ...file, entries: [...file.entries, entry] }, null, 2)}\n`);
  }
  const exitCode = entry.npm.status === "measured" && entry.githubReleaseAssets.status === "measured" ? 0 : 1;
  return { row, entry, exitCode };
}

if (isEntrypoint(import.meta.url)) {
  const result = await runDistributionMetrics({ write: process.argv.includes("--write") });
  console.log(result.row);
  process.exitCode = result.exitCode;
}
