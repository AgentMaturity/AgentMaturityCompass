/**
 * Reads, writes and signs the source policy (SH-INTEG-02). Signing goes through the maintained config-signature pair
 * (`captureRawConfigPairForAsync`: keyset, key policy and purpose publication are checked before the write), the same
 * path `amc integrations init` uses. Loading verifies and parses one read of the file, so the bytes verified are the
 * bytes parsed. An unsigned, tampered or unparsable policy is `policy_unverified`: it admits nothing.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { captureRawConfigPairForAsync, verifyRawConfigSignature } from "../../config/configSignaturePair.js";
import { openLedger } from "../../ledger/ledger.js";
import { assertOwnerMode } from "../../mode/mode.js";
import { ensureDir, pathExists } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import { defaultSourcePolicy, sourcePolicySchema, type SourcePolicy } from "./sourcePolicySchema.js";

export function sourcePolicyPath(workspace: string): string {
  return join(workspace, ".amc", "integrations", "sources.yaml");
}

const signatureFileSchema = z.object({ digestSha256: z.string().length(64), signature: z.string().min(1), signedTs: z.number().int(), signer: z.literal("auditor") });

export type LoadedSourcePolicy =
  | { ok: true; policy: SourcePolicy; digest: string; path: string }
  | { ok: false; reason: "policy_unverified"; detail: string; path: string };

/** One read of the policy and its signature; verify the bytes, then parse those same bytes. */
export function loadVerifiedSourcePolicy(workspace: string): LoadedSourcePolicy {
  const path = sourcePolicyPath(workspace);
  const refuse = (detail: string): LoadedSourcePolicy => ({ ok: false, reason: "policy_unverified", detail, path });
  let bytes: Buffer, sigBytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    return refuse("source policy missing");
  }
  try {
    sigBytes = readFileSync(`${path}.sig`);
  } catch {
    return refuse("source policy signature missing");
  }
  const digest = sha256Hex(bytes);
  try {
    const sig = signatureFileSchema.parse(JSON.parse(sigBytes.toString("utf8")) as unknown);
    if (sig.digestSha256 !== digest) return refuse("digest mismatch");
    if (!verifyRawConfigSignature(workspace, digest, sig.signature)) return refuse("signature verification failed");
  } catch (error) {
    return refuse(`signature file invalid: ${String(error)}`);
  }
  const parsed = sourcePolicySchema.safeParse(YAML.parse(bytes.toString("utf8")) as unknown);
  if (!parsed.success) return refuse(`policy invalid: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  return { ok: true, policy: parsed.data, digest, path };
}

/** Strict parse of the file as it is on disk, before signing it: an invalid policy is never signed. */
function parseSourcePolicyFile(bytes: Buffer): SourcePolicy {
  return sourcePolicySchema.parse(YAML.parse(bytes.toString("utf8")) as unknown);
}

function writeSignedAudit(workspace: string, agentIds: string[], digest: string, kind: "init" | "sign"): void {
  const ledger = openLedger(workspace);
  try {
    const sessionId = `source-policy-${randomUUID()}`;
    const payload = JSON.stringify({ auditType: "SOURCE_POLICY_SIGNED", kind, digest, agentIds, ts: Date.now() });
    ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "amc-integrations-source", binarySha256: sha256Hex("amc-integrations-source") });
    ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: "audit", payload, payloadExt: "json", inline: true,
      meta: { auditType: "SOURCE_POLICY_SIGNED", severity: "LOW", kind, digest, agentIds, trustTier: "OBSERVED" } });
    ledger.sealSession(sessionId);
  } finally {
    ledger.close();
  }
}

async function publishSourcePolicy(workspace: string, bytes: Buffer | undefined, kind: "init" | "sign"): Promise<{ path: string; sigPath: string; digest: string }> {
  assertOwnerMode(workspace, `integrations source ${kind}`);
  const path = sourcePolicyPath(workspace);
  const policy = parseSourcePolicyFile(bytes ?? readFileSync(path));
  const pair = captureRawConfigPairForAsync(workspace, path, bytes);
  const prepared = await pair.prepare();
  const result = prepared.publish();
  prepared.assertCurrent();
  writeSignedAudit(workspace, policy.sources.sources.map((source) => source.agentId), pair.digestSha256, kind);
  return { ...result, digest: pair.digestSha256 };
}

/** Writes and signs the template (`admission: off`). Refuses to overwrite an existing policy. */
export async function initSourcePolicy(workspace: string): Promise<{ path: string; sigPath: string; digest: string }> {
  const path = sourcePolicyPath(workspace);
  if (pathExists(path)) throw new Error(`source policy exists: ${path}; edit it and run \`amc integrations source sign\``);
  ensureDir(join(workspace, ".amc", "integrations"));
  return publishSourcePolicy(workspace, Buffer.from(YAML.stringify(defaultSourcePolicy())), "init");
}

/** Signs the policy the operator edited, after a strict parse of the bytes on disk. */
export async function signSourcePolicy(workspace: string): Promise<{ path: string; sigPath: string; digest: string }> {
  if (!pathExists(sourcePolicyPath(workspace))) throw new Error(`source policy missing: run \`amc integrations source init\` first`);
  return publishSourcePolicy(workspace, undefined, "sign");
}
