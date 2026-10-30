import YAML from "yaml";
import { readFileSync } from "node:fs";
import { pathExists } from "../utils/fs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { benchRegistryConfigSchema, type BenchRegistryConfig } from "./benchRegistrySchema.js";
import { captureOrgPairs, orgPairBytes, publishOrgPairsAsync, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { initBenchPolicyAsync, saveBenchPolicyAsync, saveBenchRegistriesConfigAsync, loadBenchRegistriesConfigAsync, benchImportsRegistriesPath, type loadBenchPolicy, type loadBenchRegistriesConfig } from "./benchPolicyStore.js";

export async function benchInitForApiAsync(workspace: string, options: OrgPairsOptions = {}) {
  return initBenchPolicyAsync(workspace, options);
}
export async function benchPolicyApplyForApiAsync(params: { workspace: string; policy: ReturnType<typeof loadBenchPolicy> }, options: OrgPairsOptions = {}) {
  const workspace = params.workspace, policy = params.policy;
  return saveBenchPolicyAsync(workspace, policy, options);
}
export async function benchRegistryApplyForApiAsync(params: { workspace: string; config: ReturnType<typeof loadBenchRegistriesConfig> }, options: OrgPairsOptions = {}) {
  const workspace = params.workspace, config = params.config;
  return saveBenchRegistriesConfigAsync(workspace, config, options);
}
export async function benchRegistriesForApiAsync(workspace: string, options: OrgPairsOptions = {}) {
  const beforePublish = options.beforePublish;
  await loadBenchRegistriesConfigAsync(workspace, options); // Existing-body reads do not require signing authority.
  beforePublish?.();
  const path = benchImportsRegistriesPath(workspace), sigPath = `${path}.sig`, bytes = readFileSync(path), signatureExists = pathExists(sigPath);
  const registries = benchRegistryConfigSchema.parse(YAML.parse(bytes.toString("utf8")) as unknown);
  const verdict = signatureExists ? verifyAuditorSignatureBytes(workspace, "BUNDLE", bytes, readFileSync(sigPath)) : { valid: false, reason: "signature missing" };
  return { registries, signature: { ...verdict, signatureExists, path, sigPath } };
}

/** Actual additive Studio operation: the selected registry bytes and sidecar remain its final CAS inputs. */
export async function benchRegistryAddForApiAsync(params: { workspace: string; registry: BenchRegistryConfig["benchRegistries"]["registries"][number] }, options: OrgPairsOptions = {}) {
  const workspace = params.workspace, entry = benchRegistryConfigSchema.parse({ benchRegistries: { version: 1, registries: [params.registry] } }).benchRegistries.registries[0]!;
  const path = benchImportsRegistriesPath(workspace), previous = captureOrgPairs([path]), bytes = orgPairBytes(previous, path);
  const current = bytes === null ? { benchRegistries: { version: 1 as const, registries: [] } } : benchRegistryConfigSchema.parse(YAML.parse(bytes.toString("utf8")) as unknown);
  const registries = [...current.benchRegistries.registries.filter(row => row.id !== entry.id), entry].sort((x, y) => x.id.localeCompare(y.id));
  const config = benchRegistryConfigSchema.parse({ benchRegistries: { version: 1, registries } });
  return (await publishOrgPairsAsync(workspace, [{ path, bytes: Buffer.from(YAML.stringify(config)) }], options, previous))[0]!;
}
