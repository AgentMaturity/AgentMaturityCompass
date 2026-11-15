/**
 * Safely extract an error message from an unknown thrown value.
 * Use in catch blocks instead of `catch (e: any) { e.message }`.
 */
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    // CLI-28: a missing path reached people as "ENOENT: no such file or directory, open '/x'".
    const missing = /^ENOENT: no such file or directory, \w+ '(.+)'$/.exec(err.message);
    return missing ? `The file or folder ${missing[1]} does not exist. Check the path and try again.` : err.message;
  }
  if (typeof err === "string") return err;
  return String(err);
}

/**
 * Validate a string value against an array of allowed values.
 * Returns the narrowed type or throws with an actionable error.
 */
export function validateOption<T extends string>(
  value: string,
  allowed: readonly T[],
  optionName: string
): T {
  if (allowed.includes(value as T)) return value as T;
  throw new Error(`Invalid ${optionName}: "${value}". Must be one of: ${allowed.join(", ")}`);
}
