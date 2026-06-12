import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { getAgentPaths } from "../fleet/paths.js";
import type { DiagnosticReport } from "../types.js";
import { readUtf8, writeFileAtomic } from "../utils/fs.js";
import type { AMCSurface } from "./lifecycleRunArtifact.js";

export interface DecisionComponentRef {
  componentId: string;
  kind: "question" | "resource-manifest" | "evidence-request";
  role: "scored-subject" | "governed-resource" | "requested-evidence";
}

export interface DecisionReceipt {
  schemaVersion: "2026-05-22";
  receiptId: string;
  runId: string;
  lifecycleRunId: string;
  agentId: string;
  workspace: string;
  surface: "Score" | "Enforce";
  decisionType: "score-recommendation" | "evidence-request";
  command: string;
  createdAt: string;
  owner: AMCSurface | "operator";
  subject: {
    questionId: string | null;
    resourceManifestIds: string[];
    componentIds: string[];
  };
  components: DecisionComponentRef[];
  hypothesis: string;
  predictedOutcome: string;
  observedOutcome: string | null;
  observedRunId: string | null;
  observedAt: string | null;
  falsificationWindow: string;
  confidence: number;
  evidenceRefs: string[];
  experienceRefs: string[];
  rollbackPointer: string | null;
  status: "proposed" | "observed";
}

export interface WriteDecisionReceiptsInput {
  workspace: string;
  report: DiagnosticReport;
  command: string;
  resourceManifestIds?: string[];
}

export interface WriteDecisionReceiptsResult {
  receipts: DecisionReceipt[];
  receiptsPath: string;
}

export interface ObserveDecisionOutcomesResult {
  runId: string;
  scannedCount: number;
  updatedCount: number;
  updatedReceipts: DecisionReceipt[];
  receiptPaths: string[];
}

export function decisionReceiptsDir(workspace: string, agentId?: string): string {
  return join(getAgentPaths(workspace, agentId).rootDir, "decision-receipts");
}

export function decisionReceiptsPath(workspace: string, agentId: string | undefined, runId: string): string {
  return join(decisionReceiptsDir(workspace, agentId), `${runId}.json`);
}

function questionEvidence(report: DiagnosticReport, questionId: string): string[] {
  return report.questionScores.find((score) => score.questionId === questionId)?.evidenceEventIds ?? [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort();
}

function questionComponentId(questionId: string): string {
  return `score-question:${questionId}`;
}

function resourceManifestComponentId(manifestId: string): string {
  return `resource-manifest:${manifestId}`;
}

function evidenceRequestComponentId(runId: string, index: number): string {
  return `evidence-request:${runId}:${index + 1}`;
}

function buildComponents(input: {
  runId: string;
  questionId?: string | null;
  evidenceRequestIndex?: number;
  resourceManifestIds: string[];
}): DecisionComponentRef[] {
  const components: DecisionComponentRef[] = [];
  if (input.questionId) {
    components.push({
      componentId: questionComponentId(input.questionId),
      kind: "question",
      role: "scored-subject"
    });
  }
  if (typeof input.evidenceRequestIndex === "number") {
    components.push({
      componentId: evidenceRequestComponentId(input.runId, input.evidenceRequestIndex),
      kind: "evidence-request",
      role: "requested-evidence"
    });
  }
  for (const manifestId of input.resourceManifestIds) {
    components.push({
      componentId: resourceManifestComponentId(manifestId),
      kind: "resource-manifest",
      role: "governed-resource"
    });
  }
  return components;
}

function baseReceipt(input: {
  report: DiagnosticReport;
  workspace: string;
  command: string;
  surface: DecisionReceipt["surface"];
  owner: DecisionReceipt["owner"];
  decisionType: DecisionReceipt["decisionType"];
  receiptId: string;
  questionId: string | null;
  components: DecisionComponentRef[];
  hypothesis: string;
  predictedOutcome: string;
  confidence: number;
  evidenceRefs: string[];
  resourceManifestIds: string[];
  falsificationWindow: string;
}): DecisionReceipt {
  const componentIds = uniqueStrings(input.components.map((component) => component.componentId));
  return {
    schemaVersion: "2026-05-22",
    receiptId: input.receiptId,
    runId: input.report.runId,
    lifecycleRunId: `lifecycle-${input.report.runId}`,
    agentId: input.report.agentId,
    workspace: input.workspace,
    surface: input.surface,
    decisionType: input.decisionType,
    command: input.command,
    createdAt: new Date(input.report.ts).toISOString(),
    owner: input.owner,
    subject: {
      questionId: input.questionId,
      resourceManifestIds: input.resourceManifestIds,
      componentIds
    },
    components: input.components,
    hypothesis: input.hypothesis,
    predictedOutcome: input.predictedOutcome,
    observedOutcome: null,
    observedRunId: null,
    observedAt: null,
    falsificationWindow: input.falsificationWindow,
    confidence: input.confidence,
    evidenceRefs: input.evidenceRefs,
    experienceRefs: [],
    rollbackPointer: input.resourceManifestIds[0] ?? null,
    status: "proposed"
  };
}

export function buildDecisionReceipts(input: WriteDecisionReceiptsInput): DecisionReceipt[] {
  const workspace = resolve(input.workspace);
  const resourceManifestIds = input.resourceManifestIds ?? [];
  const receipts: DecisionReceipt[] = [];

  for (const gap of input.report.targetDiff.filter((item) => item.gap > 0).slice(0, 5)) {
    receipts.push(baseReceipt({
      report: input.report,
      workspace,
      receiptId: `decision-${input.report.runId}-${gap.questionId}`,
      surface: "Score",
      owner: "Score",
      decisionType: "score-recommendation",
      command: input.command,
      questionId: gap.questionId,
      components: buildComponents({ runId: input.report.runId, questionId: gap.questionId, resourceManifestIds }),
      hypothesis: `Improving ${gap.questionId} from L${gap.current} toward L${gap.target} should increase the full maturity score.`,
      predictedOutcome: `Close a ${gap.gap.toFixed(1)} level gap for ${gap.questionId}.`,
      falsificationWindow: "next full-score run",
      confidence: Math.max(0.1, Math.min(1, input.report.evidenceCoverage)),
      evidenceRefs: questionEvidence(input.report, gap.questionId),
      resourceManifestIds
    }));
  }

  for (const [index, item] of input.report.evidenceToCollectNext.slice(0, 5).entries()) {
    receipts.push(baseReceipt({
      report: input.report,
      workspace,
      receiptId: `decision-${input.report.runId}-evidence-${index + 1}`,
      surface: "Enforce",
      owner: "Enforce",
      decisionType: "evidence-request",
      command: input.command,
      questionId: null,
      components: buildComponents({ runId: input.report.runId, evidenceRequestIndex: index, resourceManifestIds }),
      hypothesis: item,
      predictedOutcome: "More observed evidence should increase confidence and reduce unsupported claims.",
      falsificationWindow: "next evidence collection or full-score run",
      confidence: 0.5,
      evidenceRefs: [],
      resourceManifestIds
    }));
  }

  return receipts;
}

export function writeDecisionReceipts(input: WriteDecisionReceiptsInput): WriteDecisionReceiptsResult {
  const receipts = buildDecisionReceipts(input);
  const receiptsPath = decisionReceiptsPath(input.workspace, input.report.agentId, input.report.runId);
  writeFileAtomic(receiptsPath, `${JSON.stringify(receipts, null, 2)}\n`, 0o644);
  return { receipts, receiptsPath };
}

export function listDecisionReceipts(input: { workspace: string; agentId?: string; limit?: number }): DecisionReceipt[] {
  const dir = decisionReceiptsDir(input.workspace, input.agentId);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .flatMap((entry) => JSON.parse(readUtf8(join(dir, entry))) as DecisionReceipt[])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, input.limit ?? Number.POSITIVE_INFINITY);
}

