import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import YAML from "yaml";
import { MetricRegistry, type MetricTemplate } from "../agents/metricTemplates.js";
import { listAssurancePacks } from "../assurance/packs/index.js";
import {
  artifactSigPath,
  readAndVerifyArtifactFileSignature,
  signArtifactFile,
} from "../lifecycle/artifactSignature.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { amcVersion } from "../version.js";
import { ExtendedLLMJudgeEngine } from "./extendedLLMJudge.js";

const REGISTRY_SCHEMA_VERSION = "2026-07-12" as const;
const REGISTRY_ARTIFACT_KIND = "evaluator-registry-manifest" as const;
const REGISTRY_CLAIM_BOUNDARY =
  "Signed evaluator metadata identifies the loaded AMC-owned inventory and its implementation fingerprints. It is not evaluator-result evidence and does not prove an evaluator ran, passed, or supports a maturity claim.";

const evaluatorKindSchema = z.enum([
  "deterministic-metric",
  "llm-judge",
  "assurance-pack",
  "custom-metric",
]);
const evaluatorSurfaceSchema = z.enum(["Score", "Shield"]);
const evaluatorTrustSchema = z.enum(["amc-owned", "unverified-custom"]);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

const evaluatorRegistryEntryBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  kind: evaluatorKindSchema,
  surfaces: z.array(evaluatorSurfaceSchema).min(1),
  categories: z.array(z.string().min(1)).min(1),
  outputType: z.string().min(1),
  version: z.string().min(1).nullable(),
  ownerModule: z.string().regex(/^(src|dist)\/[A-Za-z0-9_./-]+\.(ts|js)$/).nullable(),
  implementationSha256: sha256Schema,
  metadataTrust: evaluatorTrustSchema,
  resultEvidenceRequired: z.literal(true),
}).strict();

const evaluatorRegistryEntrySchema = evaluatorRegistryEntryBaseSchema.extend({
  definitionSha256: sha256Schema,
}).strict();

const countsByKindSchema = z.object({
  "deterministic-metric": z.number().int().nonnegative(),
  "llm-judge": z.number().int().nonnegative(),
  "assurance-pack": z.number().int().nonnegative(),
  "custom-metric": z.number().int().nonnegative(),
}).strict();

const countsBySurfaceSchema = z.object({
  Score: z.number().int().nonnegative(),
  Shield: z.number().int().nonnegative(),
}).strict();

const evaluatorRegistryProjectionSchema = z.object({
  schemaVersion: z.literal(REGISTRY_SCHEMA_VERSION),
  amcVersion: z.string().min(1),
  registrySha256: sha256Schema,
  entryCount: z.number().int().nonnegative(),
  trustedEntryCount: z.number().int().nonnegative(),
  unverifiedEntryCount: z.number().int().nonnegative(),
  countsByKind: countsByKindSchema,
  countsBySurface: countsBySurfaceSchema,
  entries: z.array(evaluatorRegistryEntrySchema),
}).strict();

const evaluatorRegistryManifestSchema = z.object({
  generatedAt: z.string().datetime(),
  ...evaluatorRegistryProjectionSchema.shape,
}).strict();

export type EvaluatorRegistryEntry = z.infer<typeof evaluatorRegistryEntrySchema>;
export type EvaluatorRegistryProjection = z.infer<typeof evaluatorRegistryProjectionSchema>;
export type EvaluatorRegistryManifest = z.infer<typeof evaluatorRegistryManifestSchema>;
export type EvaluatorRegistryStatusName = "uninitialized" | "trusted" | "partial" | "stale" | "invalid";

export interface EvaluatorRegistryStatus {
  status: EvaluatorRegistryStatusName;
  claimEligible: boolean;
  path: "$WORKSPACE/.amc/evaluators/registry.json";
  signaturePath: "$WORKSPACE/.amc/evaluators/registry.json.sig";
  current: EvaluatorRegistryProjection;
  signedSnapshot: EvaluatorRegistryManifest | null;
  reasonCodes: string[];
  claimBoundary: string;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort(compareStrings);
}

function hashParts(parts: Array<string | Buffer>): string {
  return sha256Hex(parts.map((part) => (
    typeof part === "string" ? part : sha256Hex(part)
  )).join("\0"));
}

