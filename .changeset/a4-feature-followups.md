---
"agent-maturity-compass": patch
---

A4 Forge comments now say where they came from. The signed `COMMENT` body records `via: "studio"` for a comment typed in the Studio console and `via: "mcp"` for one sent by the `amc_a4_comment` MCP tool; `GET /api/v1/a4/projects/:id/comments` answers `via` for each comment (`null` for comments recorded before this change) and the console marks MCP comments. The value is the sender's statement, not a check.

`amc approvals login --a4-comment-only` mints a session credential with the signed scope `a4_comment`. Every session check refuses it except Studio's A4 reads and `POST /api/v1/a4/projects/:id/comments`, so it cannot decide an approval, reach another Studio route or be used with `--session-token-file`. The A4 MCP tools now require it: a full Studio session in `AMC_A4_SESSION_TOKEN_FILE` is refused with 403 `A4_SESSION_NOT_COMMENT_SCOPED`; log in again with `--a4-comment-only`.
