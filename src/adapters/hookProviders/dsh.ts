/**
 * `amc connect hooks install|status|remove --provider dsh` (P2-17), control mode only.
 *
 * AMC does not edit DSH's profiles: the reviewed contract (docs/source-reviews/P2-17-dsh-plugin.md) covers DSH's tool
 * pipeline, not where a deployment's profile mounts plugins. The installer writes the signed manifest, the dedicated
 * hook lease and the .gitignore block the other providers use, and prints the plugin entry the operator adds to the
 * DSH profile. The manifest binds the SHA-256 of AMC's DSH plugin module (packages/dsh-amc-plugin), of AMC's transport
 * module (dshControlClient.ts) and of the DSH install (dshInstall.ts), which AMC measures again when a session
 * registers. No DSH version is qualified, so nothing is enforced yet; DSH runs ungoverned while it does not load the plugin.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { CONTROL_HOOK_ROUTE } from "../../bridge/hookControl.js";
import { getPurposeKeyHistory } from "../../keys/signingKeys.js";
import { revokeLeaseForCli } from "../../leases/leaseCli.js";
import { signFileWithAuditor } from "../../org/orgSigner.js";
import { writeFileAtomic } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import { measureDshInstall } from "../dsh/dshInstall.js";
import { QUALIFIED_DSH_VERSIONS } from "../dsh/dshVersions.js";
import type { HookIntegrationStatus, HookMutationResult, InstallHookIntegrationOptions, RemoveHookIntegrationOptions } from "../hookIntegration.js";
import { verifyManagedLease } from "../managedHookLease.js";
import { clearPiDigestCache } from "../pi/piInstall.js";
import {
  addManagedIgnoreBlock, assertAllPathsSafe, fileChange, HOOK_CONTROL_INTEGRATION_ID, HOOK_TOKEN_MODE, HookIntegrationError, hasManagedIgnoreBlock,
  ignoreBlockHash, leaseManifestFields, loadSignedHookManifest, managedLeaseStatus, obtainHookLease, parseInstallOptions, relativePortable, removeInstallationFiles, restore, snapshot, withInstallLock,
  type HookFileChange,
} from "./installFiles.js";

/** DSH 0.2.1-rc.2 (tag commit 687f282e), where the tool-pipeline contract AMC's plugin relies on was reviewed. */
export const DSH_HOOK_SOURCE = {
  provider: "dsh",
  contract: "DSH tools/pre-execute waterfall and monotonic tool guards",
  url: "https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/subsystems/tools.md",
  reference: "687f282e8625c6b8d11ff58211a90524be2e4317",
} as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const dshManifestSchema = z.strictObject({
  v: z.literal(1),
  installationId: z.literal(HOOK_CONTROL_INTEGRATION_ID),
  provider: z.literal("dsh"),
  mode: z.literal("control"),
  source: z.strictObject({ provider: z.literal("dsh"), contract: z.string(), url: z.string().url(), reference: z.string() }),
  pluginPath: z.string().min(1),
  pluginSha256: sha256Schema,
  modulePath: z.string().min(1),
  moduleSha256: sha256Schema,
  ignorePath: z.literal(".gitignore"),
  ignoreBlockSha256: sha256Schema,
  tokenPath: z.literal(".amc/hooks/dsh.lease"),
  ...leaseManifestFields,
  qualifiedDshVersions: z.array(z.string()),
  dshInstall: z.strictObject({ packageDir: z.string().min(1), version: z.string().min(1), sha256: sha256Schema }).nullable(),
  receiptPublicKeys: z.array(z.string().min(1)).min(1),
  installedTs: z.number().int(),
  updatedTs: z.number().int(),
  control: z.strictObject({ endpoint: z.literal(CONTROL_HOOK_ROUTE), localOnly: z.literal(true), leaseScope: z.literal("hook:control") }),
});
type DshManifest = z.infer<typeof dshManifestSchema>;

function dshPaths(workspace: string) {
  const base = join(workspace, ".amc", "hooks", "dsh");
  return { ignore: join(workspace, ".gitignore"), token: `${base}.lease`, manifest: `${base}.json`, signature: `${base}.json.sig`, lock: `${base}.lock` };
}

const LIMITATIONS = [
  "AMC does not edit DSH profiles: add the printed plugin entry to the DSH profile; DSH runs ungoverned while it does not load the plugin",
  "no DSH version is qualified, so the plugin and the Bridge deny every DSH call; nothing is enforced",
  "mapped tools only (read, write, edit, web_fetch with absolute paths); every other DSH tool is denied",
  "a session registration is a lease-holder attestation checked against disk, not proof that DSH ran the plugin",
];

/**
 * AMC's DSH plugin module and transport, next to the AMC CLI at `cliPath` (dist/cli.js): the plugin ships in AMC's
 * source tree (packages/dsh-amc-plugin) until it is published, and the transport is AMC's built dshControlClient.js.
 */
function dshModules(cliPath: string): [string, string] {
  return [resolve(dirname(cliPath), "..", "packages", "dsh-amc-plugin", "index.mjs"), join(dirname(cliPath), "adapters", "dsh", "dshControlClient.js")];
}

