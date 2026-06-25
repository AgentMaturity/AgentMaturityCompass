import { randomUUID } from "node:crypto";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import type { RiskTier } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type McpServerAttestationTransport = "stdio" | "streamable-http" | "sse" | "http";
export type McpServerAttestationNetworkPolicy = "none" | "allowlisted" | "open";
export type McpServerAttestationIsolation = "none" | "process" | "container" | "vm";
export type McpServerAttestationFilesystemPolicy = "none" | "read-only" | "read-write";
export type McpServerAttestationSecretsPolicy = "none" | "env-allowlist" | "vault-brokered";
export type McpServerAttestationScanResult = "pass" | "warn" | "fail";
export type McpServerAttestationFindingSeverity = "low" | "med" | "high" | "critical";
export type McpServerAttestationFindingStatus = "open" | "mitigated" | "accepted";
export type McpServerRiskAttestationPhase = "beforeExecution" | "afterExecution";

export interface McpServerRiskAttestationSourceCitation {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
}

export interface McpServerCapability {
  capabilityId: string;
  title: string;
  riskTier: RiskTier;
  scopes: string[];
  resources: string[];
  externalSystems: string[];
  dataClasses: string[];
  sideEffects: string[];
}

export interface McpServerManifest {
  serverId: string;
  serverName: string;
  serverVersion: string;
  transports: McpServerAttestationTransport[];
  packageRef: string;
  capabilities: McpServerCapability[];
  dataAccess: string[];
  networkReach: string[];
  sourceCitations: McpServerRiskAttestationSourceCitation[];
}

export interface McpServerSignerIdentity {
  signerId: string;
  organization: string;
  keyRef: string;
}

export interface McpServerSandboxPolicy {
  sandboxRequired: boolean;
  isolation: McpServerAttestationIsolation;
  networkPolicy: McpServerAttestationNetworkPolicy;
  allowedHosts: string[];
  filesystemPolicy: McpServerAttestationFilesystemPolicy;
  secretsPolicy: McpServerAttestationSecretsPolicy;
}

export interface McpServerScanFinding {
  findingId: string;
  severity: McpServerAttestationFindingSeverity;
  status: McpServerAttestationFindingStatus;
  title: string;
}

export interface McpServerLastScan {
  scanId: string;
  scanner: string;
  scannedAt: string;
  result: McpServerAttestationScanResult;
  findings: McpServerScanFinding[];
}

export interface SignedMcpServerRiskAttestation {
  schemaVersion: "2026-06-25";
  attestationId: string;
  serverManifest: McpServerManifest;
  signerIdentity: McpServerSignerIdentity;
  sandboxPolicy: McpServerSandboxPolicy;
  lastScan: McpServerLastScan | null;
  attestationDigestSha256: string;
  attestationSignature: string;
  signer: "auditor";
  signedTs: number;
  metadataOnlyAccepted: false;
}

export interface McpServerObservedInvocation {
  transport: McpServerAttestationTransport;
  capabilityId: string;
  scopes: string[];
  resources: string[];
  externalSystems: string[];
  dataClasses: string[];
  sandboxed: boolean;
  networkPolicy: McpServerAttestationNetworkPolicy;
  host: string;
}

export interface McpServerRiskScoreImpact {
  baseRiskScore: number;
  riskTier: RiskTier;
  scorePenalty: number;
  scoreSignals: string[];
}

export interface McpServerRiskAttestationReceipt {
  schemaVersion: "2026-06-25";
  receiptId: string;
  createdAt: string;
  phase: McpServerRiskAttestationPhase;
  attestation: SignedMcpServerRiskAttestation;
  attestationId: string;
  serverId: string;
  serverVersion: string;
  signerIdentity: McpServerSignerIdentity | null;
  sandboxPolicy: McpServerSandboxPolicy | null;
  lastScan: McpServerLastScan | null;
  observedInvocation: McpServerObservedInvocation;
  requiredEvidence: ["server_manifest", "capability_list", "signer_identity", "sandbox_policy", "last_scan"];
  signatureValid: boolean;
  allowed: boolean;
  blockBeforeExecution: boolean;
  reasons: string[];
  driftFindings: string[];
  riskScoreImpact: McpServerRiskScoreImpact;
  metadataOnlyAccepted: boolean;
  surfaceBinding: ["Enforce", "Shield", "Vault", "Passport"];
  receiptHash: string;
}

