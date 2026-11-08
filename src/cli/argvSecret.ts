/**
 * LIVE-VAULT-14: a secret passed as a command-line option is visible to every process on the machine (ps). Commands that
 * take one also take a file option (and, where named, an environment variable); the inline option still works, with a
 * warning.
 */
import { readFileSync } from "node:fs";

/** The file's trimmed content, else env[envName], else the inline value, else null. Warns when the inline value is the one used. */
export function resolveSecretOption(opts: { inline?: string; file?: string }, envName: string | null, inlineWarning?: { option: string; alternatives: string },
  env: NodeJS.ProcessEnv = process.env, readFile: (path: string) => string = (path) => readFileSync(path, "utf8")): string | null {
  if (opts.file !== undefined) {
    const value = readFile(opts.file).trim();
    if (value.length === 0) throw new Error(`${opts.file} is empty`);
    return value;
  }
  const fromEnv = envName === null ? undefined : env[envName];
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
  if (opts.inline === undefined) return null;
  if (inlineWarning !== undefined) warnInlineSecret(inlineWarning.option, inlineWarning.alternatives);
  return opts.inline;
}

export function warnInlineSecret(option: string, alternatives: string, write: (line: string) => void = (line) => { process.stderr.write(line); }): void {
  write(`Warning: ${option} is visible to every process on this machine (ps); use ${alternatives}.\n`);
}

/** `amc watch connect` and `amc monitor live`: --api-key-file, else AMC_WATCH_API_KEY, else --api-key. */
export function watchApiKey(opts: { apiKey?: string; apiKeyFile?: string }): string | undefined {
  return resolveSecretOption({ inline: opts.apiKey, file: opts.apiKeyFile }, "AMC_WATCH_API_KEY",
    { option: "--api-key", alternatives: "--api-key-file <path> or AMC_WATCH_API_KEY" }) ?? undefined;
}

/**
 * `amc watch connect` and `amc monitor live` with `--provider langfuse`: Langfuse's API takes HTTP Basic with the public
 * key (the API key) and the secret key together, and the adapter reads the secret from this header. The secret comes
 * from --secret-key-file or AMC_WATCH_SECRET_KEY, never argv; any other provider refuses one.
 */
export function watchSecretHeaders(opts: { provider?: string; secretKeyFile?: string }, env: NodeJS.ProcessEnv = process.env): Record<string, string> | undefined {
  const secret = resolveSecretOption({ file: opts.secretKeyFile }, "AMC_WATCH_SECRET_KEY", undefined, env);
  if (secret === null) return undefined;
  if (opts.provider !== "langfuse") throw new Error("--secret-key-file (AMC_WATCH_SECRET_KEY) is for --provider langfuse only");
  return { "x-langfuse-secret-key": secret };
}