/** The Cordis entry for the DSH profile: the plugin module, configured with AMC's transport for this workspace. */
function dshPluginEntry(manifest: Pick<DshManifest, "pluginPath" | "modulePath" | "qualifiedDshVersions" | "dshInstall">, workspace: string): string {
  return JSON.stringify({ name: manifest.pluginPath, config: { workspace, transport: manifest.modulePath,
    dshVersion: manifest.dshInstall?.version ?? "unknown", qualifiedVersions: manifest.qualifiedDshVersions } });
}

const loadManifest = (workspace: string, paths: ReturnType<typeof dshPaths>): DshManifest | null => loadSignedHookManifest(workspace, paths, dshManifestSchema, "DSH");

const fileSha = (path: string): string | null => (existsSync(path) ? sha256Hex(readFileSync(path)) : null);

function result(operation: "install" | "remove", dryRun: boolean, applied: boolean, files: HookFileChange[],
  lease: { leaseId: string | null; expiresTs: number | null }, entry?: string): HookMutationResult {
  return { operation, provider: "dsh", mode: "control", source: DSH_HOOK_SOURCE, dryRun, applied, changed: files.some((file) => file.action !== "unchanged"),
    files, lease: { scope: "hook:observe", scopes: ["hook:observe", "hook:control"], route: "/hooks", ...lease },
    limitations: entry ? [...LIMITATIONS, `DSH profile plugin entry: ${entry}`] : LIMITATIONS };
}

/** Install the DSH control binding for the AMC CLI at `cliPath`: its DSH plugin module and built transport (dshModules). */
export function installDshHook(options: InstallHookIntegrationOptions, cliPath: string): HookMutationResult {
  const { mode, workspace, agentId, bridgeBase, ttl, rpm } = parseInstallOptions(options);
  if (mode !== "control") throw new HookIntegrationError("HOOK_PROVIDER_UNSUPPORTED", "DSH supports control mode only; its plugin has no observe mode");
  const [pluginPath, modulePath] = dshModules(cliPath);
  for (const path of [pluginPath, modulePath]) if (!existsSync(path)) throw new HookIntegrationError("HOOK_PATH_UNSAFE", `AMC's DSH module is missing: ${path}`);
  const dshInstall = options.dshPackageDir ? measureDshInstall(resolve(options.dshPackageDir)) : null;
  if (options.dshPackageDir && !dshInstall) throw new HookIntegrationError("HOOK_PATH_UNSAFE", `not a DSH package with its tool pipeline: ${resolve(options.dshPackageDir)}`);
  const paths = dshPaths(workspace);
  assertAllPathsSafe(workspace, Object.values(paths));

  const execute = (): HookMutationResult => {
    clearPiDigestCache();
    const existing = loadManifest(workspace, paths);
    const ignoreBefore = snapshot(paths.ignore);
    const ignoreBytes = Buffer.from(addManagedIgnoreBlock(ignoreBefore.bytes?.toString("utf8") ?? null), "utf8");
    const before = { ignore: ignoreBefore, token: snapshot(paths.token), manifest: snapshot(paths.manifest), signature: snapshot(paths.signature) };
    if (options.dryRun) {
      return result("install", true, false, [
        fileChange(paths.ignore, false, ignoreBefore, ignoreBytes, true),
        fileChange(paths.token, true, before.token, Buffer.from("planned dedicated lease\n"), true),
        fileChange(paths.manifest, false, before.manifest, Buffer.from("planned signed manifest\n"), true),
        fileChange(paths.signature, false, before.signature, Buffer.from("planned signature\n"), true),
      ], { leaseId: null, expiresTs: null });
    }
    const existingLease = verifyManagedLease({ workspace, tokenPath: paths.token, expectedAgentId: agentId, mode });
    const { token, payload: lease, issued } = obtainHookLease({ workspace, agentId, mode, ttl, rpm, tokenPath: paths.token, existing: existingLease });
    const now = Date.now();
    const manifest = dshManifestSchema.parse({
      v: 1, installationId: HOOK_CONTROL_INTEGRATION_ID, provider: "dsh", mode, source: DSH_HOOK_SOURCE, pluginPath, pluginSha256: sha256Hex(readFileSync(pluginPath)),
      modulePath, moduleSha256: sha256Hex(readFileSync(modulePath)), ignorePath: ".gitignore", ignoreBlockSha256: ignoreBlockHash(),
      tokenPath: relativePortable(workspace, paths.token), agentId, bridgeBase, leaseId: lease.leaseId, leaseIssuedTs: lease.issuedTs, leaseExpiresTs: lease.expiresTs,
      qualifiedDshVersions: [...QUALIFIED_DSH_VERSIONS], dshInstall, receiptPublicKeys: getPurposeKeyHistory(workspace, "receipt"),
      installedTs: existing?.installedTs ?? now, updatedTs: now, control: { endpoint: CONTROL_HOOK_ROUTE, localOnly: true, leaseScope: "hook:control" },
    });
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    try {
      writeFileAtomic(paths.ignore, ignoreBytes, ignoreBefore.existed ? ignoreBefore.mode : 0o644);
      writeFileAtomic(paths.token, `${token}\n`, HOOK_TOKEN_MODE);
      writeFileAtomic(paths.manifest, manifestBytes, 0o644);
      signFileWithAuditor(workspace, paths.manifest);
      if (issued && existing && existing.leaseId !== lease.leaseId) revokeLeaseForCli({ workspace, leaseId: existing.leaseId, reason: "AMC DSH hook lease rotated" });
    } catch (error) {
      for (const key of ["ignore", "token", "manifest", "signature"] as const) restore(paths[key], before[key]);
      if (issued) {
        try { revokeLeaseForCli({ workspace, leaseId: lease.leaseId, reason: "AMC DSH hook installation rolled back" }); } catch { /* keep the original error */ }
      }
      throw error;
    }
    return result("install", false, true, [
      fileChange(paths.ignore, false, ignoreBefore, ignoreBytes, false),
      fileChange(paths.token, true, before.token, Buffer.from(`${token}\n`), false),
      fileChange(paths.manifest, false, before.manifest, manifestBytes, false),
      { path: paths.signature, action: before.signature.existed ? "update" : "create", sensitive: false },
    ], { leaseId: lease.leaseId, expiresTs: lease.expiresTs }, dshPluginEntry(manifest, workspace));
  };
  return options.dryRun ? execute() : withInstallLock(workspace, paths.lock, execute);
}

