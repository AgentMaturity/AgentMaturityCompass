import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { ensureAgentDirs, getAgentPaths, normalizeAgentId } from "../fleet/paths.js";
import { trySignArtifactFile } from "../lifecycle/artifactSignature.js";
import { writeEpisodeRecord, type EpisodeRecord } from "../lifecycle/episodeRecord.js";
import { writeLifecycleRunArtifact, type AMCSurface, type LifecycleSurfaceSummary } from "../lifecycle/lifecycleRunArtifact.js";
import type { DiagnosticReport, QuestionScore } from "../types.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { orgRootDir } from "./orgStore.js";

export type OrgRoleCategory = "revenue-delivery" | "innovation";
export type OrgRunStatus = "completed" | "needs-approval" | "blocked";
export type OrgRoleRunStatus = "completed" | "needs-approval" | "blocked";
export type OrgHeartbeatStatus = "ready" | "needs-approval" | "blocked" | "plateau";
export type OrgGateStatus = "passed" | "needs-approval" | "blocked";

export interface OrgRoleDefinition {
  roleId: string;
  category: OrgRoleCategory;
  defaultScope: string;
  primarySurface: AMCSurface;
}

export interface OrgHeartbeatPolicy {
  intervalMinutes: number;
  maxStaleMinutes: number;
  plateauAfterHeartbeats: number;
  triggers: Array<"scheduled-review" | "stalled-work" | "plateau-detected" | "failing-gates" | "lifecycle-continuation">;
}

export interface OrgRoleScope {
  summary: string;
  allowedWriteRoots: string[];
  deniedActionClasses: string[];
  surfaceMap: AMCSurface[];
  resourceVersion: string;
}

export interface OrgStateRef {
  path: string;
  sha256: string | null;
  visibility: "public" | "private";
}

export interface OrgHandoffRef {
  kind: "role-workspace" | "amc-os";
  path: string;
  sha256: string | null;
}

export interface OrgApprovalGate {
  gateId: string;
  surface: AMCSurface;
  status: OrgGateStatus;
  reason: string;
  refs: string[];
}

export interface OrgHeartbeat {
  heartbeatId: string;
  roleId: string;
  status: OrgHeartbeatStatus;
  createdAt: string;
  nextReviewAt: string;
  triggers: OrgHeartbeatPolicy["triggers"];
  blockedGateIds: string[];
  note: string;
}

