import { generateKeyPairSync } from "node:crypto";
import { request as httpRequest, type RequestOptions } from "node:http";
import { dirname, join, resolve } from "node:path";
import { initWorkspaceAsync } from "../workspaceInitializationAsync.js";
import { captureWorkspaceColdOrgPrerequisites, type WorkspaceColdOrgPrerequisites } from "../workspaceColdOrgPrerequisites.js";
import { createVault, getVaultSecret, setVaultSecret, unlockVault, vaultExists, vaultStatus } from "../vault/vault.js";
import { initUsersConfig, usersConfigPath, verifyUsersConfigSignature } from "../auth/authApi.js";
import { actionPolicyPath, initActionPolicy } from "../governor/actionPolicyEngine.js";
import { initToolsConfig, toolsConfigPath } from "../toolhub/toolhubValidators.js";
import { budgetsPath } from "../budgets/budgets.js";
import { approvalPolicyPath, initApprovalPolicy } from "../approvals/approvalPolicyEngine.js";
import { adaptersConfigPath } from "../adapters/adapterConfigStore.js";
import { bridgeConfigPath, initBridgeConfig } from "../bridge/bridgeConfigStore.js";
import { initModelTaxonomy, modelTaxonomyPath } from "../bridge/modelTaxonomy.js";
import { initOrgConfig, orgConfigPath } from "../org/orgStore.js";
import { initGatewayConfig } from "../gateway/config.js";
import { initOpsPolicyAsync, opsPolicyPath } from "../ops/policy.js";
import { keysetDeclared } from "../keys/keyset.js";
import { initForecastPolicy } from "../forecast/forecastEngine.js";
import { forecastPolicyPath } from "../forecast/forecastStore.js";
import { initBenchPolicy, benchPolicyPath } from "../bench/benchPolicyStore.js";
import { canonPath } from "../canon/canonLoader.js";
import { diagnosticBankPath } from "../diagnostic/bank/bankLoader.js";
import { initCgxPolicy, cgxPolicyPath } from "../cgx/cgxStore.js";
import { initPluginWorkspace } from "../plugins/pluginApi.js";
import { pluginsInstalledLockPath, pluginsRegistriesPath } from "../plugins/pluginStore.js";
import { initMechanicWorkspace } from "../mechanic/mechanicApi.js";
import { mechanicTargetsPath } from "../mechanic/targetsStore.js";
import { initPromptPolicy, promptPolicyPath } from "../prompt/promptPolicyStore.js";
import { assurancePolicyPath, captureAssurancePolicyInitialization } from "../assurance/assurancePolicyStore.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { appendTransparencyEntry, initTransparencyLog } from "../transparency/logChain.js";
import { rebuildTransparencyMerkle } from "../transparency/merkleIndexStore.js";
import { sha256Hex } from "../utils/hash.js";
import { signFileWithAuditor } from "../org/orgSigner.js";
import { enableLanMode } from "../pairing/lanMode.js";
import { enableNotaryTrust } from "../trust/trustConfig.js";
import { checkScopedEgress } from "../residency/checkEgress.js";
import { captureBootstrapSuffixInputs, publishBootstrapProviderSuffix } from "./bootstrapProviderSuffix.js";
import { captureBootstrapNotaryEnablement } from "../trust/notaryEnablementPublication.js";
import { assertOrgPairsCurrent, captureOrgFiles } from "../org/preparedOrgPairs.js";
import { physicalPathWithMissingSuffix } from "../utils/pathSafety.js";

export interface BootstrapOptions {
  workspace: string;
  vaultPassphrase: string | null;
  ownerUsername: string | null;
  ownerPassword: string | null;
  lanMode: boolean;
  bind: string;
  studioPort: number;
  allowedCidrs: string[];
  enableNotary: boolean;
  notaryBaseUrl: string;
  notaryRequiredAttestation: "SOFTWARE" | "HARDWARE";
  notaryAuthSecret: string | null;
}

