import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const root = process.cwd();
const artifact = mkdtempSync(join(tmpdir(), "amc-typography-e2e-"));
let server: Server;
let baseUrl = "";

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

test.beforeAll(async () => {
  const result = spawnSync(process.execPath, [resolve(root, "scripts/build-pages-site.mjs"), "--out", artifact], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GITHUB_SHA: "fedcba9876543210fedcba9876543210fedcba98" },
  });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);

  server = createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const path = resolve(artifact, relativePath);
    if (!path.startsWith(`${artifact}/`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    try {
      const file = statSync(path).isDirectory() ? resolve(path, "index.html") : path;
      response.writeHead(200, { "content-type": mimeTypes[extname(file)] || "application/octet-stream" });
      response.end(readFileSync(file));
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Typography test server did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  rmSync(artifact, { recursive: true, force: true });
});

test("public surfaces load canonical typography only from the AMC artifact", async ({ page }) => {
  const requests = new Set<string>();
  page.on("request", request => requests.add(request.url()));
  const surfaces = [
    "/",
    "/docs/#PLAYGROUND",
    "/playground.html",
    "/compare.html",
    "/blog/",
    "/station-health.html",
    "/docs/getting-started.html",
    "/vs-promptfoo.html",
    "/methodology.html",
    "/404.html",
  ];

  for (const surface of surfaces) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}${surface}`, { waitUntil: "load" });
    const state = await page.evaluate(async () => {
      await document.fonts.ready;
      const body = getComputedStyle(document.body);
      const monoTarget = Array.from(document.querySelectorAll("body, body *"))
        .slice(0, 500)
        .find(element => getComputedStyle(element).fontFamily.includes("Space Mono"));
      return {
        bodyFont: body.fontFamily,
        documentWidth: document.documentElement.scrollWidth,
        interReady: document.fonts.check('16px "Inter"'),
        monoFont: monoTarget ? getComputedStyle(monoTarget).fontFamily : "",
        spaceMonoReady: document.fonts.check('16px "Space Mono"'),
        viewportWidth: window.innerWidth,
      };
    });
    expect(state.documentWidth, surface).toBeLessThanOrEqual(state.viewportWidth);
    if (state.bodyFont.includes("Inter")) expect(state.interReady, surface).toBe(true);
    expect(state.spaceMonoReady, surface).toBe(true);
    expect(state.bodyFont, surface).toMatch(/Inter|Space Mono/);
    expect(state.monoFont, surface).toContain("Space Mono");
  }

  const remoteFonts = [...requests].filter(url => /fonts\.(?:googleapis|gstatic)\.com/i.test(url));
  const sameOriginFonts = [...requests].filter(url => url.startsWith(`${baseUrl}/fonts/`) && url.endsWith(".woff2"));
  expect(remoteFonts).toEqual([]);
  expect(sameOriginFonts.length).toBeGreaterThanOrEqual(7);
});
