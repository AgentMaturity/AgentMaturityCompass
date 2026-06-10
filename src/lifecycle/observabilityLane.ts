import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { getAgentPaths } from "../fleet/paths.js";
import {
  loadEnforceResourceManifest,
  type EnforceResourceKind,
  type EnforceResourceManifestRef
} from "../enforce/resourceManifest.js";
import type { DiagnosticReport } from "../types.js";
import { readUtf8, writeFileAtomic } from "../utils/fs.js";
import { trySignArtifactFile } from "./artifactSignature.js";
import type { DecisionReceipt } from "./decisionReceipt.js";
import type { EpisodeRecord } from "./episodeRecord.js";

export type ObservabilityComponentKind =
  | EnforceResourceKind
  | "question"
  | "decision"
  | "experience";

export type ExperienceSignalSource =
  | "trace"
  | "failed-evaluation"
  | "user-action"
  | "support-observation"
  | "studio-event"
  | "cli-event"
  | "score-run"
  | "decision";

export interface ComponentAttribution {
  componentId: string;
  kind: ObservabilityComponentKind;
  label: string;
  refs: string[];
  questionIds: string[];
  evidenceRefs: string[];
  contribution: "score-gap" | "runtime-evidence" | "governed-resource" | "decision-context";
  risk: "critical" | "high" | "medium" | "low" | "unknown";
}

export interface ExperienceSignal {
  signalId: string;
  source: ExperienceSignalSource;
  ts: string;
  summary: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  questionIds: string[];
  evidenceRefs: string[];
  outcome: "success" | "failure" | "unknown";
  trustTier: "observed" | "attested" | "self-reported" | "derived";
}

export interface DecisionChainEntry {
  receiptId: string;
  runId: string;
  surface: DecisionReceipt["surface"];
  decisionType: DecisionReceipt["decisionType"];
  status: DecisionReceipt["status"];
  owner: DecisionReceipt["owner"];
  predictedOutcome: string;
  observedOutcome: string | null;
  observedRunId: string | null;
  confidence: number;
  componentIds: string[];
  evidenceRefs: string[];
  rollbackPointer: string | null;
}

export interface ObservabilityLaneRef {
  observabilityId: string;
  path: string;
  componentCount: number;
  experienceSignalCount: number;
  decisionCount: number;
}

export interface ObservabilityLaneRecord {
  schemaVersion: "2026-05-22";
  observabilityId: string;
  runId: string;
  lifecycleRunId: string;
  agentId: string;
  workspace: string;
  source: EpisodeRecord["source"];
  command: string;
  createdAt: string;
  surfaces: ["Score", "Watch", "Vault"];
  episodeIds: string[];
  lifecycleReceiptIds: string[];
  resourceManifestIds: string[];
  componentAttribution: ComponentAttribution[];
  experienceCorpus: ExperienceSignal[];
  decisionChain: DecisionChainEntry[];
  observedDecisionReceiptIds: string[];
  summary: {
    componentCount: number;
    highRiskComponentCount: number;
    experienceSignalCount: number;
    decisionCount: number;
    proposedDecisionCount: number;
    observedDecisionCount: number;
  };
}

export interface WriteObservabilityLaneInput {
  workspace: string;
  report: DiagnosticReport;
  source: EpisodeRecord["source"];
  command: string;
  episodeIds?: string[];
  lifecycleReceiptIds?: string[];
  resourceManifests?: EnforceResourceManifestRef[];
  decisionReceipts?: DecisionReceipt[];
  observedDecisionReceiptIds?: string[];
}

export interface WriteObservabilityLaneResult {
  record: ObservabilityLaneRecord;
  recordPath: string;
  signaturePath: string | null;
  ref: ObservabilityLaneRef;
}

export function observabilityLaneDir(workspace: string, agentId?: string): string {
  return join(getAgentPaths(workspace, agentId).rootDir, "observability-lane");
}

export function observabilityLanePath(workspace: string, agentId: string | undefined, runId: string): string {
  return join(observabilityLaneDir(workspace, agentId), `${runId}.json`);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort();
}

