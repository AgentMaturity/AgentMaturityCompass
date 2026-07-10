(function () {
  "use strict";

  const button = document.getElementById("themeToggle");
  const label = button?.querySelector(".theme-label");

  function applyTheme(theme) {
    const isLight = theme === "clean";
    document.body.classList.toggle("clean-theme", isLight);
    if (!button || !label) return;
    button.setAttribute("aria-pressed", String(isLight));
    button.setAttribute("aria-label", isLight ? "Switch to dark theme" : "Switch to light theme");
    label.textContent = isLight ? "Dark" : "Light";
  }

  let initialTheme = "terminal";
  try {
    initialTheme = localStorage.getItem("amc-theme") === "clean" ? "clean" : "terminal";
  } catch (_) {
    initialTheme = "terminal";
  }
  applyTheme(initialTheme);

  button?.addEventListener("click", () => {
    const theme = document.body.classList.contains("clean-theme") ? "terminal" : "clean";
    applyTheme(theme);
    try {
      localStorage.setItem("amc-theme", theme);
    } catch (_) {
      // Theme persistence is optional in restricted browser contexts.
    }
  });

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
