import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { rmSync } from "node:fs";
import { z } from "zod";
import { createApprovalForIntent, consumeApprovedExecution, verifyApprovalForExecution } from "../approvals/approvalEngine.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { passportPolicySchema, type PassportPolicy } from "./passportPolicySchema.js";
import {
  defaultPassportExportPath,
  createPassportArtifact,
  inspectPassportArtifact,
  listExportedPassportArtifacts
} from "./passportArtifact.js";
import {
  loadPassportCache,
  loadPassportPolicy,
  savePassportPolicy,
  verifyPassportPolicySignature,
  getPassportRevocation,
  revokePassport
} from "./passportStore.js";
import { computePassportExpiresTs } from "./passportConstants.js";
import { verifyPassportArtifactFile, verifyPassportWorkspace } from "./passportVerifier.js";
import { loadTrustContext, type TrustContext } from "../trust/trustContext.js";

const pendingExportSchema = z.object({
  v: z.literal(1),
  requestId: z.string().min(1),
  approvalRequestId: z.string().min(1),
  intentId: z.string().min(1),
  agentId: z.string().min(1),
  scopeType: z.enum(["WORKSPACE", "NODE", "AGENT"]),
  scopeId: z.string().min(1),
  outFile: z.string().min(1),
  createdTs: z.number().int()
});

function pendingExportDir(workspace: string): string {
  return join(workspace, ".amc", "passport", "pending");
}

function pendingExportPath(workspace: string, approvalRequestId: string): string {
  return join(pendingExportDir(workspace), `${approvalRequestId}.json`);
}

function savePendingExport(workspace: string, pending: z.infer<typeof pendingExportSchema>): string {
  ensureDir(pendingExportDir(workspace));
  const path = pendingExportPath(workspace, pending.approvalRequestId);
  writeFileAtomic(path, JSON.stringify(pendingExportSchema.parse(pending), null, 2), 0o600);
  return path;
}

