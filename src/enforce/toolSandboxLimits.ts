import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type ToolSandboxCoveredLimit = "cpu" | "memory" | "io" | "network" | "filesystem" | "process";
export type ToolSandboxEnforcementMode = "observe" | "warn" | "block";
export type ToolSandboxNetworkMode = "deny" | "allowlist" | "allow";
export type ToolSandboxFilesystemOperation = "read" | "write" | "execute";
export type ToolSandboxReceiptStatus = "pass" | "violation" | "fail_closed";
export type ToolSandboxViolationType =
  | "CPU_LIMIT_EXCEEDED"
  | "MEMORY_LIMIT_EXCEEDED"
  | "IO_READ_LIMIT_EXCEEDED"
  | "IO_WRITE_LIMIT_EXCEEDED"
  | "NETWORK_DENIED"
  | "FILESYSTEM_DENIED"
  | "PROCESS_LIMIT_EXCEEDED";

export interface ToolSandboxSourceCitation {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
}

export interface ToolSandboxNetworkPolicy {
  mode: ToolSandboxNetworkMode;
  allowedHosts: string[];
}

export interface ToolSandboxFilesystemPolicy {
  readRoots: string[];
  writeRoots: string[];
}

export interface ToolSandboxResourceLimits {
  cpuTimeMs: number;
  memoryLimitMb: number;
  ioReadMb: number;
  ioWriteMb: number;
  network: ToolSandboxNetworkPolicy;
  filesystem: ToolSandboxFilesystemPolicy;
  maxProcesses: number;
}

export interface ToolSandboxResourceLimitPolicy {
  policyId: string;
  agentId: string;
  workspaceId: string;
  toolId: string;
  enforcementMode: ToolSandboxEnforcementMode;
  policyEvidenceRef: string;
  limits: ToolSandboxResourceLimits;
}

export interface ToolSandboxNetworkEvent {
  host: string;
  port: number;
  allowed: boolean;
  evidenceRef: string;
}

export interface ToolSandboxFilesystemEvent {
  path: string;
  operation: ToolSandboxFilesystemOperation;
  allowed: boolean;
  evidenceRef: string;
}

export interface ToolSandboxObservedUsage {
  executionId: string;
  commandRef: string;
  observedAt: string;
  durationMs: number;
  cpuTimeMs: number;
  peakMemoryMb: number;
  ioReadMb: number;
  ioWriteMb: number;
  networkEvents: ToolSandboxNetworkEvent[];
  filesystemEvents: ToolSandboxFilesystemEvent[];
  processCount: number;
  exitCode: number | null;
  observationEvidenceRef: string;
  enforcementReceiptRef: string;
}

export interface BuildToolSandboxResourceLimitReceiptInput {
  receiptId: string;
  policy: ToolSandboxResourceLimitPolicy;
  usage: ToolSandboxObservedUsage;
  sourceCitations: ToolSandboxSourceCitation[];
  generatedAt?: string;
}

export interface ToolSandboxViolation {
  type: ToolSandboxViolationType;
  limit: number | string;
  actual: number | string;
  evidenceRef: string | null;
  message: string;
}

export interface ToolSandboxResourceLimitReceipt {
  receiptId: string;
  generatedAt: string;
  surfaceBindings: string[];
  policy: ToolSandboxResourceLimitPolicy;
  usage: ToolSandboxObservedUsage;
  coveredLimits: ToolSandboxCoveredLimit[];
  violations: ToolSandboxViolation[];
  requiredEvidenceRefs: string[];
  sourceCitations: ToolSandboxSourceCitation[];
  status: ToolSandboxReceiptStatus;
  scorePenalty: number;
  failClosed: boolean;
  failClosedReasons: string[];
  receiptHash: string;
}

export interface ToolSandboxResourceLimitVerification {
  valid: boolean;
  reasons: string[];
}

const COVERED_LIMITS: ToolSandboxCoveredLimit[] = ["cpu", "memory", "io", "network", "filesystem", "process"];

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function nonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function nonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function receiptHash(receipt: Omit<ToolSandboxResourceLimitReceipt, "receiptHash">): string {
  return sha256Hex(canonicalize(receipt));
}

function sourceCitationReasons(citations: ToolSandboxSourceCitation[]): string[] {
  if (citations.length === 0) {
    return ["sourceCitations:missing"];
  }

  return citations.flatMap((citation) => {
    if (
      nonEmpty(citation.sourceId)
      && nonEmpty(citation.title)
      && nonEmpty(citation.url)
      && nonEmpty(citation.retrievedAt)
    ) {
      return [];
    }
    return [`sourceCitation:${citation.sourceId || "unknown"}:invalid`];
  });
}

