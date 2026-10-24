import { escapePdfText as escapeSharedPdfText, renderPdfFromLines as renderSharedPdfLines } from "../utils/textPdf.js";
import { assertOwnerMode } from "../mode/mode.js";
import { captureOrgFiles, assertOrgPairsCurrent, orgPairBytes } from "../org/preparedOrgPairs.js";
import { passportPolicyPath } from "./passportStore.js";
import { capturePassportShareRead } from "./passportLazyReads.js";
import { PassportPublicationError, passportPublicationFailure, type PassportPublicationOptions } from "./passportPublication.js";
import { passportBadgeAttemptForApiAsync } from "./passportApi.js";
import { passportPolicyForApiAsync, passportPolicyApplyForApiAsync, passportCreateForApiAsync } from "./passportApi.js";
import { dirname, join, resolve } from "node:path";
import YAML from "yaml";
import { ensureDir, readUtf8, writeFileAtomic } from "../utils/fs.js";
import {
  passportBadgeForApi,
  passportCacheLatestForApi,
  passportCreateForApi,
  passportExportLatestForApi,
  passportPolicyApplyForApi,
  passportPolicyForApi,
  passportPublicUrlForApi,
  passportQrForApi,
  passportVerifyForApi,
  passportVerifyUrlForApi
} from "./passportApi.js";
import { inspectPassportArtifact } from "./passportArtifact.js";
import type { TrustContext } from "../trust/trustContext.js";

function parseJsonOrYaml(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return YAML.parse(raw) as unknown;
  }
}

function renderBadge(passport: ReturnType<typeof inspectPassportArtifact>["passport"]): string {
  const status = passport.status.label === "INFORMATIONAL" ? "INFO" : passport.status.label;
  const maturity = typeof passport.maturity.overall === "number" ? passport.maturity.overall.toFixed(1) : "UNKNOWN";
  const assurance = typeof passport.checkpoints.lastAssuranceCert.riskAssuranceScore === "number"
    ? String(Math.round(passport.checkpoints.lastAssuranceCert.riskAssuranceScore))
    : "UNKNOWN";
  const riskValues = [
    passport.strategyFailureRisks.ecosystemFocusRisk,
    passport.strategyFailureRisks.clarityPathRisk,
    passport.strategyFailureRisks.economicSignificanceRisk,
    passport.strategyFailureRisks.riskAssuranceRisk,
    passport.strategyFailureRisks.digitalDualityRisk
  ].filter((row): row is number => typeof row === "number");
  const riskSummary = riskValues.length > 0
    ? (() => {
        const avg = riskValues.reduce((sum, row) => sum + row, 0) / riskValues.length;
        if (avg >= 80) return "HIGH";
        if (avg >= 60) return "ELEVATED";
        return "MODERATE";
      })()
    : "UNKNOWN";
  const value = typeof passport.valueDimensions.valueScore === "number"
    ? String(Math.round(passport.valueDimensions.valueScore))
    : "UNKNOWN";
  return `AMC ${status} • maturity=${maturity}/5 • assurance=${assurance} • risks=${riskSummary} • value=${value} • ts=${new Date(passport.generatedTs).toISOString()}`;
}

function escapePdfText(input: string): string {
  return escapeSharedPdfText(input);
}

function renderPdfFromLines(lines: string[]): Buffer {
  return renderSharedPdfLines(lines, escapePdfText);
}

function loadOrCreateAgentPassport(workspace: string, agentId: string) {
  const cached = passportCacheLatestForApi({
    workspace,
    scopeType: "AGENT",
    scopeId: agentId
  }).passport;
  if (cached) {
    return cached;
  }
  return passportCreateForApi({
    workspace,
    scopeType: "AGENT",
    scopeId: agentId
  }).passport;
}

export function passportInitCli(workspace: string) {
  return passportPolicyForApi(workspace);
}

export function passportVerifyPolicyCli(workspace: string) {
  return passportPolicyForApi(workspace).signature;
}

export function passportPolicyPrintCli(workspace: string) {
  return passportPolicyForApi(workspace).policy;
}

