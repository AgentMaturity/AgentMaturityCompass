---
"agent-maturity-compass": patch
---

Workspace mode (`/w/<id>/…`, which the desktop app uses) now forwards the query string of every API read; it was dropped, so Policy Packs answered `ACTION_RULE_MISSING` and filters were ignored. Files written with a restricted mode are created with that mode instead of being tightened after the write. A hook target is taken from the workspace's Studio state only when it is this machine (loopback host, valid port), and the `amc` menu shows that address before it adds a watch hook. From the `amc` menu, "Watch Claude Code" and "Watch Codex" now take three answers on a first run: the choice, the yes to adding the hook, and whether to start the agent.
