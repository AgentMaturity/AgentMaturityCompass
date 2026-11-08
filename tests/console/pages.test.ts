/**
 * Console page basics (LIVE-UX-05). score.html had no viewport meta (it rendered 980 px wide on a phone), no <main> and
 * no way back, and Home's first quick action promised it "runs diagnostics" while the page only lists CLI commands.
 */
import { readdirSync, readFileSync } from "node:fs";
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
    expect(score).toContain("<title>Maturity Score - AMC Studio</title>");
    const main = score.slice(score.indexOf("<main>"));
    expect(main.indexOf('<a href="./home">')).toBeGreaterThan(-1);
    expect(main.indexOf('<a href="./home">')).toBeLessThan(main.indexOf("<h1>"));
    expect(main).toContain("Scores run in the terminal; this page lists the commands.");
    expect(main).toContain('<a href="./dashboard">Dashboard</a>');
  });

  test("Home's quick action calls it scoring commands, not diagnostics", () => {
    const app = readFileSync("src/console/assets/app.js", "utf8");
    const card = app.match(/<a class="quick-action-card" href="\.\/score">.*?<\/a>/)?.[0] ?? "";
    expect(card).toContain("<em>scoring commands</em>");
    expect(card).not.toContain("run diagnostics");
  });
});
