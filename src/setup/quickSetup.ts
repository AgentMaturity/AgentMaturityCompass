import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import inquirer from "inquirer";
import { presetGatewayConfigForProvider, saveGatewayConfig, signGatewayConfig, type GatewayConfig } from "../gateway/config.js";
import { pathExists } from "../utils/fs.js";
import { initWorkspace } from "../workspace.js";
import { detectFrameworksForOnboarding as detectFrameworks, detectAgentInstructionSources, type FrameworkDetection } from "./setupWizard.js";
import {
  createOnboardingState,
  saveOnboardingState,
  setOnboardingStep
} from "./onboardingState.js";

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

  const instructionSources = detectAgentInstructionSources(workspace);
  const detectedKeyNames = PROVIDERS.filter((provider) => detectedProviderIds.has(provider.id)).map((provider) => provider.displayName);

  logger.log("Setting up Agent Maturity Compass. Everything runs locally and stays on your machine.");
  logger.log("");
  logger.log("What AMC found in this folder:");
  logger.log(`  AI provider keys:       ${detectedKeyNames.length > 0 ? detectedKeyNames.join(", ") : "none yet — your first score needs none"}`);
  logger.log(`  Agent frameworks:       ${frameworks.length > 0 ? frameworks.map((framework) => framework.framework).join(", ") : "none detected"}`);
  logger.log(
    `  Instructions & skills:  ${
      instructionSources.length > 0
        ? `${instructionSources.map((source) => source.tool).join(", ")}  (AMC reads these)`
        : "none yet — AMC can generate AGENTS.md guardrails for you"
    }`
  );
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
  signGatewayConfig(workspace);
  const baseUrl = renderBaseUrl(config);

  let onboarding = createOnboardingState({
    workspace,
    agentId: "default",
    mode: "cli",
    status: "in_progress",
    provider: selectedProvider.displayName,
    detectedFrameworks: frameworks.map((framework) => framework.framework)
  });
  onboarding = setOnboardingStep(onboarding, "detect", "complete", `${frameworks.length} framework(s), ${detectedProviderIds.size} provider key(s), ${instructionSources.length} instruction source(s).`);
  onboarding = setOnboardingStep(onboarding, "workspace", "complete", bootstrapped ? "Created .amc workspace." : "Existing workspace reused.");
  onboarding = setOnboardingStep(onboarding, "provider", "complete", `${selectedProvider.displayName} gateway preset saved.`);
  onboarding = setOnboardingStep(onboarding, "score", "pending", "Run `amc` to generate the full score.");
  onboarding = setOnboardingStep(onboarding, "studio", "pending", "Run `amc up` to open Studio.");
  saveOnboardingState(workspace, onboarding);

  logger.log(`Saved a ${selectedProvider.displayName} gateway preset for optional live model routing (${configPath}).`);
  logger.log("");
  logger.log("You're ready. Do this next:");
  logger.log("");
  logger.log("  amc             ->  run your full agent score (no key or account needed)");
  logger.log("  amc up          ->  open the Studio dashboard in your browser (buttons, no terminal)");
  logger.log("  amc guide --go  ->  auto-fix the top gaps and write guardrails into your agent files");
  logger.log("");
  logger.log("Your first score needs no AI key and no account. A key is only for routing or");
  logger.log("watching live model calls. To enable that, set your own key and re-run `amc setup`:");
  logger.log(`  export ${selectedProvider.apiKeyEnv}=<your-key>`);
  logger.log(`  export ${selectedProvider.baseUrlEnv}=${baseUrl}`);
  if (selectedProvider.id === "gemini") {
    logger.log("  export GEMINI_API_KEY=$GOOGLE_AI_KEY");
  }

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
