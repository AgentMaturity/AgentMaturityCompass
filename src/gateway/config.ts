import { readFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

const authSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bearer_env"), env: z.string().min(1) }),
  z.object({ type: z.literal("header_env"), header: z.string().min(1), env: z.string().min(1) }),
  z.object({ type: z.literal("query_env"), param: z.string().min(1), env: z.string().min(1) }),
  z.object({ type: z.literal("none") })
]);

const upstreamSchema = z.object({
  baseUrl: z.string().min(1),
  auth: authSchema,
  allowLocalhost: z.boolean().optional(),
  providerId: z.string().optional()
});

const routeSchema = z.object({
  prefix: z.string().startsWith("/"),
  upstream: z.string().min(1),
  stripPrefix: z.boolean().default(true),
  openaiCompatible: z.boolean().default(false),
  agentId: z.string().optional()
});

const proxySchema = z.object({
  enabled: z.boolean().default(false),
  port: z.number().int().min(1).max(65535).default(3211),
  allowlistHosts: z.array(z.string()).default([]),
  denyByDefault: z.boolean().default(true)
});

export const gatewayConfigSchema = z.object({
  listen: z.object({
    host: z.string().min(1).default("127.0.0.1"),
    port: z.number().int().min(0).max(65535).default(3210)
  }),
  redaction: z.object({
    headerKeysDenylist: z.array(z.string()).default(["authorization", "x-api-key", "api-key", "x-openai-key"]),
    jsonPathsDenylist: z.array(z.string()).default(["$.api_key", "$.key"]),
    textRegexDenylist: z
      .array(z.string())
      .default(["(?i)sk-[A-Za-z0-9]{10,}", "(?i)bearer\\s+[A-Za-z0-9._-]{10,}"])
  }),
  upstreams: z.record(z.string(), upstreamSchema),
  routes: z.array(routeSchema).min(1),
  lease: z
    .object({
      allowQueryCarrier: z.boolean().default(false)
    })
    .default({
      allowQueryCarrier: false
    }),
  streamPassthrough: z.boolean().default(false),
  proxy: proxySchema.default({
    enabled: false,
    port: 3211,
    allowlistHosts: [],
    denyByDefault: true
  })
});

export type GatewayConfig = z.infer<typeof gatewayConfigSchema>;

const gatewaySigSchema = z.object({
  configSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number(),
  signer: z.literal("auditor")
});

function gatewayPaths(workspace: string): { configPath: string; sigPath: string } {
  const configPath = join(workspace, ".amc", "gateway.yaml");
  return {
    configPath,
    sigPath: `${configPath}.sig`
  };
}

export function expandEnvTemplate(input: string, env: NodeJS.ProcessEnv = process.env): string {
  return input.replace(/\$\{([A-Z0-9_]+)(:-([^}]*))?\}/gi, (_all, key: string, _fallback: string | undefined, defaultValue: string | undefined) => {
    const value = env[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
    return defaultValue ?? "";
  });
}

function cloneConfig(config: GatewayConfig): GatewayConfig {
  return JSON.parse(JSON.stringify(config)) as GatewayConfig;
}

export function resolveGatewayConfigEnv(config: GatewayConfig, env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const cloned = cloneConfig(config);
  for (const upstream of Object.values(cloned.upstreams)) {
    upstream.baseUrl = expandEnvTemplate(upstream.baseUrl, env);
  }
  return cloned;
}

