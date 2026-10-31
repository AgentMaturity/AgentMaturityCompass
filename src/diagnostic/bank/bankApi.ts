import {
  initDiagnosticBank,
  loadDiagnosticBank,
  saveDiagnosticBank,
  verifyDiagnosticBankSignature, initDiagnosticBankAsync, saveDiagnosticBankAsync, loadDiagnosticBankAttemptAsync, DiagnosticBankFollowupError, readDiagnosticBankForApi
} from "./bankLoader.js";
import type { OrgPairsOptions } from "../../org/preparedOrgPairs.js";
import type { DiagnosticBank } from "./bankSchema.js";

export function diagnosticBankInitForApi(workspace: string) {
  return initDiagnosticBank(workspace);
}

export function diagnosticBankGetForApi(workspace: string): {
  bank: DiagnosticBank;
  signature: ReturnType<typeof verifyDiagnosticBankSignature>;
} {
  loadDiagnosticBank(workspace); // Retained sync cold compatibility; existing reads never initialize a signature.
  return readDiagnosticBankForApi(workspace);
}

export function diagnosticBankApplyForApi(params: {
  workspace: string;
  bank: DiagnosticBank;
}) {
  return saveDiagnosticBank(params.workspace, params.bank);
}

export function diagnosticBankVerifyForApi(workspace: string) {
  return verifyDiagnosticBankSignature(workspace);
}

export function diagnosticBankInitForApiAsync(workspace: string, options: OrgPairsOptions = {}) { return initDiagnosticBankAsync(workspace, options); }
export function diagnosticBankApplyForApiAsync(params: { workspace: string; bank: DiagnosticBank }, options: OrgPairsOptions = {}) {
  return saveDiagnosticBankAsync(params.workspace, params.bank, options);
}
/** Cold initialization is awaited; the returned bank and verdict use the same selected body bytes. */
export async function diagnosticBankGetForApiAsync(workspace: string, options: OrgPairsOptions = {}) {
  const selected = await loadDiagnosticBankAttemptAsync(workspace, options);
  try { selected.assertCurrent(); const out = readDiagnosticBankForApi(workspace, selected.bytes); selected.assertCurrent(); return out; }
  catch (cause) { if (selected.completedPaths.length > 0) throw new DiagnosticBankFollowupError(selected.completedPaths, cause); throw cause; }
}
