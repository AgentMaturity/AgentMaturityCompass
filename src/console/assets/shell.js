// The console's shared page shell (LIVE-UX-02, LIVE-UX-03, LIVE-UX-06). api.js imports this module first, and every
// console page script imports api.js, so every page with a <nav> gets the one canonical menu (its own extra links under
// "More pages"), the phone menu toggle and its active link marked, #status is announced to screen readers, and the
// Unified Clarity placeholder stays hidden until app.js writes real content into it. The pages' static markup stays as
// the no-JavaScript fallback.

const normalizeHref = (href) => String(href || "").replace(/^\.\//, "").replace(/\.html$/, "");
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

/**
 * The console's menu, in plain words: the primary links, then "All features" grouped under short headings. Every href
 * names a page in src/console/pages (tests/console/shell.test.ts). The A4 link ("Build an agent") is shown: A4 Forge is a
 * preview that is on by default, and a4.js hides it where Studio reports the preview off (AMC_A4_PREVIEW=0).
 */
export const CANONICAL_NAV = [
  { href: "./home", label: "Home" },
  { href: "./a4", label: "Build an agent", id: "a4NavLink" },
  { href: "./native-tasks", label: "Run a task" },
  { href: "./agent", label: "My agent" },
  { href: "./evidence", label: "Records" },
  { href: "./approvals", label: "Approvals" },
  { href: "./industrypacks", label: "Industry Packs" },
  { href: "./runtime", label: "Live runs" },
  { href: "./login", label: "Sign in" },
  // Each "All features" link carries one plain line on what its page is for (shown under the label), under a short heading.
  ...[["Rules and limits", [["./firewall", "Firewall", "Checks risky actions and can stop them."],
    ["./governor", "Governor", "What your agent may do on its own, by action type."],
    ["./toolhub", "Tools (ToolHub)", "The tools your agent is allowed to use."],
    ["./leases", "Leases", "Short-lived permission slips for tools."],
    ["./budgets", "Budgets", "Limits on spend and activity."],
    ["./equalizer", "Target levels", "Set the target level you want, per area."],
    ["./policypacks", "Policy packs", "Ready-made rule sets for guardrails."]]],
  ["Watch and review", [["./operator-inbox", "Operator inbox", "Things blocking your agents, in one inbox."],
    ["./drift", "Drift", "Alerts when behaviour changes over time."],
    ["./outcomes", "Outcomes", "Whether the agent delivers the value it should."],
    ["./experiments", "Experiments", "Compare a new version with the current one."],
    ["./benchmarks", "Benchmarks", "Compare scores with other runs."],
    ["./compliance", "Compliance", "Evidence lined up against frameworks (self-assessed)."],
    ["./transparency", "Transparency log", "Check AMC's public log of signed records."],
    ["./workorders", "Work orders", "Signed work orders for your agent."]]],
  ["Teams and many agents", [["./org", "Organisation", "Scores rolled up across teams."],
    ["./compare", "Compare teams", "Two teams or groups side by side."],
    ["./systemic", "Shared risks", "Risks that touch many agents at once."],
    ["./commitments-org", "Team commitments", "Plan what each team commits to improve."],
    ["./fleet", "Fleet", "Many agents and how they work together."]]],
  ["Workspace", [["./users", "Users", "Who can sign in, and their roles."],
    ["./integrations", "Connections", "Connect AMC to the tools you already use."]]]]
    .flatMap(([section, links]) => links.map(([href, label, desc]) => ({ href, label, desc, section, group: "features" })))
];

const pathOf = (href) => normalizeHref(String(href || "").split(/[?#]/)[0]);
const navLink = ({ href, label, id, hidden, desc }) => `<a href="${esc(href)}"${id ? ` id="${esc(id)}"` : ""}${hidden ? " hidden" : ""}`
  + `${desc ? ` title="${esc(desc)}"` : ""}>${esc(label)}${desc ? `<small class="nav-desc">${esc(desc)}</small>` : ""}</a>`;

/** The canonical menu, then the page's own links that it lacks (first occurrence of each page) under "More pages". */
export function canonicalNavHtml(extra = []) {
  const seen = new Set(CANONICAL_NAV.map((link) => pathOf(link.href)));
  const own = extra.filter((link) => !seen.has(pathOf(link.href)) && seen.add(pathOf(link.href)));
  const group = (links, summary, open = "") => `<details class="nav-features"${open}><summary>${summary}</summary>${links.map(navLink).join("")}</details>`;
  const features = CANONICAL_NAV.filter((link) => link.group === "features");
  const sections = [...new Set(features.map((link) => link.section))];
  const sectioned = `<details class="nav-features"><summary>All features</summary>${sections.map((section) =>
    `<p class="nav-section">${esc(section)}</p>${features.filter((link) => link.section === section).map(navLink).join("")}`).join("")}</details>`;
  return CANONICAL_NAV.filter((link) => !link.group).map(navLink).join("") + sectioned
    + (own.length ? group(own, "More pages", " open") : "");
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
    toggle.setAttribute("aria-label", "Toggle navigation");
    toggle.setAttribute("aria-controls", nav.id);
    toggle.title = "Toggle navigation";
    toggle.innerHTML = '<span class="mobile-nav-icon" aria-hidden="true"></span>';
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("mobile-nav-open");
      toggle.setAttribute("aria-expanded", String(open));
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

/** The label of the console's one first action: a demo task in the demo workspace, a real task elsewhere. */
export const primaryActionLabel = (demoMode) => demoMode ? "Try a demo task" : "Run a task";

/** Where that action goes: Native Tasks for the agent, with a sample prompt filled in (?sample=1). */
export const primaryActionHref = (agent = "default") => `./native-tasks?agent=${encodeURIComponent(agent)}&sample=1`;

/**
 * The page top bar (LIVE-UX-17): workspace, session pill, the guide, Evidence, the first action and, once someone is
 * signed in outside the demo workspace (where the session is the built-in viewer), Sign out.
 */
export function topbarHtml({ workspace = "local", demoMode = false, me = null, agent = "default" } = {}) {
  return `
    <div>
      <div class="topbar-kicker">Agent Maturity Compass</div>
      <strong>Compass Console</strong>
      <span class="muted">/ ${esc(workspace)} workspace</span>
    </div>
    <div class="topbar-actions">
      ${demoMode ? '<span class="pill ok">local demo session</span>' : '<span class="pill muted">session protected</span>'}
      <a class="button secondary" id="guideOpenLink" href="./home?guide=1">How AMC works</a>
      <a class="button secondary" href="./evidence">Records</a>
      <a class="button secondary" id="topbarPrimaryAction" href="${esc(primaryActionHref(agent))}">${primaryActionLabel(demoMode)}</a>
      ${me && !demoMode ? '<button id="signOutBtn" type="button" class="secondary">Sign out</button>' : ""}
    </div>
  `;
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
      nav.classList.remove("mobile-nav-open");
      const toggle = nav.querySelector(".mobile-nav-toggle");
      toggle?.setAttribute("aria-expanded", "false");
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
