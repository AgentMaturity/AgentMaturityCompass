import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { accessSync, constants, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { stripProviderKeys } from "../utils/providerKeys.js";

const pinnedFileSchema = z.object({
  path: z.string().min(1).refine(isAbsolute, "Use an absolute installed artifact path"),
  sha256: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();

/** Operator approval is persisted inside signed adapters.yaml, never inferred from PATH. */
export const deepseekHarnessLaunchSchema = z.object({
  executable: pinnedFileSchema,
  entrypoint: pinnedFileSchema.optional(),
  sourceRevision: z.string().regex(/^[a-f0-9]{40}$/).optional()
}).strict();
export type DeepseekHarnessLaunch = z.infer<typeof deepseekHarnessLaunchSchema>;

export function readDeepseekHarnessLaunch(path: string): DeepseekHarnessLaunch {
  try {
    if (statSync(path).size > 16_384) throw new Error("too large");
    return deepseekHarnessLaunchSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    throw new Error("Invalid DSH launch configuration: supply pinned executable and optional entrypoint paths/hashes; no credentials or shell command strings.");
  }
}

export function verifyDeepseekHarnessLaunch(launch: DeepseekHarnessLaunch): void {
  for (const file of [launch.executable, ...(launch.entrypoint ? [launch.entrypoint] : [])]) {
    if (!statSync(file.path).isFile() || createHash("sha256").update(readFileSync(file.path)).digest("hex") !== file.sha256) {
      throw new Error("DSH approved launch artifact changed; review and reconfigure its signed hash before running.");
    }
  }
  accessSync(launch.executable.path, constants.X_OK);
}

export function detectDeepseekHarnessLaunch(launch: DeepseekHarnessLaunch): string {
  verifyDeepseekHarnessLaunch(launch);
  const out = spawnSync(launch.executable.path, [...(launch.entrypoint ? [launch.entrypoint.path] : []), "--version"], {
    env: stripProviderKeys(process.env), encoding: "utf8", timeout: 3_000, maxBuffer: 16_384,
    stdio: ["ignore", "pipe", "pipe"]
  });
  // The pinned CLI prints just its package version before loading the profile.
  const version = /^\s*(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)\s*$/.exec(out.stdout ?? "")?.[1];
  if (out.error || out.status !== 0 || !version) throw new Error("DSH approved launcher did not return a valid package version; provider/profile boot was not requested.");
  return version;
}

export function prepareDeepseekHarnessLaunch(input: {
  launch: DeepseekHarnessLaunch; task: string[]; routeUrl: string; model: string;
}): { executable: string; args: string[]; dispose: () => void } {
  if (input.task.length !== 1 || !input.task[0]?.trim() || input.task[0].trimStart().startsWith("-") || input.task[0].includes("\0")) {
    throw new Error("DSH capture requires one quoted, nonempty task after --. Start the task with ordinary text; launcher flags are not accepted.");
  }
  verifyDeepseekHarnessLaunch(input.launch);
  const root = mkdtempSync(join(tmpdir(), "amc-dsh-launch-"));
  try {
    const settingsPath = join(root, "settings.json");
    const patchPath = join(root, "capture.patch.yml");
    const connection = { baseURL: input.routeUrl, apiKeyEnv: "DEEPSEEK_API_KEY" };
    const selection = { provider: "deepseek-official", model: input.model };
    // The native settings service overrides plugin entry config. Select a private
    // per-launch document explicitly; never edit the operator's existing settings.
    writeFileSync(settingsPath, JSON.stringify({ "llm-deepseek": connection, "agent-default-model": selection }), { mode: 0o600 });
    writeFileSync(patchPath, YAML.stringify([
      { id: "settings", config: { path: settingsPath, watch: false } },
      { id: "llm-deepseek", config: connection },
      { id: "agent-default-model", config: selection }
    ]), { mode: 0o600 });
    return {
      executable: input.launch.executable.path,
      args: [...(input.launch.entrypoint ? [input.launch.entrypoint.path] : []), "--profile", "headless", "--patch", patchPath, input.task[0]],
      dispose: () => rmSync(root, { recursive: true, force: true })
    };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

export function deepseekHarnessCoverage() {
  return {
    schemaVersion: 1,
    sourceFormat: "deepseek-harness@c389f96bf3a9b6807cb71ed6bdad5849be0df6d8",
    process: { status: "capture_configured", stdout: "bounded_redacted_final_output", stderr: "byte_count_only_reasoning_omitted" },
    launchPin: { status: "hashed_before_spawn", boundary: "Approved executable/entrypoint bytes are hashed at configuration, version probe and launch preparation; the child is then started by path, so a write to those paths after the last hash and before exec is not detected." },
    provider: { status: "unverified", boundary: "Only actual traffic received by the signed AMC gateway is observed model evidence." },
    proxy: { status: "unverified", boundary: "Proxy environment is advisory; direct traffic and other provider plugins may bypass it." },
    nativeEvents: { status: "unavailable", boundary: "No DSH tool, approval, sandbox or session hook is installed by this adapter." },
    settings: "private_per_launch_document_watch_disabled",
    omissions: ["stderr reasoning and error bodies", "task text in launch receipts", "stdout above 1 MiB", "internal tool outcomes", "direct network traffic", "DSH persisted session content"],
    sourceFileImports: "not_performed",
    qualification: "implementation_unverified"
  } as const;
}
