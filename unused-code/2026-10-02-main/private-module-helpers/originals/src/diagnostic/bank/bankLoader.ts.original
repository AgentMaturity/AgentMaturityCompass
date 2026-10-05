import { join } from "node:path";
import YAML from "yaml";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../../utils/fs.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../../org/orgSigner.js";
import { defaultDiagnosticBankV1 } from "./bankV1.js";
import { diagnosticBankSchema, type DiagnosticBank } from "./bankSchema.js";

export function diagnosticBankRoot(workspace: string): string {
  return join(workspace, ".amc", "diagnostic", "bank");
}

export function diagnosticBankPath(workspace: string): string {
  return join(diagnosticBankRoot(workspace), "bank.yaml");
}

export function diagnosticBankSigPath(workspace: string): string {
  return `${diagnosticBankPath(workspace)}.sig`;
}

export function saveDiagnosticBank(workspace: string, bank: DiagnosticBank): {
  path: string;
  sigPath: string;
} {
  ensureDir(diagnosticBankRoot(workspace));
  const path = diagnosticBankPath(workspace);
  const normalized = diagnosticBankSchema.parse(bank);
  writeFileAtomic(path, YAML.stringify(normalized), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return { path, sigPath };
}

export function initDiagnosticBank(workspace: string): {
  path: string;
  sigPath: string;
  bank: DiagnosticBank;
} {
  const bank = defaultDiagnosticBankV1();
  const saved = saveDiagnosticBank(workspace, bank);
  return {
    ...saved,
    bank
  };
}

export function loadDiagnosticBank(workspace: string): DiagnosticBank {
  const path = diagnosticBankPath(workspace);
  if (!pathExists(path)) {
    return initDiagnosticBank(workspace).bank;
  }
  return diagnosticBankSchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

export function verifyDiagnosticBankSignature(workspace: string) {
  const path = diagnosticBankPath(workspace);
  if (!pathExists(path)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "diagnostic bank missing",
      path,
      sigPath: `${path}.sig`
    };
  }
  return verifySignedFileWithAuditor(workspace, path);
}
