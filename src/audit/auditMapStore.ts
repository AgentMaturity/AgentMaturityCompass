import { assertOrgPairsCurrent, captureOrgPairs, orgPairBytes } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { captureAuditPolicyMapPublication, readAuditMapBodySelection } from "./auditPolicyMapPublication.js";
import type { AuditPublicationOptions } from "./binderPublication.js";
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

function saveAuditMapBuiltin(workspace: string, map: AuditMapFile): { path: string; sigPath: string } {
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

export function prepareAuditMapActiveAsync(workspace: string, map: AuditMapFile, options: AuditPublicationOptions = {}) {
  return captureAuditPolicyMapPublication(workspace, { active: map }, options).prepare();
}
/** Select actual read/default/copy inputs once before a possible Sign; no original target callback survives its own write. */
export async function loadAuditMapsAttemptAsync(workspace: string, id: "builtin" | "active" | "list", options: AuditPublicationOptions = {}) {
  const caller = { ...options }; caller.beforePublish?.(); caller.assertInputsCurrent?.(); caller.assertPreparationInputsCurrent?.();
  const active = id === "builtin" ? null : readAuditMapBodySelection(workspace, "active");
  const builtin = id === "active" && active?.bytes !== null ? null : readAuditMapBodySelection(workspace, "builtin");
  const parsedBuiltin = builtin?.bytes ? auditMapSchema.parse(YAML.parse(builtin.bytes.toString("utf8"))) : null;
  const parsedActive = active?.bytes && (id === "active" || builtin?.bytes !== null) ? auditMapSchema.parse(YAML.parse(active.bytes.toString("utf8"))) : null;
  if ((id === "active" && parsedActive !== null) || (id === "builtin" && parsedBuiltin !== null) || (id === "list" && parsedActive !== null && parsedBuiltin !== null)) {
    const assertCurrent = () => { caller.beforePublish?.(); caller.assertInputsCurrent?.(); builtin?.assertCurrent(); active?.assertCurrent(); };
    assertCurrent(); return Object.freeze({ map: id === "builtin" ? parsedBuiltin! : parsedActive!, builtin: parsedBuiltin, active: parsedActive, assertCurrent });
  }
  const paths = [auditMapBuiltinPath(workspace), auditMapActivePath(workspace)], previous = captureOrgPairs(paths);
  const originalBuiltin = orgPairBytes(previous, paths[0]!), originalSignature = orgPairBytes(previous, `${paths[0]!}.sig`);
  const builtinMissing = builtin === null || builtin.bytes === null;
  if (builtinMissing ? originalBuiltin !== null : originalBuiltin === null || !originalBuiltin.equals(builtin!.bytes!)) throw new Error("audit builtin selection changed before initialization");
  if (active?.bytes === null && orgPairBytes(previous, paths[1]!) !== null) throw new Error("audit active selection changed before initialization");
  const map = builtinMissing ? defaultAuditMapBuiltin() : auditMapSchema.parse(YAML.parse(originalBuiltin!.toString("utf8")));
  const sourceCurrent = () => {
    if (!builtinMissing) {
      assertOrgPairsCurrent({ members: previous.members.filter(row => row.path === paths[0] || row.path === `${paths[0]!}.sig`) });
      if (originalSignature === null || !verifyAuditorSignatureBytes(workspace, "COMPLIANCE_MAPS", originalBuiltin!, originalSignature).valid)
        throw new Error("audit builtin map is not currently admitted for active-map initialization");
    }
  };
  const beforePublish = () => { caller.beforePublish?.(); sourceCurrent(); };
  const assertPreparationInputsCurrent = () => { caller.assertPreparationInputsCurrent?.(); assertOrgPairsCurrent(previous); };
  sourceCurrent();
  const prepared = await captureAuditPolicyMapPublication(workspace, builtinMissing ? { builtin: map, active: map } : { active: map },
    { ...caller, beforePublish, assertPreparationInputsCurrent }, previous).prepare();
  prepared.publish(); prepared.assertCurrent();
  return Object.freeze({ map, builtin: map, active: map, assertCurrent: prepared.assertCurrent });
}
