/** verifyArtifact: the bytes of one record, plus trust the caller pins, in; one VerifierReportV1 out. No I/O. */
import { parseJson, sha256Hex } from "./bytes.js";
import type { Finding } from "./codes.js";
import { EvidenceStore, type Env, type Evaluation, type ScopeExpectation } from "./evaluation.js";
import { evaluateAttestation } from "./kinds/attestation.js";
import { refused } from "./kinds/common.js";
import { evaluateExternalEvidence } from "./kinds/externalEvidence.js";
import { evaluateReceipt } from "./kinds/receipt.js";
import { evaluateRevocationList, evaluateTrustList } from "./kinds/lists.js";
import { evaluateKeyRotation, evaluateRootRotation } from "./kinds/rotation.js";
import { buildReport, type VerifierReport } from "./report.js";
import { isRecord } from "./schema.js";
import { trustContext } from "./trust.js";

export interface VerifyOptions {
  /** Signed trust lists (P0-09 format) the verifier's user supplies. Never read from the artifact. */
  trustLists: readonly unknown[];
  /** Pinned trust-list root key ids (64 lowercase hex). */
  trustRoots: readonly string[];
  /** How many distinct pinned roots must sign a trust list (default 1). A list's own rootThreshold can only raise it. */
  rootThreshold?: number;
  /** Every time comparison is made as of this instant. Default: now. */
  asOf?: Date;
  expectScope?: ScopeExpectation;
  /** Highest sequence already seen per subject, list id, `<workspaceId>/<purpose>` or root set id. */
  knownSequences?: Readonly<Record<string, number>>;
  /** sha256 hex -> bytes of supplied evidence. */
  evidence?: ReadonlyMap<string, Uint8Array>;
  /** Shown in the report only. */
  path?: string;
}

/** Refuses options a caller got wrong: these are usage errors, not verdicts about the artifact. */
function checkOptions(options: VerifyOptions): void {
  if (!Array.isArray(options.trustLists) || !Array.isArray(options.trustRoots)) throw new TypeError("trustLists and trustRoots must be arrays");
  for (const root of options.trustRoots) if (typeof root !== "string" || !/^[0-9a-f]{64}$/.test(root)) throw new TypeError(`trust root ${String(root)} is not 64 lowercase hex`);
  const threshold = options.rootThreshold ?? 1;
  if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > Math.max(1, new Set(options.trustRoots).size)) {
    throw new TypeError(`rootThreshold ${String(options.rootThreshold)} must be an integer from 1 to the number of pinned roots`);
  }
  if (options.asOf !== undefined && !(options.asOf instanceof Date && Number.isFinite(options.asOf.getTime()))) throw new TypeError("asOf must be a valid Date");
  for (const [id, sequence] of Object.entries(options.knownSequences ?? {})) {
    if (!id || !Number.isSafeInteger(sequence) || sequence < 0) throw new TypeError(`known sequence ${id}=${sequence} must be a non-negative integer`);
  }
  for (const [key, value] of Object.entries(options.expectScope ?? {})) {
    if (!["tenant", "deployment", "subject", "profile"].includes(key) || (value !== undefined && (typeof value !== "string" || value.length === 0))) {
      throw new TypeError(`expectScope.${key} is not a non-empty string`);
    }
  }
}

/** Picks the record kind from the parsed value. Unknown shapes, types and versions fail closed. */
function evaluate(value: unknown, bytes: Uint8Array, env: Env): Evaluation {
  if (typeof value === "string") return evaluateReceipt(value, env);
  if (!isRecord(value)) return refused("unknown", { code: "MALFORMED", detail: "not an AMC record" });
  const nestedType = (key: "statement" | "list") => (isRecord(value[key]) ? (value[key] as Record<string, unknown>).type : undefined);
  if (value.type === "amc.scoped-attestation") return evaluateAttestation(value, env);
  if (value.profile === "amc.external-evidence") return evaluateExternalEvidence(value, env);
  if (nestedType("list") === "amc.trust-list") return evaluateTrustList(value, env);
  if (nestedType("list") === "amc.revocation-list") return evaluateRevocationList(value, bytes, env);
  if (nestedType("statement") === "amc.key-rotation") return evaluateKeyRotation(value, bytes, env);
  if (nestedType("statement") === "amc.root-rotation") return evaluateRootRotation(value, bytes, env);
  return refused("unknown", { code: "UNSUPPORTED_VERSION", detail: "not a record type this verifier supports (v1)" });
}

/**
 * Verifies one artifact as of `options.asOf`, trusting only the supplied trust lists, pinned roots and evidence. Keys,
 * authorities and anchors the artifact names are looked up there, never believed.
 */
export function verifyArtifact(bytes: Uint8Array, options: VerifyOptions): VerifierReport {
  checkOptions(options);
  const asOf = options.asOf ?? new Date();
  const ctx = trustContext(options.trustLists, new Set(options.trustRoots), asOf.getTime(), options.knownSequences ?? {}, options.rootThreshold ?? 1);
  const evidence = new EvidenceStore(options.evidence ?? []);
  const env: Env = { ctx, evidence, expect: options.expectScope ?? {} };
  const extraIntegrity: Finding<"integrity">[] = evidence.mismatched
    .map(digest => ({ code: "DIGEST_MISMATCH", detail: `evidence supplied as ${digest} does not hash to that digest` }));
  let value: unknown;
  let evaluation: Evaluation | null = null;
  try {
    value = parseJson(bytes);
  } catch (error) {
    evaluation = refused("unknown", { code: "MALFORMED", detail: `the artifact is ${error instanceof Error ? error.message : String(error)}` });
  }
  evaluation ??= evaluate(value, bytes, env);
  return buildReport({ evaluation, path: options.path ?? "<bytes>", sha256: sha256Hex(bytes), asOf, extraIntegrity, ctxProblems: ctx.problems });
}
