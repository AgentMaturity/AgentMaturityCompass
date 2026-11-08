import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";

export const root = process.cwd();
export const chartDir = "deploy/helm/amc";

export function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

export function readYaml<T = any>(path: string): T {
  return YAML.parse(read(path)) as T;
}

/** Deep merge of plain objects (arrays and scalars replace), as Helm merges values files. */
export function mergeValues(base: any, override: any): any {
  if (!override || typeof override !== "object" || Array.isArray(override)) return override === undefined ? base : override;
  const out: Record<string, unknown> = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(override)) out[key] = mergeValues(out[key], value);
  return out;
}

export const zeroDigest = `sha256:${"0".repeat(64)}`;

/** The `studio` stage's HEALTHCHECK: its option text and its exec-form CMD array (null when absent or not JSON). */
export function dockerfileStudioHealthcheck(dockerfile: string): { options: string; cmd: string[] | null } {
  const stage = dockerfile.slice(dockerfile.indexOf("FROM runtime AS studio"));
  const match = /^HEALTHCHECK ([^\n]*?)\s*\\\n\s+CMD (\[.*\])$/m.exec(stage);
  if (!match) return { options: "", cmd: null };
  try { return { options: match[1]!, cmd: JSON.parse(match[2]!) as string[] }; } catch { return { options: match[1]!, cmd: null }; }
}