export interface BootstrapResult {
  workspace: string;
  reportPath: string;
  reportSigPath: string;
  transparencyHash: string;
}

function ensureVault(params: BootstrapOptions): { created: boolean } {
  if (vaultExists(params.workspace)) {
    if (!params.vaultPassphrase) {
      throw new Error("Vault exists but passphrase is required for bootstrap. Set AMC_VAULT_PASSPHRASE_FILE.");
    }
    unlockVault(params.workspace, params.vaultPassphrase);
    return { created: false };
  }

  if (!params.vaultPassphrase) {
    throw new Error("Vault passphrase is required for bootstrap. Set AMC_VAULT_PASSPHRASE_FILE.");
  }

  const monitor = generateKeyPairSync("ed25519");
  const auditor = generateKeyPairSync("ed25519");
  const lease = generateKeyPairSync("ed25519");
  const session = generateKeyPairSync("ed25519");

  createVault({
    workspace: params.workspace,
    passphrase: params.vaultPassphrase,
    monitorPrivateKeyPem: monitor.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    auditorPrivateKeyPem: auditor.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    leasePrivateKeyPem: lease.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    sessionPrivateKeyPem: session.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    monitorPublicKeyPem: monitor.publicKey.export({ format: "pem", type: "spki" }).toString(),
    auditorPublicKeyPem: auditor.publicKey.export({ format: "pem", type: "spki" }).toString(),
    leasePublicKeyPem: lease.publicKey.export({ format: "pem", type: "spki" }).toString(),
    sessionPublicKeyPem: session.publicKey.export({ format: "pem", type: "spki" }).toString()
  });

  unlockVault(params.workspace, params.vaultPassphrase);
  return { created: true };
}

function ensureOwnerUser(params: BootstrapOptions): { created: boolean } {
  const usersPath = usersConfigPath(params.workspace);
  if (pathExists(usersPath)) {
    const verify = verifyUsersConfigSignature(params.workspace);
    if (!verify.valid) {
      throw new Error(`users config signature invalid: ${verify.reason ?? "unknown"}`);
    }
    return { created: false };
  }
  if (!params.ownerUsername || !params.ownerPassword) {
    throw new Error(
      "Bootstrap owner credentials required for first run. Set AMC_BOOTSTRAP_OWNER_USERNAME_FILE and AMC_BOOTSTRAP_OWNER_PASSWORD_FILE."
    );
  }
  initUsersConfig({
    workspace: params.workspace,
    username: params.ownerUsername,
    password: params.ownerPassword
  });
  return { created: true };
}

