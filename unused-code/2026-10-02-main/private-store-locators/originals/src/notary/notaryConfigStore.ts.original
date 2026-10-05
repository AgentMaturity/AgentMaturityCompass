import { homedir } from "node:os";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { notaryConfigSchema, type NotaryConfig } from "./notaryConfigSchema.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";

export function defaultNotaryDir(): string {
  const custom = process.env.AMC_NOTARY_DIR;
  if (typeof custom === "string" && custom.trim().length > 0) {
    return resolve(custom.trim());
  }
  return resolve(homedir(), ".amc-notary");
}

export function resolveNotaryDir(explicitDir?: string): string {
  if (explicitDir && explicitDir.trim().length > 0) {
    return resolve(explicitDir.trim());
  }
  return defaultNotaryDir();
}

export function notaryConfigPath(notaryDir: string): string {
  return join(notaryDir, "notary.yaml");
}

export function notaryKeysDir(notaryDir: string): string {
  return join(notaryDir, "keys");
}

export function notaryLogsDir(notaryDir: string): string {
  return join(notaryDir, "logs");
}

export function notarySealedKeyPath(notaryDir: string): string {
  return join(notaryKeysDir(notaryDir), "notary_ed25519.enc.json");
}

export function notaryPublicKeyPath(notaryDir: string): string {
  return join(notaryKeysDir(notaryDir), "notary_ed25519.pub");
}

export function notaryLogPath(notaryDir: string): string {
  return join(notaryLogsDir(notaryDir), "signing.jsonl");
}

export function notarySealPath(notaryDir: string): string {
  return join(notaryLogsDir(notaryDir), "signing.seal.json");
}

export function notarySealSigPath(notaryDir: string): string {
  return join(notaryLogsDir(notaryDir), "signing.seal.sig");
}

export function defaultNotaryConfig(): NotaryConfig {
  return notaryConfigSchema.parse({
    notary: {
      version: 1,
      bindHost: "127.0.0.1",
      port: 4343,
      unixSocketPath: null,
      backend: {
        type: "FILE_SEALED",
        keyFile: "keys/notary_ed25519.enc.json",
        publicKeyFile: "keys/notary_ed25519.pub"
      },
      auth: {
        enabled: true,
        headerName: "x-amc-notary-auth",
        tsHeaderName: "x-amc-notary-ts",
        hmacAlg: "sha256",
        maxClockSkewSeconds: 30
      },
      allowedSignKinds: [
        "TRANSPARENCY_ROOT",
        "MERKLE_ROOT",
        "CERT",
        "BUNDLE",
        "BOM",
        "INSTALLED_LOCK",
        "RELEASE_MANIFEST",
        "BACKUP_MANIFEST",
        "ORG_SCORECARD",
        "TRANSFORM_PLAN",
        "COMPLIANCE_MAPS",
        "OPS_POLICY"
      ],
      rateLimitPerMinute: 120
    }
  });
}

export function ensureNotaryDir(notaryDir: string): void {
  ensureDir(notaryDir);
  ensureDir(notaryKeysDir(notaryDir));
  ensureDir(notaryLogsDir(notaryDir));
}

export function loadNotaryConfig(notaryDir: string): NotaryConfig {
  const path = notaryConfigPath(notaryDir);
  if (!pathExists(path)) {
    return defaultNotaryConfig();
  }
  return notaryConfigSchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

export function saveNotaryConfig(notaryDir: string, config: NotaryConfig): string {
  ensureNotaryDir(notaryDir);
  const path = notaryConfigPath(notaryDir);
  writeFileAtomic(path, YAML.stringify(notaryConfigSchema.parse(config)), 0o600);
  return path;
}

export function initNotaryConfig(notaryDir: string, config?: NotaryConfig): string {
  const payload = config ? notaryConfigSchema.parse(config) : defaultNotaryConfig();
  return saveNotaryConfig(notaryDir, payload);
}