function riskForQuestion(finalLevel: number, flags: string[]): ComponentAttribution["risk"] {
  if (finalLevel <= 1 || flags.length > 1) return "high";
  if (finalLevel < 3 || flags.length > 0) return "medium";
  return "low";
}

function riskForResource(kind: EnforceResourceKind, mutable: boolean): ComponentAttribution["risk"] {
  if (kind === "policy" || kind === "guardrail" || kind === "router") return mutable ? "high" : "medium";
  if (kind === "prompt" || kind === "tool" || kind === "memory" || kind === "code") return "medium";
  return "low";
}

function buildQuestionComponents(report: DiagnosticReport): ComponentAttribution[] {
  const materialQuestions = new Set<string>();
  for (const gap of report.targetDiff.filter((item) => item.gap > 0).slice(0, 20)) {
    materialQuestions.add(gap.questionId);
  }
  for (const score of report.questionScores.filter((item) => item.finalLevel < 3 || item.flags.length > 0).slice(0, 20)) {
    materialQuestions.add(score.questionId);
  }

  const components: ComponentAttribution[] = [];
  for (const questionId of materialQuestions) {
    const score = report.questionScores.find((item) => item.questionId === questionId);
    if (!score) continue;
    components.push({
      componentId: `score-question:${questionId}`,
      kind: "question",
      label: questionId,
      refs: [`run:${report.runId}`],
      questionIds: [questionId],
      evidenceRefs: score.evidenceEventIds,
      contribution: "score-gap",
      risk: riskForQuestion(score.finalLevel, score.flags)
    });
  }
  return components;
}

function buildResourceComponents(refs: EnforceResourceManifestRef[] | undefined): ComponentAttribution[] {
  const components: ComponentAttribution[] = [];
  for (const ref of refs ?? []) {
    if (!existsSync(ref.path)) {
      components.push({
        componentId: `resource-manifest:${ref.manifestId}`,
        kind: "decision",
        label: ref.manifestId,
        refs: [ref.path],
        questionIds: [],
        evidenceRefs: [],
        contribution: "governed-resource",
        risk: "unknown"
      });
      continue;
    }
    const manifest = loadEnforceResourceManifest(ref.path);
    for (const resource of manifest.resources) {
      components.push({
        componentId: resource.id,
        kind: resource.kind,
        label: resource.path,
        refs: [ref.manifestId, resource.digest ?? resource.path],
        questionIds: [],
        evidenceRefs: resource.evidenceRefs,
        contribution: "governed-resource",
        risk: riskForResource(resource.kind, resource.mutable)
      });
    }
  }
  return components;
}

function buildDecisionComponents(receipts: DecisionReceipt[] | undefined): ComponentAttribution[] {
  return (receipts ?? []).slice(0, 50).map((receipt) => ({
    componentId: `decision:${receipt.receiptId}`,
    kind: "decision",
    label: receipt.decisionType,
    refs: [receipt.receiptId, receipt.runId],
    questionIds: receipt.subject.questionId ? [receipt.subject.questionId] : [],
    evidenceRefs: receipt.evidenceRefs,
    contribution: "decision-context",
    risk: receipt.status === "proposed" ? "medium" : "low"
  }));
}

