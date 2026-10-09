import { URL } from "node:url";

/** Authority-form only. The HTTPS root URL is a registry locator, not evidence of TLS or an HTTP payload. */
export function parseConnectAuthority(raw: string | undefined): { host: string; port: number; url: URL } | null {
  if (typeof raw !== "string" || !raw || raw.length > 4096 || /[\s\x00-\x1f\x7f@/\\?#%]/u.test(raw)) return null;
  const match = /^(?:\[[^\[\]]+\]|[^:\[\]]+)(?::([0-9]+))?$/.exec(raw);
  if (!match) return null;
  const port = match[1] === undefined ? 443 : Number(match[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  try {
    const url = new URL(`https://${raw}/`);
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (!host || (url.port ? Number(url.port) : 443) !== port) return null;
    return { host, port, url };
  } catch { return null; }
}
