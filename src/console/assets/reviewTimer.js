// Review timing's active-time clock (P2-22). Time counts while the page is visible; on a hidden page it keeps counting
// for 60 seconds (a reviewer reading a source in another tab), then pauses until the page is visible again. Pure: the
// clock is injected, so tests drive it without a browser.
const HIDDEN_GRACE_MS = 60_000;

export function createReviewTimer({ now = () => Date.now(), hiddenGraceMs = HIDDEN_GRACE_MS } = {}) {
  let activeMs = 0;
  let last = now();
  let hiddenSince = null;
  const advance = () => {
    const t = now();
    const until = hiddenSince === null ? t : Math.min(t, hiddenSince + hiddenGraceMs);
    if (until > last) activeMs += until - last;
    last = t;
  };
  return {
    setHidden(hidden) {
      advance();
      hiddenSince = hidden ? (hiddenSince ?? last) : null;
    },
    activeSeconds() {
      advance();
      return Math.floor(activeMs / 1000);
    },
    /** Starts a new item's clock; returns the seconds the previous one counted. */
    lap() {
      const seconds = this.activeSeconds();
      activeMs = 0;
      return seconds;
    }
  };
}
