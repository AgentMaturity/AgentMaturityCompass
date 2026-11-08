---
"agent-maturity-compass": patch
---

docs/BUNDLES.md now says what a bundle's evidence slice holds (every row up to the newest row of each session the run touches, which can reach past the window, for example a running Studio's gateway session) and records the decision not to trim it further, with the reason: each extension is what verification needs.
