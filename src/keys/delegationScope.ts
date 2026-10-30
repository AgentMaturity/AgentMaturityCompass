import { z } from "zod";

export const DELEGATION_STREAMS = ["sqlite-evidence", "jsonl-evidence", "sqlite-outcome"] as const;
export type DelegationStream = (typeof DELEGATION_STREAMS)[number];
const hex = z.string().regex(/^[0-9a-f]{64}$/);
const start = (genesis: string) => z.strictObject({ count: z.number().int().nonnegative().safe(), head: z.union([hex, z.literal(genesis)]) })
  .refine(value => value.count === 0 ? value.head === genesis : /^[0-9a-f]{64}$/.test(value.head), "empty streams name genesis; nonempty streams name a hash");

/** Signed cutovers, not a timestamp heuristic: the same delegate key also signed the legacy prefix. */
export const delegationScopeSchema = z.strictObject({
  workspaceId: z.string().min(1).max(256),
  sequence: z.number().int().positive().safe(),
  previousDelegationSha256: hex.nullable(),
  starts: z.strictObject({
    "sqlite-evidence": start("GENESIS"),
    "jsonl-evidence": start("GENESIS"),
    "sqlite-outcome": start("GENESIS_OUTCOME")
  }),
  checkpoints: z.strictObject({ sequence: z.number().int().nonnegative().safe(), sha256: hex.nullable() })
    .refine(value => (value.sequence === 0) === (value.sha256 === null), "only an empty checkpoint chain has a null head")
});
export type DelegationScope = z.infer<typeof delegationScopeSchema>;

export const DELEGATION_META = "amcKeyDelegation";
export const delegationRowMarkerSchema = z.strictObject({ sha256: hex, useSequence: z.number().int().positive().safe() });
