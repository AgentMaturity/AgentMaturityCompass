/**
 * `amc connect hooks install|status|remove --provider pi` (P1-22).
 *
 * Pi has no hook config: an extension module registers a `tool_call` handler. AMC writes `.pi/extensions/amc.js`,
 * which loads AMC's own extension (`dist/adapters/pi/amcPiExtension.js`) for this workspace and mode, next to the
 * signed manifest, dedicated lease and .gitignore block the other providers use. The manifest binds the SHA-256 of the
 * extension file and of AMC's extension module and, in control mode, the Pi install sessions must run (piInstall.ts),
 * which AMC measures again at each session registration. Pi loads project extensions only for a trusted project, so an
 * installation enforces nothing until Pi trusts the project or loads the file with `-e` (docs/adapters/pi.md).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { initApprovalPolicy } from "../../approvals/approvalPolicyEngine.js";
import { CONTROL_HOOK_ROUTE } from "../../bridge/hookControl.js";
import { NOT_GOVERNED_NOTE, piGovernance, type PiGovernance } from "../../bridge/piSessionRegistry.js";
import { revokeLeaseForCli } from "../../leases/leaseCli.js";
import { getPurposeKeyHistory } from "../../keys/signingKeys.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../../org/orgSigner.js";
import { writeFileAtomic } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import type { HookIntegrationStatus, HookMutationResult, InstallHookIntegrationOptions, RemoveHookIntegrationOptions } from "../hookIntegration.js";
import { verifyManagedLease } from "../managedHookLease.js";
import { measurePiInstall } from "../pi/piInstall.js";
import { QUALIFIED_PI_VERSIONS } from "../pi/piVersions.js";
import {
  addManagedIgnoreBlock, assertAllPathsSafe, controlApprovalPolicy, fileChange, HOOK_CONTROL_INTEGRATION_ID, HOOK_INTEGRATION_ID,
  HOOK_TOKEN_MODE, HookIntegrationError, hasManagedIgnoreBlock, hookModeSchema, ignoreBlockHash, integrationId, leaseScopes,
  leaseManifestFields, managedLeaseStatus, obtainHookLease, parseInstallOptions, relativePortable, removeManagedIgnoreBlock, restore, snapshot,
  withInstallLock, type HookFileChange, type HookMode,
} from "./installFiles.js";

/** Pi 1.0.4 (gitHead 7c10bd43…), where the extension contract AMC binds was confirmed; 1.0.2 matches it. */
export const PI_HOOK_SOURCE = {
  provider: "pi",
  contract: "Pi coding-agent extension tool_call and tool_result handlers",
  url: "https://github.com/earendil-works/pi/blob/7c10bd4337495ee613f2224843ecdf349b80d1df/packages/coding-agent/docs/extensions.md",
  reference: "7c10bd4337495ee613f2224843ecdf349b80d1df",
} as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const piManifestSchema = z.strictObject({
  v: z.literal(1),
  installationId: z.enum([HOOK_INTEGRATION_ID, HOOK_CONTROL_INTEGRATION_ID]),
  provider: z.literal("pi"),
  mode: hookModeSchema,
  source: z.strictObject({ provider: z.literal("pi"), contract: z.string(), url: z.string().url(), reference: z.string() }),
  extensionPath: z.literal(".pi/extensions/amc.js"),
  extensionSha256: sha256Schema,
  moduleSha256: sha256Schema,
  modulePath: z.string().min(1),
  createdDirs: z.array(z.enum([".pi", ".pi/extensions"])),
  ignorePath: z.literal(".gitignore"),
  ignoreExistedBefore: z.boolean(),
  ignoreBlockSha256: sha256Schema,
  tokenPath: z.literal(".amc/hooks/pi.lease"),
  ...leaseManifestFields,
  qualifiedPiVersions: z.array(z.string()),
  /** Control mode: the Pi install sessions must run, as measured at install; null when none was given or found. */
  piInstall: z.strictObject({ packageDir: z.string().min(1), version: z.string().min(1), sha256: sha256Schema }).nullable(),
  /** The keys of AMC's `receipt` signing purpose (P1-08) at install; the extension accepts only decision receipts they sign. */
  receiptPublicKeys: z.array(z.string().min(1)).min(1),
  installedTs: z.number().int(),
  updatedTs: z.number().int(),
  control: z.strictObject({
    endpoint: z.literal(CONTROL_HOOK_ROUTE),
    localOnly: z.literal(true),
    rawInputTransport: z.literal("loopback-memory-only"),
    leaseScope: z.literal("hook:control"),
    providerOutcomes: z.tuple([z.literal("allow"), z.literal("deny"), z.literal("ask")]),
  }).nullable(),
});
type PiManifest = z.infer<typeof piManifestSchema>;

