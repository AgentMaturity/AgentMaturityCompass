import { dirname, join, relative } from "node:path";
import { captureOrgFiles, assertOrgPairsCurrent, orgPairBytes, captureOrgPairsAuthority, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { prepareFileSignatureWithAuditor } from "../org/orgSigner.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { signDigestWithPolicy } from "../crypto/signing/signer.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { standardSchemaBytes, standardManifestDigest, type generateStandardSchemas } from "./standardGenerator.js";
import { STANDARD_SCHEMA_NAMES, standardMetaSchema, standardBundleSignatureSchema } from "./standardSchema.js";
import { standardRoot, standardSchemasDir, standardMetaPath, standardMetaSigPath, standardBundleSigPath } from "./standardRegistry.js";

export class StandardPublicationError extends Error {
  readonly code = "STANDARD_PUBLICATION_INCOMPLETE";
  constructor(readonly completedPaths: readonly string[], readonly attemptedPath: string | null, readonly phase: "files" | "log", cause: unknown,
    readonly completedLogHashes: readonly string[] = []) {
    super("standard publication did not complete; acknowledged schema and log effects are retained", { cause });
    this.name = "StandardPublicationError";
  }
}
function standardPlan(workspace: string) {
  const names = [...STANDARD_SCHEMA_NAMES], schemas = names.map(name => ({ path: join(standardSchemasDir(workspace), name), bytes: Buffer.from(standardSchemaBytes(name)) }));
  const meta = standardMetaSchema.parse({ v: 1, generatedTs: Date.now(), schemas: schemas.map((row, index) => ({ name: names[index]!, sha256: sha256Hex(row.bytes) })) });
  const metaPath = standardMetaPath(workspace), metaSigPath = standardMetaSigPath(workspace), schemasSigPath = standardBundleSigPath(workspace);
  const metaBytes = Buffer.from(`${canonicalize(meta)}\n`), digestText = Buffer.from(standardManifestDigest(meta), "utf8");
  const paths = [...schemas.map(row => row.path), metaPath, metaSigPath, schemasSigPath], before = captureOrgFiles(paths);
  const generated: ReturnType<typeof generateStandardSchemas> = { root: standardRoot(workspace), schemasDir: standardSchemasDir(workspace), metaPath, metaSigPath, schemasSigPath, schemaNames: names };
  return { workspace, schemas, metaPath, metaSigPath, schemasSigPath, metaBytes, digestText, paths, before, generated };
}
function standardWrites(plan: ReturnType<typeof standardPlan>, metaSignature: string, bundleSignature: string) {
  const bundle = standardBundleSignatureSchema.parse(JSON.parse(bundleSignature) as unknown);
  return [...plan.schemas, { path: plan.metaPath, bytes: plan.metaBytes }, { path: plan.metaSigPath, bytes: Buffer.from(metaSignature) },
    { path: plan.schemasSigPath, bytes: Buffer.from(`${canonicalize(bundle)}\n`) }];
}
function publish(plan: ReturnType<typeof standardPlan>, writes: ReturnType<typeof standardWrites>, current: () => void) {
  return withControlFileLock({ root: standardRoot(plan.workspace), name: "standard-publication", operation: () => {
    current(); assertOrgPairsCurrent(plan.before);
    const completed: string[] = []; let attempted: string | null = null;
    try {
      for (const row of writes) { attempted = relative(plan.workspace, row.path); ensureDir(dirname(row.path)); writeFileAtomic(row.path, row.bytes, 0o644); completed.push(attempted); }
      const published = captureOrgFiles(plan.paths);
      for (const row of writes) { const actual = orgPairBytes(published, row.path);
        if (actual === null || !actual.equals(row.bytes) || published.members.find(member => member.path === row.path)!.mode !== 0o644) throw new Error("published standard member changed"); }
      return published;
    } catch (cause) { throw new StandardPublicationError(Object.freeze([...completed]), attempted, "files", cause); }
  } });
}
/** Both compatibility and awaited writers cooperate on the same short publication lock; neither signs under it. */
export function generateStandardSchemasSync(workspace: string): ReturnType<typeof generateStandardSchemas> {
  const plan = standardPlan(workspace);
  const sign = (bytes: Buffer) => {
    const signed = signDigestWithPolicy({ workspace, kind: "BUNDLE", digestHex: sha256Hex(bytes) });
    return JSON.stringify({ digestSha256: signed.digestSha256, signature: signed.signature, signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope }, null, 2);
  };
  const meta = sign(plan.metaBytes), bundle = sign(plan.digestText);
  publish(plan, standardWrites(plan, meta, bundle), () => {
    if (!verifyAuditorSignatureBytes(workspace, "BUNDLE", plan.metaBytes, Buffer.from(meta)).valid
      || !verifyAuditorSignatureBytes(workspace, "BUNDLE", plan.digestText, Buffer.from(bundle)).valid) throw new Error("prepared standard signature is not admitted by current BUNDLE authority");
  });
  return plan.generated;
}
/** Prepare both existing BUNDLE recipes before replacing any generated schema/meta/signature member. */
export async function prepareStandardSchemasAsync(workspace: string, options: OrgPairsOptions = {}) {
  const original = captureOrgPairsAuthority(workspace, options.beforePublish), inputs = options.assertInputsCurrent, plan = standardPlan(workspace);
  const preSign = () => { inputs?.(); original(); assertOrgPairsCurrent(plan.before); };
  const signedMeta = await prepareFileSignatureWithAuditor(workspace, plan.metaPath, plan.metaBytes, "BUNDLE", preSign);
  const beforeBundleSign = () => { preSign(); signedMeta.assertCurrent(); };
  beforeBundleSign();
  // Preserve SHA256(UTF8(manifest-digest-hex)), not the raw manifest digest, for schemas.sig.
  const signedBundle = await prepareFileSignatureWithAuditor(workspace, plan.schemasSigPath, plan.digestText, "BUNDLE", beforeBundleSign);
  const writes = standardWrites(plan, signedMeta.signatureBytes, signedBundle.signatureBytes);
  let published: ReturnType<typeof captureOrgFiles> | null = null;
  const assertCurrent = () => { inputs?.(); original(); signedMeta.assertCurrent(); signedBundle.assertCurrent(); if (published !== null) assertOrgPairsCurrent(published); };
  return { generated: plan.generated, assertCurrent, publish() { published = publish(plan, writes, assertCurrent); return plan.generated; } };
}