export interface McpServerRiskAttestationReceiptVerification {
  valid: boolean;
  failClosedReasons: string[];
}

const requiredEvidence: McpServerRiskAttestationReceipt["requiredEvidence"] = [
  "server_manifest",
  "capability_list",
  "signer_identity",
  "sandbox_policy",
  "last_scan"
];

const baseRiskScoreByTier: Record<RiskTier, number> = {
  low: 20,
  med: 40,
  high: 70,
  critical: 95
};

const basePenaltyByTier: Record<RiskTier, number> = {
  low: 1,
  med: 2,
  high: 4,
  critical: 8
};

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeCapability(capability: McpServerCapability): McpServerCapability {
  return {
    capabilityId: capability.capabilityId,
    title: capability.title,
    riskTier: capability.riskTier,
    scopes: unique(capability.scopes),
    resources: unique(capability.resources),
    externalSystems: unique(capability.externalSystems),
    dataClasses: unique(capability.dataClasses),
    sideEffects: unique(capability.sideEffects)
  };
}

function normalizeManifest(manifest: McpServerManifest): McpServerManifest {
  return {
    serverId: manifest.serverId,
    serverName: manifest.serverName,
    serverVersion: manifest.serverVersion,
    transports: unique(manifest.transports) as McpServerAttestationTransport[],
    packageRef: manifest.packageRef,
    capabilities: manifest.capabilities.map(normalizeCapability),
    dataAccess: unique(manifest.dataAccess),
    networkReach: unique(manifest.networkReach),
    sourceCitations: manifest.sourceCitations
  };
}

function normalizeSandboxPolicy(policy: McpServerSandboxPolicy): McpServerSandboxPolicy {
  return {
    sandboxRequired: policy.sandboxRequired === true,
    isolation: policy.isolation,
    networkPolicy: policy.networkPolicy,
    allowedHosts: unique(policy.allowedHosts),
    filesystemPolicy: policy.filesystemPolicy,
    secretsPolicy: policy.secretsPolicy
  };
}

function unsignedAttestationPayload(attestation: {
  schemaVersion?: "2026-06-25";
  attestationId: string;
  serverManifest: McpServerManifest;
  signerIdentity: McpServerSignerIdentity;
  sandboxPolicy: McpServerSandboxPolicy;
  lastScan: McpServerLastScan | null;
}) {
  return {
    schemaVersion: attestation.schemaVersion ?? "2026-06-25",
    attestationId: attestation.attestationId,
    serverManifest: normalizeManifest(attestation.serverManifest),
    signerIdentity: attestation.signerIdentity,
    sandboxPolicy: normalizeSandboxPolicy(attestation.sandboxPolicy),
    lastScan: attestation.lastScan
  };
}

function attestationDigest(attestation: SignedMcpServerRiskAttestation): string {
  return sha256Hex(canonicalize(unsignedAttestationPayload(attestation)));
}

function receiptHashFor(receipt: McpServerRiskAttestationReceipt): string {
  return sha256Hex(canonicalize({ ...receipt, receiptHash: "" }));
}

function verifyAttestationSignature(workspace: string, attestation: SignedMcpServerRiskAttestation): boolean {
  if (!attestation.attestationDigestSha256 || !attestation.attestationSignature) {
    return false;
  }
  const digest = attestationDigest(attestation);
  if (digest !== attestation.attestationDigestSha256) {
    return false;
  }
  return verifyHexDigestAny(digest, attestation.attestationSignature, getPublicKeyHistory(workspace, "auditor"));
}

function networkPolicyRank(policy: McpServerAttestationNetworkPolicy): number {
  if (policy === "none") return 0;
  if (policy === "allowlisted") return 1;
  return 2;
}

