---
"agent-maturity-compass": patch
---

The Bridge hook control route accepts provider `dsh` for AMC's DeepSeek Harness plugin (P2-17). Each mapped DSH 0.2.1-rc.2 built-in has a fixed argument schema: `read`, `write`, `edit` and `web_fetch`, absolute paths resolved through symlinks, one canonical URL spelling. An extra or mistyped argument, a shell, search, PTC, subagent or MCP tool, or a relative path is not mapped, so it is denied. No DSH version is qualified, so control denies every DSH call; the response is signed and bound to the exact request.