export function defaultGatewayConfig(): GatewayConfig {
  return gatewayConfigSchema.parse({
    listen: {
      host: "127.0.0.1",
      port: 3210
    },
    redaction: {
      headerKeysDenylist: ["authorization", "x-api-key", "api-key", "x-openai-key"],
      jsonPathsDenylist: ["$.api_key", "$.key"],
      textRegexDenylist: ["(?i)sk-[A-Za-z0-9]{10,}", "(?i)bearer\\s+[A-Za-z0-9._-]{10,}"]
    },
    upstreams: {
      openai: {
        baseUrl: "${OPENAI_BASE_URL:-https://api.openai.com}",
        auth: { type: "bearer_env", env: "OPENAI_API_KEY" },
        providerId: "openai"
      },
      xai_grok: {
        baseUrl: "${XAI_BASE_URL}",
        auth: { type: "bearer_env", env: "XAI_API_KEY" },
        providerId: "xai_grok"
      },
      anthropic: {
        baseUrl: "${ANTHROPIC_BASE_URL:-https://api.anthropic.com}",
        auth: { type: "header_env", header: "x-api-key", env: "ANTHROPIC_API_KEY" },
        providerId: "anthropic"
      },
      gemini: {
        baseUrl: "${GEMINI_BASE_URL}",
        auth: { type: "query_env", param: "key", env: "GEMINI_API_KEY" },
        providerId: "gemini"
      },
      openrouter: {
        baseUrl: "${OPENROUTER_BASE_URL:-https://openrouter.ai}",
        auth: { type: "bearer_env", env: "OPENROUTER_API_KEY" },
        providerId: "openrouter"
      },
      local_openai: {
        baseUrl: "${LOCAL_OPENAI_BASE_URL:-http://127.0.0.1:8000}",
        auth: { type: "none" },
        allowLocalhost: true,
        providerId: "local_openai"
      }
    },
    routes: [
      { prefix: "/openai", upstream: "openai", stripPrefix: true, openaiCompatible: true },
      { prefix: "/grok", upstream: "xai_grok", stripPrefix: true, openaiCompatible: true },
      { prefix: "/anthropic", upstream: "anthropic", stripPrefix: true, openaiCompatible: false },
      { prefix: "/gemini", upstream: "gemini", stripPrefix: true, openaiCompatible: false },
      { prefix: "/openrouter", upstream: "openrouter", stripPrefix: true, openaiCompatible: true },
      { prefix: "/local", upstream: "local_openai", stripPrefix: true, openaiCompatible: true }
    ],
    lease: {
      allowQueryCarrier: false
    },
    streamPassthrough: false,
    proxy: {
      enabled: true,
      port: 3211,
      allowlistHosts: [
        "api.openai.com",
        "api.anthropic.com",
        "openrouter.ai",
        "generativelanguage.googleapis.com"
      ],
      denyByDefault: true
    }
  });
}

