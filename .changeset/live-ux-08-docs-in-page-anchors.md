---
"agent-maturity-compass": patch
---

Docs site: an in-page link such as QUICKSTART's "step 2" or INSTALL's "Option B" now stays on the guide and moves to that section; before, the viewer took the anchor for a guide name and showed the welcome page. QUICKSTART's TypeScript SDK block now installs the tarball your source build wrote (`npm pack --ignore-scripts`) instead of `npm install agent-maturity-compass`, which installs the 1.1.1 release without the native SDK.
