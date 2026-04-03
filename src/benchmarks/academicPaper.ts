/**
 * Academic Paper Builder (AMC-447)
 */

import type { EvalReport } from "./evalHarness.js";

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

export function buildAcademicPaper(
  report: EvalReport,
  options: AcademicPaperOptions,
): AcademicPaper {
  const firstMetric = report.config.dependentVars[0] ?? "metric";
  const sig = report.summary.significanceTests[0];
  const strongestCondition = report.summary.conditions
    .slice()
    .sort((a, b) => (b.metrics[firstMetric]?.mean ?? 0) - (a.metrics[firstMetric]?.mean ?? 0))[0];

  const abstract = [
    `${options.title} evaluates whether AMC steering interventions improve measurable agent outcomes across controlled conditions.`,
    `We executed ${report.summary.totalTrials} trials spanning ${report.summary.conditions.length} experimental conditions and summarized outcomes with descriptive and effect-size statistics.`,
    `Primary results focus on ${firstMetric}, with practical significance estimated using Cohen's d and condition-level aggregate metrics.`,
  ].join(" ");

  const introduction = [
    `Agent Maturity Compass (AMC) aims to measure and improve the trustworthiness of AI agents.`,
    `This paper studies ${report.name} using a controlled evaluation harness and compares outcomes across independent variable settings defined in AMC.`,
  ].join(" ");

  const methods = [
    `We used the AMC eval harness with ${report.config.trialsPerCondition} trial(s) per condition across ${report.config.independentVars.length} independent variable(s).`,
    `For each dependent variable, we report means, standard deviations, minima, maxima, and sample counts.`,
    `Pairwise condition comparisons use Cohen's d effect size to quantify practical significance beyond raw mean differences.`,
  ].join(" ");

  const results = [
    `The highest-performing condition was ${strongestCondition?.conditionId ?? "N/A"} for ${firstMetric}.`,
    `Observed summaries include ${report.config.dependentVars.join(", ")}.`,
    sig
      ? `For ${sig.metric}, mean difference between ${sig.conditionA} and ${sig.conditionB} was ${sig.meanDifference} with Cohen's d=${sig.effectSize}.`
      : "No pairwise significance test was available.",
  ].join(" ");

  const discussion = [
    `The findings suggest that AMC steering configuration materially influences benchmark outcomes under controlled conditions.`,
    `Effect-size framing helps separate merely detectable shifts from practically meaningful improvements.`,
  ].join(" ");

  const limitations = [
    `Results depend on the selected dependent variables (${report.config.dependentVars.join(", ")}).`,
    `Practical significance is estimated with effect sizes and does not replace full inferential analysis or preregistration.`,
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
