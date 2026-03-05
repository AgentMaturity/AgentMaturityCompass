import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import inquirer from "inquirer";
import { presetGatewayConfigForProvider, saveGatewayConfig, type GatewayConfig } from "../gateway/config.js";
import { pathExists } from "../utils/fs.js";
import { initWorkspace } from "../workspace.js";
import { detectFrameworksForOnboarding as detectFrameworks, type FrameworkDetection } from "./setupWizard.js";

type ProviderId = "openai" | "anthropic" | "gemini" | "groq" | "mistral" | "together" | "openrouter";
type ProviderPresetName = "OpenAI" | "Anthropic" | "Gemini" | "Groq" | "Mistral" | "Together AI" | "OpenRouter";

interface ProviderOption {
  id: ProviderId;
  presetName: ProviderPresetName;
  displayName: string;
  apiKeyEnv: string;
  baseUrlEnv: string;
  aliases: string[];
}

const PROVIDERS: ProviderOption[] = [
  {
    id: "openai",
    presetName: "OpenAI",
    displayName: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    baseUrlEnv: "OPENAI_BASE_URL",
    aliases: ["openai"]
  },
  {
    id: "anthropic",
    presetName: "Anthropic",
    displayName: "Anthropic",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    baseUrlEnv: "ANTHROPIC_BASE_URL",
    aliases: ["anthropic", "claude"]
  },
  {
    id: "gemini",
    presetName: "Gemini",
    displayName: "Gemini",
    apiKeyEnv: "GOOGLE_AI_KEY",
    baseUrlEnv: "GEMINI_BASE_URL",
    aliases: ["gemini", "google", "google-ai"]
  },
  {
    id: "groq",
    presetName: "Groq",
    displayName: "Groq",
    apiKeyEnv: "GROQ_API_KEY",
    baseUrlEnv: "GROQ_BASE_URL",
    aliases: ["groq"]
  },
  {
    id: "mistral",
    presetName: "Mistral",
    displayName: "Mistral",
    apiKeyEnv: "MISTRAL_API_KEY",
    baseUrlEnv: "MISTRAL_BASE_URL",
    aliases: ["mistral"]
  },
  {
    id: "together",
    presetName: "Together AI",
    displayName: "Together AI",
    apiKeyEnv: "TOGETHER_API_KEY",
    baseUrlEnv: "TOGETHER_BASE_URL",
    aliases: ["together", "togetherai"]
  },
  {
    id: "openrouter",
    presetName: "OpenRouter",
    displayName: "OpenRouter",
    apiKeyEnv: "OPENROUTER_API_KEY",
    baseUrlEnv: "OPENROUTER_BASE_URL",
    aliases: ["openrouter"]
  }
];

export interface QuickSetupOptions {
  cwd: string;
  provider?: string;
  auto?: boolean;
  logger?: Pick<Console, "log">;
}

export interface QuickSetupResult {
  workspace: string;
  provider: ProviderPresetName;
  gatewayConfigPath: string;
  baseUrlEnv: string;
  baseUrl: string;
  detectedApiKeys: string[];
  detectedFrameworks: FrameworkDetection[];
  bootstrapped: boolean;
}