function buildExperienceCorpus(input: WriteObservabilityLaneInput): ExperienceSignal[] {
  const report = input.report;
  const createdAt = new Date(report.ts).toISOString();
  const signals: ExperienceSignal[] = [{
    signalId: `experience-${report.runId}`,
    source: input.source === "studio" ? "studio-event" : input.source === "cli" ? "cli-event" : "score-run",
    ts: createdAt,
    summary: `Full-score run ${report.runId} completed with status ${report.status}.`,
    severity: report.status === "VALID" ? "info" : "medium",
    questionIds: [],
    evidenceRefs: [],
    outcome: report.status === "INVALID" ? "failure" : "success",
    trustTier: "derived"
  }];

  const evidenceRefs = uniqueStrings(report.questionScores.flatMap((score) => score.evidenceEventIds)).slice(0, 40);
  for (const evidenceRef of evidenceRefs) {
    signals.push({
      signalId: `experience-${report.runId}-trace-${evidenceRef}`,
      source: "trace",
      ts: createdAt,
      summary: `Evidence trace ${evidenceRef} contributed to the score.`,
      severity: "info",
      questionIds: report.questionScores.filter((score) => score.evidenceEventIds.includes(evidenceRef)).map((score) => score.questionId),
      evidenceRefs: [evidenceRef],
      outcome: "unknown",
      trustTier: "observed"
    });
  }

  for (const score of report.questionScores.filter((item) => item.finalLevel < 3 || item.flags.length > 0).slice(0, 20)) {
    signals.push({
      signalId: `experience-${report.runId}-eval-${score.questionId}`,
      source: "failed-evaluation",
      ts: createdAt,
      summary: `${score.questionId} scored L${score.finalLevel}: ${score.narrative}`,
      severity: score.finalLevel <= 1 ? "high" : "medium",
      questionIds: [score.questionId],
      evidenceRefs: score.evidenceEventIds,
      outcome: "failure",
      trustTier: "derived"
    });
  }

  for (const [index, request] of report.evidenceToCollectNext.slice(0, 10).entries()) {
    signals.push({
      signalId: `experience-${report.runId}-support-${index + 1}`,
      source: "support-observation",
      ts: createdAt,
      summary: request,
      severity: "medium",
      questionIds: [],
      evidenceRefs: [],
      outcome: "unknown",
      trustTier: "derived"
    });
  }

  for (const receipt of (input.decisionReceipts ?? []).slice(0, 20)) {
    signals.push({
      signalId: `experience-${report.runId}-decision-${receipt.receiptId}`,
      source: "decision",
      ts: receipt.createdAt,
      summary: receipt.observedOutcome ?? receipt.predictedOutcome,
      severity: receipt.status === "observed" ? "low" : "medium",
      questionIds: receipt.subject.questionId ? [receipt.subject.questionId] : [],
      evidenceRefs: receipt.evidenceRefs,
      outcome: receipt.status === "observed" ? "success" : "unknown",
      trustTier: "derived"
    });
  }

  return signals;
}

function buildDecisionChain(receipts: DecisionReceipt[] | undefined): DecisionChainEntry[] {
  return (receipts ?? []).map((receipt) => ({
    receiptId: receipt.receiptId,
    runId: receipt.runId,
    surface: receipt.surface,
    decisionType: receipt.decisionType,
    status: receipt.status,
    owner: receipt.owner ?? receipt.surface,
    predictedOutcome: receipt.predictedOutcome,
    observedOutcome: receipt.observedOutcome,
    observedRunId: receipt.observedRunId ?? null,
    confidence: receipt.confidence,
    componentIds: receipt.subject.componentIds ?? [],
    evidenceRefs: receipt.evidenceRefs,
    rollbackPointer: receipt.rollbackPointer ?? null
  }));
}

export function buildObservabilityLaneRecord(input: WriteObservabilityLaneInput): ObservabilityLaneRecord {
  const workspace = resolve(input.workspace);
  const report = input.report;
  const componentAttribution = [
    ...buildQuestionComponents(report),
    ...buildResourceComponents(input.resourceManifests),
    ...buildDecisionComponents(input.decisionReceipts)
  ];
  const experienceCorpus = buildExperienceCorpus(input);
  const decisionChain = buildDecisionChain(input.decisionReceipts);
  const observedDecisionCount = decisionChain.filter((entry) => entry.status === "observed").length;
  const proposedDecisionCount = decisionChain.filter((entry) => entry.status === "proposed").length;
  const highRiskComponentCount = componentAttribution.filter((component) => component.risk === "critical" || component.risk === "high").length;

  return {
    schemaVersion: "2026-05-22",
    observabilityId: `observability-${report.runId}`,
    runId: report.runId,
    lifecycleRunId: `lifecycle-${report.runId}`,
    agentId: report.agentId,
    workspace,
    source: input.source,
    command: input.command,
    createdAt: new Date(report.ts).toISOString(),
    surfaces: ["Score", "Watch", "Vault"],
    episodeIds: input.episodeIds ?? [],
    lifecycleReceiptIds: input.lifecycleReceiptIds ?? [],
    resourceManifestIds: (input.resourceManifests ?? []).map((ref) => ref.manifestId),
    componentAttribution,
    experienceCorpus,
    decisionChain,
    observedDecisionReceiptIds: input.observedDecisionReceiptIds ?? [],
    summary: {
      componentCount: componentAttribution.length,
      highRiskComponentCount,
      experienceSignalCount: experienceCorpus.length,
      decisionCount: decisionChain.length,
      proposedDecisionCount,
      observedDecisionCount
    }
  };
}