async function ensureSignedConfigs(workspace: string, originalCold: WorkspaceColdOrgPrerequisites | null, originalAssurance: ReturnType<typeof captureAssurancePolicyInitialization> | null): Promise<{ created: Record<string, boolean>; assurance: ReturnType<typeof captureAssurancePolicyInitialization> }> {
  const created: Record<string, boolean> = {}, cold = originalCold ?? captureWorkspaceColdOrgPrerequisites(workspace), assurance = originalAssurance ?? captureAssurancePolicyInitialization(workspace, { beforePublish: cold.assertCurrent });
  cold.assertCurrent(); assurance.assertCurrent();
  if (!pathExists(actionPolicyPath(workspace))) {
    initActionPolicy(workspace);
    created["action-policy.yaml"] = true;
  }
  if (!pathExists(join(workspace, ".amc", "gateway.yaml"))) {
    initGatewayConfig(workspace);
    created["gateway.yaml"] = true;
  }
  if (!pathExists(toolsConfigPath(workspace))) {
    initToolsConfig(workspace);
    created["tools.yaml"] = true;
  }
  if (!pathExists(budgetsPath(workspace))) {
    await cold.initializeBudgets();
    created["budgets.yaml"] = true;
  }
  if (!pathExists(approvalPolicyPath(workspace))) {
    initApprovalPolicy(workspace);
    created["approval-policy.yaml"] = true;
  }
  if (!pathExists(adaptersConfigPath(workspace))) {
    await cold.initializeAdapters();
    created["adapters.yaml"] = true;
  }
  if (!pathExists(bridgeConfigPath(workspace))) {
    initBridgeConfig(workspace);
    created["bridge.yaml"] = true;
  }
  if (!pathExists(modelTaxonomyPath(workspace))) {
    initModelTaxonomy(workspace);
    created["model-taxonomy.yaml"] = true;
  }
  if (!pathExists(orgConfigPath(workspace))) {
    initOrgConfig(workspace);
    created["org.yaml"] = true;
  }
  if (!pathExists(opsPolicyPath(workspace))) {
    await initOpsPolicyAsync(workspace, { onlyIfMissing: true, beforePublish: cold.assertCurrent });
    created["ops-policy.yaml"] = true;
  }
  if (!pathExists(forecastPolicyPath(workspace))) {
    initForecastPolicy(workspace);
    created["forecast/policy.yaml"] = true;
  }
  if (!pathExists(canonPath(workspace))) {
    await cold.initializeCanon();
    created["canon/canon.yaml"] = true;
  }
  if (!pathExists(diagnosticBankPath(workspace))) {
    await cold.initializeBank();
    created["diagnostic/bank/bank.yaml"] = true;
  }
  if (!pathExists(cgxPolicyPath(workspace))) {
    initCgxPolicy(workspace);
    created["cgx/policy.yaml"] = true;
  }
  if (!pathExists(benchPolicyPath(workspace))) {
    initBenchPolicy(workspace);
    created["bench/policy.yaml"] = true;
  }
  if (!pathExists(pluginsRegistriesPath(workspace)) || !pathExists(pluginsInstalledLockPath(workspace))) {
    initPluginWorkspace({
      workspace
    });
    created["plugins/registries.yaml"] = true;
    created["plugins/installed.lock.json"] = true;
  }
  if (!pathExists(mechanicTargetsPath(workspace))) {
    initMechanicWorkspace({
      workspace,
      scopeType: "WORKSPACE",
      scopeId: "workspace"
    });
    created["mechanic/targets.yaml"] = true;
    created["mechanic/profiles.yaml"] = true;
    created["mechanic/tuning.yaml"] = true;
  }
  if (!pathExists(promptPolicyPath(workspace))) {
    initPromptPolicy(workspace);
    created["prompt/policy.yaml"] = true;
  }
  try {
    if ((await assurance.initialize()).created) created["assurance/policy.yaml"] = true;
    cold.assertCurrent(); assurance.assertCurrent(); return { created, assurance };
  } catch (cause) { throw Object.assign(new Error("bootstrap assurance stage incomplete; earlier cold effects remain", { cause }), { completedAssurancePaths: assurance.publishedPaths() }); }
}

async function fetchNotaryPubkey(endpoint: string, workspace: string, requestOptions: RequestOptions, beforeRequest?: () => void): Promise<{ pubkeyPem: string; fingerprint: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    checkScopedEgress(workspace, "network-tool", endpoint, { dataClasses: null, purpose: null, agentId: "system" });
    beforeRequest?.();
    const req = httpRequest(endpoint, requestOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        const status = res.statusCode ?? 0;
        const body = Buffer.concat(chunks).toString("utf8");
        if (status < 200 || status >= 300) {
          rejectPromise(new Error(`notary /pubkey failed (${status}): ${body}`));
          return;
        }
        try {
          const parsed = JSON.parse(body) as { pubkeyPem?: unknown; fingerprint?: unknown };
          if (typeof parsed.pubkeyPem !== "string" || typeof parsed.fingerprint !== "string") {
            rejectPromise(new Error("notary /pubkey returned invalid payload"));
            return;
          }
          resolvePromise({
            pubkeyPem: parsed.pubkeyPem,
            fingerprint: parsed.fingerprint
          });
        } catch (error) {
          rejectPromise(error);
        }
      });
    });
    req.on("error", rejectPromise);
    req.setTimeout(5000, () => {
      req.destroy(new Error("notary /pubkey timeout"));
    });
    req.end();
  });
}

