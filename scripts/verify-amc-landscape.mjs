#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const outRoot = resolve(root, process.env.AMC_RESEARCH_OUT || "AMC_OS/RESEARCH/2026-06-13-amc-landscape");
const requiredPapers = Number(process.env.AMC_RESEARCH_REQUIRED_PAPERS || 500);
const requiredRepos = Number(process.env.AMC_RESEARCH_REQUIRED_REPOS || 1500);
const requiredCompetitors = Number(process.env.AMC_RESEARCH_REQUIRED_COMPETITORS || 100);
const requiredGaps = Number(process.env.AMC_RESEARCH_REQUIRED_GAPS || 5000);

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

assert(papers.length >= requiredPapers, `expected >=${requiredPapers} papers, got ${papers.length}`);
assert(repos.length >= requiredRepos, `expected >=${requiredRepos} repos, got ${repos.length}`);
assert(competitors.length >= requiredCompetitors, `expected >=${requiredCompetitors} competitors, got ${competitors.length}`);
assert(gaps.length >= requiredGaps, `expected >=${requiredGaps} gaps, got ${gaps.length}`);
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
assert(gaps.every((gap) => typeof gap.improvementDimensionId === "string" && gap.improvementDimensionId.length > 0), "some gaps are missing improvement dimension ids");
assert(gaps.every((gap) => typeof gap.improvementDimension === "string" && gap.improvementDimension.length > 0), "some gaps are missing improvement dimension labels");
assert(gaps.every((gap) => typeof gap.affectedModules === "string" && gap.affectedModules.length > 0), "some gaps are missing affected modules");
assert(gaps.every((gap) => typeof gap.priorityRationale === "string" && gap.priorityRationale.includes(gap.priority)), "some gaps are missing priority rationale");
assert(gaps.every((gap) => typeof gap.implementationDirection === "string" && gap.implementationDirection.length >= 80), "some gaps are missing implementation direction detail");
assert(gaps.every((gap) => typeof gap.riskIfIgnored === "string" && gap.riskIfIgnored.length >= 40), "some gaps are missing risk-if-ignored detail");
assert(gaps.every((gap) => typeof gap.effort === "string" && ["S", "M", "L"].includes(gap.effort)), "some gaps have invalid effort values");
assert(gaps.every((gap) => typeof gap.evidenceNeeded === "string" && gap.evidenceNeeded.length > 0), "some gaps are missing evidence-needed detail");
assert(gaps.every((gap) => typeof gap.sourceReliability === "string" && gap.sourceReliability.length > 0), "some gaps are missing source reliability notes");
assert(gaps.every((gap) => typeof gap.nextStep === "string" && gap.nextStep.length > 0), "some gaps are missing next steps");
assert(uniqueCount(gaps, "title") >= requiredGaps, "gap titles are not specific enough");
assert(uniqueCount(gaps, "improvementDimensionId") >= 45, "expected >=45 distinct improvement dimensions");
assert(gaps.filter((gap) => gap.sourceType === "paper").length >= requiredPapers, "paper-sourced gap coverage is too low");
assert(gaps.filter((gap) => gap.sourceType === "github_repo").length >= requiredRepos, "GitHub-repo-sourced gap coverage is too low");
assert(gaps.filter((gap) => gap.sourceType === "competitor").length >= requiredCompetitors, "competitor-sourced gap coverage is too low");
assert(new Set(gaps.filter((gap) => gap.sourceType === "paper").map((gap) => gap.sourceId)).size >= requiredPapers, "not every required paper source has a gap");
assert(new Set(gaps.filter((gap) => gap.sourceType === "github_repo").map((gap) => gap.sourceId)).size >= requiredRepos, "not every required GitHub source has a gap");
assert(new Set(gaps.filter((gap) => gap.sourceType === "competitor").map((gap) => gap.sourceId)).size >= requiredCompetitors, "not every required competitor source has a gap");
assert(report.includes("### P0 Gaps") && report.includes("### P1 Gaps") && report.includes("### P2 Gaps") && report.includes("### P3 Gaps"), "report does not separate gaps by priority");
assert(report.includes("## Top Strategic Improvement Themes"), "report is missing strategic improvement themes");
assert(report.includes("Priority Rationale") && report.includes("Implementation Direction") && report.includes("Risk If Ignored"), "report is missing detailed gap table columns");
assert(summary.requirements?.papersAtLeast500 === true, "summary paper requirement is not true");
assert(summary.requirements?.githubReposAtLeast1500 === true, "summary repo requirement is not true");
assert(summary.requirements?.competitorsAtLeast100 === true, "summary competitor requirement is not true");
assert(summary.requirements?.gapsAtLeast5000 === true, "summary gap requirement is not true");
assert(summary.quality?.reportDetailVersion === "dimension-v2", "summary quality version is missing");
assert(summary.quality?.uniqueImprovementDimensions >= 45, "summary improvement dimension spread is too low");
assert(summary.quality?.gapsWithImprovementDimension >= requiredGaps, "summary dimension coverage is too low");
assert(summary.quality?.gapsWithPriorityRationale >= requiredGaps, "summary priority-rationale coverage is too low");
assert(summary.quality?.gapsWithImplementationDirection >= requiredGaps, "summary implementation-direction coverage is too low");
assert(summary.quality?.gapsWithRiskIfIgnored >= requiredGaps, "summary risk coverage is too low");
assert(summary.quality?.gapsWithEvidenceNeed >= requiredGaps, "summary evidence-needed coverage is too low");
assert(summary.quality?.gapsWithAffectedModules >= requiredGaps, "summary affected-module coverage is too low");
assert(summary.sourceCoverage?.paperSourcesWithGaps >= requiredPapers, "summary paper source coverage is too low");
assert(summary.sourceCoverage?.githubRepoSourcesWithGaps >= requiredRepos, "summary GitHub source coverage is too low");
assert(summary.sourceCoverage?.competitorSourcesWithGaps >= requiredCompetitors, "summary competitor source coverage is too low");

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
  priorityCounts: summary.priorityCounts,
  quality: summary.quality
}, null, 2));
