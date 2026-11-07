import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalize } from "../utils/json.js";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { fileSha256 } from "./releaseUtils.js";
import { deterministicTimestamp } from "./releaseUtils.js";

export interface ProvenanceOutputHashes {
  npmTgzSha256: string;
  sbomSha256: string;
  licensesSha256: string;
  secretScanSha256: string;
}

function envOr(value: string | undefined, fallback = ""): string {
  return value && value.length > 0 ? value : fallback;
}

function computeInputHashes(workspace: string): {
  packageLockSha256: string;
  tsconfigSha256: string;
  buildScriptSha256: string;
} {
  // AMC itself builds from pnpm-lock.yaml: pin whichever lockfile exists, npm's first, as readResolvedDependencies does.
  const packageLockPath = ["package-lock.json", "pnpm-lock.yaml"].map((name) => join(workspace, name)).find((path) => pathExists(path));
  const tsconfigPath = join(workspace, "tsconfig.json");
  const buildScriptPath = join(workspace, "package.json");
  return {
    packageLockSha256: packageLockPath ? fileSha256(packageLockPath) : "",
    tsconfigSha256: pathExists(tsconfigPath) ? fileSha256(tsconfigPath) : "",
    buildScriptSha256: pathExists(buildScriptPath) ? fileSha256(buildScriptPath) : ""
  };
}

export function generateProvenanceRecord(params: {
  workspace: string;
  toolVersion: string;
  outputs: ProvenanceOutputHashes;
}): Record<string, unknown> {
  const inputs = computeInputHashes(params.workspace);
  const inCi = envOr(process.env.GITHUB_ACTIONS) === "true";
  return {
    v: 1,
    generatedTs: deterministicTimestamp(),
    build: {
      tool: "agent-maturity-compass",
      toolVersion: params.toolVersion,
      nodeVersion: process.version,
      os: process.platform,
      ci: {
        provider: inCi ? "github-actions" : "local",
        workflow: envOr(process.env.GITHUB_WORKFLOW),
        runId: envOr(process.env.GITHUB_RUN_ID),
        runAttempt: envOr(process.env.GITHUB_RUN_ATTEMPT),
        actor: envOr(process.env.GITHUB_ACTOR),
        repository: envOr(process.env.GITHUB_REPOSITORY),
        ref: envOr(process.env.GITHUB_REF),
        sha: envOr(process.env.GITHUB_SHA)
      }
    },
    inputs,
    outputs: {
      npmTgzSha256: params.outputs.npmTgzSha256,
      sbomSha256: params.outputs.sbomSha256,
      licensesSha256: params.outputs.licensesSha256,
      secretScanSha256: params.outputs.secretScanSha256
    },
    note: "AMC provenance record (not a formal SLSA claim)"
  };
}

export function writeProvenanceRecord(params: {
  workspace: string;
  outPath: string;
  toolVersion: string;
  outputs: ProvenanceOutputHashes;
}): { path: string; json: Record<string, unknown> } {
  const json = generateProvenanceRecord({
    workspace: params.workspace,
    toolVersion: params.toolVersion,
    outputs: params.outputs
  });
  writeFileAtomic(params.outPath, `${canonicalize(json)}\n`, 0o644);
  return {
    path: params.outPath,
    json
  };
}

export function readVersionFromPackage(workspace: string): string {
  const pkg = JSON.parse(readFileSync(join(workspace, "package.json"), "utf8")) as { version?: string };
  return pkg.version ?? "0.0.0";
}
