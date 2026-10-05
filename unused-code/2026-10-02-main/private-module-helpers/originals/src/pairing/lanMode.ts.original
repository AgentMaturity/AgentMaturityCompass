import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";

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

export function defaultLanMode(): LanModeConfig {
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
  const parsed = YAML.parse(readUtf8(path)) as Partial<LanModeConfig> | null;
  return {
    enabled: parsed?.enabled === true,
    bind: typeof parsed?.bind === "string" && parsed.bind.length > 0 ? parsed.bind : "127.0.0.1",
    port: typeof parsed?.port === "number" ? parsed.port : 3212,
    allowedCIDRs: Array.isArray(parsed?.allowedCIDRs) ? parsed.allowedCIDRs.map(String) : ["127.0.0.1/32"],
    requirePairing: parsed?.requirePairing === true
  };
}

export function signLanMode(workspace: string): string {
  const path = lanPath(workspace);
  if (!pathExists(path)) {
    throw new Error(`LAN config not found: ${path}`);
  }
  const digest = sha256Hex(readFileSync(path));
  const sig: LanSignature = {
    digestSha256: digest,
    signature: signHexDigest(digest, getPrivateKeyPem(workspace, "auditor")),
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
    const valid = verifyHexDigestAny(digest, sig.signature, getPublicKeyHistory(workspace, "auditor"));
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

export function disableLanMode(workspace: string): { path: string; sigPath: string } {
  const current = loadLanMode(workspace);
  const next: LanModeConfig = {
    ...current,
    enabled: false,
    bind: "127.0.0.1",
    requirePairing: false
  };
  const path = lanPath(workspace);
  ensureDir(join(workspace, ".amc", "studio"));
  writeFileAtomic(path, YAML.stringify(next), 0o644);
  return {
    path,
    sigPath: signLanMode(workspace)
  };
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
