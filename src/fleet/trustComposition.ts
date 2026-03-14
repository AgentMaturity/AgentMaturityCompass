/**
 * Multi-Agent Trust Composition Engine
 *
 * Models how trust flows across orchestrator→worker delegations.
 * Composite trust is dependency-aware and bounded by weakest verified links.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import * as YAML from "yaml";
import { listAgents, loadAgentConfig } from "./registry.js";
import { fleetRoot } from "./paths.js";
import { openLedger } from "../ledger/ledger.js";
import { parseEvidenceEvent } from "../diagnostic/gates.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { getPrivateKeyPem, signHexDigest } from "../crypto/keys.js";
import type { DiagnosticReport, TrustLabel, RiskTier } from "../types.js";

// ---------------------------------------------------------------------------
// Schema & types
// ---------------------------------------------------------------------------

export type TrustInheritanceMode = "strict" | "weighted" | "no-inherit";

export const delegationEdgeSchema = z.object({
  id: z.string().min(1),
  fromAgentId: z.string().min(1),
  toAgentId: z.string().min(1),
  handoffId: z.string().min(1),
  purpose: z.string().min(1),
  riskTier: z.enum(["low", "med", "high", "critical"]),
  inheritanceMode: z.enum(["strict", "weighted", "no-inherit"]).default("strict"),
  weight: z.number().min(0).max(1).default(1),
  createdTs: z.number(),
});

export type DelegationEdge = z.infer<typeof delegationEdgeSchema>;

export const trustCompositionConfigSchema = z.object({
  schemaVersion: z.literal(1),
  defaultInheritanceMode: z.enum(["strict", "weighted", "no-inherit"]).default("strict"),
  defaultWeight: z.number().min(0).max(1).default(1),
  blastRadiusThreshold: z.number().min(0).max(1).default(0.3),
  edges: z.array(delegationEdgeSchema).default([]),
});

export type TrustCompositionConfig = z.infer<typeof trustCompositionConfigSchema>;

export interface AgentTrustSnapshot {
  agentId: string;
  integrityIndex: number;
  trustLabel: TrustLabel;
  overallScore: number;
  riskTier: RiskTier;
  layerScores: { layerName: string; avg: number }[];
  hasReport: boolean;
}

export interface CompositeTrustResult {
  agentId: string;
  ownIntegrityIndex: number;
  ownOverallScore: number;
  compositeIntegrityIndex: number;
  compositeOverallScore: number;
  compositeTrustLabel: TrustLabel;
  boundedBy: string | null; // agentId of weakest dependency, null if no deps
  dependencies: DependencyTrustDetail[];
  blastRadius: number; // 0-1, fraction of fleet affected if this agent degrades
  blastRadiusAgents: string[];
}

export interface DependencyTrustDetail {
  agentId: string;
  inheritanceMode: TrustInheritanceMode;
  weight: number;
  integrityIndex: number;
  overallScore: number;
  trustLabel: TrustLabel;
  handoffId: string;
}

export interface CrossAgentContradiction {
  contradictionId: string;
  agentA: string;
  agentB: string;
  questionId: string;
  agentALevel: number;
  agentBLevel: number;
  delta: number;
  severity: "LOW" | "MEDIUM" | "HIGH";
}

export interface TrustCompositionReport {
  reportId: string;
  ts: number;
  agentResults: CompositeTrustResult[];
  contradictions: CrossAgentContradiction[];
  dagValid: boolean;
  dagCycles: string[][];
  fleetCompositeScore: number;
  fleetWeakestLink: string | null;
  reportJsonSha256: string;
  reportSealSig: string;
}

// ---------------------------------------------------------------------------
// Config I/O
// ---------------------------------------------------------------------------

function configPath(workspace: string): string {
  return join(fleetRoot(workspace), "trust-composition.yaml");
}

export function initTrustComposition(workspace: string): TrustCompositionConfig {
  const config: TrustCompositionConfig = {
    schemaVersion: 1,
    defaultInheritanceMode: "strict",
    defaultWeight: 1,
    blastRadiusThreshold: 0.3,
    edges: [],
  };
  ensureDir(fleetRoot(workspace));
  writeFileAtomic(configPath(workspace), YAML.stringify(config), 0o644);
  return config;
}

export function loadTrustCompositionConfig(workspace: string): TrustCompositionConfig {
  const file = configPath(workspace);
  if (!pathExists(file)) {
    return initTrustComposition(workspace);
  }
  const raw = YAML.parse(readFileSync(file, "utf8")) as unknown;
  return trustCompositionConfigSchema.parse(raw);
}

export function saveTrustCompositionConfig(workspace: string, config: TrustCompositionConfig): void {
  writeFileAtomic(configPath(workspace), YAML.stringify(config), 0o644);
}

// ---------------------------------------------------------------------------
// Edge management
// ---------------------------------------------------------------------------

export function addDelegationEdge(
  workspace: string,
  params: {
    fromAgentId: string;
    toAgentId: string;
    purpose: string;
    riskTier?: RiskTier;
    inheritanceMode?: TrustInheritanceMode;
    weight?: number;
  },
): DelegationEdge {
  const config = loadTrustCompositionConfig(workspace);

  if (params.fromAgentId === params.toAgentId) {
    throw new Error("Self-delegation is not allowed");
  }

  const existing = config.edges.find(
    (e) => e.fromAgentId === params.fromAgentId && e.toAgentId === params.toAgentId,
  );
  if (existing) {
    throw new Error(
      `Delegation edge already exists: ${params.fromAgentId} → ${params.toAgentId} (id: ${existing.id})`,
    );
  }

  const edge: DelegationEdge = delegationEdgeSchema.parse({
    id: `edge_${randomUUID().slice(0, 12)}`,
    fromAgentId: params.fromAgentId,
    toAgentId: params.toAgentId,
    handoffId: `handoff_${randomUUID().slice(0, 8)}`,
    purpose: params.purpose,
    riskTier: params.riskTier ?? "med",
    inheritanceMode: params.inheritanceMode ?? config.defaultInheritanceMode,
    weight: params.weight ?? config.defaultWeight,
    createdTs: Date.now(),
  });

  config.edges.push(edge);

  // Validate no cycles before saving
  const cycles = detectCycles(config.edges);
  if (cycles.length > 0) {
    throw new Error(
      `Adding this edge would create a cycle: ${cycles[0]!.join(" → ")}`,
    );
  }

  saveTrustCompositionConfig(workspace, config);
  return edge;
}

export function removeDelegationEdge(workspace: string, edgeId: string): void {
  const config = loadTrustCompositionConfig(workspace);
  const idx = config.edges.findIndex((e) => e.id === edgeId);
  if (idx === -1) {
    throw new Error(`Edge not found: ${edgeId}`);
  }
  config.edges.splice(idx, 1);
  saveTrustCompositionConfig(workspace, config);
}

export function listDelegationEdges(workspace: string): DelegationEdge[] {
  return loadTrustCompositionConfig(workspace).edges;
}

// ---------------------------------------------------------------------------
// DAG validation
// ---------------------------------------------------------------------------

export function detectCycles(edges: DelegationEdge[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adj.has(edge.fromAgentId)) adj.set(edge.fromAgentId, []);
    adj.get(edge.fromAgentId)!.push(edge.toAgentId);
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];

  function dfs(node: string): void {
    if (inStack.has(node)) {
      const cycleStart = stack.indexOf(node);
      cycles.push([...stack.slice(cycleStart), node]);
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    inStack.add(node);
    stack.push(node);
    for (const neighbor of adj.get(node) ?? []) {
      dfs(neighbor);
    }
    stack.pop();
    inStack.delete(node);
  }

  const allNodes = new Set<string>();
  for (const edge of edges) {
    allNodes.add(edge.fromAgentId);
    allNodes.add(edge.toAgentId);
  }
  for (const node of allNodes) {
    dfs(node);
  }
  return cycles;
}

// ---------------------------------------------------------------------------
// Trust computation
// ---------------------------------------------------------------------------

function trustLabelFromIndex(idx: number): TrustLabel {
  if (idx >= 0.7) return "HIGH TRUST";
  if (idx >= 0.4) return "LOW TRUST";
  return "UNRELIABLE — DO NOT USE FOR CLAIMS";
}

function buildSnapshotMap(
  workspace: string,
  reports: DiagnosticReport[],
): Map<string, AgentTrustSnapshot> {
  const map = new Map<string, AgentTrustSnapshot>();

  for (const report of reports) {
    const overallScore =
      report.layerScores.reduce((sum, l) => sum + l.avgFinalLevel, 0) /
      Math.max(report.layerScores.length, 1);

    let riskTier: RiskTier = "med";
    try {
      const agentConfig = loadAgentConfig(workspace, report.agentId);
      riskTier = agentConfig.riskTier;
    } catch {
      /* default */
    }

    map.set(report.agentId, {
      agentId: report.agentId,
      integrityIndex: report.integrityIndex,
      trustLabel: report.trustLabel,
      overallScore,
      riskTier,
      layerScores: report.layerScores.map((l) => ({
        layerName: l.layerName,
        avg: l.avgFinalLevel,
      })),
      hasReport: true,
    });
  }

  return map;
}

