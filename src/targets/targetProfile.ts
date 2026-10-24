import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import inquirer from "inquirer";
import { z } from "zod";
import type { DiagnosticReport, TargetProfile } from "../types.js";
import { getSigningKey, signHexDigest } from "../crypto/keys.js";
import { verifyRawConfigSignature } from "../config/configSignaturePair.js";
import { questionBank } from "../diagnostic/questionBank.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { getAgentPaths } from "../fleet/paths.js";
import { captureTargetWizardPublication } from "./targetProfilePublication.js";

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
  const privateKey = getSigningKey(workspace, "config-signature");
  return signHexDigest(digest, privateKey);
}

export function defaultTargetMapping(level = 3): Record<string, number> {
  const out: Record<string, number> = {};
  for (const question of questionBank) {
    out[question.id] = level;
  }
  return out;
}

/** Shared v1 payload recipe. Signed field order, UUID, timestamp and mapping semantics stay unchanged. */
export function targetProfilePayload(params: { name: string; contextGraphHash: string; mapping: Record<string, number> }): Omit<TargetProfile, "signature"> {
  return { id: randomUUID(), name: params.name, createdTs: Date.now(), contextGraphHash: params.contextGraphHash, mapping: params.mapping };
}

export function createSignedTargetProfile(params: {
  workspace: string;
  name: string;
  contextGraphHash: string;
  mapping: Record<string, number>;
}): TargetProfile {
  const payload = targetProfilePayload(params);
  const signature = signTargetPayload(params.workspace, payload);
  return {
    ...payload,
    signature
  };
}

/** Internal maintained compatibility recipe; the original public synchronous APIs remain unchanged. */
export function createMaintainedCompatibleTargetProfile(params: {
  workspace: string; name: string; contextGraphHash: string; mapping: Record<string, number>;
}, beforeSign: () => void): TargetProfile {
  const payload = targetProfilePayload(params);
  beforeSign();
  const signature = signTargetPayload(params.workspace, payload);
  return { ...payload, signature };
}

export function saveTargetProfile(workspace: string, profile: TargetProfile, agentId?: string): string {
  ensureDir(targetDir(workspace, agentId));
  const file = targetPath(workspace, profile.name, agentId);
  writeFileAtomic(file, JSON.stringify(profile, null, 2), 0o644);
  return file;
}

/** The actual target wire parser, shared with its fixed initialized diagnostic consumer. */
export function parseTargetProfileBytes(bytes: Uint8Array): TargetProfile {
  return targetProfileSchema.parse(JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown);
}

export function loadTargetProfile(workspace: string, name: string, agentId?: string): TargetProfile {
  const primary = targetPath(workspace, name, agentId);
  const legacyRoot = join(workspace, ".amc", "targets", `${name}.target.json`);
  const file = pathExists(primary) ? primary : pathExists(legacyRoot) ? legacyRoot : primary;
  if (!pathExists(file)) {
    throw new Error(`Target profile not found: ${file}`);
  }
  return parseTargetProfileBytes(readFileSync(file));
}

export function loadTargetProfileFromFile(file: string): TargetProfile {
  return parseTargetProfileBytes(readFileSync(file));
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
  return verifyRawConfigSignature(workspace, digest, profile.signature);
}

export async function setTargetProfileInteractive(params: {
  workspace: string;
  name: string;
  contextGraphHash: string;
  agentId?: string;
}): Promise<TargetProfile> {
  const input = { ...params };
  const target = captureTargetWizardPublication(input.workspace, input.agentId);
  const mapping: Record<string, number> = {};

  for (const question of questionBank) {
    target.observe();
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
    target.observe();
  }

  const result = await target.publish({ name: input.name, contextGraphHash: input.contextGraphHash, mapping });
  target.assertCurrent();
  return result.profile;
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
