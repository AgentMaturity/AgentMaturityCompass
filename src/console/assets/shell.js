// The console's shared page shell (LIVE-UX-02, LIVE-UX-03, LIVE-UX-06). api.js imports this module first, and every
// console page script imports api.js, so every page with a <nav> gets the one canonical menu (its own extra links under
// "More pages"), the phone menu toggle and its active link marked, #status is announced to screen readers, and the
// Unified Clarity placeholder stays hidden until app.js writes real content into it. The pages' static markup stays as
// the no-JavaScript fallback.

import { icon } from "./iconSet.js";

const normalizeHref = (href) => String(href || "").replace(/^\.\//, "").replace(/\.html$/, "");
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

/**
 * The console's menu, in plain words, drawn as the rail: Home, Build an agent, Run a task, My agent, Approvals, Records,
 * then Industry Packs and Live runs, then "More" (every other page, grouped under short headings), and the person at the
 * bottom. On a phone the first five are the tab bar. Every href names a page in src/console/pages
 * (tests/console/shell.test.ts). The A4 link ("Build an agent") is shown: A4 Forge is a preview that is on by default,
 * and a4.js hides it where Studio reports the preview off (AMC_A4_PREVIEW=0).
 */
export const CANONICAL_NAV = [
  { href: "./home", label: "Home", icon: "home", tab: true },
  { href: "./a4", label: "Build an agent", id: "a4NavLink", icon: "build", tab: true, short: "Build" },
  { href: "./native-tasks", label: "Run a task", icon: "run", tab: true, short: "Run" },
  { href: "./agent", label: "My agent", icon: "agent", tab: true },
  { href: "./approvals", label: "Approvals", icon: "approvals", tab: true },
  { href: "./evidence", label: "Records", icon: "records" },
  { href: "./industrypacks", label: "Industry Packs", icon: "packs", divide: true },
  { href: "./runtime", label: "Live runs", icon: "live" },
  { href: "./login", label: "Sign in", icon: "sign-in", person: true },
  // Each "More" link carries one plain line on what its page is for (shown under the label), under a short heading.
  ...[["Rules and limits", "lock", [["./firewall", "Firewall", "Checks risky actions and can stop them."],
    ["./governor", "Governor", "What your agent may do on its own, by action type."],
    ["./toolhub", "Tools (ToolHub)", "The tools your agent is allowed to use."],
    ["./leases", "Leases", "Short-lived permission slips for tools."],
    ["./budgets", "Budgets", "Limits on spend and activity."],
    ["./equalizer", "Target levels", "Set the target level you want, per area."],
    ["./policypacks", "Policy packs", "Ready-made rule sets for guardrails."]]],
  ["Watch and review", "live", [["./operator-inbox", "Operator inbox", "Things blocking your agents, in one inbox."],
    ["./drift", "Drift", "Alerts when behaviour changes over time."],
    ["./outcomes", "Outcomes", "Whether the agent delivers the value it should."],
    ["./experiments", "Experiments", "Compare a new version with the current one."],
    ["./benchmarks", "Benchmarks", "Compare scores with other runs."],
    ["./compliance", "Compliance", "Evidence lined up against frameworks (self-assessed)."],
    ["./transparency", "Transparency log", "Check AMC's public log of signed records."],
    ["./workorders", "Work orders", "Signed work orders for your agent."]]],
  ["Teams and many agents", "people", [["./org", "Organisation", "Scores rolled up across teams."],
    ["./compare", "Compare teams", "Two teams or groups side by side."],
    ["./systemic", "Shared risks", "Risks that touch many agents at once."],
    ["./commitments-org", "Team commitments", "Plan what each team commits to improve."],
    ["./fleet", "Fleet", "Many agents and how they work together."]]],
  ["Workspace", "person", [["./users", "Users", "Who can sign in, and their roles."],
    ["./integrations", "Connections", "Connect AMC to the tools you already use."],
    ["./ops", "Maintenance", "Readiness, how long records are kept, clean-up and backups."]]]]
    .flatMap(([section, iconName, links]) => links.map(([href, label, desc]) => ({ href, label, desc, section, icon: iconName, group: "features" })))
];

const pathOf = (href) => normalizeHref(String(href || "").split(/[?#]/)[0]);
const linkClass = ({ tab, divide, person }) => [tab && "nav-tab", divide && "nav-divide", person && "nav-person"].filter(Boolean).join(" ");
const navLink = (link) => {
  const { href, label, id, hidden, desc } = link;
  const classes = linkClass(link);
  return `<a href="${esc(href)}"${id ? ` id="${esc(id)}"` : ""}${classes ? ` class="${classes}"` : ""}${hidden ? " hidden" : ""}`
    + ` title="${esc(desc || label)}">${icon(link.icon || "file")}<span class="nav-label">${esc(label)}</span>`
    + `${link.short ? `<span class="nav-short" aria-hidden="true">${esc(link.short)}</span>` : ""}`
    + `${desc ? `<small class="nav-desc">${esc(desc)}</small>` : ""}</a>`;
};

// The rail's foot: the colour theme (Auto follows the system) and the button that folds the rail to its icons.
const THEMES = [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]];
const railFootHtml = () => `<div class="rail-foot"><div class="theme-switch" role="group" aria-label="Colour theme">${THEMES.map(([value, label]) =>
  `<button type="button" class="theme-option" data-theme-choice="${value}" aria-pressed="${value === "auto"}" title="Theme: ${label}">`
  + `${icon(value === "auto" ? "auto" : value === "light" ? "sun" : "moon", { size: 18 })}<span class="nav-label">${label}</span></button>`).join("")}</div>`
  + `<button type="button" class="rail-collapse" aria-pressed="false" title="Fold the menu">${icon("sidebar", { size: 18 })}<span class="nav-label">Fold the menu</span></button></div>`;

/** The canonical menu, "More" with every other page, the page's own links it lacks under "More pages", and the rail's foot. */
export function canonicalNavHtml(extra = []) {
  const seen = new Set(CANONICAL_NAV.map((link) => pathOf(link.href)));
  const own = extra.filter((link) => !seen.has(pathOf(link.href)) && seen.add(pathOf(link.href)));
  const features = CANONICAL_NAV.filter((link) => link.group === "features");
  const sections = [...new Set(features.map((link) => link.section))];
  const more = `<details class="nav-features nav-more"><summary>${icon("more")}<span class="nav-label">More</span></summary>`
    + `<div class="more-panel"><input type="search" class="more-filter" placeholder="Find a page" aria-label="Find a page" />${sections.map((section) =>
      `<div class="more-group"><p class="nav-section">${esc(section)}</p>${features.filter((link) => link.section === section).map(navLink).join("")}</div>`).join("")}</div></details>`;
  const pages = own.length ? `<details class="nav-features nav-pages" open><summary>${icon("file")}<span class="nav-label">More pages</span></summary>`
    + `${own.map((link) => navLink({ ...link, icon: "file" })).join("")}</details>` : "";
  return CANONICAL_NAV.filter((link) => !link.group).map(navLink).join("") + more + pages + railFootHtml();
}

/** Replaces the static menu (every child but the <h1> and the phone toggle) with the canonical one, once per page. */
export function renderCanonicalNav(nav) {
  if (!nav || nav.dataset.canonical === "1") return;
  const extra = [...nav.querySelectorAll("a")].map((anchor) => ({ href: anchor.getAttribute("href") || "", label: anchor.textContent.trim() }));
  for (const child of [...nav.children]) {
    if (child.tagName !== "H1" && !child.classList.contains("mobile-nav-toggle")) child.remove();
  }
  nav.insertAdjacentHTML("beforeend", canonicalNavHtml(extra));
  nav.dataset.canonical = "1";
}

function currentPage(doc) {
  return doc.body?.dataset?.page || String(doc.location?.pathname || "").split("/").filter(Boolean).pop() || "home";
}

/**
 * The phone menu toggle (styles.css hides nav links at 900 px and below until nav.mobile-nav-open) and the current page's
 * link. Idempotent: app.js calls it again on each render, so a second call adds no toggle and keeps an open menu open.
 */
export function decorateNav(nav, page) {
  if (!nav) return;
  let toggle = nav.querySelector(".mobile-nav-toggle");
  if (!toggle) {
    nav.id = nav.id || "amc-main-navigation";
    toggle = nav.ownerDocument.createElement("button");
    toggle.type = "button";
    toggle.className = "mobile-nav-toggle";
    toggle.setAttribute("aria-controls", nav.id);
    toggle.title = "Every page";
    toggle.innerHTML = `${icon("more")}<span class="nav-label">More</span>`;
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("mobile-nav-open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.innerHTML = `${icon(open ? "close" : "more")}<span class="nav-label">${open ? "Close" : "More"}</span>`;
      // On a phone "More" is a sheet with every page: the grouped list opens with it.
      const more = nav.querySelector(".nav-more");
      if (more && open) more.setAttribute("open", "");
    });
    nav.insertBefore(toggle, nav.querySelector("a"));
  }
  toggle.setAttribute("aria-expanded", String(nav.classList.contains("mobile-nav-open")));
  // A project page belongs to "Build an agent" in the menu.
  const section = page === "a4Project" && !nav.querySelector('a[href="./a4Project"]') ? "a4" : page;
  for (const anchor of nav.querySelectorAll("a")) {
    const current = normalizeHref(anchor.getAttribute("href")) === section;
    anchor.classList.toggle("active", current);
    if (current) anchor.setAttribute("aria-current", "page");
    else anchor.removeAttribute("aria-current");
  }
}

/**
 * The menu's session link (the person, at the foot of the rail) follows the session: "Sign in" while nobody is signed
 * in, "Sign out" with who is signed in while someone is. api.js calls this whenever it learns who is signed in. The
 * demo's built-in viewer keeps "Sign in".
 */
export function renderNavSession(doc, me, onSignOut) {
  const link = doc?.querySelector?.('nav a[href="./login"]');
  if (!link) return;
  const signedIn = Boolean(me) && me.userId !== "local-demo";
  const name = me?.username || me?.userId || "";
  link.innerHTML = signedIn
    ? `<span class="nav-avatar" aria-hidden="true">${esc(name.slice(0, 1).toUpperCase() || "?")}</span><span class="nav-label">Sign out</span><small class="nav-desc">Signed in as ${esc(name)}</small>`
    : `${icon("sign-in")}<span class="nav-label">Sign in</span>`;
  link.title = signedIn ? `Signed in as ${name}. Sign out of the Compass Console.` : "Sign in";
  link.onclick = signedIn ? (event) => { event.preventDefault(); onSignOut?.(); } : null;
}

/** The Approvals link's count of requests that wait (api.js works it out); 0 or less removes it. */
export function setNavBadge(doc, href, count) {
  const link = doc?.querySelector?.(`nav a[href="${href}"]`);
  if (!link) return;
  link.querySelector(".nav-badge")?.remove();
  if (!(count > 0)) return;
  link.insertAdjacentHTML("beforeend", `<span class="nav-badge"><span aria-hidden="true">${count > 99 ? "99+" : count}</span><span class="visually-hidden">, ${count} waiting</span></span>`);
}

/** The label of the console's one first action: a demo task in the demo workspace, a real task elsewhere. */
export const primaryActionLabel = (demoMode) => demoMode ? "Try a demo task" : "Run a task";

/** Where that action goes: Native Tasks for the agent, with a sample prompt filled in (?sample=1). */
export const primaryActionHref = (agent = "default") => `./native-tasks?agent=${encodeURIComponent(agent)}&sample=1`;

/**
 * The page top bar, one slim row: the page's name, the workspace status as a dot and two words (it opens the full status
 * in #ucBanner), and "How AMC works". The rail carries the rest, Sign out included. In the demo workspace, which has no
 * build card, it keeps the one first action ("Try a demo task") and says it is a demo session.
 */
export function topbarHtml({ demoMode = false, agent = "default", title = "" } = {}) {
  return `
    <div class="topbar-title">${esc(title || "Compass Console")}</div>
    <div class="topbar-actions">
      ${demoMode ? '<span class="pill">local demo session</span>' : ""}
      <button type="button" id="topbarStatus" class="status-pill" aria-controls="ucBanner" aria-expanded="false" hidden><span class="status-dot" aria-hidden="true"></span><span class="status-words">Status</span></button>
      ${demoMode ? `<a class="button" id="topbarPrimaryAction" href="${esc(primaryActionHref(agent))}">${primaryActionLabel(true)}</a>` : ""}
      <a class="topbar-help" id="guideOpenLink" href="./home?guide=1" title="How AMC works">${icon("help")}<span class="visually-hidden">How AMC works</span></a>
    </div>
  `;
}

/** The page's own name, from its title ("Approvals · Compass Console" reads "Approvals"). */
const pageTitle = (doc) => String(doc?.title || "").split(" · ")[0].trim();

/**
 * Draws the top bar at the start of <main> on every page with a menu (C-15), or redraws the one already there. api.js
 * calls it whenever it learns who is signed in, so pages with their own script get it too; app.js passes its agent.
 */
export function renderTopbar(doc, me, onSignOut, agent) {
  const main = doc?.querySelector?.("main");
  if (!main || !doc.querySelector("nav")) return;
  let bar = main.querySelector(".topbar");
  if (!bar) {
    bar = doc.createElement("section");
    bar.className = "topbar";
    main.insertBefore(bar, main.firstChild);
  }
  const prefix = String(doc.location?.pathname || "").match(/^\/w\/([^/]+)\//)?.[1];
  const workspace = prefix ? decodeURIComponent(prefix) : "local";
  bar.innerHTML = topbarHtml({ demoMode: workspace === "demo", agent: agent || bar.dataset.agent || "default", title: pageTitle(doc) });
  if (agent) bar.dataset.agent = agent;
  bar.querySelector("#topbarStatus")?.addEventListener("click", () => toggleStatus(doc));
  syncStatus(doc);
}

/**
 * The status dot follows #ucBanner, which app.js fills: no dot while it is empty; "Needs attention" in red when it holds
 * a problem, a kill switch or a freeze, and "Status unknown" when it holds no plain status line (AMC could not read its
 * status), and then the banner itself stays in sight; otherwise the banner's first words ("Local workspace") with the
 * full status one click away.
 */
function syncStatus(doc) {
  const banner = doc.getElementById?.("ucBanner");
  const pill = doc.getElementById?.("topbarStatus");
  if (!banner || !pill) return;
  const problem = Boolean(banner.querySelector(".danger, .status-bad"));
  const plain = banner.querySelector(".uc-line");
  // Only the healthy plain line folds away; anything else (a problem, or a status AMC could not read) stays in sight.
  const alert = !banner.hidden && (problem || !plain);
  const line = String(plain?.textContent ?? "").split(" · ")[0].trim();
  pill.hidden = banner.hidden;
  pill.dataset.state = alert ? "stop" : "ok";
  pill.querySelector(".status-words").textContent = problem ? "Needs attention" : alert ? "Status unknown" : line.split(/\s+/).slice(0, 2).join(" ") || "Status";
  banner.classList.toggle("uc-pinned", alert);
  pill.setAttribute("aria-expanded", String(alert || banner.classList.contains("uc-open")));
  if (doc.body?.dataset) doc.body.dataset.statusPill = "1";
}

function toggleStatus(doc) {
  const banner = doc.getElementById("ucBanner");
  if (!banner || banner.classList.contains("uc-pinned")) return;
  banner.classList.toggle("uc-open");
  syncStatus(doc);
}

/** Runs once per page load. A page without a <nav> (ops, score) still gets the status role. */
export function initShell(doc) {
  const status = doc.getElementById("status");
  if (status && !status.hasAttribute("role")) status.setAttribute("role", "status");
  // app.js unhides the banner when it writes content (refreshUnifiedBanner); pages that never load it keep it hidden.
  const banner = doc.getElementById("ucBanner");
  if (banner) banner.hidden = true;
  // The scripts started, so the static "Still blank?" note (styles.css shows it after a delay) is no longer needed.
  for (const note of doc.querySelectorAll(".boot-note")) note.remove();
  const nav = doc.querySelector("nav");
  renderCanonicalNav(nav);
  decorateNav(nav, currentPage(doc));
  addSkipLink(doc);
  closeOnEscape(doc);
  fillIcons(doc);
  bindRail(doc);
}

/** Static markup asks for an icon with <span class="js-icon" data-icon="name">; the shell draws it. */
function fillIcons(doc) {
  for (const holder of doc.querySelectorAll(".js-icon")) {
    if (!holder.children.length) holder.innerHTML = icon(holder.getAttribute("data-icon") || "info");
  }
}

const store = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  } catch { /* no storage (private window, blocked): the choice holds for this page only */ }
};

/** The theme switch, the fold button, More's page filter and closing More on a click outside it (browser only). */
function bindRail(doc) {
  const root = doc.documentElement;
  if (!root || doc.body?.dataset?.railBound === "1") return;
  doc.body.dataset.railBound = "1";
  const showTheme = () => {
    const current = root.dataset.theme || "auto";
    for (const option of doc.querySelectorAll(".theme-option")) option.setAttribute("aria-pressed", String(option.getAttribute("data-theme-choice") === current));
  };
  for (const option of doc.querySelectorAll(".theme-option")) {
    option.addEventListener("click", () => {
      const choice = option.getAttribute("data-theme-choice");
      if (choice === "light" || choice === "dark") root.dataset.theme = choice; else delete root.dataset.theme;
      store("amc-theme", choice === "auto" ? null : choice);
      showTheme();
    });
  }
  showTheme();
  const fold = doc.querySelector(".rail-collapse");
  const showFold = () => fold?.setAttribute("aria-pressed", String(root.dataset.rail === "collapsed"));
  fold?.addEventListener("click", () => {
    if (root.dataset.rail === "collapsed") delete root.dataset.rail; else root.dataset.rail = "collapsed";
    store("amc-rail", root.dataset.rail === "collapsed" ? "collapsed" : null);
    showFold();
  });
  showFold();
  const more = doc.querySelector(".nav-more");
  more?.querySelector(".more-filter")?.addEventListener("input", (event) => {
    const words = String(event.target.value || "").trim().toLowerCase();
    for (const group of more.querySelectorAll(".more-group")) {
      let shown = 0;
      for (const link of group.querySelectorAll("a")) {
        const hit = !words || link.textContent.toLowerCase().includes(words);
        link.classList.toggle("filtered-out", !hit);
        shown += hit ? 1 : 0;
      }
      group.hidden = shown === 0;
    }
  });
  doc.addEventListener("click", (event) => {
    if (more?.open && !more.contains(event.target) && !doc.querySelector("nav.mobile-nav-open")) more.open = false;
  });
  const banner = doc.getElementById("ucBanner");
  if (banner && typeof MutationObserver === "function") {
    new MutationObserver(() => syncStatus(doc)).observe(banner, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  }
}

/**
 * Escape closes what is open around the focus (brief item 8): the innermost open disclosure, then the phone menu, and
 * puts the focus back on what opened it. <dialog> closes on Escape by itself.
 */
function closeOnEscape(doc) {
  if (!doc.addEventListener || doc.body?.dataset?.escapeBound === "1") return;
  doc.body.dataset.escapeBound = "1";
  doc.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    const active = doc.activeElement;
    const details = active?.closest?.("details[open]");
    if (details) {
      details.open = false;
      details.querySelector("summary")?.focus();
      return;
    }
    const nav = doc.querySelector("nav.mobile-nav-open");
    if (nav) {
      const toggle = nav.querySelector(".mobile-nav-toggle");
      // The toggle's own click closes the sheet and puts its "More" label back.
      if (toggle) toggle.click(); else nav.classList.remove("mobile-nav-open");
      toggle?.focus();
    }
  });
}

