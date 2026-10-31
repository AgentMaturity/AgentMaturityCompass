import { join, relative } from "node:path";
import type { OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { captureWorkspaceLogAuthority, appendTransparencyEntryAsync } from "../transparency/asyncWorkspaceAppend.js";
import { prepareStandardSchemasAsync, StandardPublicationError } from "./standardPublication.js";
import { captureStandardVerification } from "./standardVerification.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  generateStandardSchemas,
  listStandardSchemas,
  readStandardSchema,
  validateWithStandard,
  verifyStandardSchemas
} from "./standardGenerator.js";
import { standardMetaSchema, standardSchemaNameSchema } from "./standardSchema.js";

type StandardSchemaName = ReturnType<typeof standardSchemaNameSchema.parse>;

export function standardGenerateForApi(workspace: string) {
  const generated = generateStandardSchemas(workspace);
  const entry = appendTransparencyEntry({
    workspace,
    type: "STANDARD_SCHEMAS_GENERATED",
    agentId: "workspace",
    artifact: {
      kind: "policy",
      sha256: sha256Hex(Buffer.from(canonicalize({
        root: generated.root,
        schemasDir: generated.schemasDir,
        metaPath: generated.metaPath,
        metaSigPath: generated.metaSigPath,
        schemasSigPath: generated.schemasSigPath,
        schemaNames: generated.schemaNames
      }), "utf8")),
      id: "standard-schemas"
    }
  });
  return {
    ...generated,
    transparencyHash: entry.hash
  };
}

export function standardVerifyForApi(workspace: string) {
  const verified = verifyStandardSchemas(workspace);
  const entry = appendTransparencyEntry({
    workspace,
    type: "STANDARD_SCHEMAS_VERIFIED",
    agentId: "workspace",
    artifact: {
      kind: "policy",
      sha256: sha256Hex(Buffer.from(canonicalize({
        ok: verified.ok,
        errors: verified.errors,
        meta: verified.meta
      }), "utf8")),
      id: "standard-schemas-verify"
    }
  });
  return {
    ...verified,
    transparencyHash: entry.hash
  };
}

export function standardSchemasForApi(workspace: string): {
  schemas: Array<{ name: StandardSchemaName; sha256: string }>;
  meta: ReturnType<typeof standardMetaSchema.parse> | null;
  verify: ReturnType<typeof verifyStandardSchemas>;
} {
  const verify = verifyStandardSchemas(workspace);
  return {
    schemas: listStandardSchemas(workspace),
    meta: verify.meta,
    verify
  };
}

export function standardSchemaReadForApi(workspace: string, id: string): {
  name: StandardSchemaName;
  schema: Record<string, unknown>;
} {
  return readStandardSchema(workspace, id);
}

export function standardValidateForApi(params: {
  workspace: string;
  schemaId: string;
  file: string;
}) {
  return validateWithStandard(params);
}

/** Maintained provider path; retain the original log authority before either bundle Sign. */
export async function standardGenerateForApiAsync(workspace: string, options: OrgPairsOptions = {}) {
  const beforePublish = options.beforePublish, assertInputsCurrent = options.assertInputsCurrent;
  const log = captureWorkspaceLogAuthority(workspace, beforePublish);
  const plan = await prepareStandardSchemasAsync(workspace, { assertInputsCurrent, beforePublish: () => log.assertCurrent() });
  const generated = plan.publish(), completedLogs: string[] = [];
  try {
    const entry = await appendTransparencyEntryAsync({ workspace, type: "STANDARD_SCHEMAS_GENERATED", agentId: "workspace",
      artifact: { kind: "policy", sha256: sha256Hex(Buffer.from(canonicalize(generated), "utf8")), id: "standard-schemas" } },
      { beforeCommit: () => { log.assertCurrent(); plan.assertCurrent(); } });
    completedLogs.push(entry.hash); log.assertCurrent(); plan.assertCurrent();
    return { ...generated, transparencyHash: entry.hash };
  } catch (cause) { throw new StandardPublicationError(Object.freeze([...(generated.schemaNames.map(name => join(generated.schemasDir, name))), generated.metaPath, generated.metaSigPath, generated.schemasSigPath].map(path => relative(workspace, path))), null, "log", cause, Object.freeze([...completedLogs])); }
}
export async function standardVerifyForApiAsync(workspace: string, options: OrgPairsOptions = {}) {
  const beforePublish = options.beforePublish, assertInputsCurrent = options.assertInputsCurrent;
  const log = captureWorkspaceLogAuthority(workspace, beforePublish), captured = captureStandardVerification(workspace), verified = captured.verified;
  const current = () => { assertInputsCurrent?.(); log.assertCurrent(); captured.assertCurrent(); };
  current();
  const completedLogs: string[] = [];
  try {
    const entry = await appendTransparencyEntryAsync({ workspace, type: "STANDARD_SCHEMAS_VERIFIED", agentId: "workspace",
      artifact: { kind: "policy", sha256: sha256Hex(Buffer.from(canonicalize(verified), "utf8")), id: "standard-schemas-verify" } }, { beforeCommit: current });
    completedLogs.push(entry.hash); current(); return { ...verified, transparencyHash: entry.hash };
  } catch (cause) { throw new StandardPublicationError([], null, "log", cause, Object.freeze([...completedLogs])); }
}
