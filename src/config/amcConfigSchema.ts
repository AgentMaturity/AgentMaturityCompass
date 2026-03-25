/**
 * amcconfig.yaml — Declarative Configuration Schema
 *
 * Single YAML file that defines agents to test, maturity thresholds,
 * assurance packs, providers, and evaluation settings.
 * Declarative YAML-based configuration for AMC.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Provider config — which LLM providers to route through
// ---------------------------------------------------------------------------

export const amcProviderSchema = z.object({
  /** Provider template ID (openai, anthropic, google, etc.) */
  id: z.string(),
  /** Display name for reports */
  label: z.string().optional(),
  /** Override base URL */
  baseUrl: z.string().url().optional(),
  /** Env var name holding the API key */
  apiKeyEnv: z.string().optional(),
  /** Default model to use */
  model: z.string().optional(),
  /** Extra headers to inject */
  headers: z.record(z.string()).optional(),
});

export type AMCProvider = z.infer<typeof amcProviderSchema>;

// ---------------------------------------------------------------------------
// Agent definition — which agents to evaluate
// ---------------------------------------------------------------------------

export const amcAgentSchema = z.object({
  /** Agent ID (used as fleet agent ID) */
  id: z.string(),
  /** Human-readable name */
  name: z.string().optional(),
  /** Runtime type */
  runtime: z.enum(["claude", "gemini", "openclaw", "mock", "any", "gateway", "sandbox"]).default("any"),
  /** Agent's role/domain description */
  role: z.string().optional(),
  /** Domain the agent operates in */
  domain: z.string().optional(),
  /** Primary tasks the agent performs */
  primaryTasks: z.array(z.string()).optional(),
  /** Stakeholders who depend on this agent */
  stakeholders: z.array(z.string()).optional(),
  /** Risk tier classification */
  riskTier: z.enum(["low", "med", "high", "critical"]).default("med"),
  /** Provider to use for this agent (references providers[].id) */
  provider: z.string().optional(),
  /** Custom command to run the agent */
  command: z.string().optional(),
  /** Command arguments */
  args: z.array(z.string()).optional(),
  /** Extra environment variables */
  env: z.record(z.string()).optional(),
});

export type AMCAgent = z.infer<typeof amcAgentSchema>;

// ---------------------------------------------------------------------------
// Maturity thresholds — pass/fail gates
// ---------------------------------------------------------------------------

export const layerNameSchema = z.enum([
  "Strategic Agent Operations",
  "Leadership & Autonomy",
  "Culture & Alignment",
  "Resilience",
  "Skills",
]);

export const thresholdsSchema = z.object({
  /** Minimum overall IntegrityIndex (0-1) to pass */
  minIntegrityIndex: z.number().min(0).max(1).default(0.5),
  /** Minimum overall maturity level (0-5) */
  minOverallLevel: z.number().min(0).max(5).default(2),
  /** Per-layer minimum levels */
  layers: z.record(layerNameSchema, z.number().min(0).max(5)).optional(),
  /** Require OBSERVED trust tier for L5 claims */
  requireObservedForLevel5: z.boolean().default(true),
  /** Deny if trust label is LOW */
  denyIfLowTrust: z.boolean().default(false),
  /** Minimum value score (if value module enabled) */
  minValueScore: z.number().min(0).optional(),
  /** Maximum allowed cost increase ratio */
  maxCostIncreaseRatio: z.number().optional(),
});

export type AMCThresholds = z.infer<typeof thresholdsSchema>;

// ---------------------------------------------------------------------------
// Assurance pack config — which red-team/safety packs to run
// ---------------------------------------------------------------------------

export const assurancePackRefSchema = z.union([
  /** Just the pack ID string */
  z.string(),
  /** Pack with overrides */
  z.object({
    id: z.string(),
    /** Override scenarios to include (by ID) */
    scenarios: z.array(z.string()).optional(),
    /** Skip specific scenarios */
    skip: z.array(z.string()).optional(),
    /** Severity threshold: skip scenarios below this */
    minSeverity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
  }),
]);

export type AMCAssurancePackRef = z.infer<typeof assurancePackRefSchema>;

export const assuranceConfigSchema = z.object({
  /** Run all available packs */
  runAll: z.boolean().default(false),
  /** Specific packs to run (overrides runAll) */
  packs: z.array(assurancePackRefSchema).optional(),
  /** Mode for assurance runs */
  mode: z.enum(["supervise", "sandbox"]).default("supervise"),
  /** Evidence window */
  window: z.string().default("30d"),
  /** Categories to include (e.g., "security", "compliance", "safety") */
  categories: z.array(z.string()).optional(),
  /** Industry-specific pack groups */
  industries: z.array(z.enum([
    "healthcare",
    "financial",
    "education",
    "legal",
    "pharma",
    "automotive",
    "infrastructure",
    "technology",
  ])).optional(),
});

export type AMCAssuranceConfig = z.infer<typeof assuranceConfigSchema>;

