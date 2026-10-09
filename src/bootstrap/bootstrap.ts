import { generateKeyPairSync } from "node:crypto";
import { request as httpRequest, type RequestOptions } from "node:http";
import { dirname, join, resolve } from "node:path";
import { initWorkspace } from "../workspace.js";
import { createVault, setVaultSecret, unlockVault, vaultExists, vaultStatus } from "../vault/vault.js";
import { initUsersConfig, usersConfigPath, verifyUsersConfigSignature } from "../auth/authApi.js";
import { actionPolicyPath, initActionPolicy } from "../governor/actionPolicyEngine.js";
import { initToolsConfig, toolsConfigPath } from "../toolhub/toolhubValidators.js";
import { budgetsPath, initBudgets } from "../budgets/budgets.js";
import { approvalPolicyPath, initApprovalPolicy } from "../approvals/approvalPolicyEngine.js";
import { adaptersConfigPath, initAdaptersConfig } from "../adapters/adapterConfigStore.js";
import { bridgeConfigPath, initBridgeConfig } from "../bridge/bridgeConfigStore.js";
import { initModelTaxonomy, modelTaxonomyPath } from "../bridge/modelTaxonomy.js";
import { initOrgConfig, orgConfigPath } from "../org/orgStore.js";
import { initGatewayConfig } from "../gateway/config.js";
import { initOpsPolicy, opsPolicyPath } from "../ops/policy.js";
import { initForecastPolicy } from "../forecast/forecastEngine.js";
import { forecastPolicyPath } from "../forecast/forecastStore.js";
import { initBenchPolicy, benchPolicyPath } from "../bench/benchPolicyStore.js";
import { initCanon, canonPath } from "../canon/canonLoader.js";
import { initDiagnosticBank, diagnosticBankPath } from "../diagnostic/bank/bankLoader.js";
import { initCgxPolicy, cgxPolicyPath } from "../cgx/cgxStore.js";
import { initPluginWorkspace } from "../plugins/pluginApi.js";
import { pluginsInstalledLockPath, pluginsRegistriesPath } from "../plugins/pluginStore.js";
import { initMechanicWorkspace } from "../mechanic/mechanicApi.js";
import { mechanicTargetsPath } from "../mechanic/targetsStore.js";
import { initPromptPolicy, promptPolicyPath } from "../prompt/promptPolicyStore.js";
import { assurancePolicyPath, initAssurancePolicy } from "../assurance/assurancePolicyStore.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { appendTransparencyEntry, initTransparencyLog } from "../transparency/logChain.js";
import { rebuildTransparencyMerkle } from "../transparency/merkleIndexStore.js";
import { sha256Hex } from "../utils/hash.js";
import { signFileWithAuditor } from "../org/orgSigner.js";
import { enableLanMode } from "../pairing/lanMode.js";
import { enableNotaryTrust } from "../trust/trustConfig.js";
import { checkScopedEgress } from "../residency/checkEgress.js";

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

function ensureSignedConfigs(workspace: string): Record<string, boolean> {
  const created: Record<string, boolean> = {};
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
    initBudgets(workspace, "default");
    created["budgets.yaml"] = true;
  }
  if (!pathExists(approvalPolicyPath(workspace))) {
    initApprovalPolicy(workspace);
    created["approval-policy.yaml"] = true;
  }
  if (!pathExists(adaptersConfigPath(workspace))) {
    initAdaptersConfig(workspace);
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
    initOpsPolicy(workspace);
    created["ops-policy.yaml"] = true;
  }
  if (!pathExists(forecastPolicyPath(workspace))) {
    initForecastPolicy(workspace);
    created["forecast/policy.yaml"] = true;
  }
  if (!pathExists(canonPath(workspace))) {
    initCanon(workspace);
    created["canon/canon.yaml"] = true;
  }
  if (!pathExists(diagnosticBankPath(workspace))) {
    initDiagnosticBank(workspace);
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
  if (!pathExists(assurancePolicyPath(workspace))) {
    initAssurancePolicy(workspace);
    created["assurance/policy.yaml"] = true;
  }
  return created;
}

async function fetchNotaryPubkey(endpoint: string, workspace: string, requestOptions: RequestOptions): Promise<{ pubkeyPem: string; fingerprint: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    checkScopedEgress(workspace, "network-tool", endpoint, { dataClasses: null, purpose: null, agentId: "system" });
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

export async function runBootstrap(options: BootstrapOptions): Promise<BootstrapResult> {
  const previousVaultEnv = process.env.AMC_VAULT_PASSPHRASE;
  if (options.vaultPassphrase && options.vaultPassphrase.length > 0) {
    process.env.AMC_VAULT_PASSPHRASE = options.vaultPassphrase;
  }

  try {
    const workspace = resolve(options.workspace);
    initWorkspace({
      workspacePath: workspace,
      trustBoundaryMode: "isolated"
    });

    const vault = ensureVault({ ...options, workspace });
    const owner = ensureOwnerUser({ ...options, workspace });
    const createdConfigs = ensureSignedConfigs(workspace);
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
      createdConfigs["trust.yaml"] = true;
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
  } finally {
    if (typeof previousVaultEnv === "string") {
      process.env.AMC_VAULT_PASSPHRASE = previousVaultEnv;
    } else {
      delete process.env.AMC_VAULT_PASSPHRASE;
    }
  }
}
