import { join } from "node:path";
import YAML from "yaml";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { auditMapSchema, type AuditMapFile } from "./auditMapSchema.js";
import { defaultAuditMapBuiltin } from "./auditMapBuiltin.js";
import { signAuditMapFile } from "./auditMapSigner.js";
import { verifyAuditMapFile } from "./auditMapVerifier.js";
import { auditMapsDir, ensureAuditDirs } from "./auditPolicyStore.js";

export function auditMapBuiltinPath(workspace: string): string {
  return join(auditMapsDir(workspace), "builtin.yaml");
}

export function auditMapActivePath(workspace: string): string {
  return join(auditMapsDir(workspace), "active.yaml");
}

function writeMapFile(workspace: string, path: string, map: AuditMapFile): { path: string; sigPath: string } {
  ensureAuditDirs(workspace);
  ensureDir(auditMapsDir(workspace));
  writeFileAtomic(path, YAML.stringify(auditMapSchema.parse(map)), 0o644);
  return {
    path,
    sigPath: signAuditMapFile(workspace, path)
  };
}

export function saveAuditMapBuiltin(workspace: string, map: AuditMapFile): { path: string; sigPath: string } {
  return writeMapFile(workspace, auditMapBuiltinPath(workspace), map);
}

export function saveAuditMapActive(workspace: string, map: AuditMapFile): { path: string; sigPath: string } {
  return writeMapFile(workspace, auditMapActivePath(workspace), map);
}

export function initAuditMaps(workspace: string): {
  builtinPath: string;
  builtinSigPath: string;
  activePath: string;
  activeSigPath: string;
  map: AuditMapFile;
} {
  const map = defaultAuditMapBuiltin();
  const builtin = saveAuditMapBuiltin(workspace, map);
  const active = saveAuditMapActive(workspace, map);
  return {
    builtinPath: builtin.path,
    builtinSigPath: builtin.sigPath,
    activePath: active.path,
    activeSigPath: active.sigPath,
    map
  };
}

export function loadAuditMapBuiltin(workspace: string): AuditMapFile {
  const path = auditMapBuiltinPath(workspace);
  if (!pathExists(path)) {
    return initAuditMaps(workspace).map;
  }
  return auditMapSchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

export function loadAuditMapActive(workspace: string): AuditMapFile {
  const path = auditMapActivePath(workspace);
  if (!pathExists(path)) {
    if (!pathExists(auditMapBuiltinPath(workspace))) {
      initAuditMaps(workspace);
    }
    const builtin = loadAuditMapBuiltin(workspace);
    saveAuditMapActive(workspace, builtin);
    return builtin;
  }
  return auditMapSchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

export function verifyAuditMapBuiltinSignature(workspace: string) {
  const path = auditMapBuiltinPath(workspace);
  if (!pathExists(path)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "audit builtin map missing",
      path,
      sigPath: `${path}.sig`
    };
  }
  return verifyAuditMapFile(workspace, path);
}

export function verifyAuditMapActiveSignature(workspace: string) {
  const path = auditMapActivePath(workspace);
  if (!pathExists(path)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "audit active map missing",
      path,
      sigPath: `${path}.sig`
    };
  }
  return verifyAuditMapFile(workspace, path);
}