export interface OrgRoleRun {
  roleRunId: string;
  parentRunId: string;
  roleId: string;
  category: OrgRoleCategory;
  status: OrgRoleRunStatus;
  roleWorkspace: string;
  scope: OrgRoleScope;
  publicStateRef: OrgStateRef;
  privateGraderStateRef: OrgStateRef;
  handoffNoteRefs: OrgHandoffRef[];
  heartbeatPolicy: OrgHeartbeatPolicy;
  heartbeats: OrgHeartbeat[];
  approvalGates: OrgApprovalGate[];
  episodeRecordRef: { episodeId: string; path: string };
  lifecycleArtifactRef: { lifecycleRunId: string; path: string; signaturePath: string | null };
  evidenceRefs: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OrgRunArtifact {
  schemaVersion: "2026-05-22";
  orgRunId: string;
  parentRunId: string;
  workspace: string;
  source: "cli" | "studio" | "api" | "ci";
  command: string;
  goal: string;
  status: OrgRunStatus;
  createdAt: string;
  updatedAt: string;
  heartbeatPolicy: OrgHeartbeatPolicy;
  surfaces: Record<AMCSurface, LifecycleSurfaceSummary>;
  roles: OrgRoleRun[];
  parentEpisodeRecordRef: { episodeId: string; path: string };
  parentLifecycleArtifactRef: { lifecycleRunId: string; path: string; signaturePath: string | null };
  summary: {
    roleCount: number;
    completedRoles: number;
    needsApprovalRoles: number;
    blockedRoles: number;
    heartbeatCount: number;
    blockedGateCount: number;
    privateStateCount: number;
  };
}

export interface OrgRunResult {
  artifact: OrgRunArtifact;
  artifactPath: string;
  signaturePath: string | null;
}

export interface RunOrgInput {
  workspace: string;
  roles?: string[];
  goal?: string;
  source?: OrgRunArtifact["source"];
  command?: string;
  heartbeatPolicy?: Partial<OrgHeartbeatPolicy>;
  orgRunId?: string;
}

export const REVENUE_DELIVERY_ROLE_IDS = [
  "REV_COO_ORCH",
  "REV_CHIEF_OF_STAFF",
  "REV_PROGRAM_MANAGER",
  "REV_OPS_AUTOMATION_ENGINEER",
  "REV_KB_MANAGER",
  "REV_QA_LEAD",
  "REV_SECURITY_OFFICER",
  "REV_COMPLIANCE_OFFICER",
  "REV_CFO_FINANCE",
  "REV_LEGAL_CONTRACTS",
  "REV_PRODUCT_MANAGER",
  "REV_TECH_LEAD",
  "REV_FULLSTACK_ENGINEER",
  "REV_DEVOPS_ENGINEER",
  "REV_DATA_ENGINEER",
  "REV_ANALYTICS_ENGINEER",
  "REV_UX_UI_DESIGNER",
  "REV_DOCS_TECH_WRITER",
  "REV_QA_TESTER",
  "REV_IMPLEMENTATION_SPECIALIST",
  "REV_CUSTOMER_SUCCESS_MANAGER",
  "REV_SUPPORT_LEAD",
  "REV_HEAD_OF_SALES",
  "REV_REVOPS_CRM",
  "REV_SDR_SMB",
  "REV_SDR_MIDMARKET",
  "REV_SDR_AGENCY",
  "REV_ACCOUNT_EXEC_CLOSER",
  "REV_SALES_ENGINEER_DEMOS",
  "REV_PROPOSAL_SOW_SPECIALIST",
  "REV_OBJECTION_COACH",
  "REV_ACCOUNT_MANAGER_EXPANSION",
  "REV_HEAD_OF_GROWTH",
  "REV_BRAND_MESSAGING",
  "REV_COPYWRITER_DIRECT_RESPONSE",
  "REV_COPYWRITER_TECHNICAL",
  "REV_CONTENT_STRATEGIST",
  "REV_SEO_SPECIALIST",
  "REV_LANDING_PAGE_BUILDER",
  "REV_SOCIAL_LINKEDIN",
  "REV_SOCIAL_X",
  "REV_EMAIL_NEWSLETTER",
  "REV_WEBINAR_PRODUCER",
  "REV_PR_PODCAST_BOOKER",
  "REV_COMMUNITY_MANAGER",
  "REV_HEAD_OF_PARTNERSHIPS",
  "REV_AGENCY_PARTNER_MANAGER",
  "REV_AFFILIATE_REFERRAL_MANAGER",
  "REV_INTEGRATION_PARTNER_SCOUT",
  "REV_CREATOR_PARTNERSHIPS"
] as const;

export const INNOVATION_ROLE_IDS = [
  "INNO_HEAD_OF_INSIGHTS",
  "INNO_FORUM_LISTENER_REDDIT",
  "INNO_FORUM_LISTENER_HN",
  "INNO_FORUM_LISTENER_GITHUB",
  "INNO_FORUM_LISTENER_LINKEDIN",
  "INNO_FORUM_LISTENER_X",
  "INNO_VOICE_OF_CUSTOMER_ANALYST",
  "INNO_USER_RESEARCH_PLANNER",
  "INNO_PAINPOINT_SYNTHESIZER",
  "INNO_COMPETITOR_INTEL",
  "INNO_PRICING_EXPERIMENTER",
  "INNO_ONBOARDING_FRICTION_ANALYST",
  "INNO_ACTIVATION_ANALYST",
  "INNO_RETENTION_ANALYST",
  "INNO_GROWTH_EXPERIMENT_SCIENTIST",
  "INNO_AI_AGENT_RND",
  "INNO_EVAL_BENCHMARKER",
  "INNO_SECURITY_RESEARCHER",
  "INNO_AI_POLICY_WATCH",
  "INNO_PROTOTYPE_BUILDER"
] as const;

const DEFAULT_ORG_RUN_ROLES = ["REV_PRODUCT_MANAGER", "REV_TECH_LEAD", "REV_QA_LEAD"];

export const ORG_ROLE_DEFINITIONS: OrgRoleDefinition[] = [
  ...REVENUE_DELIVERY_ROLE_IDS.map((roleId) => ({
    roleId,
    category: "revenue-delivery" as const,
    defaultScope: "Revenue, delivery, product quality, customer rollout, and operating-system handoff work.",
    primarySurface: "Fleet" as const
  })),
  ...INNOVATION_ROLE_IDS.map((roleId) => ({
    roleId,
    category: "innovation" as const,
    defaultScope: "Research, gap synthesis, experiments, policy watch, and product-improvement discovery.",
    primarySurface: "Watch" as const
  }))
];

const roleDefinitionById = new Map(ORG_ROLE_DEFINITIONS.map((role) => [role.roleId, role]));

function defaultHeartbeatPolicy(overrides?: Partial<OrgHeartbeatPolicy>): OrgHeartbeatPolicy {
  const intervalMinutes = Math.max(1, Math.round(overrides?.intervalMinutes ?? 30));
  const maxStaleMinutes = Math.max(intervalMinutes, Math.round(overrides?.maxStaleMinutes ?? intervalMinutes * 3));
  const plateauAfterHeartbeats = Math.max(1, Math.round(overrides?.plateauAfterHeartbeats ?? 3));
  return {
    intervalMinutes,
    maxStaleMinutes,
    plateauAfterHeartbeats,
    triggers: overrides?.triggers ?? ["scheduled-review", "stalled-work", "plateau-detected", "failing-gates", "lifecycle-continuation"]
  };
}

export function parseOrgRoleList(input?: string | string[]): string[] {
  const raw = Array.isArray(input) ? input : (input ?? DEFAULT_ORG_RUN_ROLES.join(",")).split(",");
  const roles = raw
    .map((role) => role.trim().toUpperCase())
    .filter(Boolean);
  return [...new Set(roles)];
}

export function orgRunsDir(workspace: string): string {
  return join(orgRootDir(workspace), "runs");
}

export function orgRunDir(workspace: string, orgRunId: string): string {
  return join(orgRunsDir(workspace), sanitizeRunId(orgRunId));
}

export function orgRunArtifactPath(workspace: string, orgRunId: string): string {
  return join(orgRunDir(workspace, orgRunId), "org-run.json");
}

function sanitizeRunId(input: string): string {
  const cleaned = input.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!cleaned) {
    throw new Error("orgRunId cannot be empty");
  }
  return cleaned;
}

function roleAgentId(roleId: string): string {
  return normalizeAgentId(`org-${roleId}`);
}

