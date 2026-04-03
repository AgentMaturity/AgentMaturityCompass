/**
 * Academic Paper Builder (AMC-447)
 */

import type { EvalReport, EvalTrial } from "./evalHarness.js";

export interface AcademicPaperOptions {
  title: string;
  authors: string[];
}

export interface AcademicPaper {
  title: string;
  authors: string[];
  abstract: string;
  introduction: string;
  methods: string;
  results: string;
  discussion: string;
  limitations: string[];
}

export interface PaperStatistics {
  metric: string;
  meanDifference: number;
  effectSize: number;
  standardError: number;
  confidenceInterval95: {
    lower: number;
    upper: number;
  };
  isSignificant: boolean;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleVariance(values: number[], avg: number): number {
  if (values.length <= 1) {
    return 0;
  }
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
}

function getMetricValuesByCondition(report: EvalReport, metric: string): [number[], number[]] {
  const grouped = new Map<string, number[]>();
  for (const trial of report.trials as EvalTrial[]) {
    const value = trial.metrics[metric];
    if (typeof value !== "number") {
      continue;
    }
    const bucket = grouped.get(trial.conditionId) ?? [];
    bucket.push(value);
    grouped.set(trial.conditionId, bucket);
  }
  const conditions = [...grouped.values()];
  return [conditions[0] ?? [], conditions[1] ?? []];
}

export function computePaperStatistics(report: EvalReport, metric: string): PaperStatistics {
  const [groupA, groupB] = getMetricValuesByCondition(report, metric);
  const meanA = mean(groupA);
  const meanB = mean(groupB);
  const varianceA = sampleVariance(groupA, meanA);
  const varianceB = sampleVariance(groupB, meanB);
  const pooledVariance = ((groupA.length - 1) * varianceA + (groupB.length - 1) * varianceB) / Math.max(1, groupA.length + groupB.length - 2);
  const pooledStd = Math.sqrt(Math.max(0, pooledVariance));
  const meanDifference = meanA - meanB;
  const effectSize = pooledStd === 0 ? 0 : meanDifference / pooledStd;
  const standardError = Math.sqrt((varianceA / Math.max(1, groupA.length)) + (varianceB / Math.max(1, groupB.length)));
  const margin = 1.96 * standardError;

  return {
    metric,
    meanDifference: round(meanDifference),
    effectSize: round(effectSize),
    standardError: round(standardError),
    confidenceInterval95: {
      lower: round(meanDifference - margin),
      upper: round(meanDifference + margin),
    },
    isSignificant: standardError > 0 ? Math.abs(meanDifference) / standardError >= 1.96 : Math.abs(effectSize) >= 0.8,
  };
}

export function buildAcademicPaper(
  report: EvalReport,
  options: AcademicPaperOptions,
): AcademicPaper {
  const firstMetric = report.config.dependentVars[0] ?? "metric";
  const sig = report.summary.significanceTests[0];
  const stats = computePaperStatistics(report, firstMetric);
  const strongestCondition = report.summary.conditions
    .slice()
    .sort((a, b) => (b.metrics[firstMetric]?.mean ?? 0) - (a.metrics[firstMetric]?.mean ?? 0))[0];

  const abstract = [
    `${options.title} evaluates whether AMC steering interventions improve measurable agent outcomes across controlled conditions.`,
    `We executed ${report.summary.totalTrials} trials spanning ${report.summary.conditions.length} experimental conditions and summarized outcomes with descriptive, interval, and effect-size statistics.`,
    `Primary results focus on ${firstMetric}, with practical significance estimated using Cohen's d=${stats.effectSize} and a 95% confidence interval of [${stats.confidenceInterval95.lower}, ${stats.confidenceInterval95.upper}].`,
  ].join(" ");

  const introduction = [
    `Agent Maturity Compass (AMC) aims to measure and improve the trustworthiness of AI agents.`,
    `This paper studies ${report.name} using a controlled evaluation harness and compares outcomes across independent variable settings defined in AMC.`,
  ].join(" ");

  const methods = [
    `We used the AMC eval harness with ${report.config.trialsPerCondition} trial(s) per condition across ${report.config.independentVars.length} independent variable(s).`,
    `For each dependent variable, we report means, standard deviations, minima, maxima, sample counts, and 95% confidence intervals around pairwise mean differences.`,
    `Pairwise condition comparisons use Cohen's d effect size and a normal-approximation significance proxy based on the standard error of the mean difference.`,
  ].join(" ");

  const results = [
    `The highest-performing condition was ${strongestCondition?.conditionId ?? "N/A"} for ${firstMetric}.`,
    `Observed summaries include ${report.config.dependentVars.join(", ")}.`,
    sig
      ? `For ${sig.metric}, mean difference between ${sig.conditionA} and ${sig.conditionB} was ${sig.meanDifference} with Cohen's d=${sig.effectSize}.`
      : "No pairwise significance test was available.",
    `Our independent calculation for ${firstMetric} estimated Δ=${stats.meanDifference}, Cohen's d=${stats.effectSize}, 95% CI=[${stats.confidenceInterval95.lower}, ${stats.confidenceInterval95.upper}], significant=${stats.isSignificant}.`,
  ].join(" ");

  const discussion = [
    `The findings suggest that AMC steering configuration materially influences benchmark outcomes under controlled conditions.`,
    `Effect-size framing helps separate merely detectable shifts from practically meaningful improvements, while interval estimates communicate uncertainty in observed gains.`,
  ].join(" ");

  const limitations = [
    `Results depend on the selected dependent variables (${report.config.dependentVars.join(", ")}).`,
    `The significance estimate uses a normal approximation and should be complemented by preregistered inference in high-stakes studies.`,
    `External validity is bounded by the prompts, conditions, and runners configured in this eval harness.`,
  ];

  return {
    title: options.title,
    authors: options.authors,
    abstract,
    introduction,
    methods,
    results,
    discussion,
    limitations,
  };
}

export function renderAcademicPaperMarkdown(paper: AcademicPaper): string {
  return [
    `# ${paper.title}`,
    "",
    paper.authors.join(", "),
    "",
    "## Abstract",
    paper.abstract,
    "",
    "## Introduction",
    paper.introduction,
    "",
    "## Methods",
    paper.methods,
    "",
    "## Results",
    paper.results,
    "",
    "## Discussion",
    paper.discussion,
    "",
    "## Limitations",
    ...paper.limitations.map((item) => `- ${item}`),
  ].join("\n");
}

function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/#/g, "\\#")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}

export function renderAcademicPaperLatex(paper: AcademicPaper): string {
  return [
    "\\documentclass{article}",
    "\\usepackage[utf8]{inputenc}",
    `\\title{${escapeLatex(paper.title)}}`,
    `\\author{${escapeLatex(paper.authors.join(" \\and "))}}`,
    "\\begin{document}",
    "\\maketitle",
    "\\section{Abstract}",
    escapeLatex(paper.abstract),
    "\\section{Introduction}",
    escapeLatex(paper.introduction),
    "\\section{Methods}",
    escapeLatex(paper.methods),
    "\\section{Results}",
    escapeLatex(paper.results),
    "\\section{Discussion}",
    escapeLatex(paper.discussion),
    "\\section{Limitations}",
    ...paper.limitations.map((item) => `\\item ${escapeLatex(item)}`),
    "\\end{document}",
  ].join("\n");
}
