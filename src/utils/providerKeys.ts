export const PROVIDER_KEY_ENV_NAMES = [
  "OPENAI_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "XAI_API_KEY",
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "COHERE_API_KEY",
  "TOGETHER_API_KEY",
  "FIREWORKS_API_KEY",
  "PERPLEXITY_API_KEY",
  "DEEPSEEK_API_KEY",
  "QWEN_API_KEY"
] as const;

/**
 * AMC's own secrets read from the environment (vault, notary, backup and bootstrap passphrases, signing, private,
 * license and API keys, admin and session tokens, auth secrets, credential files, a parent's lease) and the `_FILE`
 * variants that point at them. No launched agent needs them; the one agent-facing name is AGENT_FACING_AMC_ENV.
 */
const AMC_SECRET_ENV_PATTERN =
  /^AMC_[A-Z0-9_]*(PASSPHRASE|PASSWORD|SECRET|SIGNING_KEY|PRIVATE_KEY|API_KEY|LICENSE_KEY|TOKEN|AUTH|CREDENTIAL|LEASE)[A-Z0-9_]*$/;

/**
 * Deliberately inherited by a wrapped agent: AMC_TOKEN is the agent's own bridge bearer token (sdk/amcClient.ts reads
 * it). AMC_LEASE and the gateway base URLs are not inherited; the launcher sets the child's own explicitly.
 */
const AGENT_FACING_AMC_ENV: readonly string[] = ["AMC_TOKEN"];

/** Whether `name` is one of AMC's secret variables (AMC_TOKEN included: only a wrapped agent is meant to hold it). */
export function isAmcSecretEnv(name: string): boolean {
  return AMC_SECRET_ENV_PATTERN.test(name);
}

/** The environment minus AMC's own secrets: for a launched agent that legitimately holds its own provider key. */
export function stripAmcSecrets(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !isAmcSecretEnv(key) || AGENT_FACING_AMC_ENV.includes(key)));
}

/** The parent environment minus the provider keys AMC holds and AMC's own secrets: for launched agents and probes. */
export function stripProviderKeys(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = stripAmcSecrets(env);
  for (const key of PROVIDER_KEY_ENV_NAMES) {
    delete next[key];
  }
  return next;
}

/**
 * What a model-run command needs to work and nothing else: the confined shells' PATH/HOME/TMPDIR/LANG plus the
 * identity, terminal, locale and timezone names commands read. An allow-list, so a secret AMC has never heard of
 * (a cloud or GitHub token, an operator passphrase) is not inherited either.
 */
const COMMAND_ENV_ALLOW = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TERM", "TMPDIR", "TMP", "TEMP", "TZ",
  "LANG", "LANGUAGE", "LC_ALL", "LC_CTYPE", "LC_MESSAGES", "LC_COLLATE", "LC_NUMERIC", "LC_TIME", "LC_MONETARY",
  "USERPROFILE", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT"] as const;

export function commandEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of COMMAND_ENV_ALLOW) {
    const value = env[key];
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export function dummyProviderKeyEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of PROVIDER_KEY_ENV_NAMES) {
    out[key] = "amc_dummy";
  }
  return out;
}
