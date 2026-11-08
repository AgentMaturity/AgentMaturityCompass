---
"agent-maturity-compass": minor
---

`amc tools list --schemas [--json] [--tool <name>]` (SH-TOOLS-06a) prints every native built-in tool's name, action class, description, JSON Schema and `schemaDigestSha256` (the digest `tool_search` hands the model), a `documentDigestSha256` over the listing, and which tools the current workspace's signed policy grants. Schemas are validated as JSON Schema at print time; an invalid one exits 1. No tool body runs; `delegate` and `workflow` are named as unavailable because they need a live composition.

freeze-exception: SH-TOOLS — `--schemas` is an option on the existing `amc tools list` path, added so operators and SDK users can read the published tool schemas without a session