function loadPendingExport(workspace: string, approvalRequestId: string): z.infer<typeof pendingExportSchema> {
  const path = pendingExportPath(workspace, approvalRequestId);
  if (!pathExists(path)) {
    throw new Error(`pending passport export not found: ${approvalRequestId}`);
  }
  return pendingExportSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

function removePendingExport(workspace: string, approvalRequestId: string): void {
  const path = pendingExportPath(workspace, approvalRequestId);
  if (pathExists(path)) {
    rmSync(path, { force: true });
  }
}

function parseScope(params: {
  scopeType?: string | null;
  scopeId?: string | null;
}): { scopeType: "WORKSPACE" | "NODE" | "AGENT"; scopeId: string } {
  const scopeRaw = String(params.scopeType ?? "WORKSPACE").toUpperCase();
  const scopeType = scopeRaw === "NODE" || scopeRaw === "AGENT" ? scopeRaw : "WORKSPACE";
  const scopeId = scopeType === "WORKSPACE" ? "workspace" : ((params.scopeId ?? "").trim() || "default");
  return {
    scopeType,
    scopeId
  };
}

function badgeStatus(label: "VERIFIED" | "INFORMATIONAL" | "UNTRUSTED"): "VERIFIED" | "INFO" | "UNTRUSTED" {
  if (label === "INFORMATIONAL") {
    return "INFO";
  }
  return label;
}

function riskSummary(passport: ReturnType<typeof inspectPassportArtifact>["passport"]): string {
  const values = passport.strategyFailureRisks;
  const rows = [
    values.ecosystemFocusRisk,
    values.clarityPathRisk,
    values.economicSignificanceRisk,
    values.riskAssuranceRisk,
    values.digitalDualityRisk
  ].filter((row): row is number => typeof row === "number");
  if (rows.length === 0) {
    return "UNKNOWN";
  }
  const avg = rows.reduce((sum, row) => sum + row, 0) / rows.length;
  if (avg >= 80) return "HIGH";
  if (avg >= 60) return "ELEVATED";
  return "MODERATE";
}

function resolveBaseUrl(baseUrl?: string | null): string {
  const trimmed = (baseUrl ?? "").trim();
  return (trimmed.length > 0 ? trimmed : "http://localhost:8787").replace(/\/+$/, "");
}

function encodePath(value: string): string {
  return encodeURIComponent(value);
}

export function passportPublicUrlForApi(params: {
  passportId: string;
  baseUrl?: string | null;
}): string {
  return `${resolveBaseUrl(params.baseUrl)}/api/v1/passport/${encodePath(params.passportId)}`;
}

export function passportVerifyUrlForApi(params: {
  passportId: string;
  baseUrl?: string | null;
}): string {
  return `${resolveBaseUrl(params.baseUrl)}/api/v1/passport/${encodePath(params.passportId)}/verify`;
}

export function passportQrForApi(params: {
  passportId: string;
  baseUrl?: string | null;
  size?: number;
}) {
  const verifyUrl = passportVerifyUrlForApi(params);
  const size = Number.isFinite(params.size) ? Math.max(128, Math.min(1024, Math.trunc(params.size!))) : 256;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(verifyUrl)}`;
  return {
    verificationUrl: verifyUrl,
    qrCodeUrl
  };
}

function findPassportExportById(workspace: string, passportId: string): {
  file: string;
  sha256: string;
  generatedTs: number;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  status: "VERIFIED" | "INFORMATIONAL" | "UNTRUSTED";
} | null {
  return listExportedPassportArtifacts(workspace).find((row) => row.passportId === passportId) ?? null;
}

function passportExpiresTs(passport: ReturnType<typeof inspectPassportArtifact>["passport"]): number {
  return typeof passport.expiresTs === "number" ? passport.expiresTs : computePassportExpiresTs(passport.generatedTs);
}

type PublicVerifyError = {
  code: string;
  message: string;
};

export function passportInitForApi(workspace: string) {
  if (pathExists(join(workspace, ".amc", "passport", "policy.yaml"))) {
    return {
      path: join(workspace, ".amc", "passport", "policy.yaml"),
      sigPath: `${join(workspace, ".amc", "passport", "policy.yaml")}.sig`,
      policy: loadPassportPolicy(workspace)
    };
  }
  const policy = passportPolicySchema.parse(loadPassportPolicy(workspace));
  return {
    path: join(workspace, ".amc", "passport", "policy.yaml"),
    sigPath: `${join(workspace, ".amc", "passport", "policy.yaml")}.sig`,
    policy
  };
}

export function passportPolicyForApi(workspace: string): {
  policy: PassportPolicy;
  signature: ReturnType<typeof verifyPassportPolicySignature>;
} {
  return {
    policy: loadPassportPolicy(workspace),
    signature: verifyPassportPolicySignature(workspace)
  };
}

export function passportPolicyApplyForApi(params: {
  workspace: string;
  policy: unknown;
}) {
  const parsed = passportPolicySchema.parse(params.policy);
  const saved = savePassportPolicy(params.workspace, parsed);
  const entry = appendTransparencyEntry({
    workspace: params.workspace,
    type: "PASSPORT_POLICY_APPLIED",
    agentId: "workspace",
    artifact: {
      kind: "policy",
      sha256: sha256Hex(Buffer.from(canonicalize(parsed), "utf8")),
      id: "passport-policy"
    }
  });
  return {
    ...saved,
    transparencyHash: entry.hash
  };
}

export function passportReadinessGate(workspace: string): {
  ok: boolean;
  reasons: string[];
  warnings: string[];
} {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const sig = verifyPassportPolicySignature(workspace);
  if (!sig.valid) {
    reasons.push(`PASSPORT_POLICY_UNTRUSTED:${sig.reason ?? "unknown"}`);
  }
  const verify = verifyPassportWorkspace({
    workspace
  });
  if (!verify.ok) {
    warnings.push(...verify.errors.map((row) => `PASSPORT_VERIFY_WARN:${row}`));
  }
  return {
    ok: reasons.length === 0,
    reasons,
    warnings
  };
}

export function passportCreateForApi(params: {
  workspace: string;
  scopeType?: string | null;
  scopeId?: string | null;
  outFile?: string | null;
}) {
  const scope = parseScope(params);
  const outFile = params.outFile?.trim() || defaultPassportExportPath({
    workspace: params.workspace,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId
  });
  return createPassportArtifact({
    workspace: params.workspace,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    outFile: resolve(params.workspace, outFile)
  });
}

export function passportExportLatestForApi(params: {
  workspace: string;
  scopeType?: string | null;
  scopeId?: string | null;
  outFile?: string | null;
}) {
  return passportCreateForApi(params);
}

export function passportVerifyForApi(params: {
  workspace?: string;
  file: string;
  publicKeyPath?: string;
  trust: TrustContext;
}) {
  const verified = verifyPassportArtifactFile({
    workspace: params.workspace,
    file: params.file,
    publicKeyPath: params.publicKeyPath,
    trust: params.trust
  });
  if (verified.ok && verified.passport) {
    appendTransparencyEntry({
      workspace: params.workspace ?? process.cwd(),
      type: "PASSPORT_VERIFIED",
      agentId: "workspace",
      artifact: {
        kind: "amcpass",
        sha256: verified.fileSha256,
        id: verified.passport.passportId
      }
    });
  } else {
    appendTransparencyEntry({
      workspace: params.workspace ?? process.cwd(),
      type: "PASSPORT_VERIFICATION_FAILED",
      agentId: "workspace",
      artifact: {
        kind: "amcpass",
        sha256: verified.fileSha256,
        id: "verify-failed"
      }
    });
  }
  return verified;
}

export function passportCacheLatestForApi(params: {
  workspace: string;
  scopeType?: string | null;
  scopeId?: string | null;
}) {
  const scope = parseScope(params);
  const cached = loadPassportCache({
    workspace: params.workspace,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId
  });
  return {
    scope,
    passport: cached,
    signature: verifyPassportPolicySignature(params.workspace)
  };
}

export function passportBadgeForApi(params: {
  workspace: string;
  agentId: string;
}) {
  const policy = loadPassportPolicy(params.workspace);
  if (!policy.passportPolicy.governance.allowAgentReadOnlyBadge) {
    throw new Error("passport badge access disabled by policy");
  }
  let passport = loadPassportCache({
    workspace: params.workspace,
    scopeType: "AGENT",
    scopeId: params.agentId
  });
  if (!passport) {
    passport = passportCreateForApi({
      workspace: params.workspace,
      scopeType: "AGENT",
      scopeId: params.agentId
    }).passport;
  }
  const maturity = typeof passport.maturity.overall === "number" ? passport.maturity.overall.toFixed(1) : "UNKNOWN";
  const assurance = typeof passport.checkpoints.lastAssuranceCert.riskAssuranceScore === "number"
    ? String(Math.round(passport.checkpoints.lastAssuranceCert.riskAssuranceScore))
    : "UNKNOWN";
  const value = typeof passport.valueDimensions.valueScore === "number"
    ? String(Math.round(passport.valueDimensions.valueScore))
    : "UNKNOWN";
  const badge = [
    `AMC ${badgeStatus(passport.status.label)}`,
    `maturity=${maturity}/5`,
    `assurance=${assurance}`,
    `risks=${riskSummary(passport)}`,
    `value=${value}`,
    `ts=${new Date(passport.generatedTs).toISOString()}`
  ].join(" • ");
  return {
    badge,
    passport
  };
}

export function passportExportsForApi(workspace: string) {
  return listExportedPassportArtifacts(workspace);
}

export function passportExportRequestForApi(params: {
  workspace: string;
  agentId: string;
  scopeType?: string | null;
  scopeId?: string | null;
  outFile?: string | null;
}): {
  requestId: string;
  approvalRequestId: string;
  intentId: string;
} {
  const policy = loadPassportPolicy(params.workspace);
  if (!policy.passportPolicy.governance.requireDualControlForExternalSharing) {
    throw new Error("dual-control external sharing disabled; use direct export");
  }
  const scope = parseScope(params);
  const outFile = params.outFile?.trim() || defaultPassportExportPath({
    workspace: params.workspace,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId
  });
  const requestId = `passexp_${randomUUID().replace(/-/g, "")}`;
  const intentId = `passport-export-${requestId}`;
  const approval = createApprovalForIntent({
    workspace: params.workspace,
    agentId: params.agentId,
    intentId,
    toolName: "passport.export",
    // Approval engine ActionClass set does not include GOVERNANCE; SECURITY is
    // the strictest existing class used for governance-grade dual control.
    actionClass: "SECURITY",
    requestedMode: "EXECUTE",
    effectiveMode: "EXECUTE",
    riskTier: "high",
    intentPayload: {
      requestId,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      outFile: resolve(params.workspace, outFile)
    },
    leaseConstraints: {
      scopes: [],
      routeAllowlist: [],
      modelAllowlist: []
    }
  });
  savePendingExport(params.workspace, {
    v: 1,
    requestId,
    approvalRequestId: approval.approval.approvalRequestId,
    intentId,
    agentId: params.agentId,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    outFile: resolve(params.workspace, outFile),
    createdTs: Date.now()
  });
  return {
    requestId,
    approvalRequestId: approval.approval.approvalRequestId,
    intentId
  };
}

export function passportExportExecuteForApi(params: {
  workspace: string;
  approvalRequestId: string;
}) {
  const pending = loadPendingExport(params.workspace, params.approvalRequestId);
  const approval = verifyApprovalForExecution({
    workspace: params.workspace,
    approvalId: pending.approvalRequestId,
    expectedAgentId: pending.agentId,
    expectedIntentId: pending.intentId,
    expectedToolName: "passport.export",
    expectedActionClass: "SECURITY"
  });
  if (!approval.ok) {
    throw new Error(`passport export approval not executable: ${approval.error ?? approval.status ?? "unknown"}`);
  }
  const out = passportExportLatestForApi({
    workspace: params.workspace,
    scopeType: pending.scopeType,
    scopeId: pending.scopeId,
    outFile: pending.outFile
  });
  consumeApprovedExecution({
    workspace: params.workspace,
    approvalId: pending.approvalRequestId,
    expectedAgentId: pending.agentId,
    executionId: pending.requestId
  });
  removePendingExport(params.workspace, pending.approvalRequestId);
  return out;
}

export function passportPublicForApi(params: {
  workspace: string;
  passportId: string;
  baseUrl?: string | null;
}) {
  const found = findPassportExportById(params.workspace, params.passportId);
  if (!found) {
    return null;
  }
  const inspected = inspectPassportArtifact(found.file);
  const revocation = getPassportRevocation(params.workspace, inspected.passport.passportId);
  const expiresTs = passportExpiresTs(inspected.passport);
  const nowTs = Date.now();
  const qr = passportQrForApi({
    passportId: inspected.passport.passportId,
    baseUrl: params.baseUrl
  });
  return {
    passportId: inspected.passport.passportId,
    generatedTs: inspected.passport.generatedTs,
    expiresTs,
    expired: nowTs > expiresTs,
    revoked: revocation !== null,
    revocation,
    scopeType: inspected.passport.scope.type,
    status: inspected.passport.status.label,
    fileSha256: found.sha256,
    verificationUrl: qr.verificationUrl,
    publicUrl: passportPublicUrlForApi({
      passportId: inspected.passport.passportId,
      baseUrl: params.baseUrl
    }),
    qrCodeUrl: qr.qrCodeUrl,
    passport: inspected.passport
  };
}

export function passportVerifyPublicForApi(params: {
  workspace: string;
  passportId: string;
  baseUrl?: string | null;
}) {
  const found = findPassportExportById(params.workspace, params.passportId);
  if (!found) {
    return null;
  }
  // A public verify endpoint: the server operator's trust context decides, never the workspace's own keys.
  const verified = passportVerifyForApi({
    workspace: params.workspace,
    file: found.file,
    trust: loadTrustContext()
  });
  const passport = verified.passport ?? inspectPassportArtifact(found.file).passport;
  const revocation = getPassportRevocation(params.workspace, passport.passportId);
  const expiresTs = passportExpiresTs(passport);
  const nowTs = Date.now();
  const expired = nowTs > expiresTs;
  const revoked = revocation !== null;
  const runtimeErrors: PublicVerifyError[] = verified.errors.map((error) => ({
    code: error.code,
    message: error.message
  }));
  if (expired && !runtimeErrors.some((error) => error.code === "PASSPORT_EXPIRED")) {
    runtimeErrors.push({
      code: "PASSPORT_EXPIRED",
      message: `passport expired at ${new Date(expiresTs).toISOString()}`
    });
  }
  if (revoked && !runtimeErrors.some((error) => error.code === "PASSPORT_REVOKED")) {
    runtimeErrors.push({
      code: "PASSPORT_REVOKED",
      message: `passport revoked at ${new Date(revocation!.revokedTs).toISOString()}`
    });
  }
  const qr = passportQrForApi({
    passportId: passport.passportId,
    baseUrl: params.baseUrl
  });
  return {
    ok: verified.ok && !expired && !revoked,
    passportId: passport.passportId,
    verifiedTs: nowTs,
    fileSha256: verified.fileSha256,
    expired,
    expiresTs,
    revoked,
    revocation,
    verificationUrl: qr.verificationUrl,
    publicUrl: passportPublicUrlForApi({
      passportId: passport.passportId,
      baseUrl: params.baseUrl
    }),
    qrCodeUrl: qr.qrCodeUrl,
    errors: runtimeErrors,
    passport
  };
}

export function passportRevokeForApi(params: {
  workspace: string;
  passportId: string;
  reason?: string | null;
  revokedBy?: string | null;
}) {
  const found = findPassportExportById(params.workspace, params.passportId);
  if (!found) {
    return null;
  }
  const entry = revokePassport({
    workspace: params.workspace,
    passportId: params.passportId,
    reason: params.reason,
    revokedBy: params.revokedBy
  });
  appendTransparencyEntry({
    workspace: params.workspace,
    type: "PASSPORT_REVOKED",
    agentId: "workspace",
    artifact: {
      kind: "amcpass",
      sha256: found.sha256,
      id: params.passportId
    }
  });
  return {
    revoked: true,
    passportId: params.passportId,
    revokedTs: entry.revokedTs,
    reason: entry.reason,
    revokedBy: entry.revokedBy
  };
}

export function passportRegistryForApi(params: {
  workspace: string;
  page?: number | null;
  pageSize?: number | null;
  baseUrl?: string | null;
}) {
  const all = listExportedPassportArtifacts(params.workspace);
  const nowTs = Date.now();
  const pageSize = Math.max(1, Math.min(100, Math.trunc(params.pageSize ?? 20)));
  const page = Math.max(1, Math.trunc(params.page ?? 1));
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const items = all.slice(start, start + pageSize).map((row) => {
    const revocation = getPassportRevocation(params.workspace, row.passportId);
    const expiresTs = computePassportExpiresTs(row.generatedTs);
    const qr = passportQrForApi({
      passportId: row.passportId,
      baseUrl: params.baseUrl
    });
    return {
      passportId: row.passportId,
      generatedTs: row.generatedTs,
      expiresTs,
      expired: nowTs > expiresTs,
      revoked: revocation !== null,
      revocation,
      scopeType: row.scopeType,
      status: row.status,
      fileSha256: row.sha256,
      verificationUrl: qr.verificationUrl,
      publicUrl: passportPublicUrlForApi({
        passportId: row.passportId,
        baseUrl: params.baseUrl
      }),
      qrCodeUrl: qr.qrCodeUrl
    };
  });
  return {
    page,
    pageSize,
    total,
    totalPages,
    items
  };
}
