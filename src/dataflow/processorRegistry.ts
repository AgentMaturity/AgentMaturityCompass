import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { getMode } from "../mode/mode.js";
import { writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { ProtectedDataClass } from "../vault/dataClassification.js";
import type { PurposePolicyV1 } from "./purposePolicy.js";

export interface ProcessorContractV1 {
  readonly kind: "BAA" | "DPA" | "other";
  readonly reference: string;
  readonly effective: string;
  readonly expires: string | null;
  readonly dataClasses: readonly ProtectedDataClass[];
}

export interface ProcessorRecordV1 {
  readonly processorId: string;
  readonly legalName: string;
  readonly contracts: readonly ProcessorContractV1[];
}

export interface ProcessorBindingV1 {
  readonly providerId: string;
  readonly baseUrl: string;
  readonly processorId: string;
  readonly purposeId: string;
}

/** Experimental operator declarations; signatures do not prove their truth or legal sufficiency. */
export interface ProcessorRegistryV1 {
  readonly schemaVersion: "amc.dataflow-processors/v1";
  readonly experimental: true;
  readonly processors: readonly ProcessorRecordV1[];
  readonly purposes: readonly PurposePolicyV1[];
  readonly bindings: readonly ProcessorBindingV1[];
}

export type ProcessorRegistryFailure = "workspace_invalid" | "registry_unreadable" | "signature_missing" | "signature_invalid" | "schema_invalid";
export type ProcessorRegistrySnapshot =
  | { readonly state: "missing" }
  | { readonly state: "invalid"; readonly reason: ProcessorRegistryFailure }
  | { readonly state: "verified"; readonly digestSha256: string; readonly registry: ProcessorRegistryV1 };

const MAX_REGISTRY_BYTES = 1_048_576;
const MAX_SIGNATURE_BYTES = 16_384;
const protectedClasses = ["phi", "pii", "card_number", "bank_account", "credential"] as const;
const term = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const terms = z.array(term).min(1).max(256).refine(values => new Set(values).size === values.length);
const declaration = z.string().min(1).max(512).refine(value => value === value.trim() && !/[\r\n\x00]/.test(value));
const classes = z.array(z.enum(protectedClasses)).min(1).max(protectedClasses.length).refine(values => new Set(values).size === values.length);
const contractDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const ts = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(ts) && new Date(ts).toISOString().slice(0, 10) === value;
});

/** Exact normalized route base only; this does not authorize a later envelope URL or redirect. */
export function normalizeProcessorRouteBaseUrl(raw: string): string | null {
  try {
    if (typeof raw !== "string" || raw.length > 4096 || /[\s\x00-\x1f\x7f\\?#]/.test(raw)) return null;
    const authority = /^https?:\/\/([^/?#]*)/i.exec(raw)?.[1];
    const url = new URL(raw);
    if (!authority || authority.includes("@") || url.username || url.password || !["http:", "https:"].includes(url.protocol)
      || /%(?:2e|2f|5c)/i.test(url.pathname)) return null;
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.href;
  } catch { return null; }
}

const contractSchema = z.strictObject({ kind: z.enum(["BAA", "DPA", "other"]), reference: declaration,
  effective: contractDate, expires: contractDate.nullable(), dataClasses: classes }).superRefine((contract, context) => {
  if (contract.expires !== null && contract.expires <= contract.effective)
    context.addIssue({ code: "custom", path: ["expires"], message: "expiry must follow effective date" });
});
const processorSchema = z.strictObject({ processorId: term, legalName: declaration, contracts: z.array(contractSchema).min(1).max(64) });
const purposeSchema = z.strictObject({ purposeId: term, allowedDataClasses: classes, allowedTools: terms, allowedProcessors: terms });
const bindingSchema = z.strictObject({ providerId: term,
  baseUrl: z.string().refine(value => normalizeProcessorRouteBaseUrl(value) !== null).transform(value => normalizeProcessorRouteBaseUrl(value)!),
  processorId: term, purposeId: term });

export const processorRegistrySchema = z.strictObject({ schemaVersion: z.literal("amc.dataflow-processors/v1"), experimental: z.literal(true),
  processors: z.array(processorSchema).max(256), purposes: z.array(purposeSchema).max(256), bindings: z.array(bindingSchema).max(1024)
}).superRefine((registry, context) => {
  const processorIds = registry.processors.map(row => row.processorId);
  const purposeIds = registry.purposes.map(row => row.purposeId);
  const bindings = registry.bindings.map(row => canonicalize([row.providerId, row.baseUrl]));
  for (const [field, ids] of [["processors", processorIds], ["purposes", purposeIds], ["bindings", bindings]] as const) {
    if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: [field], message: "duplicate identity or route binding" });
  }
  for (const purpose of registry.purposes) {
    if (purpose.allowedProcessors.some(id => !processorIds.includes(id)))
      context.addIssue({ code: "custom", path: ["purposes"], message: "unknown processor reference" });
  }
  for (const binding of registry.bindings) {
    if (!processorIds.includes(binding.processorId) || !purposeIds.includes(binding.purposeId))
      context.addIssue({ code: "custom", path: ["bindings"], message: "unknown operator binding reference" });
  }
});

const signatureSchema = z.strictObject({ digestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z.string().min(1).max(1024).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  signedTs: z.number().int().nonnegative().refine(Number.isSafeInteger), signer: z.literal("auditor") });

class ProcessorRegistryError extends Error {
  constructor(reason: "workspace_invalid" | "owner_required" | "registry_unreadable" | "schema_invalid" | "registry_exists" | "signing_failed") {
    super(`Processor registry refused: ${reason}`);
    this.name = "ProcessorRegistryError";
  }
}

function requireOwnerMode(workspace: string): void {
  try {
    if (getMode(workspace) === "owner") return;
  } catch { /* Only a static refusal is exposed. */ }
  throw new ProcessorRegistryError("owner_required");
}

function workspacePath(workspace: string): string {
  if (typeof workspace !== "string" || !workspace.trim()) throw new ProcessorRegistryError("workspace_invalid");
  return resolve(workspace);
}

export const processorRegistryPath = (workspace: string): string => join(workspacePath(workspace), ".amc", "dataflow", "processors.yaml");
export const processorRegistrySigPath = (workspace: string): string => `${processorRegistryPath(workspace)}.sig`;

function readBounded(path: string, max: number): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > max) throw new ProcessorRegistryError("registry_unreadable");
    const bytes = Buffer.alloc(max + 1);
    let size = 0;
    while (size < bytes.length) {
      const count = readSync(fd, bytes, size, bytes.length - size, null);
      if (count === 0) break;
      size += count;
    }
    if (size > max) throw new ProcessorRegistryError("registry_unreadable");
    return bytes.subarray(0, size);
  } finally { closeSync(fd); }
}

