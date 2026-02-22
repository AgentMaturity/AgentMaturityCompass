import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import inquirer from "inquirer";
import { loadStudioRuntimeConfig } from "../config/loadConfig.js";
import { runBootstrap } from "../bootstrap/bootstrap.js";
import { bootstrapHost } from "../workspaces/hostBootstrap.js";
import { initHostDb } from "../workspaces/hostDb.js";
import { initAdaptersConfig, setAgentAdapterProfile } from "../adapters/adapterConfigStore.js";
import { initGatewayConfig, presetGatewayConfigForProvider } from "../gateway/config.js";
import { verifyTrustConfigSignature } from "../trust/trustConfig.js";
import { verifyOpsPolicySignature } from "../ops/policy.js";
import { verifyPluginWorkspace } from "../plugins/pluginApi.js";
import { runSetupWizard, type SetupWizardResult } from "./setupWizard.js";

function randomPassphrase(): string {
  return `amc-${randomBytes(12).toString("hex")}`;
}

export interface SetupResult {
  mode: "single" | "host";
  workspaceDir: string;
  hostDir: string | null;
  reportPath: string;
  consoleUrl: string;
  gatewayUrl: string;
  qrHint: string;
  sanity: {
    trustConfigValid: boolean;
    opsPolicyValid: boolean;
    pluginIntegrityValid: boolean;
  };
  onboarding: SetupWizardResult;
  nextSteps: string[];
}

export async function runSetupCli(params: {
  cwd: string;
  nonInteractive: boolean;
  demo: boolean;
}): Promise<SetupResult> {
  const workspace = resolve(params.cwd);
  const runtime = loadStudioRuntimeConfig(process.env, {
    workspaceDir: workspace
  });
  const hostMode = Boolean(runtime.hostDir);
  const host = hostMode ? runtime.hostBind : runtime.bind;
  const port = hostMode ? runtime.hostPort : runtime.studioPort;

  const bootstrapSecrets = {
    username: runtime.bootstrapOwnerUsername ?? runtime.bootstrapHostAdminUsername ?? "owner",
    password: runtime.bootstrapOwnerPassword ?? runtime.bootstrapHostAdminPassword ?? randomPassphrase(),
    passphrase: runtime.vaultPassphrase ?? randomPassphrase()
  };

  if (!params.nonInteractive) {
    const answers = await inquirer.prompt<{
      username: string;
      password: string;
      passphrase: string;
    }>([
      {
        type: "input",
        name: "username",
        message: hostMode ? "Host admin username:" : "Owner username:",
        default: bootstrapSecrets.username
      },
      {
        type: "password",
        name: "password",
        message: hostMode ? "Host admin password:" : "Owner password:",
        mask: "*",
        default: bootstrapSecrets.password
      },
      {
        type: "password",
        name: "passphrase",
        message: "Vault passphrase:",
        mask: "*",
        default: bootstrapSecrets.passphrase
      }
    ]);
    bootstrapSecrets.username = answers.username.trim() || bootstrapSecrets.username;
    bootstrapSecrets.password = answers.password.trim() || bootstrapSecrets.password;
    bootstrapSecrets.passphrase = answers.passphrase.trim() || bootstrapSecrets.passphrase;
  }

  let workspaceDir = workspace;
  let reportPath = "";
  if (hostMode && runtime.hostDir) {
    initHostDb(runtime.hostDir);
    const boot = await bootstrapHost({
      hostDir: runtime.hostDir,
      workspaceId: runtime.bootstrapDefaultWorkspaceId ?? runtime.defaultWorkspaceId,
      workspaceName: runtime.bootstrapDefaultWorkspaceName ?? "Default Workspace",
      adminUsername: bootstrapSecrets.username,
      adminPassword: bootstrapSecrets.password,
      vaultPassphrase: bootstrapSecrets.passphrase,
      lanMode: runtime.lanMode,
      bind: runtime.hostBind,
      studioPort: runtime.hostPort,
      allowedCidrs: runtime.allowedCidrs,
      enableNotary: runtime.enableNotary,
      notaryBaseUrl: runtime.notaryBaseUrl,
      notaryRequiredAttestation: runtime.notaryRequiredAttestation,
      notaryAuthSecret: runtime.notaryAuthSecret
    });
    workspaceDir = boot.workspaceDir;
    reportPath = boot.reportPath;
  } else {
    const boot = await runBootstrap({
      workspace,
      vaultPassphrase: bootstrapSecrets.passphrase,
      ownerUsername: bootstrapSecrets.username,
      ownerPassword: bootstrapSecrets.password,
      lanMode: runtime.lanMode,
      bind: runtime.bind,
      studioPort: runtime.studioPort,
      allowedCidrs: runtime.allowedCidrs,
      enableNotary: runtime.enableNotary,
      notaryBaseUrl: runtime.notaryBaseUrl,
      notaryRequiredAttestation: runtime.notaryRequiredAttestation,
      notaryAuthSecret: runtime.notaryAuthSecret
    });
    workspaceDir = boot.workspace;
    reportPath = boot.reportPath;
  }

  if (params.demo) {
    initAdaptersConfig(workspaceDir);
    setAgentAdapterProfile(workspaceDir, "default", {
      preferredAdapter: "generic-cli",
      preferredProviderRoute: "/openai",
      preferredModel: "gpt-test",
      runMode: "SUPERVISE",
      leaseScopes: ["gateway:llm", "toolhub:intent", "toolhub:execute"],
      routeAllowlist: ["/openai", "/local"],
      modelAllowlist: ["gpt-*", "*"]
    });
    initGatewayConfig(workspaceDir, presetGatewayConfigForProvider("Local OpenAI-compatible (vLLM/LM Studio/etc)"));
  }

  const trustSig = verifyTrustConfigSignature(workspaceDir);
  const opsSig = verifyOpsPolicySignature(workspaceDir);
  const plugin = verifyPluginWorkspace({ workspace: workspaceDir });
  const onboarding = await runSetupWizard({
    workspace: workspaceDir,
    interactive: !params.nonInteractive
  });

  const consolePath = hostMode ? "/host/console" : "/console";
  const consoleUrl = `http://${host}:${port}${consolePath}`;
  const gatewayUrl = hostMode ? `http://${host}:${runtime.gatewayPort}` : `http://${host}:${runtime.gatewayPort}`;
  const qrHint = `[PAIRING] ${consoleUrl}`;

  return {
    mode: hostMode ? "host" : "single",
    workspaceDir,
    hostDir: runtime.hostDir,
    reportPath,
    consoleUrl,
    gatewayUrl,
    qrHint,
    sanity: {
      trustConfigValid: trustSig.valid,
      opsPolicyValid: opsSig.valid,
      pluginIntegrityValid: plugin.ok
    },
    onboarding,
    nextSteps: [
      "amc up",
      hostMode ? `Open ${consoleUrl}` : `Open ${consoleUrl}`,
      "amc doctor --json",
      "amc e2e smoke --mode local --json"
    ]
  };
}
