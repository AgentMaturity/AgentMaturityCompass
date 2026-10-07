import { evalImportCoverageStatus, importEvalResults, type EvalImportFormat } from "./evalImporters.js";

const FORMAT_SET = new Set<EvalImportFormat>(["openai", "langsmith", "deepeval", "promptfoo", "wandb", "langfuse", "langwatch"]);

/** What `amc eval import --trust-tier` prints before exiting 2. */
export const EVAL_IMPORT_TRUST_TIER_REMOVED =
  "--trust-tier was removed in 2.0.0: trust tiers are derived from provenance, and imported results are SELF_REPORTED. See docs/EVIDENCE_TRUST.md.";

export function parseEvalImportFormat(value: string): EvalImportFormat {
  const normalized = value.trim().toLowerCase() as EvalImportFormat;
  if (!FORMAT_SET.has(normalized)) {
    throw new Error(`Unsupported eval import format '${value}'. Expected one of: openai, langsmith, deepeval, promptfoo, wandb, langfuse, langwatch`);
  }
  return normalized;
}

export function evalImportCli(params: {
  workspace: string;
  format: string | EvalImportFormat;
  file: string;
  agentId?: string;
  historical?: boolean;
}) {
  return importEvalResults({
    workspace: params.workspace,
    format: typeof params.format === "string" ? parseEvalImportFormat(params.format) : params.format,
    file: params.file,
    agentId: params.agentId,
    historical: params.historical
  });
}

export function evalStatusCli(params: {
  workspace: string;
  agentId?: string;
  sinceTs?: number;
}) {
  return evalImportCoverageStatus({
    workspace: params.workspace,
    agentId: params.agentId,
    sinceTs: params.sinceTs
  });
}
