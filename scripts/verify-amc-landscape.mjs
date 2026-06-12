#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const outRoot = resolve(root, process.env.AMC_RESEARCH_OUT || "AMC_OS/RESEARCH/2026-06-13-amc-landscape");

function readJson(name) {
  const path = resolve(outRoot, name);
  if (!existsSync(path)) {
    throw new Error(`missing artifact: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function uniqueCount(items, key) {
  return new Set(items.map((item) => item[key])).size;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const papers = readJson("papers_2026.json");
const repos = readJson("github_repos.json");
const competitors = readJson("competitors.json");
const gaps = readJson("prioritized_gaps.json");
const summary = readJson("summary.json");
const reportPath = resolve(outRoot, "AMC_2026_RESEARCH_COMPETITOR_GAP_REPORT.md");
const report = readFileSync(reportPath, "utf8");

assert(papers.length >= 500, `expected >=500 papers, got ${papers.length}`);
assert(repos.length >= 500, `expected >=500 repos, got ${repos.length}`);
assert(competitors.length >= 100, `expected >=100 competitors, got ${competitors.length}`);
assert(gaps.length >= 500, `expected >=500 gaps, got ${gaps.length}`);
assert(uniqueCount(papers, "id") === papers.length, "paper ids are not unique");
assert(uniqueCount(repos, "fullName") === repos.length, "repo full names are not unique");
assert(uniqueCount(competitors, "name") === competitors.length, "competitor names are not unique");
assert(uniqueCount(gaps, "id") === gaps.length, "gap ids are not unique");
assert(papers.every((paper) => paper.year === 2026), "not every paper is publication year 2026");
assert(papers.every((paper) => typeof paper.url === "string" && paper.url.length > 0), "some papers are missing urls");
assert(repos.every((repo) => typeof repo.url === "string" && repo.url.startsWith("https://github.com/")), "some repos are missing GitHub urls");
assert(competitors.every((competitor) => typeof competitor.url === "string" && competitor.url.startsWith("https://")), "some competitors are missing urls");
assert(gaps.every((gap) => ["P0", "P1", "P2", "P3"].includes(gap.priority)), "some gaps have invalid priorities");
assert(gaps.every((gap) => typeof gap.sourceUrl === "string" && gap.sourceUrl.length > 0), "some gaps are missing source urls");
assert(report.includes("### P0 Gaps") && report.includes("### P1 Gaps") && report.includes("### P2 Gaps") && report.includes("### P3 Gaps"), "report does not separate gaps by priority");
assert(summary.requirements?.papersAtLeast500 === true, "summary paper requirement is not true");
assert(summary.requirements?.githubReposAtLeast500 === true, "summary repo requirement is not true");
assert(summary.requirements?.competitorsAtLeast100 === true, "summary competitor requirement is not true");
assert(summary.requirements?.gapsAtLeast500 === true, "summary gap requirement is not true");

console.log(JSON.stringify({
  status: "passed",
  outRoot,
  reportPath,
  counts: {
    papers: papers.length,
    githubRepos: repos.length,
    competitors: competitors.length,
    gaps: gaps.length
  },
  priorityCounts: summary.priorityCounts
}, null, 2));