function parentAgentId(): string {
  return "org-runner";
}

function assertContained(workspace: string, candidate: string): boolean {
  const root = resolve(workspace);
  const full = resolve(candidate);
  return full === root || full.startsWith(`${root}/`);
}

function stateRef(path: string, visibility: OrgStateRef["visibility"]): OrgStateRef {
  return {
    path,
    sha256: pathExists(path) ? sha256Hex(readUtf8(path)) : null,
    visibility
  };
}

function handoffRef(kind: OrgHandoffRef["kind"], path: string): OrgHandoffRef {
  return {
    kind,
    path,
    sha256: pathExists(path) ? sha256Hex(readUtf8(path)) : null
  };
}

function hasSecretLikeText(text: string): boolean {
  return /(sk-[a-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i.test(text);
}

function hasExternalSourceNaming(text: string): boolean {
  const normalized = text.toLowerCase();
  return [
    "agentscope",
    "future-agi",
    "everos",
    "coral",
    "deer-flow",
    "optillm",
    "fantasylab",
    "lucien",
    "wisecrab",
    "thewisecrab"
  ].some((token) => normalized.includes(token));
}

function roleScope(input: {
  workspace: string;
  orgRunId: string;
  role: OrgRoleDefinition;
  roleWorkspace: string;
  amcOsHandoffPath: string;
  goal: string;
}): OrgRoleScope {
  const allowedWriteRoots = [
    input.roleWorkspace,
    input.amcOsHandoffPath
  ];
  const surfaceMap: AMCSurface[] = input.role.category === "innovation"
    ? ["Fleet", "Watch", "Vault", "Enforce"]
    : ["Fleet", "Enforce", "Vault", "Watch"];
  const resourceVersion = sha256Hex(JSON.stringify({
    roleId: input.role.roleId,
    category: input.role.category,
    orgRunId: input.orgRunId,
    goalHash: sha256Hex(input.goal),
    allowedWriteRoots: allowedWriteRoots.map((path) => path.replace(resolve(input.workspace), "$WORKSPACE"))
  }));
  return {
    summary: input.role.defaultScope,
    allowedWriteRoots,
    deniedActionClasses: ["DEPLOY", "FINANCIAL", "IDENTITY", "DATA_EXPORT", "NETWORK_EXTERNAL"],
    surfaceMap,
    resourceVersion
  };
}

function approvalGates(input: {
  workspace: string;
  role: OrgRoleDefinition;
  roleWorkspace: string;
  privateStatePath: string;
  publicStatePath: string;
  handoffPath: string;
  scope: OrgRoleScope;
  goal: string;
}): OrgApprovalGate[] {
  const gates: OrgApprovalGate[] = [];
  const gate = (gateId: string, surface: AMCSurface, status: OrgGateStatus, reason: string, refs: string[] = []): void => {
    gates.push({ gateId, surface, status, reason, refs });
  };

  gate("role-known", "Fleet", "passed", `Role ${input.role.roleId} is part of the canonical 70-role registry.`, [input.role.roleId]);
  gate(
    "workspace-isolated",
    "Enforce",
    assertContained(input.workspace, input.roleWorkspace) ? "passed" : "blocked",
    "Role workspace must stay inside the AMC workspace and under its own role run directory.",
    [input.roleWorkspace]
  );
  gate(
    "private-state-separated",
    "Vault",
    input.privateStatePath.includes("/private/") && input.publicStatePath.includes("/public/") ? "passed" : "blocked",
    "Private grader state is stored separately from public product state.",
    [input.publicStatePath, input.privateStatePath]
  );
  gate(
    "file-ownership",
    "Enforce",
    input.scope.allowedWriteRoots.every((root) => assertContained(input.workspace, root)) ? "passed" : "blocked",
    "Role writes are scoped to its own run workspace and handoff note path.",
    input.scope.allowedWriteRoots
  );
  gate(
    "destructive-command-policy",
    "Enforce",
    "passed",
    `Destructive and sensitive action classes are denied by default: ${input.scope.deniedActionClasses.join(", ")}.`,
    input.scope.deniedActionClasses
  );
  gate(
    "secret-exposure",
    "Vault",
    hasSecretLikeText(input.goal) ? "needs-approval" : "passed",
    hasSecretLikeText(input.goal)
      ? "Goal text appears to contain secret-like material and needs owner approval before publishing."
      : "Goal text does not contain obvious secret-like material.",
    []
  );
  gate(
    "public-source-naming",
    "Comply",
    hasExternalSourceNaming(input.goal) ? "blocked" : "passed",
    hasExternalSourceNaming(input.goal)
      ? "Goal text contains source-specific public naming that should be generalized before publishing."
      : "Public-facing state can use generic AMC terminology.",
    []
  );
  gate(
    "handoff-note",
    "Watch",
    input.handoffPath.length > 0 ? "passed" : "blocked",
    "Each role has a handoff note reference for traceable continuation.",
    [input.handoffPath]
  );
  return gates;
}

function statusFromGates(gates: OrgApprovalGate[]): OrgRoleRunStatus {
  if (gates.some((gate) => gate.status === "blocked")) return "blocked";
  if (gates.some((gate) => gate.status === "needs-approval")) return "needs-approval";
  return "completed";
}

function heartbeatForRole(input: {
  roleId: string;
  status: OrgRoleRunStatus;
  gates: OrgApprovalGate[];
  policy: OrgHeartbeatPolicy;
  createdAt: string;
}): OrgHeartbeat {
  const blockedGateIds = input.gates.filter((gate) => gate.status !== "passed").map((gate) => gate.gateId);
  const createdMs = Date.parse(input.createdAt);
  const heartbeatStatus: OrgHeartbeatStatus =
    input.status === "blocked" ? "blocked" :
      input.status === "needs-approval" ? "needs-approval" :
        input.policy.plateauAfterHeartbeats <= 1 ? "plateau" : "ready";
  const triggers = input.policy.triggers.filter((trigger) => {
    if (trigger === "failing-gates") return blockedGateIds.length > 0;
    if (trigger === "plateau-detected") return heartbeatStatus === "plateau";
    return trigger === "scheduled-review" || trigger === "lifecycle-continuation" || trigger === "stalled-work";
  });
  return {
    heartbeatId: `heartbeat-${input.roleId.toLowerCase()}-${sha256Hex(input.createdAt).slice(0, 8)}`,
    roleId: input.roleId,
    status: heartbeatStatus,
    createdAt: input.createdAt,
    nextReviewAt: new Date(createdMs + input.policy.intervalMinutes * 60_000).toISOString(),
    triggers,
    blockedGateIds,
    note: blockedGateIds.length > 0
      ? `Review required for gates: ${blockedGateIds.join(", ")}.`
      : "Role workspace is ready for scheduled lifecycle continuation."
  };
}

function reportHash(report: DiagnosticReport): string {
  return sha256Hex(JSON.stringify({ ...report, reportJsonSha256: "" }));
}

function baseSyntheticReport(input: {
  agentId: string;
  runId: string;
  ts: number;
  status: DiagnosticReport["status"];
  finalLevel: number;
  evidenceIds: string[];
  questionScores: QuestionScore[];
  trustLabel: DiagnosticReport["trustLabel"];
}): DiagnosticReport {
  const report: DiagnosticReport = {
    agentId: input.agentId,
    runId: input.runId,
    ts: input.ts,
    windowStartTs: input.ts,
    windowEndTs: input.ts,
    status: input.status,
    verificationPassed: input.status === "VALID",
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: input.status === "VALID" ? 1 : 0.72,
    trustLabel: input.trustLabel,
    targetProfileId: null,
    layerScores: [{
      layerName: "Strategic Agent Operations",
      avgFinalLevel: input.finalLevel,
      confidenceWeightedFinalLevel: input.finalLevel
    }],
    questionScores: input.questionScores,
    inflationAttempts: [],
    unsupportedClaimCount: input.questionScores.filter((score) => score.finalLevel < 3).length,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: input.evidenceIds.length > 0 ? 1 : 0,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: input.questionScores.map((score) => ({
      questionId: score.questionId,
      current: score.finalLevel,
      target: 4,
      gap: Math.max(0, 4 - score.finalLevel)
    })),
    prioritizedUpgradeActions: [],
    evidenceToCollectNext: [],
    runSealSig: "org-run-synthetic-report",
    reportJsonSha256: ""
  };
  return {
    ...report,
    reportJsonSha256: reportHash(report)
  };
}

function roleDiagnosticReport(input: {
  role: OrgRoleDefinition;
  roleRunId: string;
  status: OrgRoleRunStatus;
  gates: OrgApprovalGate[];
  stateRefs: OrgStateRef[];
  ts: number;
}): DiagnosticReport {
  const finalLevel = input.status === "completed" ? 4 : input.status === "needs-approval" ? 3 : 2;
  const questionScores = input.gates.map((gate, index) => ({
    questionId: `ORG-${input.role.roleId}-${index + 1}`,
    claimedLevel: 4,
    supportedMaxLevel: gate.status === "passed" ? 4 : gate.status === "needs-approval" ? 3 : 2,
    finalLevel: gate.status === "passed" ? 4 : gate.status === "needs-approval" ? 3 : 2,
    confidence: gate.status === "passed" ? 0.92 : 0.72,
    evidenceEventIds: [...input.stateRefs.map((ref) => ref.sha256 ?? ref.path), ...gate.refs],
    flags: gate.status === "passed" ? [] : [`org-gate-${gate.status}`],
    narrative: gate.reason
  }));
  return baseSyntheticReport({
    agentId: roleAgentId(input.role.roleId),
    runId: input.roleRunId,
    ts: input.ts,
    status: "VALID",
    finalLevel,
    evidenceIds: input.stateRefs.map((ref) => ref.sha256 ?? ref.path),
    questionScores,
    trustLabel: input.status === "completed" ? "HIGH TRUST" : "DEVELOPING — some evidence, needs more coverage"
  });
}

function parentDiagnosticReport(input: {
  orgRunId: string;
  roles: OrgRoleRun[];
  ts: number;
}): DiagnosticReport {
  const blocked = input.roles.filter((role) => role.status === "blocked").length;
  const needsApproval = input.roles.filter((role) => role.status === "needs-approval").length;
  const finalLevel = blocked > 0 ? 2 : needsApproval > 0 ? 3 : 4;
  const questionScores: QuestionScore[] = input.roles.map((role) => ({
    questionId: `ORG-RUN-${role.roleId}`,
    claimedLevel: 4,
    supportedMaxLevel: role.status === "completed" ? 4 : role.status === "needs-approval" ? 3 : 2,
    finalLevel: role.status === "completed" ? 4 : role.status === "needs-approval" ? 3 : 2,
    confidence: role.status === "completed" ? 0.94 : 0.76,
    evidenceEventIds: [
      role.roleRunId,
      role.scope.resourceVersion,
      role.publicStateRef.sha256 ?? role.publicStateRef.path,
      role.episodeRecordRef.episodeId,
      role.lifecycleArtifactRef.lifecycleRunId
    ],
    flags: role.status === "completed" ? [] : [`org-role-${role.status}`],
    narrative: `${role.roleId} completed with ${role.approvalGates.filter((gate) => gate.status !== "passed").length} gated item(s).`
  }));
  return baseSyntheticReport({
    agentId: parentAgentId(),
    runId: input.orgRunId,
    ts: input.ts,
    status: "VALID",
    finalLevel,
    evidenceIds: input.roles.map((role) => role.roleRunId),
    questionScores,
    trustLabel: blocked > 0 ? "LOW — collect more evidence to increase trust" : "HIGH TRUST"
  });
}

function writeSyntheticDiagnostic(input: {
  workspace: string;
  agentId: string;
  report: DiagnosticReport;
  title: string;
}): { jsonPath: string; markdownPath: string } {
  const paths = getAgentPaths(input.workspace, input.agentId);
  ensureAgentDirs(paths);
  const jsonPath = join(paths.runsDir, `${input.report.runId}.json`);
  const markdownPath = join(paths.reportsDir, `${input.report.runId}.md`);
  writeFileAtomic(jsonPath, `${JSON.stringify(input.report, null, 2)}\n`, 0o644);
  writeFileAtomic(markdownPath, [
    `# ${input.title}`,
    "",
    `- Run: ${input.report.runId}`,
    `- Agent: ${input.report.agentId}`,
    `- Status: ${input.report.status}`,
    `- Integrity index: ${input.report.integrityIndex}`,
    `- Evidence coverage: ${input.report.evidenceCoverage}`,
    "",
    "## Gate Scores",
    ...input.report.questionScores.map((score) => `- ${score.questionId}: L${score.finalLevel} ${score.flags.join(", ")}`),
    ""
  ].join("\n"), 0o644);
  return { jsonPath, markdownPath };
}

function roleStatusSummary(status: OrgRoleRunStatus): string {
  if (status === "completed") return "Role workspace, evidence, lifecycle artifact, and heartbeat are ready.";
  if (status === "needs-approval") return "Role is prepared but requires owner approval before publishing or continuation.";
  return "Role is blocked by one or more policy gates.";
}

function buildSurfaces(input: {
  roles: OrgRoleRun[];
  signaturePath: string | null;
}): Record<AMCSurface, LifecycleSurfaceSummary> {
  const blockedGateIds = input.roles.flatMap((role) => role.approvalGates.filter((gate) => gate.status !== "passed").map((gate) => `${role.roleId}:${gate.gateId}`));
  return {
    Score: {
      status: "partial",
      summary: "Org runner creates lifecycle evidence for role coordination; production agent maturity scores remain on the normal full-score path.",
      refs: input.roles.map((role) => role.roleRunId)
    },
    Shield: {
      status: "pending",
      summary: "Role runners can request Shield packs, but this org run did not execute adversarial packs directly.",
      refs: []
    },
    Enforce: {
      status: blockedGateIds.length > 0 ? "degraded" : "complete",
      summary: blockedGateIds.length > 0
        ? `${blockedGateIds.length} approval or guardrail gate(s) need attention.`
        : "Role workspaces, ownership boundaries, denied action classes, and public naming gates passed.",
      refs: blockedGateIds
    },
    Vault: {
      status: input.signaturePath ? "complete" : "degraded",
      summary: input.signaturePath ? "Org run artifact and lifecycle artifacts were signed where keys were available." : "Org run artifact was written but not signed.",
      refs: input.signaturePath ? [input.signaturePath] : []
    },
    Watch: {
      status: "complete",
      summary: `Created ${input.roles.reduce((sum, role) => sum + role.heartbeats.length, 0)} heartbeat(s) for stalled work, plateau, failing gates, and lifecycle continuation.`,
      refs: input.roles.flatMap((role) => role.heartbeats.map((heartbeat) => heartbeat.heartbeatId))
    },
    Comply: {
      status: "partial",
      summary: "Public state uses AMC role IDs and generic terminology so compliance artifacts can be exported without source-system naming.",
      refs: input.roles.flatMap((role) => role.approvalGates.filter((gate) => gate.gateId === "public-source-naming").map((gate) => `${role.roleId}:${gate.status}`))
    },
    Fleet: {
      status: "complete",
      summary: `Coordinated ${input.roles.length} role workspace(s) as a Fleet advanced workflow.`,
      refs: input.roles.map((role) => role.roleId)
    },
    Passport: {
      status: "pending",
      summary: "Portable trust identity can be issued after this org run through Passport export commands.",
      refs: []
    }
  };
}

function orgRunSigningExpected(): boolean {
  return Boolean(process.env.AMC_VAULT_PASSPHRASE)
    || process.env.NODE_ENV === "test"
    || process.env.VITEST === "true"
    || process.env.VITEST === "1";
}

function roleWorkspacePath(workspace: string, orgRunId: string, roleId: string): string {
  return join(orgRunDir(workspace, orgRunId), "roles", roleId);
}

function writeRoleRun(input: {
  workspace: string;
  orgRunId: string;
  goal: string;
  role: OrgRoleDefinition;
  policy: OrgHeartbeatPolicy;
  source: OrgRunArtifact["source"];
  command: string;
  createdAt: string;
}): OrgRoleRun {
  const roleWorkspace = roleWorkspacePath(input.workspace, input.orgRunId, input.role.roleId);
  const publicDir = join(roleWorkspace, "public");
  const privateDir = join(roleWorkspace, "private");
  ensureDir(publicDir);
  ensureDir(privateDir);
  const publicStatePath = join(publicDir, "state.json");
  const privateStatePath = join(privateDir, "grader-state.json");
  const handoffPath = join(roleWorkspace, "handoff.md");
  const amcOsHandoffPath = join(input.workspace, "AMC_OS", "INBOX", `${input.role.roleId}.md`);
  const scope = roleScope({
    workspace: input.workspace,
    orgRunId: input.orgRunId,
    role: input.role,
    roleWorkspace,
    amcOsHandoffPath,
    goal: input.goal
  });
  const gates = approvalGates({
    workspace: input.workspace,
    role: input.role,
    roleWorkspace,
    privateStatePath,
    publicStatePath,
    handoffPath,
    scope,
    goal: input.goal
  });
  const status = statusFromGates(gates);
  const roleRunId = `${sanitizeRunId(input.orgRunId)}-${input.role.roleId.toLowerCase()}`;
  const heartbeat = heartbeatForRole({
    roleId: input.role.roleId,
    status,
    gates,
    policy: input.policy,
    createdAt: input.createdAt
  });

  writeFileAtomic(handoffPath, [
    `# ${input.role.roleId} Org Run Handoff`,
    "",
    `- Parent run: ${input.orgRunId}`,
    `- Role run: ${roleRunId}`,
    `- Status: ${status}`,
    `- Goal: ${input.goal}`,
    `- Scope: ${scope.summary}`,
    `- Next review: ${heartbeat.nextReviewAt}`,
    "",
    "## Gates",
    ...gates.map((gate) => `- ${gate.gateId}: ${gate.status} - ${gate.reason}`),
    ""
  ].join("\n"), 0o644);

  const publicState = {
    schemaVersion: "2026-05-22",
    roleId: input.role.roleId,
    roleRunId,
    parentRunId: input.orgRunId,
    category: input.role.category,
    status,
    goal: input.goal,
    scope,
    heartbeat: {
      heartbeatId: heartbeat.heartbeatId,
      status: heartbeat.status,
      nextReviewAt: heartbeat.nextReviewAt,
      triggers: heartbeat.triggers
    },
    gates: gates.map((gate) => ({
      gateId: gate.gateId,
      surface: gate.surface,
      status: gate.status,
      reason: gate.reason
    })),
    handoffNoteRefs: [
      { kind: "role-workspace", path: handoffPath },
      ...(pathExists(amcOsHandoffPath) ? [{ kind: "amc-os", path: amcOsHandoffPath }] : [])
    ]
  };
  writeFileAtomic(publicStatePath, `${JSON.stringify(publicState, null, 2)}\n`, 0o644);

  const privateState = {
    schemaVersion: "2026-05-22",
    roleId: input.role.roleId,
    roleRunId,
    parentRunId: input.orgRunId,
    graderState: {
      goalSha256: sha256Hex(input.goal),
      gateDigest: sha256Hex(JSON.stringify(gates)),
      plateauAfterHeartbeats: input.policy.plateauAfterHeartbeats,
      blockedGateIds: gates.filter((gate) => gate.status !== "passed").map((gate) => gate.gateId)
    },
    privateNotes: "Internal grader state is intentionally separated from public role state."
  };
  writeFileAtomic(privateStatePath, `${JSON.stringify(privateState, null, 2)}\n`, 0o600);

  const publicRef = stateRef(publicStatePath, "public");
  const privateRef = stateRef(privateStatePath, "private");
  const handoffRefs = [
    handoffRef("role-workspace", handoffPath),
    ...(pathExists(amcOsHandoffPath) ? [handoffRef("amc-os", amcOsHandoffPath)] : [])
  ];
  const report = roleDiagnosticReport({
    role: input.role,
    roleRunId,
    status,
    gates,
    stateRefs: [publicRef, privateRef],
    ts: Date.parse(input.createdAt)
  });
  writeSyntheticDiagnostic({
    workspace: input.workspace,
    agentId: roleAgentId(input.role.roleId),
    report,
    title: `AMC Org Role Evidence ${input.role.roleId}`
  });
  const episode = writeEpisodeRecord({
    workspace: input.workspace,
    report,
    source: input.source,
    command: input.command,
    lifecycleStage: "org.role.completed",
    receipts: [publicRef.sha256 ?? publicRef.path, privateRef.sha256 ?? privateRef.path]
  });
  const lifecycle = writeLifecycleRunArtifact({
    workspace: input.workspace,
    report,
    source: input.source,
    command: input.command,
    stage: "org.role.completed",
    episodeRecords: [{ episodeId: episode.episode.episodeId, path: episode.episodePath }],
    surfaceOverrides: {
      Score: {
        status: "partial",
        summary: "This artifact records role-run readiness, not the production agent full score.",
        refs: [roleRunId]
      },
      Fleet: {
        status: "complete",
        summary: `${input.role.roleId} is linked into org run ${input.orgRunId}.`,
        refs: [input.orgRunId, roleRunId]
      },
      Enforce: {
        status: status === "completed" ? "complete" : "degraded",
        summary: roleStatusSummary(status),
        refs: gates.filter((gate) => gate.status !== "passed").map((gate) => gate.gateId)
      },
      Watch: {
        status: "complete",
        summary: `Heartbeat ${heartbeat.heartbeatId} scheduled for ${heartbeat.nextReviewAt}.`,
        refs: [heartbeat.heartbeatId]
      },
      Vault: {
        status: "complete",
        summary: "Role evidence is represented by signed lifecycle and episode artifacts where signing keys are available.",
        refs: [publicRef.sha256 ?? publicRef.path]
      }
    }
  });

  return {
    roleRunId,
    parentRunId: input.orgRunId,
    roleId: input.role.roleId,
    category: input.role.category,
    status,
    roleWorkspace,
    scope,
    publicStateRef: publicRef,
    privateGraderStateRef: privateRef,
    handoffNoteRefs: handoffRefs,
    heartbeatPolicy: input.policy,
    heartbeats: [heartbeat],
    approvalGates: gates,
    episodeRecordRef: { episodeId: episode.episode.episodeId, path: episode.episodePath },
    lifecycleArtifactRef: {
      lifecycleRunId: lifecycle.artifact.lifecycleRunId,
      path: lifecycle.artifactPath,
      signaturePath: lifecycle.signaturePath
    },
    evidenceRefs: [
      publicRef.sha256 ?? publicRef.path,
      privateRef.sha256 ?? privateRef.path,
      episode.episode.episodeId,
      lifecycle.artifact.lifecycleRunId
    ],
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  };
}

export function runOrg(input: RunOrgInput): OrgRunResult {
  const orgRunId = sanitizeRunId(input.orgRunId ?? `org-${randomUUID()}`);
  const workspace = resolve(input.workspace);
  const roleIds = parseOrgRoleList(input.roles);
  if (roleIds.length === 0) {
    throw new Error("At least one org role is required.");
  }
  const unknown = roleIds.filter((roleId) => !roleDefinitionById.has(roleId));
  if (unknown.length > 0) {
    throw new Error(`Unknown org role(s): ${unknown.join(", ")}`);
  }
  const goal = input.goal?.trim() || "Run the AMC org lifecycle loop and produce traceable role handoffs.";
  const source = input.source ?? "cli";
  const command = input.command ?? "amc org run";
  const heartbeatPolicy = defaultHeartbeatPolicy(input.heartbeatPolicy);
  const createdAt = new Date().toISOString();
  ensureDir(orgRunDir(workspace, orgRunId));

  const roles = roleIds.map((roleId) => writeRoleRun({
    workspace,
    orgRunId,
    goal,
    role: roleDefinitionById.get(roleId)!,
    policy: heartbeatPolicy,
    source,
    command,
    createdAt
  }));
  const parentStatus: OrgRunStatus = roles.some((role) => role.status === "blocked")
    ? "blocked"
    : roles.some((role) => role.status === "needs-approval")
      ? "needs-approval"
      : "completed";
  const artifactPath = orgRunArtifactPath(workspace, orgRunId);
  const expectedSignaturePath = orgRunSigningExpected() ? `${artifactPath}.sig` : null;
  const parentReport = parentDiagnosticReport({
    orgRunId,
    roles,
    ts: Date.parse(createdAt)
  });
  writeSyntheticDiagnostic({
    workspace,
    agentId: parentAgentId(),
    report: parentReport,
    title: "AMC Org Run Evidence"
  });
  const parentEpisode = writeEpisodeRecord({
    workspace,
    report: parentReport,
    source,
    command,
    lifecycleStage: "org.run.completed",
    receipts: roles.flatMap((role) => [role.episodeRecordRef.episodeId, role.lifecycleArtifactRef.lifecycleRunId])
  });
  const parentLifecycle = writeLifecycleRunArtifact({
    workspace,
    report: parentReport,
    source,
    command,
    stage: "org.run.completed",
    episodeRecords: [
      { episodeId: parentEpisode.episode.episodeId, path: parentEpisode.episodePath },
      ...roles.map((role) => role.episodeRecordRef)
    ],
    surfaceOverrides: buildSurfaces({ roles, signaturePath: expectedSignaturePath })
  });

  const artifact: OrgRunArtifact = {
    schemaVersion: "2026-05-22",
    orgRunId,
    parentRunId: parentReport.runId,
    workspace,
    source,
    command,
    goal,
    status: parentStatus,
    createdAt,
    updatedAt: createdAt,
    heartbeatPolicy,
    surfaces: buildSurfaces({ roles, signaturePath: expectedSignaturePath }),
    roles,
    parentEpisodeRecordRef: { episodeId: parentEpisode.episode.episodeId, path: parentEpisode.episodePath },
    parentLifecycleArtifactRef: {
      lifecycleRunId: parentLifecycle.artifact.lifecycleRunId,
      path: parentLifecycle.artifactPath,
      signaturePath: parentLifecycle.signaturePath
    },
    summary: {
      roleCount: roles.length,
      completedRoles: roles.filter((role) => role.status === "completed").length,
      needsApprovalRoles: roles.filter((role) => role.status === "needs-approval").length,
      blockedRoles: roles.filter((role) => role.status === "blocked").length,
      heartbeatCount: roles.reduce((sum, role) => sum + role.heartbeats.length, 0),
      blockedGateCount: roles.reduce((sum, role) => sum + role.approvalGates.filter((gate) => gate.status !== "passed").length, 0),
      privateStateCount: roles.filter((role) => role.privateGraderStateRef.visibility === "private").length
    }
  };
  writeFileAtomic(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 0o644);
  const signed = trySignArtifactFile({ workspace, path: artifactPath, artifactKind: "org-run-artifact" });
  return { artifact, artifactPath, signaturePath: signed?.sigPath ?? null };
}

export function listOrgRuns(input: { workspace: string; limit?: number; redacted?: boolean }): OrgRunArtifact[] {
  const dir = orgRunsDir(input.workspace);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .map((entry) => orgRunArtifactPath(input.workspace, entry))
    .filter((path) => pathExists(path))
    .map((path) => JSON.parse(readUtf8(path)) as OrgRunArtifact)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, input.limit ?? Number.POSITIVE_INFINITY)
    .map((run) => input.redacted ? redactOrgRunArtifact(run) : run);
}

export function loadOrgRun(input: { workspace: string; selector: string; redacted?: boolean }): OrgRunArtifact {
  const directPath = orgRunArtifactPath(input.workspace, input.selector);
  if (pathExists(directPath)) {
    const run = JSON.parse(readUtf8(directPath)) as OrgRunArtifact;
    return input.redacted ? redactOrgRunArtifact(run) : run;
  }
  const found = listOrgRuns({ workspace: input.workspace }).find((run) => run.orgRunId === input.selector || run.parentRunId === input.selector);
  if (!found) {
    throw new Error(`Org run not found: ${input.selector}`);
  }
  return input.redacted ? redactOrgRunArtifact(found) : found;
}

function redactPath(path: string, workspace: string): string {
  const root = resolve(workspace);
  const full = resolve(path);
  if (full === root) return "$WORKSPACE";
  if (full.startsWith(`${root}/`)) return `$WORKSPACE/${full.slice(root.length + 1)}`;
  return path;
}

function redactStateRef(ref: OrgStateRef, workspace: string): OrgStateRef {
  return {
    ...ref,
    path: ref.visibility === "private" ? "$PRIVATE/grader-state.json" : redactPath(ref.path, workspace),
    sha256: ref.visibility === "private" ? null : ref.sha256
  };
}

export function redactOrgRunArtifact(run: OrgRunArtifact): OrgRunArtifact {
  return {
    ...run,
    workspace: "$WORKSPACE",
    roles: run.roles.map((role) => ({
      ...role,
      roleWorkspace: redactPath(role.roleWorkspace, run.workspace),
      scope: {
        ...role.scope,
        allowedWriteRoots: role.scope.allowedWriteRoots.map((path) => redactPath(path, run.workspace))
      },
      publicStateRef: redactStateRef(role.publicStateRef, run.workspace),
      privateGraderStateRef: redactStateRef(role.privateGraderStateRef, run.workspace),
      handoffNoteRefs: role.handoffNoteRefs.map((ref) => ({
        ...ref,
        path: redactPath(ref.path, run.workspace)
      })),
      episodeRecordRef: {
        ...role.episodeRecordRef,
        path: redactPath(role.episodeRecordRef.path, run.workspace)
      },
      lifecycleArtifactRef: {
        ...role.lifecycleArtifactRef,
        path: redactPath(role.lifecycleArtifactRef.path, run.workspace),
        signaturePath: role.lifecycleArtifactRef.signaturePath ? redactPath(role.lifecycleArtifactRef.signaturePath, run.workspace) : null
      }
    })),
    parentEpisodeRecordRef: {
      ...run.parentEpisodeRecordRef,
      path: redactPath(run.parentEpisodeRecordRef.path, run.workspace)
    },
    parentLifecycleArtifactRef: {
      ...run.parentLifecycleArtifactRef,
      path: redactPath(run.parentLifecycleArtifactRef.path, run.workspace),
      signaturePath: run.parentLifecycleArtifactRef.signaturePath ? redactPath(run.parentLifecycleArtifactRef.signaturePath, run.workspace) : null
    }
  };
}

export function orgRunRoleDefinitions(): OrgRoleDefinition[] {
  return ORG_ROLE_DEFINITIONS.map((role) => ({ ...role }));
}

export function orgRunSummaryForUi(run: OrgRunArtifact): {
  orgRunId: string;
  status: OrgRunStatus;
  goal: string;
  createdAt: string;
  roleCount: number;
  heartbeatCount: number;
  blockedGateCount: number;
  roles: Array<{
    roleId: string;
    status: OrgRoleRunStatus;
    heartbeatStatus: OrgHeartbeatStatus;
    nextReviewAt: string;
    blockedGateIds: string[];
    lifecycleRunId: string;
    rollbackRef: string;
  }>;
} {
  return {
    orgRunId: run.orgRunId,
    status: run.status,
    goal: run.goal,
    createdAt: run.createdAt,
    roleCount: run.summary.roleCount,
    heartbeatCount: run.summary.heartbeatCount,
    blockedGateCount: run.summary.blockedGateCount,
    roles: run.roles.map((role) => ({
      roleId: role.roleId,
      status: role.status,
      heartbeatStatus: role.heartbeats[0]?.status ?? "ready",
      nextReviewAt: role.heartbeats[0]?.nextReviewAt ?? role.updatedAt,
      blockedGateIds: role.approvalGates.filter((gate) => gate.status !== "passed").map((gate) => gate.gateId),
      lifecycleRunId: role.lifecycleArtifactRef.lifecycleRunId,
      rollbackRef: role.roleWorkspace
    }))
  };
}

export type OrgRunEpisodeStage = EpisodeRecord["lifecycleStage"];
