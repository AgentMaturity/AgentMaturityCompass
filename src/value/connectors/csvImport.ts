import { importValueCsvForApi, importValueCsvForApiAsync } from "../valueApi.js";

export function importValueCsv(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
  kpiId: string;
  csvText: string;
}) {
  return importValueCsvForApi({
    workspace: params.workspace,
    scopeType: params.scopeType,
    scopeId: params.scopeId,
    kpiId: params.kpiId,
    csvText: params.csvText
  });
}

export async function importValueCsvAsync(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
  kpiId: string;
  csvText: string;
}) {
  return importValueCsvForApiAsync({
    workspace: params.workspace,
    scopeType: params.scopeType,
    scopeId: params.scopeId,
    kpiId: params.kpiId,
    csvText: params.csvText
  });
}
