import { z } from "zod";
import { questionBank } from "../diagnostic/questionBank.js";

export const mechanicScopeSchema = z.object({
  type: z.enum(["WORKSPACE", "NODE", "AGENT"]),
  id: z.string().min(1)
});

export const mechanicTargetsSchema = z
  .object({
    mechanicTargets: z.object({
      version: z.literal(1),
      scope: mechanicScopeSchema,
      mode: z.enum(["DESIRED", "EXCELLENCE"]),
      targets: z.record(z.string(), z.number().int().min(0).max(5)),
      dimensionMinimums: z
        .object({
          "DIM-1": z.number().int().min(0).max(5).optional(),
          "DIM-2": z.number().int().min(0).max(5).optional(),
          "DIM-3": z.number().int().min(0).max(5).optional(),
          "DIM-4": z.number().int().min(0).max(5).optional(),
          "DIM-5": z.number().int().min(0).max(5).optional()
        })
        .default({}),
      locking: z.object({
        preventLoweringBelowMeasured: z.boolean().default(true),
        maxStepChangePerApply: z.number().int().min(1).max(5).default(2),
        requireReasonForChange: z.boolean().default(true)
      }),
      createdTs: z.number().int().nonnegative(),
      updatedTs: z.number().int().nonnegative()
    })
  })
  .superRefine((value, ctx) => {
    const ids = questionBank.map((q) => q.id).sort((a, b) => a.localeCompare(b));
    const keys = Object.keys(value.mechanicTargets.targets).sort((a, b) => a.localeCompare(b));
    if (keys.length !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `targets must contain exactly ${ids.length} question keys`
      });
      return;
    }
    for (const id of ids) {
      if (!(id in value.mechanicTargets.targets)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `missing target key: ${id}`
        });
      }
    }
  });

export type MechanicTargets = z.infer<typeof mechanicTargetsSchema>;
export type MechanicScope = z.infer<typeof mechanicScopeSchema>;
