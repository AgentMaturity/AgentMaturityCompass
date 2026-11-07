// The console's shared page shell (LIVE-UX-02, LIVE-UX-03). api.js imports this module first, and every console page
// script imports api.js, so every page with a <nav> gets the phone menu toggle and its active link marked, #status is
// announced to screen readers, and the Unified Clarity placeholder stays hidden until app.js writes real content into it.
// The pages' static markup stays as the no-JavaScript fallback.

const normalizeHref = (href) => String(href || "").replace(/^\.\//, "").replace(/\.html$/, "");

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

/** Runs once per page load. A page without a <nav> (ops, score) still gets the status role. */
export function initShell(doc) {
  const status = doc.getElementById("status");
  if (status && !status.hasAttribute("role")) status.setAttribute("role", "status");
  // app.js unhides the banner when it writes content (refreshUnifiedBanner); pages that never load it keep it hidden.
  const banner = doc.getElementById("ucBanner");
  if (banner) banner.hidden = true;
  decorateNav(doc.querySelector("nav"), currentPage(doc));
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => initShell(document));
  else initShell(document);
}
