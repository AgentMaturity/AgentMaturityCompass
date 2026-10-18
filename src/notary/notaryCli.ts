import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import inquirer from "inquirer";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import {
  defaultNotaryConfig,
  initNotaryConfig,
  loadNotaryConfig,
  notaryConfigPath,
  notaryLogPath,
  notaryPublicKeyPath,
  resolveNotaryDir
} from "./notaryConfigStore.js";
import { initFileSealedNotaryKey, loadNotarySigner } from "./notarySigner.js";
import { appendNotaryLogEntry, initNotaryLog, tailNotaryLog, verifyNotaryLog } from "./notaryLog.js";
import { exportNotaryAttestationBundle, verifyNotaryAttestationBundle } from "./notaryAttestation.js";
import { resolveNotaryBindHost, startNotaryServer } from "./notaryServer.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { assertFileNotExample } from "../claims/eligibility/exampleMode.js";
import type { TrustContext } from "../trust/trustContext.js";

function loadPassphraseForInit(): string {
  const fromFile = process.env.AMC_NOTARY_PASSPHRASE_FILE;
  if (fromFile && fromFile.trim().length > 0 && pathExists(fromFile.trim())) {
    const value = readFileSync(fromFile.trim(), "utf8").trim();
    if (value.length >= 8) {
      return value;
    }
  }
  if (process.env.AMC_NOTARY_PASSPHRASE && process.env.AMC_NOTARY_PASSPHRASE.length >= 8) {
    return process.env.AMC_NOTARY_PASSPHRASE;
  }
  throw new Error("Notary init requires AMC_NOTARY_PASSPHRASE_FILE or AMC_NOTARY_PASSPHRASE (min 8 chars).");
}

export async function notaryInitCli(params: {
  notaryDir?: string;
  externalSignerCommand?: string;
  externalSignerArgs?: string[];
}): Promise<{
  notaryDir: string;
  configPath: string;
  publicKeyPath: string;
  keyPath: string | null;
  fingerprint: string;
}> {
  const notaryDir = resolveNotaryDir(params.notaryDir);
  ensureDir(notaryDir);
  const config = defaultNotaryConfig();
  if (params.externalSignerCommand) {
    config.notary.backend = {
      type: "EXTERNAL_SIGNER",
      command: params.externalSignerCommand,
      args: params.externalSignerArgs ?? []
    };
  }
  const configPath = initNotaryConfig(notaryDir, config);
  if (config.notary.backend.type === "EXTERNAL_SIGNER") {
    const signer = loadNotarySigner({
      notaryDir,
      backend: config.notary.backend
    });
    initNotaryLog(notaryDir, signer);
    return {
      notaryDir,
      configPath,
      publicKeyPath: notaryPublicKeyPath(notaryDir),
      keyPath: null,
      fingerprint: signer.pubkeyFingerprint()
    };
  }
  const passphrase = loadPassphraseForInit();
  const key = initFileSealedNotaryKey({
    notaryDir,
    passphrase
  });
  const signer = loadNotarySigner({
    notaryDir,
    backend: config.notary.backend
  });
  initNotaryLog(notaryDir, signer);
  return {
    notaryDir,
    configPath,
    publicKeyPath: key.publicKeyPath,
    keyPath: key.keyPath,
    fingerprint: key.pubkeyFingerprint
  };
}

export async function notaryStartCli(params: {
  notaryDir?: string;
  workspace?: string | null;
  bindHost?: string;
}): Promise<{
  notaryDir: string;
  url: string;
  close: () => Promise<void>;
}> {
  const notaryDir = resolveNotaryDir(params.notaryDir);
  const config = loadNotaryConfig(notaryDir);
  resolveNotaryBindHost(params.bindHost, config.notary.bindHost, config.notary.unixSocketPath);
  if (!pathExists(notaryConfigPath(notaryDir))) {
    await notaryInitCli({ notaryDir });
  }
  const runtime = await startNotaryServer({
    notaryDir,
    workspace: params.workspace ?? null,
    bindHost: params.bindHost
  });
  return {
    notaryDir,
    url: runtime.url,
    close: runtime.close
  };
}

