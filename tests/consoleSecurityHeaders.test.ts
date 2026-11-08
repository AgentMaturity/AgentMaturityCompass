import { readdirSync, readFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { expect, test } from "vitest";
import { serveConsolePath } from "../src/console/consoleServer.js";

// M6 (2026-11-07 overseer): console responses carried no CSP and no other security headers.
const POLICY = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; "
  + "base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

function serve(pathname: string): { status: number; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const res = { statusCode: 0, setHeader: (name: string, value: string) => { headers[name.toLowerCase()] = value; }, end: () => {} };
  expect(serveConsolePath(pathname, res as unknown as ServerResponse)).toBe(true);
  return { status: res.statusCode, headers };
}

test("console pages, assets and misses carry the security headers", () => {
  for (const [pathname, status] of [["/console/", 200], ["/console/ops", 200], ["/console/assets/app.js", 200], ["/console/missing", 404]] as const) {
    const { status: actual, headers } = serve(pathname);
    expect(actual, pathname).toBe(status);
    expect(headers, pathname).toMatchObject({
      "content-security-policy": POLICY,
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "same-origin"
    });
  }
});

test("no console page has an inline script or handler that script-src 'self' would block", () => {
  for (const file of readdirSync("src/console/pages")) {
    const html = readFileSync(`src/console/pages/${file}`, "utf8");
    expect(html.match(/<script(?![^>]*\ssrc=)[^>]*>/gi) ?? [], file).toEqual([]);
    expect(html, file).not.toMatch(/\son[a-z]+\s*=|javascript:/i);
  }
});