function normalizeProviderId(input: string): string {
  return input.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function resolveProviderFromInput(provider: string | undefined): ProviderOption | null {
  if (!provider) {
    return null;
  }
  const normalized = normalizeProviderId(provider);
  return (
    PROVIDERS.find((row) => row.aliases.some((alias) => normalizeProviderId(alias) === normalized)) ??
    null
  );
}

function detectedProviderIdsFromEnv(env: NodeJS.ProcessEnv): Set<ProviderId> {
  const detected = new Set<ProviderId>();
  for (const provider of PROVIDERS) {
    if (typeof env[provider.apiKeyEnv] === "string" && env[provider.apiKeyEnv]!.trim().length > 0) {
      detected.add(provider.id);
    }
  }
  return detected;
}

async function selectProvider(params: {
  provider?: string;
  auto: boolean;
  detectedProviderIds: Set<ProviderId>;
}): Promise<ProviderOption> {
  const fromInput = resolveProviderFromInput(params.provider);
  if (fromInput) {
    return fromInput;
  }

  if (params.provider) {
    throw new Error(`Unsupported provider '${params.provider}'. Use --provider openai|anthropic|gemini|groq|mistral|together|openrouter.`);
  }

  if (params.auto || !process.stdin.isTTY) {
    const firstDetected = PROVIDERS.find((row) => params.detectedProviderIds.has(row.id));
    return firstDetected ?? PROVIDERS[0]!;
  }

  const answers = await inquirer.prompt<{ providerId: ProviderId }>([
    {
      type: "list",
      name: "providerId",
      message: "Which provider do you want to configure?",
      choices: PROVIDERS.map((row) => ({
        name: params.detectedProviderIds.has(row.id) ? `${row.displayName} (detected)` : row.displayName,
        value: row.id
      })),
      default: (PROVIDERS.find((row) => params.detectedProviderIds.has(row.id)) ?? PROVIDERS[0])?.id
    }
  ]);

  return PROVIDERS.find((row) => row.id === answers.providerId) ?? PROVIDERS[0]!;
}

function patchGeminiAuthEnv(config: GatewayConfig): GatewayConfig {
  const cloned = JSON.parse(JSON.stringify(config)) as GatewayConfig;
  const route = cloned.routes[0];
  if (!route) {
    return cloned;
  }
  const upstream = cloned.upstreams[route.upstream];
  if (!upstream || upstream.auth.type === "none") {
    return cloned;
  }
  upstream.auth = { ...upstream.auth, env: "GOOGLE_AI_KEY" };
  return cloned;
}

function renderBaseUrl(config: GatewayConfig): string {
  const route = config.routes[0];
  const prefix = route?.prefix ?? "/openai";
  const host = config.listen.host === "0.0.0.0" ? "127.0.0.1" : config.listen.host;
  return `http://${host}:${config.listen.port}${prefix}`;
}

export async function runQuickSetup(options: QuickSetupOptions): Promise<QuickSetupResult> {
  const logger = options.logger ?? console;
  const workspace = resolve(options.cwd);
  const detectedProviderIds = detectedProviderIdsFromEnv(process.env);
  const frameworks = detectFrameworks(workspace);

  logger.log("Detecting your environment...");
  logger.log("");
  logger.log("Found API keys:");
  for (const provider of PROVIDERS) {
    const detected = detectedProviderIds.has(provider.id);
    logger.log(`  ${detected ? "[x]" : "[ ]"} ${provider.apiKeyEnv} -> ${provider.displayName}`);
  }
  logger.log("");
  logger.log("Found frameworks:");
  if (frameworks.length === 0) {
    logger.log("  [ ] none");
  } else {
    for (const framework of frameworks) {
      logger.log(`  [x] ${framework.framework}`);
    }
  }
  logger.log("");

  const selectedProvider = await selectProvider({
    provider: options.provider,
    auto: options.auto ?? false,
    detectedProviderIds
  });

  let bootstrapped = false;
  if (!pathExists(join(workspace, ".amc"))) {
    // Auto-generate vault passphrase if not set — quick setup should "just work"
    if (!process.env.AMC_VAULT_PASSPHRASE) {
      process.env.AMC_VAULT_PASSPHRASE = `amc-${randomBytes(16).toString("hex")}`;
    }
    initWorkspace({ workspacePath: workspace });
    bootstrapped = true;
    logger.log("Initialized AMC workspace (.amc/)");
  } else {
    logger.log("Using existing AMC workspace (.amc/)");
  }

  let config = presetGatewayConfigForProvider(selectedProvider.presetName);
  if (selectedProvider.id === "gemini") {
    config = patchGeminiAuthEnv(config);
  }
  const configPath = saveGatewayConfig(workspace, config);
  const baseUrl = renderBaseUrl(config);

  logger.log(`Configured gateway for ${selectedProvider.displayName}`);
  logger.log(`Gateway config: ${configPath}`);
  logger.log("");
  logger.log("Set this environment variable for your agent:");
  logger.log(`  export ${selectedProvider.baseUrlEnv}=${baseUrl}`);
  if (selectedProvider.id === "gemini") {
    logger.log("  export GEMINI_API_KEY=$GOOGLE_AI_KEY");
  }
  logger.log("");
  logger.log("Next command:");
  logger.log("  amc quickscore");

  const detectedApiKeys = PROVIDERS
    .filter((provider) => detectedProviderIds.has(provider.id))
    .map((provider) => provider.apiKeyEnv);

  return {
    workspace,
    provider: selectedProvider.presetName,
    gatewayConfigPath: configPath,
    baseUrlEnv: selectedProvider.baseUrlEnv,
    baseUrl,
    detectedApiKeys,
    detectedFrameworks: frameworks,
    bootstrapped
  };
}