export function dshHookStatus(workspaceInput: string): HookIntegrationStatus {
  const workspace = resolve(workspaceInput);
  const paths = dshPaths(workspace);
  assertAllPathsSafe(workspace, Object.values(paths));
  const files = { config: paths.manifest, ignore: paths.ignore, token: paths.token, manifest: paths.manifest, signature: paths.signature };
  const base = { provider: "dsh" as const, source: DSH_HOOK_SOURCE, files };
  if (![paths.token, paths.manifest, paths.signature].some((path) => existsSync(path))) {
    return { ...base, agentId: null, mode: null, state: "not-installed", configOwned: false, manifestValid: false, leaseValid: false, leaseId: null, expiresTs: null, issues: [] };
  }
  const issues: string[] = [];
  let manifest: DshManifest | null = null;
  try {
    manifest = loadManifest(workspace, paths);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  const drifted = manifest !== null && (fileSha(manifest.pluginPath) !== manifest.pluginSha256 || fileSha(manifest.modulePath) !== manifest.moduleSha256
    || (manifest.dshInstall !== null && measureDshInstall(manifest.dshInstall.packageDir)?.sha256 !== manifest.dshInstall.sha256));
  if (drifted) issues.push("AMC's DSH plugin, its transport or the bound DSH changed after installation; reinstall to bind them");
  if (manifest?.dshInstall === null) issues.push("the installation binds no DSH install (none on PATH at install); DSH sessions cannot register and are not governed");
  issues.push("no DSH version is qualified; every DSH call is denied and nothing is enforced");
  const ignoreProtected = hasManagedIgnoreBlock(existsSync(paths.ignore) ? readFileSync(paths.ignore, "utf8") : null);
  if (manifest && !ignoreProtected) issues.push(".amc/hooks/ is not protected by .gitignore");
  const lease = managedLeaseStatus(workspace, paths.token, manifest, issues);
  const state: HookIntegrationStatus["state"] = !manifest || (!lease.valid && !lease.expired) || !ignoreProtected ? "invalid"
    : lease.expired ? "expired" : drifted ? "drifted" : "installed";
  return { ...base, agentId: manifest?.agentId ?? null, mode: manifest ? "control" : null, state, configOwned: manifest !== null, manifestValid: manifest !== null,
    leaseValid: lease.valid, leaseId: lease.payload?.leaseId ?? manifest?.leaseId ?? null, expiresTs: lease.payload?.expiresTs ?? manifest?.leaseExpiresTs ?? null, issues };
}

/** Revoke the lease, then remove the lease file, manifest and signature through the deletion gate (a hold refuses it). */
export function removeDshHook(options: RemoveHookIntegrationOptions): HookMutationResult {
  const workspace = resolve(options.workspace);
  const paths = dshPaths(workspace);
  assertAllPathsSafe(workspace, Object.values(paths));
  const dryRun = options.dryRun === true;
  const execute = (): HookMutationResult => {
    const manifest = loadManifest(workspace, paths);
    if (!manifest) return result("remove", dryRun, false, [], { leaseId: null, expiresTs: null });
    const targets = [paths.token, paths.manifest, paths.signature];
    const files = targets.map((path) => fileChange(path, path === paths.token, snapshot(path), null, dryRun));
    const lease = { leaseId: manifest.leaseId, expiresTs: manifest.leaseExpiresTs };
    if (dryRun) return result("remove", true, false, files, lease);
    revokeLeaseForCli({ workspace, leaseId: manifest.leaseId, reason: "AMC DSH hook integration removed" });
    removeInstallationFiles(workspace, "hook-dsh-remove", targets);
    return result("remove", false, true, files, lease);
  };
  return dryRun ? execute() : withInstallLock(workspace, paths.lock, execute);
}
