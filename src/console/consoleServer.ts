import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { ServerResponse } from "node:http";
import { pathExists, readUtf8 } from "../utils/fs.js";

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
