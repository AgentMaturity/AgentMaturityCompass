/**
 * Console page basics (LIVE-UX-05). score.html had no viewport meta (it rendered 980 px wide on a phone), no <main> and
 * no way back, and Home's first quick action promised it "runs diagnostics" while the page only lists CLI commands.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const pages = readdirSync("src/console/pages").filter((file) => file.endsWith(".html"));

describe("every console page", () => {
  test.each(pages)("%s has a viewport meta, lang, a title and a <main>", (file) => {
    const html = readFileSync(`src/console/pages/${file}`, "utf8");
    expect(html).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1"/);
    expect(html).toMatch(/<html lang="en"/);
    expect(html).toMatch(/<title>[^<]*\S[^<]*<\/title>/);
    expect(html).toMatch(/<main[\s>]/);
  });
});

describe("the scoring commands page", () => {
  const score = readFileSync("src/console/pages/score.html", "utf8");

  test("names Studio, links home first and says where results appear", () => {
    expect(score).toContain("<title>Maturity score · Compass Console</title>");
    const main = score.slice(score.indexOf("<main>"));
    expect(main.indexOf('<a href="./home">')).toBeGreaterThan(-1);
    expect(main.indexOf('<a href="./home">')).toBeLessThan(main.indexOf("<h2>"));
    expect(main).toContain("Scores run in the terminal; this page lists the commands.");
    // The audit found it sending people to dashboard.html (a stale copy of Home); a saved run shows on the Agent page.
    expect(main).toContain('its result appears on the <a href="./agent">Agent</a> page');
    expect(score).not.toContain("./dashboard");
  });

  test("has the shared shell (nav, top bar via app.js), no emoji and no stale app.js query", () => {
    expect(score).toContain('<body data-page="score">');
    expect(score).toContain("<nav>");
    expect(score).toContain('<div id="app">');
    expect(score).toMatch(/<script type="module" src="\.\/assets\/app\.js\?v=\d{8}[a-z]+"><\/script>/);
    expect(score).not.toContain("20260711a");
    expect(score).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(readFileSync("src/console/assets/app.js", "utf8")).toContain('if (page === "score") return;');
  });

  test("Home's quick action calls it scoring commands, not diagnostics", () => {
    const app = readFileSync("src/console/assets/app.js", "utf8");
    const card = app.match(/<a class="quick-action-card" href="\.\/score">.*?<\/a>/)?.[0] ?? "";
    expect(card).toContain("<em>scoring commands</em>");
    expect(card).not.toContain("run diagnostics");
  });
});

// LIVE-UX-12: one wrong precache path makes cache.addAll reject and the service worker never installs.
describe("service worker precache", () => {
  const worker = readFileSync("src/console/assets/sw.js", "utf8");
  const entries = [...worker.matchAll(/assetPath\("([^"]*)"\)/g)].map((match) => match[1]!);

  test("every precached asset exists", () => {
    const assets = entries.filter((entry) => entry.includes("assets/"));
    expect(assets.length).toBeGreaterThan(10);
    for (const entry of assets) expect(existsSync(`src/console/${entry}`), entry).toBe(true);
  });

  test("the shell, sign-in and round-2 modules are precached", () => {
    for (const name of ["assets/focusableScroll.js", "assets/industryPackView.js", "assets/ops.js", "assets/components/claimBadge.js",
      "assets/shell.js", "assets/loginView.js"]) expect(entries, name).toContain(name);
  });

  test("the cache name moved past v12, so upgraded consoles drop the old entries", () => {
    expect(worker).toMatch(/const CACHE_NAME = "amc-console-v1[3-9]";/);
  });
});
