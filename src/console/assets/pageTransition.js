// The page-to-page cross-fade (motion.css @view-transition). A classic script in every page's <head>, so its listeners
// exist before the first frame; module scripts start too late for that. It also sets the colour theme and the folded
// rail before the first paint (shell.js has the switches), so a page never flashes the other theme.
(() => {
  try {
    const root = document.documentElement;
    const theme = localStorage.getItem("amc-theme");
    if (theme === "light" || theme === "dark") root.dataset.theme = theme;
    if (localStorage.getItem("amc-rail") === "collapsed") root.dataset.rail = "collapsed";
  } catch { /* no storage, or no document yet: the system theme and the open rail */ }
  // The window's title bar takes the page colour of the theme in use (manifest.json can name only one colour). The theme
  // switch (shell.js) calls it again, so the bar follows a theme chosen on the page.
  const themeBar = () => {
    try {
      for (const old of document.querySelectorAll('meta[name="theme-color"]')) old.remove();
      const chosen = document.documentElement.dataset.theme;
      const bar = (color, media) => {
        const meta = document.createElement("meta");
        meta.name = "theme-color";
        meta.content = color;
        if (media) meta.media = media;
        document.head.append(meta);
      };
      if (chosen) bar(chosen === "dark" ? "#0F172A" : "#F4F6F8");
      else { bar("#F4F6F8", "(prefers-color-scheme: light)"); bar("#0F172A", "(prefers-color-scheme: dark)"); }
    } catch { /* no head yet: the manifest's colour */ }
  };
  themeBar();
  globalThis.amcThemeBar = themeBar;
  const quiet = () => document.visibilityState === "hidden" || matchMedia("(prefers-reduced-motion: reduce)").matches;
  // A transition that is skipped rejects ready, finished and updateCallbackDone; a hidden page or reduced motion skips it.
  const settle = (transition) => {
    if (!transition) return;
    for (const key of ["ready", "finished", "updateCallbackDone"]) transition[key]?.catch(() => {});
    if (quiet()) transition.skipTransition();
  };
  addEventListener("pageswap", (event) => settle(event.viewTransition));
  addEventListener("pagereveal", (event) => settle(event.viewTransition));
  // Chromium drops an arriving fade before pagereveal when the page's module scripts are still loading at its first
  // frame (most console pages): the page never receives the transition, only its rejected promise, which lands here.
  addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    if (reason instanceof DOMException && reason.name === "AbortError" && /transition was skipped/i.test(reason.message)) event.preventDefault();
  });
})();
