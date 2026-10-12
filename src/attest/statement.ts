/**
 * in-toto Statement v1 with AMC's control-results predicate (v0.1, until the Core Spec, P1-30, is accepted). Subjects
 * name artifacts by the sha256 of their bytes; the predicate states one result, its scope, its claim kind and its
 * evidence by digest. Truth rules: synthetic evidence is never attested, and only a key admitted for
 * independent-attestation may state `independently_reviewed`.
 */
import { z } from "zod";
import { claimKindSchema } from "../claims/eligibility/schemas.js";
import { CLAIM_KINDS, type ClaimKind, type StatusDimensions } from "../claims/eligibility/types.js";
import { controlDimensionsSchema } from "../contracts/v1/controlResult.js";
import { isoTimeSchema, nonEmpty, sha256HexSchema } from "../contracts/v1/common.js";
import type { KeyPurpose } from "../trust/keyPurposes.js";
import { sha256Hex } from "../utils/hash.js";

export const INTOTO_STATEMENT_TYPE = "https://in-toto.io/Statement/v1";
/** Never reuse a published predicate version: a changed shape gets a new URI. */
export const CONTROL_RESULTS_PREDICATE = "https://agentmaturity.co/attestations/control-results/v0.1";
export const ATTESTATION_TTL_DAYS = 90;
export const ATTESTATION_NOTICE = "A signature proves who issued this statement and that it is unchanged, not that the statement is true or that the agent behaved well.";


export const controlResultsPredicateSchema = z.strictObject({
  claimKind: claimKindSchema.exclude(["synthetic_example"]),
  scope: z.strictObject({
    tenant: nonEmpty.nullable(),
    deployment: nonEmpty.nullable(),
    workspace: nonEmpty,
    agent: nonEmpty,
    snapshot: sha256HexSchema,
    profile: nonEmpty,
    profileVersion: nonEmpty.nullable(),
    window: z.strictObject({ start: isoTimeSchema, end: isoTimeSchema }),
    exclusions: z.array(z.strictObject({ controlId: nonEmpty, rationale: nonEmpty }))
  }),
  /** Each control's five status dimensions (P0-08); `pass` needs applicable and sufficient evidence, as in the control-result contract. */
  controls: z.array(z.strictObject({ controlId: nonEmpty, dimensions: controlDimensionsSchema })).min(1),
  evidence: z.array(z.strictObject({ sha256: sha256HexSchema, kind: nonEmpty })),
  verifierReport: z.strictObject({ sha256: sha256HexSchema }).nullable(),
  issuedAt: isoTimeSchema,
  expiresAt: isoTimeSchema,
  notice: z.literal(ATTESTATION_NOTICE)
});
export type ControlResultsPredicate = z.infer<typeof controlResultsPredicateSchema>;

export const inTotoStatementSchema = z.strictObject({
  _type: z.literal(INTOTO_STATEMENT_TYPE),
  subject: z.array(z.strictObject({ name: nonEmpty, digest: z.strictObject({ sha256: sha256HexSchema }) })).min(1),
  predicateType: z.literal(CONTROL_RESULTS_PREDICATE),
  predicate: controlResultsPredicateSchema
});
export type InTotoStatement = z.infer<typeof inTotoStatementSchema>;

export type AttestationRefusal = "SYNTHETIC_NOT_ATTESTABLE" | "INDEPENDENT_REVIEW_KEY_REQUIRED";
export class AttestationRefused extends Error {
  constructor(readonly code: AttestationRefusal, message: string) {
    super(`${code}: ${message}`);
    this.name = "AttestationRefused";
  }
}

export interface ControlResultsInput {
  subjects: Array<{ name: string; bytes: Uint8Array }>;
  /** The claim kind of every result and evidence item the statement is built on; the statement carries the weakest. */
  claimKinds: readonly ClaimKind[];
  /** The purpose of the key that will sign the statement. */
  signerPurpose: KeyPurpose;
  scope: ControlResultsPredicate["scope"];
  /** Checked by the schema: a `pass` without applicable, sufficient evidence is refused. */
  controls: Array<{ controlId: string; dimensions: StatusDimensions }>;
  evidence: ControlResultsPredicate["evidence"];
  verifierReport: ControlResultsPredicate["verifierReport"];
  /** The issuing server's clock. */
  issuedAt: Date;
}

function attestableClaimKind(claimKinds: readonly ClaimKind[], signerPurpose: KeyPurpose): ControlResultsPredicate["claimKind"] {
  if (claimKinds.length === 0) throw new Error("an attestation needs the claim kind of the evidence it is built on");
  const weakest = CLAIM_KINDS[Math.min(...claimKinds.map(kind => CLAIM_KINDS.indexOf(kind)))]!;
  if (weakest === "synthetic_example") throw new AttestationRefused("SYNTHETIC_NOT_ATTESTABLE", "a result built on synthetic example evidence cannot be attested");
  if (weakest === "independently_reviewed" && signerPurpose !== "independent-attestation") {
    throw new AttestationRefused("INDEPENDENT_REVIEW_KEY_REQUIRED", `independently_reviewed needs a key admitted for independent-attestation, not ${signerPurpose}`);
  }
  return weakest;
}

export function buildControlResultsStatement(input: ControlResultsInput): InTotoStatement {
  const claimKind = attestableClaimKind(input.claimKinds, input.signerPurpose);
  const expiresAt = new Date(input.issuedAt.getTime() + ATTESTATION_TTL_DAYS * 86_400_000);
  return inTotoStatementSchema.parse({
    _type: INTOTO_STATEMENT_TYPE,
    subject: input.subjects.map(subject => ({ name: subject.name, digest: { sha256: sha256Hex(Buffer.from(subject.bytes)) } })),
    predicateType: CONTROL_RESULTS_PREDICATE,
    predicate: { claimKind, scope: input.scope, controls: input.controls, evidence: input.evidence, verifierReport: input.verifierReport,
      issuedAt: input.issuedAt.toISOString(), expiresAt: expiresAt.toISOString(), notice: ATTESTATION_NOTICE }
  });
}

/** One message per subject whose bytes were not supplied or do not hash to its digest; empty when every subject matches. */
export function subjectMismatches(statement: InTotoStatement, supplied: ReadonlyMap<string, Uint8Array>): string[] {
  return statement.subject.flatMap(subject => {
    const bytes = supplied.get(subject.name);
    if (bytes === undefined) return [`subject ${subject.name} was not supplied`];
    const actual = sha256Hex(Buffer.from(bytes));
    return actual === subject.digest.sha256 ? [] : [`subject ${subject.name} hashes to ${actual}, not ${subject.digest.sha256}`];
  });
}