function policyReasons(policy: ToolSandboxResourceLimitPolicy): string[] {
  const reasons: string[] = [];
  if (!nonEmpty(policy.policyId)) {
    reasons.push("policyId:missing");
  }
  if (!nonEmpty(policy.agentId)) {
    reasons.push("agentId:missing");
  }
  if (!nonEmpty(policy.workspaceId)) {
    reasons.push("workspaceId:missing");
  }
  if (!nonEmpty(policy.toolId)) {
    reasons.push("toolId:missing");
  }
  if (!nonEmpty(policy.policyEvidenceRef)) {
    reasons.push("policyEvidenceRef:missing");
  }
  if (!positive(policy.limits.cpuTimeMs)) {
    reasons.push("limit:cpuTimeMs:invalid");
  }
  if (!positive(policy.limits.memoryLimitMb)) {
    reasons.push("limit:memoryLimitMb:invalid");
  }
  if (!nonNegative(policy.limits.ioReadMb)) {
    reasons.push("limit:ioReadMb:invalid");
  }
  if (!nonNegative(policy.limits.ioWriteMb)) {
    reasons.push("limit:ioWriteMb:invalid");
  }
  if (policy.limits.network.mode === "allowlist" && policy.limits.network.allowedHosts.length === 0) {
    reasons.push("limit:network.allowedHosts:missing");
  }
  if (policy.limits.filesystem.readRoots.length === 0) {
    reasons.push("limit:filesystem.readRoots:missing");
  }
  if (policy.limits.filesystem.writeRoots.length === 0) {
    reasons.push("limit:filesystem.writeRoots:missing");
  }
  if (!positive(policy.limits.maxProcesses)) {
    reasons.push("limit:maxProcesses:invalid");
  }
  return reasons;
}

function usageReasons(usage: ToolSandboxObservedUsage): string[] {
  const reasons: string[] = [];
  if (!nonEmpty(usage.executionId)) {
    reasons.push("executionId:missing");
  }
  if (!nonEmpty(usage.commandRef)) {
    reasons.push("commandRef:missing");
  }
  if (!nonEmpty(usage.observedAt)) {
    reasons.push("observedAt:missing");
  }
  if (!nonEmpty(usage.observationEvidenceRef)) {
    reasons.push("observationEvidenceRef:missing");
  }
  if (!nonEmpty(usage.enforcementReceiptRef)) {
    reasons.push("enforcementReceiptRef:missing");
  }
  if (!nonNegative(usage.durationMs)) {
    reasons.push("durationMs:invalid");
  }
  if (!nonNegative(usage.cpuTimeMs)) {
    reasons.push("cpuTimeMs:invalid");
  }
  if (!nonNegative(usage.peakMemoryMb)) {
    reasons.push("peakMemoryMb:invalid");
  }
  if (!nonNegative(usage.ioReadMb)) {
    reasons.push("ioReadMb:invalid");
  }
  if (!nonNegative(usage.ioWriteMb)) {
    reasons.push("ioWriteMb:invalid");
  }
  if (!nonNegative(usage.processCount)) {
    reasons.push("processCount:invalid");
  }
  for (const event of usage.networkEvents) {
    if (!nonEmpty(event.host)) {
      reasons.push("networkEvent:host:missing");
    }
    if (!positive(event.port)) {
      reasons.push(`networkEvent:${event.host || "unknown"}:port:invalid`);
    }
    if (!nonEmpty(event.evidenceRef)) {
      reasons.push(`networkEvent:${event.host || "unknown"}:evidenceRef:missing`);
    }
  }
  for (const event of usage.filesystemEvents) {
    if (!nonEmpty(event.path)) {
      reasons.push("filesystemEvent:path:missing");
    }
    if (!nonEmpty(event.evidenceRef)) {
      reasons.push(`filesystemEvent:${event.path || "unknown"}:evidenceRef:missing`);
    }
  }
  return reasons;
}

function startsWithRoot(path: string, roots: string[]): boolean {
  return roots.some((root) => path === root || path.startsWith(`${root.replace(/\/$/, "")}/`));
}

function networkViolation(policy: ToolSandboxNetworkPolicy, event: ToolSandboxNetworkEvent): boolean {
  if (!event.allowed) {
    return true;
  }
  if (policy.mode === "deny") {
    return true;
  }
  if (policy.mode === "allow") {
    return false;
  }
  return !policy.allowedHosts.includes(event.host);
}

