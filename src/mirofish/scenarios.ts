import { readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { scenarioSchema, type Scenario } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILT_IN_DIR = resolve(__dirname, "scenarios");

/** List names of all built-in scenarios (without .yml extension). */
export function listBuiltInScenarios(): readonly string[] {
  try {
    return readdirSync(BUILT_IN_DIR)
      .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
      .map((f) => f.replace(/\.ya?ml$/, ""))
      .sort();
  } catch {
    return [];
  }
}

/** Resolve a scenario name or path to an absolute file path. */
export function resolveScenarioPath(nameOrPath: string): string {
  // If it's an absolute path or relative path that exists, use it directly
  if (nameOrPath.endsWith(".yml") || nameOrPath.endsWith(".yaml")) {
    const abs = resolve(nameOrPath);
    if (pathExists(abs)) return abs;
    throw new Error(`Scenario file not found: ${nameOrPath}`);
  }

  // Try built-in directory
  const ymlPath = join(BUILT_IN_DIR, `${nameOrPath}.yml`);
  if (pathExists(ymlPath)) return ymlPath;

  const yamlPath = join(BUILT_IN_DIR, `${nameOrPath}.yaml`);
  if (pathExists(yamlPath)) return yamlPath;

  throw new Error(
    `Unknown scenario "${nameOrPath}". Available: ${listBuiltInScenarios().join(", ")}`
  );
}

/** Load and validate a scenario from a name or file path. */
export function loadScenario(nameOrPath: string): Scenario {
  const filePath = resolveScenarioPath(nameOrPath);
  const raw = readUtf8(filePath);
  const parsed: unknown = YAML.parse(raw);
  return scenarioSchema.parse(parsed);
}

/** Load a scenario from raw YAML string (for tests / programmatic use). */
export function parseScenarioYaml(yamlContent: string): Scenario {
  const parsed: unknown = YAML.parse(yamlContent);
  return scenarioSchema.parse(parsed);
}

/** Get metadata for all built-in scenarios (name + description). */
export function listScenariosWithMeta(): readonly { name: string; description: string; tags: readonly string[] }[] {
  return listBuiltInScenarios().map((name) => {
    const scenario = loadScenario(name);
    return {
      name: scenario.name,
      description: scenario.description,
      tags: scenario.tags ?? [],
    };
  });
}
