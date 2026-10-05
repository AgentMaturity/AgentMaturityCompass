import { randomUUID } from "node:crypto";
import { join } from "node:path";
import YAML from "yaml";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import {
  signFileWithAuditor,
  verifySignedFileWithAuditor,
  type SignedFileVerification
} from "../org/orgSigner.js";
import {
  noCodeAdapterTypeSchema,
  noCodeGovernanceConfigSchema,
  defaultNoCodeGovernanceConfig,
  type NoCodeAdapterRecord,
  type NoCodeAdapterType,
  type NoCodeGovernanceConfig
} from "./noCodeGovernanceSchema.js";

export function noCodeGovernanceConfigPath(workspace: string): string {
  return join(workspace, ".amc", "no-code-governance.yaml");
}

export function noCodeGovernanceConfigSigPath(workspace: string): string {
  return `${noCodeGovernanceConfigPath(workspace)}.sig`;
}

function normalizeWebhookUrl(raw: string): string {
  const parsed = new URL(raw);
  parsed.hash = "";
  if (parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  }
  return parsed.toString();
}

function defaultAdapterId(type: NoCodeAdapterType): string {
  return `${type}-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function loadNoCodeGovernanceConfig(workspace: string): NoCodeGovernanceConfig {
  const path = noCodeGovernanceConfigPath(workspace);
  if (!pathExists(path)) {
    return defaultNoCodeGovernanceConfig();
  }
  const parsed = YAML.parse(readUtf8(path));
  return noCodeGovernanceConfigSchema.parse(parsed);
}

export function saveNoCodeGovernanceConfig(workspace: string, config: NoCodeGovernanceConfig): string {
  const path = noCodeGovernanceConfigPath(workspace);
  ensureDir(join(workspace, ".amc"));
  writeFileAtomic(path, YAML.stringify(noCodeGovernanceConfigSchema.parse(config)), 0o644);
  return path;
}

export function signNoCodeGovernanceConfig(workspace: string): string {
  return signFileWithAuditor(workspace, noCodeGovernanceConfigPath(workspace));
}

export function verifyNoCodeGovernanceConfigSignature(workspace: string): SignedFileVerification {
  return verifySignedFileWithAuditor(workspace, noCodeGovernanceConfigPath(workspace));
}

export function initNoCodeGovernanceConfig(workspace: string): {
  path: string;
  sigPath: string;
} {
  const path = saveNoCodeGovernanceConfig(workspace, defaultNoCodeGovernanceConfig());
  const sigPath = signNoCodeGovernanceConfig(workspace);
  return {
    path,
    sigPath
  };
}

export function addNoCodeAdapter(params: {
  workspace: string;
  type: NoCodeAdapterType;
  webhookUrl: string;
}): {
  configPath: string;
  sigPath: string;
  adapter: NoCodeAdapterRecord;
  created: boolean;
} {
  const type = noCodeAdapterTypeSchema.parse(params.type);
  const webhookUrl = normalizeWebhookUrl(params.webhookUrl);
  const config = loadNoCodeGovernanceConfig(params.workspace);

  const existing = config.noCodeAdapters.adapters.find(
    (row) => row.type === type && row.webhookUrl === webhookUrl
  );

  let adapter: NoCodeAdapterRecord;
  let created = false;

  if (existing) {
    existing.enabled = true;
    adapter = existing;
  } else {
    adapter = {
      id: defaultAdapterId(type),
      type,
      webhookUrl,
      enabled: true,
      addedTs: Date.now()
    };
    config.noCodeAdapters.adapters.push(adapter);
    created = true;
  }

  config.noCodeAdapters.adapters.sort((a, b) => a.id.localeCompare(b.id));
  const configPath = saveNoCodeGovernanceConfig(params.workspace, config);
  const sigPath = signNoCodeGovernanceConfig(params.workspace);

  return {
    configPath,
    sigPath,
    adapter,
    created
  };
}
