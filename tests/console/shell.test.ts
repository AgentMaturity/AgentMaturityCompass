/**
 * LIVE-UX-02/03: the console's shared shell. 13 console pages with a <nav> load a script other than app.js, so the phone
 * menu toggle that only app.js created never reached them (no navigation at all on a phone), and the "Unified Clarity
 * loading…" placeholder stayed on every page that never loads the banner.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { decorateNav, initShell } from "../../src/console/assets/shell.js";
import { FakeDocument, type FakeElement } from "./fakeDom.js";

function pageWithNav(doc: FakeDocument, hrefs: string[], page = ""): FakeElement {
  const nav = doc.el("nav", {}, [doc.el("h1", {}, "amc"), ...hrefs.map((href) => doc.el("a", { href }, href.slice(2)))]);
  doc.body.appendChild(doc.el("div", { class: "shell" }, [nav, doc.el("main", {}, [
    doc.el("div", { id: "ucBanner", class: "card banner muted" }, "Unified Clarity loading…"),
    doc.el("p", { id: "status", class: "muted" }, "Authentication required.")
  ])]));
  if (page) doc.body.dataset.page = page;
  return nav;
}

describe("decorateNav", () => {
  test("adds one phone menu toggle and marks the current page's link", () => {
    const doc = new FakeDocument();
    const nav = pageWithNav(doc, ["./home", "./a4"]);
    decorateNav(nav, "a4");
    const toggles = nav.querySelectorAll("button.mobile-nav-toggle");
    expect(toggles).toHaveLength(1);
    expect(toggles[0]!.getAttribute("type")).toBe("button");
    expect(toggles[0]!.getAttribute("aria-expanded")).toBe("false");
    expect(toggles[0]!.getAttribute("aria-controls")).toBe(nav.id);
    expect(nav.id).not.toBe("");
    const [home, a4] = nav.querySelectorAll("a");
    expect(a4!.getAttribute("aria-current")).toBe("page");
    expect(a4!.classList.contains("active")).toBe(true);
    expect(home!.hasAttribute("aria-current")).toBe(false);
    expect(home!.classList.contains("active")).toBe(false);
  });

  test("is idempotent: a second call adds no toggle and keeps the open menu open", () => {
    const doc = new FakeDocument();
    const nav = pageWithNav(doc, ["./home", "./a4"]);
    decorateNav(nav, "a4");
    decorateNav(nav, "a4");
    expect(nav.querySelectorAll(".mobile-nav-toggle")).toHaveLength(1);
    const toggle = nav.querySelector(".mobile-nav-toggle")!;
    toggle.click();
    expect(nav.classList.contains("mobile-nav-open")).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    decorateNav(nav, "home");
    expect(nav.querySelectorAll(".mobile-nav-toggle")).toHaveLength(1);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(nav.querySelectorAll("a")[0]!.getAttribute("aria-current")).toBe("page");
    expect(nav.querySelectorAll("a")[1]!.hasAttribute("aria-current")).toBe(false);
    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("initShell", () => {
  test.each(["Unified Clarity loading…", "Unified Clarity loading..."])("hides the banner placeholder %j until content is written", (text) => {
    const doc = new FakeDocument();
    pageWithNav(doc, ["./home"], "home");
    doc.getElementById("ucBanner")!.textContent = text;
    initShell(doc);
    expect(doc.getElementById("ucBanner")!.hidden).toBe(true);
  });

  test("announces the status line, keeps a role a page already set, and decorates the nav", () => {
    const doc = new FakeDocument();
    pageWithNav(doc, ["./home", "./evidence"], "evidence");
    initShell(doc);
    expect(doc.getElementById("status")!.getAttribute("role")).toBe("status");
    expect(doc.querySelectorAll(".mobile-nav-toggle")).toHaveLength(1);
    expect(doc.querySelector("nav")!.querySelector("a.active")!.getAttribute("href")).toBe("./evidence");
    const other = new FakeDocument();
    pageWithNav(other, ["./home"], "home");
    other.getElementById("status")!.setAttribute("role", "alert");
    initShell(other);
    expect(other.getElementById("status")!.getAttribute("role")).toBe("alert");
  });

  test("falls back to the last path segment when the body names no page, and skips a page without a nav", () => {
    const doc = new FakeDocument();
    doc.location.pathname = "/w/acme/console/upgradeWizard";
    pageWithNav(doc, ["./home", "./upgradeWizard"]);
    initShell(doc);
    expect(doc.querySelector("a.active")!.getAttribute("href")).toBe("./upgradeWizard");
    const bare = new FakeDocument();
    bare.body.appendChild(bare.el("main", {}, [bare.el("p", { id: "status" }, "")]));
    expect(() => initShell(bare)).not.toThrow();
    expect(bare.querySelectorAll(".mobile-nav-toggle")).toHaveLength(0);
    expect(bare.getElementById("status")!.getAttribute("role")).toBe("status");
  });
});

describe("every console page with a nav reaches the shell", () => {
  const assets = "src/console/assets";
  const reachesShell = (script: string): boolean => script === "app.js" || script === "api.js"
    || /from\s+["']\.\/(?:api|shell)\.js["']|import\s+["']\.\/(?:api|shell)\.js["']/.test(readFileSync(`${assets}/${script}`, "utf8"));

  test("api.js imports the shell module first", () => {
    const api = readFileSync(`${assets}/api.js`, "utf8");
    expect(api.split("\n").find((line) => line.startsWith("import "))).toBe('import "./shell.js";');
  });

  test("each nav page's scripts are app.js, api.js or a module that imports api.js or shell.js", () => {
    const navPages = readdirSync("src/console/pages").filter((file) => readFileSync(`src/console/pages/${file}`, "utf8").includes("<nav"));
    expect(navPages.length).toBeGreaterThan(60);
    expect(navPages).not.toContain("ops.html");
    expect(navPages).not.toContain("score.html");
    for (const file of navPages) {
      const html = readFileSync(`src/console/pages/${file}`, "utf8");
      const scripts = [...html.matchAll(/src="\.\/assets\/([\w/-]+\.js)(?:\?v=[^"]*)?"/g)].map((match) => match[1]!);
      expect(scripts.length, file).toBeGreaterThan(0);
      for (const script of scripts) {
        expect(existsSync(`${assets}/${script}`), `${file} ${script}`).toBe(true);
        expect(reachesShell(script), `${file} loads ${script}, which bypasses api.js and shell.js`).toBe(true);
      }
    }
  });
});

describe("app.js shows the Unified Clarity banner only with content", () => {
  test("refreshUnifiedBanner unhides the banner on each of its three content paths", () => {
    const app = readFileSync("src/console/assets/app.js", "utf8");
    const body = app.match(/async function refreshUnifiedBanner\(\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(body).toContain("Unified Clarity (Offline Snapshot)");
    expect(body.match(/bannerEl\.hidden = false;/g) ?? []).toHaveLength(3);
    // Each unhide sits right after a content write.
    expect(body.match(/bannerEl\.innerHTML = [\s\S]*?bannerEl\.hidden = false;/g) ?? []).toHaveLength(3);
  });

  test("app.js's decorateShell delegates the nav to the shell instead of building its own toggle", () => {
    const app = readFileSync("src/console/assets/app.js", "utf8");
    expect(app).toContain('from "./shell.js"');
    expect(app).not.toContain("mobile-nav-toggle");
    expect(app).toMatch(/decorateNav\(/);
  });
});