function decisionReceiptFiles(input: { workspace: string; agentId?: string }): string[] {
  const dir = decisionReceiptsDir(input.workspace, input.agentId);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => join(dir, entry))
    .sort();
}

function observedOutcomeForReceipt(receipt: DecisionReceipt, report: DiagnosticReport): {
  summary: string;
  evidenceRefs: string[];
} {
  const questionId = receipt.subject.questionId;
  if (questionId) {
    const score = report.questionScores.find((entry) => entry.questionId === questionId);
    if (!score) {
      return {
        summary: `Question ${questionId} was not scored in observed run ${report.runId}.`,
        evidenceRefs: []
      };
    }
    return {
      summary: `Observed ${questionId} at L${score.finalLevel} with ${(score.confidence * 100).toFixed(1)}% confidence in full-score run ${report.runId}.`,
      evidenceRefs: score.evidenceEventIds
    };
  }
  return {
    summary: `Observed evidence coverage ${(report.evidenceCoverage * 100).toFixed(1)}% with ${report.unsupportedClaimCount} unsupported claims in full-score run ${report.runId}.`,
    evidenceRefs: []
  };
}

export function observeDecisionOutcomes(input: {
  workspace: string;
  report: DiagnosticReport;
  agentId?: string;
}): ObserveDecisionOutcomesResult {
  const receiptPaths = decisionReceiptFiles({ workspace: input.workspace, agentId: input.agentId ?? input.report.agentId });
  const updatedReceipts: DecisionReceipt[] = [];
  let scannedCount = 0;

  for (const path of receiptPaths) {
    const receipts = JSON.parse(readUtf8(path)) as DecisionReceipt[];
    let changed = false;
    for (const receipt of receipts) {
      scannedCount += 1;
      if (receipt.runId === input.report.runId || receipt.status === "observed") {
        continue;
      }
      const observed = observedOutcomeForReceipt(receipt, input.report);
      receipt.observedOutcome = observed.summary;
      receipt.observedRunId = input.report.runId;
      receipt.observedAt = new Date(input.report.ts).toISOString();
      receipt.evidenceRefs = uniqueStrings([...(receipt.evidenceRefs ?? []), ...observed.evidenceRefs]);
      receipt.experienceRefs = uniqueStrings([...(receipt.experienceRefs ?? []), `experience-${input.report.runId}`]);
      receipt.status = "observed";
      updatedReceipts.push(receipt);
      changed = true;
    }
    if (changed) {
      writeFileAtomic(path, `${JSON.stringify(receipts, null, 2)}\n`, 0o644);
    }
  }

  return {
    runId: input.report.runId,
    scannedCount,
    updatedCount: updatedReceipts.length,
    updatedReceipts,
    receiptPaths
  };
}

export function loadDecisionReceipt(input: { workspace: string; selector: string; agentId?: string }): DecisionReceipt {
  const found = listDecisionReceipts({ workspace: input.workspace, agentId: input.agentId })
    .find((receipt) => receipt.receiptId === input.selector || receipt.runId === input.selector);
  if (!found) {
    throw new Error(`Decision receipt not found: ${input.selector}`);
  }
  return found;
}
