import { existsSync, readFileSync } from "node:fs";
import YAML from "yaml";
import { amcDeclarativeConfigSchema, type AMCDeclarativeConfig } from "./amcConfigSchema.js";
import { verifyRawConfigSignature } from "./configSignaturePair.js";
import { sha256Hex } from "../utils/hash.js";

interface ConfigSource {
  layer: "default" | "workspace" | "user" | "explicit" | "flag";
  path: string | null;
  /** SHA-256 of exact source bytes; built-in defaults and flags have no file. */
  sha256: string | null;
}
export type ConfigProvenance = Record<string, ConfigSource>;
export interface ConfigOverlayOptions {
  /** Opt-in user layer: true reads ~/.amc/amcconfig.yaml, a string names a file; absent or false reads none. */
  userConfig?: string | boolean;
  /** Invocation values have no signature, so cannot override a signed file. */
  overrides?: Record<string, unknown>;
}

const defaults: ConfigSource = { layer: "default", path: null, sha256: null };
const pointer = (parent: string, key: string) => `${parent}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Objects merge by key; arrays replace whole. JSON Pointer provenance names final leaves and empty containers. */
export function resolveConfigOverlays(workspace: string,
  files: Array<{ layer: "workspace" | "user" | "explicit"; path: string }>,
  overrides?: Record<string, unknown>,
): { config: AMCDeclarativeConfig; provenance: ConfigProvenance } {
  const origins = new Map<string, ConfigSource>();
  function merge(previous: unknown, value: unknown, source: ConfigSource, at = ""): unknown {
    // Replacement removes stale origins, including defaults subsequently inserted by Zod.
    if (!isObject(value) || !isObject(previous)) {
      for (const key of origins.keys()) if (key === at || key.startsWith(`${at}/`)) origins.delete(key);
    }
    if (isObject(value)) {
      const result = Object.assign(Object.create(null) as Record<string, unknown>, isObject(previous) ? previous : {});
      if (Object.keys(value).length === 0 && Object.keys(result).length === 0) origins.set(at, source);
      for (const [key, child] of Object.entries(value)) result[key] = merge(Object.hasOwn(result, key) ? result[key] : undefined, child, source, pointer(at, key));
      return result;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) origins.set(at, source);
      return value.map((child, index) => merge(undefined, child, source, pointer(at, String(index))));
    }
    origins.set(at, source);
    return value;
  }
  // Built-in defaults come from the schema exactly as before overlays existed; they are only attributed here.
  let raw: unknown = undefined;
  let signedBase = false;
  for (const { layer, path } of files) {
    const bytes = readFileSync(path), digest = sha256Hex(bytes);
    const signaturePath = `${path}.sig`;
    const signed = existsSync(signaturePath);
    if (signed) {
      const sidecar: unknown = JSON.parse(readFileSync(signaturePath, "utf8"));
      const valid = isObject(sidecar) && (sidecar.digestSha256 ?? sidecar.configSha256) === digest
        && typeof sidecar.signature === "string" && verifyRawConfigSignature(workspace, digest, sidecar.signature);
      if (!valid) throw new Error(`Invalid config layer signature or digest: ${path}`);
    }
    if (signedBase && !signed) throw new Error(`Unsigned ${layer} config layer cannot override a signed base: ${path}`);
    signedBase ||= signed;
    let value: unknown;
    try {
      value = YAML.parse(bytes.toString("utf8"));
      if (value === null || value === undefined) throw new Error("Config file is empty");
      // Preserve ordinary aliases, but refuse cycles before recursive merging.
      JSON.stringify(value);
      // Validate partial input without applying its defaults over the lower layers.
      amcDeclarativeConfigSchema.partial().parse(value);
    } catch (error) {
      throw new Error(`Invalid config layer (${path}): ${error instanceof Error ? error.message : String(error)}`);
    }
    raw = merge(raw, value, { layer, path, sha256: digest });
  }
  if (overrides && Object.keys(overrides).length > 0) {
    if (signedBase) throw new Error("Unsigned flag config layer cannot override a signed base");
    amcDeclarativeConfigSchema.partial().parse(overrides);
    raw = merge(raw, overrides, { layer: "flag", path: null, sha256: null });
  }
  const config = amcDeclarativeConfigSchema.parse(raw);
  const provenance: ConfigProvenance = Object.create(null) as ConfigProvenance;
  function collect(value: unknown, at = "") {
    const entries = isObject(value) || Array.isArray(value) ? Object.entries(value) : [];
    if (entries.length === 0) provenance[at] = { ...(origins.get(at) ?? defaults) };
    else for (const [key, child] of entries) collect(child, pointer(at, key));
  }
  collect(config);
  return { config, provenance };
}