function piPaths(workspace: string) {
  const base = join(workspace, ".amc", "hooks", "pi");
  return { extension: join(workspace, ".pi", "extensions", "amc.js"), ignore: join(workspace, ".gitignore"), token: `${base}.lease`,
    manifest: `${base}.json`, signature: `${base}.json.sig`, lock: `${base}.lock` };
}
type PiPaths = ReturnType<typeof piPaths>;

/**
 * The installed extension file: it loads AMC's extension module for this workspace and mode. It reads Pi's version
 * itself, because only a file Pi loads directly resolves Pi's own module (a nested ESM import does not); a version it
 * cannot read is "unknown", which control denies, rather than a load failure that would leave Pi running without AMC.
 */
function extensionSource(workspace: string, mode: HookMode, modulePath: string): string {
  return [
    `// AMC managed Pi extension [${integrationId(mode)}], written by \`amc connect hooks install --provider pi\`. Do not edit;`,
    "// remove it with `amc connect hooks remove --provider pi`.",
    `import { createAmcPiExtension } from ${JSON.stringify(modulePath)};`,
    "export default async function amc(pi) {",
    "  let piVersion;",
    "  try { piVersion = (await import(\"@earendil-works/pi-coding-agent\")).VERSION; } catch { piVersion = undefined; }",
    `  return createAmcPiExtension({ workspace: ${JSON.stringify(workspace)}, mode: ${JSON.stringify(mode)}, piVersion })(pi);`,
    "}",
    "",
  ].join("\n");
}

function limitations(mode: HookMode): string[] {
  return [
    mode === "control"
      ? "control is enforced at Pi's tool_call hook for mapped tools on qualified Pi versions only; raw input stays on loopback"
      : "observation only; Pi tool calls are not controlled",
    "Pi loads .pi/extensions/amc.js only for a trusted project (or with pi -e); nothing is enforced while Pi does not load it",
    "not covered: OS containment, Pi Durable, effects outside tool_call (another extension's own I/O), Codemode-internal calls",
    "Pi ask is always denied until an AMC approval path exists",
    "a session registration is a lease-holder attestation checked against disk, not proof that Pi ran the hook",
  ];
}

function loadManifest(workspace: string, paths: PiPaths): PiManifest | null {
  if (!existsSync(paths.manifest) && !existsSync(paths.signature)) return null;
  if (!existsSync(paths.manifest) || !existsSync(paths.signature)) {
    throw new HookIntegrationError("HOOK_MANIFEST_INVALID", "hook installation manifest or signature is missing");
  }
  const verification = verifySignedFileWithAuditor(workspace, paths.manifest);
  if (!verification.valid) {
    throw new HookIntegrationError("HOOK_MANIFEST_INVALID", `hook installation manifest signature is invalid: ${verification.reason ?? "verification failed"}`);
  }
  const parsed = piManifestSchema.safeParse(JSON.parse(readFileSync(paths.manifest, "utf8")) as unknown);
  if (!parsed.success || parsed.data.installationId !== integrationId(parsed.data.mode) || (parsed.data.mode === "control") !== (parsed.data.control !== null)) {
    throw new HookIntegrationError("HOOK_MANIFEST_INVALID", "Pi hook installation manifest does not match schema");
  }
  return parsed.data;
}

