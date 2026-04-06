import { z } from "zod";
import { adapterRunModeSchema } from "./adapterTypes.js";
import { leaseScopeSchema } from "../leases/leaseSchema.js";

export const adapterAgentProfileSchema = z.object({
  preferredAdapter: z.string().min(1),
  preferredProviderRoute: z.string().startsWith("/"),
  preferredModel: z.string().min(1).default("gpt-4o-mini"),
  runMode: adapterRunModeSchema.default("SUPERVISE"),
  leaseScopes: z.array(leaseScopeSchema).min(1),
  routeAllowlist: z.array(z.string().startsWith("/")).min(1),
  modelAllowlist: z.array(z.string().min(1)).min(1)
});

export const adapterConfigSchema = z.object({
  adapters: z.object({
    version: z.literal(1),
    defaults: z.object({
      gatewayBase: z.string().url(),
      proxyBase: z.string().url(),
      leaseTtlMinutes: z.number().int().min(1).max(24 * 60).default(60),
      modelDefault: z.string().min(1).default("gpt-4o-mini")
    }),
    perAgent: z.record(z.string(), adapterAgentProfileSchema).default({})
  })
});

export type AdapterConfig = z.infer<typeof adapterConfigSchema>;
export type AdapterAgentProfile = z.infer<typeof adapterAgentProfileSchema>;

export function defaultAdapterConfig(): AdapterConfig {
  return adapterConfigSchema.parse({
    adapters: {
      version: 1,
      defaults: {
        gatewayBase: "http://127.0.0.1:3210",
        proxyBase: "http://127.0.0.1:3211",
        leaseTtlMinutes: 60,
        modelDefault: "gpt-4o-mini"
      },
      perAgent: {}
    }
  });
}

