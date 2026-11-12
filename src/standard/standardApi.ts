import { join, relative } from "node:path";
import type { OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { captureWorkspaceLogAuthority, appendTransparencyEntryAsync } from "../transparency/asyncWorkspaceAppend.js";
import { prepareStandardSchemasAsync, StandardPublicationError } from "./standardPublication.js";
import { captureStandardVerification } from "./standardVerification.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { insideWorkspace } from "../tools/builtin/workspacePath.js";
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

/** A stringified ZodError is a JSON issue list; one readable line per issue. */
function zodIssueLines(error: string): string[] | null {
  try {
    const issues = JSON.parse(error.replace(/^ZodError:\s*/, "")) as Array<{ path?: unknown[]; message?: string }>;
    return Array.isArray(issues) ? issues.map((issue) => `${(issue.path ?? []).join(".") || "(root)"}: ${issue.message ?? "invalid"}`) : null;
  } catch {
    return null;
  }
}

/**
 * Studio's validate route (H6): the file must be inside the workspace on its real path (the fs tools' confinement,
 * which also refuses `.amc` and `.git`), and no error carries file content or an absolute host path.
 */
export function standardValidateWorkspaceFileForApi(params: { workspace: string; schemaId: unknown; file: unknown }):
  { status: 200 | 400 | 422; body: Record<string, unknown> } {
  const schemaId = typeof params.schemaId === "string" ? params.schemaId.trim() : "";
  const file = typeof params.file === "string" ? params.file.trim() : "";
  if (!schemaId || !file) return { status: 400, body: { error: "Choose a schema and enter a workspace-relative file path." } };
  const schema = standardSchemaNameSchema.safeParse(schemaId.endsWith(".schema.json") ? schemaId : `${schemaId}.schema.json`);
  if (!schema.success) return { status: 400, body: { error: `Unknown schema: ${schemaId}` } };
  let confined: { full: string; rel: string };
  try {
    confined = insideWorkspace(params.workspace, file);
  } catch {
    return { status: 400, body: { error: "The file must be inside the workspace (and not under .amc or .git)." } };
  }
  const out = validateWithStandard({ workspace: params.workspace, schemaId: schema.data, file: confined.full });
  const errors = out.errors.flatMap((error) =>
    error.startsWith("SyntaxError") ? ["The file is not valid JSON."] : zodIssueLines(error) ?? [error.replaceAll(confined.full, confined.rel)]);
  return { status: out.ok ? 200 : 422, body: { ...out, file: confined.rel, errors } };
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
