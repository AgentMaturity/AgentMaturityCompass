import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { renderWebsiteFiles } from "../scripts/gen-website-packs.mjs";
import { complianceFrameworkFamilies } from "../src/compliance/frameworks.js";

const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");
const visible = (html: string): string => html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

describe("the industry pages", () => {
  const files = renderWebsiteFiles();
  const pages = [...files.keys()].filter((name) => name.startsWith("station-"));

  test("all seven are exactly what the pack registry renders (npm run gen-website-packs)", () => {
    expect(pages).toHaveLength(7);
    for (const name of pages) expect(read(`website/${name}`), name).toBe(files.get(name));
  });

  test("each lists every pack of its station with its rules and risks, on the home design, with no hot-linked images", () => {
    const data = JSON.parse(read("website/industry-packs.json")) as {
      stations: Array<{ id: string; packs: Array<{ id: string; rules: string[]; risks: string[] }> }>;
    };
    for (const station of data.stations) {
      const html = read(`website/station-${station.id}.html`);
      expect(html).toContain('href="home.css?v=6"');
      expect(html).toContain('src="script.js?v=14"');
      expect(html).toContain('href="station-pages.css?v=1"');
      expect(html).not.toMatch(/unsplash|(?:<img[^>]*\ssrc=|url\()["']?https?:/i);
      for (const pack of station.packs) {
        expect(html, pack.id).toContain(`id="pack-${pack.id}"`);
        expect(html.match(new RegExp(`id="pack-${pack.id}"[\\s\\S]*?</article>`))?.[0].match(/<li>/g)?.length, pack.id)
          .toBe(pack.rules.length + pack.risks.length);
      }
      const text = visible(html);
      for (const caveat of ["experimental", "AI-drafted", "self-reported", "Not legal advice"]) expect(text, station.id).toContain(caveat);
    }
  });
});

describe("the methodology and frameworks pages", () => {
  test("state the real number of frameworks", () => {
    const count = `${complianceFrameworkFamilies.length} frameworks`;
    expect(visible(read("website/methodology.html"))).toContain(count);
    expect(visible(read("website/compliance.html"))).toContain(`The ${count}`);
    expect(read("website/compliance.html").match(/<ul class="dots fw-list">([\s\S]*?)<\/ul>/)?.[1].match(/<li>/g)).toHaveLength(complianceFrameworkFamilies.length);
  });

  test("never present L4 or L5 as reachable, nor the trust weights as setting the level", () => {
    const text = visible(read("website/methodology.html"));
    expect(text).toContain("No question can reach L3, L4 or L5 yet");
    expect(text).not.toMatch(/OBSERVED_HARDENED|1\.1×|0\.4×/);
    expect(text).toContain("They do not set a question's level");
    expect(text).not.toContain("the lowest level");
    expect(text).toContain("can reach L1 at most");
    expect(visible(read("website/compliance.html"))).not.toMatch(/L4.{0,4}L5[^.]*(?:MANAGED|Stronger checks)/);
  });
});
