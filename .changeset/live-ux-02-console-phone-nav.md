---
"agent-maturity-compass": patch
---

Compass Console: every page with a navigation menu now gets the phone menu button, the current page marked for screen readers (`aria-current`), and a status line that screen readers announce. Before, 13 pages that do not load the main console script (A4, operator inbox and plan, review packet, upgrade wizard, simulator, mechanic, equalizer and the four benchmark pages) showed no navigation at all on a phone. The "Unified Clarity loading…" placeholder is now hidden until the banner has real content, so it no longer stays on the login page and on pages that never load the banner; when the banner cannot load it shows its "Unavailable" message.