/** M10/L7: the first Tab stop skips the menu to the page's main content (styles.css shows it only while focused). */
function addSkipLink(doc) {
  const main = doc.querySelector("main");
  if (!main || doc.querySelector("a.skip-link")) return;
  if (!main.getAttribute("id")) main.setAttribute("id", "main-content");
  main.setAttribute("tabindex", "-1");
  const link = doc.createElement("a");
  link.setAttribute("class", "skip-link");
  link.setAttribute("href", `#${main.getAttribute("id")}`);
  link.textContent = "Skip to main content";
  doc.body.insertBefore(link, doc.body.children[0] ?? null);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => initShell(document));
  else initShell(document);
}

/**
 * One shared notice at the top of every page for the two states a page cannot fix itself (C-06, C-11): AMC stopped
 * answering, or the sign-in ended. "offline" checks /healthz every 5 s and says when AMC answers again; Retry reloads.
 * "signedOut" links to sign-in and returns here afterwards; the body's data-session="none" hides actions that need a
 * session (styles.css). Idempotent per kind.
 */
export function showShellNotice(kind, doc = typeof document === "undefined" ? null : document) {
  const main = doc?.querySelector("main");
  if (!main) return;
  let notice = doc.getElementById("shellNotice");
  if (notice?.dataset.kind === kind) return;
  if (!notice) {
    notice = doc.createElement("section");
    notice.id = "shellNotice";
    notice.setAttribute("role", "alert");
    main.insertBefore(notice, main.firstChild);
  }
  notice.dataset.kind = kind;
  notice.className = "card banner shell-notice";
  if (kind === "signedOut") {
    doc.body.dataset.session = "none";
    const next = `${(doc.location?.pathname || "").split("/").pop() || "home"}${doc.location?.search || ""}`;
    notice.innerHTML = `<p><strong>You are signed out.</strong> Sign in again to go on; you come back to this page.</p>
      <p><a class="button" href="./login?next=${encodeURIComponent(next)}">Sign in</a></p>`;
    return;
  }
  notice.innerHTML = `<p><strong>AMC is not running.</strong> This page cannot load or save anything until it is back.
    Start it again with <code>amc up</code> in the workspace folder (or open the AMC app).</p>
    <p class="row wrap"><button type="button" data-shell-retry>Retry</button><span class="muted" data-shell-state>Checking every few seconds…</span></p>`;
  notice.querySelector("[data-shell-retry]").addEventListener("click", () => doc.defaultView?.location.reload());
  const timer = setInterval(async () => {
    try {
      const reply = await fetch("/healthz", { cache: "no-store" });
      if (!reply.ok) return;
      clearInterval(timer);
      notice.querySelector("[data-shell-state]").textContent = "AMC is running again. Press Retry to reload this page.";
    } catch { /* still down */ }
  }, 5000);
}