export function observabilityLaneRef(result: WriteObservabilityLaneResult): ObservabilityLaneRef {
  return {
    observabilityId: result.record.observabilityId,
    path: result.recordPath,
    componentCount: result.record.summary.componentCount,
    experienceSignalCount: result.record.summary.experienceSignalCount,
    decisionCount: result.record.summary.decisionCount
  };
}

export function writeObservabilityLaneRecord(input: WriteObservabilityLaneInput): WriteObservabilityLaneResult {
  const record = buildObservabilityLaneRecord(input);
  const recordPath = observabilityLanePath(input.workspace, input.report.agentId, input.report.runId);
  writeFileAtomic(recordPath, `${JSON.stringify(record, null, 2)}\n`, 0o644);
  const signed = trySignArtifactFile({ workspace: input.workspace, path: recordPath, artifactKind: "observability-lane" });
  const result = {
    record,
    recordPath,
    signaturePath: signed?.sigPath ?? null,
    ref: {
      observabilityId: record.observabilityId,
      path: recordPath,
      componentCount: record.summary.componentCount,
      experienceSignalCount: record.summary.experienceSignalCount,
      decisionCount: record.summary.decisionCount
    }
  };
  return result;
}

export function listObservabilityLaneRecords(input: {
  workspace: string;
  agentId?: string;
  limit?: number;
}): ObservabilityLaneRecord[] {
  const dir = observabilityLaneDir(input.workspace, input.agentId);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => JSON.parse(readUtf8(join(dir, entry))) as ObservabilityLaneRecord)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, input.limit ?? Number.POSITIVE_INFINITY);
}

export function loadObservabilityLaneRecord(input: {
  workspace: string;
  selector: string;
  agentId?: string;
}): ObservabilityLaneRecord {
  const dir = observabilityLaneDir(input.workspace, input.agentId);
  const directRunId = input.selector.startsWith("observability-") ? input.selector.slice("observability-".length) : input.selector;
  const directPath = join(dir, `${directRunId}.json`);
  if (existsSync(directPath)) {
    return JSON.parse(readUtf8(directPath)) as ObservabilityLaneRecord;
  }
  const found = listObservabilityLaneRecords({ workspace: input.workspace, agentId: input.agentId })
    .find((record) => record.observabilityId === input.selector || record.runId === input.selector || record.lifecycleRunId === input.selector);
  if (!found) {
    throw new Error(`Observability lane record not found: ${input.selector}`);
  }
  return found;
}

function redactWorkspacePath(path: string, workspace: string): string {
  const root = resolve(workspace);
  const full = resolve(path);
  if (full === root) return "$WORKSPACE";
  if (full.startsWith(`${root}/`)) {
    return `$WORKSPACE/${full.slice(root.length + 1)}`;
  }
  return path;
}

export function redactObservabilityLaneRecord(record: ObservabilityLaneRecord): ObservabilityLaneRecord {
  return {
    ...record,
    workspace: "$WORKSPACE",
    componentAttribution: record.componentAttribution.map((component) => ({
      ...component,
      refs: component.refs.map((ref) => redactWorkspacePath(ref, record.workspace))
    }))
  };
}
