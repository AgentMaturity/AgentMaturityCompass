// Keyboard users can scroll a region only if it takes focus (WCAG 2.1.1; axe scrollable-region-focusable). Console
// modules render <pre> output, .scroll lists and .table-wrap tables in many places, so they are made focusable here, as
// they appear, and named after their card's heading.
function regionLabel(element) {
  return element.closest("section, .card")?.querySelector("h1, h2, h3, h4")?.textContent?.trim() || "Output";
}

function makeScrollRegionsFocusable(root) {
  for (const element of root.querySelectorAll("pre:not([tabindex]), .scroll:not([tabindex]), .table-wrap:not([tabindex])")) {
    element.tabIndex = 0;
    if (!element.hasAttribute("role")) element.setAttribute("role", "region");
    if (!element.hasAttribute("aria-label") && !element.hasAttribute("aria-labelledby")) {
      element.setAttribute("aria-label", regionLabel(element));
    }
  }
}

if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
  new MutationObserver(() => makeScrollRegionsFocusable(document)).observe(document.documentElement, { childList: true, subtree: true });
  makeScrollRegionsFocusable(document);
}