const fileSha = (path: string): string | null => (existsSync(path) ? sha256Hex(readFileSync(path)) : null);
const sameKeys = (left: readonly string[], right: readonly string[]): boolean => [...left].sort().join("\n") === [...right].sort().join("\n");

function result(operation: "install" | "remove", mode: HookMode, dryRun: boolean, applied: boolean, files: HookFileChange[],
  lease: { leaseId: string | null; expiresTs: number | null }): HookMutationResult {
  return { operation, provider: "pi", mode, source: PI_HOOK_SOURCE, dryRun, applied, changed: files.some((file) => file.action !== "unchanged"),
    files, lease: { scope: "hook:observe", scopes: leaseScopes(mode), route: "/hooks", ...lease }, limitations: limitations(mode) };
}

export function installPiHook(options: InstallHookIntegrationOptions, modulePathInput: string): HookMutationResult {
  const { mode, workspace, agentId, bridgeBase, ttl, rpm } = parseInstallOptions(options);
  const modulePath = resolve(modulePathInput);
  if (!existsSync(modulePath)) throw new HookIntegrationError("HOOK_PATH_UNSAFE", `AMC's Pi extension module is missing: ${modulePath}; build or reinstall AMC`);
  const piInstall = mode === "control" && options.piPackageDir ? measurePiInstall(resolve(options.piPackageDir)) : null;
  if (mode === "control" && options.piPackageDir && !piInstall) {
    throw new HookIntegrationError("HOOK_PATH_UNSAFE", `not a Pi package (${resolve(options.piPackageDir)}); name the @earendil-works/pi-coding-agent directory`);
  }
  const paths = piPaths(workspace);
  assertAllPathsSafe(workspace, Object.values(paths));

  const execute = (): HookMutationResult => {
    const existing = loadManifest(workspace, paths);
    const extensionBytes = Buffer.from(extensionSource(workspace, mode, modulePath), "utf8");
    const currentSha = fileSha(paths.extension);
    if (currentSha !== null && currentSha !== existing?.extensionSha256) {
      throw new HookIntegrationError("HOOK_OWNERSHIP_CONFLICT", ".pi/extensions/amc.js exists but is not the extension AMC's signed manifest installed");
    }
    const approval = controlApprovalPolicy(workspace, mode);
    const ignoreBefore = snapshot(paths.ignore);
    const ignoreBytes = Buffer.from(addManagedIgnoreBlock(ignoreBefore.bytes?.toString("utf8") ?? null), "utf8");
    const existingLease = verifyManagedLease({ workspace, tokenPath: paths.token, expectedAgentId: agentId, mode });
    const moduleSha256 = sha256Hex(readFileSync(modulePath));
    const receiptPublicKeys = getPurposeKeyHistory(workspace, "receipt");
    const before = { extension: snapshot(paths.extension), ignore: ignoreBefore, token: snapshot(paths.token), manifest: snapshot(paths.manifest),
      signature: snapshot(paths.signature) };
    if (existing && existing.mode === mode && existing.agentId === agentId && existing.bridgeBase === bridgeBase
      && existing.extensionSha256 === sha256Hex(extensionBytes) && existing.moduleSha256 === moduleSha256
      && sameKeys(existing.receiptPublicKeys, receiptPublicKeys) && hasManagedIgnoreBlock(ignoreBefore.bytes?.toString("utf8") ?? null)
      && JSON.stringify(existing.piInstall) === JSON.stringify(piInstall)
      && existingLease.valid && existingLease.payload?.leaseId === existing.leaseId) {
      const unchanged = [paths.extension, paths.ignore, paths.token, paths.manifest, paths.signature]
        .map((path) => ({ path, action: "unchanged" as const, sensitive: path === paths.token }));
      return result("install", mode, options.dryRun === true, false, unchanged, { leaseId: existing.leaseId, expiresTs: existing.leaseExpiresTs });
    }
    if (options.dryRun) {
      return result("install", mode, true, false, [
        fileChange(paths.extension, false, before.extension, extensionBytes, true),
        fileChange(paths.ignore, false, ignoreBefore, ignoreBytes, true),
        fileChange(paths.token, true, before.token, Buffer.from("planned dedicated lease\n"), true),
        fileChange(paths.manifest, false, before.manifest, Buffer.from("planned signed manifest\n"), true),
        fileChange(paths.signature, false, before.signature, Buffer.from("planned signature\n"), true),
      ], { leaseId: null, expiresTs: null });
    }

    const { token, payload: lease, issued } = obtainHookLease({ workspace, agentId, mode, ttl, rpm, tokenPath: paths.token, existing: existingLease });
    const createdDirs = existing?.createdDirs ?? [".pi", ".pi/extensions"].filter((dir) => !existsSync(join(workspace, dir))) as PiManifest["createdDirs"];
    const now = Date.now();
    const manifest: PiManifest = piManifestSchema.parse({
      v: 1, installationId: integrationId(mode), provider: "pi", mode, source: PI_HOOK_SOURCE, extensionPath: ".pi/extensions/amc.js",
      extensionSha256: sha256Hex(extensionBytes), moduleSha256, modulePath, createdDirs, ignorePath: ".gitignore",
      ignoreExistedBefore: existing?.ignoreExistedBefore ?? ignoreBefore.existed, ignoreBlockSha256: ignoreBlockHash(),
      tokenPath: relativePortable(workspace, paths.token), agentId, bridgeBase, leaseId: lease.leaseId, leaseIssuedTs: lease.issuedTs,
      leaseExpiresTs: lease.expiresTs, qualifiedPiVersions: [...QUALIFIED_PI_VERSIONS], piInstall, receiptPublicKeys, installedTs: existing?.installedTs ?? now, updatedTs: now,
      control: mode === "control" ? { endpoint: CONTROL_HOOK_ROUTE, localOnly: true, rawInputTransport: "loopback-memory-only",
        leaseScope: "hook:control", providerOutcomes: ["allow", "deny", "ask"] } : null,
    });
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    try {
      if (mode === "control" && !approval.before.existed) initApprovalPolicy(workspace);
      writeFileAtomic(paths.ignore, ignoreBytes, ignoreBefore.existed ? ignoreBefore.mode : 0o644);
      writeFileAtomic(paths.token, `${token}\n`, HOOK_TOKEN_MODE);
      mkdirSync(dirname(paths.extension), { recursive: true });
      writeFileAtomic(paths.extension, extensionBytes, 0o644);
      writeFileAtomic(paths.manifest, manifestBytes, 0o644);
      signFileWithAuditor(workspace, paths.manifest);
      if (issued && existing && existing.leaseId !== lease.leaseId) {
        revokeLeaseForCli({ workspace, leaseId: existing.leaseId, reason: "AMC provider hook integration lease rotated" });
      }
    } catch (error) {
      for (const [key, path] of [["extension", paths.extension], ["ignore", paths.ignore], ["token", paths.token], ["manifest", paths.manifest],
        ["signature", paths.signature]] as const) restore(path, before[key]);
      restore(approval.path, approval.before);
      restore(approval.sigPath, approval.sigBefore);
      if (issued) {
        try { revokeLeaseForCli({ workspace, leaseId: lease.leaseId, reason: "AMC hook installation rolled back" }); } catch { /* keep the original error */ }
      }
      throw error;
    }
    return result("install", mode, false, true, [
      fileChange(paths.extension, false, before.extension, extensionBytes, false),
      fileChange(paths.ignore, false, ignoreBefore, ignoreBytes, false),
      fileChange(paths.token, true, before.token, Buffer.from(`${token}\n`), false),
      fileChange(paths.manifest, false, before.manifest, manifestBytes, false),
      { path: paths.signature, action: before.signature.existed ? "update" : "create", sensitive: false },
    ], { leaseId: lease.leaseId, expiresTs: lease.expiresTs });
  };
  return options.dryRun ? execute() : withInstallLock(workspace, paths.lock, execute);
}

