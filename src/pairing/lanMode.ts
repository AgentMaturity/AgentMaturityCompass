import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { getSigningKey, signHexDigest } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { captureRawConfigPairForAsync, verifyRawConfigSignature } from "../config/configSignaturePair.js";
import { assertOrgPairsCurrent, captureOrgPairs, orgPairBytes, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { assertKeysetComplete, boundProviderKey, keysetCommittedMark } from "../keys/keyset.js";
import { assertSigningKeyUsable, getSigningPublicKeyPem } from "../keys/signingKeys.js";
import { loadKeysConfig, parseKeysSection } from "../keys/keysConfig.js";
import { canonicalize } from "../utils/json.js";

interface LanSignature {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

export interface LanModeConfig {
  enabled: boolean;
  bind: string;
  port: number;
  allowedCIDRs: string[];
  requirePairing: boolean;
}

function lanPath(workspace: string): string {
  return join(workspace, ".amc", "studio", "lan.yaml");
}

function lanSigPath(workspace: string): string {
  return `${lanPath(workspace)}.sig`;
}

function defaultLanMode(): LanModeConfig {
  return {
    enabled: false,
    bind: "127.0.0.1",
    port: 3212,
    allowedCIDRs: ["127.0.0.1/32"],
    requirePairing: false
  };
}

export function loadLanMode(workspace: string): LanModeConfig {
  const path = lanPath(workspace);
  if (!pathExists(path)) {
    return defaultLanMode();
  }
  return parseLanMode(readUtf8(path));
}

function parseLanMode(bytes: string): LanModeConfig {
  const parsed = YAML.parse(bytes) as Partial<LanModeConfig> | null;
  return {
    enabled: parsed?.enabled === true,
    bind: typeof parsed?.bind === "string" && parsed.bind.length > 0 ? parsed.bind : "127.0.0.1",
    port: typeof parsed?.port === "number" ? parsed.port : 3212,
    allowedCIDRs: Array.isArray(parsed?.allowedCIDRs) ? parsed.allowedCIDRs.map(String) : ["127.0.0.1/32"],
    requirePairing: parsed?.requirePairing === true
  };
}

function signLanMode(workspace: string): string {
  const path = lanPath(workspace);
  if (!pathExists(path)) {
    throw new Error(`LAN config not found: ${path}`);
  }
  const digest = sha256Hex(readFileSync(path));
  const sig: LanSignature = {
    digestSha256: digest,
    signature: signHexDigest(digest, getSigningKey(workspace, "config-signature")),
    signedTs: Date.now(),
    signer: "auditor"
  };
  const sigPath = lanSigPath(workspace);
  writeFileAtomic(sigPath, JSON.stringify(sig, null, 2), 0o644);
  return sigPath;
}

export function verifyLanModeSignature(workspace: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
} {
  const path = lanPath(workspace);
  const sigPath = lanSigPath(workspace);
  if (!pathExists(path)) {
    return {
      valid: true,
      signatureExists: false,
      reason: null,
      path,
      sigPath
    };
  }
  if (!pathExists(sigPath)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "signature missing",
      path,
      sigPath
    };
  }
  try {
    const sig = JSON.parse(readUtf8(sigPath)) as LanSignature;
    const digest = sha256Hex(readFileSync(path));
    if (digest !== sig.digestSha256) {
      return {
        valid: false,
        signatureExists: true,
        reason: "digest mismatch",
        path,
        sigPath
      };
    }
    const valid = verifyRawConfigSignature(workspace, digest, sig.signature);
    return {
      valid,
      signatureExists: true,
      reason: valid ? null : "signature verification failed",
      path,
      sigPath
    };
  } catch (error) {
    return {
      valid: false,
      signatureExists: true,
      reason: String(error),
      path,
      sigPath
    };
  }
}

export function enableLanMode(params: {
  workspace: string;
  bind: string;
  port: number;
  allowedCIDRs?: string[];
  requirePairing?: boolean;
}): { path: string; sigPath: string } {
  const config: LanModeConfig = {
    enabled: true,
    bind: params.bind,
    port: params.port,
    allowedCIDRs: params.allowedCIDRs && params.allowedCIDRs.length > 0 ? params.allowedCIDRs : ["127.0.0.1/32"],
    requirePairing: params.requirePairing !== false
  };
  const path = lanPath(params.workspace);
  ensureDir(join(params.workspace, ".amc", "studio"));
  writeFileAtomic(path, YAML.stringify(config), 0o644);
  return {
    path,
    sigPath: signLanMode(params.workspace)
  };
}

/** Actual raw config-purpose successors. Inputs/defaults and original target pair precede the first provider wait. */
export async function enableLanModeAsync(supplied: Parameters<typeof enableLanMode>[0], beforePublish?: () => void): Promise<{ path: string; sigPath: string }> {
  const params = { ...supplied, workspace: resolve(supplied.workspace), allowedCIDRs: supplied.allowedCIDRs === undefined ? undefined : [...supplied.allowedCIDRs] };
  const config: LanModeConfig = { enabled: true, bind: params.bind, port: params.port,
    allowedCIDRs: params.allowedCIDRs && params.allowedCIDRs.length > 0 ? params.allowedCIDRs : ["127.0.0.1/32"], requirePairing: params.requirePairing !== false };
  const caller = beforePublish, stable = () => {
    caller?.();
    if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize LAN configuration signing");
  };
  stable();
  const pair = captureRawConfigPairForAsync(params.workspace, lanPath(params.workspace), Buffer.from(YAML.stringify(config)), { beforePublish: stable });
  const prepared = await pair.prepare(), result = prepared.publish(); prepared.assertCurrent(); return result;
}

export async function disableLanModeAsync(workspaceInput: string, beforePublish?: () => void): Promise<{ path: string; sigPath: string }> {
  const workspace = resolve(workspaceInput), caller = beforePublish, stable = () => {
    caller?.();
    if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize LAN configuration signing");
  };
  stable();
  const path = lanPath(workspace), previous = captureOrgPairs([path]), original = orgPairBytes(previous, path);
  const current = original === null ? defaultLanMode() : parseLanMode(original.toString("utf8"));
  const next: LanModeConfig = { ...current, enabled: false, bind: "127.0.0.1", requirePairing: false };
  const pair = captureRawConfigPairForAsync(workspace, path, Buffer.from(YAML.stringify(next)), { previous, beforePublish: stable });
  const prepared = await pair.prepare(), result = prepared.publish(); prepared.assertCurrent(); return result;
}

/** Public original-generation negative only. It does not unlock, probe a private key, or select a new signer.
 * An unmarked workspace keeps the existing continuation; its own migration needs a genuine vault-owned handle.
 */
function captureMarkedLanAuthority(workspace: string): (() => void) | null {
  const mark = keysetCommittedMark(workspace);
  if (mark === null) return null;
  const originalMark = canonicalize(mark), keyset = canonicalize(assertKeysetComplete(workspace));
  const configPath = join(workspace, ".amc", "amc.config.yaml"), config = captureOrgPairs([configPath]);
  const settings = canonicalize(parseKeysSection(orgPairBytes(config, configPath)));
  const bound = boundProviderKey(workspace, "config-signature"), binding = canonicalize(bound), holder = bound?.binding.provider ?? "file";
  const publicKeyPem = bound?.publicKeyPem ?? getSigningPublicKeyPem(workspace, "config-signature");
  const assertCurrent = () => {
    if (canonicalize(keysetCommittedMark(workspace)) !== originalMark || canonicalize(assertKeysetComplete(workspace)) !== keyset)
      throw new Error("original committed LAN signing generation changed; vault unlock effects, if any, remain");
    assertOrgPairsCurrent(config);
    const currentBound = boundProviderKey(workspace, "config-signature");
    if (canonicalize(loadKeysConfig(workspace)) !== settings || canonicalize(currentBound) !== binding
      || (currentBound?.publicKeyPem ?? getSigningPublicKeyPem(workspace, "config-signature")) !== publicKeyPem)
      throw new Error("original public LAN config authority changed; vault unlock effects, if any, remain");
    assertSigningKeyUsable(workspace, "config-signature", publicKeyPem, holder);
  };
  assertCurrent(); return assertCurrent;
}
function capturedLanAfterUnlock(workspace: string, path: string, bytes: Buffer, previous: OrgPairsSnapshot, original: () => void, refusedNoSign: boolean) {
  const stable = () => {
    if (refusedNoSign || process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize LAN configuration signing");
    original();
  };
  return Object.freeze({ async publish(): Promise<{ path: string; sigPath: string }> {
    stable();
    // The old target belongs only to C8's preparation/expected-own-state CAS, never the stable negative.
    const pair = captureRawConfigPairForAsync(workspace, path, bytes, { previous, beforePublish: stable });
    const prepared = await pair.prepare(), result = prepared.publish(); prepared.assertCurrent(); return result;
  } });
}
// Retain the existing CLI unlock attempt/effects even when a preprompt public snapshot already refused.
function refusedLanAfterUnlock(cause: unknown, refusedNoSign: boolean) {
  return Object.freeze({ async publish(): Promise<{ path: string; sigPath: string }> {
    if (refusedNoSign || process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize LAN configuration signing", { cause });
    throw cause;
  } });
}
/** Internal maintained CLI handoff, captured before its existing interactive unlock await. No root SDK export. */
export function captureLanModeEnableBeforeUnlock(supplied: Parameters<typeof enableLanMode>[0]) {
  const refusedNoSign = process.env.AMC_NO_SIGN === "1";
  try {
    const params = { ...supplied, workspace: resolve(supplied.workspace), allowedCIDRs: supplied.allowedCIDRs === undefined ? undefined : [...supplied.allowedCIDRs] };
    const original = captureMarkedLanAuthority(params.workspace);
    if (original === null) return null;
    const config: LanModeConfig = { enabled: true, bind: params.bind, port: params.port,
      allowedCIDRs: params.allowedCIDRs && params.allowedCIDRs.length > 0 ? params.allowedCIDRs : ["127.0.0.1/32"], requirePairing: params.requirePairing !== false };
    const path = lanPath(params.workspace), previous = captureOrgPairs([path]);
    return capturedLanAfterUnlock(params.workspace, path, Buffer.from(YAML.stringify(config)), previous, original, refusedNoSign);
  } catch (cause) { return refusedLanAfterUnlock(cause, refusedNoSign); }
}
export function captureLanModeDisableBeforeUnlock(workspaceInput: string) {
  const refusedNoSign = process.env.AMC_NO_SIGN === "1";
  try {
    const workspace = resolve(workspaceInput), original = captureMarkedLanAuthority(workspace);
    if (original === null) return null;
    const path = lanPath(workspace), previous = captureOrgPairs([path]), bytes = orgPairBytes(previous, path);
    const current = bytes === null ? defaultLanMode() : parseLanMode(bytes.toString("utf8"));
    const next: LanModeConfig = { ...current, enabled: false, bind: "127.0.0.1", requirePairing: false };
    return capturedLanAfterUnlock(workspace, path, Buffer.from(YAML.stringify(next)), previous, original, refusedNoSign);
  } catch (cause) { return refusedLanAfterUnlock(cause, refusedNoSign); }
}

function ipToNumber(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) {
    return null;
  }
  let total = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) {
      return null;
    }
    total = (total << 8) + n;
  }
  return total >>> 0;
}

export function ipAllowedByCidrs(ip: string, cidrs: string[]): boolean {
  const normalized = ip.includes(":") ? ip : ip.trim();
  if (normalized === "::1") {
    return cidrs.includes("::1/128") || cidrs.includes("127.0.0.1/32");
  }
  const ipNum = ipToNumber(normalized);
  if (ipNum === null) {
    return false;
  }
  for (const cidr of cidrs) {
    const [base, maskText] = cidr.split("/");
    const maskBits = Number(maskText);
    const baseNum = ipToNumber(base ?? "");
    if (baseNum === null || !Number.isInteger(maskBits) || maskBits < 0 || maskBits > 32) {
      continue;
    }
    const mask = maskBits === 0 ? 0 : ((0xffffffff << (32 - maskBits)) >>> 0);
    if ((ipNum & mask) === (baseNum & mask)) {
      return true;
    }
  }
  return false;
}

export function lanModePath(workspace: string): string {
  return resolve(lanPath(workspace));
}
