import { z } from "zod";
import { nonEmpty, sha256HexSchema } from "./common.js";

/** `amc.a4-integration-claim/v1`: which boundary enforces an agent built on a given framework, and what is not covered. */
export const a4IntegrationClaimV1Schema = z.strictObject({
  path: z.enum(["native", "claude-code", "pi", "langgraph", "langchain", "crewai", "openai-agents", "vercel-ai", "generic-http", "other"]),
  enforcementBoundary: z.enum(["tool_pipeline", "hook:PreToolUse", "pi:tool_call", "gateway", "none"]),
  evidenceTier: z.enum(["observed", "self_reported"]),
  supported: z.enum(["supported", "preview", "unsupported"]),
  reason: z.string().nullable(),
  notCovered: z.array(z.string()),
  source: nonEmpty,
  conformanceReceipt: z.strictObject({ sha256: sha256HexSchema, pinnedVersion: nonEmpty }).nullable()
});
export type A4IntegrationClaimV1 = z.infer<typeof a4IntegrationClaimV1Schema>;