export function presetGatewayConfigForProvider(provider: string): GatewayConfig {
  const base = defaultGatewayConfig();
  const requireUpstream = (key: string) => {
    const upstream = base.upstreams[key];
    if (!upstream) {
      throw new Error(`Missing default upstream template: ${key}`);
    }
    return upstream;
  };
  const single = (prefix: string, upstreamId: string, openaiCompatible: boolean): GatewayConfig => {
    return gatewayConfigSchema.parse({
      ...base,
      upstreams: {
        [upstreamId]: base.upstreams[upstreamId]
      },
      routes: [{ prefix, upstream: upstreamId, stripPrefix: true, openaiCompatible }]
      ,
      streamPassthrough: false
    });
  };

  if (provider === "OpenAI") {
    return single("/openai", "openai", true);
  } else if (provider === "xAI Grok") {
    return single("/grok", "xai_grok", true);
  } else if (provider === "Anthropic") {
    return single("/anthropic", "anthropic", false);
  } else if (provider === "Gemini") {
    return single("/gemini", "gemini", false);
  } else if (provider === "OpenRouter") {
    return single("/openrouter", "openrouter", true);
  } else if (provider === "Local OpenAI-compatible (vLLM/LM Studio/etc)") {
    return single("/local", "local_openai", true);
  } else if (provider === "Azure OpenAI") {
    return gatewayConfigSchema.parse({
      ...base,
      upstreams: {
        azure_openai: {
          baseUrl: "${AZURE_OPENAI_BASE_URL}",
          auth: { type: "header_env", header: "api-key", env: "AZURE_OPENAI_API_KEY" },
          providerId: "azure_openai"
        }
      },
      routes: [{ prefix: "/azure-openai", upstream: "azure_openai", stripPrefix: true, openaiCompatible: true }]
      ,
      streamPassthrough: false
    });
  } else if (provider === "Groq") {
    return gatewayConfigSchema.parse({
      ...base,
      upstreams: {
        groq: {
          baseUrl: "${GROQ_BASE_URL}",
          auth: { type: "bearer_env", env: "GROQ_API_KEY" },
          providerId: "groq"
        }
      },
      routes: [{ prefix: "/groq", upstream: "groq", stripPrefix: true, openaiCompatible: true }]
      ,
      streamPassthrough: false
    });
  } else if (provider === "Mistral") {
    return gatewayConfigSchema.parse({
      ...base,
      upstreams: {
        mistral: {
          baseUrl: "${MISTRAL_BASE_URL}",
          auth: { type: "bearer_env", env: "MISTRAL_API_KEY" },
          providerId: "mistral"
        }
      },
      routes: [{ prefix: "/mistral", upstream: "mistral", stripPrefix: true, openaiCompatible: true }]
      ,
      streamPassthrough: false
    });
  } else if (provider === "Cohere") {
    return gatewayConfigSchema.parse({
      ...base,
      upstreams: {
        cohere: {
          baseUrl: "${COHERE_BASE_URL}",
          auth: { type: "bearer_env", env: "COHERE_API_KEY" },
          providerId: "cohere"
        }
      },
      routes: [{ prefix: "/cohere", upstream: "cohere", stripPrefix: true, openaiCompatible: false }]
      ,
      streamPassthrough: false
    });
  } else if (provider === "Together AI") {
    return gatewayConfigSchema.parse({
      ...base,
      upstreams: {
        together: {
          baseUrl: "${TOGETHER_BASE_URL}",
          auth: { type: "bearer_env", env: "TOGETHER_API_KEY" },
          providerId: "together"
        }
      },
      routes: [{ prefix: "/together", upstream: "together", stripPrefix: true, openaiCompatible: true }]
      ,
      streamPassthrough: false
    });
  } else if (provider === "Fireworks") {
    return gatewayConfigSchema.parse({
      ...base,
      upstreams: {
        fireworks: {
          baseUrl: "${FIREWORKS_BASE_URL}",
          auth: { type: "bearer_env", env: "FIREWORKS_API_KEY" },
          providerId: "fireworks"
        }
      },
      routes: [{ prefix: "/fireworks", upstream: "fireworks", stripPrefix: true, openaiCompatible: true }]
      ,
      streamPassthrough: false
    });
  } else if (provider === "Perplexity") {
    return gatewayConfigSchema.parse({
      ...base,
      upstreams: {
        perplexity: {
          baseUrl: "${PERPLEXITY_BASE_URL}",
          auth: { type: "bearer_env", env: "PERPLEXITY_API_KEY" },
          providerId: "perplexity"
        }
      },
      routes: [{ prefix: "/perplexity", upstream: "perplexity", stripPrefix: true, openaiCompatible: true }]
      ,
      streamPassthrough: false
    });
  } else if (provider === "DeepSeek") {
    return gatewayConfigSchema.parse({
      ...base,
      upstreams: {
        deepseek: {
          baseUrl: "${DEEPSEEK_BASE_URL}",
          auth: { type: "bearer_env", env: "DEEPSEEK_API_KEY" },
          providerId: "deepseek"
        }
      },
      routes: [{ prefix: "/deepseek", upstream: "deepseek", stripPrefix: true, openaiCompatible: true }]
      ,
      streamPassthrough: false
    });
  } else if (provider === "Qwen") {
    return gatewayConfigSchema.parse({
      ...base,
      upstreams: {
        qwen: {
          baseUrl: "${QWEN_BASE_URL}",
          auth: { type: "bearer_env", env: "QWEN_API_KEY" },
          providerId: "qwen"
        }
      },
      routes: [{ prefix: "/qwen", upstream: "qwen", stripPrefix: true, openaiCompatible: true }]
      ,
      streamPassthrough: false
    });
  }

  return gatewayConfigSchema.parse({
    ...base,
    upstreams: { openai: requireUpstream("openai") },
    routes: [{ prefix: "/openai", upstream: "openai", stripPrefix: true, openaiCompatible: true }]
    ,
    streamPassthrough: false
  });
}

export function saveGatewayConfig(workspace: string, config: GatewayConfig, explicitPath?: string): string {
  const targetPath = explicitPath ? resolve(workspace, explicitPath) : gatewayPaths(workspace).configPath;
  ensureDir(join(workspace, ".amc"));
  writeFileAtomic(targetPath, YAML.stringify(config), 0o644);
  const sigPath = explicitPath ? `${resolve(workspace, explicitPath)}.sig` : gatewayPaths(workspace).sigPath;
  if (pathExists(sigPath)) {
    unlinkSync(sigPath);
  }
  return targetPath;
}

export function loadGatewayConfigFromPath(configPath: string): GatewayConfig {
  if (!pathExists(configPath)) {
    throw new Error(`Gateway config not found: ${configPath}`);
  }
  const parsed = YAML.parse(readFileSync(configPath, "utf8")) as unknown;
  return gatewayConfigSchema.parse(parsed);
}

