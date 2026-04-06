import { z } from "zod";

export const mechanicProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  targets: z.record(z.string(), z.number().int().min(0).max(5)),
  recommended: z.object({
    policyPacks: z.array(z.string().min(1)).default([]),
    budgetsBaseline: z.string().min(1),
    toolAllowlistHints: z.array(z.string().min(1)).default([])
  }),
  riskNotes: z.array(z.string().min(1)).min(1)
});

export const mechanicProfilesSchema = z.object({
  mechanicProfiles: z.object({
    version: z.literal(1),
    profiles: z.array(mechanicProfileSchema).min(1)
  })
});

export type MechanicProfiles = z.infer<typeof mechanicProfilesSchema>;
export type MechanicProfile = z.infer<typeof mechanicProfileSchema>;
