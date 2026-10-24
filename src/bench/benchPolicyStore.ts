import { join } from "node:path";
import YAML from "yaml";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { signFileWithAuditor } from "../org/orgSigner.js";
import { captureOrgPairs, orgPairBytes, publishOrgPairs, publishOrgPairsAsync, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { readFileSync } from "node:fs";
import { benchPolicySchema, defaultBenchPolicy, type BenchPolicy } from "./benchPolicySchema.js";
import { benchComparisonSchema, benchPiiScanSchema, type BenchComparison, type BenchPiiScanReport } from "./benchSchema.js";
import { benchRegistryConfigSchema, type BenchRegistryConfig } from "./benchRegistrySchema.js";

function benchRootDir(workspace: string): string {
  return join(workspace, ".amc", "bench");
}

export function benchPolicyPath(workspace: string): string {
  return join(benchRootDir(workspace), "policy.yaml");
}

export function benchPolicySigPath(workspace: string): string {
  return `${benchPolicyPath(workspace)}.sig`;
}

export function benchExportsDir(workspace: string): string {
  return join(benchRootDir(workspace), "exports");
}

function benchImportsDir(workspace: string): string {
  return join(benchRootDir(workspace), "imports");
}

export function benchImportsRegistriesPath(workspace: string): string {
  return join(benchImportsDir(workspace), "registries.yaml");
}

export function benchImportsRegistriesSigPath(workspace: string): string {
  return `${benchImportsRegistriesPath(workspace)}.sig`;
}

export function benchImportsCacheDir(workspace: string): string {
  return join(benchImportsDir(workspace), "cache");
}

export function benchImportsBenchesDir(workspace: string): string {
  return join(benchImportsDir(workspace), "benches");
}

function benchComparisonsDir(workspace: string): string {
  return join(benchRootDir(workspace), "comparisons");
}

export function benchComparisonLatestPath(workspace: string): string {
  return join(benchComparisonsDir(workspace), "latest.json");
}

export function benchComparisonLatestSigPath(workspace: string): string {
  return `${benchComparisonLatestPath(workspace)}.sig`;
}

function ensureBenchDirs(workspace: string): void {
  ensureDir(benchRootDir(workspace));
  ensureDir(benchExportsDir(workspace));
  ensureDir(benchImportsCacheDir(workspace));
  ensureDir(benchImportsBenchesDir(workspace));
  ensureDir(benchComparisonsDir(workspace));
}

export function saveBenchPolicy(workspace: string, policy: BenchPolicy): {
  path: string;
  sigPath: string;
} {
  ensureBenchDirs(workspace);
  const path = benchPolicyPath(workspace);
  const normalized = benchPolicySchema.parse(policy);
  return publishOrgPairs(workspace, [{ path, bytes: Buffer.from(YAML.stringify(normalized)) }])[0]!;
}

export function loadBenchPolicy(workspace: string): BenchPolicy {
  const path = benchPolicyPath(workspace);
  if (!pathExists(path)) {
    throw new Error(`bench policy missing: ${path}`);
  }
  return benchPolicySchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

export function verifyBenchPolicySignature(workspace: string) {
  return verifyBenchPair(workspace, benchPolicyPath(workspace));
}

export function initBenchPolicy(workspace: string): {
  path: string;
  sigPath: string;
} {
  return saveBenchPolicy(workspace, defaultBenchPolicy());
}

function defaultBenchRegistriesConfig(): BenchRegistryConfig {
  return benchRegistryConfigSchema.parse({
    benchRegistries: {
      version: 1,
      registries: []
    }
  });
}

export function saveBenchRegistriesConfig(workspace: string, config: BenchRegistryConfig): {
  path: string;
  sigPath: string;
} {
  ensureBenchDirs(workspace);
  const path = benchImportsRegistriesPath(workspace);
  return publishOrgPairs(workspace, [{ path, bytes: Buffer.from(YAML.stringify(benchRegistryConfigSchema.parse(config))) }])[0]!;
}

export function loadBenchRegistriesConfig(workspace: string): BenchRegistryConfig {
  const path = benchImportsRegistriesPath(workspace);
  if (!pathExists(path)) {
    const defaults = defaultBenchRegistriesConfig();
    saveBenchRegistriesConfig(workspace, defaults);
    return defaults;
  }
  return benchRegistryConfigSchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

export function verifyBenchRegistriesSignature(workspace: string) {
  const path = benchImportsRegistriesPath(workspace);
  if (!pathExists(path)) {
    return {
      valid: true,
      signatureExists: false,
      reason: null,
      path,
      sigPath: `${path}.sig`
    };
  }
  return verifyBenchPair(workspace, path);
}

export function saveBenchComparison(workspace: string, comparison: BenchComparison): {
  path: string;
  sigPath: string;
} {
  ensureBenchDirs(workspace);
  const path = benchComparisonLatestPath(workspace);
  writeFileAtomic(path, JSON.stringify(benchComparisonSchema.parse(comparison), null, 2), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return { path, sigPath };
}

export function loadBenchComparison(workspace: string): BenchComparison | null {
  const path = benchComparisonLatestPath(workspace);
  if (!pathExists(path)) {
    return null;
  }
  return benchComparisonSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function saveBenchPiiScan(workspace: string, report: BenchPiiScanReport, filePath: string): void {
  ensureBenchDirs(workspace);
  writeFileAtomic(filePath, JSON.stringify(benchPiiScanSchema.parse(report), null, 2), 0o644);
}


function verifyBenchPair(workspace: string, path: string) {
  const sigPath = `${path}.sig`, signatureExists = pathExists(sigPath);
  if (!pathExists(path)) return { valid: false, signatureExists: false, reason: "file missing", path, sigPath };
  if (!signatureExists) return { valid: false, signatureExists, reason: "signature missing", path, sigPath };
  try { return { ...verifyAuditorSignatureBytes(workspace, "BUNDLE", readFileSync(path), readFileSync(sigPath)), signatureExists, path, sigPath }; }
  catch { return { valid: false, signatureExists, reason: "invalid file signature", path, sigPath }; }
}
export async function saveBenchPolicyAsync(workspace: string, policy: BenchPolicy, options: OrgPairsOptions = {}) {
  ensureBenchDirs(workspace);
  const path = benchPolicyPath(workspace), bytes = Buffer.from(YAML.stringify(benchPolicySchema.parse(policy)));
  return (await publishOrgPairsAsync(workspace, [{ path, bytes }], options))[0]!;
}
export async function initBenchPolicyAsync(workspace: string, options: OrgPairsOptions = {}) {
  return saveBenchPolicyAsync(workspace, defaultBenchPolicy(), options);
}
export async function saveBenchRegistriesConfigAsync(workspace: string, config: BenchRegistryConfig, options: OrgPairsOptions = {}) {
  ensureBenchDirs(workspace);
  const path = benchImportsRegistriesPath(workspace), bytes = Buffer.from(YAML.stringify(benchRegistryConfigSchema.parse(config)));
  return (await publishOrgPairsAsync(workspace, [{ path, bytes }], options))[0]!;
}
/** Existing registry reads do not acquire signing authority; missing defaults use their exact captured target. */
export async function loadBenchRegistriesConfigAsync(workspace: string, options: OrgPairsOptions = {}): Promise<BenchRegistryConfig> {
  const path = benchImportsRegistriesPath(workspace);
  if (pathExists(path)) return benchRegistryConfigSchema.parse(YAML.parse(readUtf8(path)) as unknown);
  const previous = captureOrgPairs([path]), bytes = orgPairBytes(previous, path);
  if (bytes !== null) return benchRegistryConfigSchema.parse(YAML.parse(bytes.toString("utf8")) as unknown);
  const config = defaultBenchRegistriesConfig();
  await publishOrgPairsAsync(workspace, [{ path, bytes: Buffer.from(YAML.stringify(config)) }], options, previous);
  return config;
}
