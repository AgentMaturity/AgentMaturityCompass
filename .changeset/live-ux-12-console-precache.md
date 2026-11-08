---
"agent-maturity-compass": patch
---

Compass Console service worker: the precache list now carries the console's shared shell, the sign-in card and the round-2 modules (`focusableScroll.js`, `industryPackView.js`, `ops.js`, `components/claimBadge.js`), every precached path is checked to exist (one wrong path stops the service worker from installing), and the cache name moves to `amc-console-v13` so upgraded consoles drop the old entries. Assets are still fetched network-first; this is not an offline mode.
