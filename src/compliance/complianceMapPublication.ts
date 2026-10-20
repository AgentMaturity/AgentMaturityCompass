import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { writeFileAtomic } from "../utils/fs.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { signDigestWithPolicy } from "../crypto/signing/signer.js";
import { sha256Hex } from "../utils/hash.js";
import { prepareFileSignatureWithAuditor } from "../org/orgSigner.js";
import { complianceMapsSchema, type ComplianceMapsFile } from "./mappingSchema.js";
import { defaultComplianceMapsFile } from "./builtInMappings.js";

export const complianceMapsPath = (workspace: string): string => join(workspace, ".amc", "compliance-maps.yaml");
interface FileState { bytes: Buffer; mode: number }
function read(path: string): FileState | null {
  try { return { bytes: readFileSync(path), mode: statSync(path).mode & 0o777 }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export function readComplianceMapsPair(path: string): { body: FileState | null; sidecar: FileState | null } {
  return { body: read(path), sidecar: read(`${path}.sig`) };
}
const equal = (a: FileState | null, b: FileState | null) => a === null ? b === null : b !== null && a.mode === b.mode && a.bytes.equals(b.bytes);
export interface ComplianceMapsPublicationOptions { beforePublish?: () => void }
export class ComplianceMapsPublicationError extends Error {
  readonly code = "COMPLIANCE_MAPS_PARTIAL";
  constructor(readonly publishedPaths: readonly string[], cause: unknown) {
    super("compliance maps publication is incomplete; inspect the published pair before retrying", { cause }); this.name = "ComplianceMapsPublicationError";
  }
}
function prepare(workspace: string, file: ComplianceMapsFile | undefined, options: ComplianceMapsPublicationOptions) {
  const beforePublish = options.beforePublish; beforePublish?.();
  const path = complianceMapsPath(workspace), previous = readComplianceMapsPair(path);
  // Parse/copy and serialize once, before the first await. Preserve existing YAML bytes/defaults.
  const bytes = Buffer.from(YAML.stringify(complianceMapsSchema.parse(file ?? defaultComplianceMapsFile())));
  return { workspace, path, previous, bytes, beforePublish };
}
function publish(plan: ReturnType<typeof prepare>, signatureBytes: string, assertCurrent: () => void) {
  return withControlFileLock({ root: join(plan.workspace, ".amc"), name: "compliance-maps-pair", operation: () => {
    plan.beforePublish?.(); assertCurrent();
    const current = readComplianceMapsPair(plan.path);
    if (!equal(current.body, plan.previous.body) || !equal(current.sidecar, plan.previous.sidecar)) throw new Error("compliance maps pair changed while signing; retry");
    const published: string[] = [];
    try {
      writeFileAtomic(plan.path, plan.bytes, 0o644); published.push(".amc/compliance-maps.yaml");
      writeFileAtomic(`${plan.path}.sig`, signatureBytes, 0o644); published.push(".amc/compliance-maps.yaml.sig");
    } catch (error) { if (published.length > 0) throw new ComplianceMapsPublicationError(Object.freeze([...published]), error); throw error; }
    return { path: plan.path, sigPath: `${plan.path}.sig` };
  } });
}
/** Existing synchronous SDK compatibility; signature refusal occurs before either member is replaced. */
export function publishComplianceMaps(workspace: string, file?: ComplianceMapsFile): { path: string; sigPath: string } {
  const plan = prepare(workspace, file, {}), signed = signDigestWithPolicy({ workspace, kind: "COMPLIANCE_MAPS", digestHex: sha256Hex(plan.bytes) });
  const signatureBytes = JSON.stringify({ digestSha256: signed.digestSha256, signature: signed.signature, signedTs: signed.signedTs,
    signer: "auditor", envelope: signed.envelope }, null, 2);
  return publish(plan, signatureBytes, () => {});
}
export async function publishComplianceMapsAsync(workspace: string, file?: ComplianceMapsFile, options: ComplianceMapsPublicationOptions = {}): Promise<{ path: string; sigPath: string }> {
  const plan = prepare(workspace, file, options);
  const prepared = await prepareFileSignatureWithAuditor(workspace, plan.path, plan.bytes, "COMPLIANCE_MAPS");
  return publish(plan, prepared.signatureBytes, prepared.assertCurrent);
}
