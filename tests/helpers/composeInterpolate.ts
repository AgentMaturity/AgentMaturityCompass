/**
 * Resolve Compose `${VAR:-default}`, `${VAR-default}` and bare `${VAR}` against env, as `docker compose` interpolates
 * (`:-` also replaces an empty value, `-` only an unset one).
 */
export function interpolate(text: string, env: Record<string, string | undefined> = {}): string {
  return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?-)([^}]*))?\}/g, (_match, name: string, op?: string, fallback = "") => {
    const value = env[name];
    if (op === ":-") return value ? value : fallback;
    if (op === "-") return value === undefined ? fallback : value;
    return value ?? "";
  });
}

/** A Compose service's environment as a map, whether written as a list of `K=V` or as a mapping. */
export function serviceEnv(service: { environment?: string[] | Record<string, unknown> }): Record<string, string> {
  const env = service.environment ?? {};
  if (!Array.isArray(env)) return Object.fromEntries(Object.entries(env).map(([key, value]) => [key, String(value)]));
  return Object.fromEntries(env.map((entry) => {
    const at = entry.indexOf("=");
    return at < 0 ? [entry, ""] : [entry.slice(0, at), entry.slice(at + 1)];
  }));
}
