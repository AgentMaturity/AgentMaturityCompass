/**
 * HuggingFace Auto-Publisher (AMC-446)
 *
 * Builds a publish plan for AMC Global Index dataset exports.
 * This module is offline-safe: it prepares repo files and metadata,
 * leaving the actual network publish step to an injected adapter/CLI.
 */

import {
  generateDatasetCard,
  toJSONL,
  type ExportOptions,
  type GlobalIndexEntry,
} from "./globalIndex.js";

export interface HFDatasetPublishOptions {
  datasetId: string;
  prettyName: string;
  license: string;
  amcVersion: string;
  private?: boolean;
  description?: string;
  maxRetries?: number;
}

export interface HFDatasetValidationSummary {
  recordCount: number;
  missingFields: string[];
}

export interface HFPublishProgress {
  totalFiles: number;
  totalBytes: number;
  fileSizes: Record<string, number>;
}

export interface HFRetryPolicy {
  maxRetries: number;
  backoffStrategy: "exponential";
}

export interface HFAutoPublishPlan {
  repoId: string;
  prettyName: string;
  private: boolean;
  files: Record<string, string>;
  commitMessage: string;
  validation: HFDatasetValidationSummary;
  progress: HFPublishProgress;
  retryPolicy: HFRetryPolicy;
}

export function buildHFDatasetReadme(
  entries: GlobalIndexEntry[],
  options: HFDatasetPublishOptions,
): string {
  const card = generateDatasetCard(entries, {
    datasetName: options.prettyName,
    amcVersion: options.amcVersion,
  });

  const yamlFrontmatter = [
    "---",
    `pretty_name: ${options.prettyName}`,
    `license: ${options.license}`,
    "task_categories:",
    "  - text-classification",
    "tags:",
    ...card.tags.map((tag) => `  - ${tag}`),
    "dataset_info:",
    "  features:",
    ...Object.entries(card.features).map(([key, value]) => `    - name: ${key}\n      dtype: ${value}`),
    `  splits:\n    - name: train\n      num_examples: ${entries.length}`,
    "---",
  ].join("\n");

  return [
    yamlFrontmatter,
    "",
    `# ${options.prettyName}`,
    "",
    options.description ?? "Agent Maturity Compass benchmark dataset export for HuggingFace.",
    "",
    `Dataset ID: ${options.datasetId}`,
    `AMC Version: ${options.amcVersion}`,
    `Rows: ${entries.length}`,
  ].join("\n");
}

function validateDatasetId(datasetId: string): void {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(datasetId)) {
    throw new Error(`Invalid HuggingFace dataset id: ${datasetId}`);
  }
}

function summarizeValidation(entries: GlobalIndexEntry[]): HFDatasetValidationSummary {
  const missingFields: string[] = [];

  if (entries.some((entry) => entry.agentPseudonym == null)) {
    missingFields.push("agentPseudonym");
  }
  if (entries.some((entry) => entry.compositeScore == null)) {
    missingFields.push("compositeScore");
  }
  if (entries.some((entry) => entry.trustLabel == null)) {
    missingFields.push("trustLabel");
  }
  if (entries.some((entry) => entry.questionsAnswered == null)) {
    missingFields.push("questionsAnswered");
  }

  return {
    recordCount: entries.length,
    missingFields,
  };
}

function summarizeProgress(files: Record<string, string>): HFPublishProgress {
  const fileSizes = Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path, Buffer.byteLength(content, "utf8")]),
  );

  return {
    totalFiles: Object.keys(files).length,
    totalBytes: Object.values(fileSizes).reduce((sum, size) => sum + size, 0),
    fileSizes,
  };
}

export function buildHFDatasetRepoFiles(
  entries: GlobalIndexEntry[],
  options: HFDatasetPublishOptions,
): Record<string, string> {
  validateDatasetId(options.datasetId);

  return {
    "README.md": buildHFDatasetReadme(entries, options),
    "data/train.jsonl": toJSONL(entries),
  };
}

export function createHFAutoPublishPlan(
  entries: GlobalIndexEntry[],
  options: HFDatasetPublishOptions,
): HFAutoPublishPlan {
  validateDatasetId(options.datasetId);
  const files = buildHFDatasetRepoFiles(entries, options);

  return {
    repoId: options.datasetId,
    prettyName: options.prettyName,
    private: options.private ?? false,
    files,
    commitMessage: `Publish AMC dataset ${options.prettyName} (${options.amcVersion})`,
    validation: summarizeValidation(entries),
    progress: summarizeProgress(files),
    retryPolicy: {
      maxRetries: options.maxRetries ?? 3,
      backoffStrategy: "exponential",
    },
  };
}
