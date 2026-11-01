---
"agent-maturity-compass": patch
---

A4 Forge comments now say where they came from. The signed `COMMENT` body records `via: "studio"` for a comment typed in the Studio console and `via: "mcp"` for one sent by the `amc_a4_comment` MCP tool; `GET /api/v1/a4/projects/:id/comments` answers `via` for each comment (`null` for comments recorded before this change) and the console marks MCP comments. The value is the sender's statement, not a check.

`amc approvals login --a4-comment-only` mints a session credential with the signed scope `a4_comment`. Every session check refuses it except Studio's A4 reads and `POST /api/v1/a4/projects/:id/comments`, so it cannot decide an approval, reach another Studio route or be used with `--session-token-file`. The A4 MCP tools now require it: a full Studio session in `AMC_A4_SESSION_TOKEN_FILE` is refused with 403 `A4_SESSION_NOT_COMMENT_SCOPED`; log in again with `--a4-comment-only`.

An agent's Enforce resource manifest now records `.amc/fleet/typed-graphs/<agentId>/latest.json`, the newest typed multi-agent graph that names that agent on a node, instead of the fleet-wide `typed-graphs/latest.json`. Writing a graph (an A4 Aspire Build, `amc fleet graph write`, the fleet API) updates the file of each agent it names and still updates `latest.json` as the fleet's view, so another agent's manifest no longer reads as drifted. A graph that names no agent is no longer a resource of every agent's manifest.

The A4 Activate value view's ROI worksheet now evaluates the P3-20 formula, `V = (h_before − h_after) × r + n_prevented × c_finding − (p + i + m)`, over input ranges with their sources and reports V as a range, labelled self-reported. Activate answers only the cost cap (`budgetCostUsdPerDay` × 365, as `m`), so the worksheet stays `not_evaluated` and names each missing input (`ROI_INPUT_MISSING:<term>`); a missing input is never read as zero.
