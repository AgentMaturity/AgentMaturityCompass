import { z } from "zod";
import { ACTION_CLASSES } from "../governor/actionCatalog.js";

const toolAllowSchema = z.object({
  paths: z.array(z.string()).optional(),
  hostAllowlist: z.array(z.string()).optional(),
  binariesAllowlist: z.array(z.string()).optional()
}).default({});

const toolDenySchema = z.object({
  paths: z.array(z.string()).optional(),
  argvRegexDenylist: z.array(z.string()).optional()
}).default({});

const stableServerIdSchema = z.string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9._:/-]*$/, "must be a lowercase stable identifier");

export const toolContextSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("native")
  }).strict(),
  z.object({
    kind: z.literal("mcp"),
    server: z.object({
      id: stableServerIdSchema,
      name: z.string().trim().min(1).max(160),
      version: z.string().trim().min(1).max(120).optional(),
      transport: z.enum(["stdio", "streamable-http", "sse", "http"]).optional()
    }).strict()
  }).strict()
]);

export const toolDefinitionSchema = z.object({
  name: z.string().min(1),
  actionClass: z.enum(ACTION_CLASSES as [
    "READ_ONLY",
    "WRITE_LOW",
    "WRITE_HIGH",
    "DEPLOY",
    "SECURITY",
    "FINANCIAL",
    "NETWORK_EXTERNAL",
    "DATA_EXPORT",
    "IDENTITY"
  ]),
  allow: toolAllowSchema.optional(),
  deny: toolDenySchema.optional(),
  maxBytes: z.number().int().positive().optional(),
  requireExecTicket: z.boolean().optional(),
  denyByDefault: z.boolean().optional(),
  context: toolContextSchema.optional()
});

export const toolsConfigSchema = z.object({
  tools: z.object({
    version: z.literal(1),
    denyByDefault: z.boolean().default(true),
    allowedTools: z.array(toolDefinitionSchema)
  })
});

export type ToolDefinition = z.infer<typeof toolDefinitionSchema>;
export type ToolsConfig = z.infer<typeof toolsConfigSchema>;

export function defaultToolsConfig(): ToolsConfig {
  return toolsConfigSchema.parse({
    tools: {
      version: 1,
      denyByDefault: true,
      allowedTools: [
        {
          name: "fs.read",
          actionClass: "READ_ONLY",
          allow: { paths: ["./workspace/**"] },
          deny: { paths: ["**/.amc/**", "**/.git/**"] },
          maxBytes: 200000,
          requireExecTicket: false
        },
        {
          name: "fs.write",
          actionClass: "WRITE_LOW",
          allow: { paths: ["./workspace/output/**"] },
          deny: { paths: ["**/.amc/**", "**/.git/**"] },
          requireExecTicket: false
        },
        {
          name: "git.status",
          actionClass: "READ_ONLY"
        },
        {
          name: "git.commit",
          actionClass: "WRITE_LOW",
          requireExecTicket: true
        },
        {
          name: "git.push",
          actionClass: "DEPLOY",
          requireExecTicket: true
        },
        {
          name: "http.fetch",
          actionClass: "NETWORK_EXTERNAL",
          allow: {
            hostAllowlist: ["api.github.com", "hooks.slack.com"]
          },
          denyByDefault: true
        },
        {
          name: "process.spawn",
          actionClass: "WRITE_HIGH",
          allow: {
            binariesAllowlist: ["node", "python", "git"]
          },
          deny: {
            argvRegexDenylist: [
              "(^|\\s)rm(\\s|$)",
              "(^|\\s)sudo(\\s|$)",
              "(^|\\s)chmod(\\s|$)",
              "(^|\\s)chown(\\s|$)"
            ]
          },
          requireExecTicket: true
        }
      ]
    }
  });
}