function loadedModules(): {
  metricTemplates: { owner: string; bytes: Buffer };
  llmJudgeEngine: { owner: string; bytes: Buffer };
  extendedLLMJudge: { owner: string; bytes: Buffer };
  assurancePacks: { owner: string; bytes: Buffer };
} {
  const currentExtension = extname(fileURLToPath(import.meta.url));
  const extension = currentExtension === ".ts" ? ".ts" : ".js";
  const root = extension === ".ts" ? "src" : "dist";
  const module = (relativePath: string, ownerPath: string): { owner: string; bytes: Buffer } => ({
    owner: `${root}/${ownerPath}${extension}`,
    bytes: readFileSync(new URL(`${relativePath}${extension}`, import.meta.url)),
  });
  return {
    metricTemplates: module("../agents/metricTemplates", "agents/metricTemplates"),
    llmJudgeEngine: module("./llmJudgeEngine", "eval/llmJudgeEngine"),
    extendedLLMJudge: module("./extendedLLMJudge", "eval/extendedLLMJudge"),
    assurancePacks: module("../assurance/packs/index", "assurance/packs/index"),
  };
}

function metricFingerprint(metric: MetricTemplate): string {
  return hashParts([
    canonicalize({
      id: metric.id,
      name: metric.name,
      description: metric.description,
      category: metric.category,
      outputType: metric.outputType,
      defaultThreshold: metric.defaultThreshold,
    }),
    metric.evaluate.toString(),
  ]);
}

function finalizeEntry(input: z.infer<typeof evaluatorRegistryEntryBaseSchema>): EvaluatorRegistryEntry {
  const base = evaluatorRegistryEntryBaseSchema.parse({
    ...input,
    surfaces: sortedUnique(input.surfaces) as Array<"Score" | "Shield">,
    categories: sortedUnique(input.categories),
  });
  return evaluatorRegistryEntrySchema.parse({
    ...base,
    definitionSha256: sha256Hex(canonicalize(base)),
  });
}

function metricEntries(
  metricRegistry: MetricRegistry,
  version: string,
  modules: ReturnType<typeof loadedModules>,
): EvaluatorRegistryEntry[] {
  const baseline = new MetricRegistry();
  const trustedFingerprints = new Map(
    baseline.getAllMetrics().map((metric) => [metric.id, metricFingerprint(metric)]),
  );
  const ownerImplementationSha256 = sha256Hex(modules.metricTemplates.bytes);
  return metricRegistry.getAllMetrics().map((metric) => {
    const fingerprint = metricFingerprint(metric);
    const trusted = trustedFingerprints.get(metric.id) === fingerprint;
    return finalizeEntry({
      id: `${trusted ? "metric" : "custom-metric"}://amc/${encodeURIComponent(metric.id)}`,
      name: metric.name,
      description: metric.description,
      kind: trusted ? "deterministic-metric" : "custom-metric",
      surfaces: metric.category === "safety" ? ["Score", "Shield"] : ["Score"],
      categories: [metric.category],
      outputType: metric.outputType,
      version: trusted ? version : null,
      ownerModule: trusted ? modules.metricTemplates.owner : null,
      implementationSha256: trusted ? ownerImplementationSha256 : fingerprint,
      metadataTrust: trusted ? "amc-owned" : "unverified-custom",
      resultEvidenceRequired: true,
    });
  });
}

function judgeEntries(
  version: string,
  modules: ReturnType<typeof loadedModules>,
): EvaluatorRegistryEntry[] {
  const categories = new ExtendedLLMJudgeEngine().getMetricCategories();
  const implementationSha256 = hashParts([
    modules.llmJudgeEngine.bytes,
    modules.extendedLLMJudge.bytes,
  ]);
  return Object.entries(categories).flatMap(([category, metrics]) => metrics.map((metric) => finalizeEntry({
    id: `judge://amc/${metric}`,
    name: metric,
    description: `AMC LLM-as-judge metric for ${category} evaluation.`,
    kind: "llm-judge",
    surfaces: category === "safety" ? ["Score", "Shield"] : ["Score"],
    categories: [category],
    outputType: "float",
    version,
    ownerModule: modules.extendedLLMJudge.owner,
    implementationSha256,
    metadataTrust: "amc-owned",
    resultEvidenceRequired: true,
  })));
}

