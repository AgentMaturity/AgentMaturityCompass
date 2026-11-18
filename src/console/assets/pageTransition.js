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
