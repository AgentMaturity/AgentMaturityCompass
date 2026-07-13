import { resolve, sep } from "node:path";
import { posix } from "node:path";
import semver from "semver";
import { z } from "zod";

const PLUGIN_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/;

export const pluginIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    PLUGIN_ID_PATTERN,
    "plugin id must be one safe path segment containing only letters, numbers, dot, underscore, or hyphen",
  );

export const pluginVersionSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => semver.valid(value) !== null, "plugin version must be valid SemVer");

export const pluginArtifactPathSchema = z.string().min(1).max(512).superRefine((value, ctx) => {
  if (value.includes("\\") || value.includes("\0") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) {
    ctx.addIssue({ code: "custom", message: "plugin artifact path must be a portable relative path" });
    return;
  }
  const normalized = posix.normalize(value);
  if (
    normalized !== value
    || normalized === "."
    || normalized === ".."
    || normalized.startsWith("../")
    || !normalized.startsWith("content/")
  ) {
    ctx.addIssue({ code: "custom", message: "plugin artifact path must remain under content/" });
  }
});

export function assertPluginId(value: string): string {
  return pluginIdSchema.parse(value);
}

export function assertPluginVersion(value: string): string {
  return pluginVersionSchema.parse(value);
}

export function resolvePluginInstallPath(params: {
  installedRoot: string;
  pluginId: string;
  version: string;
}): string {
  const root = resolve(params.installedRoot);
  const pluginId = assertPluginId(params.pluginId);
  const version = assertPluginVersion(params.version);
  const candidate = resolve(root, pluginId, version);
  if (!candidate.startsWith(`${root}${sep}`)) {
    throw new Error("unsafe plugin install path");
  }
  return candidate;
}
