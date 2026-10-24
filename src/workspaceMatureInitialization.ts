/** Fixed mature initWorkspaceAsync continuation; fresh, no-sign and unsupported tails retain the old entry recipe. */
import { randomBytes } from "node:crypto";
import { closeSync, constants, fchmodSync, fstatSync, lstatSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { getWorkspacePaths, defaultContextGraph, defaultWorkspaceArtifactBodies, type InitWorkspaceOptions } from "./workspace.js";
import { captureWorkspaceColdOrgPrerequisites, WorkspaceInitializationPartialError } from "./workspaceColdOrgPrerequisites.js";
import { captureAmcConfigInitialization } from "./config/amcConfigInitialization.js";
import { ensureSigningKeys } from "./crypto/keys.js";
import { signingRoute } from "./crypto/signing/signer.js";
import { assertKeysetComplete, boundProviderKey, keysetCommittedMark } from "./keys/keyset.js";
import { openLedger } from "./ledger/ledger.js";
import { currentAgentPath, fleetConfigPath, agentRoot, getCurrentAgent } from "./fleet/paths.js";
import { assertOrgPairsCurrent, captureOrgFiles, orgPairBytes, OrgPairsPublicationError } from "./org/preparedOrgPairs.js";
import { defaultTargetMapping } from "./targets/targetProfile.js";
import { prepareTargetProfileSignatureAsync } from "./targets/targetProfilePublication.js";
import { actionPolicyPath } from "./governor/actionPolicyEngine.js";
import { toolsConfigPath } from "./toolhub/toolhubValidators.js";
import { BudgetsPublicationError } from "./budgets/budgets.js";
import { adaptersConfigPath, AdaptersConfigPublicationError } from "./adapters/adapterConfigStore.js";
import { bridgeConfigPath } from "./bridge/bridgeConfigStore.js";
import { modelTaxonomyPath } from "./bridge/modelTaxonomy.js";
import { opsPolicyPath } from "./ops/policy.js";
import { trustConfigPath } from "./trust/trustConfig.js";
import { forecastPolicyPath } from "./forecast/forecastStore.js";
import { canonPath } from "./canon/canonLoader.js";
import { diagnosticBankPath } from "./diagnostic/bank/bankLoader.js";
import { cgxPolicyPath } from "./cgx/cgxStore.js";
import { mechanicTargetsPath } from "./mechanic/targetsStore.js";
import { benchPolicyPath } from "./bench/benchPolicyStore.js";
import { promptPolicyPath } from "./prompt/promptPolicyStore.js";
import { assurancePolicyPath } from "./assurance/assurancePolicyStore.js";
import { auditPolicyPath } from "./audit/auditPolicyStore.js";
import { auditMapActivePath, auditMapBuiltinPath } from "./audit/auditMapStore.js";
import { pathExists } from "./utils/fs.js";
import { canonicalize } from "./utils/json.js";
import { sha256Hex } from "./utils/hash.js";
import { vaultStatus } from "./vault/vault.js";

type Progress = { path: string; stage: string; attempted: true; returned: boolean; acknowledged?: boolean };
type Directory = { path: string; identity: string | null; mode: number | null };
function directory(path: string): Directory {
  try {
    const stat = lstatSync(path);
    if (!stat.isDirectory()) throw new Error("initializer directory must be a real directory");
    return { path, identity: `${stat.dev}:${stat.ino}`, mode: stat.mode & 0o777 };
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return { path, identity: null, mode: null };
    throw cause;
  }
}
function directories(workspace: string, selected: ReturnType<typeof getWorkspacePaths>) {
  const root = resolve(workspace), ordered = new Set<string>([root]);
  for (const requested of [selected.amcDir, selected.keysDir, selected.blobsDir, selected.targetsDir, selected.runsDir, selected.reportsDir, selected.bundlesDir]) {
    const chain: string[] = [];
    for (let next = resolve(requested); next !== root; next = dirname(next)) {
      if (dirname(next) === next) throw new Error("initializer directory is outside its workspace");
      chain.push(next);
    }
    for (const path of chain.reverse()) ordered.add(path);
  }
  return new Map([...ordered].map(path => [path, directory(path)]));
}
function assertDirectoriesCurrent(expected: ReadonlyMap<string, Directory>) {
  for (const old of expected.values()) {
    const current = directory(old.path);
    if (current.identity !== old.identity || current.mode !== old.mode) throw new Error("original or acknowledged initializer directory changed");
  }
}

/** Typed partial prefix only: inherited vault, lock, cold and SQLite internals do not expose every native effect. */
export class WorkspaceMatureInitializationPartialError extends WorkspaceInitializationPartialError {
  constructor(cause: unknown, paths: readonly string[], readonly observation: {
    nativeProgress: readonly Readonly<Progress>[]; configProgress: readonly Readonly<Progress>[];
    inherited: Readonly<Record<string, boolean>>; closeCauses: readonly unknown[]; cleanupCauses: readonly unknown[];
    lateSignatureFailure: { cause: unknown } | null;
  }) {
    super(cause, paths); this.name = "WorkspaceMatureInitializationPartialError";
    this.message = "mature workspace initialization did not complete; actual attempted and returned prefixes remain";
  }
}

/** Private scope choice from actual old branches. Null is the existing unsupported entry, never caller permission. */
export function captureMatureWorkspaceInitialization(workspace: string, supplied: InitWorkspaceOptions) {
  const noSignAtEntry = process.env.AMC_NO_SIGN === "1";
  if (noSignAtEntry) return null;
  const markAtEntry = keysetCommittedMark(workspace);
  if (markAtEntry === null) return null;
  const originalMark = canonicalize(markAtEntry);
  const options = structuredClone(supplied); options.workspacePath = workspace;
  const paths = getWorkspacePaths(workspace, options.agentId), selected = canonicalize(paths);
  const skipped = [trustConfigPath(workspace), actionPolicyPath(workspace), toolsConfigPath(workspace), join(workspace, ".amc", "gateway.yaml"),
    bridgeConfigPath(workspace), modelTaxonomyPath(workspace), opsPolicyPath(workspace), forecastPolicyPath(workspace), cgxPolicyPath(workspace),
    mechanicTargetsPath(workspace), benchPolicyPath(workspace), promptPolicyPath(workspace), assurancePolicyPath(workspace), auditPolicyPath(workspace),
    auditMapBuiltinPath(workspace), auditMapActivePath(workspace)];
  if (skipped.some(path => !pathExists(path))) return null;
  const fleetNoopRequired = !options.agentId?.trim() || paths.agentId === "default";
  if (fleetNoopRequired && (!pathExists(fleetConfigPath(workspace)) || !pathExists(agentRoot(workspace, "default")) || !getCurrentAgent(workspace))) return null;
  // Config is always an actual late signer. The BUNDLE vault is relevant only for selected missing cold members.
  if (boundProviderKey(workspace, "config-signature") === null && !vaultStatus(workspace).unlocked) return null;
  const coldBundleMissing = !pathExists(adaptersConfigPath(workspace)) || !pathExists(canonPath(workspace)) || !pathExists(diagnosticBankPath(workspace));
  if (coldBundleMissing && signingRoute(workspace, "BUNDLE") === "vault" && boundProviderKey(workspace, "artifact-seal") === null && !vaultStatus(workspace).unlocked) return null;
  const originalKeyset = canonicalize(assertKeysetComplete(workspace));
  if (canonicalize(keysetCommittedMark(workspace)) !== originalMark) throw new Error("original mature initializer mark changed during capture");
  const implicitAgent = !options.agentId?.trim(), originalAgentEnv = implicitAgent ? process.env.AMC_AGENT_ID : undefined;
  const currentAgentSelected = implicitAgent && !originalAgentEnv?.trim();
  const selectionFiles = captureOrgFiles(currentAgentSelected || fleetNoopRequired ? [currentAgentPath(workspace)] : []);
  const selectedFleetPresence = fleetNoopRequired ? [fleetConfigPath(workspace), agentRoot(workspace, "default")] : [];
  const targetFile = join(paths.targetsDir, "default.target.json"), artifacts = defaultWorkspaceArtifactBodies(paths);
  const previous = captureOrgFiles([paths.contextGraph, ...artifacts.map(row => row.path), targetFile]);
  const expected = new Map(previous.members.map(row => [row.path, row]));
  const contextBytes = orgPairBytes(previous, paths.contextGraph) ?? Buffer.from(JSON.stringify(defaultContextGraph(options), null, 2));
  const contextGraphHash = sha256Hex(canonicalize(JSON.parse(contextBytes.toString("utf8")) as unknown));
  const mapping = defaultTargetMapping(3), originalDirectories = directories(workspace, paths), directoryMode = 0o777 & ~process.umask();
  const progress: Progress[] = [], returnedPaths: string[] = [], closeCauses: unknown[] = [], cleanupCauses: unknown[] = [];
  const inherited: Record<string, boolean> = { coldCaptureAttempted: false, coldCaptureReturned: false, ensureSigningKeysAttempted: false,
    ensureSigningKeysReturned: false, ledgerOpenAttempted: false, ledgerOpenReturned: false, ledgerCloseAttempted: false, ledgerCloseReturned: false };
  const snapshot = () => Object.freeze(progress.map(row => Object.freeze({ ...row })));
  let config: ReturnType<typeof captureAmcConfigInitialization> | null = null;
  let cold: ReturnType<typeof captureWorkspaceColdOrgPrerequisites> | null = null, targetCurrent: (() => void) | null = null, entered = false, completed = false;
  const assertOriginal = () => {
    if (noSignAtEntry || process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize mature workspace signing");
    if (canonicalize(keysetCommittedMark(workspace)) !== originalMark || canonicalize(assertKeysetComplete(workspace)) !== originalKeyset)
      throw new Error("original mature initializer generation changed; inherited migration effects remain");
    if (canonicalize(getWorkspacePaths(workspace, options.agentId)) !== selected || (implicitAgent && process.env.AMC_AGENT_ID !== originalAgentEnv))
      throw new Error("original mature initializer agent selection changed");
    assertOrgPairsCurrent(selectionFiles);
    for (const path of [...skipped, ...selectedFleetPresence]) if (!pathExists(path)) throw new Error("original initializer skip presence disappeared: " + path);
    if ((0o777 & ~process.umask()) !== directoryMode) throw new Error("original initializer creation mode changed");
  };
  const assertCurrent = () => {
    assertOriginal(); config?.assertCurrent(); cold?.assertCurrent(); targetCurrent?.(); assertOriginal();
    assertOrgPairsCurrent({ members: [...expected.values()] }); assertDirectoriesCurrent(originalDirectories);
  };
  const partial = (cause: unknown) => {
    const nested = cause instanceof OrgPairsPublicationError || cause instanceof BudgetsPublicationError || cause instanceof AdaptersConfigPublicationError
      ? cause.publishedPaths : [];
    const paths = [...(cold?.completedPaths ?? []), ...returnedPaths, ...(config?.returnedPaths ?? []), ...nested]
      .map(path => relative(workspace, resolve(workspace, path)));
    // Preserve primary, close and cleanup causes independently; a thrown native call is not zero effects.
    return new WorkspaceMatureInitializationPartialError(cause, Object.freeze([...new Set(paths)]), Object.freeze({
      nativeProgress: snapshot(), configProgress: config?.nativeProgress ?? Object.freeze([]), inherited: Object.freeze({ ...inherited }),
      closeCauses: Object.freeze([...closeCauses]), cleanupCauses: Object.freeze([...cleanupCauses]), lateSignatureFailure: config?.lateSignatureFailure ?? null
    }));
  };
  const operation = <T>(path: string, stage: string, run: () => T): T => {
    const row: Progress = { path, stage, attempted: true, returned: false }; progress.push(row);
    const result = run(); row.returned = true; return result;
  };
  const writeMember = (destination: string, intended: Buffer) => {
    if (!expected.has(destination)) throw new Error("initializer member is outside its captured fixed recipe");
    const temporary = operation(destination, "stage-name", () => join(dirname(destination), `.amc-init-${randomBytes(12).toString("hex")}.tmp`));
    let descriptor: number | null = null, identity: string | null = null, renamed = false, failed = false, primary: unknown;
    try {
      assertCurrent();
      descriptor = operation(temporary, "open-exclusive", () => openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600));
      const opened = operation(temporary, "fstat-open", () => fstatSync(descriptor!)); identity = `${opened.dev}:${opened.ino}`;
      if (!opened.isFile() || opened.nlink !== 1) throw new Error("initializer staging member is not a private regular file");
      operation(temporary, "write", () => writeFileSync(descriptor!, intended));
      operation(temporary, "chmod", () => fchmodSync(descriptor!, 0o644));
    } catch (cause) { failed = true; primary = cause; }
    finally {
      if (descriptor !== null) {
        try { operation(temporary, "close", () => closeSync(descriptor!)); }
        catch (cause) { closeCauses.push(cause); if (!failed) { failed = true; primary = cause; } }
      }
    }
    if (!failed) {
      try {
        const staged = captureOrgFiles([temporary]).members[0]!, stat = lstatSync(temporary);
        if (staged.identity !== identity || staged.mode !== 0o644 || staged.bytes === null || !staged.bytes.equals(intended) || stat.nlink !== 1)
          throw new Error("initializer staging identity or bytes changed before rename");
        assertCurrent(); operation(destination, "rename", () => renameSync(temporary, destination)); renamed = true; returnedPaths.push(destination);
        const own = operation(destination, "acknowledge", () => captureOrgFiles([destination]).members[0]!);
        if (own.identity !== identity || own.mode !== 0o644 || own.bytes === null || !own.bytes.equals(intended))
          throw new Error("initializer destination is not its returned staging inode and bytes");
        progress[progress.length - 1]!.acknowledged = true; expected.set(destination, own);
      } catch (cause) { failed = true; primary = cause; }
    }
    if (!renamed && identity !== null) {
      try {
        let currentIdentity: string | null = null;
        try { const current = lstatSync(temporary); currentIdentity = `${current.dev}:${current.ino}`; }
        catch (cause) { if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause; }
        if (currentIdentity !== null) {
          if (currentIdentity !== identity) throw new Error("initializer does not own the remaining staging pathname; cleanup refused");
          operation(temporary, "cleanup", () => unlinkSync(temporary));
        }
      } catch (cause) { cleanupCauses.push(cause); if (!failed) { failed = true; primary = cause; } }
    }
    if (failed) throw primary;
    assertCurrent();
  };
  try {
    assertCurrent(); config = captureAmcConfigInitialization(workspace, options.trustBoundaryMode); assertCurrent();
    inherited.coldCaptureAttempted = true; cold = captureWorkspaceColdOrgPrerequisites(workspace, options.agentId); inherited.coldCaptureReturned = true;
    assertCurrent();
  } catch (cause) { throw partial(cause); }
  const assertAttemptCurrent = () => { try { assertCurrent(); } catch (cause) { throw partial(cause); } };
  return Object.freeze({
    assertCurrent: assertAttemptCurrent,
    assertCompleted() {
      if (!completed) throw new Error("mature initializer has not completed its actual final gate");
      assertAttemptCurrent();
    },
    async initialize(): Promise<{ workspacePath: string; contextGraphHash: string }> {
    if (entered) throw new Error("mature initializer attempt has already entered"); entered = true;
    try {
      assertCurrent(); await cold!.initializeAdapters(); assertCurrent();
      await cold!.initializeCanon(); assertCurrent(); await cold!.initializeBank(); assertCurrent(); await cold!.initializeBudgets(); assertCurrent();
      // Preserve the sync core's seven directory selections and creation order, without broad initializer replay.
      for (const requested of [paths.amcDir, paths.keysDir, paths.blobsDir, paths.targetsDir, paths.runsDir, paths.reportsDir, paths.bundlesDir]) {
        const chain: string[] = [];
        for (let next = resolve(requested); next !== resolve(workspace); next = dirname(next)) chain.push(next);
        for (const path of chain.reverse()) {
          const original = originalDirectories.get(path)!; assertCurrent();
          if (original.identity !== null) continue;
          operation(path, "mkdir", () => mkdirSync(path, { mode: directoryMode }));
          const own = operation(path, "acknowledge-directory", () => directory(path));
          if (own.identity === null || own.mode !== directoryMode) throw new Error("initializer returned directory has another mode or disappeared");
          // mkdir returns no inode. This is an explicit point-in-time readback, not native attribution of directory creation.
          progress[progress.length - 1]!.acknowledged = true; originalDirectories.set(path, own); assertCurrent();
        }
      }
      assertCurrent(); inherited.ensureSigningKeysAttempted = true; ensureSigningKeys(workspace); inherited.ensureSigningKeysReturned = true; assertCurrent();
      if (orgPairBytes(previous, paths.contextGraph) === null) writeMember(paths.contextGraph, contextBytes);
      assertCurrent(); config!.publishBody(assertCurrent); assertCurrent();
      for (const artifact of artifacts) if (orgPairBytes(previous, artifact.path) === null) writeMember(artifact.path, artifact.bytes);
      if (orgPairBytes(previous, targetFile) === null) {
        assertCurrent();
        const target = await prepareTargetProfileSignatureAsync({ workspace, name: "default", contextGraphHash, mapping }, assertCurrent);
        targetCurrent = target.assertCurrent; assertCurrent(); writeMember(targetFile, target.bytes);
      }
      assertCurrent(); inherited.ledgerOpenAttempted = true; const ledger = openLedger(workspace); inherited.ledgerOpenReturned = true;
      inherited.ledgerCloseAttempted = true; ledger.close(); inherited.ledgerCloseReturned = true; assertCurrent();
      // Every non-cold signed default and optional default-fleet branch was an original presence/no-op decision.
      // Keep the old late best-effort signature contract; its real failure remains in the private attempt observation.
      try { await config!.signLate(assertCurrent); } catch { /* existing best-effort sidecar stage; no alternate signer or retry */ }
      // This independent original/owned gate is outside that catch: changed authority or destinations never grant completion.
      assertCurrent(); completed = true; return { workspacePath: workspace, contextGraphHash };
    } catch (cause) { throw partial(cause); }
  } });
}
