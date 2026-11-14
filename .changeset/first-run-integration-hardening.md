---
"agent-maturity-compass": patch
---

Workspace mode (`/w/<id>/…`, which the desktop app uses) now forwards the query string of every API read; it was dropped, so Policy Packs answered `ACTION_RULE_MISSING` and filters were ignored. Files written with a restricted mode are created with that mode instead of being tightened after the write. A hook target is taken from the workspace's Studio state only when it is this machine (loopback host, valid port), and the `amc` menu shows that address before it adds a watch hook. From the `amc` menu, "Watch Claude Code" and "Watch Codex" now take three answers on a first run: the choice, the yes to adding the hook, and whether to start the agent.

AMC's default gateway and proxy ports are one set per machine, and `amc up` still refuses a busy one (a client that assumes the default would reach the other folder's gateway). The refusal now says another AMC folder may be running and how to stop it. From the `amc` menu, a second folder asks "Start AMC for this folder on its own ports?" and, on yes, starts with free ports set explicitly and names the gateway port. The menu starts AMC without the first-score printout.
