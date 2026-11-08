import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { ServerResponse } from "node:http";
import { pathExists, readUtf8 } from "../utils/fs.js";

/**
 * Console pages load their scripts, styles, manifest and service worker from /console and call only this server. Style
 * attributes in rendered markup need inline styles; scripts get no inline allowance. Referrer-Policy is same-origin, not
 * no-referrer: under no-referrer a browser sends `Origin: null` on form posts, which Studio's CORS check refuses.
 */
export const CONSOLE_CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; "
  + "base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const CONSOLE_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy": CONSOLE_CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin"
};

function moduleDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function contentType(path: string): string {
  if (path.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (path.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }
  if (path.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (path.endsWith(".svg")) {
    return "image/svg+xml";
  }
  if (path.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }
  return "text/plain; charset=utf-8";
}

function resolveConsolePath(pathname: string): string | null {
  const clean = pathname.replace(/^\/console/, "");
  if (clean === "" || clean === "/") {
    return join(moduleDir(), "pages", "home.html");
  }
  if (clean.startsWith("/assets/")) {
    const rel = normalize(clean.slice(1));
    if (rel.includes("..")) {
      return null;
    }
    return join(moduleDir(), rel);
  }
  const page = clean.replace(/^\//, "");
  const file = page.endsWith(".html") ? page : `${page}.html`;
  if (file.includes("/") || file.includes("..")) {
    return null;
  }
  return join(moduleDir(), "pages", file);
}

export function serveConsolePath(pathname: string, res: ServerResponse): boolean {
  if (!pathname.startsWith("/console")) {
    return false;
  }
  // /console/snapshot is handled by the auth-protected API handler
  if (pathname === "/console/snapshot") {
    return false;
  }
  for (const [name, value] of Object.entries(CONSOLE_SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
  const file = resolveConsolePath(pathname);
  if (!file || !pathExists(file)) {
    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "console asset not found" }));
    return true;
  }
  res.statusCode = 200;
  res.setHeader("content-type", contentType(file));
  if (file.endsWith(join("assets", "sw.js"))) {
    res.setHeader("Service-Worker-Allowed", "/console/");
  }
  res.end(readUtf8(file));
  return true;
}
