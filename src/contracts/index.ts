/**
 * AMC's public contracts (P1-01): one zod schema per public record, the same schema AMC parses with, and the JSON
 * Schema generated from it into spec/schemas/v1/ by scripts/gen-spec-schemas.mjs. A published v1 `$id` never changes
 * meaning; a breaking change goes to v2/. See spec/README.md and spec/ACCEPTANCE_RULES.md.
 */
import { z } from "zod";
import { catalogLockSchema } from "../catalog/lockfile.js";
import { controlRecordSchema, packManifestSchema } from "../catalog/schema.js";
import { claimEnvelopeSchema } from "../claims/eligibility/schemas.js";
import { signatureEnvelopeSchema } from "../crypto/signing/signatureEnvelope.js";
import { externalEvidenceProfileSchema } from "../standard/externalEvidenceProfile.js";
import { STANDARD_ARTIFACT_SCHEMAS } from "../standard/standardSchema.js";
import { signedTrustListSchema } from "../trust/trustList.js";
import { verifierReportSchema } from "../trust/verifierReport.js";
import { canonicalize } from "../utils/json.js";
import { a4ConformanceStatementV1Schema } from "./v1/a4ConformanceStatement.js";
import { a4DecisionV1Schema } from "./v1/a4Decision.js";
import { a4DeploymentReceiptV1Schema } from "./v1/a4DeploymentReceipt.js";
import { a4GateV1Schema } from "./v1/a4Gate.js";
import { a4GatePolicyV1Schema } from "./v1/a4GatePolicy.js";
import { a4IntegrationClaimV1Schema } from "./v1/a4IntegrationClaim.js";
import { a4IntentV1Schema } from "./v1/a4Intent.js";
import { a4PackageV1Schema } from "./v1/a4Package.js";
import { a4ProjectV1Schema } from "./v1/a4Project.js";
import { a4ReadinessV1Schema } from "./v1/a4Readiness.js";
import { a4RecordV1Schema } from "./v1/a4Record.js";
import { a4ReleaseV1Schema } from "./v1/a4Release.js";
import { a4RevisionV1Schema } from "./v1/a4Revision.js";
import { a4RollbackReceiptV1Schema } from "./v1/a4RollbackReceipt.js";
import { a4TransitionV1Schema } from "./v1/a4Transition.js";
import { a4ValueClaimV1Schema } from "./v1/a4ValueClaim.js";
import { authorizationRecordV1Schema } from "./v1/authorizationRecord.js";
import { controlResultV1Schema } from "./v1/controlResult.js";
import { evidenceEventV1Schema } from "./v1/evidenceEvent.js";
import { receiptV1Schema, receiptV2Schema } from "./v1/receipt.js";
import { scopedAttestationV1Schema } from "./v1/scopedAttestation.js";

export * from "./v1/a4ConformanceStatement.js";
export * from "./v1/a4Decision.js";
export * from "./v1/a4DeploymentReceipt.js";
export * from "./v1/a4Gate.js";
export * from "./v1/a4GatePolicy.js";
export * from "./v1/a4IntegrationClaim.js";
export * from "./v1/a4Intent.js";
export * from "./v1/a4Package.js";
export * from "./v1/a4Project.js";
export * from "./v1/a4Readiness.js";
export * from "./v1/a4Record.js";
export * from "./v1/a4Release.js";
export * from "./v1/a4Revision.js";
export * from "./v1/a4RollbackReceipt.js";
export * from "./v1/a4Transition.js";
export * from "./v1/a4ValueClaim.js";
export * from "./v1/authorizationRecord.js";
export * from "./v1/controlResult.js";
export * from "./v1/evidenceEvent.js";
export * from "./v1/receipt.js";
export * from "./v1/scopedAttestation.js";
// Re-exported, never forked: AMC already parses these records with them.
export { claimEnvelopeSchema as claimEnvelopeV1Schema, signatureEnvelopeSchema as signatureEnvelopeV1Schema };
export { signedTrustListSchema as trustListV1Schema, verifierReportSchema as verifierReportV1Schema };

export const SPEC_SCHEMA_BASE = "https://agentmaturity.co/spec/schemas/v1/";