function filesystemViolation(policy: ToolSandboxFilesystemPolicy, event: ToolSandboxFilesystemEvent): boolean {
  if (!event.allowed) {
    return true;
  }
  if (event.operation === "read") {
    return !startsWithRoot(event.path, policy.readRoots);
  }
  if (event.operation === "write") {
    return !startsWithRoot(event.path, policy.writeRoots);
  }
  return !startsWithRoot(event.path, policy.readRoots) && !startsWithRoot(event.path, policy.writeRoots);
}

function collectViolations(
  policy: ToolSandboxResourceLimitPolicy,
  usage: ToolSandboxObservedUsage
): ToolSandboxViolation[] {
  const violations: ToolSandboxViolation[] = [];
  if (usage.cpuTimeMs > policy.limits.cpuTimeMs) {
    violations.push({
      type: "CPU_LIMIT_EXCEEDED",
      limit: policy.limits.cpuTimeMs,
      actual: usage.cpuTimeMs,
      evidenceRef: usage.observationEvidenceRef || null,
      message: `CPU time ${usage.cpuTimeMs}ms exceeded limit ${policy.limits.cpuTimeMs}ms.`
    });
  }
  if (usage.peakMemoryMb > policy.limits.memoryLimitMb) {
    violations.push({
      type: "MEMORY_LIMIT_EXCEEDED",
      limit: policy.limits.memoryLimitMb,
      actual: usage.peakMemoryMb,
      evidenceRef: usage.observationEvidenceRef || null,
      message: `Peak memory ${usage.peakMemoryMb}MB exceeded limit ${policy.limits.memoryLimitMb}MB.`
    });
  }
  if (usage.ioReadMb > policy.limits.ioReadMb) {
    violations.push({
      type: "IO_READ_LIMIT_EXCEEDED",
      limit: policy.limits.ioReadMb,
      actual: usage.ioReadMb,
      evidenceRef: usage.observationEvidenceRef || null,
      message: `Read I/O ${usage.ioReadMb}MB exceeded limit ${policy.limits.ioReadMb}MB.`
    });
  }
  if (usage.ioWriteMb > policy.limits.ioWriteMb) {
    violations.push({
      type: "IO_WRITE_LIMIT_EXCEEDED",
      limit: policy.limits.ioWriteMb,
      actual: usage.ioWriteMb,
      evidenceRef: usage.observationEvidenceRef || null,
      message: `Write I/O ${usage.ioWriteMb}MB exceeded limit ${policy.limits.ioWriteMb}MB.`
    });
  }
  for (const event of usage.networkEvents) {
    if (networkViolation(policy.limits.network, event)) {
      violations.push({
        type: "NETWORK_DENIED",
        limit: policy.limits.network.mode === "allowlist" ? policy.limits.network.allowedHosts.join(",") : policy.limits.network.mode,
        actual: `${event.host}:${event.port}`,
        evidenceRef: event.evidenceRef || null,
        message: `Network access to ${event.host}:${event.port} violated sandbox network policy.`
      });
    }
  }
  for (const event of usage.filesystemEvents) {
    if (filesystemViolation(policy.limits.filesystem, event)) {
      violations.push({
        type: "FILESYSTEM_DENIED",
        limit: `${policy.limits.filesystem.readRoots.join(",")} | ${policy.limits.filesystem.writeRoots.join(",")}`,
        actual: `${event.operation}:${event.path}`,
        evidenceRef: event.evidenceRef || null,
        message: `Filesystem ${event.operation} at ${event.path} violated sandbox filesystem policy.`
      });
    }
  }
  if (usage.processCount > policy.limits.maxProcesses) {
    violations.push({
      type: "PROCESS_LIMIT_EXCEEDED",
      limit: policy.limits.maxProcesses,
      actual: usage.processCount,
      evidenceRef: usage.observationEvidenceRef || null,
      message: `Process count ${usage.processCount} exceeded limit ${policy.limits.maxProcesses}.`
    });
  }
  return violations;
}

function requiredEvidenceRefs(input: BuildToolSandboxResourceLimitReceiptInput): string[] {
  return unique([
    input.policy.policyEvidenceRef,
    input.usage.commandRef,
    input.usage.observationEvidenceRef,
    input.usage.enforcementReceiptRef,
    ...input.usage.networkEvents.map((event) => event.evidenceRef),
    ...input.usage.filesystemEvents.map((event) => event.evidenceRef)
  ].filter(nonEmpty));
}

