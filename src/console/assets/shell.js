// The console's shared page shell (LIVE-UX-02, LIVE-UX-03, LIVE-UX-06). api.js imports this module first, and every
// console page script imports api.js, so every page with a <nav> gets the one canonical menu (its own extra links under
// "This section"), the phone menu toggle and its active link marked, #status is announced to screen readers, and the
// Unified Clarity placeholder stays hidden until app.js writes real content into it. The pages' static markup stays as
// the no-JavaScript fallback.

const normalizeHref = (href) => String(href || "").replace(/^\.\//, "").replace(/\.html$/, "");
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

/**
 * Home's menu, in Home's order: the primary links, the A4 link (hidden until a4.js finds the preview on), then "All
 * features". Every href names a page in src/console/pages (tests/console/shell.test.ts).
 */
export const CANONICAL_NAV = [
  { href: "./home", label: "Home" },
  { href: "./native-tasks", label: "Native Tasks" },
  { href: "./a4", label: "A4", id: "a4NavLink", hidden: true },
  { href: "./agent", label: "Agent" },
  { href: "./evidence", label: "Evidence" },
  { href: "./runtime", label: "Runtime" },
  { href: "./login", label: "Login / account" },
  ...[["./org", "Org"], ["./compare", "Compare"], ["./systemic", "Systemic"], ["./commitments-org", "Org Commitments"],
    ["./fleet", "Fleet"], ["./firewall", "Firewall"], ["./equalizer", "Equalizer"], ["./governor", "Governor"],
    ["./toolhub", "ToolHub"], ["./approvals", "Approvals"], ["./operator-inbox", "Operator"], ["./users", "Users"],
    ["./leases", "Leases"], ["./budgets", "Budgets"], ["./drift", "Drift"], ["./benchmarks", "Benchmarks"],
    ["./compliance", "Compliance"], ["./outcomes", "Outcomes"], ["./experiments", "Experiments"],
    ["./integrations", "Integrations"], ["./transparency", "Transparency"], ["./policypacks", "Policy Packs"],
    ["./industrypacks", "Industry Packs"], ["./workorders", "Work Orders"]].map(([href, label]) => ({ href, label, group: "features" }))
];

const pathOf = (href) => normalizeHref(String(href || "").split(/[?#]/)[0]);
const navLink = ({ href, label, id, hidden }) => `<a href="${esc(href)}"${id ? ` id="${esc(id)}"` : ""}${hidden ? " hidden" : ""}>${esc(label)}</a>`;

/** The canonical menu, then the page's own links that it lacks (first occurrence of each page) under "This section". */
export function canonicalNavHtml(extra = []) {
  const seen = new Set(CANONICAL_NAV.map((link) => pathOf(link.href)));
  const own = extra.filter((link) => !seen.has(pathOf(link.href)) && seen.add(pathOf(link.href)));
  const group = (links, summary, open = "") => `<details class="nav-features"${open}><summary>${summary}</summary>${links.map(navLink).join("")}</details>`;
  return CANONICAL_NAV.filter((link) => !link.group).map(navLink).join("")
    + group(CANONICAL_NAV.filter((link) => link.group === "features"), "All features")
    + (own.length ? group(own, "This section", " open") : "");
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
  for (const anchor of nav.querySelectorAll("a")) {
    const current = normalizeHref(anchor.getAttribute("href")) === page;
    anchor.classList.toggle("active", current);
    if (current) anchor.setAttribute("aria-current", "page");
    else anchor.removeAttribute("aria-current");
  }
}

/** The page top bar (LIVE-UX-17): workspace, session pill, two shortcuts and, once someone is signed in, Sign out. */
export function topbarHtml({ workspace = "local", demoMode = false, me = null } = {}) {
  return `
    <div>
      <div class="topbar-kicker">Agent Maturity Compass</div>
      <strong>Compass Console</strong>
      <span class="muted">/ ${esc(workspace)} workspace</span>
    </div>
    <div class="topbar-actions">
      ${demoMode ? '<span class="pill ok">local demo session</span>' : '<span class="pill muted">session protected</span>'}
      <a class="button secondary" href="./evidence">Evidence</a>
      <a class="button secondary" href="./standard">Open Standard</a>
      ${me ? '<button id="signOutBtn" type="button" class="secondary">Sign out</button>' : ""}
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
  const nav = doc.querySelector("nav");
  renderCanonicalNav(nav);
  decorateNav(nav, currentPage(doc));
  addSkipLink(doc);
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
