---
"agent-maturity-compass": patch
---

Extensibility security fixes from the harness-program review: a `.amc/hooks.json` acceptance now binds the digests of the workspace files its commands name and re-checks them before every run, refuses relative program paths and resolves bare program names on `PATH` only (never the working directory, never inside the workspace); a skill's `disallowed-tools` also withholds `delegate` and `workflow`, so a delegated child cannot hand the denied tool back; a project-scope MCP config's signature is verified over the bytes that were parsed and pinned, not a second read of the path.
