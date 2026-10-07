import { isIP } from "node:net";
import { z } from "zod";
import { ACTION_CLASSES } from "../governor/actionCatalog.js";
import { protectedPathGlobs } from "./protectedPaths.js";

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

/** A lowercase host name, a `.suffix` or an IP literal without a zone; never a wildcard, port or URL. */
const egressHostSchema = z.string().min(1).max(253).refine(
  host => (isIP(host) !== 0 && !host.includes("%")) || /^\.?(?:[a-z0-9-]+\.)*[a-z0-9-]+$/.test(host),
  "egress hosts are lowercase names, .suffix entries or IP literals"
);

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
  context: toolContextSchema.optional(),
  // The argument that carries each protected fact an approval binds (P1-02). A closed set of roles, like
  // toolArgumentRoles.ts: FINANCIAL tools must name amount, currency and recipient, DATA_EXPORT tools destination.
  bindingFields: z.object({
    amount: z.string().min(1).max(128).optional(),
    currency: z.string().min(1).max(128).optional(),
    recipient: z.string().min(1).max(128).optional(),
    destination: z.string().min(1).max(128).optional(),
    resourceId: z.string().min(1).max(128).optional(),
    resourceVersion: z.string().min(1).max(128).optional()
  }).strict().optional(),
  // What the tool's effect is and how AMC settles it (P1-04). `repeatable` is true only when repeating the effect is
  // harmless. `idempotency` names where AMC's per-execution key travels: an HTTP header the body sets, or an argument AMC
  // fills (excluded from the arguments digest). `reconcile` names the adapter that asks the system of record.
  effects: z.object({
    repeatable: z.boolean(),
    idempotency: z.object({ carrier: z.enum(["http-header", "argument"]), name: z.string().regex(/^[A-Za-z0-9_.-]{1,128}$/) }).strict().optional(),
    reconcile: z.object({ adapterId: z.string().min(1).max(128) }).strict().optional()
  }).strict().optional(),
  // These are mount grants, never per-call path glob exceptions. `os-native`
  // confines with Bubblewrap on Linux and Seatbelt on macOS; `linux-bwrap`
  // keeps its Linux-only meaning.
  nativeSandbox: z.object({
    kind: z.enum(["linux-bwrap", "os-native"]),
    writableDirectories: z.array(z.string().min(1).max(4096)).max(64),
    // Hosts reachable through AMC's per-call egress proxy; absent denies all networking.
    egress: z.object({ allowHosts: z.array(egressHostSchema).min(1).max(256) }).strict().optional(),
    // Exact paths (workspace-relative, absolute or `~/`) the shell may neither read nor write.
    readDeny: z.array(z.string().min(1).max(4096)).max(64).optional(),
    // Processes the shell may add to the user's count at launch (RLIMIT_NPROC); default 256.
    maxProcesses: z.number().int().min(1).max(4096).optional()
  }).strict().optional()
}).superRefine((tool, ctx) => {
  // AMC overwrites the carrier argument, so it must never be an argument that carries a protected fact.
  const carrier = tool.effects?.idempotency;
  if (carrier?.carrier === "argument" && Object.values(tool.bindingFields ?? {}).includes(carrier.name)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["effects", "idempotency", "name"], message: "the idempotency argument cannot be a binding field" });
  }
  if (tool.nativeSandbox && (tool.name !== "bash" || tool.actionClass !== "WRITE_HIGH" || tool.context?.kind === "mcp")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nativeSandbox"], message: "nativeSandbox requires the native bash WRITE_HIGH tool" });
  }
});

export const toolsConfigSchema = z.object({
  tools: z.object({
    version: z.literal(1),
    denyByDefault: z.boolean().default(true),
    allowedTools: z.array(toolDefinitionSchema)
  })
});

export type ToolDefinition = z.infer<typeof toolDefinitionSchema>;
export type EffectDeclaration = NonNullable<ToolDefinition["effects"]>;
export type ToolsConfig = z.infer<typeof toolsConfigSchema>;

/**
 * Deny globs every filesystem entry carries.
 *
 * These name the protected paths in the file an operator actually reads.
 * Deleting them from a signed config changes nothing — `pathAllowedByPatterns`
 * refuses these locations before any list is consulted — but a policy nobody
 * can see is a policy nobody can audit, and this is the file they audit.
 */
const PROTECTED_DENY_GLOBS = [...protectedPathGlobs(), "**/.git/**"];

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
          deny: { paths: PROTECTED_DENY_GLOBS },
          maxBytes: 200000,
          requireExecTicket: false
        },
        {
          name: "fs.write",
          actionClass: "WRITE_LOW",
          allow: { paths: ["./workspace/output/**"] },
          deny: { paths: PROTECTED_DENY_GLOBS },
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
          deny: { paths: PROTECTED_DENY_GLOBS },
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