function maxRiskTier(capabilities: McpServerCapability[]): RiskTier {
  const ranks: Record<RiskTier, number> = { low: 0, med: 1, high: 2, critical: 3 };
  return capabilities.reduce<RiskTier>((current, capability) => (
    ranks[capability.riskTier] > ranks[current] ? capability.riskTier : current
  ), "low");
}

function missingFrom(allowed: string[], observed: string[]): string[] {
  const allowedSet = new Set(unique(allowed));
  return unique(observed).filter((value) => !allowedSet.has(value));
}

function allCapabilityValues<K extends keyof Pick<McpServerCapability, "scopes" | "resources" | "externalSystems" | "dataClasses">>(
  capabilities: McpServerCapability[],
  key: K
): string[] {
  return unique(capabilities.flatMap((capability) => capability[key]));
}

function scanAgeMs(now: string, scan: McpServerLastScan): number {
  return Date.parse(now) - Date.parse(scan.scannedAt);
}

function scoreImpact(input: {
  riskTier: RiskTier;
  signatureValid: boolean;
  lastScan: McpServerLastScan | null;
  sandboxPolicy: McpServerSandboxPolicy | null;
  reasons: string[];
}): McpServerRiskScoreImpact {
  const scoreSignals = [`mcp-server-risk:${input.riskTier}`];
  if (input.signatureValid && input.reasons.length === 0) {
    scoreSignals.push("mcp-server-attestation:valid");
  }
  if (input.sandboxPolicy) {
    scoreSignals.push(`mcp-server-sandbox:${input.sandboxPolicy.isolation}`);
  }
  if (input.lastScan) {
    scoreSignals.push(`mcp-server-scan:${input.lastScan.result}`);
  }
  return {
    baseRiskScore: baseRiskScoreByTier[input.riskTier],
    riskTier: input.riskTier,
    scorePenalty: basePenaltyByTier[input.riskTier] + input.reasons.length,
    scoreSignals
  };
}

export function createSignedMcpServerRiskAttestation(input: {
  workspace: string;
  attestationId: string;
  serverManifest: McpServerManifest;
  signerIdentity: McpServerSignerIdentity;
  sandboxPolicy: McpServerSandboxPolicy;
  lastScan: McpServerLastScan;
}): SignedMcpServerRiskAttestation {
  const payload = unsignedAttestationPayload({
    schemaVersion: "2026-06-25",
    attestationId: input.attestationId,
    serverManifest: input.serverManifest,
    signerIdentity: input.signerIdentity,
    sandboxPolicy: input.sandboxPolicy,
    lastScan: input.lastScan
  });
  const digest = sha256Hex(canonicalize(payload));
  return {
    ...payload,
    attestationDigestSha256: digest,
    attestationSignature: signHexDigest(digest, getPrivateKeyPem(input.workspace, "auditor")),
    signer: "auditor",
    signedTs: Date.now(),
    metadataOnlyAccepted: false
  };
}