function getDirectDependencies(
  agentId: string,
  edges: DelegationEdge[],
): DelegationEdge[] {
  return edges.filter((e) => e.fromAgentId === agentId);
}

function getTransitiveDependencies(
  agentId: string,
  edges: DelegationEdge[],
): Set<string> {
  const result = new Set<string>();
  const queue = [agentId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.fromAgentId === current && !result.has(edge.toAgentId)) {
        result.add(edge.toAgentId);
        queue.push(edge.toAgentId);
      }
    }
  }
  return result;
}

function getDependents(agentId: string, edges: DelegationEdge[]): Set<string> {
  const result = new Set<string>();
  const queue = [agentId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.toAgentId === current && !result.has(edge.fromAgentId)) {
        result.add(edge.fromAgentId);
        queue.push(edge.fromAgentId);
      }
    }
  }
  return result;
}

function computeCompositeForAgent(
  agentId: string,
  snapshots: Map<string, AgentTrustSnapshot>,
  edges: DelegationEdge[],
  allAgentIds: string[],
): CompositeTrustResult {
  const own = snapshots.get(agentId);
  const ownIntegrity = own?.integrityIndex ?? 0;
  const ownOverall = own?.overallScore ?? 0;

  const directDeps = getDirectDependencies(agentId, edges);

  if (directDeps.length === 0) {
    // Leaf agent — composite equals own
    const dependents = getDependents(agentId, edges);
    const blastRadius = allAgentIds.length > 1
      ? dependents.size / (allAgentIds.length - 1)
      : 0;

    return {
      agentId,
      ownIntegrityIndex: ownIntegrity,
      ownOverallScore: ownOverall,
      compositeIntegrityIndex: ownIntegrity,
      compositeOverallScore: ownOverall,
      compositeTrustLabel: own?.trustLabel ?? trustLabelFromIndex(ownIntegrity),
      boundedBy: null,
      dependencies: [],
      blastRadius,
      blastRadiusAgents: [...dependents],
    };
  }

  const depDetails: DependencyTrustDetail[] = [];
  let weakestIntegrity = ownIntegrity;
  let weakestAgent: string | null = null;

  for (const edge of directDeps) {
    const depSnapshot = snapshots.get(edge.toAgentId);
    const depIntegrity = depSnapshot?.integrityIndex ?? 0;
    const depOverall = depSnapshot?.overallScore ?? 0;

    depDetails.push({
      agentId: edge.toAgentId,
      inheritanceMode: edge.inheritanceMode,
      weight: edge.weight,
      integrityIndex: depIntegrity,
      overallScore: depOverall,
      trustLabel: depSnapshot?.trustLabel ?? trustLabelFromIndex(depIntegrity),
      handoffId: edge.handoffId,
    });

    if (depIntegrity < weakestIntegrity) {
      weakestIntegrity = depIntegrity;
      weakestAgent = edge.toAgentId;
    }
  }

  // Compute composite based on inheritance mode
  let compositeIntegrity: number;
  let compositeOverall: number;

  // Check if any edge uses no-inherit
  const hasNoInherit = directDeps.some((e) => e.inheritanceMode === "no-inherit");
  const hasWeighted = directDeps.some((e) => e.inheritanceMode === "weighted");

  if (hasNoInherit && !hasWeighted && directDeps.every((e) => e.inheritanceMode === "no-inherit")) {
    // All no-inherit — composite equals own
    compositeIntegrity = ownIntegrity;
    compositeOverall = ownOverall;
    weakestAgent = null;
  } else if (hasWeighted || directDeps.some((e) => e.inheritanceMode === "weighted")) {
    // Weighted mode: weighted average of deps factored in
    let totalWeight = 1; // own weight
    let weightedSum = ownIntegrity;
    let weightedOverall = ownOverall;

    for (const dep of depDetails) {
      if (dep.inheritanceMode === "no-inherit") continue;
      const w = dep.inheritanceMode === "weighted" ? dep.weight : 1;
      totalWeight += w;
      weightedSum += dep.integrityIndex * w;
      weightedOverall += dep.overallScore * w;
    }

    compositeIntegrity = weightedSum / totalWeight;
    compositeOverall = weightedOverall / totalWeight;
  } else {
    // Strict mode (default): bounded by weakest
    compositeIntegrity = Math.min(ownIntegrity, weakestIntegrity);
    compositeOverall = ownOverall; // overall score stays own, integrity is bounded
  }

  // Blast radius: who depends on this agent (transitively)
  const dependents = getDependents(agentId, edges);
  const blastRadius = allAgentIds.length > 1
    ? dependents.size / (allAgentIds.length - 1)
    : 0;

  return {
    agentId,
    ownIntegrityIndex: ownIntegrity,
    ownOverallScore: ownOverall,
    compositeIntegrityIndex: compositeIntegrity,
    compositeOverallScore: compositeOverall,
    compositeTrustLabel: trustLabelFromIndex(compositeIntegrity),
    boundedBy: weakestAgent,
    dependencies: depDetails,
    blastRadius,
    blastRadiusAgents: [...dependents],
  };
}