function assuranceEntries(
  version: string,
  modules: ReturnType<typeof loadedModules>,
): EvaluatorRegistryEntry[] {
  return listAssurancePacks().map((pack) => {
    const implementationSha256 = hashParts([
      modules.assurancePacks.bytes,
      canonicalize(pack.scenarios.map((scenario) => ({
        id: scenario.id,
        title: scenario.title,
        category: scenario.category,
        riskTier: scenario.riskTier,
      }))),
      ...pack.scenarios.flatMap((scenario) => [scenario.buildPrompt.toString(), scenario.validate.toString()]),
    ]);
    return finalizeEntry({
      id: `assurance://amc/${pack.id}`,
      name: pack.title,
      description: pack.description,
      kind: "assurance-pack",
      surfaces: ["Shield"],
      categories: sortedUnique(pack.scenarios.map((scenario) => scenario.category)),
      outputType: "validation",
      version,
      ownerModule: modules.assurancePacks.owner,
      implementationSha256,
      metadataTrust: "amc-owned",
      resultEvidenceRequired: true,
    });
  });
}

function derivedCounts(entries: EvaluatorRegistryEntry[]): {
  entryCount: number;
  trustedEntryCount: number;
  unverifiedEntryCount: number;
  countsByKind: z.infer<typeof countsByKindSchema>;
  countsBySurface: z.infer<typeof countsBySurfaceSchema>;
} {
  const countsByKind: z.infer<typeof countsByKindSchema> = {
    "deterministic-metric": 0,
    "llm-judge": 0,
    "assurance-pack": 0,
    "custom-metric": 0,
  };
  const countsBySurface: z.infer<typeof countsBySurfaceSchema> = { Score: 0, Shield: 0 };
  for (const entry of entries) {
    countsByKind[entry.kind] += 1;
    for (const surface of entry.surfaces) countsBySurface[surface] += 1;
  }
  const trustedEntryCount = entries.filter((entry) => entry.metadataTrust === "amc-owned").length;
  return {
    entryCount: entries.length,
    trustedEntryCount,
    unverifiedEntryCount: entries.length - trustedEntryCount,
    countsByKind,
    countsBySurface,
  };
}

export function buildEvaluatorRegistryProjection(input: {
  metricRegistry?: MetricRegistry;
  version?: string;
} = {}): EvaluatorRegistryProjection {
  const version = input.version ?? amcVersion;
  const modules = loadedModules();
  const entries = [
    ...metricEntries(input.metricRegistry ?? new MetricRegistry(), version, modules),
    ...judgeEntries(version, modules),
    ...assuranceEntries(version, modules),
  ].sort((left, right) => compareStrings(left.id, right.id));
  const counts = derivedCounts(entries);
  const registrySha256 = sha256Hex(canonicalize({
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    amcVersion: version,
    entries,
  }));
  return evaluatorRegistryProjectionSchema.parse({
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    amcVersion: version,
    registrySha256,
    ...counts,
    entries,
  });
}

export function evaluatorRegistryRoot(workspace: string): string {
  return join(workspace, ".amc", "evaluators");
}

export function evaluatorRegistryPath(workspace: string): string {
  return join(evaluatorRegistryRoot(workspace), "registry.json");
}

function manifestIsConsistent(manifest: EvaluatorRegistryManifest): boolean {
  const ids = manifest.entries.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) return false;
  if (ids.some((id, index) => index > 0 && compareStrings(ids[index - 1]!, id) >= 0)) return false;
  for (const entry of manifest.entries) {
    const { definitionSha256, ...base } = entry;
    if (definitionSha256 !== sha256Hex(canonicalize(base))) return false;
    if (entry.categories.join("\0") !== sortedUnique(entry.categories).join("\0")) return false;
    if (entry.surfaces.join("\0") !== sortedUnique(entry.surfaces).join("\0")) return false;
  }
  const counts = derivedCounts(manifest.entries);
  if (canonicalize({
    entryCount: manifest.entryCount,
    trustedEntryCount: manifest.trustedEntryCount,
    unverifiedEntryCount: manifest.unverifiedEntryCount,
    countsByKind: manifest.countsByKind,
    countsBySurface: manifest.countsBySurface,
  }) !== canonicalize(counts)) return false;
  const registrySha256 = sha256Hex(canonicalize({
    schemaVersion: manifest.schemaVersion,
    amcVersion: manifest.amcVersion,
    entries: manifest.entries,
  }));
  return manifest.registrySha256 === registrySha256;
}