export function loadGatewayConfig(workspace: string, explicitPath?: string): GatewayConfig {
  const path = explicitPath ? resolve(workspace, explicitPath) : gatewayPaths(workspace).configPath;
  return loadGatewayConfigFromPath(path);
}

export function signGatewayConfig(workspace: string, explicitPath?: string): string {
  const { configPath, sigPath } = gatewayPaths(workspace);
  const targetPath = explicitPath ? resolve(workspace, explicitPath) : configPath;
  if (!pathExists(targetPath)) {
    throw new Error(`Cannot sign missing gateway config: ${targetPath}`);
  }

  const raw = readFileSync(targetPath);
  const digest = sha256Hex(raw);
  const signature = signHexDigest(digest, getPrivateKeyPem(workspace, "auditor"));
  const sigPayload = {
    configSha256: digest,
    signature,
    signedTs: Date.now(),
    signer: "auditor" as const
  };

  const writeSigPath = targetPath === configPath ? sigPath : `${targetPath}.sig`;
  writeFileAtomic(writeSigPath, JSON.stringify(sigPayload, null, 2), 0o644);
  return writeSigPath;
}

export function verifyGatewayConfigSignature(
  workspace: string,
  explicitPath?: string
): { valid: boolean; signatureExists: boolean; reason: string | null; configPath: string; sigPath: string } {
  const defaults = gatewayPaths(workspace);
  const configPath = explicitPath ? resolve(workspace, explicitPath) : defaults.configPath;
  const sigPath = explicitPath ? `${resolve(workspace, explicitPath)}.sig` : defaults.sigPath;

  if (!pathExists(configPath)) {
    return { valid: false, signatureExists: false, reason: "gateway config missing", configPath, sigPath };
  }

  if (!pathExists(sigPath)) {
    return { valid: false, signatureExists: false, reason: "gateway config signature missing", configPath, sigPath };
  }

  try {
    const sigPayload = gatewaySigSchema.parse(JSON.parse(readFileSync(sigPath, "utf8")) as unknown);
    const raw = readFileSync(configPath);
    const digest = sha256Hex(raw);

    if (digest !== sigPayload.configSha256) {
      return { valid: false, signatureExists: true, reason: "config digest mismatch", configPath, sigPath };
    }

    const auditorKeys = getPublicKeyHistory(workspace, "auditor");
    const ok = verifyHexDigestAny(digest, sigPayload.signature, auditorKeys);
    return {
      valid: ok,
      signatureExists: true,
      reason: ok ? null : "signature verification failed",
      configPath,
      sigPath
    };
  } catch (error) {
    return {
      valid: false,
      signatureExists: true,
      reason: `invalid signature file: ${String(error)}`,
      configPath,
      sigPath
    };
  }
}

export function initGatewayConfig(workspace: string, config?: GatewayConfig): { configPath: string; sigPath: string } {
  const cfg = gatewayConfigSchema.parse(config ?? defaultGatewayConfig());
  const configPath = saveGatewayConfig(workspace, cfg);
  const sigPath = signGatewayConfig(workspace, configPath);
  return { configPath, sigPath };
}

export function extractMissingAuthEnvVars(config: GatewayConfig, env: NodeJS.ProcessEnv = process.env): string[] {
  const missing = new Set<string>();
  for (const upstream of Object.values(config.upstreams)) {
    const auth = upstream.auth;
    if (auth.type === "none") {
      continue;
    }

    const key = auth.env;
    if (!env[key]) {
      missing.add(key);
    }
  }
  return [...missing].sort();
}

export function routeBaseUrls(config: GatewayConfig): Array<{
  prefix: string;
  upstream: string;
  baseUrl: string;
  openaiCompatible: boolean;
  agentId?: string;
}> {
  return config.routes.map((route) => ({
    prefix: route.prefix,
    upstream: route.upstream,
    baseUrl: config.upstreams[route.upstream]?.baseUrl ?? "",
    openaiCompatible: route.openaiCompatible,
    agentId: route.agentId
  }));
}

export function gatewayConfigHash(config: GatewayConfig): string {
  return sha256Hex(canonicalize(config));
}

export function bindAgentRoute(config: GatewayConfig, routePrefix: string, agentId: string): GatewayConfig {
  const next = cloneConfig(config);
  const route = next.routes.find((item) => item.prefix === routePrefix);
  if (!route) {
    throw new Error(`Gateway route not found: ${routePrefix}`);
  }
  route.agentId = agentId;
  return gatewayConfigSchema.parse(next);
}
