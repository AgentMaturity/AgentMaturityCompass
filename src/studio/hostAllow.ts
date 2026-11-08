import { isIP } from "node:net";

/**
 * Host header validation against DNS rebinding (LIVE-RUNTIME-19, D-R12). A page on attacker.example whose name later
 * resolves to 127.0.0.1 sends `Host: attacker.example:<port>` and an Origin to match, which passes the Origin check. A
 * rebinding attack needs a DNS name, so IP literals are safe; `localhost` and `*.localhost` never leave the machine;
 * any other name must be one the operator configured. A request through a trusted hop is not checked here: the proxy
 * terminates for its own configured name.
 */
function hostnameOf(hostHeader: string | undefined): string | null {
  const value = (hostHeader ?? "").trim().toLowerCase();
  if (value.length === 0) return null;
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end > 1 ? value.slice(1, end) : null;
  }
  const colon = value.lastIndexOf(":");
  return colon === -1 ? value : value.slice(0, colon);
}

export function hostAllowed(hostHeader: string | undefined, allowedHostnames: ReadonlySet<string>): boolean {
  const name = hostnameOf(hostHeader);
  if (name === null || name.length === 0) return false;
  return isIP(name) !== 0 || name === "localhost" || name.endsWith(".localhost") || allowedHostnames.has(name);
}

/** The host names of configured origins and base URLs (`https://studio.example.com` gives `studio.example.com`). */
export function allowedHostnamesFrom(values: ReadonlyArray<string | null | undefined>): Set<string> {
  const names = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    try {
      names.add(new URL(value).hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1"));
    } catch {
      const bare = hostnameOf(value);
      if (bare) names.add(bare);
    }
  }
  return names;
}