export function evaluateMcpServerRiskAttestation(input: {
  workspace: string;
  attestation: SignedMcpServerRiskAttestation;
  phase: McpServerRiskAttestationPhase;
  now?: string;
  maxScanAgeDays?: number;
  observedInvocation: McpServerObservedInvocation;
}): McpServerRiskAttestationReceipt {
  const now = input.now ?? new Date().toISOString();
  const maxScanAgeMs = (input.maxScanAgeDays ?? 7) * 24 * 60 * 60 * 1000;
  const manifest = input.attestation.serverManifest;
  const capabilities = manifest?.capabilities ?? [];
  const capability = capabilities.find((item) => item.capabilityId === input.observedInvocation.capabilityId) ?? null;
  const riskTier = capability?.riskTier ?? maxRiskTier(capabilities);
  const signatureValid = verifyAttestationSignature(input.workspace, input.attestation);
  const metadataOnlyAccepted = input.attestation.metadataOnlyAccepted !== false;
  const reasons: string[] = [];
  const driftFindings: string[] = [];

  if (metadataOnlyAccepted) {
    reasons.push("mcp-server-attestation:metadata-only:not-accepted");
    driftFindings.push("mcp_server_attestation_metadata_only");
  }
  if (!signatureValid) {
    reasons.push("mcp-server-attestation:signature:invalid");
    driftFindings.push("mcp_server_attestation_invalid");
  }
  if (!manifest || !manifest.serverId || capabilities.length === 0) {
    reasons.push("mcp-server-attestation:server-manifest:missing");
    driftFindings.push("mcp_server_manifest_missing");
  }
  if (!input.attestation.signerIdentity?.signerId) {
    reasons.push("mcp-server-attestation:signer:missing");
    driftFindings.push("mcp_server_signer_missing");
  }
  if (!input.attestation.sandboxPolicy) {
    reasons.push("mcp-server-attestation:sandbox-policy:missing");
    driftFindings.push("mcp_server_sandbox_missing");
  }
  if (!input.attestation.lastScan) {
    reasons.push("mcp-server-attestation:last-scan:missing");
    driftFindings.push("mcp_server_scan_missing");
  } else {
    if (scanAgeMs(now, input.attestation.lastScan) > maxScanAgeMs) {
      reasons.push("mcp-server-attestation:scan:stale");
      driftFindings.push("mcp_server_scan_stale");
    }
    if (input.attestation.lastScan.result === "fail") {
      reasons.push("mcp-server-attestation:scan:fail");
      driftFindings.push("mcp_server_scan_failed");
    }
    for (const finding of input.attestation.lastScan.findings) {
      if ((finding.severity === "high" || finding.severity === "critical") && finding.status === "open") {
        reasons.push(`mcp-server-attestation:scan:finding-open:${finding.findingId}`);
        driftFindings.push("mcp_server_scan_open_high_risk_finding");
      }
    }
  }

  if (!unique(manifest?.transports ?? []).includes(input.observedInvocation.transport)) {
    reasons.push(`mcp-server-attestation:transport:not-declared:${input.observedInvocation.transport}`);
    driftFindings.push("mcp_server_transport_drift");
  }
  if (!capability) {
    reasons.push(`mcp-server-attestation:capability:not-declared:${input.observedInvocation.capabilityId}`);
    driftFindings.push("mcp_server_capability_drift");
  }

  const declaredScopes = capability ? capability.scopes : allCapabilityValues(capabilities, "scopes");
  const declaredResources = capability ? capability.resources : allCapabilityValues(capabilities, "resources");
  const declaredExternalSystems = capability ? capability.externalSystems : unique([
    ...allCapabilityValues(capabilities, "externalSystems"),
    ...(manifest?.networkReach ?? [])
  ]);
  const declaredDataClasses = capability ? capability.dataClasses : unique([
    ...allCapabilityValues(capabilities, "dataClasses"),
    ...(manifest?.dataAccess ?? [])
  ]);

  for (const scope of missingFrom(declaredScopes, input.observedInvocation.scopes)) {
    reasons.push(`mcp-server-attestation:scope:not-declared:${scope}`);
    driftFindings.push("mcp_server_capability_drift");
  }
  for (const resource of missingFrom(declaredResources, input.observedInvocation.resources)) {
    reasons.push(`mcp-server-attestation:resource:not-declared:${resource}`);
    driftFindings.push("mcp_server_capability_drift");
  }
  for (const externalSystem of missingFrom(declaredExternalSystems, input.observedInvocation.externalSystems)) {
    reasons.push(`mcp-server-attestation:external-system:not-declared:${externalSystem}`);
    driftFindings.push("mcp_server_capability_drift");
  }
  for (const dataClass of missingFrom(declaredDataClasses, input.observedInvocation.dataClasses)) {
    reasons.push(`mcp-server-attestation:data-class:not-declared:${dataClass}`);
    driftFindings.push("mcp_server_capability_drift");
  }

  const sandboxPolicy = input.attestation.sandboxPolicy ?? null;
  if (sandboxPolicy) {
    if (sandboxPolicy.sandboxRequired && !input.observedInvocation.sandboxed) {
      reasons.push("mcp-server-attestation:sandbox:required");
      driftFindings.push("mcp_server_sandbox_drift");
    }
    if (networkPolicyRank(input.observedInvocation.networkPolicy) > networkPolicyRank(sandboxPolicy.networkPolicy)) {
      reasons.push(`mcp-server-attestation:network-policy:${input.observedInvocation.networkPolicy}`);
      driftFindings.push("mcp_server_sandbox_drift");
    }
    if (sandboxPolicy.allowedHosts.length > 0 && !sandboxPolicy.allowedHosts.includes(input.observedInvocation.host)) {
      reasons.push(`mcp-server-attestation:host:not-allowlisted:${input.observedInvocation.host}`);
      driftFindings.push("mcp_server_sandbox_drift");
    }
  }

  const allowed = reasons.length === 0;
  const baseReceipt: McpServerRiskAttestationReceipt = {
    schemaVersion: "2026-06-25",
    receiptId: `mcpattest_${randomUUID().replace(/-/g, "")}`,
    createdAt: new Date().toISOString(),
    phase: input.phase,
    attestation: input.attestation,
    attestationId: input.attestation.attestationId,
    serverId: manifest?.serverId ?? "",
    serverVersion: manifest?.serverVersion ?? "",
    signerIdentity: input.attestation.signerIdentity ?? null,
    sandboxPolicy,
    lastScan: input.attestation.lastScan ?? null,
    observedInvocation: {
      ...input.observedInvocation,
      scopes: unique(input.observedInvocation.scopes),
      resources: unique(input.observedInvocation.resources),
      externalSystems: unique(input.observedInvocation.externalSystems),
      dataClasses: unique(input.observedInvocation.dataClasses)
    },
    requiredEvidence,
    signatureValid,
    allowed,
    blockBeforeExecution: input.phase === "beforeExecution" && !allowed,
    reasons: allowed ? ["mcp-server-attestation:approved"] : unique(reasons),
    driftFindings: unique(driftFindings),
    riskScoreImpact: scoreImpact({
      riskTier,
      signatureValid,
      lastScan: input.attestation.lastScan ?? null,
      sandboxPolicy,
      reasons
    }),
    metadataOnlyAccepted,
    surfaceBinding: ["Enforce", "Shield", "Vault", "Passport"],
    receiptHash: ""
  };

  return {
    ...baseReceipt,
    receiptHash: receiptHashFor(baseReceipt)
  };
}

