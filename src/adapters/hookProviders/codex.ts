/**
 * `amc connect hooks install|status|remove --provider codex` (P2-17), observe mode only.
 *
 * Codex 0.165.0's PreToolUse fails open (docs/source-reviews/P2-17-codex-hooks.md), so AMC installs no control hook.
 * The installer writes `.codex/hooks.json` with one PostToolUse command hook that runs AMC's forwarder
 * (codexObserveForwarder.ts), plus the signed manifest, the dedicated observe lease and the .gitignore block the
 * other providers use. It refuses to touch a `.codex/hooks.json` it did not write. Codex runs a project hook only after
 * the user trusts it (its trusted hash), so nothing is observed until then. Claim: "observed" only.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { revokeLeaseForCli } from "../../leases/leaseCli.js";
import { signFileWithAuditor } from "../../org/orgSigner.js";
import { writeFileAtomic } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import type { HookIntegrationStatus, HookMutationResult, InstallHookIntegrationOptions, RemoveHookIntegrationOptions } from "../hookIntegration.js";
import { verifyManagedLease } from "../managedHookLease.js";
import {
  addManagedIgnoreBlock, assertAllPathsSafe, fileChange, HOOK_INTEGRATION_ID, HOOK_TOKEN_MODE, HookIntegrationError, hasManagedIgnoreBlock,
  ignoreBlockHash, leaseManifestFields, loadSignedHookManifest, managedLeaseStatus, obtainHookLease, parseInstallOptions, relativePortable, removeInstallationFiles, restore, snapshot, withInstallLock,
  type HookFileChange,
} from "./installFiles.js";

/** Codex 0.165.0 (tag rust-v0.165.0, commit 360319d8), whose hooks contract AMC reviewed. */
export const CODEX_HOOK_SOURCE = {
  provider: "codex",
  contract: "Codex lifecycle hooks: PostToolUse command handler (observe only; PreToolUse fails open)",
  url: "https://github.com/openai/codex/blob/360319d8dee62d87e2d59fc0c21805d79519cfed/codex-rs/hooks/schema/generated/post-tool-use.command.input.schema.json",
  reference: "360319d8dee62d87e2d59fc0c21805d79519cfed",
} as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const codexManifestSchema = z.strictObject({
  v: z.literal(1),
  installationId: z.literal(HOOK_INTEGRATION_ID),
  provider: z.literal("codex"),
  mode: z.literal("observe"),
  source: z.strictObject({ provider: z.literal("codex"), contract: z.string(), url: z.string().url(), reference: z.string() }),
  configPath: z.literal(".codex/hooks.json"),
  configSha256: sha256Schema,
  forwarderPath: z.string().min(1),
  createdDirs: z.array(z.literal(".codex")),
  ignorePath: z.literal(".gitignore"),
  ignoreBlockSha256: sha256Schema,
  tokenPath: z.literal(".amc/hooks/codex.lease"),
  ...leaseManifestFields,
  installedTs: z.number().int(),
  updatedTs: z.number().int(),
});
type CodexManifest = z.infer<typeof codexManifestSchema>;

function codexPaths(workspace: string) {
  const base = join(workspace, ".amc", "hooks", "codex");
  return { config: join(workspace, ".codex", "hooks.json"), ignore: join(workspace, ".gitignore"), token: `${base}.lease`, manifest: `${base}.json`,
    signature: `${base}.json.sig`, lock: `${base}.lock` };
}

const LIMITATIONS = [
  "observation only: Codex's PreToolUse lets a call run when its hook fails, so AMC controls no Codex call",
  "Codex runs this project hook only after you trust it in Codex; nothing is observed until then",
  "AMC records what Codex reports at PostToolUse (digests of input and output, never their contents); calls Codex does not report are not covered",
];

