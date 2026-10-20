import { signatureEnvelopeSchema } from "../crypto/signing/signatureEnvelope.js";
import { z } from "zod";

export const promptPackProviderSchema = z.enum(["openai", "anthropic", "gemini", "xai", "openrouter", "generic"]);
export type PromptPackProvider = z.infer<typeof promptPackProviderSchema>;

export const promptPackAgentTypeSchema = z.enum([
  "code-agent",
  "support-agent",
  "ops-agent",
  "research-agent",
  "sales-agent",
  "other"
]);

export const promptPackRiskTierSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const promptPackSchema = z.object({
  v: z.literal(1),
  packId: z.string().regex(/^pp_[a-zA-Z0-9_-]{8,}$/),
  generatedTs: z.number().int(),
  templateId: z.string().min(1),
  agent: z.object({
    agentIdHash: z.string().regex(/^[a-f0-9]{8,64}$/),
    agentType: promptPackAgentTypeSchema,
    riskTier: promptPackRiskTierSchema,
    workspaceIdHash: z.string().regex(/^[a-f0-9]{8,64}$/)
  }),
  bindings: z.object({
    cgxPackSha256: z.string().length(64),
    promptPolicySha256: z.string().length(64),
    canonSha256: z.string().length(64),
    bankSha256: z.string().length(64),
    mechanicTargetsSha256: z.string().length(64).nullable().optional(),
    trustMode: z.enum(["LOCAL_VAULT", "NOTARY"]),
    notaryFingerprint: z.string().length(64).nullable().optional()
  }),
  northstar: z.object({
    mission: z.object({
      summary: z.string().min(1),
      sources: z.array(z.string().min(1)).min(1)
    }),
    constraints: z.array(z.string().min(1)).min(1),
    recurrence: z.object({
      cadenceHours: z.number().int().min(1),
      selfReflectionChecklist: z.array(z.string().min(1)).min(1)
    }),
    outputContract: z.object({
      schemaId: z.string().min(1),
      jsonExample: z.object({
        v: z.literal(1),
        answer: z.string().min(1),
        claims: z
          .array(
            z.object({
              text: z.string().min(1),
              evidenceRefs: z.array(z.string().min(1)).optional()
            })
          )
          .default([]),
        unknowns: z.array(z.object({ text: z.string().min(1) })).default([]),
        nextActions: z.array(z.object({ actionId: z.string().min(1), requiresApproval: z.boolean() })).default([])
      })
    })
  }),
  allowlists: z.object({
    providers: z.array(z.string().min(1)),
    models: z.array(z.string().min(1)),
    tools: z.array(z.string().min(1)),
    highRiskTools: z.array(z.string().min(1))
  }),
  checkpoints: z.object({
    topTransformTasks: z.array(
      z.object({
        taskId: z.string().min(1),
        title: z.string().min(1),
        why: z.string().min(1),
        evidenceToVerify: z.array(z.string().min(1))
      })
    ),
    currentAdvisories: z.array(
      z.object({
        advisoryId: z.string().min(1),
        severity: z.enum(["INFO", "WARN", "CRITICAL"]),
        category: z.string().min(1),
        summary: z.string().min(1)
      })
    )
  })
});

export const promptPackSignatureSchema = z.object({
  digestSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("auditor"),
  envelope: signatureEnvelopeSchema.optional()
});

export const promptProviderOpenAiSchema = z.object({
  v: z.literal(1),
  systemMessage: z.string().min(1),
  responseHints: z.object({
    preferJson: z.boolean(),
    responseFormatJson: z.boolean()
  })
});

export const promptProviderAnthropicSchema = z.object({
  v: z.literal(1),
  system: z.string().min(1),
  maxTokensHint: z.number().int().min(1)
});

export const promptProviderGeminiSchema = z.object({
  v: z.literal(1),
  systemInstruction: z.string().min(1),
  safetySettings: z.array(
    z.object({
      category: z.string().min(1),
      threshold: z.string().min(1)
    })
  )
});

export const promptProviderGenericSchema = z.object({
  v: z.literal(1),
  systemMessage: z.string().min(1)
});

export const promptLintFindingSchema = z.object({
  severity: z.enum(["HIGH", "MEDIUM", "LOW"]),
  type: z.enum(["SECRET", "EMAIL", "URL", "FILE_PATH", "PRIVATE_KEY", "POLICY_LEAK"]),
  path: z.string().min(1),
  snippetHash: z.string().length(64)
});

export const promptLintSchema = z.object({
  v: z.literal(1),
  status: z.enum(["PASS", "FAIL"]),
  findings: z.array(promptLintFindingSchema)
});

export type PromptPack = z.infer<typeof promptPackSchema>;
export type PromptPackSignature = z.infer<typeof promptPackSignatureSchema>;
export type PromptLintReport = z.infer<typeof promptLintSchema>;

export type PromptProviderFiles = {
  openai: z.infer<typeof promptProviderOpenAiSchema>;
  anthropic: z.infer<typeof promptProviderAnthropicSchema>;
  gemini: z.infer<typeof promptProviderGeminiSchema>;
  xai: z.infer<typeof promptProviderOpenAiSchema>;
  openrouter: z.infer<typeof promptProviderOpenAiSchema>;
  generic: z.infer<typeof promptProviderGenericSchema>;
};