function present(path: string): boolean {
  try { lstatSync(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}

function parse(bytes: Buffer): ProcessorRegistryV1 {
  return freeze(processorRegistrySchema.parse(YAML.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    { maxAliasCount: 0, uniqueKeys: true })));
}

/** Missing, unsigned, broken, or ambiguous data never supplies protected-request permission. */
export function loadProcessorRegistrySnapshot(workspace: string): ProcessorRegistrySnapshot {
  let path: string;
  let sigPath: string;
  try { path = processorRegistryPath(workspace); sigPath = processorRegistrySigPath(workspace); }
  catch { return freeze({ state: "invalid", reason: "workspace_invalid" }); }
  let bytes: Buffer;
  try {
    if (!present(path)) return freeze(present(sigPath) ? { state: "invalid", reason: "registry_unreadable" } : { state: "missing" });
    bytes = readBounded(path, MAX_REGISTRY_BYTES);
    if (!present(sigPath)) return freeze({ state: "invalid", reason: "signature_missing" });
  } catch { return freeze({ state: "invalid", reason: "registry_unreadable" }); }
  const digestSha256 = sha256Hex(bytes);
  try {
    const signature = signatureSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(readBounded(sigPath, MAX_SIGNATURE_BYTES))));
    if (signature.digestSha256 !== digestSha256 || !verifyHexDigestAny(digestSha256, signature.signature, getPublicKeyHistory(workspace, "auditor")))
      return freeze({ state: "invalid", reason: "signature_invalid" });
  } catch { return freeze({ state: "invalid", reason: "signature_invalid" }); }
  try { return freeze({ state: "verified", digestSha256, registry: parse(bytes) }); }
  catch { return freeze({ state: "invalid", reason: "schema_invalid" }); }
}

/** Owner mode and the auditor key endorse only these bytes, not contractual truth or legal sufficiency. */
export function signProcessorRegistry(workspace: string): string {
  const root = workspacePath(workspace);
  requireOwnerMode(root);
  try {
    const bytes = readBounded(processorRegistryPath(root), MAX_REGISTRY_BYTES);
    parse(bytes);
    const digestSha256 = sha256Hex(bytes);
    const sigPath = processorRegistrySigPath(root);
    writeFileAtomic(sigPath, canonicalize({ digestSha256, signature: signHexDigest(digestSha256, getPrivateKeyPem(root, "auditor")),
      signedTs: Date.now(), signer: "auditor" }), 0o600);
    return sigPath;
  } catch { throw new ProcessorRegistryError("signing_failed"); }
}

/** Creates a new experimental registry; existing authored bytes or signatures are retained. */
export function initProcessorRegistry(workspace: string, registry: ProcessorRegistryV1): { path: string; sigPath: string } {
  const root = workspacePath(workspace);
  requireOwnerMode(root);
  const path = processorRegistryPath(root);
  const sigPath = processorRegistrySigPath(root);
  try {
    if (present(path) || present(sigPath)) throw new ProcessorRegistryError("registry_exists");
    const parsed = processorRegistrySchema.safeParse(registry);
    if (!parsed.success) throw new ProcessorRegistryError("schema_invalid");
    const bytes = YAML.stringify(parsed.data);
    if (Buffer.byteLength(bytes) > MAX_REGISTRY_BYTES) throw new ProcessorRegistryError("registry_unreadable");
    writeFileAtomic(path, bytes, 0o600);
    return { path, sigPath: signProcessorRegistry(root) };
  } catch (error) {
    if (error instanceof ProcessorRegistryError) throw error;
    throw new ProcessorRegistryError("registry_unreadable");
  }
}
