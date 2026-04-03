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
}

export interface HFAutoPublishPlan {
  repoId: string;
  prettyName: string;
  private: boolean;
  files: Record<string, string>;
  commitMessage: string;
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

export function buildHFDatasetRepoFiles(
  entries: GlobalIndexEntry[],
  options: HFDatasetPublishOptions,
): Record<string, string> {
  return {
    "README.md": buildHFDatasetReadme(entries, options),
    "data/train.jsonl": toJSONL(entries),
  };
}

export function createHFAutoPublishPlan(
  entries: GlobalIndexEntry[],
  options: HFDatasetPublishOptions,
): HFAutoPublishPlan {
  return {
    repoId: options.datasetId,
    prettyName: options.prettyName,
    private: options.private ?? false,
    files: buildHFDatasetRepoFiles(entries, options),
    commitMessage: `Publish AMC dataset ${options.prettyName} (${options.amcVersion})`,
  };
}