export function buildToolSandboxResourceLimitReceipt(
  input: BuildToolSandboxResourceLimitReceiptInput
): ToolSandboxResourceLimitReceipt {
  const failClosedReasons = unique([
    ...sourceCitationReasons(input.sourceCitations),
    ...policyReasons(input.policy),
    ...usageReasons(input.usage)
  ]);
  const violations = collectViolations(input.policy, input.usage);
  const status: ToolSandboxReceiptStatus = failClosedReasons.length > 0
    ? "fail_closed"
    : violations.length > 0
      ? "violation"
      : "pass";

  const withoutHash: Omit<ToolSandboxResourceLimitReceipt, "receiptHash"> = {
    receiptId: input.receiptId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    surfaceBindings: ["API", "Studio", "Fleet", "Enforce", "Score"],
    policy: input.policy,
    usage: input.usage,
    coveredLimits: COVERED_LIMITS,
    violations,
    requiredEvidenceRefs: requiredEvidenceRefs(input),
    sourceCitations: input.sourceCitations,
    status,
    scorePenalty: Math.min(100, (failClosedReasons.length * 5) + (violations.length * 10)),
    failClosed: failClosedReasons.length > 0,
    failClosedReasons
  };

  return {
    ...withoutHash,
    receiptHash: receiptHash(withoutHash)
  };
}

export function verifyToolSandboxResourceLimitReceipt(
  receipt: ToolSandboxResourceLimitReceipt
): ToolSandboxResourceLimitVerification {
  const reasons: string[] = [];
  if (receipt.failClosed) {
    reasons.push(...receipt.failClosedReasons);
  }
  if (receipt.status === "fail_closed" && !receipt.failClosed) {
    reasons.push("failClosed:expected");
  }
  if (receipt.status === "pass" && receipt.violations.length > 0) {
    reasons.push("status:pass-with-violations");
  }
  if (receipt.status === "violation" && receipt.violations.length === 0) {
    reasons.push("status:violation-without-violations");
  }
  if (receipt.coveredLimits.join("|") !== COVERED_LIMITS.join("|")) {
    reasons.push("coveredLimits:incomplete");
  }
  if (receipt.requiredEvidenceRefs.length === 0) {
    reasons.push("requiredEvidenceRefs:missing");
  }
  const { receiptHash: existingHash, ...withoutHash } = receipt;
  if (!nonEmpty(existingHash) || existingHash !== receiptHash(withoutHash)) {
    reasons.push("receiptHash:invalid");
  }
  return {
    valid: reasons.length === 0,
    reasons
  };
}

export function renderToolSandboxResourceLimitMarkdown(receipt: ToolSandboxResourceLimitReceipt): string {
  const violationRows = receipt.violations.length === 0
    ? "| none | none | none | none |\n"
    : receipt.violations
      .map((violation) => `| ${violation.type} | ${violation.limit} | ${violation.actual} | ${violation.evidenceRef ?? "missing"} |`)
      .join("\n");

  return [
    `# Tool Sandbox Resource Limit Receipt ${receipt.receiptId}`,
    "",
    `- Status: \`${receipt.status}\``,
    `- Policy: \`${receipt.policy.policyId || "missing"}\``,
    `- Agent: \`${receipt.policy.agentId || "missing"}\``,
    `- Workspace: \`${receipt.policy.workspaceId || "missing"}\``,
    `- Tool: \`${receipt.policy.toolId || "missing"}\``,
    `- Execution: \`${receipt.usage.executionId || "missing"}\``,
    `- Surfaces: ${receipt.surfaceBindings.join(", ")}`,
    `- Fail closed: ${receipt.failClosed ? "yes" : "no"}`,
    "",
    "## Covered Limits",
    "",
    receipt.coveredLimits.map((limit) => `- ${limit}`).join("\n"),
    "",
    "## Violations",
    "",
    "| Type | Limit | Actual | Evidence |",
    "| --- | --- | --- | --- |",
    violationRows,
    "",
    "## Evidence",
    "",
    receipt.requiredEvidenceRefs.map((ref) => `- ${ref}`).join("\n") || "- missing",
    "",
    "## Source Citations",
    "",
    receipt.sourceCitations.map((citation) => `- ${citation.title}: ${citation.url}`).join("\n") || "- missing"
  ].join("\n");
}
