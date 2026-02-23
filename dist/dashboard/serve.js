import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
function contentType(file) {
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
function buildMarkdown(data) {
    const overall = data.overall?.toFixed(2) ?? "N/A";
    const overallTrust = data.latestRun?.trustLabel ?? "N/A";
    const topGaps = (data.evidenceGaps || []).slice(0, 5).map((gap) => `- ${gap.questionId}: ${gap.reason}`).join("\n");
    const layerRows = (data.latestRun?.layerScores || []).map((row) => `- ${row.layerName}: ${row.avgFinalLevel?.toFixed(2)}`).join("\n");
    const assuranceRows = (data.assurance || []).map((pack) => `- ${pack.packId}: ${pack.score0to100.toFixed(2)}/100 (pass ${pack.passCount} / fail ${pack.failCount})`).join("\n");
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
function buildPdfHtml(data) {
    return `<!doctype html><html><head><meta charset=\"utf-8\"><title>AMC Dashboard Export</title><style>body{font-family:Arial,sans-serif;padding:24px}h1{font-size:24px} .bad{color:#b00}.good{color:#090}</style></head><body onload=\"window.print()\"><h1>AMC Dashboard Export</h1><pre>${buildMarkdown(data).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre></body></html>`;
}
function safeResolve(root, pathname) {
    const normalized = normalize(pathname).replace(/^\/+/, "");
    const file = normalized.length > 0 ? normalized : "index.html";
    const full = resolve(root, file);
    if (!full.startsWith(resolve(root))) {
        return resolve(root, "index.html");
    }
    return full;
}
export async function serveDashboard(input) {
    const agentId = resolveAgentId(input.workspace, input.agentId);
    const paths = getAgentPaths(input.workspace, agentId);
    const rootDir = input.outDir ? resolve(input.workspace, input.outDir) : join(paths.rootDir, "dashboard");
    if (!pathExists(join(rootDir, "index.html"))) {
        throw new Error(`Dashboard not built at ${rootDir}. Run 'amc dashboard build' first.`);
    }
    const server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname === "/export.md") {
            try {
                const data = JSON.parse(readUtf8(`${rootDir}/data.json`));
                const md = buildMarkdown(data);
                res.statusCode = 200;
                res.setHeader("content-type", "text/markdown; charset=utf-8");
                res.setHeader("content-disposition", "attachment; filename=amc-dashboard-export.md");
                res.end(md);
                return;
            }
            catch (error) {
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
            }
            catch (error) {
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
        createReadStream(file).pipe(res);
    });
    await new Promise((resolvePromise, rejectPromise) => {
        server.once("error", rejectPromise);
        server.listen(input.port, "127.0.0.1", () => resolvePromise());
    });
    return {
        agentId,
        rootDir,
        url: `http://127.0.0.1:${input.port}`,
        close: () => new Promise((resolvePromise) => {
            server.close(() => resolvePromise());
        })
    };
}
