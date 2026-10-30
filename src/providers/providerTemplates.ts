import { z } from "zod";

export const authStrategySchema = z.enum(["bearer_env", "header_env", "query_env", "none"]);
export type AuthStrategy = z.infer<typeof authStrategySchema>;

export interface ProviderTemplate {
  id: string;
  displayName: string;
  defaultBaseUrl: string;
  routePrefix: string;
  authStrategies: AuthStrategy[];
  defaultAuthStrategy: AuthStrategy;
  defaultAuthEnv: string;
  defaultHeader?: string;
  defaultQueryParam?: string;
  openaiCompatible: boolean;
  hints: {
    requestModelPaths: string[];
    responseModelPaths: string[];
    usagePaths: string[];
  };
}

const templates: ProviderTemplate[] = [
  {
    id: "openai",
    displayName: "OpenAI",
    defaultBaseUrl: "https://api.openai.com",
    routePrefix: "/openai",
    authStrategies: ["bearer_env"],
    defaultAuthStrategy: "bearer_env",
    defaultAuthEnv: "OPENAI_API_KEY",
    openaiCompatible: true,
    hints: {
      requestModelPaths: ["$.model"],
      responseModelPaths: ["$.model"],
      usagePaths: ["$.usage"]
    }
  },
  {
    id: "azure_openai",
    displayName: "Azure OpenAI",
    defaultBaseUrl: "",
    routePrefix: "/azure-openai",
    authStrategies: ["header_env", "bearer_env"],
    defaultAuthStrategy: "header_env",
    defaultAuthEnv: "AZURE_OPENAI_API_KEY",
    defaultHeader: "api-key",
    openaiCompatible: true,
    hints: {
      requestModelPaths: ["$.model"],
      responseModelPaths: ["$.model"],
      usagePaths: ["$.usage"]
    }
  },
  {
    id: "xai_grok",
    displayName: "xAI Grok",
    defaultBaseUrl: "",
    routePrefix: "/grok",
    authStrategies: ["bearer_env"],
    defaultAuthStrategy: "bearer_env",
    defaultAuthEnv: "XAI_API_KEY",
    openaiCompatible: true,
    hints: {
      requestModelPaths: ["$.model"],
      responseModelPaths: ["$.model"],
      usagePaths: ["$.usage"]
    }
  },
  {
    id: "anthropic",
    displayName: "Anthropic Claude",
    defaultBaseUrl: "https://api.anthropic.com",
    routePrefix: "/anthropic",
    authStrategies: ["header_env", "bearer_env"],
    defaultAuthStrategy: "header_env",
    defaultAuthEnv: "ANTHROPIC_API_KEY",
    defaultHeader: "x-api-key",
    openaiCompatible: false,
    hints: {
      requestModelPaths: ["$.model"],
      responseModelPaths: ["$.model"],
      usagePaths: ["$.usage", "$.usage.input_tokens", "$.usage.output_tokens"]
    }
  },
  {
    id: "gemini",
    displayName: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    routePrefix: "/gemini",
    authStrategies: ["query_env", "header_env"],
    defaultAuthStrategy: "query_env",
    defaultAuthEnv: "GEMINI_API_KEY",
    defaultQueryParam: "key",
    openaiCompatible: false,
    hints: {
      requestModelPaths: ["$.model", "$.contents[0].role"],
      responseModelPaths: ["$.modelVersion"],
      usagePaths: ["$.usageMetadata"]
    }
  },
  {
    id: "bedrock",
    displayName: "AWS Bedrock (user upstream)",
    defaultBaseUrl: "",
    routePrefix: "/bedrock",
    authStrategies: ["header_env", "bearer_env", "none"],
    defaultAuthStrategy: "header_env",
    defaultAuthEnv: "BEDROCK_API_KEY",
    defaultHeader: "authorization",
    openaiCompatible: false,
    hints: {
      requestModelPaths: ["$.modelId", "$.model"],
      responseModelPaths: ["$.modelId", "$.model"],
      usagePaths: ["$.usage"]
    }
  },
  {
    id: "vertex_ai",
    displayName: "Google Vertex AI (user upstream)",
    defaultBaseUrl: "",
    routePrefix: "/vertex",
    authStrategies: ["bearer_env", "header_env", "none"],
    defaultAuthStrategy: "bearer_env",
    defaultAuthEnv: "VERTEX_API_KEY",
    openaiCompatible: false,
    hints: {
      requestModelPaths: ["$.model", "$.endpoint"],
      responseModelPaths: ["$.model"],
      usagePaths: ["$.usageMetadata", "$.usage"]
    }
  },
  {
    id: "mistral",
    displayName: "Mistral",
    defaultBaseUrl: "",
    routePrefix: "/mistral",
    authStrategies: ["bearer_env"],
    defaultAuthStrategy: "bearer_env",
    defaultAuthEnv: "MISTRAL_API_KEY",
    openaiCompatible: true,
    hints: {
      requestModelPaths: ["$.model"],
      responseModelPaths: ["$.model"],
      usagePaths: ["$.usage"]
    }
  },
  {
    id: "cohere",
    displayName: "Cohere",
    defaultBaseUrl: "",
    routePrefix: "/cohere",
    authStrategies: ["bearer_env", "header_env"],
    defaultAuthStrategy: "bearer_env",
    defaultAuthEnv: "COHERE_API_KEY",
    openaiCompatible: false,
    hints: {
      requestModelPaths: ["$.model"],
      responseModelPaths: ["$.meta.api_version.version"],
      usagePaths: ["$.meta.billed_units"]
    }
  },
  {
    id: "groq",
    displayName: "Groq",
    defaultBaseUrl: "",
    routePrefix: "/groq",
    authStrategies: ["bearer_env"],
    defaultAuthStrategy: "bearer_env",
    defaultAuthEnv: "GROQ_API_KEY",
    openaiCompatible: true,
    hints: {
      requestModelPaths: ["$.model"],
      responseModelPaths: ["$.model"],
      usagePaths: ["$.usage"]
    }
  },
  {
    id: "openrouter",
    displayName: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai",
    routePrefix: "/openrouter",
    authStrategies: ["bearer_env"],
    defaultAuthStrategy: "bearer_env",
    defaultAuthEnv: "OPENROUTER_API_KEY",
    openaiCompatible: true,
    hints: {
      requestModelPaths: ["$.model"],
      responseModelPaths: ["$.model"],
      usagePaths: ["$.usage"]
    }
  },
  {
    id: "together",
    displayName: "Together AI",
    defaultBaseUrl: "",
    routePrefix: "/together",
    authStrategies: ["bearer_env"],
    defaultAuthStrategy: "bearer_env",
    defaultAuthEnv: "TOGETHER_API_KEY",
    openaiCompatible: true,
    hints: {
      requestModelPaths: ["$.model"],
      responseModelPaths: ["$.model"],
      usagePaths: ["$.usage"]
    }
  },
  {
    id: "fireworks",
    displayName: "Fireworks",
    defaultBaseUrl: "",
    routePrefix: "/fireworks",
    authStrategies: ["bearer_env"],
    defaultAuthStrategy: "bearer_env",
    defaultAuthEnv: "FIREWORKS_API_KEY",
    openaiCompatible: true,
    hints: {
      requestModelPaths: ["$.model"],
      responseModelPaths: ["$.model"],
      usagePaths: ["$.usage"]
    }
  },
  {
    id: "perplexity",
    displayName: "Perplexity",
    defaultBaseUrl: "",
    routePrefix: "/perplexity",
    authStrategies: ["bearer_env"],
    defaultAuthStrategy: "bearer_env",
    defaultAuthEnv: "PERPLEXITY_API_KEY",
    openaiCompatible: true,
    hints: {
      requestModelPaths: ["$.model"],
      responseModelPaths: ["$.model"],
      usagePaths: ["$.usage"]
    }
  },
  {
    id: "deepseek",
    displayName: "DeepSeek (OpenAI-compatible)",
    defaultBaseUrl: "https://api.deepseek.com",
    routePrefix: "/deepseek",
    authStrategies: ["bearer_env", "none"],
    defaultAuthStrategy: "bearer_env",
    defaultAuthEnv: "DEEPSEEK_API_KEY",
    openaiCompatible: true,
    hints: {
      requestModelPaths: ["$.model"],
      responseModelPaths: ["$.model"],
      usagePaths: ["$.usage"]
    }
  },
  {
    id: "qwen",
    displayName: "Qwen (OpenAI-compatible)",
    defaultBaseUrl: "",
    routePrefix: "/qwen",
    authStrategies: ["bearer_env", "none"],
    defaultAuthStrategy: "bearer_env",
    defaultAuthEnv: "QWEN_API_KEY",
    openaiCompatible: true,
    hints: {
      requestModelPaths: ["$.model"],
      responseModelPaths: ["$.model"],
      usagePaths: ["$.usage"]
    }
  },
  {
    id: "local_openai",
    displayName: "Local OpenAI-compatible (vLLM/llama.cpp/LM Studio/Ollama)",
    defaultBaseUrl: "http://127.0.0.1:8000",
    routePrefix: "/local",
    authStrategies: ["none", "bearer_env"],
    defaultAuthStrategy: "none",
    defaultAuthEnv: "LOCAL_OPENAI_API_KEY",
    openaiCompatible: true,
    hints: {
      requestModelPaths: ["$.model"],
      responseModelPaths: ["$.model"],
      usagePaths: ["$.usage"]
    }
  },
  {
    id: "custom",
    displayName: "Other / Custom upstream",
    defaultBaseUrl: "",
    routePrefix: "/custom",
    authStrategies: ["bearer_env", "header_env", "query_env", "none"],
    defaultAuthStrategy: "none",
    defaultAuthEnv: "CUSTOM_API_KEY",
    openaiCompatible: false,
    hints: {
      requestModelPaths: ["$.model"],
      responseModelPaths: ["$.model"],
      usagePaths: ["$.usage"]
    }
  }
];

export function listProviderTemplates(): ProviderTemplate[] {
  return templates.map((template) => ({ ...template, hints: { ...template.hints } }));
}

export function getProviderTemplateById(id: string): ProviderTemplate {
  const found = templates.find((template) => template.id === id);
  if (!found) {
    throw new Error(`Unknown provider template: ${id}`);
  }
  return { ...found, hints: { ...found.hints } };
}

export function providerTemplateChoices(): Array<{ name: string; value: string }> {
  return templates.map((template) => ({
    name: template.displayName,
    value: template.id
  }));
}