export const CONTRACTS = {
  "evidence-event": { title: "AMC Evidence Event", schema: evidenceEventV1Schema },
  "receipt": { title: "AMC Receipt", schema: receiptV2Schema },
  "legacy-receipt": { title: "AMC Receipt Payload (legacy v1)", schema: receiptV1Schema },
  "authorization-record": { title: "AMC Authorization Record", schema: authorizationRecordV1Schema },
  "control-result": { title: "AMC Control Result", schema: controlResultV1Schema },
  "claim-envelope": { title: "AMC Claim Envelope", schema: claimEnvelopeSchema },
  "scoped-attestation": { title: "AMC Scoped Attestation", schema: scopedAttestationV1Schema },
  "trust-list": { title: "AMC Signed Trust List", schema: signedTrustListSchema },
  "verifier-report": { title: "AMC Verifier Report", schema: verifierReportSchema },
  "signature-envelope": { title: "AMC Signature Envelope", schema: signatureEnvelopeSchema },
  // Regulated Control Catalog (P1-09); refinements are in docs/catalog/CONTROL_RECORD.md.
  "control-record": { title: "AMC Control Record", schema: controlRecordSchema },
  "pack-manifest": { title: "AMC Catalog Pack Manifest", schema: packManifestSchema },
  "catalog-lock": { title: "AMC Catalog Lockfile", schema: catalogLockSchema },
  // A4 Forge (P1-56); refinements are in spec/ACCEPTANCE_RULES.md "A4 project record" (P1-63).
  "a4-project": { title: "AMC A4 Project", schema: a4ProjectV1Schema },
  "a4-revision": { title: "AMC A4 Revision", schema: a4RevisionV1Schema },
  "a4-gate": { title: "AMC A4 Gate", schema: a4GateV1Schema },
  "a4-decision": { title: "AMC A4 Gate Decision", schema: a4DecisionV1Schema },
  "a4-transition": { title: "AMC A4 Transition", schema: a4TransitionV1Schema },
  "a4-intent": { title: "AMC A4 Gate Intent", schema: a4IntentV1Schema },
  "a4-readiness": { title: "AMC A4 Readiness", schema: a4ReadinessV1Schema },
  "a4-gate-policy": { title: "AMC A4 Gate Policy", schema: a4GatePolicyV1Schema },
  "a4-integration-claim": { title: "AMC A4 Integration Claim", schema: a4IntegrationClaimV1Schema },
  "a4-package": { title: "AMC A4 Agent Package", schema: a4PackageV1Schema },
  "a4-release": { title: "AMC A4 Release Record", schema: a4ReleaseV1Schema },
  "a4-deployment-receipt": { title: "AMC A4 Deployment Receipt", schema: a4DeploymentReceiptV1Schema },
  "a4-rollback-receipt": { title: "AMC A4 Rollback Receipt", schema: a4RollbackReceiptV1Schema },
  "a4-value-claim": { title: "AMC A4 Value Claim", schema: a4ValueClaimV1Schema },
  "a4-conformance-statement": { title: "AMC A4 Conformance Statement", schema: a4ConformanceStatementV1Schema },
  "a4-record": { title: "AMC A4 Project Record Export", schema: a4RecordV1Schema }
} as const;
export type ContractName = keyof typeof CONTRACTS;

/** Parses `value` with the named contract; throws `violates <name> v1: <path> <message>` on the first issue. */
export function assertContract<N extends ContractName>(name: N, value: unknown): z.output<(typeof CONTRACTS)[N]["schema"]> {
  const parsed = CONTRACTS[name].schema.safeParse(value);
  if (parsed.success) return parsed.data as z.output<(typeof CONTRACTS)[N]["schema"]>;
  const issue = parsed.error.issues[0];
  throw new Error(`violates ${name} v1: ${issue ? `${issue.path.join(".") || "(root)"} ${issue.message}` : "invalid"}`);
}

export interface PublishedSchema {
  /** File name under spec/schemas/v1/ and .amc/standard/schemas/. */
  name: string;
  $id: string;
  schema: Record<string, unknown>;
}

/**
 * Generated from the schema AMC parses with. `io: "input"` describes what AMC accepts: a strict object publishes
 * `additionalProperties: false`, an object AMC strips unknown keys from publishes no such rule. Refinements do not
 * reach JSON Schema; spec/ACCEPTANCE_RULES.md lists them.
 */
function fromZod(name: string, title: string, schema: z.ZodType): PublishedSchema {
  const $id = `${SPEC_SCHEMA_BASE}${name}`;
  return { name, $id, schema: { ...z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" }), $id, title } };
}

/** Every published schema: the contracts, the `amc standard` artifacts and the external-evidence profile. */
export function publishedSchemas(): PublishedSchema[] {
  const external = externalEvidenceProfileSchema;
  return [
    ...Object.entries(CONTRACTS).map(([name, row]) => fromZod(`${name}.schema.json`, row.title, row.schema)),
    ...Object.entries(STANDARD_ARTIFACT_SCHEMAS).map(([name, row]) => fromZod(name, row.title, row.schema)),
    { name: "external-evidence.schema.json", $id: String(external.$id), schema: external }
  ].sort((a, b) => a.name.localeCompare(b.name));
}

/** The published bytes: keys sorted at every level, two-space indent, LF, trailing newline. */
export function serializeSchema(value: unknown): string {
  return `${JSON.stringify(JSON.parse(canonicalize(value)), null, 2)}\n`;
}
