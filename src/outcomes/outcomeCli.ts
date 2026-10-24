import { relative } from "node:path";
import YAML from "yaml";
import { readContainedOrNull } from "../utils/containedFs.js";
import { outcomeContractSchema } from "./outcomeContractSchema.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import { assertKeysetComplete } from "../keys/keyset.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { assertPurposePublicationCurrent, capturePurposePublication } from "../keys/purposePublication.js";
import { vaultStatus } from "../vault/vault.js";
import { parseWindowToMs } from "../utils/time.js";
import { readUtf8, writeFileAtomic } from "../utils/fs.js";
import { getSigningKey, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { sha256Hex } from "../utils/hash.js";
import { openLedger } from "../ledger/ledger.js";
import { resolveAgentId } from "../fleet/paths.js";
import {
  initOutcomeContract,
  initOutcomeContractAsync,
  loadOutcomeContract,
  outcomeContractPath,
  signOutcomeContract,
  signOutcomeContractAsync,
  verifyOutcomeContractSignature
} from "./outcomeContractEngine.js";
import { diffOutcomeReports, fleetOutcomeReport, loadOutcomeReport, runOutcomeReport, runOutcomeReportAsync } from "./outcomeReport.js";

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

export async function outcomesInitCliAsync(params: { workspace: string; agentId?: string; archetype?: string }): Promise<{ path: string; sigPath: string }> {
  return initOutcomeContractAsync(params.workspace, params.agentId, params.archetype);
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

export async function outcomesReportCliAsync(params: Parameters<typeof outcomesReportCli>[0], options: { beforePublish?: () => void } = {}): Promise<ReturnType<typeof outcomesReportCli>> {
  const out = await runOutcomeReportAsync(params, options);
  return { jsonPath: out.jsonPath, mdPath: out.mdPath, valueScore: out.report.valueScore,
    economicSignificanceIndex: out.report.economicSignificanceIndex, trustLabel: out.report.trustLabel, reportId: out.report.reportId };
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
    const auditorAttestationSig = signHexDigest(attestationDigest, getSigningKey(params.workspace, "artifact-seal"));

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

export async function outcomesResignCliAsync(params: { workspace: string; agentId?: string }): Promise<{ sigPath: string }> {
  return { sigPath: await signOutcomeContractAsync(params.workspace, params.agentId) };
}

function manualAttestationContract(workspace: string, agentId: string) {
  const path = outcomeContractPath(workspace, agentId), rel = relative(workspace, path).replace(/\\/g, "/");
  try {
    const bytes = readContainedOrNull(workspace, rel, 1024 * 1024), signature = readContainedOrNull(workspace, rel + ".sig", 64 * 1024);
    if (bytes === null || signature === null) throw new Error("missing contract pair");
    const record = JSON.parse(signature.toString("utf8")) as { digestSha256?: unknown; signature?: unknown };
    const digest = sha256Hex(bytes);
    assertKeysetComplete(workspace);
    if (record.digestSha256 !== digest || typeof record.signature !== "string"
      || !verifyHexDigestAny(digest, record.signature, getPurposeKeyHistory(workspace, "config-signature"))) throw new Error("invalid contract signature");
    return { path, bytes, signature, contract: outcomeContractSchema.parse(YAML.parse(bytes.toString("utf8"))) };
  } catch { throw new Error("Manual outcome attestation requires a verified outcome contract"); }
}

/** Checked signing happens before the short SQL transaction; the original manual row and raw signature wire are unchanged. */
export async function outcomesAttestCliAsync(params: Parameters<typeof outcomesAttestCli>[0],
  options: { beforePublish?: () => void } = {}): Promise<ReturnType<typeof outcomesAttestCli>> {
  const input = Object.freeze({ ...params }), beforePublish = options.beforePublish;
  if (Object.values(input).some(value => value !== undefined && typeof value !== "string")) throw new Error("Manual outcome attestation inputs must be strings");
  beforePublish?.();
  const agentId = resolveAgentId(input.workspace, input.agentId), authority = capturePurposePublication(input.workspace, "artifact-seal");
  const contract = manualAttestationContract(input.workspace, agentId);
  const metric = contract.contract.outcomeContract.metrics.find(row => row.metricId === input.metricId);
  if (!metric) throw new Error("metricId not found in contract: " + input.metricId);
  const value = parseValue(input.value);
  const attestationDigest = sha256Hex(JSON.stringify({ agentId, metricId: input.metricId, value: input.value, reason: input.reason, ts: Date.now() }));
  const signed = await signWithPurposeKey(input.workspace, "artifact-seal", Buffer.from(attestationDigest, "hex"));
  const original = () => { if (signed.provider === "file" && !vaultStatus(input.workspace).unlocked) throw new Error("vault locked; unlock required for manual outcome attestation"); assertPurposePublicationCurrent(input.workspace, authority, signed); };
  original();
  beforePublish?.(); original();
  const ledger = openLedger(input.workspace);
  try {
    return ledger.db.transaction(() => {
      const current = manualAttestationContract(input.workspace, agentId);
      if (!current.bytes.equals(contract.bytes) || !current.signature.equals(contract.signature)) throw new Error("Manual outcome contract changed while signing was prepared");
      original();
      // The attestation binds no prior row; appendOutcomeEvent takes the current predecessor under this transaction.
      const written = ledger.appendOutcomeEvent({
        agentId, workOrderId: input.workOrderId ?? null, category: metric.category, metricId: input.metricId,
        value, unit: input.unit ?? null, trustTier: "SELF_REPORTED", source: "manual",
        meta: { attestation: { kind: "self_attested" }, reason: input.reason, attestationDigest,
          auditorAttestationSig: signed.signature.toString("base64"), contractPath: contract.path }
      });
      return { outcomeEventId: written.outcomeEventId, eventHash: written.eventHash, receiptId: written.receiptId, trustTier: "SELF_REPORTED" as const };
    }).immediate();
  } finally { ledger.close(); }
}
