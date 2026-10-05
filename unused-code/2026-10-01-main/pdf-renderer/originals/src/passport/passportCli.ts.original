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
  return input.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function renderPdfFromLines(lines: string[]): Buffer {
  const sliced = lines.map((line) => line.trimEnd()).slice(0, 110);
  const content = ["BT", "/F1 10 Tf", "40 810 Td"];
  let first = true;
  for (const line of sliced) {
    if (!first) {
      content.push("0 -13 Td");
    }
    first = false;
    content.push(`(${escapePdfText((line.length > 110 ? `${line.slice(0, 107)}...` : line) || " ")}) Tj`);
  }
  content.push("ET");

  const stream = content.join("\n");
  const objects: string[] = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += object;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
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
}) {
  return passportVerifyForApi({
    workspace: params.workspace,
    file: resolve(params.file),
    publicKeyPath: params.pubkeyPath ? resolve(params.pubkeyPath) : undefined
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

export function passportShareCli(params: {
  workspace: string;
  agentId: string;
  format: "url" | "qr" | "json" | "pdf";
  baseUrl?: string;
  outFile?: string;
}) {
  const passport = loadOrCreateAgentPassport(params.workspace, params.agentId);
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
  ensureDir(dirname(outFile));
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
  writeFileAtomic(outFile, renderPdfFromLines(lines), 0o644);
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
