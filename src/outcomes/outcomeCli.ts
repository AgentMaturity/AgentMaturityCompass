import { parseWindowToMs } from "../utils/time.js";
import { readUtf8, writeFileAtomic } from "../utils/fs.js";
import { getPrivateKeyPem, signHexDigest } from "../crypto/keys.js";
import { sha256Hex } from "../utils/hash.js";
import { openLedger } from "../ledger/ledger.js";
import { resolveAgentId } from "../fleet/paths.js";
import {
  initOutcomeContract,
  loadOutcomeContract,
  outcomeContractPath,
  signOutcomeContract,
  verifyOutcomeContractSignature
} from "./outcomeContractEngine.js";
import { diffOutcomeReports, fleetOutcomeReport, loadOutcomeReport, runOutcomeReport } from "./outcomeReport.js";

function parseValue(value: string): number | string | boolean {
  const lower = value.trim().toLowerCase();
  if (lower === "true") {
    return true;
  }
  if (lower === "false") {
    return false;
  }
  const n = Number(value);
  if (Number.isFinite(n)) {
    return n;
  }
  return value;
}

export function outcomesInitCli(params: { workspace: string; agentId?: string; archetype?: string }): {
  path: string;
  sigPath: string;
} {
  return initOutcomeContract(params.workspace, params.agentId, params.archetype);
}

export function outcomesVerifyCli(params: { workspace: string; agentId?: string }): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
} {
  return verifyOutcomeContractSignature(params.workspace, params.agentId);
}

export function outcomesReportCli(params: { workspace: string; agentId?: string; window: string; outFile?: string }): {
  jsonPath: string;
  mdPath: string;
  valueScore: number;
  economicSignificanceIndex: number;
  trustLabel: string;
  reportId: string;
} {
  const out = runOutcomeReport({
    workspace: params.workspace,
    agentId: params.agentId,
    window: params.window,
    outFile: params.outFile
  });
  return {
    jsonPath: out.jsonPath,
    mdPath: out.mdPath,
    valueScore: out.report.valueScore,
    economicSignificanceIndex: out.report.economicSignificanceIndex,
    trustLabel: out.report.trustLabel,
    reportId: out.report.reportId
  };
}

export function outcomesFleetReportCli(params: { workspace: string; window: string; outFile?: string }): {
  outFile: string | null;
  agentCount: number;
} {
  const report = fleetOutcomeReport({
    workspace: params.workspace,
    window: params.window
  });
  if (!params.outFile) {
    return {
      outFile: null,
      agentCount: report.agents.length
    };
  }
  const output = params.outFile.endsWith(".json") ? JSON.stringify(report, null, 2) : [
    `# Fleet Outcomes (${report.window})`,
    "",
    ...report.agents.map((row) => `- ${row.agentId}: ValueScore=${row.valueScore.toFixed(2)} EconomicSignificanceIndex=${row.economicSignificanceIndex.toFixed(2)} (${row.trustLabel})`),
    ""
  ].join("\n");
  writeFileAtomic(params.outFile, output, 0o644);
  return {
    outFile: params.outFile,
    agentCount: report.agents.length
  };
}

export function outcomesDiffCli(reportAPath: string, reportBPath: string): ReturnType<typeof diffOutcomeReports> {
  const reportA = JSON.parse(readUtf8(reportAPath));
  const reportB = JSON.parse(readUtf8(reportBPath));
  return diffOutcomeReports(reportA, reportB);
}

export function outcomesAttestCli(params: {
  workspace: string;
  agentId?: string;
  metricId: string;
  value: string;
  reason: string;
  workOrderId?: string;
  unit?: string;
}): {
  outcomeEventId: string;
  eventHash: string;
  receiptId: string;
  trustTier: "SELF_REPORTED";
} {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const contract = loadOutcomeContract(params.workspace, agentId);
  const metric = contract.outcomeContract.metrics.find((row) => row.metricId === params.metricId);
  if (!metric) {
    throw new Error(`metricId not found in contract: ${params.metricId}`);
  }

  const ledger = openLedger(params.workspace);
  try {
    const attestationDigest = sha256Hex(JSON.stringify({
      agentId,
      metricId: params.metricId,
      value: params.value,
      reason: params.reason,
      ts: Date.now()
    }));
    const auditorAttestationSig = signHexDigest(attestationDigest, getPrivateKeyPem(params.workspace, "auditor"));

    const written = ledger.appendOutcomeEvent({
      agentId,
      workOrderId: params.workOrderId ?? null,
      category: metric.category,
      metricId: params.metricId,
      value: parseValue(params.value),
      unit: params.unit ?? null,
      // The operator's own auditor signature proves who recorded it, not that it is true (P0-18).
      trustTier: "SELF_REPORTED",
      source: "manual",
      meta: {
        attestation: { kind: "self_attested" },
        reason: params.reason,
        attestationDigest,
        auditorAttestationSig,
        contractPath: outcomeContractPath(params.workspace, agentId)
      }
    });

    return {
      outcomeEventId: written.outcomeEventId,
      eventHash: written.eventHash,
      receiptId: written.receiptId,
      trustTier: "SELF_REPORTED"
    };
  } finally {
    ledger.close();
  }
}

export function windowToBounds(window: string): { start: number; end: number } {
  const end = Date.now();
  const start = end - parseWindowToMs(window);
  return { start, end };
}

export function outcomesResignCli(params: { workspace: string; agentId?: string }): { sigPath: string } {
  return {
    sigPath: signOutcomeContract(params.workspace, params.agentId)
  };
}

export function loadOutcomeReportCli(params: { workspace: string; agentId?: string; reportId: string | "latest" }) {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  return loadOutcomeReport(params.workspace, agentId, params.reportId);
}
