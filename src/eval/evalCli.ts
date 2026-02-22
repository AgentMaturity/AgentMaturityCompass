import type { TrustTier } from "../types.js";
import { importEvalResults, type EvalImportFormat } from "./evalImporters.js";

const FORMAT_SET = new Set<EvalImportFormat>(["openai", "langsmith", "deepeval", "promptfoo"]);
const TRUST_SET = new Set<TrustTier>(["OBSERVED", "OBSERVED_HARDENED", "ATTESTED", "SELF_REPORTED"]);

export function parseEvalImportFormat(value: string): EvalImportFormat {
  const normalized = value.trim().toLowerCase() as EvalImportFormat;
  if (!FORMAT_SET.has(normalized)) {
    throw new Error(`Unsupported eval import format '${value}'. Expected one of: openai, langsmith, deepeval, promptfoo`);
  }
  return normalized;
}

export function parseEvalImportTrustTier(value: string | undefined): TrustTier | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toUpperCase() as TrustTier;
  if (!TRUST_SET.has(normalized)) {
    throw new Error(`Unsupported trust tier '${value}'. Expected one of: OBSERVED, OBSERVED_HARDENED, ATTESTED, SELF_REPORTED`);
  }
  return normalized;
}

export function evalImportCli(params: {
  workspace: string;
  format: string | EvalImportFormat;
  file: string;
  agentId?: string;
  trustTier?: string | TrustTier;
}) {
  return importEvalResults({
    workspace: params.workspace,
    format: typeof params.format === "string" ? parseEvalImportFormat(params.format) : params.format,
    file: params.file,
    agentId: params.agentId,
    trustTier:
      params.trustTier === undefined
        ? undefined
        : typeof params.trustTier === "string"
          ? parseEvalImportTrustTier(params.trustTier)
          : params.trustTier
  });
}
