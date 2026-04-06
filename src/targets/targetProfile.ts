import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import inquirer from "inquirer";
import { z } from "zod";
import type { DiagnosticReport, TargetProfile } from "../types.js";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { questionBank } from "../diagnostic/questionBank.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { getAgentPaths } from "../fleet/paths.js";

const targetProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdTs: z.number(),
  contextGraphHash: z.string(),
  mapping: z.record(z.string(), z.number().int().min(0).max(5)),
  signature: z.string()
});

function targetDir(workspace: string, agentId?: string): string {
  return getAgentPaths(workspace, agentId).targetsDir;
}

function targetPath(workspace: string, name: string, agentId?: string): string {
  return join(targetDir(workspace, agentId), `${name}.target.json`);
}

function signTargetPayload(workspace: string, payload: Omit<TargetProfile, "signature">): string {
  const digest = sha256Hex(canonicalize(payload));
  const privateKey = getPrivateKeyPem(workspace, "auditor");
  return signHexDigest(digest, privateKey);
}

export function defaultTargetMapping(level = 3): Record<string, number> {
  const out: Record<string, number> = {};
  for (const question of questionBank) {
    out[question.id] = level;
  }
  return out;
}

export function createSignedTargetProfile(params: {
  workspace: string;
  name: string;
  contextGraphHash: string;
  mapping: Record<string, number>;
}): TargetProfile {
  const payload = {
    id: randomUUID(),
    name: params.name,
    createdTs: Date.now(),
    contextGraphHash: params.contextGraphHash,
    mapping: params.mapping
  };

  const signature = signTargetPayload(params.workspace, payload);
  return {
    ...payload,
    signature
  };
}

export function saveTargetProfile(workspace: string, profile: TargetProfile, agentId?: string): string {
  ensureDir(targetDir(workspace, agentId));
  const file = targetPath(workspace, profile.name, agentId);
  writeFileAtomic(file, JSON.stringify(profile, null, 2), 0o644);
  return file;
}

export function loadTargetProfile(workspace: string, name: string, agentId?: string): TargetProfile {
  const primary = targetPath(workspace, name, agentId);
  const legacyRoot = join(workspace, ".amc", "targets", `${name}.target.json`);
  const file = pathExists(primary) ? primary : pathExists(legacyRoot) ? legacyRoot : primary;
  if (!pathExists(file)) {
    throw new Error(`Target profile not found: ${file}`);
  }
  const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
  return targetProfileSchema.parse(raw);
}

export function loadTargetProfileFromFile(file: string): TargetProfile {
  const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
  return targetProfileSchema.parse(raw);
}

export function verifyTargetProfileSignature(workspace: string, profile: TargetProfile): boolean {
  const payload = {
    id: profile.id,
    name: profile.name,
    createdTs: profile.createdTs,
    contextGraphHash: profile.contextGraphHash,
    mapping: profile.mapping
  };
  const digest = sha256Hex(canonicalize(payload));
  const auditorPubs = getPublicKeyHistory(workspace, "auditor");
  return verifyHexDigestAny(digest, profile.signature, auditorPubs);
}

export async function setTargetProfileInteractive(params: {
  workspace: string;
  name: string;
  contextGraphHash: string;
  agentId?: string;
}): Promise<TargetProfile> {
  const mapping: Record<string, number> = {};

  for (const question of questionBank) {
    const response = await inquirer.prompt<{ level: number }>([
      {
        type: "list",
        name: "level",
        message: `${question.id} ${question.title}`,
        choices: [0, 1, 2, 3, 4, 5],
        default: 3
      }
    ]);
    mapping[question.id] = response.level;
  }

  const profile = createSignedTargetProfile({
    workspace: params.workspace,
    name: params.name,
    contextGraphHash: params.contextGraphHash,
    mapping
  });

  saveTargetProfile(params.workspace, profile, params.agentId);
  return profile;
}

export function diffRunToTarget(report: DiagnosticReport, profile: TargetProfile): Array<{
  questionId: string;
  current: number;
  target: number;
  gap: number;
}> {
  return questionBank.map((question) => {
    const row = report.questionScores.find((item) => item.questionId === question.id);
    const current = row?.finalLevel ?? 0;
    const target = profile.mapping[question.id] ?? 0;
    return {
      questionId: question.id,
      current,
      target,
      gap: target - current
    };
  });
}
