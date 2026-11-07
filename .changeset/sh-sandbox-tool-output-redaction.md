---
"agent-maturity-compass": patch
---

Every native tool's output (shell, file reads, grep, job and terminal reads, MCP results) and every thrown tool error is passed through the shared secret redaction before the outcome exists: recognised keys and tokens become `[AMC_REDACTED:<type>]` in what the model, the signed session rows and evidence see, with a `TOOL_OUTPUT_REDACTED` audit row carrying counts by type. `fs.write` and `fs.edit` refuse content that carries a redaction placeholder, so a redacted read is never written back over the real value.
