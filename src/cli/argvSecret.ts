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
