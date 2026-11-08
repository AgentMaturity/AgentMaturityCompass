/**
 * The signed source policy (SH-INTEG-02): `.amc/integrations/sources.yaml` + `.sig`. It is the only thing that lets a
 * message on an external source become a proposal, and it grants no more than the named work order already does.
 *
 * Senders are matched by GitHub user id AND login (a login can be renamed and reassigned; an id cannot). A bot login
 * is refused at parse time: a bot is never an explicit requester. `admission: off` (the default) admits nothing.
 */
import { z } from "zod";
import { normalizeAgentId } from "../../fleet/paths.js";
import { GITHUB_HANDLE_PATTERN, githubLoginSchema, sourceRepositorySchema } from "./sourceObservationSchema.js";

const SOURCE_POLICY_VERSION = 1;
const DEFAULT_MENTION = "@amc";

function isCanonicalAgentId(value: string): boolean {
  try {
    return normalizeAgentId(value) === value;
  } catch {
    return false;
  }
}

const mentionSchema = z.string().regex(new RegExp(`^@${GITHUB_HANDLE_PATTERN}$`), "a mention is `@` plus a GitHub-style handle");

const sourcePolicySourceSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/),
  kind: z.literal("github"),
  repository: sourceRepositorySchema,
  /**
   * The agent whose work order and approval inbox the proposal lands in. Must equal the work order's agentId, and so must
   * be canonical (as `normalizeAgentId` writes it): "Default" or " " would name another inbox than the work order's.
   */
  agentId: z.string().min(1).max(128).refine(isCanonicalAgentId, "agentId must be a canonical agent id: lowercase letters, digits, - and _"),
  /** An existing signed work order; the proposal binds its digest and never widens it. */
  workOrderId: z.string().min(1).max(256),
  mention: mentionSchema.default(DEFAULT_MENTION),
  allowedSenders: z.array(z.strictObject({ id: z.number().int().positive(), login: githubLoginSchema })).max(256).default([]),
  admission: z.enum(["off", "explicit"]).default("off")
}).superRefine((source, ctx) => {
  source.allowedSenders.forEach((sender, index) => {
    if (sender.login.endsWith("[bot]")) ctx.addIssue({ code: "custom", path: ["allowedSenders", index, "login"], message: "a bot is never an allowed sender" });
  });
  const ids = new Set(source.allowedSenders.map((sender) => sender.id));
  if (ids.size !== source.allowedSenders.length) ctx.addIssue({ code: "custom", path: ["allowedSenders"], message: "allowedSenders repeats a user id" });
});

export const sourcePolicySchema = z.strictObject({
  sources: z.strictObject({
    version: z.literal(SOURCE_POLICY_VERSION),
    sources: z.array(sourcePolicySourceSchema).max(64)
  }).superRefine((value, ctx) => {
    const ids = new Set(value.sources.map((source) => source.id));
    if (ids.size !== value.sources.length) ctx.addIssue({ code: "custom", path: ["sources"], message: "source ids must be unique" });
  })
});

export type SourcePolicy = z.infer<typeof sourcePolicySchema>;
export type SourcePolicySource = z.infer<typeof sourcePolicySourceSchema>;

export function defaultSourcePolicy(): SourcePolicy {
  return sourcePolicySchema.parse({
    sources: {
      version: SOURCE_POLICY_VERSION,
      sources: [{
        id: "github-main",
        kind: "github",
        repository: { id: 1, owner: "example", name: "repo" },
        agentId: "default",
        workOrderId: "replace-with-a-signed-work-order-id",
        mention: DEFAULT_MENTION,
        allowedSenders: [],
        admission: "off"
      }]
    }
  });
}
