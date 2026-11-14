---
"agent-maturity-compass": patch
---

Update the MCP SDK's HTTP dependencies to hono 4.13.18 and @hono/node-server 2.1.8, which fix six moderate advisories (`pnpm audit --prod` is clean again). `npm run release:verify-version` takes `GITHUB_REF_NAME` as the release tag only on a tag build, so a branch build in CI no longer fails with a tag mismatch.
