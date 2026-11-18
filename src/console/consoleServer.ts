import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { pathExists } from "../utils/fs.js";

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

/** The page for a console address that names no page: what happened and the way back, in the console's colours. */
const NOT_FOUND_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Page not found · Compass Console</title><link rel="stylesheet" href="./assets/styles.css?v=20261118c" /></head>
<body><main style="max-width:560px;margin:15vh auto;padding:0 16px"><section class="card"><h2>There is no page at this address</h2>
<p>Check the address for a typing mistake, or go back to Home.</p><p><a class="button" href="./home">Go to Home</a></p></section></main></body></html>`;

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
  if (path.endsWith(".png")) {
    return "image/png";
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
  if (pathname === "/console") {
    // Pages link assets as "./assets/..."; without the trailing slash those resolve outside /console.
    // The Location is relative so a workspace-prefixed mount (/w/<id>/console) redirects within its prefix.
    res.statusCode = 308;
    res.setHeader("location", "console/");
    res.end();
    return true;
  }
  const file = resolveConsolePath(pathname);
  if (!file || !pathExists(file)) {
    res.statusCode = 404;
    // A mistyped page address gets a plain page with a way home (C-24); a missing asset keeps the JSON answer.
    if (pathname.includes("/assets/")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "console asset not found" }));
    } else {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(NOT_FOUND_PAGE);
    }
    return true;
  }
  res.statusCode = 200;
  res.setHeader("content-type", contentType(file));
  if (file.endsWith(join("assets", "sw.js"))) {
    res.setHeader("Service-Worker-Allowed", "/console/");
  }
  // Bytes, not text: the PNG icons would be corrupted by a UTF-8 read.
  res.end(readFileSync(file));
  return true;
}
