import { z } from "zod";

/** Strict local fixture protocols, not production evidence or a legal/safety scope decision. */
const identifier = z.string().min(1).max(512).refine(value => value === value.trim() && !/\p{Cc}/u.test(value));
export const utcTime = z.iso.datetime().regex(/T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const duration = z.number().finite().int().positive().max(Number.MAX_SAFE_INTEGER);
const level = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const binding = z.object({ tenantId: identifier, workspaceId: identifier, deploymentId: identifier, agentId: identifier,
  controlId: z.enum(["L1-MOB-01", "L1-MOB-02", "L1-MOB-03", "L1-MOB-04", "L1-MOB-05", "L1-MOB-06"]),
  controlVersion: z.string().regex(/^\d+\.\d+\.\d+$/), planDigest: digest }).strict();
const contextFor = (controlId: z.infer<typeof binding>["controlId"]) => binding.refine(value => value.controlId === controlId);
type Binding = z.infer<typeof binding>;
export function sameBinding(expected: Binding, actual: Binding): boolean {
  return expected.tenantId === actual.tenantId && expected.workspaceId === actual.workspaceId
    && expected.deploymentId === actual.deploymentId && expected.agentId === actual.agentId
    && expected.controlId === actual.controlId && expected.controlVersion === actual.controlVersion
    && expected.planDigest === actual.planDigest;
}
export function unique(values: readonly string[]): boolean { return new Set(values).size === values.length; }
export function completeText(...values: unknown[]): boolean {
  return values.every(value => typeof value === "string" && value.trim().length > 0);
}
export interface LocalOutcome {
  result: "allow" | "deny" | "pass" | "fail" | "not_evaluated";
  reasonCode: string;
  claimKind: "synthetic_example";
}

// Inert bounded pending scenario data; no P2-27 eligibility/conversion algorithm is supplied here.
export const releaseSchema = z.object({ context: contextFor("L1-MOB-01"), at: utcTime, lotId: identifier,
  inventory: z.object({ binding, lotIds: z.array(identifier).max(10_000) }).strict().nullable(),
  sensor: z.object({ binding, lotId: identifier, unit: z.literal("C"), maxAgeMs: duration,
    minimumC: z.number().finite(), maximumC: z.number().finite(),
    readings: z.array(z.object({ at: utcTime, valueC: z.number().finite() }).strict()).max(10_000) }).strict().nullable(),
  disposition: z.object({ binding, lotId: identifier, dispositionId: identifier, excursionDigest: digest,
    actorId: identifier, action: z.enum(["release", "hold"]), createdAt: utcTime, expiresAt: utcTime }).strict().nullable() }).strict();
const application = z.object({ binding, pairId: identifier, applicationId: identifier, recordedAt: utcTime,
  name: identifier, zipCode: identifier,
  features: z.array(z.object({ featureId: identifier, value: z.number().finite() }).strict()).min(1).max(1000),
  decision: z.enum(["accept", "deny"]),
  reasons: z.array(z.object({ code: identifier, sourceFeatureIds: z.array(identifier).min(1).max(1000) }).strict()).min(1).max(1000).nullable() }).strict();
export const screeningSchema = z.object({ context: contextFor("L1-MOB-02"), at: utcTime,
  permittedFeatureIds: z.array(identifier).min(1).max(1000),
  pairs: z.array(z.object({ pairId: identifier, changedField: z.enum(["name", "zip_code"]),
    baseline: application, counterfactual: application }).strict()).min(1).max(1000) }).strict();
const authorization = z.object({ binding, facilityId: identifier, principalId: identifier, maxLevel: level,
  issuedAt: utcTime, expiresAt: utcTime }).strict();
const portEvent = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("level_change"), binding, eventId: identifier, facilityId: identifier, at: utcTime, level }).strict(),
  z.object({ kind: z.literal("access_request"), binding, eventId: identifier, requestId: identifier, facilityId: identifier, at: utcTime,
    principalId: identifier, authorization: authorization.nullable(),
    check: z.object({ level, revision: duration, checkedAt: utcTime }).strict().nullable() }).strict()
]);
export const portSchema = z.object({ context: contextFor("L1-MOB-03"), at: utcTime, facilityId: identifier,
  initialSecurity: z.object({ binding, facilityId: identifier, level, changedAt: utcTime }).strict().nullable(),
  events: z.array(portEvent).min(1).max(10_000) }).strict();
export const changeSchema = z.object({ context: contextFor("L1-MOB-04"), at: utcTime, proposerId: identifier,
  change: z.object({ binding, changeId: identifier, createdAt: utcTime,
    classification: z.enum(["safety_related", "unknown"]), bytesUtf8: z.string().min(1).max(1_000_000) }).strict(),
  analysis: z.object({ binding, changeId: identifier, changeDigest: digest, createdAt: utcTime,
    impactSummary: z.string().min(1).max(16_384), validationRecordId: identifier }).strict().nullable(),
  approval: z.object({ binding, changeId: identifier, changeDigest: digest, approverId: identifier,
    decision: z.enum(["approve", "reject"]), approvedAt: utcTime, expiresAt: utcTime }).strict().nullable() }).strict();
export const otaSchema = z.object({ context: contextFor("L1-MOB-05"), at: utcTime,
  fleet: z.object({ binding, fleetId: identifier, vehicleModelId: identifier, vehicleIds: z.array(identifier).min(1).max(10_000) }).strict().nullable(),
  package: z.object({ metadata: z.object({ binding, packageId: identifier, fleetId: identifier, targetVersion: identifier,
    createdAt: utcTime, payloadSha256: hex,
    r156: z.object({ updateId: identifier.optional(), softwareVersion: identifier.optional(),
      vehicleModelIds: z.array(identifier).max(1000).optional(), changeSummary: z.string().max(16_384).optional(),
      validationRecordId: identifier.optional(), rollbackPlanId: identifier.optional() }).strict().nullable() }).strict(),
    payloadBase64: z.string().max(2_000_000), signatureB64: z.string().max(16_384), signerPublicKeyPem: z.string().max(4096) }).strict() }).strict();
export const fallbackSchema = z.object({ context: contextFor("L1-MOB-06"), at: utcTime, vehicleId: identifier, crashAt: utcTime,
  profile: z.object({ binding, vehicleId: identifier, condition: z.literal("stopped_in_designated_safe_area"), maxResponseMs: duration,
    source: z.literal("synthetic_fixture_parameter"), safetyCase: z.literal("not_performed") }).strict().nullable(),
  trajectory: z.array(z.object({ binding, vehicleId: identifier, at: utcTime, speedMps: z.number().finite().nonnegative(),
    insideSafeArea: z.boolean(), controller: z.enum(["independent_fallback", "agent"]) }).strict()).max(10_000) }).strict();
export type OtaInput = z.infer<typeof otaSchema>;
