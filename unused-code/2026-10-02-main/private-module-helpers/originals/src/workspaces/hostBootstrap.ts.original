import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runBootstrap } from "../bootstrap/bootstrap.js";
import { createHostUser, createWorkspaceRecord, grantMembership, initHostDb } from "./hostDb.js";
import { DEFAULT_WORKSPACE_ID, normalizeWorkspaceId } from "./workspaceId.js";
import { hostWorkspaceDir } from "./workspacePaths.js";

function readSecretFile(path: string | undefined): string {
  if (!path || path.trim().length === 0) {
    throw new Error("missing required secret file path");
  }
  return readFileSync(resolve(path.trim()), "utf8").trim();
}

export async function bootstrapHost(params: {
  hostDir: string;
  workspaceId?: string;
  workspaceName?: string;
  adminUsername: string;
  adminPassword: string;
  vaultPassphrase: string;
  lanMode: boolean;
  bind: string;
  studioPort: number;
  allowedCidrs: string[];
  enableNotary: boolean;
  notaryBaseUrl: string;
  notaryRequiredAttestation: "SOFTWARE" | "HARDWARE";
  notaryAuthSecret: string | null;
}): Promise<{ workspaceId: string; workspaceDir: string; reportPath: string }> {
  initHostDb(params.hostDir);
  const workspaceId = normalizeWorkspaceId(params.workspaceId ?? DEFAULT_WORKSPACE_ID);
  const workspaceDir = hostWorkspaceDir(params.hostDir, workspaceId);
  createHostUser({
    hostDir: params.hostDir,
    username: params.adminUsername,
    password: params.adminPassword,
    isHostAdmin: true
  });
  createWorkspaceRecord({
    hostDir: params.hostDir,
    workspaceId,
    name: params.workspaceName ?? "Default Workspace"
  });
  grantMembership({
    hostDir: params.hostDir,
    username: params.adminUsername,
    workspaceId,
    role: "OWNER"
  });
  grantMembership({
    hostDir: params.hostDir,
    username: params.adminUsername,
    workspaceId,
    role: "AUDITOR"
  });
  const boot = await runBootstrap({
    workspace: workspaceDir,
    vaultPassphrase: params.vaultPassphrase,
    ownerUsername: params.adminUsername,
    ownerPassword: params.adminPassword,
    lanMode: params.lanMode,
    bind: params.bind,
    studioPort: params.studioPort,
    allowedCidrs: params.allowedCidrs,
    enableNotary: params.enableNotary,
    notaryBaseUrl: params.notaryBaseUrl,
    notaryRequiredAttestation: params.notaryRequiredAttestation,
    notaryAuthSecret: params.notaryAuthSecret
  });
  return {
    workspaceId,
    workspaceDir,
    reportPath: boot.reportPath
  };
}

export function bootstrapHostFromEnv(params: {
  hostDir: string;
  workspaceId?: string;
  workspaceName?: string;
  adminUsernameFile?: string;
  adminPasswordFile?: string;
  vaultPassphraseFile?: string;
  lanMode: boolean;
  bind: string;
  studioPort: number;
  allowedCidrs: string[];
  enableNotary: boolean;
  notaryBaseUrl: string;
  notaryRequiredAttestation: "SOFTWARE" | "HARDWARE";
  notaryAuthSecretFile?: string;
}): Promise<{ workspaceId: string; workspaceDir: string; reportPath: string }> {
  const adminUsername = readSecretFile(params.adminUsernameFile);
  const adminPassword = readSecretFile(params.adminPasswordFile);
  const vaultPassphrase = readSecretFile(params.vaultPassphraseFile);
  const notaryAuthSecret = params.notaryAuthSecretFile ? readSecretFile(params.notaryAuthSecretFile) : null;
  return bootstrapHost({
    hostDir: params.hostDir,
    workspaceId: params.workspaceId,
    workspaceName: params.workspaceName,
    adminUsername,
    adminPassword,
    vaultPassphrase,
    lanMode: params.lanMode,
    bind: params.bind,
    studioPort: params.studioPort,
    allowedCidrs: params.allowedCidrs,
    enableNotary: params.enableNotary,
    notaryBaseUrl: params.notaryBaseUrl,
    notaryRequiredAttestation: params.notaryRequiredAttestation,
    notaryAuthSecret
  });
}