export function passportPolicyApplyCli(params: {
  workspace: string;
  file: string;
}) {
  return passportPolicyApplyForApi({
    workspace: params.workspace,
    policy: parseJsonOrYaml(readUtf8(resolve(params.file)))
  });
}

export function passportCreateCli(params: {
  workspace: string;
  scope: "workspace" | "node" | "agent";
  id?: string;
  outFile: string;
}) {
  return passportCreateForApi({
    workspace: params.workspace,
    scopeType: params.scope.toUpperCase(),
    scopeId: params.id,
    outFile: resolve(params.workspace, params.outFile)
  });
}

export function passportVerifyCli(params: {
  workspace?: string;
  file: string;
  pubkeyPath?: string;
  trust: TrustContext;
}) {
  return passportVerifyForApi({
    workspace: params.workspace,
    file: resolve(params.file),
    publicKeyPath: params.pubkeyPath ? resolve(params.pubkeyPath) : undefined,
    trust: params.trust
  });
}

export function passportShowCli(params: {
  file: string;
  format: "json" | "badge";
}) {
  const inspected = inspectPassportArtifact(resolve(params.file));
  if (params.format === "badge") {
    return renderBadge(inspected.passport);
  }
  return inspected;
}

export function passportBadgeCli(params: {
  workspace: string;
  agentId: string;
}) {
  return passportBadgeForApi({
    workspace: params.workspace,
    agentId: params.agentId
  });
}

export function passportExportLatestCli(params: {
  workspace: string;
  scope: "workspace" | "node" | "agent";
  id?: string;
  outFile: string;
}) {
  return passportExportLatestForApi({
    workspace: params.workspace,
    scopeType: params.scope.toUpperCase(),
    scopeId: params.id,
    outFile: resolve(params.workspace, params.outFile)
  });
}

type PassportShareRequest = {
  workspace: string; agentId: string; format: "url" | "qr" | "json" | "pdf"; baseUrl?: string; outFile?: string;
};
export function passportShareCli(params: PassportShareRequest) {
  return presentPassportShare(params, loadOrCreateAgentPassport(params.workspace, params.agentId));
}

function presentPassportShare(params: PassportShareRequest, passport: ReturnType<typeof inspectPassportArtifact>["passport"],
  pending?: { state: SharePdfState; assertCurrent(): void }) {
  const publicUrl = passportPublicUrlForApi({
    passportId: passport.passportId,
    baseUrl: params.baseUrl
  });
  const verificationUrl = passportVerifyUrlForApi({
    passportId: passport.passportId,
    baseUrl: params.baseUrl
  });
  const qr = passportQrForApi({
    passportId: passport.passportId,
    baseUrl: params.baseUrl
  });

  if (params.format === "url") {
    return {
      format: "url" as const,
      agentId: params.agentId,
      passportId: passport.passportId,
      publicUrl,
      verificationUrl,
      qrCodeUrl: null,
      passport: null,
      file: null
    };
  }

  if (params.format === "qr") {
    return {
      format: "qr" as const,
      agentId: params.agentId,
      passportId: passport.passportId,
      verificationUrl,
      publicUrl,
      qrCodeUrl: qr.qrCodeUrl,
      passport: null,
      file: null
    };
  }

  if (params.format === "json") {
    return {
      format: "json" as const,
      agentId: params.agentId,
      passportId: passport.passportId,
      publicUrl,
      verificationUrl,
      qrCodeUrl: qr.qrCodeUrl,
      passport,
      file: null
    };
  }

  const outFile = resolve(
    params.workspace,
    params.outFile ?? join(".amc", "passport", "share", params.agentId, `${passport.passportId}.pdf`)
  );
  if (pending) { if (outFile !== pending.state.file) throw new Error("passport share PDF destination changed");
    pending.assertCurrent(); assertSharePdfCurrent(pending.state); pending.state.directoryAttempted = true; }
  ensureDir(dirname(outFile));
  if (pending) pending.state.directoryReturned = true;
  const lines = [
    "AMC Passport Share Certificate",
    `Generated: ${new Date().toISOString()}`,
    `Agent: ${params.agentId}`,
    `Passport ID: ${passport.passportId}`,
    `Status: ${passport.status.label}`,
    `Maturity Overall: ${passport.maturity.overall ?? "UNKNOWN"}`,
    `Strategic Ops: ${passport.maturity.byFiveLayers.strategicOps ?? "UNKNOWN"}`,
    `Leadership: ${passport.maturity.byFiveLayers.leadership ?? "UNKNOWN"}`,
    `Culture: ${passport.maturity.byFiveLayers.culture ?? "UNKNOWN"}`,
    `Resilience: ${passport.maturity.byFiveLayers.resilience ?? "UNKNOWN"}`,
    `Skills: ${passport.maturity.byFiveLayers.skills ?? "UNKNOWN"}`,
    `Public URL: ${publicUrl}`,
    `Verify URL: ${verificationUrl}`,
    `QR URL: ${qr.qrCodeUrl}`
  ];
  const bytes = renderPdfFromLines(lines);
  if (pending) { pending.assertCurrent(); assertSharePdfCurrent(pending.state); pending.state.writeAttempted = true; }
  writeFileAtomic(outFile, bytes, 0o644);
  if (pending) { pending.state.writeReturned = true; const own = captureOrgFiles([outFile]), member = own.members[0]!;
    if (member.mode !== 0o644 || member.bytes === null || !member.bytes.equals(bytes)) throw new Error("passport share PDF differs from exact returned-write bytes or mode");
    pending.state.expected = own; pending.assertCurrent(); assertSharePdfCurrent(pending.state); }
  return {
    format: "pdf" as const,
    agentId: params.agentId,
    passportId: passport.passportId,
    publicUrl,
    verificationUrl,
    qrCodeUrl: qr.qrCodeUrl,
    passport: null,
    file: outFile
  };
}

