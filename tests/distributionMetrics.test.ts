import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { GITHUB_RELEASES, NPM_LAST_WEEK, runDistributionMetrics } from "../scripts/distribution-metrics.mjs";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const NOW = () => new Date("2026-10-19T06:00:00Z");
const NPM_BODY = { downloads: 123, start: "2026-10-12", end: "2026-10-18", package: "agent-maturity-compass" };
const release = (tag: string, counts: number[]) => ({ tag_name: tag, assets: counts.map((download_count, i) => ({ name: `a${i}`, download_count })) });

type Reply = { status: number; body?: unknown } | Error;
function fakeFetch(replies: Record<string, Reply>) {
  const seen: string[] = [];
  const fetch = async (url: string) => {
    seen.push(url);
    const reply = replies[url] ?? { status: 404 };
    if (reply instanceof Error) throw reply;
    return { status: reply.status, json: async () => reply.body };
  };
  return { fetch, seen };
}
const page = (n: number) => `${GITHUB_RELEASES}?per_page=100&page=${n}`;

describe("distribution metrics (P1-41)", () => {
  test("fixture npm and GitHub responses give the expected dated row, with asset counts summed per release", async () => {
    const { fetch } = fakeFetch({
      [NPM_LAST_WEEK]: { status: 200, body: NPM_BODY },
      [page(1)]: { status: 200, body: [release("v2.0.1", [3, 4]), release("v2.0.0", [10, 20, 30])] }
    });
    const result = await runDistributionMetrics({ fetch, now: NOW });
    expect(result.row).toBe("| 2026-10-19 | 123 (2026-10-12 to 2026-10-18) | 67 (v2.0.1 7; v2.0.0 60) |");
    expect(result.exitCode).toBe(0);
    expect(result.entry).toEqual({
      recordedAt: "2026-10-19T06:00:00.000Z",
      npm: { status: "measured", downloadsLastWeek: 123, start: "2026-10-12", end: "2026-10-18", source: NPM_LAST_WEEK },
      githubReleaseAssets: { status: "measured", cumulative: true, total: 67,
        releases: [{ tag: "v2.0.1", downloads: 7 }, { tag: "v2.0.0", downloads: 60 }], source: GITHUB_RELEASES }
    });
  });

  test("a non-200 npm response says not measured, never a number, and the exit code is 1", async () => {
    const { fetch } = fakeFetch({ [NPM_LAST_WEEK]: { status: 503 }, [page(1)]: { status: 200, body: [release("v2.0.0", [5])] } });
    const result = await runDistributionMetrics({ fetch, now: NOW });
    expect(result.row).toBe("| 2026-10-19 | not measured (HTTP 503) | 5 (v2.0.0 5) |");
    expect(result.entry.npm).toEqual({ status: "not measured", reason: "HTTP 503", source: NPM_LAST_WEEK });
    expect(result.exitCode).toBe(1);
  });

  test("an unreachable endpoint or an unexpected body is not measured too", async () => {
    const { fetch } = fakeFetch({ [NPM_LAST_WEEK]: { status: 200, body: { downloads: "lots" } }, [page(1)]: new Error("getaddrinfo ENOTFOUND") });
    const result = await runDistributionMetrics({ fetch, now: NOW });
    expect(result.row).toBe("| 2026-10-19 | not measured (unexpected response) | not measured (getaddrinfo ENOTFOUND) |");
    expect(result.exitCode).toBe(1);
  });

  test("follows release pages until a short page", async () => {
    const full = Array.from({ length: 100 }, (_, i) => release(`v1.0.${i}`, [1]));
    const { fetch, seen } = fakeFetch({
      [NPM_LAST_WEEK]: { status: 200, body: NPM_BODY },
      [page(1)]: { status: 200, body: full }, [page(2)]: { status: 200, body: [release("v0.9.0", [2])] }
    });
    const result = await runDistributionMetrics({ fetch, now: NOW });
    expect(seen).toEqual([NPM_LAST_WEEK, page(1), page(2)]);
    expect(result.entry.githubReleaseAssets.total).toBe(102);
  });

  test("--write appends the entry to docs/program/distribution-metrics.json, also when a figure is not measured", async () => {
    const root = mkdtempSync(join(tmpdir(), "amc-distribution-"));
    dirs.push(root);
    const { fetch } = fakeFetch({ [NPM_LAST_WEEK]: { status: 200, body: NPM_BODY }, [page(1)]: { status: 500 } });
    await runDistributionMetrics({ fetch, now: NOW, root, write: true });
    await runDistributionMetrics({ fetch, now: NOW, root, write: true });
    const file = JSON.parse(readFileSync(join(root, "docs", "program", "distribution-metrics.json"), "utf8"));
    expect(file.schemaVersion).toBe(1);
    expect(file.entries).toHaveLength(2);
    expect(file.entries[1].githubReleaseAssets).toEqual({ status: "not measured", reason: "HTTP 500", source: GITHUB_RELEASES });
  });
});
