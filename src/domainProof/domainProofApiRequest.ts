import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { domainProofDomainIdSchema } from "./domainProofArtifact.js";
import { domainProofCheckInputSchema } from "./domainProofCheck.js";
import { sourceRuleManifestSchema } from "./sourceRuleManifestSchema.js";

const MAX_LEGACY_JSON_BYTES = 1_048_576;
const LEGACY_MANIFEST_ROOT = "fixtures/domain-proof";
const LEGACY_INPUT_ROOT = "examples/domain-proof";
const legacyPathSchema = z.string().min(1).max(512);

export const domainProofApiCheckRequestSchema = z.object({
  domain: domainProofDomainIdSchema,
  manifest: z.union([sourceRuleManifestSchema, legacyPathSchema]),
  input: z.union([domainProofCheckInputSchema, legacyPathSchema]),
}).strict();

export type DomainProofApiCheckRequest = z.infer<typeof domainProofApiCheckRequestSchema>;
export type DomainProofApiRequestMode = "inline_json" | "legacy_fixture_path";

export interface MaterializedDomainProofApiRequest {
  domain: DomainProofApiCheckRequest["domain"];
  manifest: unknown;
  input: unknown;
  requestMode: DomainProofApiRequestMode;
}

export class DomainProofApiRequestError extends Error {
  readonly code:
    | "API_FILE_WRITE_DISABLED"
    | "INVALID_REQUEST"
    | "LEGACY_PATH_REJECTED";

  constructor(code: DomainProofApiRequestError["code"], message: string) {
    super(message);
    this.name = "DomainProofApiRequestError";
    this.code = code;
  }
}

function isAtOrInside(root: string, target: string): boolean {
  const relativePath = relative(root, target);
  return relativePath === "" || (
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
}

function rejectLegacyPath(): never {
  throw new DomainProofApiRequestError(
    "LEGACY_PATH_REJECTED",
    "Legacy Domain Proof path rejected; use inline JSON or a built-in proof fixture path.",
  );
}

function readLegacyJson(workspace: string, requestedPath: string, allowedRootFromWorkspace: string): unknown {
  const segments = requestedPath.split("/");
  if (
    isAbsolute(requestedPath) ||
    requestedPath.includes("\\") ||
    requestedPath.includes("\0") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    return rejectLegacyPath();
  }

  try {
    const workspaceReal = realpathSync(resolve(workspace));
    const allowedRootCandidate = resolve(workspaceReal, allowedRootFromWorkspace);
    const allowedRootReal = realpathSync(allowedRootCandidate);
    if (!isAtOrInside(workspaceReal, allowedRootReal)) {
      return rejectLegacyPath();
    }

    const candidateResolved = resolve(workspaceReal, requestedPath);
    if (!isAtOrInside(allowedRootReal, candidateResolved) || candidateResolved === allowedRootReal) {
      return rejectLegacyPath();
    }

    const candidateReal = realpathSync(candidateResolved);
    if (!isAtOrInside(allowedRootReal, candidateReal) || candidateReal === allowedRootReal) {
      return rejectLegacyPath();
    }

    const stat = statSync(candidateReal);
    if (!stat.isFile() || stat.size > MAX_LEGACY_JSON_BYTES) {
      return rejectLegacyPath();
    }

    return JSON.parse(readFileSync(candidateReal, "utf8")) as unknown;
  } catch (error) {
    if (error instanceof DomainProofApiRequestError) {
      throw error;
    }
    return rejectLegacyPath();
  }
}

export function materializeDomainProofApiRequest(
  workspace: string,
  body: unknown,
): MaterializedDomainProofApiRequest {
  if (body && typeof body === "object" && !Array.isArray(body) && Object.hasOwn(body, "outFile")) {
    throw new DomainProofApiRequestError(
      "API_FILE_WRITE_DISABLED",
      "API-side Domain Proof artifact files are disabled; use the artifact returned in the response.",
    );
  }

  const parsed = domainProofApiCheckRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainProofApiRequestError(
      "INVALID_REQUEST",
      "Invalid Domain Proof request; provide a domain plus schema-valid manifest and input objects.",
    );
  }

  const manifestIsPath = typeof parsed.data.manifest === "string";
  const inputIsPath = typeof parsed.data.input === "string";

  return {
    domain: parsed.data.domain,
    manifest: typeof parsed.data.manifest === "string"
      ? readLegacyJson(workspace, parsed.data.manifest, LEGACY_MANIFEST_ROOT)
      : parsed.data.manifest,
    input: typeof parsed.data.input === "string"
      ? readLegacyJson(workspace, parsed.data.input, LEGACY_INPUT_ROOT)
      : parsed.data.input,
    requestMode: manifestIsPath || inputIsPath ? "legacy_fixture_path" : "inline_json",
  };
}