// ---------------------------------------------------------------------------
// Cross-agent contradiction detection
// ---------------------------------------------------------------------------

function detectCrossAgentContradictions(
  reports: DiagnosticReport[],
): CrossAgentContradiction[] {
  const contradictions: CrossAgentContradiction[] = [];

  for (let i = 0; i < reports.length; i++) {
    for (let j = i + 1; j < reports.length; j++) {
      const a = reports[i]!;
      const b = reports[j]!;

      for (const scoreA of a.questionScores) {
        const scoreB = b.questionScores.find((s) => s.questionId === scoreA.questionId);
        if (!scoreB) continue;

        const delta = Math.abs(scoreA.finalLevel - scoreB.finalLevel);
        if (delta < 2) continue; // only flag significant differences

        let severity: "LOW" | "MEDIUM" | "HIGH" = "LOW";
        if (delta >= 4) severity = "HIGH";
        else if (delta >= 3) severity = "MEDIUM";

        contradictions.push({
          contradictionId: `cxc_${randomUUID().slice(0, 12)}`,
          agentA: a.agentId,
          agentB: b.agentId,
          questionId: scoreA.questionId,
          agentALevel: scoreA.finalLevel,
          agentBLevel: scoreB.finalLevel,
          delta,
          severity,
        });
      }
    }
  }

  return contradictions.sort((a, b) => b.delta - a.delta);
}

