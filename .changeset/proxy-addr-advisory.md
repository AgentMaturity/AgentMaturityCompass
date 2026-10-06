---
"agent-maturity-compass": patch
---

Security: the bundled dependency `proxy-addr` (via `@modelcontextprotocol/sdk` and `express`) is pinned to 2.0.8, the patched release for critical advisory GHSA-jqcg-44mw-7w3h; `pnpm audit --prod` reports no known vulnerabilities.
