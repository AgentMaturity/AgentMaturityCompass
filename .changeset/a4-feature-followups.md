---
"agent-maturity-compass": patch
---

A4 Forge comments now say where they came from. The signed `COMMENT` body records `via: "studio"` for a comment typed in the Studio console and `via: "mcp"` for one sent by the `amc_a4_comment` MCP tool; `GET /api/v1/a4/projects/:id/comments` answers `via` for each comment (`null` for comments recorded before this change) and the console marks MCP comments. The value is the sender's statement, not a check.
