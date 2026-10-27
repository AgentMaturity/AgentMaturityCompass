import {
  diagnosticBankApplyForApi,
  diagnosticBankGetForApi,
  diagnosticBankInitForApi,
  diagnosticBankVerifyForApi, diagnosticBankInitForApiAsync
} from "./bankApi.js";
import { assertOwnerMode } from "../../mode/mode.js";
import type { DiagnosticBank } from "./bankSchema.js";

export function diagnosticBankVerifyCli(workspace: string) {
  return diagnosticBankVerifyForApi(workspace);
}

export function diagnosticBankPrintCli(workspace: string): DiagnosticBank {
  return diagnosticBankGetForApi(workspace).bank;
}

export function diagnosticBankApplyCli(params: {
  workspace: string;
  bank: DiagnosticBank;
}) {
  return diagnosticBankApplyForApi(params);
}

export function diagnosticBankInitCliAsync(workspace: string) {
  return diagnosticBankInitForApiAsync(workspace, { beforePublish: () => assertOwnerMode(workspace, "diagnostic bank init") });
}
