---
"agent-maturity-compass": patch
---

Native chat and the native SDK now accept several reviewed MCP configurations per session (`agent-loop chat --mcp-config` repeated with one `--mcp-config-sha256` each; `AMCNativeClient.start({ mcpConfig: [...], mcpConfigSha256: [...] })`). Each config goes through the same review as `agent-loop run` and ACP, each granted tool keeps its signed action class, and an unreviewed, tampered, duplicate or unpaired config is refused before any server starts. Chat's `/mcp` shows one receipt per mounted server and refuses a duplicate receipt for the same server.

Chat adds `/withdraw` (GAP-PXB-25): it lists the queued submissions in the current session that no turn has taken yet, and withdraws one through the inbox's signed one-element cancel row. A submission already dispatched to a turn is never reported as withdrawn. If that turn has a recorded ending, chat says the submission was dispatched; if not, chat says it is in flight or its outcome is TOOL_OUTCOME_UNKNOWN. The command is recorded in the signed operator audit log.
