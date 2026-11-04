import { join, relative } from "node:path";
import YAML from "yaml";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { signSerializedPayloadWithAuditor } from "../org/orgSigner.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { captureOrgFiles, captureOrgPairs, assertOrgPairsCurrent, OrgPairsPublicationError, orgPairBytes, prepareOrgPairsAsync, type OrgPairsOptions, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { canonSchema, type CompassCanon } from "./canonSchema.js";
import { builtInCanon } from "./canonBuiltin.js";
import { loadInstalledPluginAssets } from "../plugins/pluginLoader.js";

function canonDir(workspace: string): string {
  return join(workspace, ".amc", "canon");
}

export function canonPath(workspace: string): string {
  return join(canonDir(workspace), "canon.yaml");
}

export function canonSigPath(workspace: string): string {
  return `${canonPath(workspace)}.sig`;
}

function parsePluginCanonExtensions(workspace: string): {
  agentTypes: Array<{ id: string; label: string }>;
  domains: Array<{ id: string; label: string }>;
} {
  const loaded = loadInstalledPluginAssets(workspace);
  if (!loaded.ok) {
    return {
      agentTypes: [],
      domains: []
    };
  }
  const agentTypes: Array<{ id: string; label: string }> = [];
  const domains: Array<{ id: string; label: string }> = [];
  for (const [id, markdown] of loaded.assets.learnDocs.entries()) {
    const firstLine = markdown
      .split(/\r?\n/)
      .map((line) => line.replace(/^#+\s*/, "").trim())
      .find((line) => line.length > 0);
    const label = firstLine ?? id;
    if (id.startsWith("canon-agenttype-")) {
      const canonId = id.replace(/^canon-agenttype-/, "").toLowerCase();
      if (/^[a-z0-9][a-z0-9-]{1,62}$/.test(canonId)) {
        agentTypes.push({ id: canonId, label });
      }
    }
    if (id.startsWith("canon-domain-")) {
      const canonId = id.replace(/^canon-domain-/, "").toLowerCase();
      if (/^[a-z0-9][a-z0-9-]{1,62}$/.test(canonId)) {
        domains.push({ id: canonId, label });
      }
    }
  }
  agentTypes.sort((a, b) => a.id.localeCompare(b.id));
  domains.sort((a, b) => a.id.localeCompare(b.id));
  return {
    agentTypes,
    domains
  };
}

function withPluginExtensions(base: CompassCanon, workspace: string): CompassCanon {
  const ext = parsePluginCanonExtensions(workspace);
  const byIdAgent = new Map(base.compassCanon.agentTypeVocabulary.map((row) => [row.id, row] as const));
  const byIdDomain = new Map(base.compassCanon.domainPacks.map((row) => [row.id, row] as const));
  for (const row of ext.agentTypes) {
    if (!byIdAgent.has(row.id)) {
      byIdAgent.set(row.id, {
        id: row.id,
        label: row.label,
        source: "plugin"
      });
    }
  }
  for (const row of ext.domains) {
    if (!byIdDomain.has(row.id)) {
      byIdDomain.set(row.id, {
        id: row.id,
        label: row.label,
        source: "plugin"
      });
    }
  }
  return canonSchema.parse({
    compassCanon: {
      ...base.compassCanon,
      agentTypeVocabulary: Array.from(byIdAgent.values()).sort((a, b) => a.id.localeCompare(b.id)),
      domainPacks: Array.from(byIdDomain.values()).sort((a, b) => a.id.localeCompare(b.id))
    }
  });
}

export function saveCanon(workspace: string, canon: CompassCanon): {
  path: string;
  sigPath: string;
} {
  ensureDir(canonDir(workspace));
  const path = canonPath(workspace);
  const parsed = canonSchema.parse(canon);
  const bytes = Buffer.from(YAML.stringify(parsed)), previous = captureOrgPairs([path]), sigPath = `${path}.sig`;
  const signature = JSON.stringify(signSerializedPayloadWithAuditor(workspace, bytes.toString("utf8")), null, 2);
  return withControlFileLock({ root: join(workspace, ".amc"), name: "org-auditor-pairs", operation() {
    assertOrgPairsCurrent(previous); const published: string[] = []; let attempted = relative(workspace, path);
    try { writeFileAtomic(path, bytes, 0o644); published.push(attempted); attempted = relative(workspace, sigPath); writeFileAtomic(sigPath, signature, 0o644); }
    catch (cause) { throw new OrgPairsPublicationError(Object.freeze(published), attempted, cause); }
    return { path, sigPath };
  } });
}

export function initCanon(workspace: string): {
  path: string;
  sigPath: string;
  canon: CompassCanon;
} {
  const canon = builtInCanon();
  const saved = saveCanon(workspace, canon);
  return {
    ...saved,
    canon
  };
}

export function loadCanon(workspace: string, opts?: { includePluginExtensions?: boolean }): CompassCanon {
  const path = canonPath(workspace);
  if (!pathExists(path)) {
    return opts?.includePluginExtensions === false ? builtInCanon() : withPluginExtensions(builtInCanon(), workspace);
  }
  const parsed = canonSchema.parse(YAML.parse(readUtf8(path)) as unknown);
  return opts?.includePluginExtensions === false ? parsed : withPluginExtensions(parsed, workspace);
}
/** Same-read body and signature view for the actual API getter; plugin vocabulary retains its existing merge. */
export function readCanonForApi(workspace: string) {
  const path = canonPath(workspace), sigPath = `${path}.sig`, body = orgPairBytes(captureOrgFiles([path]), path);
  const parsed = body === null ? builtInCanon() : canonSchema.parse(YAML.parse(body.toString("utf8")) as unknown);
  let verdict: { valid: boolean; reason: string | null } = { valid: false, reason: "file missing" }, signatureExists = false;
  if (body !== null) {
    signatureExists = pathExists(sigPath);
    try { const sidecar = orgPairBytes(captureOrgFiles([sigPath]), sigPath); signatureExists = sidecar !== null;
      verdict = sidecar === null ? { valid: false, reason: "signature missing" } : verifyAuditorSignatureBytes(workspace, "BUNDLE", body, sidecar); }
    catch (error) { verdict = { valid: false, reason: String(error) }; }
  }
  return { canon: withPluginExtensions(parsed, workspace), signature: { ...verdict, signatureExists, path, sigPath } };
}

/** Internal actual pair plan; callers can retain the published-state gate for a later audit. */
export function prepareCanonAsync(workspace: string, canon: CompassCanon, options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  const path = canonPath(workspace), parsed = canonSchema.parse(canon), bytes = Buffer.from(YAML.stringify(parsed));
  return prepareOrgPairsAsync(workspace, [{ path, bytes }], options, previous ?? captureOrgPairs([path]));
}
export async function saveCanonAsync(workspace: string, canon: CompassCanon, options: OrgPairsOptions = {}) {
  return (await prepareCanonAsync(workspace, canon, options)).publish()[0]!;
}
export async function initCanonAsync(workspace: string, options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  const canon = builtInCanon(), prepared = await prepareCanonAsync(workspace, canon, options, previous);
  return { ...prepared.publish()[0]!, canon };
}

export function verifyCanonSignature(workspace: string) {
  const path = canonPath(workspace), sigPath = `${path}.sig`;
  try {
    const previous = captureOrgPairs([path]), body = orgPairBytes(previous, path), signature = orgPairBytes(previous, sigPath);
    if (body === null) return { valid: false, signatureExists: false, reason: "file missing", path, sigPath };
    if (signature === null) return { valid: false, signatureExists: false, reason: "signature missing", path, sigPath };
    return { ...verifyAuditorSignatureBytes(workspace, "BUNDLE", body, signature), signatureExists: true, path, sigPath };
  } catch (error) { return { valid: false, signatureExists: pathExists(sigPath), reason: String(error), path, sigPath }; }
}