interface BootstrapNotaryInputs {
  workspace: string; baseUrl: string; requiredAttestationLevel: "SOFTWARE" | "HARDWARE";
  endpoint: string; requestOptions: RequestOptions; secret: string; vaultEnvironment: string | undefined;
}
class BootstrapNotaryPrefetchError extends Error {
  readonly code = "BOOTSTRAP_NOTARY_PREFETCH_INCOMPLETE";
  constructor(readonly progress: Readonly<{ phase: string; directoryAttempted: boolean; directoryReturned: boolean;
    writeAttempted: boolean; writeReturned: boolean; acknowledged: boolean; enablementReturned: boolean }>,
    readonly firstRefusalObserved: boolean, readonly firstRefusal: unknown, cause: unknown) {
    super("bootstrap notary continuation did not complete; earlier native effects may remain", { cause });
    this.name = "BootstrapNotaryPrefetchError";
  }
}
async function publishBootstrapNotaryPrefetch(input: BootstrapNotaryInputs) {
  const params = { ...input, requestOptions: { ...input.requestOptions } }, workspace = params.workspace;
  let refused = false, first: unknown;
  const negative = (check: () => void) => {
    if (refused) throw first;
    try { check(); } catch (cause) { refused = true; first = cause; throw cause; }
  };
  const progress = { phase: "capture", directoryAttempted: false, directoryReturned: false,
    writeAttempted: false, writeReturned: false, acknowledged: false, enablementReturned: false };
  const fail = (cause: unknown): never => {
    if (!progress.directoryAttempted) throw cause;
    throw new BootstrapNotaryPrefetchError(Object.freeze({ ...progress }), refused, first, cause);
  };
  try {
    if (getVaultSecret(workspace, "notary/auth") !== params.secret) throw new Error("required bootstrap notary auth secret did not read back");
    const inputs = captureBootstrapSuffixInputs(workspace, params.vaultEnvironment);
    const path = join(workspace, ".amc", "bootstrap", "notary.pub");
    const physicalPin = physicalPathWithMissingSuffix(path);
    let expected = captureOrgFiles([path]);
    // This fixed lower input callback never calls the staged or completed notary operation.
    const stable = () => negative(() => {
      inputs();
      if (getVaultSecret(workspace, "notary/auth") !== params.secret) throw new Error("original bootstrap notary auth secret changed");
      if (physicalPathWithMissingSuffix(path) !== physicalPin) throw new Error("original bootstrap notary pin route changed");
      assertOrgPairsCurrent(expected); inputs();
    });
    const stage = captureBootstrapNotaryEnablement({ workspace, baseUrl: params.baseUrl,
      requiredAttestationLevel: params.requiredAttestationLevel, requiredSecret: params.secret }, stable);
    const preparing = () => negative(() => { stable(); stage.assertCurrent(); stable(); });
    preparing(); progress.phase = "pubkey-request";
    const notary = await fetchNotaryPubkey(params.endpoint, workspace, params.requestOptions, preparing);
    preparing(); progress.phase = "pin-directory"; progress.directoryAttempted = true;
    ensureDir(dirname(path)); progress.directoryReturned = true;
    preparing(); progress.phase = "pin-write"; progress.writeAttempted = true;
    writeFileAtomic(path, notary.pubkeyPem, 0o644); progress.writeReturned = true;
    progress.phase = "pin-readback";
    const own = captureOrgFiles([path]), member = own.members[0];
    if (member === undefined || member.mode !== 0o644 || member.bytes === null || !member.bytes.equals(Buffer.from(notary.pubkeyPem, "utf8")))
      throw new Error("returned bootstrap notary pin differs from its exact bytes or mode");
    expected = own; progress.acknowledged = true;
    preparing(); progress.phase = "enablement";
    const completed = await stage.publishPin(path); progress.enablementReturned = true;
    const current = () => negative(() => { stable(); completed.assertCurrent(); stable(); });
    current(); progress.phase = "complete";
    return Object.freeze({ assertCurrent() { try { current(); } catch (cause) { fail(cause); } } });
  } catch (cause) { return fail(cause); }
}

