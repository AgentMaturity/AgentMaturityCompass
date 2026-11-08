/**
 * Follow-up 8: the single-workspace and workspace consoles probed the host router's portfolio endpoints at
 * <prefix>/api/portfolio/forecast and <prefix>/api/bench/portfolio, which nothing there serves, so every page view
 * logged a 404. The host router serves them at /host/api/…, and only a console behind it (under /w/<id>/) can reach
 * them. Those consoles now probe the real host path; a single-workspace console renders its fallback without probing.
 */
import { describe, expect, test } from "vitest";
import { hostRouterPath, loadBenchPortfolio } from "../src/console/assets/hostPortfolio.js";
import { renderPortfolioForecastPage } from "../src/console/assets/portfolioForecast.js";

const SINGLE = "/console/portfolioForecast";
const HOSTED = "/w/ws-1/console/portfolioForecast";
const card = (title: string, body: string) => `<section><h3>${title}</h3>${body}</section>`;
const latest = { generatedTs: 1, status: "OK", series: {}, advisories: [] };

function recorder(answers: Record<string, unknown>) {
  const calls: string[] = [];
  const apiGet = async (path: string) => {
    calls.push(path);
    if (!(path in answers)) throw new Error(`404 ${path}`);
    return answers[path];
  };
  return { calls, apiGet };
}

describe("console portfolio probes", () => {
  test("only a console behind the host router names a host path", () => {
    expect(hostRouterPath("/api/portfolio/forecast", SINGLE)).toBeNull();
    expect(hostRouterPath("/api/portfolio/forecast", "/")).toBeNull();
    expect(hostRouterPath("/api/portfolio/forecast", HOSTED)).toBe("/host/api/portfolio/forecast");
  });

  test("a single-workspace console renders the workspace forecast without probing the host router", async () => {
    const { calls, apiGet } = recorder({ "/forecast/latest?scope=workspace": latest });
    const root = { innerHTML: "" };
    await renderPortfolioForecastPage({ root, card, apiGet, pathname: SINGLE });
    expect(calls).toEqual(["/forecast/latest?scope=workspace"]);
    expect(root.innerHTML).toContain("Current Workspace");
  });

  test("a console behind the host router reads the host portfolio, and falls back to the workspace forecast", async () => {
    const hosted = recorder({ "/host/api/portfolio/forecast": { workspaceCount: 1, rows: [{ workspaceId: "ws-host", forecast: {} }] } });
    const root = { innerHTML: "" };
    await renderPortfolioForecastPage({ root, card, apiGet: hosted.apiGet, pathname: HOSTED });
    expect(hosted.calls).toEqual(["/host/api/portfolio/forecast"]);
    expect(root.innerHTML).toContain("ws-host");
    const refused = recorder({ "/forecast/latest?scope=workspace": latest });
    await renderPortfolioForecastPage({ root, card, apiGet: refused.apiGet, pathname: HOSTED });
    expect(refused.calls).toEqual(["/host/api/portfolio/forecast", "/forecast/latest?scope=workspace"]);
    expect(root.innerHTML).toContain("Current Workspace");
  });

  test("the bench portfolio probes the host router only behind it, and reads its rows", async () => {
    const single = recorder({});
    expect(await loadBenchPortfolio(single.apiGet, "/console/benchPortfolio")).toEqual({ rows: [] });
    expect(single.calls).toEqual([]);
    const rows = [{ workspaceId: "ws-1", bench: { hasComparison: true } }];
    const hosted = recorder({ "/host/api/bench/portfolio": { workspaceCount: 1, rows } });
    expect(await loadBenchPortfolio(hosted.apiGet, "/w/ws-1/console/benchPortfolio")).toEqual({ workspaceCount: 1, rows });
    expect(hosted.calls).toEqual(["/host/api/bench/portfolio"]);
    expect(await loadBenchPortfolio(recorder({}).apiGet, "/w/ws-1/console/benchPortfolio")).toEqual({ rows: [] });
  });
});
