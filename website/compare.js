(function () {
  "use strict";

  // The site is dark only, like the home page. An older visit may have saved the light theme; forget it.
  try { localStorage.removeItem("amc-theme"); } catch (_) { /* storage may be blocked */ }

  const tableRegions = Array.from(document.querySelectorAll(".table-region"));
  function syncScrollableRegions() {
    tableRegions.forEach((region) => {
      if (region.scrollWidth > region.clientWidth) {
        region.setAttribute("tabindex", "0");
      } else {
        region.removeAttribute("tabindex");
      }
    });
  }

  syncScrollableRegions();
  window.addEventListener("resize", syncScrollableRegions);
  document.fonts?.ready.then(syncScrollableRegions).catch(() => {});
})();