// ---------------------------------------------------------------------------
// Receipt chain verification (cross-agent)
// ---------------------------------------------------------------------------

export interface CrossAgentReceiptChain {
  fromAgentId: string;
  toAgentId: string;
  handoffId: string;
  fromReceiptCount: number;
  toReceiptCount: number;
  matchedReceipts: number;
  chainCoverage: number; // 0-1 ratio of matched/total
  gaps: string[];
}

export function verifyCrossAgentReceipts(
  workspace: string,
  edges: DelegationEdge[],
  windowStartTs: number,
  windowEndTs: number,
): CrossAgentReceiptChain[] {
  const ledger = openLedger(workspace);
  const events = ledger.getEventsBetween(windowStartTs, windowEndTs).map(parseEvidenceEvent);
  ledger.close();

  const chains: CrossAgentReceiptChain[] = [];

  for (const edge of edges) {
    const fromEvents = events.filter(
      (e) =>
        e.meta.agentId === edge.fromAgentId &&
        (e.event_type === "tool_action" || e.event_type === "llm_request"),
    );
    const toEvents = events.filter(
      (e) =>
        e.meta.agentId === edge.toAgentId &&
        (e.event_type === "tool_result" || e.event_type === "llm_response"),
    );

    // Simple temporal matching: events within 60s windows
    let matched = 0;
    const gaps: string[] = [];
    for (const fe of fromEvents) {
      const hasCorrespondingTo = toEvents.some(
        (te) => Math.abs(te.ts - fe.ts) < 60_000,
      );
      if (hasCorrespondingTo) {
        matched++;
      } else {
        gaps.push(`No matching receipt from ${edge.toAgentId} for event ${fe.id} at ${new Date(fe.ts).toISOString()}`);
      }
    }

    const total = Math.max(fromEvents.length, 1);
    chains.push({
      fromAgentId: edge.fromAgentId,
      toAgentId: edge.toAgentId,
      handoffId: edge.handoffId,
      fromReceiptCount: fromEvents.length,
      toReceiptCount: toEvents.length,
      matchedReceipts: matched,
      chainCoverage: matched / total,
      gaps: gaps.slice(0, 20), // cap gap list
    });
  }

  return chains;
}

// ---------------------------------------------------------------------------
// Main report generation
// ---------------------------------------------------------------------------