export function verifyMcpServerRiskAttestationReceipt(input: {
  workspace: string;
  receipt: McpServerRiskAttestationReceipt;
}): McpServerRiskAttestationReceiptVerification {
  const receipt = input.receipt;
  const reasons: string[] = [];

  if (receipt.metadataOnlyAccepted !== false) {
    reasons.push("mcp-server-attestation:metadata-only:not-accepted");
  }
  if (receipt.receiptHash !== receiptHashFor(receipt)) {
    reasons.push("mcp-server-attestation:receipt-hash:mismatch");
  }
  if (!verifyAttestationSignature(input.workspace, receipt.attestation) || receipt.signatureValid !== true) {
    reasons.push("mcp-server-attestation:signature:invalid");
  }
  for (const evidence of requiredEvidence) {
    if (!receipt.requiredEvidence.includes(evidence)) {
      reasons.push("mcp-server-attestation:required-evidence:missing");
      break;
    }
  }
  if (!receipt.attestation.serverManifest || receipt.attestation.serverManifest.capabilities.length === 0) {
    reasons.push("mcp-server-attestation:server-manifest:missing");
  }
  if (!receipt.signerIdentity?.signerId) {
    reasons.push("mcp-server-attestation:signer:missing");
  }
  if (!receipt.sandboxPolicy) {
    reasons.push("mcp-server-attestation:sandbox-policy:missing");
  }
  if (!receipt.lastScan) {
    reasons.push("mcp-server-attestation:last-scan:missing");
  }
  if (!receipt.surfaceBinding.includes("Enforce") || !receipt.surfaceBinding.includes("Shield") || !receipt.surfaceBinding.includes("Vault")) {
    reasons.push("mcp-server-attestation:surface-binding:missing");
  }

  const uniqueReasons = unique(reasons);
  return { valid: uniqueReasons.length === 0, failClosedReasons: uniqueReasons };
}
