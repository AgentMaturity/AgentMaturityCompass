/**
 * Static correctness check of the Railway and Vercel targets against
 * the committed package.json. Reads files only; never writes, installs or
 * deploys. Findings describe the committed state so a reviewer can decide what
 * to change; nothing here edits a config.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Builder values Railway documents for railway.json `build.builder`.
 * Source: https://docs.railway.com/reference/config-as-code (retrieved 2026-10-03):
 * RAILPACK (default) and DOCKERFILE. NIXPACKS is not listed.
 */
export const RAILWAY_DOCUMENTED_BUILDERS: readonly string[] = ["RAILPACK", "DOCKERFILE"];

export interface PackageJsonShape {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface RailwayShape {
  build?: { builder?: string };
  deploy?: { startCommand?: string; healthcheckPath?: string | null };
}

export interface VercelShape {
  builds?: Array<{ src?: string; use?: string }>;
}

export type FindingKind =
  | "unresolved-start-script"
  | "devDependency-only-start-binary"
  | "undeclared-start-binary"
  | "undocumented-builder"
  | "missing-healthcheckPath"
  | "vercel-build-src-missing"
  | "vercel-build-src-no-default-export";

export interface PlatformFinding {
  target: "railway" | "vercel";
  kind: FindingKind;
  detail: string;
}

export type BinaryClass = "dependency" | "devDependency-only" | "undeclared";

/** Where a start binary is declared. A production install omits devDependencies. */
export function classifyBinary(binary: string, pkg: PackageJsonShape): BinaryClass {
  if (pkg.dependencies?.[binary] !== undefined) return "dependency";
  if (pkg.devDependencies?.[binary] !== undefined) return "devDependency-only";
  return "undeclared";
}

/** `npm run X` / `pnpm X` / `pnpm run X` → the script name, otherwise null. */
export function startScriptName(startCommand: string): string | null {
  return /^(?:npm run|pnpm(?: run)?) ([\w:.-]+)$/.exec(startCommand.trim())?.[1] ?? null;
}

/** Shell built-ins and Node itself are always present at runtime. */
const RUNTIME_BINARIES = new Set(["node", "npm", "npx", "pnpm", "sh", "bash", "env", "cd"]);

function railwayFindings(pkg: PackageJsonShape, railway: RailwayShape): PlatformFinding[] {
  const findings: PlatformFinding[] = [];
  const builder = railway.build?.builder;
  if (builder !== undefined && !RAILWAY_DOCUMENTED_BUILDERS.includes(builder)) {
    findings.push({ target: "railway", kind: "undocumented-builder",
      detail: `build.builder ${builder} is not in Railway's documented set [${RAILWAY_DOCUMENTED_BUILDERS.join(", ")}]` });
  }
  if (!railway.deploy?.healthcheckPath) {
    findings.push({ target: "railway", kind: "missing-healthcheckPath", detail: "deploy.healthcheckPath is absent" });
  }
  const startCommand = railway.deploy?.startCommand ?? "";
  const name = startScriptName(startCommand);
  const script = name === null ? undefined : pkg.scripts?.[name];
  if (script === undefined) {
    findings.push({ target: "railway", kind: "unresolved-start-script", detail: `startCommand '${startCommand}' does not resolve to a package.json script` });
    return findings;
  }
  const binary = script.trim().split(/\s+/)[0] ?? "";
  if (RUNTIME_BINARIES.has(binary)) return findings;
  const cls = classifyBinary(binary, pkg);
  if (cls === "devDependency-only") {
    findings.push({ target: "railway", kind: "devDependency-only-start-binary",
      detail: `script ${name} runs '${binary}', declared only in devDependencies; a production install that omits devDependencies cannot start it` });
  } else if (cls === "undeclared") {
    findings.push({ target: "railway", kind: "undeclared-start-binary", detail: `script ${name} runs '${binary}', which package.json does not declare` });
  }
  return findings;
}

function vercelFindings(vercel: VercelShape, readSource: (path: string) => string | null): PlatformFinding[] {
  const findings: PlatformFinding[] = [];
  for (const build of vercel.builds ?? []) {
    if (!build.src) continue;
    const text = readSource(build.src);
    if (text === null) {
      findings.push({ target: "vercel", kind: "vercel-build-src-missing", detail: `builds src ${build.src} does not exist` });
    } else if (!/^\s*export default\b/m.test(text)) {
      findings.push({ target: "vercel", kind: "vercel-build-src-no-default-export", detail: `builds src ${build.src} has no 'export default'` });
    }
  }
  return findings;
}

/** Pure check over parsed configs; `readSource` returns a repo file's text or null. */
export function checkPlatformDeployConfig(input: {
  packageJson: PackageJsonShape;
  railway: RailwayShape;
  vercel: VercelShape;
  readSource: (path: string) => string | null;
}): PlatformFinding[] {
  return [...railwayFindings(input.packageJson, input.railway), ...vercelFindings(input.vercel, input.readSource)];
}

/** Reads package.json, railway.json and vercel.json under `root` (read-only) and checks them. */
export function checkRepoPlatformDeployConfig(root: string): PlatformFinding[] {
  const readJson = <T>(file: string): T => JSON.parse(readFileSync(join(root, file), "utf8")) as T;
  return checkPlatformDeployConfig({
    packageJson: readJson<PackageJsonShape>("package.json"),
    railway: readJson<RailwayShape>("railway.json"),
    vercel: readJson<VercelShape>("vercel.json"),
    readSource: (path) => (existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : null)
  });
}