/** One shell word for `$SHELL -lc`: single-quoted; a path holding a single quote or a control character is refused. */
function shellWord(value: string): string {
  if (/['\u0000-\u001f\u007f]/.test(value)) throw new HookIntegrationError("HOOK_PATH_UNSAFE", `path cannot be quoted for Codex's shell: ${value}`);
  return `'${value}'`;
}

/** `.codex/hooks.json` (Codex HooksFile): one PostToolUse command hook for every tool, running AMC's forwarder. */
function hooksFile(workspace: string, forwarderPath: string): Buffer {
  const command = [process.execPath, forwarderPath, workspace].map(shellWord).join(" ");
  const file = { description: "AMC managed observation hook; written by `amc connect hooks install --provider codex`. Do not edit.",
    hooks: { PostToolUse: [{ hooks: [{ type: "command", command, timeout: 10, statusMessage: "AMC records this tool call" }] }] } };
  return Buffer.from(`${JSON.stringify(file, null, 2)}\n`, "utf8");
}

const loadManifest = (workspace: string, paths: ReturnType<typeof codexPaths>): CodexManifest | null => loadSignedHookManifest(workspace, paths, codexManifestSchema, "Codex");

const fileSha = (path: string): string | null => (existsSync(path) ? sha256Hex(readFileSync(path)) : null);

function result(operation: "install" | "remove", dryRun: boolean, applied: boolean, files: HookFileChange[],
  lease: { leaseId: string | null; expiresTs: number | null }): HookMutationResult {
  return { operation, provider: "codex", mode: "observe", source: CODEX_HOOK_SOURCE, dryRun, applied, changed: files.some((file) => file.action !== "unchanged"),
    files, lease: { scope: "hook:observe", scopes: ["hook:observe"], route: "/hooks", ...lease }, limitations: LIMITATIONS };
}

/** Install the Codex observation hook for the AMC CLI at `cliPath`, running its built forwarder (dist/adapters/codex). */
export function installCodexHook(options: InstallHookIntegrationOptions, cliPath: string): HookMutationResult {
  const { mode, workspace, agentId, bridgeBase, ttl, rpm } = parseInstallOptions(options);
  if (mode !== "observe") throw new HookIntegrationError("HOOK_PROVIDER_UNSUPPORTED", "Codex supports observe mode only: its PreToolUse hook fails open");
  const forwarderPath = join(dirname(cliPath), "adapters", "codex", "codexObserveForwarder.js");
  if (!existsSync(forwarderPath)) throw new HookIntegrationError("HOOK_PATH_UNSAFE", `AMC's Codex forwarder is missing: ${forwarderPath}; build or reinstall AMC`);
  const paths = codexPaths(workspace);
  assertAllPathsSafe(workspace, Object.values(paths));

  const execute = (): HookMutationResult => {
    const existing = loadManifest(workspace, paths);
    const configBytes = hooksFile(workspace, forwarderPath);
    const currentSha = fileSha(paths.config);
    if (currentSha !== null && currentSha !== existing?.configSha256) {
      throw new HookIntegrationError("HOOK_OWNERSHIP_CONFLICT", ".codex/hooks.json exists but is not the file AMC's signed manifest installed; AMC does not merge Codex hooks");
    }
    const ignoreBefore = snapshot(paths.ignore);
    const ignoreBytes = Buffer.from(addManagedIgnoreBlock(ignoreBefore.bytes?.toString("utf8") ?? null), "utf8");
    const before = { config: snapshot(paths.config), ignore: ignoreBefore, token: snapshot(paths.token), manifest: snapshot(paths.manifest),
      signature: snapshot(paths.signature) };
    if (options.dryRun) {
      return result("install", true, false, [
        fileChange(paths.config, false, before.config, configBytes, true), fileChange(paths.ignore, false, ignoreBefore, ignoreBytes, true),
        fileChange(paths.token, true, before.token, Buffer.from("planned dedicated lease\n"), true),
        fileChange(paths.manifest, false, before.manifest, Buffer.from("planned signed manifest\n"), true),
      ], { leaseId: null, expiresTs: null });
    }
    const existingLease = verifyManagedLease({ workspace, tokenPath: paths.token, expectedAgentId: agentId, mode });
    const { token, payload: lease, issued } = obtainHookLease({ workspace, agentId, mode, ttl, rpm, tokenPath: paths.token, existing: existingLease });
    const now = Date.now();
    const manifest = codexManifestSchema.parse({
      v: 1, installationId: HOOK_INTEGRATION_ID, provider: "codex", mode, source: CODEX_HOOK_SOURCE, configPath: ".codex/hooks.json",
      configSha256: sha256Hex(configBytes), forwarderPath, createdDirs: existing?.createdDirs ?? (existsSync(dirname(paths.config)) ? [] : [".codex"]),
      ignorePath: ".gitignore", ignoreBlockSha256: ignoreBlockHash(), tokenPath: relativePortable(workspace, paths.token), agentId, bridgeBase,
      leaseId: lease.leaseId, leaseIssuedTs: lease.issuedTs, leaseExpiresTs: lease.expiresTs, installedTs: existing?.installedTs ?? now, updatedTs: now,
    });
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    try {
      writeFileAtomic(paths.ignore, ignoreBytes, ignoreBefore.existed ? ignoreBefore.mode : 0o644);
      writeFileAtomic(paths.token, `${token}\n`, HOOK_TOKEN_MODE);
      mkdirSync(dirname(paths.config), { recursive: true });
      writeFileAtomic(paths.config, configBytes, 0o644);
      writeFileAtomic(paths.manifest, manifestBytes, 0o644);
      signFileWithAuditor(workspace, paths.manifest);
      if (issued && existing && existing.leaseId !== lease.leaseId) revokeLeaseForCli({ workspace, leaseId: existing.leaseId, reason: "AMC Codex hook lease rotated" });
    } catch (error) {
      for (const key of ["config", "ignore", "token", "manifest", "signature"] as const) restore(paths[key], before[key]);
      if (issued) {
        try { revokeLeaseForCli({ workspace, leaseId: lease.leaseId, reason: "AMC Codex hook installation rolled back" }); } catch { /* keep the original error */ }
      }
      throw error;
    }
    return result("install", false, true, [
      fileChange(paths.config, false, before.config, configBytes, false), fileChange(paths.ignore, false, ignoreBefore, ignoreBytes, false),
      fileChange(paths.token, true, before.token, Buffer.from(`${token}\n`), false), fileChange(paths.manifest, false, before.manifest, manifestBytes, false),
      { path: paths.signature, action: before.signature.existed ? "update" : "create", sensitive: false },
    ], { leaseId: lease.leaseId, expiresTs: lease.expiresTs });
  };
  return options.dryRun ? execute() : withInstallLock(workspace, paths.lock, execute);
}

export function codexHookStatus(workspaceInput: string): HookIntegrationStatus {
  const workspace = resolve(workspaceInput);
  const paths = codexPaths(workspace);
  assertAllPathsSafe(workspace, Object.values(paths));
  const files = { config: paths.config, ignore: paths.ignore, token: paths.token, manifest: paths.manifest, signature: paths.signature };
  const base = { provider: "codex" as const, source: CODEX_HOOK_SOURCE, files };
  if (![paths.config, paths.token, paths.manifest, paths.signature].some((path) => existsSync(path))) {
    return { ...base, agentId: null, mode: null, state: "not-installed", configOwned: false, manifestValid: false, leaseValid: false, leaseId: null, expiresTs: null, issues: [] };
  }
  const issues: string[] = [];
  let manifest: CodexManifest | null = null;
  try {
    manifest = loadManifest(workspace, paths);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  const configOwned = manifest !== null && fileSha(paths.config) === manifest.configSha256;
  if (manifest && !configOwned) issues.push(".codex/hooks.json is missing or changed after installation");
  const forwarderMissing = manifest !== null && !existsSync(manifest.forwarderPath);
  if (forwarderMissing) issues.push("AMC's Codex forwarder is missing; build or reinstall AMC");
  const ignoreProtected = hasManagedIgnoreBlock(existsSync(paths.ignore) ? readFileSync(paths.ignore, "utf8") : null);
  if (manifest && !ignoreProtected) issues.push(".amc/hooks/ is not protected by .gitignore");
  const lease = managedLeaseStatus(workspace, paths.token, manifest, issues);
  const state: HookIntegrationStatus["state"] = !manifest || (!lease.valid && !lease.expired) || !ignoreProtected ? "invalid"
    : lease.expired ? "expired" : !configOwned || forwarderMissing ? "drifted" : "installed";
  return { ...base, agentId: manifest?.agentId ?? null, mode: manifest ? "observe" : null, state, configOwned, manifestValid: manifest !== null,
    leaseValid: lease.valid, leaseId: lease.payload?.leaseId ?? manifest?.leaseId ?? null, expiresTs: lease.payload?.expiresTs ?? manifest?.leaseExpiresTs ?? null, issues };
}

/** Revoke the lease, then remove AMC's own files through the deletion gate; a changed `.codex/hooks.json` is left in place. */
export function removeCodexHook(options: RemoveHookIntegrationOptions): HookMutationResult {
  const workspace = resolve(options.workspace);
  const paths = codexPaths(workspace);
  assertAllPathsSafe(workspace, Object.values(paths));
  const dryRun = options.dryRun === true;
  const execute = (): HookMutationResult => {
    const manifest = loadManifest(workspace, paths);
    if (!manifest) return result("remove", dryRun, false, [], { leaseId: null, expiresTs: null });
    if (existsSync(paths.config) && fileSha(paths.config) !== manifest.configSha256) {
      throw new HookIntegrationError("HOOK_OWNERSHIP_CONFLICT", ".codex/hooks.json differs from the signed installation manifest");
    }
    const targets = [paths.config, paths.token, paths.manifest, paths.signature];
    const files = targets.map((path) => fileChange(path, path === paths.token, snapshot(path), null, dryRun));
    const lease = { leaseId: manifest.leaseId, expiresTs: manifest.leaseExpiresTs };
    if (dryRun) return result("remove", true, false, files, lease);
    revokeLeaseForCli({ workspace, leaseId: manifest.leaseId, reason: "AMC Codex hook integration removed" });
    removeInstallationFiles(workspace, "hook-codex-remove", targets);
    return result("remove", false, true, files, lease);
  };
  return dryRun ? execute() : withInstallLock(workspace, paths.lock, execute);
}