class BootstrapColdPrerequisitesIncompleteError extends Error {
  readonly code = "BOOTSTRAP_COLD_PREREQUISITES_INCOMPLETE";
  constructor(readonly completedColdPaths: readonly string[], cause: unknown) {
    super("bootstrap did not complete; published cold prerequisites and any earlier bootstrap effects remain", { cause });
    this.name = "BootstrapColdPrerequisitesIncompleteError";
  }
}
export async function runBootstrap(options: BootstrapOptions): Promise<BootstrapResult> {
  options = { ...options, allowedCidrs: [...options.allowedCidrs] };
  const noSignAtEntry = process.env.AMC_NO_SIGN === "1";
  const previousVaultEnv = process.env.AMC_VAULT_PASSPHRASE;
  let cold: WorkspaceColdOrgPrerequisites | null = null, assurance: ReturnType<typeof captureAssurancePolicyInitialization> | null = null;
  if (options.vaultPassphrase && options.vaultPassphrase.length > 0) {
    process.env.AMC_VAULT_PASSPHRASE = options.vaultPassphrase;
  }
  const activeVaultEnv = process.env.AMC_VAULT_PASSPHRASE;

  try {
    const workspace = resolve(options.workspace);
    const mature = keysetDeclared(workspace);
    if (mature && (!pathExists(opsPolicyPath(workspace)) || !pathExists(adaptersConfigPath(workspace)) || !pathExists(canonPath(workspace)) || !pathExists(diagnosticBankPath(workspace)) || !pathExists(assurancePolicyPath(workspace))))
      ensureVault({ ...options, workspace }); // Preserve the selected passphrase gate before any new cold provider request.
    cold = mature ? captureWorkspaceColdOrgPrerequisites(workspace) : null;
    assurance = mature ? captureAssurancePolicyInitialization(workspace, { beforePublish: cold!.assertCurrent }) : null;
    if (mature && !pathExists(opsPolicyPath(workspace))) await initOpsPolicyAsync(workspace, { onlyIfMissing: true, beforePublish: cold!.assertCurrent });
    cold?.assertCurrent();
    if (cold !== null) await cold.initializeWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    else await initWorkspaceAsync({ workspacePath: workspace, trustBoundaryMode: "isolated" });

    const vault = ensureVault({ ...options, workspace });
    const owner = ensureOwnerUser({ ...options, workspace });
    const signedConfigs = await ensureSignedConfigs(workspace, cold, assurance); assurance = signedConfigs.assurance;
    const createdConfigs = signedConfigs.created;
    if (options.lanMode) {
      enableLanMode({
        workspace,
        bind: options.bind,
        port: options.studioPort,
        allowedCIDRs: options.allowedCidrs,
        requirePairing: true
      });
      createdConfigs["studio/lan.yaml"] = true;
    }
    let notaryCurrent: (() => void) | null = null;
    if (options.enableNotary) {
      if (!options.notaryAuthSecret || options.notaryAuthSecret.trim().length === 0) {
        throw new Error("AMC_ENABLE_NOTARY requires AMC_NOTARY_AUTH_SECRET_FILE (or AMC_NOTARY_AUTH_SECRET).");
      }
      const notarySecret = options.notaryAuthSecret.trim();
      const notaryBaseUrl = options.notaryBaseUrl;
      const requiredAttestationLevel = options.notaryRequiredAttestation;
      const endpoint = new URL("/pubkey", notaryBaseUrl).toString();
      const requestOptions: RequestOptions = { method: "GET" };
      checkScopedEgress(workspace, "network-tool", endpoint, { dataClasses: null, purpose: null, agentId: "system" });
      setVaultSecret(workspace, "notary/auth", notarySecret);
      if (noSignAtEntry) {
        const notary = await fetchNotaryPubkey(endpoint, workspace, requestOptions);
        const pubPath = join(workspace, ".amc", "bootstrap", "notary.pub");
        ensureDir(dirname(pubPath));
        writeFileAtomic(pubPath, notary.pubkeyPem, 0o644);
        await enableNotaryTrust({
          workspace,
          baseUrl: notaryBaseUrl,
          pinPubkeyPath: pubPath,
          requiredAttestationLevel
        });
      } else {
        const completed = await publishBootstrapNotaryPrefetch({ workspace, baseUrl: notaryBaseUrl, requiredAttestationLevel,
          endpoint, requestOptions, secret: notarySecret, vaultEnvironment: activeVaultEnv });
        completed.assertCurrent(); notaryCurrent = completed.assertCurrent;
      }
      createdConfigs["trust.yaml"] = true;
    }
    if (!noSignAtEntry) {
      const notaryCompleted = notaryCurrent;
      notaryCompleted?.();
      const inputs = captureBootstrapSuffixInputs(workspace, activeVaultEnv);
      const assertInputsCurrent = () => { inputs(); notaryCompleted?.(); inputs(); };
      const completed = await publishBootstrapProviderSuffix(workspace, {
        vaultCreated: vault.created, ownerCreated: owner.created, createdConfigs, notaryEnabled: options.enableNotary
      }, assertInputsCurrent);
      completed.assertCurrent();
      return completed.result;
    }
    initTransparencyLog(workspace);
    rebuildTransparencyMerkle(workspace);

    const bootstrapDir = join(workspace, ".amc", "bootstrap");
    ensureDir(bootstrapDir);
    const ts = Date.now();
    const reportPath = join(bootstrapDir, `bootstrap_${ts}.json`);
    const report = {
      v: 1,
      ts,
      workspace,
      vaultCreated: vault.created,
      ownerCreated: owner.created,
      vaultUnlocked: vaultStatus(workspace).unlocked,
      createdConfigs,
      requirements: {
        passphraseFromFileRequired: true,
        ownerCredentialsFromFileRequiredOnFirstRun: true,
        notaryEnabled: options.enableNotary
      }
    };
    writeFileAtomic(reportPath, JSON.stringify(report, null, 2), 0o644);
    const reportSigPath = signFileWithAuditor(workspace, reportPath);

    const reportDigest = sha256Hex(Buffer.from(JSON.stringify(report), "utf8"));
    const entry = appendTransparencyEntry({
      workspace,
      type: "BOOTSTRAP_COMPLETED",
      agentId: "system",
      artifact: {
        kind: "policy",
        id: `bootstrap_${ts}`,
        sha256: reportDigest
      }
    });
    rebuildTransparencyMerkle(workspace);

    return {
      workspace,
      reportPath,
      reportSigPath,
      transparencyHash: entry.hash
    };
  } catch (cause) {
    const stagePaths = cause instanceof Error ? (cause as Error & { completedAssurancePaths?: readonly string[] }).completedAssurancePaths ?? [] : [];
    const completed = [...(cold?.completedPaths ?? []), ...(assurance?.publishedPaths() ?? stagePaths)];
    if (completed.length > 0) throw new BootstrapColdPrerequisitesIncompleteError(completed, cause); throw cause;
  } finally {
    if (typeof previousVaultEnv === "string") {
      process.env.AMC_VAULT_PASSPHRASE = previousVaultEnv;
    } else {
      delete process.env.AMC_VAULT_PASSPHRASE;
    }
  }
}
