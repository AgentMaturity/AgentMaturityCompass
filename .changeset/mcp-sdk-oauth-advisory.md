---
"agent-maturity-compass": patch
---

Security: the bundled `@modelcontextprotocol/sdk` moves from 1.30.0 to 1.32.1 (range `^1.31.0`), past high-severity advisory GHSA-6qxp-vccf-f47h (published 2026-10-06), under which the SDK's OAuth client could send credentials to an authorization server chosen by the MCP server. `pnpm audit --prod` reports no known vulnerabilities.
