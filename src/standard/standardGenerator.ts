import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { verifySignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";
import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { signFileWithAuditor, signSerializedPayloadWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { benchArtifactSchema } from "../bench/benchSchema.js";
import { benchRegistryIndexSchema } from "../bench/benchRegistrySchema.js";
import { promptPackSchema } from "../prompt/promptPackSchema.js";
import { assuranceCertSchema } from "../assurance/assuranceSchema.js";
import { binderJsonSchema } from "../audit/binderSchema.js";
import { passportJsonSchema } from "../passport/passportSchema.js";
import { inspectBenchArtifact } from "../bench/benchArtifact.js";
import { inspectPromptPackArtifact } from "../prompt/promptPackArtifact.js";
import { verifyAssuranceCertificateFile } from "../assurance/assuranceVerifier.js";
import { verifyAuditBinderFile } from "../audit/binderVerifier.js";
import { inspectPassportArtifact } from "../passport/passportArtifact.js";
import {
  STANDARD_SCHEMA_NAMES,
  standardBundleSignatureSchema,
  standardMetaSchema,
  standardSchemaNameSchema
} from "./standardSchema.js";
import {
  ensureStandardDirs,
  standardBundleSigPath,
  standardMetaPath,
  standardMetaSigPath,
  standardRoot,
  standardSchemasDir
} from "./standardRegistry.js";

type SchemaName = (typeof STANDARD_SCHEMA_NAMES)[number];

function schemaByName(name: SchemaName): Record<string, unknown> {
  const common = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    additionalProperties: true
  };
  if (name === "amcbench.schema.json") {
    return {
      ...common,
      title: "AMC Bench Artifact",
      type: "object",
      required: ["v", "benchId", "generatedTs", "scope", "evidence", "metrics", "proofBindings"]
    };
  }
  if (name === "amcprompt.schema.json") {
    return {
      ...common,
      title: "AMC Prompt Pack",
      type: "object",
      required: ["v", "packId", "generatedTs", "templateId", "agent", "bindings", "northstar"]
    };
  }
  if (name === "amccert.schema.json") {
    return {
      ...common,
      title: "AMC Assurance Certificate",
      type: "object",
      required: ["v", "certId", "issuedTs", "scope", "runId", "status", "gates", "bindings", "proofBindings"]
    };
  }
  if (name === "amcaudit.schema.json") {
    return {
      ...common,
      title: "AMC Audit Binder",
      type: "object",
      required: ["v", "binderId", "generatedTs", "scope", "trust", "sections", "proofBindings"]
    };
  }
  if (name === "amcpass.schema.json") {
    return {
      ...common,
      title: "AMC Passport",
      type: "object",
      required: [
        "v",
        "passportId",
        "generatedTs",
        "scope",
        "trust",
        "status",
        "maturity",
        "strategyFailureRisks",
        "valueDimensions",
        "checkpoints",
        "governanceSummary",
        "bindings",
        "proofBindings"
      ]
    };
  }
  if (name === "registry.bench.schema.json") {
    return {
      ...common,
      title: "AMC Bench Registry Index",
      type: "object",
      required: ["v", "registry", "benches"]
    };
  }
  return {
    ...common,
    title: "AMC Passport Registry Index",
    type: "object",
    required: ["v", "registry", "passports"]
  };
}

function schemaFilePath(workspace: string, name: SchemaName): string {
  return join(standardSchemasDir(workspace), name);
}

function schemaManifest(workspace: string) {
  const schemas = STANDARD_SCHEMA_NAMES.map((name) => ({
    name,
    sha256: pathExists(schemaFilePath(workspace, name))
      ? sha256Hex(readUtf8(schemaFilePath(workspace, name)))
      : "0".repeat(64)
  }));
  return standardMetaSchema.parse({
    v: 1,
    generatedTs: Date.now(),
    schemas
  });
}

function schemaManifestDigest(meta: ReturnType<typeof standardMetaSchema.parse>): string {
  return sha256Hex(Buffer.from(canonicalize({
    v: meta.v,
    schemas: meta.schemas
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((row) => ({ name: row.name, sha256: row.sha256 }))
  }), "utf8"));
}

function resolveSchemaName(id: string): SchemaName {
  const normalized = id.endsWith(".schema.json") ? id : `${id}.schema.json`;
  return standardSchemaNameSchema.parse(normalized);
}

function validateSchemaPayload(name: SchemaName, payload: unknown): void {
  if (name === "amcbench.schema.json") {
    benchArtifactSchema.parse(payload);
    return;
  }
  if (name === "amcprompt.schema.json") {
    promptPackSchema.parse(payload);
    return;
  }
  if (name === "amccert.schema.json") {
    assuranceCertSchema.parse(payload);
    return;
  }
  if (name === "amcaudit.schema.json") {
    binderJsonSchema.parse(payload);
    return;
  }
  if (name === "amcpass.schema.json") {
    passportJsonSchema.parse(payload);
    return;
  }
  if (name === "registry.bench.schema.json") {
    benchRegistryIndexSchema.parse(payload);
    return;
  }
  // registry.passport.schema.json - lightweight local schema.
  if (!payload || typeof payload !== "object") {
    throw new Error("registry passport payload must be an object");
  }
  const row = payload as Record<string, unknown>;
  if (row.v !== 1 || typeof row.registry !== "object" || !Array.isArray(row.passports)) {
    throw new Error("registry passport payload missing required keys");
  }
}

function extractPayloadForValidation(name: SchemaName, file: string): unknown {
  const resolved = resolve(file);
  if (name === "amcbench.schema.json" && resolved.endsWith(".amcbench")) {
    return inspectBenchArtifact(resolved).bench;
  }
  if (name === "amcprompt.schema.json" && resolved.endsWith(".amcprompt")) {
    return inspectPromptPackArtifact(resolved).pack;
  }
  if (name === "amccert.schema.json" && resolved.endsWith(".amccert")) {
    const verify = verifyAssuranceCertificateFile({ file: resolved });
    if (!verify.ok || !verify.cert) {
      throw new Error(`certificate verification failed: ${verify.errors.join("; ")}`);
    }
    return verify.cert;
  }
  if (name === "amcaudit.schema.json" && resolved.endsWith(".amcaudit")) {
    const verify = verifyAuditBinderFile({ file: resolved });
    if (!verify.ok || !verify.binder) {
      throw new Error(`audit binder verification failed: ${verify.errors.map((row) => row.message).join("; ")}`);
    }
    return verify.binder;
  }
  if (name === "amcpass.schema.json" && resolved.endsWith(".amcpass")) {
    return inspectPassportArtifact(resolved).passport;
  }
  return JSON.parse(readUtf8(resolved)) as unknown;
}

export function generateStandardSchemas(workspace: string): {
  root: string;
  schemasDir: string;
  metaPath: string;
  metaSigPath: string;
  schemasSigPath: string;
  schemaNames: SchemaName[];
} {
  ensureStandardDirs(workspace);
  const schemasDir = standardSchemasDir(workspace);
  for (const name of STANDARD_SCHEMA_NAMES) {
    const path = schemaFilePath(workspace, name);
    ensureDir(join(path, ".."));
    writeFileAtomic(path, `${canonicalize(schemaByName(name))}\n`, 0o644);
  }
  const meta = schemaManifest(workspace);
  const metaPath = standardMetaPath(workspace);
  writeFileAtomic(metaPath, `${canonicalize(meta)}\n`, 0o644);
  const metaSigPath = signFileWithAuditor(workspace, metaPath);

  const digest = schemaManifestDigest(meta);
  const bundleSig = standardBundleSignatureSchema.parse(signSerializedPayloadWithAuditor(workspace, digest));
  const schemasSigPath = standardBundleSigPath(workspace);
  writeFileAtomic(schemasSigPath, `${canonicalize(bundleSig)}\n`, 0o644);

  return {
    root: standardRoot(workspace),
    schemasDir,
    metaPath,
    metaSigPath,
    schemasSigPath,
    schemaNames: [...STANDARD_SCHEMA_NAMES]
  };
}

export function verifyStandardSchemas(workspace: string): {
  ok: boolean;
  errors: string[];
  meta: ReturnType<typeof standardMetaSchema.parse> | null;
} {
  const errors: string[] = [];
  const metaPath = standardMetaPath(workspace);
  if (!pathExists(metaPath)) {
    errors.push("meta.json missing");
    return { ok: false, errors, meta: null };
  }
  const metaSig = verifySignedFileWithAuditor(workspace, metaPath);
  if (!metaSig.valid) {
    errors.push(`meta signature invalid: ${metaSig.reason ?? "unknown"}`);
  }
  const meta = standardMetaSchema.parse(JSON.parse(readUtf8(metaPath)) as unknown);

  for (const row of meta.schemas) {
    const path = schemaFilePath(workspace, row.name);
    if (!pathExists(path)) {
      errors.push(`schema missing: ${row.name}`);
      continue;
    }
    const sha = sha256Hex(readUtf8(path));
    if (sha !== row.sha256) {
      errors.push(`schema digest mismatch: ${row.name}`);
    }
  }

  const bundleSigPath = standardBundleSigPath(workspace);
  if (!pathExists(bundleSigPath)) {
    errors.push("schemas.sig missing");
    return {
      ok: false,
      errors,
      meta
    };
  }
  const bundleSig = standardBundleSignatureSchema.parse(JSON.parse(readUtf8(bundleSigPath)) as unknown);
  const digest = schemaManifestDigest(meta);
  const bundleSignedDigest = sha256Hex(Buffer.from(digest, "utf8"));
  if (bundleSig.digestSha256 !== bundleSignedDigest) {
    errors.push("schemas.sig digest mismatch");
  }
  let bundleOk = false;
  if (bundleSig.envelope) {
    try {
      bundleOk =
        bundleSig.signature === bundleSig.envelope.sigB64 &&
        verifySignatureEnvelope(bundleSignedDigest, bundleSig.envelope, {
          trustedPublicKeys: getPublicKeyHistory(workspace, "auditor"),
          requireTrustedKey: true
        });
    } catch {
      bundleOk = false;
    }
  } else {
    bundleOk = verifyHexDigestAny(bundleSignedDigest, bundleSig.signature, getPublicKeyHistory(workspace, "auditor"));
  }
  if (!bundleOk) {
    errors.push("schemas.sig signature verification failed");
  }

  return {
    ok: errors.length === 0,
    errors,
    meta
  };
}

export function listStandardSchemas(workspace: string): Array<{ name: SchemaName; sha256: string }> {
  const dir = standardSchemasDir(workspace);
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name): name is SchemaName => (STANDARD_SCHEMA_NAMES as readonly string[]).includes(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      sha256: sha256Hex(readUtf8(join(dir, name)))
    }));
}

export function readStandardSchema(workspace: string, id: string): {
  name: SchemaName;
  schema: Record<string, unknown>;
} {
  const name = resolveSchemaName(id);
  const path = schemaFilePath(workspace, name);
  if (!pathExists(path)) {
    throw new Error(`schema not generated: ${name}`);
  }
  return {
    name,
    schema: JSON.parse(readUtf8(path)) as Record<string, unknown>
  };
}

export function validateWithStandard(params: {
  workspace: string;
  schemaId: string;
  file: string;
}): {
  ok: boolean;
  schemaName: SchemaName;
  errors: string[];
} {
  const schemaName = resolveSchemaName(params.schemaId);
  const errors: string[] = [];
  try {
    const payload = extractPayloadForValidation(schemaName, params.file);
    validateSchemaPayload(schemaName, payload);
  } catch (error) {
    errors.push(String(error));
  }
  return {
    ok: errors.length === 0,
    schemaName,
    errors
  };
}
