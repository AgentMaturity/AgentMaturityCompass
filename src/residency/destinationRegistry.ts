import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { isIP } from "node:net";
import { realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { parseDeploymentProfile } from "../catalog/compiler/compile.js";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { assertOwnerMode } from "../mode/mode.js";
import { writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { EGRESS_CHANNELS, type DestinationRegistrySnapshot, type DestinationRegistryV1 } from "./types.js";

const MAX_REGISTRY_BYTES = 1_048_576;
const term = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const terms = z.array(term).min(1).max(128).refine(values => new Set(values).size === values.length);
const declaration = z.string().min(1).max(512).refine(value => value === value.trim() && !/[\r\n\x00]/.test(value));
const safeUrl = (raw: string): boolean => {
  try { const url = new URL(raw); return raw.length <= 4096 && /^https?:\/\//.test(raw) && ["https:", "http:"].includes(url.protocol)
    && !url.username && !url.password && !raw.includes("#") && !raw.split(/[/?#]/, 3)[2]?.includes("@"); } catch { return false; }
};
const validHost = (raw: string): boolean => {
  const host = raw.startsWith("*.") ? raw.slice(2) : raw;
  if (raw !== raw.toLowerCase() || raw.length > 253 || host.endsWith(".")) return false;
  const ip = isIP(host.replace(/^\[|\]$/g, ""));
  if (raw.startsWith("*.")) return !ip && host.includes(".") && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(host);
  try { return new URL(`https://${host}`).hostname === host && (ip > 0 || /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(host)); } catch { return false; }
};
const validPrefix = (path: string): boolean => {
  try { return path.startsWith("/") && !path.startsWith("//") && path.length <= 2048 && !/[?#\\]/.test(path)
    && !/%(?:2e|2f|5c)/i.test(path) && new URL(path, "https://residency.invalid").pathname === path; } catch { return false; }
};
const profileSchema = z.strictObject({ path: z.string().min(1).max(1024).refine(path => !isAbsolute(path) && !/[\\\x00]/.test(path)
  && !path.split("/").includes("..")), storageUrl: z.string().refine(safeUrl) });
const destinationSchema = z.strictObject({ destinationId: term,
  match: z.strictObject({ hosts: z.array(z.string().refine(validHost)).min(1).max(128), pathPrefixes: z.array(z.string().refine(validPrefix)).min(1).max(128).optional() }),
  channels: z.array(z.enum(EGRESS_CHANNELS)).min(1).max(EGRESS_CHANNELS.length),
  region: z.strictObject({ jurisdiction: term, code: term }).nullable(),
  transferBasis: z.strictObject({ kind: term, reference: declaration, reviewedBy: declaration }).nullable() });
const ruleSchema = z.strictObject({ ruleId: term, controlId: term,
  appliesTo: z.strictObject({ dataClasses: terms, jurisdictions: terms }), allowedJurisdictions: terms, acceptsTransferBasis: z.boolean() });
export const destinationRegistrySchema = z.strictObject({ schemaVersion: z.literal("amc.residency-destinations/v1"), profile: profileSchema.nullable(),
  destinations: z.array(destinationSchema).max(1024), rules: z.array(ruleSchema).max(1024) }).superRefine((registry, context) => {
  for (const [field, ids] of [["destinations", registry.destinations.map(row => row.destinationId)], ["rules", registry.rules.map(row => row.ruleId)]] as const)
    if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: [field], message: "duplicate id" });
});
const signatureSchema = z.strictObject({ digestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z.string().min(1).max(1024).regex(/^[A-Za-z0-9+/]+={0,2}$/), signedTs: z.number().int().nonnegative().refine(Number.isSafeInteger), signer: z.literal("auditor") });
export const destinationRegistryPath = (workspace: string): string => join(resolve(workspace), ".amc", "residency", "destinations.yaml");
export const destinationRegistrySigPath = (workspace: string): string => `${destinationRegistryPath(workspace)}.sig`;
function readBounded(path: string, max: number): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { const stat = fstatSync(fd); if (!stat.isFile() || stat.size > max) throw new Error("registry_unreadable");
    const bytes = Buffer.alloc(max + 1); let size = 0;
    while (size < bytes.length) { const count = readSync(fd, bytes, size, bytes.length - size, null); if (count === 0) break; size += count; }
    if (size > max) throw new Error("registry_unreadable"); return bytes.subarray(0, size);
  } finally { closeSync(fd); }
}
const present = (path: string): boolean => { try { lstatSync(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; } };
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
}
function parse(bytes: Buffer): DestinationRegistryV1 {
  return freeze(destinationRegistrySchema.parse(YAML.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes), { maxAliasCount: 0, uniqueKeys: true })));
}
/** Loads no duplicate facts: the strict, normalized profile must match the active plan's exact profile digest. */
export function loadPinnedResidencyProfile(workspace: string, registry: DestinationRegistryV1, expectedSha256: string) {
  if (!registry.profile || !/^[a-f0-9]{64}$/.test(expectedSha256)) throw new Error("profile_unverifiable");
  try {
    const root = realpathSync(resolve(workspace)), path = realpathSync(resolve(root, registry.profile.path)), within = relative(root, path);
    if (within === ".." || within.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(within)) throw new Error();
    const bytes = readBounded(path, MAX_REGISTRY_BYTES);
    const profile = parseDeploymentProfile(YAML.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes), { maxAliasCount: 0, uniqueKeys: true }));
    if (sha256Hex(canonicalize(profile)) !== expectedSha256) throw new Error();
    return freeze({ dataClasses: profile.dataClasses.value, jurisdictions: profile.jurisdictions.value, storageUrl: registry.profile.storageUrl });
  } catch { throw new Error("profile_unverifiable"); }
}
/** Verifies and parses one bounded byte snapshot. A present broken registry never becomes a missing registry. */
export function loadDestinationRegistrySnapshot(workspace: string): DestinationRegistrySnapshot {
  const path = destinationRegistryPath(workspace), sigPath = destinationRegistrySigPath(workspace);
  let bytes: Buffer;
  try {
    if (!present(path)) return freeze(present(sigPath) ? { state: "invalid", reason: "registry_unreadable" } : { state: "missing" });
    bytes = readBounded(path, MAX_REGISTRY_BYTES);
    if (!present(sigPath)) return freeze({ state: "invalid", reason: "signature_missing" });
  } catch { return freeze({ state: "invalid", reason: "registry_unreadable" }); }
  const digestSha256 = sha256Hex(bytes);
  try {
    const signature = signatureSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(readBounded(sigPath, 16_384))));
    if (signature.digestSha256 !== digestSha256 || !verifyHexDigestAny(digestSha256, signature.signature, getPublicKeyHistory(workspace, "auditor"))) return freeze({ state: "invalid", reason: "signature_invalid" });
  } catch { return freeze({ state: "invalid", reason: "signature_invalid" }); }
  try { return freeze({ state: "verified", digestSha256, registry: parse(bytes) }); }
  catch { return freeze({ state: "invalid", reason: "schema_invalid" }); }
}
/** Owner signing endorses registry bytes, not the truth or legal sufficiency of their declarations. */
export function signDestinationRegistry(workspace: string): string {
  assertOwnerMode(workspace, "residency sign");
  const bytes = readBounded(destinationRegistryPath(workspace), MAX_REGISTRY_BYTES); parse(bytes);
  const digestSha256 = sha256Hex(bytes), path = destinationRegistrySigPath(workspace);
  writeFileAtomic(path, JSON.stringify({ digestSha256, signature: signHexDigest(digestSha256, getPrivateKeyPem(workspace, "auditor")),
    signedTs: Date.now(), signer: "auditor" }), 0o600);
  return path;
}
export function initDestinationRegistry(workspace: string, registry: DestinationRegistryV1): { path: string; sigPath: string } {
  assertOwnerMode(workspace, "residency init");
  const parsed = destinationRegistrySchema.parse(registry), path = destinationRegistryPath(workspace), bytes = YAML.stringify(parsed);
  if (Buffer.byteLength(bytes) > MAX_REGISTRY_BYTES) throw new Error("registry_unreadable");
  writeFileAtomic(path, bytes, 0o600); return { path, sigPath: signDestinationRegistry(workspace) };
}
