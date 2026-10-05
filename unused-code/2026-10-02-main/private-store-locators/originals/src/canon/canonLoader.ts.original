import { join } from "node:path";
import YAML from "yaml";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { canonSchema, type CompassCanon } from "./canonSchema.js";
import { builtInCanon } from "./canonBuiltin.js";
import { loadInstalledPluginAssets } from "../plugins/pluginLoader.js";

export function canonDir(workspace: string): string {
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
  writeFileAtomic(path, YAML.stringify(parsed), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return {
    path,
    sigPath
  };
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

export function verifyCanonSignature(workspace: string) {
  return verifySignedFileWithAuditor(workspace, canonPath(workspace));
}
