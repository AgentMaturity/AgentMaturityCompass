/**
 * LIVE-UX-02/03: the console's shared shell. 13 console pages with a <nav> load a script other than app.js, so the phone
 * menu toggle that only app.js created never reached them (no navigation at all on a phone), and the "Unified Clarity
 * loading…" placeholder stayed on every page that never loads the banner.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, test } from "vitest";
import { CANONICAL_NAV, PAGE_NAMES, canonicalNavHtml, decorateNav, initShell, isSessionLine, renderCanonicalNav, renderNavSession, renderTopbar, reportNoAnswer, topbarHtml } from "../../src/console/assets/shell.js";
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

  // The studio-ui redesign: the rail's order (Approvals before Records), an icon and a label per link, the first five
  // as the phone tab bar, and every other page under "More" with a filter.
  test("canonicalNavHtml lists the primary links in plain words, then More with every other page under short headings", () => {
    const html = api.canonicalNavHtml?.([]) ?? "";
    expect(hrefs(html)[0]).toBe("./home");
    const primary = (api.CANONICAL_NAV ?? []).filter((link) => !link.group).map((link) => link.label);
    expect(primary).toEqual(["Home", "Build an agent", "Run a task", "My agent", "Approvals", "Records", "Industry Packs", "Live runs", "Sign in"]);
    expect(html).toMatch(/<a href="\.\/a4" id="a4NavLink" class="nav-tab" title="Build an agent"><svg [^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/svg><span class="nav-label">Build an agent<\/span>/);
    expect(html.match(/class="nav-tab"/g) ?? []).toHaveLength(5);
    expect(html).toContain('<details class="nav-features nav-more"><summary>');
    expect(html).toContain('<span class="nav-label">More</span></summary><div class="more-panel"><input type="search" class="more-filter"');
    expect(html).toContain('<div class="more-group"><p class="nav-section">Rules and limits</p>');
    for (const heading of ["Rules and limits", "Watch and review", "Teams and many agents", "Workspace"]) expect(html).toContain(`<p class="nav-section">${heading}</p>`);
    expect(html).not.toMatch(/>Login|>A4<|>Native Tasks</);
    // Sentence case: no label is all lowercase or all uppercase.
    for (const link of api.CANONICAL_NAV ?? []) expect(link.label[0], link.label).toBe(link.label[0]!.toUpperCase());
    expect(html).not.toContain("More pages");
    expect(hrefs(html)).toHaveLength(32);
    // The person is drawn at the foot of the rail, after the theme switch, and comes last for the keyboard too.
    expect(html.indexOf('href="./login"')).toBeGreaterThan(html.indexOf('class="rail-foot"'));
    expect(html).not.toMatch(/\son[a-z]+\s*=|javascript:/i);
  });

  test("a page's own links go under More pages, once each, never duplicating a canonical link", () => {
    const html = api.canonicalNavHtml?.([{ href: "./home", label: "Home" }, { href: "./assuranceRun", label: "Run Detail" },
      { href: "./assuranceRun.html", label: "Run Detail again" }, { href: "./evidence?agent=x", label: "Evidence" }]) ?? "";
    // studio-ui inherit slice: a page known to PAGE_NAMES is named as its own <title> names it, not by the static link's words.
    expect(html).toMatch(/<details class="nav-features nav-pages" open><summary><svg [\s\S]*?<\/svg><span class="nav-label">More pages<\/span><\/summary><a href="\.\/assuranceRun" title="Assurance run">[\s\S]*?<span class="nav-label">Assurance run<\/span><\/a><\/details>/);
    expect(canonicalNavHtml([{ href: "./not-a-page", label: "Own words" }])).toContain('<span class="nav-label">Own words</span>');
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

// LIVE-UX-17 then the studio-ui redesign: the top bar is one slim row (the page's name, the status dot, How AMC works).
// Sign out moved to the person at the foot of the rail (renderNavSession), and the buttons that repeated the rail
// (Records, Run a task) are gone; the demo workspace keeps its one first action, "Try a demo task".
describe("topbarHtml", () => {
  const topbar = topbarHtml as unknown as (options: Record<string, unknown>) => string;

  test("names the page, escaped, and repeats nothing the rail has", () => {
    const html = topbar({ title: "<Approvals>", demoMode: false, me: { username: "a" } });
    expect(html).toContain('<div class="topbar-title">&lt;Approvals&gt;</div>');
    expect(topbar({})).toContain('<div class="topbar-title">Compass Console</div>');
    for (const gone of ["Sign out", 'href="./evidence"', "Run a task", "topbarPrimaryAction", "Open Standard"]) expect(html).not.toContain(gone);
    expect(html).toContain('<button type="button" id="topbarStatus" class="status-pill" aria-controls="ucBanner" aria-expanded="false" hidden>');
    expect(html).toMatch(/id="guideOpenLink" href="\.\/home\?guide=1" title="How AMC works"><svg [\s\S]*?<\/svg><span class="visually-hidden">How AMC works<\/span><\/a>/);
    const demo = topbar({ demoMode: true, agent: "a b" });
    expect(demo).toContain("local demo session");
    expect(demo).toContain('id="topbarPrimaryAction" href="./native-tasks?agent=a%20b&amp;sample=1">Try a demo task</a>');
    for (const variant of [html, topbar({ me: null }), demo]) expect(variant).not.toMatch(/\son[a-z]+\s*=|javascript:/i);
  });

  test("keeps the workspace's name, escaped, for pages with no status to show", () => {
    expect(topbar({ workspace: "<acme>" })).toContain('<span class="topbar-workspace muted">&lt;acme&gt; workspace</span>');
    expect(topbar({})).toContain(">Local workspace</span>");
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

  test("puts one top bar first in main, redraws it in place and keeps the agent for the demo's first action", () => {
    const doc = new FakeDocument();
    doc.location.pathname = "/w/demo/console/home";
    pageWithNav(doc, ["./home"]);
    draw(doc, null, undefined, "bot-1");
    draw(doc, { username: "a" }, () => undefined);
    const bars = doc.querySelectorAll(".topbar");
    expect(bars).toHaveLength(1);
    expect(bars[0]!.dataset.agent).toBe("bot-1");
    expect(bars[0]!.querySelector("#topbarPrimaryAction")!.getAttribute("href")).toContain("agent=bot-1");
  });

  test("the status dot follows #ucBanner: none while it is hidden, two words when it is fine, Needs attention and the banner kept in sight on a problem", () => {
    const doc = new FakeDocument();
    pageWithNav(doc, ["./home"]);
    const banner = doc.getElementById("ucBanner")!;
    banner.hidden = true;
    draw(doc, { username: "a" });
    const pill = () => doc.getElementById("topbarStatus")!;
    expect(pill().hidden).toBe(true);
    banner.hidden = false;
    expect(doc.querySelector(".topbar-workspace")!.hidden).toBe(false);
    banner.innerHTML = '<p class="uc-line">Local workspace · Results ready · Records check out</p><details class="uc-details"><summary>Details</summary></details>';
    draw(doc, { username: "a" });
    expect(pill().hidden).toBe(false);
    expect(doc.querySelector(".topbar-workspace")!.hidden).toBe(true);
    expect(pill().querySelector(".status-words")!.textContent).toBe("Local workspace");
    expect(banner.classList.contains("uc-pinned")).toBe(false);
    for (const listener of pill().listeners.get("click") ?? []) listener({} as never);
    expect(banner.classList.contains("uc-open")).toBe(true);
    // One press shows the details too (trust, integrity, claims), not a second fold.
    expect(banner.querySelector(".uc-details")!.open).toBe(true);
    expect(pill().getAttribute("aria-expanded")).toBe("true");
    banner.innerHTML = '<div class="danger"><strong>Freeze active:</strong> 1 pause is stopping some agent actions.</div>';
    draw(doc, { username: "a" });
    expect(pill().querySelector(".status-words")!.textContent).toBe("Needs attention");
    expect(pill().dataset.state).toBe("stop");
    expect(banner.classList.contains("uc-pinned")).toBe(true);
    // A status AMC could not read (the offline snapshot, "Unavailable") has no plain line: it fails closed, in sight.
    banner.innerHTML = "<strong>Unified Clarity</strong> <span class=\"muted\">Unavailable.</span>";
    draw(doc, { username: "a" });
    expect(pill().querySelector(".status-words")!.textContent).toBe("Status unknown");
    expect(pill().dataset.state).toBe("stop");
    expect(banner.classList.contains("uc-pinned")).toBe(true);
    const styles = readFileSync("src/console/assets/styles.css", "utf8");
    expect(styles).toContain("body[data-status-pill] #ucBanner:not(.uc-pinned):not(.uc-open) {");
  });

  // Colour means process state, never quality: a healthy status, an "ok" pill and an ok line are drawn in ink, and the
  // edges of fields, buttons and hollow waypoints reach 3:1 on every surface in both themes.
  test("styles.css keeps results neutral and UI edges at 3:1", () => {
    const styles = readFileSync("src/console/assets/styles.css", "utf8");
    const rule = (selector: string) => styles.slice(styles.indexOf(`\n${selector} {`), styles.indexOf("}", styles.indexOf(`\n${selector} {`)));
    for (const selector of [".status-dot", ".pill.ok", ".status-ok", ".banner"]) expect(rule(selector), selector).not.toContain("var(--accent)");
    const lum = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((sum, v, at) => sum + v * [0.2126, 0.7152, 0.0722][at]!, 0);
    const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    const tokens = (block: string) => Object.fromEntries([...block.matchAll(/--(bg|surface|surface-2|line-strong): (#[0-9A-Fa-f]{6});/g)].map((m) => [m[1], m[2]]));
    const light = tokens(styles.slice(0, styles.indexOf("@media (prefers-color-scheme: dark)")));
    const dark = tokens(styles.slice(styles.indexOf(':root[data-theme="dark"]')));
    for (const theme of [light, dark]) for (const surface of ["bg", "surface", "surface-2"]) expect(ratio(theme["line-strong"]!, theme[surface]!)).toBeGreaterThanOrEqual(3);
  });

  // Every text token on every background token, and each "-ink" on its own fill, reads at 4.5:1 or more in both themes
  // (body text; large text and icons need only 3:1, so this covers them too).
  test("every text and background token pair reaches 4.5:1 in both themes", () => {
    const styles = readFileSync("src/console/assets/styles.css", "utf8");
    const lum = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((sum, v, at) => sum + v * [0.2126, 0.7152, 0.0722][at]!, 0);
    const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    const tokens = (block: string) => Object.fromEntries([...block.matchAll(/--([a-z0-9-]+): (#[0-9A-Fa-f]{6});/g)].map((m) => [m[1], m[2]]));
    const themes = {
      light: tokens(styles.slice(0, styles.indexOf("@media (prefers-color-scheme: dark)"))),
      system: tokens(styles.slice(styles.indexOf("@media (prefers-color-scheme: dark)"), styles.indexOf(':root[data-theme="dark"]'))),
      dark: tokens(styles.slice(styles.indexOf(':root[data-theme="dark"]')))
    };
    const pairs: string[] = [];
    for (const [name, theme] of Object.entries(themes)) {
      for (const text of ["ink", "muted", "accent", "wait", "stop"]) for (const ground of ["bg", "surface", "surface-2"]) pairs.push(`${name} ${text} on ${ground}`);
      for (const fill of ["accent", "wait", "stop"]) pairs.push(`${name} ${fill}-ink on ${fill}`);
    }
    const below = pairs.filter((pair) => {
      const [name, text, , ground] = pair.split(" ") as [keyof typeof themes, string, string, string];
      const theme = themes[name];
      expect(theme[text], pair).toMatch(/^#/);
      expect(theme[ground], pair).toMatch(/^#/);
      return ratio(theme[text]!, theme[ground]!) < 4.5;
    });
    expect(pairs).toHaveLength(54);
    expect(below).toEqual([]);
    // The system dark theme and the chosen dark theme are the same colours.
    expect(themes.system).toEqual(themes.dark);
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

describe("studio-ui inherit slice: one name per page, one 'Signed in as', a true notice", () => {
  test("every PAGE_NAMES entry is the start of that page's <title>, so the top bar and More pages agree", () => {
    for (const [page, name] of Object.entries(PAGE_NAMES)) {
      expect(readFileSync(`src/console/pages/${page}.html`, "utf8"), page).toContain(`<title>${name} · Compass Console</title>`);
      expect(name, page).toMatch(/^[A-Z][^A-Z]*( [A-Z][A-Za-z]*)?$|KPIs|Open Standard/);
    }
  });

  test("a page's own links carry their initials, shown in the folded rail where every file icon looks the same", () => {
    const html = canonicalNavHtml([{ href: "./contextGraph", label: "x" }, { href: "./trust", label: "Trust" }]);
    expect(html).toContain('<span class="nav-initials" aria-hidden="true">CG</span><span class="nav-label">Context graph</span>');
    expect(html).toContain('<span class="nav-initials" aria-hidden="true">T</span><span class="nav-label">Trust</span>');
    const styles = readFileSync("src/console/assets/styles.css", "utf8");
    expect(styles).toContain(':root[data-rail="collapsed"] nav .nav-pages a .icon { display: none; }');
    expect(styles).not.toContain(':root[data-rail="collapsed"] nav .nav-pages a { display: none; }');
  });

  test("the pages' 'Signed in as' status line is marked so it shows once (the rail says it), other lines are not", () => {
    expect(isSessionLine("Signed in as owner")).toBe(true);
    expect(isSessionLine("Signed in as owner (view only)")).toBe(true);
    expect(isSessionLine("Signed in as owner.")).toBe(true);
    expect(isSessionLine("Done at 10:02")).toBe(false);
    expect(isSessionLine("Full score failed: Signed in as owner")).toBe(false);
    expect(readFileSync("src/console/assets/styles.css", "utf8")).toMatch(/#status:empty,\n#status\.status-session \{\n  display: none;/);
    const link = { innerHTML: "", title: "", onclick: null as unknown };
    renderNavSession({ querySelector: () => link }, { userId: "u", username: "vic", roles: ["VIEWER"] });
    expect(link.innerHTML).toContain("Signed in as vic (view only)");
  });

  test("a request with no answer says AMC is not running only when the health read fails too", async () => {
    const notices: string[] = [];
    const doc = new FakeDocument();
    doc.body.appendChild(doc.el("main", {}, []));
    const words = () => { const n = doc.getElementById("shellNotice"); notices.push(String(n?.dataset.kind)); return n?.textContent ?? ""; };
    expect(await reportNoAnswer(doc as never, async () => ({ ok: true }) as Response)).toBe(true);
    expect(words()).toContain("One request got no answer.");
    expect(words()).not.toContain("AMC is not running");
    const down = new FakeDocument();
    down.body.appendChild(down.el("main", {}, []));
    expect(await reportNoAnswer(down as never, async () => { throw new TypeError("Failed to fetch"); })).toBe(false);
    expect(down.getElementById("shellNotice")?.textContent).toContain("AMC is not running.");
    expect(notices[0]).toBe("requestFailed");
  });
});

describe("studio-ui inherit review fixes", () => {
  test("a page's claims sit above its results, and the person stays in sight at the rail's foot", () => {
    const strip = readFileSync("src/console/assets/components/claimBadge.js", "utf8");
    expect(strip).toContain("app.before(strip);");
    expect(strip).not.toContain("app.after(strip);");
    expect(readFileSync("src/console/assets/styles.css", "utf8")).toMatch(/nav a\.nav-person \{\n  order: 3;\n  position: sticky;\n  bottom: -14px;/);
  });

  test("the title bar colour follows a theme chosen on the page", () => {
    type Meta = { name?: string; content?: string; media?: string; remove: () => void };
    const metas: Meta[] = [];
    const dataset: Record<string, string> = {};
    const document = { documentElement: { dataset }, head: { append: (meta: Meta) => metas.push(meta) }, querySelectorAll: () => [...metas],
      createElement: () => { const meta: Meta = { remove: () => metas.splice(metas.indexOf(meta), 1) }; return meta; } };
    const sandbox: Record<string, unknown> = { document, localStorage: { getItem: () => null }, addEventListener: () => {}, matchMedia: () => ({ matches: false }) };
    vm.runInNewContext(readFileSync("src/console/assets/pageTransition.js", "utf8"), sandbox);
    const bars = () => metas.map((meta) => `${meta.content}|${meta.media ?? ""}`);
    expect(bars()).toEqual(["#F4F6F8|(prefers-color-scheme: light)", "#0F172A|(prefers-color-scheme: dark)"]);
    dataset.theme = "dark";
    (sandbox.amcThemeBar as () => void)();
    expect(bars()).toEqual(["#0F172A|"]);
    expect(readFileSync("src/console/assets/shell.js", "utf8")).toContain("globalThis.amcThemeBar?.();");
  });
});