/** Observe mode claims "observed" only; control claims come from verified session registrations (piSessionRegistry.ts). */
function sessionGovernance(workspace: string, manifest: PiManifest): PiGovernance {
  const none = { registeredSessions: 0, qualifiedSessions: 0, invalidRegistrations: 0, latestRegistrationAt: null, note: NOT_GOVERNED_NOTE };
  if (manifest.mode === "observe") return { claim: "observed", ...none };
  try {
    return piGovernance(workspace, manifest.agentId);
  } catch {
    return { claim: "not_evaluated", ...none };
  }
}

/** Control mode: whether the bound Pi install is missing or changed on disk (an issue each); unbound is an issue, not drift. */
function piInstallDrifted(manifest: PiManifest | null, issues: string[]): boolean {
  if (manifest?.mode !== "control") return false;
  if (!manifest.piInstall) {
    issues.push("the control installation binds no Pi install (none was given or on PATH at install); Pi sessions cannot register and are not governed");
    return false;
  }
  const measured = measurePiInstall(manifest.piInstall.packageDir);
  if (measured?.sha256 === manifest.piInstall.sha256 && measured.version === manifest.piInstall.version) return false;
  issues.push("Pi on disk changed after installation (upgrade, edit or removal); reinstall to bind it");
  return true;
}