export function notaryStatusCli(params: {
  notaryDir?: string;
}): {
  notaryDir: string;
  configPath: string;
  backend: string;
  logPath: string;
  ready: boolean;
  reasons: string[];
  fingerprint: string | null;
  tail: ReturnType<typeof tailNotaryLog>;
} {
  const notaryDir = resolveNotaryDir(params.notaryDir);
  const configPath = notaryConfigPath(notaryDir);
  const config = loadNotaryConfig(notaryDir);
  let ready = true;
  const reasons: string[] = [];
  let fingerprint: string | null = null;
  try {
    const signer = loadNotarySigner({
      notaryDir,
      backend: config.notary.backend
    });
    fingerprint = signer.pubkeyFingerprint();
  } catch (error) {
    ready = false;
    reasons.push(String(error));
  }
  return {
    notaryDir,
    configPath,
    backend: config.notary.backend.type,
    logPath: notaryLogPath(notaryDir),
    ready,
    reasons,
    fingerprint,
    tail: tailNotaryLog(notaryDir, 20)
  };
}

export function notaryPubkeyCli(params: { notaryDir?: string }): {
  notaryDir: string;
  pubkeyPem: string;
  fingerprint: string;
} {
  const notaryDir = resolveNotaryDir(params.notaryDir);
  const config = loadNotaryConfig(notaryDir);
  const signer = loadNotarySigner({
    notaryDir,
    backend: config.notary.backend
  });
  return {
    notaryDir,
    pubkeyPem: signer.pubkeyPem(),
    fingerprint: signer.pubkeyFingerprint()
  };
}

export function notaryAttestCli(params: {
  notaryDir?: string;
  workspace?: string | null;
  outFile: string;
}): { outFile: string } {
  const notaryDir = resolveNotaryDir(params.notaryDir);
  const config = loadNotaryConfig(notaryDir);
  const signer = loadNotarySigner({
    notaryDir,
    backend: config.notary.backend
  });
  return exportNotaryAttestationBundle({
    signer,
    workspace: params.workspace ?? null,
    outFile: resolve(params.outFile)
  });
}

export function notaryVerifyAttestCli(file: string, trust: TrustContext, pubkeyPath?: string) {
  return verifyNotaryAttestationBundle(resolve(file), trust, pubkeyPath ? readFileSync(resolve(pubkeyPath), "utf8") : null);
}

export function notarySignCli(params: {
  notaryDir?: string;
  kind: string;
  inFile: string;
  outFile: string;
}): {
  outFile: string;
  fingerprint: string;
  payloadSha256: string;
} {
  assertFileNotExample(params.inFile, "notary-signed");
  const notaryDir = resolveNotaryDir(params.notaryDir);
  const config = loadNotaryConfig(notaryDir);
  const signer = loadNotarySigner({
    notaryDir,
    backend: config.notary.backend
  });
  const payload = readFileSync(resolve(params.inFile));
  const payloadSha256 = sha256Hex(payload);
  const signed = signer.sign(params.kind, payload);
  appendNotaryLogEntry({
    notaryDir,
    signer,
    requestId: `cli_${Date.now()}`,
    kind: params.kind,
    payloadSha256
  });
  const out = {
    v: 1,
    kind: params.kind,
    payloadSha256,
    signatureB64: signed.signatureB64,
    pubkeyPem: signed.pubkeyPem,
    pubkeyFingerprint: signed.pubkeyFingerprint,
    signedTs: signed.signedTs,
    backend: signed.backend,
    attestationLevel: signed.attestationLevel,
    claims: signed.claims
  };
  writeFileAtomic(resolve(params.outFile), `${canonicalize(out)}\n`, 0o600);
  return {
    outFile: resolve(params.outFile),
    fingerprint: signed.pubkeyFingerprint,
    payloadSha256
  };
}

export function notaryLogVerifyCli(params: { notaryDir?: string }): {
  ok: boolean;
  errors: string[];
  count: number;
  lastHash: string;
} {
  return verifyNotaryLog(resolveNotaryDir(params.notaryDir));
}

export async function notaryInitInteractiveCli(params: {
  notaryDir?: string;
  externalSigner?: boolean;
}): Promise<{
  notaryDir: string;
  configPath: string;
  publicKeyPath: string;
  keyPath: string | null;
  fingerprint: string;
}> {
  if (!params.externalSigner && !process.env.AMC_NOTARY_PASSPHRASE_FILE && !process.env.AMC_NOTARY_PASSPHRASE) {
    const answer = await inquirer.prompt<{ passphrase: string }>([
      {
        type: "password",
        name: "passphrase",
        message: "Notary passphrase (min 8 chars):",
        mask: "*"
      }
    ]);
    if (!answer.passphrase || answer.passphrase.length < 8) {
      throw new Error("Notary passphrase must be at least 8 characters.");
    }
    process.env.AMC_NOTARY_PASSPHRASE = answer.passphrase;
  }
  return notaryInitCli({
    notaryDir: params.notaryDir
  });
}