export function computeTrustComposition(
  workspace: string,
  reports: DiagnosticReport[],
): TrustCompositionReport {
  const config = loadTrustCompositionConfig(workspace);
  const snapshots = buildSnapshotMap(workspace, reports);
  const allAgentIds = reports.map((r) => r.agentId);

  // Validate DAG
  const cycles = detectCycles(config.edges);
  const dagValid = cycles.length === 0;

  // Compute per-agent composite trust
  const agentResults: CompositeTrustResult[] = [];
  for (const agentId of allAgentIds) {
    agentResults.push(
      computeCompositeForAgent(agentId, snapshots, config.edges, allAgentIds),
    );
  }

  // Detect cross-agent contradictions
  const contradictions = detectCrossAgentContradictions(reports);

  // Fleet-wide composite
  const fleetCompositeScore =
    agentResults.length > 0
      ? agentResults.reduce((sum, r) => sum + r.compositeIntegrityIndex, 0) /
        agentResults.length
      : 0;

  const weakest = agentResults.reduce(
    (min, r) =>
      r.compositeIntegrityIndex < (min?.compositeIntegrityIndex ?? Infinity)
        ? r
        : min,
    agentResults[0] ?? null,
  );

  const reportId = `tcr_${randomUUID().slice(0, 12)}`;
  const ts = Date.now();

  const reportBody = {
    reportId,
    ts,
    agentResults,
    contradictions,
    dagValid,
    dagCycles: cycles,
    fleetCompositeScore,
    fleetWeakestLink: weakest?.agentId ?? null,
  };

  const reportJsonSha256 = sha256Hex(Buffer.from(canonicalize(reportBody), "utf8"));
  let reportSealSig = "";
  try {
    reportSealSig = signHexDigest(reportJsonSha256, getPrivateKeyPem(workspace, "auditor"));
  } catch {
    reportSealSig = "unsigned";
  }

  return {
    ...reportBody,
    reportJsonSha256,
    reportSealSig,
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function saveTrustCompositionReport(
  workspace: string,
  report: TrustCompositionReport,
): string {
  const reportsDir = join(fleetRoot(workspace), "reports");
  ensureDir(reportsDir);
  const filePath = join(reportsDir, `trust-composition-${report.reportId}.json`);
  writeFileAtomic(filePath, JSON.stringify(report, null, 2), 0o644);
  return filePath;
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

export function renderTrustCompositionMarkdown(report: TrustCompositionReport): string {
  const lines: string[] = [
    "# Trust Composition Report",
    "",
    `- Report ID: ${report.reportId}`,
    `- Timestamp: ${new Date(report.ts).toISOString()}`,
    `- DAG Valid: ${report.dagValid ? "YES" : "NO — cycles detected"}`,
    `- Fleet Composite Score: ${report.fleetCompositeScore.toFixed(3)}`,
    `- Weakest Link: ${report.fleetWeakestLink ?? "none"}`,
    "",
  ];

  if (report.dagCycles.length > 0) {
    lines.push("## DAG Cycles (INVALID)");
    for (const cycle of report.dagCycles) {
      lines.push(`- ${cycle.join(" → ")}`);
    }
    lines.push("");
  }

  lines.push("## Per-Agent Composite Trust");
  lines.push("| Agent | Own Integrity | Composite Integrity | Trust Label | Bounded By | Blast Radius |");
  lines.push("|---|---:|---:|---|---|---:|");
  for (const r of report.agentResults) {
    lines.push(
      `| ${r.agentId} | ${r.ownIntegrityIndex.toFixed(3)} | ${r.compositeIntegrityIndex.toFixed(3)} | ${r.compositeTrustLabel} | ${r.boundedBy ?? "-"} | ${(r.blastRadius * 100).toFixed(1)}% |`,
    );
  }
  lines.push("");

  // Dependencies detail
  const withDeps = report.agentResults.filter((r) => r.dependencies.length > 0);
  if (withDeps.length > 0) {
    lines.push("## Delegation Dependencies");
    for (const r of withDeps) {
      lines.push(`### ${r.agentId}`);
      lines.push("| Worker | Mode | Weight | Integrity | Trust Label | Handoff |");
      lines.push("|---|---|---:|---:|---|---|");
      for (const dep of r.dependencies) {
        lines.push(
          `| ${dep.agentId} | ${dep.inheritanceMode} | ${dep.weight.toFixed(2)} | ${dep.integrityIndex.toFixed(3)} | ${dep.trustLabel} | ${dep.handoffId} |`,
        );
      }
      lines.push("");
    }
  }

  if (report.contradictions.length > 0) {
    lines.push("## Cross-Agent Contradictions");
    lines.push("| Agent A | Agent B | Question | A Level | B Level | Delta | Severity |");
    lines.push("|---|---|---|---:|---:|---:|---|");
    for (const c of report.contradictions) {
      lines.push(
        `| ${c.agentA} | ${c.agentB} | ${c.questionId} | ${c.agentALevel} | ${c.agentBLevel} | ${c.delta} | ${c.severity} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