function parseSignedManifest(bytes: Buffer): EvaluatorRegistryManifest | null {
  try {
    const raw = bytes.toString("utf8");
    const document = YAML.parseDocument(raw, { uniqueKeys: true });
    if (document.errors.length > 0) return null;
    const parsed = evaluatorRegistryManifestSchema.parse(JSON.parse(raw) as unknown);
    return manifestIsConsistent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function evaluatorRegistryStatus(input: {
  workspace: string;
  metricRegistry?: MetricRegistry;
}): EvaluatorRegistryStatus {
  const current = buildEvaluatorRegistryProjection({ metricRegistry: input.metricRegistry });
  const path = evaluatorRegistryPath(input.workspace);
  const base = {
    path: "$WORKSPACE/.amc/evaluators/registry.json" as const,
    signaturePath: "$WORKSPACE/.amc/evaluators/registry.json.sig" as const,
    current,
    claimBoundary: REGISTRY_CLAIM_BOUNDARY,
  };
  if (!pathExists(path) && !pathExists(artifactSigPath(path))) {
    return {
      ...base,
      status: "uninitialized",
      claimEligible: false,
      signedSnapshot: null,
      reasonCodes: ["SIGNED_REGISTRY_MISSING"],
    };
  }
  const verification = readAndVerifyArtifactFileSignature({
    workspace: input.workspace,
    path,
    artifactKind: REGISTRY_ARTIFACT_KIND,
    requireDomainSeparated: true,
  });
  const signedSnapshot = verification.valid && verification.artifactBytes
    ? parseSignedManifest(verification.artifactBytes)
    : null;
  if (!signedSnapshot) {
    return {
      ...base,
      status: "invalid",
      claimEligible: false,
      signedSnapshot: null,
      reasonCodes: ["SIGNED_REGISTRY_INVALID"],
    };
  }
  if (signedSnapshot.registrySha256 !== current.registrySha256) {
    return {
      ...base,
      status: "stale",
      claimEligible: false,
      signedSnapshot,
      reasonCodes: ["CURRENT_RUNTIME_DRIFT"],
    };
  }
  if (current.unverifiedEntryCount > 0) {
    return {
      ...base,
      status: "partial",
      claimEligible: false,
      signedSnapshot,
      reasonCodes: ["UNVERIFIED_CUSTOM_EVALUATORS"],
    };
  }
  return {
    ...base,
    status: "trusted",
    claimEligible: true,
    signedSnapshot,
    reasonCodes: [],
  };
}

export function refreshEvaluatorRegistry(input: {
  workspace: string;
  metricRegistry?: MetricRegistry;
}): EvaluatorRegistryStatus {
  return withControlFileLock({
    root: evaluatorRegistryRoot(input.workspace),
    name: "registry",
    operation: () => {
      const projection = buildEvaluatorRegistryProjection({ metricRegistry: input.metricRegistry });
      const path = evaluatorRegistryPath(input.workspace);
      ensureDir(evaluatorRegistryRoot(input.workspace));
      const manifest = evaluatorRegistryManifestSchema.parse({
        generatedAt: new Date().toISOString(),
        ...projection,
      });
      writeFileAtomic(path, `${JSON.stringify(manifest, null, 2)}\n`, 0o644);
      signArtifactFile({
        workspace: input.workspace,
        path,
        artifactKind: REGISTRY_ARTIFACT_KIND,
      });
      return evaluatorRegistryStatus(input);
    },
  });
}

export function renderEvaluatorRegistryStatusText(status: EvaluatorRegistryStatus): string {
  const kinds = status.current.countsByKind;
  const surfaces = status.current.countsBySurface;
  const lines = [
    `Evaluator registry: ${status.status.toUpperCase()}`,
    `Entries: ${status.current.entryCount} (${status.current.trustedEntryCount} trusted, ${status.current.unverifiedEntryCount} unverified)`,
    `Kinds: deterministic=${kinds["deterministic-metric"]}, judge=${kinds["llm-judge"]}, assurance=${kinds["assurance-pack"]}, custom=${kinds["custom-metric"]}`,
    `Surfaces: Score=${surfaces.Score}, Shield=${surfaces.Shield}`,
    `Current hash: ${status.current.registrySha256}`,
    `Signed hash: ${status.signedSnapshot?.registrySha256 ?? "missing"}`,
  ];
  if (status.reasonCodes.length > 0) lines.push(`Notes: ${status.reasonCodes.join(", ")}`);
  lines.push(`Claim boundary: ${status.claimBoundary}`);
  return `${lines.join("\n")}\n`;
}
