import { z } from "zod";
import { nonEmpty, sha256HexSchema } from "./common.js";
import { A4_STAGES } from "./a4Project.js";

/** One slot a gate binds. null means "not produced yet" and blocks every stage that requires it (design §8). */
const slot = z.string().min(1).nullable();

/** `A4ResourceDigests`: produced by their producers; A4 recomputes a slot only to compare it, never to replace it. */
export const a4ResourceDigestsSchema = z.strictObject({
  schema: z.literal("amc.a4-resource-digests/v1"),
  brief: z.strictObject({ contextGraphSha256: slot, agentConfigSha256: slot }),
  enforce: z.strictObject({ manifestId: slot, resourcesSha256: slot, snapshotBundleSha256: slot }),
  composition: z.strictObject({ compositionDigest: slot, policyDigest: slot, presetSha256: slot }),
  graph: z.strictObject({ typedGraphDigest: slot }),
  signedConfigs: z.strictObject({ tools: slot, approvalPolicy: slot, budgets: slot, firewall: slot, actionPolicy: slot, opsPolicy: slot }),
  plan: z.strictObject({ planDigest: slot, lockDigest: slot, journalEntrySha256: slot }),
  operatingProfile: z.strictObject({ sha256: slot, activationSha256: slot }),
  context: z.strictObject({ contextPluginSha256: slot, promptPackSha256: slot, memoryPolicySha256: slot }),
  release: z.strictObject({ packageDigest: slot, imageDigest: slot, chartOrComposeDigest: slot, valuesDigest: slot }),
  gatePolicyDigest: slot
});
export type A4ResourceDigests = z.infer<typeof a4ResourceDigestsSchema>;

/** `amc.a4-revision/v1`: an accepted specification at a stage, content-addressed by `specDigest`. */
export const a4RevisionV1Schema = z.strictObject({
  schema: z.literal("amc.a4-revision/v1"),
  projectId: nonEmpty,
  revisionNo: z.number().int().min(1),
  stage: z.enum(A4_STAGES),
  parentRevisionNo: z.number().int().min(1).nullable(),
  spec: z.record(z.string(), z.unknown()),
  specDigest: sha256HexSchema,
  resourceDigests: a4ResourceDigestsSchema,
  resourceDigestsSha256: sha256HexSchema,
  operatingScope: z.record(z.string(), z.unknown()).nullable(),
  createdByKey: nonEmpty,
  evidenceEventId: nonEmpty,
  ts: z.number().int()
});
export type A4RevisionV1 = z.infer<typeof a4RevisionV1Schema>;
