import { z } from "zod";

export const adapterKindSchema = z.enum(["CLI", "LIBRARY_NODE", "LIBRARY_PYTHON"]);
export const adapterRunModeSchema = z.enum(["SUPERVISE", "SANDBOX"]);
export const providerFamilySchema = z.enum([
  "OPENAI_COMPAT",
  "ANTHROPIC",
  "GEMINI",
  "XAI_GROK",
  "OPENROUTER",
  "CUSTOM_HTTP"
]);
export const leaseCarrierStrategySchema = z.enum(["ENV_API_KEY", "HEADER_X_AMC_LEASE"]);

export const adapterCapabilityEventIdSchema = z.enum([
  "process.started",
  "process.stdout",
  "process.stderr",
  "process.exited",
  "model.request",
  "model.response",
  "action.requested",
  "action.completed",
  "action.failed",
  "action.decision"
]);
export const adapterCapabilityControlIdSchema = z.enum([
  "gateway.route",
  "gateway.model",
  "gateway.budget",
  "gateway.freeze",
  "tool.allowlist",
  "provider.allow",
  "provider.deny",
  "provider.ask"
]);
export const adapterCapabilityActivationSchema = z.enum([
  "adapter_run",
  "gateway_routed",
  "hook_observe",
  "hook_control"
]);
export const adapterVersionSourceSchema = z.enum([
  "adapter_binary",
  "package_probe",
  "host_runtime",
  "shell_runtime",
  "mixed_runtime",
  "unknown"
]);
export const adapterCapabilityEntrySchema = z.object({
  id: adapterCapabilityEventIdSchema,
  activeWhen: z.array(adapterCapabilityActivationSchema).min(1)
}).strict();
export const adapterControlCapabilityEntrySchema = z.object({
  id: adapterCapabilityControlIdSchema,
  activeWhen: z.array(adapterCapabilityActivationSchema).min(1)
}).strict();
export const adapterCapabilityDeclarationSchema = z.object({
  declarationVersion: z.literal("1"),
  definitionVersion: z.union([z.string().regex(/^\d+\.\d+\.\d+$/), z.literal("unverified")]),
  versionSource: adapterVersionSourceSchema,
  events: z.array(adapterCapabilityEntrySchema),
  controls: z.array(adapterControlCapabilityEntrySchema),
  lossiness: z.object({
    level: z.enum(["redacted", "normalized", "partial", "unknown"]),
    omitted: z.array(z.string().min(1))
  }).strict(),
  verification: z.object({
    status: z.enum(["fixture_verified", "unverified"]),
    authority: z.enum(["amc", "publisher"]),
    evidenceRefs: z.array(z.string().min(1))
  }).strict()
}).strict().superRefine((value, ctx) => {
  if (new Set(value.events.map((row) => row.id)).size !== value.events.length) {
    ctx.addIssue({ code: "custom", path: ["events"], message: "duplicate event capability" });
  }
  if (new Set(value.controls.map((row) => row.id)).size !== value.controls.length) {
    ctx.addIssue({ code: "custom", path: ["controls"], message: "duplicate control capability" });
  }
});

export const unverifiedAdapterCapabilityDeclaration = adapterCapabilityDeclarationSchema.parse({
  declarationVersion: "1",
  definitionVersion: "unverified",
  versionSource: "unknown",
  events: [],
  controls: [],
  lossiness: {
    level: "unknown",
    omitted: ["capability declaration missing"]
  },
  verification: {
    status: "unverified",
    authority: "publisher",
    evidenceRefs: []
  }
});

export const adapterDefinitionSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  kind: adapterKindSchema,
  detection: z.object({
    commandCandidates: z.array(z.string().min(1)).min(1),
    versionArgs: z.array(z.string().min(1)).default(["--version"]),
    parseVersionRegex: z.string().min(1)
  }),
  providerFamily: providerFamilySchema,
  defaultRunMode: adapterRunModeSchema,
  envStrategy: z.object({
    leaseCarrier: leaseCarrierStrategySchema.default("ENV_API_KEY"),
    baseUrlEnv: z.object({
      keys: z.array(z.string().min(1)).default([]),
      valueTemplate: z.string().default("{{gatewayBase}}{{providerRoute}}")
    }),
    apiKeyEnv: z.object({
      keys: z.array(z.string().min(1)).default([]),
      valueTemplate: z.string().default("{{lease}}")
    }),
    proxyEnv: z.object({
      setHttpProxy: z.boolean().default(true),
      setHttpsProxy: z.boolean().default(true),
      noProxy: z.string().default("localhost,127.0.0.1,::1")
    })
  }),
  commandTemplate: z.object({
    executable: z.string().min(1),
    args: z.array(z.string()).default([]),
    supportsStdin: z.boolean().default(true)
  }),
  capabilities: adapterCapabilityDeclarationSchema.default(
    () => adapterCapabilityDeclarationSchema.parse(unverifiedAdapterCapabilityDeclaration)
  ),
  notes: z.string().optional()
});

export type AdapterDefinition = z.infer<typeof adapterDefinitionSchema>;
export type AdapterKind = z.infer<typeof adapterKindSchema>;
export type AdapterRunMode = z.infer<typeof adapterRunModeSchema>;
export type AdapterCapabilityEventId = z.infer<typeof adapterCapabilityEventIdSchema>;
export type AdapterCapabilityControlId = z.infer<typeof adapterCapabilityControlIdSchema>;
export type AdapterCapabilityActivation = z.infer<typeof adapterCapabilityActivationSchema>;
export type AdapterVersionSource = z.infer<typeof adapterVersionSourceSchema>;
export type AdapterCapabilityDeclaration = z.infer<typeof adapterCapabilityDeclarationSchema>;

export interface AdapterExecutionPlan {
  adapter: AdapterDefinition;
  executable: string;
  args: string[];
  providerRoute: string;
  model: string;
  mode: AdapterRunMode;
}