export function piHookStatus(workspaceInput: string): HookIntegrationStatus {
  const workspace = resolve(workspaceInput);
  const paths = piPaths(workspace);
  assertAllPathsSafe(workspace, Object.values(paths));
  const files = { config: paths.extension, ignore: paths.ignore, token: paths.token, manifest: paths.manifest, signature: paths.signature };
  const base = { provider: "pi" as const, source: PI_HOOK_SOURCE, files };
  if (![paths.extension, paths.token, paths.manifest, paths.signature].some((path) => existsSync(path))) {
    return { ...base, agentId: null, mode: null, state: "not-installed", configOwned: false, manifestValid: false, leaseValid: false,
      leaseId: null, expiresTs: null, issues: [] };
  }
  const issues: string[] = [];
  let manifest: PiManifest | null = null;
  try {
    manifest = loadManifest(workspace, paths);
    if (!manifest) issues.push("hook installation manifest is missing");
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  const configOwned = manifest !== null && fileSha(paths.extension) === manifest.extensionSha256;
  if (manifest && !existsSync(paths.extension)) issues.push(".pi/extensions/amc.js is missing");
  else if (manifest && !configOwned) issues.push(".pi/extensions/amc.js changed after installation");
  const moduleDrifted = manifest !== null && fileSha(manifest.modulePath) !== manifest.moduleSha256;
  if (moduleDrifted) issues.push("AMC's Pi extension module changed after installation; reinstall to bind the new module");
  const keysDrifted = manifest !== null && !sameKeys(manifest.receiptPublicKeys, getPurposeKeyHistory(workspace, "receipt"));
  if (keysDrifted) issues.push("AMC's receipt signing keys changed after installation; reinstall so the extension accepts them");
  const piDrifted = piInstallDrifted(manifest, issues);
  const ignoreProtected = hasManagedIgnoreBlock(existsSync(paths.ignore) ? readFileSync(paths.ignore, "utf8") : null);
  if (manifest && !ignoreProtected) issues.push(".amc/hooks/ is not protected by .gitignore");
  const lease = managedLeaseStatus(workspace, paths.token, manifest, issues);
  const counted = manifest ? sessionGovernance(workspace, manifest) : undefined;
  if (counted?.invalidRegistrations) issues.push(`${counted.invalidRegistrations} Pi session registration(s) failed verification`);
  const state: HookIntegrationStatus["state"] = !manifest || (!lease.valid && !lease.expired) || !ignoreProtected
    || issues.some((issue) => issue.includes("lease ID") || issue.includes("failed verification")) ? "invalid"
    : lease.expired ? "expired" : !configOwned || moduleDrifted || keysDrifted || piDrifted ? "drifted" : "installed";
  // Only an intact installation keeps an enforced claim; a drifted, expired or invalid one is not governed.
  const governance = counted?.claim === "enforced_at_pi_tool_call" && state !== "installed" ? { ...counted, claim: "not_governed" as const } : counted;
  return { ...base, agentId: manifest?.agentId ?? null, mode: manifest?.mode ?? null, state, configOwned, manifestValid: manifest !== null,
    leaseValid: lease.valid, leaseId: lease.payload?.leaseId ?? manifest?.leaseId ?? null, expiresTs: lease.payload?.expiresTs ?? manifest?.leaseExpiresTs ?? null,
    issues, ...(governance ? { governance } : {}) };
}

export function removePiHook(options: RemoveHookIntegrationOptions): HookMutationResult {
  const workspace = resolve(options.workspace);
  const paths = piPaths(workspace);
  assertAllPathsSafe(workspace, Object.values(paths));
  const dryRun = options.dryRun === true;
  const execute = (): HookMutationResult => {
    const manifest = loadManifest(workspace, paths);
    if (!manifest) {
      if (existsSync(paths.extension)) throw new HookIntegrationError("HOOK_MANIFEST_INVALID", "refusing to remove .pi/extensions/amc.js without a signed manifest");
      return result("remove", "observe", dryRun, false, [], { leaseId: null, expiresTs: null });
    }
    if (existsSync(paths.extension) && fileSha(paths.extension) !== manifest.extensionSha256) {
      throw new HookIntegrationError("HOOK_OWNERSHIP_CONFLICT", ".pi/extensions/amc.js differs from the signed installation manifest");
    }
    const ignoreBefore = snapshot(paths.ignore);
    const ignoreText = removeManagedIgnoreBlock(ignoreBefore.bytes?.toString("utf8") ?? "");
    const nextIgnore = !manifest.ignoreExistedBefore && ignoreText.trim().length === 0 ? null : Buffer.from(ignoreText, "utf8");
    const files = [
      fileChange(paths.extension, false, snapshot(paths.extension), null, dryRun),
      fileChange(paths.ignore, false, ignoreBefore, nextIgnore, dryRun),
      fileChange(paths.token, true, snapshot(paths.token), null, dryRun),
      fileChange(paths.manifest, false, snapshot(paths.manifest), null, dryRun),
      fileChange(paths.signature, false, snapshot(paths.signature), null, dryRun),
    ];
    const lease = { leaseId: manifest.leaseId, expiresTs: manifest.leaseExpiresTs };
    if (dryRun) return result("remove", manifest.mode, true, false, files, lease);
    revokeLeaseForCli({ workspace, leaseId: manifest.leaseId, reason: "AMC provider hook integration removed" });
    if (nextIgnore === null) {
      if (existsSync(paths.ignore)) unlinkSync(paths.ignore);
    } else {
      writeFileAtomic(paths.ignore, nextIgnore, ignoreBefore.mode);
    }
    for (const path of [paths.extension, paths.token, paths.manifest, paths.signature]) if (existsSync(path)) unlinkSync(path);
    // Only the directories this installation created, and only while empty: an empty .pi/extensions still asks Pi for trust.
    for (const dir of [...manifest.createdDirs].reverse()) {
      const full = join(workspace, dir);
      if (existsSync(full) && readdirSync(full).length === 0) rmdirSync(full);
    }
    return result("remove", manifest.mode, false, true, files, lease);
  };
  return dryRun ? execute() : withInstallLock(workspace, paths.lock, execute);
}
