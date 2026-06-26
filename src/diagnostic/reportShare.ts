import { pathToFileURL } from "node:url";
import { join } from "node:path";
import type { DiagnosticReport } from "../types.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";

export interface DiagnosticReportShareManifest {
  schemaVersion: 1;
  kind: "amc.diagnostic.report.share";
  runId: string;
  requestedRunId: string;
  resolvedBy: "exact" | "latest" | "alias" | "prefix";
  alias: string | null;
  agentId: string;
  status: DiagnosticReport["status"];
  trustLabel: DiagnosticReport["trustLabel"];
  generatedTs: number;
  reportJsonSha256: string;
  htmlSha256: string;
  claimBoundary: string;
  localUrl: string;
  publicUrl: string | null;
  files: {
    html: "index.html";
    manifest: "share-manifest.json";
  };
}

export interface WriteDiagnosticReportShareBundleInput {
  outputRoot: string;
  report: DiagnosticReport;
  html: string;
  requestedRunId: string;
  resolvedBy: DiagnosticReportShareManifest["resolvedBy"];
  alias?: string;
  preferredSlug?: string;
  claimBoundary: string;
  publicBaseUrl?: string;
  now?: number;
}

export interface DiagnosticReportShareBundle {
  slug: string;
  dir: string;
  htmlPath: string;
  manifestPath: string;
  shareUrl: string;
  manifest: DiagnosticReportShareManifest;
}

export function sanitizeReportShareSlug(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  if (!slug) {
    throw new Error("report share slug is required.");
  }
  return slug;
}

export function normalizePublicReportBaseUrl(input?: string): string | null {
  const value = input?.trim();
  if (!value) {
    return null;
  }
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("public report base URL must use http or https.");
  }
  return value.replace(/\/+$/g, "");
}

export function publicReportUrl(baseUrl: string, slug: string): string {
  const normalized = normalizePublicReportBaseUrl(baseUrl);
  if (!normalized) {
    throw new Error("public report base URL is required.");
  }
  return `${normalized}/${encodeURIComponent(slug)}/index.html`;
}

export function writeDiagnosticReportShareBundle(input: WriteDiagnosticReportShareBundleInput): DiagnosticReportShareBundle {
  const slug = sanitizeReportShareSlug(input.preferredSlug ?? input.alias ?? input.report.runId);
  const dir = join(input.outputRoot, slug);
  const htmlPath = join(dir, "index.html");
  const manifestPath = join(dir, "share-manifest.json");
  const localUrl = pathToFileURL(htmlPath).href;
  const publicBaseUrl = normalizePublicReportBaseUrl(input.publicBaseUrl);
  const publicUrl = publicBaseUrl ? publicReportUrl(publicBaseUrl, slug) : null;
  const htmlSha256 = sha256Hex(input.html);
  const manifest: DiagnosticReportShareManifest = {
    schemaVersion: 1,
    kind: "amc.diagnostic.report.share",
    runId: input.report.runId,
    requestedRunId: input.requestedRunId,
    resolvedBy: input.resolvedBy,
    alias: input.alias ?? null,
    agentId: input.report.agentId ?? "default",
    status: input.report.status,
    trustLabel: input.report.trustLabel,
    generatedTs: input.now ?? Date.now(),
    reportJsonSha256: input.report.reportJsonSha256,
    htmlSha256,
    claimBoundary: input.claimBoundary,
    localUrl,
    publicUrl,
    files: {
      html: "index.html",
      manifest: "share-manifest.json"
    }
  };

  ensureDir(dir);
  writeFileAtomic(htmlPath, input.html, 0o644);
  writeFileAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 0o644);
  return {
    slug,
    dir,
    htmlPath,
    manifestPath,
    shareUrl: publicUrl ?? localUrl,
    manifest
  };
}
