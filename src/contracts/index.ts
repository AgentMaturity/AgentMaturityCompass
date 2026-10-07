/**
 * AMC's public contracts (P1-01): one zod schema per public record, the same schema AMC parses with, and the JSON
 * Schema generated from it into spec/schemas/v1/ by scripts/gen-spec-schemas.mjs. A published v1 `$id` never changes
 * meaning; a breaking change goes to v2/. See spec/README.md and spec/ACCEPTANCE_RULES.md.
 */
import { z } from "zod";
import { claimEnvelopeSchema } from "../claims/eligibility/schemas.js";
import { signatureEnvelopeSchema } from "../crypto/signing/signatureEnvelope.js";
import { externalEvidenceProfileSchema } from "../standard/externalEvidenceProfile.js";
import { STANDARD_ARTIFACT_SCHEMAS } from "../standard/standardSchema.js";
import { signedTrustListSchema } from "../trust/trustList.js";
import { verifierReportSchema } from "../trust/verifierReport.js";
import { canonicalize } from "../utils/json.js";
import { authorizationRecordV1Schema } from "./v1/authorizationRecord.js";
import { controlResultV1Schema } from "./v1/controlResult.js";
import { evidenceEventV1Schema } from "./v1/evidenceEvent.js";
import { receiptV1Schema, receiptV2Schema } from "./v1/receipt.js";
import { scopedAttestationV1Schema } from "./v1/scopedAttestation.js";

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
  "signature-envelope": { title: "AMC Signature Envelope", schema: signatureEnvelopeSchema }
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
