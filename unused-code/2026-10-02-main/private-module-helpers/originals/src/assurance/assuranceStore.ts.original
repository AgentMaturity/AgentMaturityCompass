import { readFileSync } from "node:fs";
import { assuranceCertSchema, type AssuranceRun, type AssuranceWaiver } from "./assuranceSchema.js";
import {
  activeAssuranceWaiver,
  assuranceLatestCertificatePath,
  listAssuranceRunIds,
  listAssuranceWaivers,
  loadAssuranceFindings,
  loadAssuranceRun,
  verifyAssurancePolicySignature
} from "./assurancePolicyStore.js";
import { pathExists } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { verifyAssuranceCertificateFile } from "./assuranceVerifier.js";

export function listAssuranceRuns(workspace: string): AssuranceRun[] {
  return listAssuranceRunIds(workspace)
    .map((runId) => loadAssuranceRun(workspace, runId))
    .filter((row): row is AssuranceRun => Boolean(row));
}

export function latestAssuranceRun(workspace: string): AssuranceRun | null {
  return listAssuranceRuns(workspace)
    .slice()
    .sort((a, b) => b.generatedTs - a.generatedTs)[0] ?? null;
}

export function assuranceRunSummary(workspace: string, runId: string): {
  run: AssuranceRun | null;
  findings: ReturnType<typeof loadAssuranceFindings>;
} {
  return {
    run: loadAssuranceRun(workspace, runId),
    findings: loadAssuranceFindings(workspace, runId)
  };
}

export function latestAssuranceCertificateSummary(workspace: string):
  | {
      file: string;
      sha256: string;
      cert: ReturnType<typeof assuranceCertSchema.parse>;
      verify: ReturnType<typeof verifyAssuranceCertificateFile>;
    }
  | null {
  const file = assuranceLatestCertificatePath(workspace);
  if (!pathExists(file)) {
    return null;
  }
  const verify = verifyAssuranceCertificateFile({ file });
  if (!verify.cert) {
    return null;
  }
  return {
    file,
    sha256: sha256Hex(readFileSync(file)),
    cert: assuranceCertSchema.parse(verify.cert),
    verify
  };
}

export function assuranceWaiverStatus(workspace: string, nowTs = Date.now()): {
  active: AssuranceWaiver | null;
  waivers: AssuranceWaiver[];
} {
  return {
    active: activeAssuranceWaiver(workspace, nowTs),
    waivers: listAssuranceWaivers(workspace)
  };
}

export function assurancePolicyTrusted(workspace: string): boolean {
  return verifyAssurancePolicySignature(workspace).valid;
}
