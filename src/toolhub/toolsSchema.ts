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
        // The P4.3 built-ins. They have to be listed or the allowlist guard
        // denies them, and an unlisted tool is a tool that does not work.
        //
        // `fs.edit` takes `fs.write`'s scope rather than a wider one. Widening
        // the shipped filesystem posture is a security decision on its own
        // merits, not something to slip in while wiring — an operator who wants
        // an agent editing the whole repository widens these deliberately, and
        // `amc agent-loop run --tools workspace` says what the scope currently
        // is so they can see what they have.
        {
          name: "fs.edit",
          actionClass: "WRITE_LOW",
          allow: { paths: ["./workspace/output/**"] },
          deny: { paths: ["**/.amc/**", "**/.git/**"] },
          requireExecTicket: false
        },
        {
          name: "glob",
          actionClass: "READ_ONLY"
        },
        {
          name: "grep",
          actionClass: "READ_ONLY"
        },
        {
          name: "bash",
          actionClass: "WRITE_HIGH",
          allow: {
            binariesAllowlist: []
          },
          deny: {
            argvRegexDenylist: [
              "(^|\\s)rm\\s+-rf(\\s|$)",
              "(^|\\s)sudo(\\s|$)",
              "(^|\\s)curl(\\s|$)",
              "(^|\\s)wget(\\s|$)"
            ]
          },
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
