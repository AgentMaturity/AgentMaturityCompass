---
"agent-maturity-compass": minor
---

MCP config scopes: one reviewed `NativeMcpConfiguration` file per server in the user scope (`<AMC home>/mcp/<id>.json`) or the project scope (`.amc/mcp/<id>.json`), selected by `--mcp <id>` on `agent-loop run`, `agent-loop chat` and `amc acp`, which resolves the id to the file and its sha256 pin and reviews it exactly like `--mcp-config`. An id in both scopes is refused until qualified as `project:<id>` or `user:<id>`; a project file needs a valid BUNDLE signature; a user file must be the operator's private file.

freeze-exception: SH-EXT — `amc mcp add|remove|list|get|sign` (5 command paths): the management surface for scoped MCP configs, which every comparable harness has and AMC lacked.