export function passportCompareCli(params: {
  workspace: string;
  agentA: string;
  agentB: string;
}) {
  const first = loadOrCreateAgentPassport(params.workspace, params.agentA);
  const second = loadOrCreateAgentPassport(params.workspace, params.agentB);
  const rows = [
    { dimension: "overall", a: first.maturity.overall, b: second.maturity.overall },
    { dimension: "strategicOps", a: first.maturity.byFiveLayers.strategicOps, b: second.maturity.byFiveLayers.strategicOps },
    { dimension: "leadership", a: first.maturity.byFiveLayers.leadership, b: second.maturity.byFiveLayers.leadership },
    { dimension: "culture", a: first.maturity.byFiveLayers.culture, b: second.maturity.byFiveLayers.culture },
    { dimension: "resilience", a: first.maturity.byFiveLayers.resilience, b: second.maturity.byFiveLayers.resilience },
    { dimension: "skills", a: first.maturity.byFiveLayers.skills, b: second.maturity.byFiveLayers.skills }
  ];
  const dimensions = rows.map((row) => ({
    dimension: row.dimension,
    [params.agentA]: row.a,
    [params.agentB]: row.b,
    delta: typeof row.a === "number" && typeof row.b === "number" ? Number((row.a - row.b).toFixed(4)) : null
  }));
  return {
    comparedTs: Date.now(),
    agents: {
      [params.agentA]: {
        passportId: first.passportId,
        status: first.status.label
      },
      [params.agentB]: {
        passportId: second.passportId,
        status: second.status.label
      }
    },
    dimensions
  };
}

