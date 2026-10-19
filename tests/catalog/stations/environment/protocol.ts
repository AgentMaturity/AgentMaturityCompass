import { z } from "zod";

/** Local synthetic protocols only. No schema supplies legal applicability, physical authority or production evidence. */
export const identifier = z.string().min(1).max(512).refine(value => value === value.trim() && !/\p{Cc}/u.test(value));
export const utcTime = z.iso.datetime().regex(/T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/);
export const bindingSchema = z.object({ tenantId: identifier, workspaceId: identifier, deploymentId: identifier,
  agentId: identifier, controlId: z.string().regex(/^L1-ENV-0[1-6]$/), controlVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  planDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/) }).strict();
export type Binding = z.infer<typeof bindingSchema>;
const contextFor = (controlId: string) => bindingSchema.refine(value => value.controlId === controlId);
export function sameBinding(expected: Binding, actual: Binding): boolean {
  return expected.tenantId === actual.tenantId && expected.workspaceId === actual.workspaceId
    && expected.deploymentId === actual.deploymentId && expected.agentId === actual.agentId
    && expected.controlId === actual.controlId && expected.controlVersion === actual.controlVersion
    && expected.planDigest === actual.planDigest;
}

const physicalNumber = z.number().finite();
const duration = z.number().finite().int().positive().max(Number.MAX_SAFE_INTEGER);
const flag = z.boolean();
const asset = z.object({ assetId: identifier, setpoint: physicalNumber, state: z.enum(["running", "hold"]) }).strict();
const inventory = z.object({ binding: bindingSchema, assets: z.array(asset).max(10_000) }).strict();
const command = z.object({ binding: bindingSchema, requestId: identifier, actorId: identifier, assetId: identifier,
  kind: z.enum(["proposal", "write_setpoint"]), value: physicalNumber, origin: z.enum(["agent", "ot_log"]) }).strict();
export type PlantInventory = z.infer<typeof inventory>;
export type PlantCommand = z.infer<typeof command>;
export const setpointSchema = z.object({ context: contextFor("L1-ENV-01"), at: utcTime, assetId: identifier,
  inventory: inventory.nullable(), commands: z.array(command).min(1).max(10_000), otLog: z.array(z.string().max(16_384)).max(10_000) }).strict();
export const safeStateSchema = z.object({ context: contextFor("L1-ENV-02"), at: utcTime, assetId: identifier,
  inventory: inventory.nullable(), modelAvailable: flag,
  safeProfile: z.object({ binding: bindingSchema, assetId: identifier, safeState: z.literal("hold"),
    source: z.literal("synthetic_fixture_parameter"), hazardReview: z.literal("not_performed") }).strict().nullable(),
  controller: z.object({ actorId: identifier, mode: z.enum(["hold", "continue"]), emitAlert: flag, enableManualFallback: flag }).strict(),
  agentCommands: z.array(command).max(10_000) }).strict();
const draftField = z.string().max(4096).optional();
export const ceaSchema = z.object({ context: contextFor("L1-ENV-03"), at: utcTime, capacityMw: physicalNumber.refine(value => value > 0).nullable(),
  incident: z.object({ incidentId: identifier, kind: z.enum(["incident", "sabotage"]), startedAt: utcTime }).strict(),
  packet: z.object({ binding: bindingSchema, incidentId: identifier, createdAt: utcTime,
    fields: z.object({ asset: draftField, summary: draftField, contact: draftField, scope: draftField }).strict() }).strict().nullable() }).strict();
export const genealogySchema = z.object({ context: contextFor("L1-ENV-04"), at: utcTime, recalledLotId: identifier,
  graph: z.object({ kind: z.literal("synthetic_component_graph"), complete: flag,
    lots: z.array(z.object({ lotId: identifier, parentIds: z.array(identifier).max(10_000) }).strict()).max(10_000) }).strict().nullable(),
  notifiedLotIds: z.array(identifier).max(10_000) }).strict();
const sensorRequirement = z.object({ sensorId: identifier, unit: identifier, min: physicalNumber, max: physicalNumber }).strict()
  .refine(value => value.min <= value.max);
export const sensorSchema = z.object({ context: contextFor("L1-ENV-05"), at: utcTime, lotId: identifier, feedAvailable: flag,
  profile: z.object({ binding: bindingSchema, lotId: identifier, windowMs: duration, maxAgeMs: duration, maxGapMs: duration,
    requirements: z.array(sensorRequirement).min(1).max(1000) }).strict(),
  readings: z.array(z.object({ binding: bindingSchema, lotId: identifier, sensorId: identifier, unit: identifier,
    recordedAt: utcTime, value: physicalNumber }).strict()).max(100_000) }).strict();
export const lotReleaseSchema = z.object({ context: contextFor("L1-ENV-06"), at: utcTime, registryAvailable: flag,
  lot: z.object({ lotId: identifier, commodityId: identifier, coveredByFixturePolicy: flag.nullable() }).strict(),
  statementRef: identifier.nullable(), statements: z.array(z.object({ binding: bindingSchema, statementRef: identifier,
    lotId: identifier, commodityId: identifier }).strict()).max(10_000) }).strict();

export interface OracleOutcome {
  result: "allow" | "deny" | "pass" | "fail" | "not_evaluated";
  reasonCode: string;
  claimKind: "synthetic_example";
  effects: string[];
  refusals: string[];
  observations: Record<string, unknown>;
}
/** Preserve actual effects, including adverse/controller effects, independently of the displayed outcome. */
export function outcome(result: OracleOutcome["result"], reasonCode: string, observations: Record<string, unknown> = {}, effects: string[] = []): OracleOutcome {
  return { result, reasonCode, claimKind: "synthetic_example", effects,
    refusals: result === "allow" || result === "pass" ? [] : [reasonCode], observations };
}
export const invalidInput = () => outcome("not_evaluated", "invalid_fixture_input");
