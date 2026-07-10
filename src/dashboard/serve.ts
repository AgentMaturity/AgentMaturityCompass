import { randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { handleApiRoute } from "../api/index.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { pathExists, readUtf8 } from "../utils/fs.js";

export interface ServeDashboardInput {
  workspace: string;
  agentId?: string;
  port: number;
  outDir?: string;
}

export interface DashboardServerHandle {
  agentId: string;
  rootDir: string;
  port: number;
  url: string;
  close: () => Promise<void>;
}

function contentType(file: string): string {
  const ext = extname(file).toLowerCase();
  if (ext === ".html") {
    return "text/html; charset=utf-8";
  }
  if (ext === ".js") {
    return "text/javascript; charset=utf-8";
  }
  if (ext === ".css") {
    return "text/css; charset=utf-8";
  }
  if (ext === ".json") {
    return "application/json; charset=utf-8";
  }
  if (ext === ".svg") {
    return "image/svg+xml";
  }
  if (ext === ".md") {
    return "text/markdown; charset=utf-8";
  }
  if (ext === ".pdf") {
    return "application/pdf";
  }
  return "application/octet-stream";
}

function buildMarkdown(data: any): string {
  const overall = data.overall?.toFixed(2) ?? "N/A";
  const overallTrust = data.latestRun?.trustLabel ?? "N/A";
  const topGaps = (data.evidenceGaps || []).slice(0, 5).map((gap: any) => `- ${gap.questionId}: ${gap.reason}`).join("\n");
  const layerRows = (data.latestRun?.layerScores || []).map((row: any) => `- ${row.layerName}: ${row.avgFinalLevel?.toFixed(2)}`).join("\n");
  const assuranceRows = (data.assurance || []).map((pack: any) => `- ${pack.packId}: ${pack.score0to100.toFixed(2)}/100 (pass ${pack.passCount} / fail ${pack.failCount})`).join("\n");

  return [
    "# AMC Dashboard Export",
    `Generated: ${new Date(data.generatedTs || Date.now()).toISOString()}`,
    `Agent: ${data.agentId}`,
    `Overall Score: ${overall}`,
    `Trust: ${overallTrust}`,
    "",
    "## Layer Breakdown",
    layerRows || "- N/A",
    "",
    "## Top Evidence Gaps",
    topGaps || "- none",
    "",
    "## Assurance Packs",
    assuranceRows || "- none",
    "",
    "## Trends",
    `Recent run count: ${(data.trends || []).length}`,
  ].join("\n");
}

function buildPdfHtml(data: any): string {
  return `<!doctype html><html><head><meta charset=\"utf-8\"><title>AMC Dashboard Export</title><style>body{font-family:Arial,sans-serif;padding:24px}h1{font-size:24px} .bad{color:#b00}.good{color:#090}</style></head><body onload=\"window.print()\"><h1>AMC Dashboard Export</h1><pre>${buildMarkdown(data).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre></body></html>`;
}

function safeResolve(root: string, pathname: string): string {
  const normalized = normalize(pathname).replace(/^\/+/, "");
  const file = normalized.length > 0 ? normalized : "index.html";
  const full = resolve(root, file);
  if (!full.startsWith(resolve(root))) {
    return resolve(root, "index.html");
  }
  return full;
}

const DASHBOARD_CAPABILITY_COOKIE = "amc_dashboard_cap";

function requestCookie(req: IncomingMessage, name: string): string | null {
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  for (const segment of cookie.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 0) continue;
    if (segment.slice(0, separator).trim() === name) return segment.slice(separator + 1).trim();
  }
  return null;
}

function constantTimeTokenEqual(actual: string | null, expected: string): boolean {
  if (!actual) return false;
  const actualBytes = Buffer.from(actual, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function allowedDashboardOrigins(server: Server): Set<string> {
  const address = server.address();
  if (!address || typeof address === "string") return new Set();
  return new Set([
    `http://127.0.0.1:${address.port}`,
    `http://localhost:${address.port}`
  ]);
}

function isAuthorizedDashboardMutation(input: {
  server: Server;
  req: IncomingMessage;
  capability: string;
}): boolean {
  const origin = input.req.headers.origin;
  return typeof origin === "string"
    && allowedDashboardOrigins(input.server).has(origin)
    && constantTimeTokenEqual(requestCookie(input.req, DASHBOARD_CAPABILITY_COOKIE), input.capability);
}

export async function serveDashboard(input: ServeDashboardInput): Promise<DashboardServerHandle> {
  const agentId = resolveAgentId(input.workspace, input.agentId);
  const paths = getAgentPaths(input.workspace, agentId);
  const rootDir = input.outDir ? resolve(input.workspace, input.outDir) : join(paths.rootDir, "dashboard");

  if (!pathExists(join(rootDir, "index.html"))) {
    throw new Error(`Dashboard not built at ${rootDir}. Run 'amc dashboard build' first.`);
  }

  const dashboardCapability = randomBytes(32).toString("base64url");

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/api/v1/health" || url.pathname.startsWith("/api/v1/guardrails")) {
      res.setHeader("cache-control", "no-store");
      if (
        (req.method ?? "GET").toUpperCase() !== "GET"
        && !isAuthorizedDashboardMutation({ server, req, capability: dashboardCapability })
      ) {
        res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "Dashboard mutation requires its same-origin owner capability." }));
        return;
      }
      await handleApiRoute(
        url.pathname,
        (req.method ?? "GET").toUpperCase(),
        req,
        res,
        input.workspace
      );
      return;
    }

    if (url.pathname === "/export.md") {
      try {
        const data = JSON.parse(readUtf8(`${rootDir}/data.json`));
        const md = buildMarkdown(data);
        res.statusCode = 200;
        res.setHeader("content-type", "text/markdown; charset=utf-8");
        res.setHeader("content-disposition", "attachment; filename=amc-dashboard-export.md");
        res.end(md);
        return;
      } catch (error) {
        res.statusCode = 500;
        res.end(`Unable to build markdown export: ${String(error)}`);
        return;
      }
    }

    if (url.pathname === "/export.pdf") {
      try {
        const data = JSON.parse(readUtf8(`${rootDir}/data.json`));
        const html = buildPdfHtml(data);
        res.statusCode = 200;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.setHeader("content-disposition", "attachment; filename=amc-dashboard-export.html");
        res.end(html);
        return;
      } catch (error) {
        res.statusCode = 500;
        res.end(`Unable to build pdf export: ${String(error)}`);
        return;
      }
    }

    let file = safeResolve(rootDir, url.pathname === "/" ? "index.html" : url.pathname);
    if (!pathExists(file) && !extname(file)) {
      file = `${file}.html`;
    }
    if (!pathExists(file)) {
      res.statusCode = 404;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end("Not found");
      return;
    }
    res.statusCode = 200;
    res.setHeader("content-type", contentType(file));
    if (contentType(file).startsWith("text/html")) {
      res.setHeader(
        "set-cookie",
        `${DASHBOARD_CAPABILITY_COOKIE}=${dashboardCapability}; HttpOnly; SameSite=Strict; Path=/`
      );
      res.setHeader("cache-control", "no-store");
    }
    createReadStream(file).pipe(res);
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(input.port, "127.0.0.1", () => resolvePromise());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Dashboard server failed to resolve bound port.");
  }

  const port = address.port;

  return {
    agentId,
    rootDir,
    port,
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolvePromise) => {
        server.close(() => resolvePromise());
      })
  };
}