/** Fixed registered owner gate for these maintained leaves; it adds no mode key or caller-selected policy. */
function assertPassportCliOwner(workspace: string, command: "passport init" | "passport policy apply" | "passport create"): void {
  try { assertOwnerMode(workspace, "control results sign"); }
  catch (cause) {
    if (cause instanceof Error && cause.message === "Command 'control results sign' is blocked in agent mode. Switch to owner mode with: amc mode owner")
      throw new Error(`Command '${command}' is blocked in agent mode. Switch to owner mode with: amc mode owner`, { cause });
    throw cause;
  }
}
export async function passportInitCliAsync(workspace: string) {
  const beforePublish = () => assertPassportCliOwner(workspace, "passport init"); beforePublish();
  return passportPolicyForApiAsync(workspace, { beforePublish });
}
export async function passportPolicyApplyCliAsync(params: Parameters<typeof passportPolicyApplyCli>[0]) {
  assertPassportCliOwner(params.workspace, "passport policy apply");
  const input = { ...params }, file = resolve(input.file), before = captureOrgFiles([file]), bytes = orgPairBytes(before, file);
  if (bytes === null) throw new Error("passport policy input file is missing");
  const policy = parseJsonOrYaml(bytes.toString("utf8")), sameTarget = file === resolve(passportPolicyPath(input.workspace));
  const beforePublish = () => { assertPassportCliOwner(input.workspace, "passport policy apply"); if (!sameTarget) assertOrgPairsCurrent(before); };
  beforePublish(); assertOrgPairsCurrent(before);
  return passportPolicyApplyForApiAsync({ workspace: input.workspace, policy }, { beforePublish, assertInputsCurrent() { assertOrgPairsCurrent(before); } });
}
export async function passportCreateCliAsync(params: Parameters<typeof passportCreateCli>[0]) {
  const input = { ...params }, beforePublish = () => assertPassportCliOwner(input.workspace, "passport create"); beforePublish();
  return passportCreateForApiAsync({ workspace: input.workspace, scopeType: input.scope.toUpperCase(), scopeId: input.id, outFile: resolve(input.workspace, input.outFile) }, { beforePublish });
}

interface SharePdfState {
  file: string; aliases(): void; expected: ReturnType<typeof captureOrgFiles>;
  directoryAttempted: boolean; directoryReturned: boolean; writeAttempted: boolean; writeReturned: boolean;
}
function captureSharePdfState(file: string, aliases: () => void): SharePdfState {
  aliases(); return { file, aliases, expected: captureOrgFiles([file]), directoryAttempted: false, directoryReturned: false, writeAttempted: false, writeReturned: false };
}
function assertSharePdfCurrent(state: SharePdfState) { state.aliases(); assertOrgPairsCurrent(state.expected); }
export async function passportBadgeCliAsync(params: Parameters<typeof passportBadgeCli>[0]) {
  return passportBadgeAttemptForApiAsync({ ...params });
}
/** Fixed maintained share attempt; compare and direct export retain their synchronous recipes. */
export async function passportShareCliAsync(params: Parameters<typeof passportShareCli>[0], options: PassportPublicationOptions = {}) {
  const input = { ...params }, pending = capturePassportShareRead(input, { ...options });
  const pdf = pending.pdfPath === null ? null : captureSharePdfState(pending.pdfPath, pending.pdfAliases!);
  let actual: Awaited<ReturnType<typeof pending.read>> | null = null;
  const failed = (cause: unknown) => {
    const nested = cause instanceof PassportPublicationError ? cause : null;
    const failure = passportPublicationFailure(input.workspace, "share-presentation", [...(actual?.publishedPaths ?? []), ...(pdf?.writeReturned ? [pdf.file] : [])], actual?.createdDirectories ?? [],
      pdf?.writeAttempted ? pdf.file : null, cause, actual?.createdHash ?? nested?.createdHash ?? null, actual?.exportedHash ?? nested?.exportedHash ?? null,
      actual === null || (actual?.sharedProgressUnknown ?? false) || (pdf?.directoryAttempted ?? false) || (nested?.sharedProgressUnknown ?? false));
    return Object.assign(failure, { policyAttempted: actual?.policyAttempted ?? false, policyReturned: actual?.policyReturned ?? false, pdfDirectoryAttempted: pdf?.directoryAttempted ?? false, pdfDirectoryReturned: pdf?.directoryReturned ?? false,
      pdfWriteAttempted: pdf?.writeAttempted ?? false, pdfWriteReturned: pdf?.writeReturned ?? false });
  };
  try {
    actual = await pending.read(); actual.assertCurrent();
    const result = presentPassportShare(input, actual.passport, pdf === null ? undefined : { state: pdf, assertCurrent: actual.assertCurrent });
    const current = () => { actual!.assertCurrent(); if (pdf !== null) assertSharePdfCurrent(pdf); }; current();
    return Object.freeze({ result, assertCurrent() { try { current(); } catch (cause) { throw failed(cause); } } });
  } catch (cause) { throw failed(cause); }
}
