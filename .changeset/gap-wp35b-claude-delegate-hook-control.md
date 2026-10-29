---
"agent-maturity-compass": patch
---

A delegated Claude Code child's own tool calls are now governed by AMC's hook control (AXR-10). The claude-cli delegation runner refuses to spawn the child unless the workspace's signed Claude Code control hook is installed for the governing agent and its `hook:control` lease is admitted, and starts the child in the workspace so Claude Code loads that hook; each PreToolUse call is then decided by the Bridge's control route. Governing only the child's model route remains available as an explicit observe-only option.
