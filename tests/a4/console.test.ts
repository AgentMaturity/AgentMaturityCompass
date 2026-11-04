/**
 * P1-58 debt (pending-checks.md): the Studio A4 pages' pure helpers in src/console/assets/a4View.js refuse what the
 * page must never apply, and the service worker precaches both A4 pages.
 */
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";
import { mergeOnTop, renderMissing, validateA4Poll } from "../../src/console/assets/a4View.js";

const page = (over: Record<string, unknown> = {}) => ({ events: [{ cursor: 5 }, { cursor: 6 }], presence: [], nextCursor: 7, firstCursor: 0,
  droppedEvents: 0, head: { headSeq: 6 }, ...over });
const current = { projectId: "p-1", headSeq: 4 };

describe("validateA4Poll", () => {
  test("accepts a well-formed page and keeps only events at or after the cursor", () => {
    expect(validateA4Poll(page(), current, 6)).toMatchObject({ nextCursor: 7, events: [{ cursor: 6 }] });
  });
  test("refuses a head that regresses", () => {
    expect(() => validateA4Poll(page({ head: { headSeq: 3 } }), current, 5)).toThrow(/head moved backwards/);
  });
  test("refuses a head that names another project", () => {
    expect(() => validateA4Poll(page({ head: { headSeq: 6, projectId: "p-2" } }), current, 5)).toThrow(/changed identity/);
  });
  test("refuses a cursor that moves backwards", () => {
    expect(() => validateA4Poll(page({ nextCursor: 4, events: [] }), current, 5)).toThrow(/cursor moved backwards/);
  });
  test("refuses out-of-order events", () => {
    expect(() => validateA4Poll(page({ events: [{ cursor: 6 }, { cursor: 5 }] }), current, 5)).toThrow(/out-of-order/);
    expect(() => validateA4Poll(page({ events: [{ cursor: 5 }, { cursor: 5 }] }), current, 5)).toThrow(/out-of-order/);
  });
});

describe("applyChanges (through mergeOnTop)", () => {
  test.each(["__proto__", "constructor", "prototype"])("refuses the reserved key %s", (key) => {
    expect(() => mergeOnTop({ a: 1 }, [{ path: [key, "polluted"], after: true }], {}, [])).toThrow(/reserved key name/);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  test("applies an ordinary change on top of the head", () => {
    expect(mergeOnTop({ a: 1, b: 2 }, [{ path: ["b"], after: 3 }], { b: 3 }, [])).toEqual({ a: 1, b: 3 });
  });
});

describe("nextAction route allowlist (renderMissing)", () => {
  const html = (route: string) => renderMissing({ status: "BLOCKED", items: [], allowed: {}, nextAction: { label: "Go", route } }, "aspire");
  test("a same-origin relative route is a link", () => {
    expect(html("/console/a4Project?id=p-1")).toContain('href="/console/a4Project?id=p-1"');
  });
  test.each(["javascript:alert(1)", "JavaScript:alert(1)", "//evil.example/x", "https://evil.example/", "data:text/html,x"])(
    "refuses %s as a link", (route) => {
      const out = html(route);
      expect(out).not.toContain("href=");
      expect(out).toContain("<strong>Go</strong>");
    });
});

test("sw.js precaches both A4 pages", () => {
  const source = readFileSync("src/console/assets/sw.js", "utf8");
  const self = { registration: { scope: "https://studio.example/console/" }, addEventListener: () => {} };
  const assets = runInNewContext(`${source}\nstaticAssets();`, { self, URL }) as string[];
  expect(assets).toEqual(expect.arrayContaining(["/console/a4", "/console/a4Project"]));
});
