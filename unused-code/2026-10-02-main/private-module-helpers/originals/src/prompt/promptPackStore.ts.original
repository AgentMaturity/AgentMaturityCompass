import { copyFileSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { promptLintSchema, type PromptLintReport } from "./promptPackSchema.js";
import {
  ensurePromptDirs,
  promptLatestLintPath,
  promptLatestPackPath,
  promptLatestPackShaPath,
  promptPacksRoot,
  promptSnapshotsDir
} from "./promptPolicyStore.js";

export function ensurePromptAgentDirs(workspace: string, agentId: string): void {
  ensurePromptDirs(workspace);
  ensureDir(dirname(promptLatestPackPath(workspace, agentId)));
  ensureDir(promptSnapshotsDir(workspace, agentId));
  ensureDir(dirname(promptLatestLintPath(workspace, agentId)));
}

export function savePromptLintReport(params: {
  workspace: string;
  agentId: string;
  lint: PromptLintReport;
}): {
  path: string;
  sigPath: string;
} {
  ensurePromptAgentDirs(params.workspace, params.agentId);
  const path = promptLatestLintPath(params.workspace, params.agentId);
  writeFileAtomic(path, JSON.stringify(promptLintSchema.parse(params.lint), null, 2), 0o644);
  const sigPath = signFileWithAuditor(params.workspace, path);
  return { path, sigPath };
}

export function loadPromptLintReport(workspace: string, agentId: string): PromptLintReport | null {
  const path = promptLatestLintPath(workspace, agentId);
  if (!pathExists(path)) {
    return null;
  }
  return promptLintSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function verifyPromptLintSignature(workspace: string, agentId: string) {
  const path = promptLatestLintPath(workspace, agentId);
  if (!pathExists(path)) {
    return {
      valid: true,
      signatureExists: false,
      reason: null,
      path,
      sigPath: `${path}.sig`
    };
  }
  return verifySignedFileWithAuditor(workspace, path);
}

export function savePromptPackArtifact(params: {
  workspace: string;
  agentId: string;
  artifactPath: string;
  generatedTs: number;
}): {
  latestPath: string;
  latestShaPath: string;
  snapshotPath: string;
  snapshotShaPath: string;
  sha256: string;
} {
  ensurePromptAgentDirs(params.workspace, params.agentId);
  const latestPath = promptLatestPackPath(params.workspace, params.agentId);
  const latestShaPath = promptLatestPackShaPath(params.workspace, params.agentId);
  const snapshotPath = join(promptSnapshotsDir(params.workspace, params.agentId), `${params.generatedTs}.amcprompt`);
  const snapshotShaPath = `${snapshotPath}.sha256`;
  copyFileSync(resolve(params.artifactPath), latestPath);
  copyFileSync(resolve(params.artifactPath), snapshotPath);
  const digest = sha256Hex(readFileSync(latestPath));
  writeFileAtomic(latestShaPath, `${digest}\n`, 0o644);
  writeFileAtomic(snapshotShaPath, `${digest}\n`, 0o644);
  return {
    latestPath,
    latestShaPath,
    snapshotPath,
    snapshotShaPath,
    sha256: digest
  };
}

export function listPromptSnapshots(workspace: string, agentId: string): string[] {
  const dir = promptSnapshotsDir(workspace, agentId);
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".amcprompt"))
    .map((name) => join(dir, name))
    .sort((a, b) => a.localeCompare(b));
}

export function listPromptAgentsWithPacks(workspace: string): string[] {
  const root = promptPacksRoot(workspace);
  if (!pathExists(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}
