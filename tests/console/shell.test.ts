/**
 * LIVE-UX-02/03: the console's shared shell. 13 console pages with a <nav> load a script other than app.js, so the phone
 * menu toggle that only app.js created never reached them (no navigation at all on a phone), and the "Unified Clarity
 * loading…" placeholder stayed on every page that never loads the banner.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { CANONICAL_NAV, canonicalNavHtml, decorateNav, initShell, renderCanonicalNav, renderTopbar, topbarHtml } from "../../src/console/assets/shell.js";
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

  test("puts one skip link to the page's main content first in the body (M10, L7)", () => {
    const doc = new FakeDocument();
    pageWithNav(doc, ["./home"], "home");
    initShell(doc);
    initShell(doc);
    const links = doc.querySelectorAll("a.skip-link");
    expect(links).toHaveLength(1);
    expect(doc.body.children[0]).toBe(links[0]);
    const target = links[0]!.getAttribute("href")!.slice(1);
    expect(doc.querySelector("main")!.getAttribute("id")).toBe(target);
    expect(doc.querySelector("main")!.getAttribute("tabindex")).toBe("-1");
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
    expect(navPages).toContain("ops.html"); // C-07: Maintenance (ops) is on the console shell now
    for (const file of navPages) {
      const html = readFileSync(`src/console/pages/${file}`, "utf8");
      // pageTransition.js is the one classic <head> script (it must run before the first frame), not a page module.
      const scripts = [...html.matchAll(/src="\.\/assets\/([\w/-]+\.js)(?:\?v=[^"]*)?"/g)].map((match) => match[1]!)
        .filter((script) => script !== "pageTransition.js");
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

// LIVE-UX-06: 38 different menus across the console's pages; one canonical menu now, each page's own links kept.
describe("canonical navigation", () => {
  type NavLink = { href: string; label: string; id?: string; hidden?: boolean; group?: string };
  const api = { CANONICAL_NAV, canonicalNavHtml, renderCanonicalNav } as unknown as { CANONICAL_NAV?: NavLink[]; canonicalNavHtml?: (extra: NavLink[]) => string;
    renderCanonicalNav?: (nav: FakeElement) => void };
  const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]!);

  test("canonicalNavHtml lists the primary links in plain words, then All features under short headings", () => {
    const html = api.canonicalNavHtml?.([]) ?? "";
    expect(hrefs(html)[0]).toBe("./home");
    const primary = (api.CANONICAL_NAV ?? []).filter((link) => !link.group).map((link) => link.label);
    expect(primary).toEqual(["Home", "Build an agent", "Run a task", "My agent", "Records", "Approvals", "Industry Packs", "Live runs", "Sign in"]);
    expect(html).toContain('<a href="./a4" id="a4NavLink">Build an agent</a>');
    expect(html).toContain('<details class="nav-features"><summary>All features</summary><p class="nav-section">');
    for (const heading of ["Rules and limits", "Watch and review", "Teams and many agents", "Workspace"]) expect(html).toContain(`<p class="nav-section">${heading}</p>`);
    expect(html).not.toMatch(/>Login|>A4<|>Native Tasks</);
    // Sentence case: no label is all lowercase or all uppercase.
    for (const link of api.CANONICAL_NAV ?? []) expect(link.label[0], link.label).toBe(link.label[0]!.toUpperCase());
    expect(html).not.toContain("More pages");
    expect(hrefs(html)).toHaveLength(32);
    expect(html).not.toMatch(/\son[a-z]+\s*=|javascript:/i);
  });

  test("a page's own links go under More pages, once each, never duplicating a canonical link", () => {
    const html = api.canonicalNavHtml?.([{ href: "./home", label: "Home" }, { href: "./assuranceRun", label: "Run Detail" },
      { href: "./assuranceRun.html", label: "Run Detail again" }, { href: "./evidence?agent=x", label: "Evidence" }]) ?? "";
    expect(html).toContain('<details class="nav-features" open><summary>More pages</summary><a href="./assuranceRun">Run Detail</a></details>');
    expect(hrefs(html).filter((href) => href === "./home")).toHaveLength(1);
    expect(hrefs(html).filter((href) => href.startsWith("./assuranceRun"))).toHaveLength(1);
    expect(hrefs(html).filter((href) => href.startsWith("./evidence"))).toHaveLength(1);
  });

  test("renderCanonicalNav renders once, keeps the heading, and decorateNav still finds one toggle", () => {
    const doc = new FakeDocument();
    const nav = pageWithNav(doc, ["./home", "./assurance", "./assuranceRun"], "assuranceRun");
    api.renderCanonicalNav?.(nav);
    const first = nav.querySelectorAll("a").length;
    expect(nav.dataset.canonical).toBe("1");
    expect(nav.children[0]!.tagName).toBe("H1");
    // a4.js hides the A4 link when the preview is off; a second render must not show it again.
    nav.querySelector("#a4NavLink")!.setAttribute("hidden", "");
    api.renderCanonicalNav?.(nav);
    expect(nav.querySelector("#a4NavLink")!.hasAttribute("hidden")).toBe(true);
    expect(nav.querySelectorAll("a")).toHaveLength(first);
    expect(first).toBe(34);
    initShell(doc);
    expect(nav.querySelectorAll("a")).toHaveLength(first);
    expect(nav.querySelectorAll(".mobile-nav-toggle")).toHaveLength(1);
    expect(nav.querySelector("a.active")!.getAttribute("href")).toBe("./assuranceRun");
  });

  test("initShell gives a page with its own short menu the canonical one, its links under More pages", () => {
    const doc = new FakeDocument();
    const nav = pageWithNav(doc, ["./home", "./assurance", "./assuranceRun"], "assuranceRun");
    initShell(doc);
    expect(nav.dataset.canonical).toBe("1");
    expect(nav.querySelectorAll("a")).toHaveLength(34);
    const section = nav.querySelectorAll("details").find((details) => details.textContent.startsWith("More pages"))!;
    expect(section.querySelectorAll("a").map((anchor) => anchor.getAttribute("href"))).toEqual(["./assurance", "./assuranceRun"]);
    expect(section.open).toBe(true);
  });

  test("every canonical link names an existing console page", () => {
    expect(api.CANONICAL_NAV?.length).toBe(32);
    for (const link of api.CANONICAL_NAV ?? []) {
      expect(existsSync(`src/console/pages/${link.href.replace(/^\.\//, "")}.html`), link.href).toBe(true);
    }
  });

  test("no page loses a link of its static menu", () => {
    const navPages = readdirSync("src/console/pages").filter((file) => readFileSync(`src/console/pages/${file}`, "utf8").includes("<nav"));
    let missing = 0;
    for (const file of navPages) {
      const markup = readFileSync(`src/console/pages/${file}`, "utf8").match(/<nav[\s\S]*?<\/nav>/)![0];
      const doc = new FakeDocument();
      doc.body.insertAdjacentHTML("beforeend", markup);
      const nav = doc.querySelector("nav")!;
      const before = nav.querySelectorAll("a").map((anchor) => anchor.getAttribute("href")!.replace(/\.html$/, ""));
      api.renderCanonicalNav?.(nav);
      const after = new Set(nav.querySelectorAll("a").map((anchor) => anchor.getAttribute("href")!));
      const lost = before.filter((href) => !after.has(href));
      missing += lost.length;
      expect(lost, file).toEqual([]);
    }
    expect(navPages.length).toBeGreaterThan(60);
    expect(missing).toBe(0);
  });

  test("styles.css hides a hidden nav link even where nav a sets display", () => {
    const styles = readFileSync("src/console/assets/styles.css", "utf8");
    expect(styles).toMatch(/nav a\[hidden\]\s*\{\s*display:\s*none !important;\s*\}/);
  });
});

// LIVE-UX-17: the only Logout button was on the Leases page; the top bar offers Sign out once someone is signed in.
describe("topbarHtml", () => {
  const topbar = topbarHtml as unknown as (options: Record<string, unknown>) => string;

  test("shows Sign out, as a plain button, only when a user is signed in", () => {
    const signedIn = topbar({ me: { username: "a" } });
    expect(signedIn).toMatch(/<button id="signOutBtn" type="button"[^>]*>Sign out<\/button>/);
    expect(topbar({ me: null })).not.toContain("Sign out");
    expect(topbar({})).not.toContain("Sign out");
  });

  test("keeps the workspace label escaped and the existing shortcuts, with no inline handler", () => {
    const html = topbar({ workspace: "<acme>", demoMode: false, me: { username: "a" } });
    expect(html).toContain("/ &lt;acme&gt; workspace");
    expect(html).toContain('href="./evidence"');
    expect(html).toContain('href="./native-tasks?agent=default&amp;sample=1">Run a task</a>');
    expect(html).not.toContain("Open Standard");
    expect(html).toContain("session protected");
    expect(topbar({ demoMode: true })).toContain("local demo session");
    for (const variant of [html, topbar({ me: null }), topbar({ demoMode: true })]) expect(variant).not.toMatch(/\son[a-z]+\s*=|javascript:/i);
  });

  test("app.js renders the top bar through renderTopbar, refreshes it after sign-in and wires Sign out to logout then the login page", () => {
    const app = readFileSync("src/console/assets/app.js", "utf8");
    const shellFn = app.slice(app.indexOf("function decorateShell()"), app.indexOf("\n}\n", app.indexOf("function decorateShell()")));
    expect(shellFn).toMatch(/renderTopbar\(document, getCurrentUser\(\), \(\) => logout\(\)[\s\S]*"\.\/login"[\s\S]*currentAgent\(\)\)/);
    const render = app.slice(app.indexOf("async function renderPage()"));
    expect(render.indexOf("decorateShell();", render.indexOf("ensureAuthenticated()"))).toBeGreaterThan(-1);
    expect(render.indexOf("decorateShell();", render.indexOf("ensureAuthenticated()"))).toBeLessThan(render.indexOf("const me = getCurrentUser();"));
  });
});

// C-15: pages with their own script (Benchmarks, Mechanic, Simulator, operator pages, ...) had no top bar, because only
// app.js and a4.js drew it. api.js now draws it whenever it learns who is signed in, through one shared function.
describe("renderTopbar", () => {
  const draw = renderTopbar as unknown as (doc: FakeDocument, me: unknown, onSignOut?: () => void, agent?: string) => void;

  test("puts one top bar first in main, redraws it in place, keeps the agent and wires Sign out", () => {
    const doc = new FakeDocument();
    pageWithNav(doc, ["./home"]);
    let signedOut = 0;
    draw(doc, null, undefined, "bot-1");
    draw(doc, { username: "a" }, () => { signedOut += 1; });
    const bars = doc.querySelectorAll(".topbar");
    expect(bars).toHaveLength(1);
    expect(bars[0]!.dataset.agent).toBe("bot-1");
    expect(bars[0]!.querySelector("#topbarPrimaryAction")!.getAttribute("href")).toContain("agent=bot-1");
    for (const listener of bars[0]!.querySelector("#signOutBtn")!.listeners.get("click") ?? []) listener({} as never);
    expect(signedOut).toBe(1);
  });

  test("draws nothing on a page without a menu, and api.js draws it whenever it learns who is signed in", () => {
    const doc = new FakeDocument();
    doc.body.appendChild(doc.el("main", {}, [doc.el("p", { id: "status" }, "")]));
    draw(doc, { username: "a" });
    expect(doc.querySelectorAll(".topbar")).toHaveLength(0);
    const api = readFileSync("src/console/assets/api.js", "utf8");
    const whoami = api.slice(api.indexOf("export async function whoami()"), api.indexOf("export async function apiGet"));
    expect(whoami).toContain('if (!document.querySelector("main .topbar")) renderTopbar(document, state.me, signOut);');
  });
});