// ---------------------------------------------------------------------------
// Diagnostic config — maturity scoring settings
// ---------------------------------------------------------------------------

export const diagnosticConfigSchema = z.object({
  /** Evidence window for scoring */
  window: z.string().default("30d"),
  /** Claim mode */
  claimMode: z.enum(["auto", "owner", "harness"]).default("auto"),
  /** Specific question IDs to evaluate (default: all) */
  questions: z.array(z.string()).optional(),
  /** Skip specific question IDs */
  skipQuestions: z.array(z.string()).optional(),
  /** Layers to include (default: all) */
  layers: z.array(layerNameSchema).optional(),
});

export type AMCDiagnosticConfig = z.infer<typeof diagnosticConfigSchema>;

// ---------------------------------------------------------------------------
// Output config — how to deliver results
// ---------------------------------------------------------------------------

export const outputConfigSchema = z.object({
  /** Output format(s) */
  formats: z.array(z.enum(["json", "html", "terminal", "markdown", "badge"])).default(["terminal"]),
  /** Output directory for reports */
  outputDir: z.string().optional(),
  /** Generate CI badge */
  badge: z.boolean().default(false),
  /** Badge output path */
  badgePath: z.string().optional(),
  /** Share results (generate shareable URL) */
  share: z.boolean().default(false),
});

export type AMCOutputConfig = z.infer<typeof outputConfigSchema>;

// ---------------------------------------------------------------------------
// CI/CD integration config
// ---------------------------------------------------------------------------

export const ciConfigSchema = z.object({
  /** Fail CI on threshold violation */
  failOnThresholdViolation: z.boolean().default(true),
  /** Fail CI on any assurance pack failure */
  failOnAssuranceFailure: z.boolean().default(false),
  /** GitHub Actions: post comment on PR */
  githubComment: z.boolean().default(false),
  /** Upload results as CI artifact */
  uploadArtifact: z.boolean().default(false),
  /** Artifact name */
  artifactName: z.string().default("amc-results"),
});

export type AMCCIConfig = z.infer<typeof ciConfigSchema>;

// ---------------------------------------------------------------------------
// Framework mappings
// ---------------------------------------------------------------------------

export const frameworksConfigSchema = z.object({
  /** Enable EU AI Act article-level mapping */
  euAiAct: z.boolean().default(false),
  /** Enable NIST AI RMF mapping */
  nistAiRmf: z.boolean().default(false),
  /** Enable OWASP LLM Top 10 mapping */
  owaspLlmTop10: z.boolean().default(false),
  /** Enable ISO 42001 mapping */
  iso42001: z.boolean().default(false),
  /** Enable OWASP GenAI mapping */
  owaspGenAi: z.boolean().default(false),
  /** Custom framework IDs */
  custom: z.array(z.string()).optional(),
});

export type AMCFrameworksConfig = z.infer<typeof frameworksConfigSchema>;

// ---------------------------------------------------------------------------
// Top-level amcconfig.yaml schema
// ---------------------------------------------------------------------------

export const amcDeclarativeConfigSchema = z.object({
  /** Config format version */
  version: z.literal("1.0").default("1.0"),

  /** Human description of what this config evaluates */
  description: z.string().optional(),

  /** Agents to evaluate */
  agents: z.array(amcAgentSchema).min(1),

  /** LLM providers available for gateway routing */
  providers: z.array(amcProviderSchema).optional(),

  /** Maturity thresholds (quality gates) */
  thresholds: thresholdsSchema.optional(),

  /** Assurance pack configuration */
  assurance: assuranceConfigSchema.optional(),

  /** Diagnostic scoring configuration */
  diagnostic: diagnosticConfigSchema.optional(),

  /** Output configuration */
  output: outputConfigSchema.optional(),

  /** CI/CD integration */
  ci: ciConfigSchema.optional(),

  /** Compliance framework mappings */
  frameworks: frameworksConfigSchema.optional(),

  /** Security settings */
  security: z.object({
    trustBoundaryMode: z.enum(["isolated", "shared"]).default("shared"),
  }).optional(),

  /** Extra environment variables for all agents */
  env: z.record(z.string()).optional(),
});

export type AMCDeclarativeConfig = z.infer<typeof amcDeclarativeConfigSchema>;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export function defaultDeclarativeConfig(): AMCDeclarativeConfig {
  return {
    version: "1.0",
    agents: [],
    thresholds: {
      minIntegrityIndex: 0.5,
      minOverallLevel: 2,
      requireObservedForLevel5: true,
      denyIfLowTrust: false,
    },
    assurance: {
      runAll: false,
      mode: "supervise",
      window: "30d",
    },
    diagnostic: {
      window: "30d",
      claimMode: "auto",
    },
    output: {
      formats: ["terminal"],
      badge: false,
      share: false,
    },
    ci: {
      failOnThresholdViolation: true,
      failOnAssuranceFailure: false,
      githubComment: false,
      uploadArtifact: false,
      artifactName: "amc-results",
    },
  };
}
