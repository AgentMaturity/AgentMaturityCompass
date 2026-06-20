---
"agent-maturity-compass": patch
---

Ensure `npm test` builds the CLI before Vitest so clean CI checkouts can run CLI-focused tests that execute `dist/cli.js`.
