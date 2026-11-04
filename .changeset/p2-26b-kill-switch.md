---
"agent-maturity-compass": minor
---

A signed runtime kill switch (P2-26 slice B).

- `POST /api/v1/runtime/kill-switch` and `POST /api/v1/runtime/kill-switch/release` (OWNER) activate and release it; `GET /api/v1/runtime/kill-switch` shows it, and the Studio banner names an active switch. The issuer is the authenticated principal. Scopes are workspace, agent, tool class or provider; `stop_new_effects` keeps reads and model calls, `stop_all` refuses everything, gateway model calls included.
- Every protected effect checks it: the tool pipeline's authorization stage and P1-02's recheck (`kill_switch_active`, with a denial row or receipt), toolhub through the incident-freeze path, and the gateway before model calls (403, `KILL_SWITCH_DENIED`). A dispatched effect is not interrupted; the next one is refused.
- Records are signed, written as new files in `.amc/runtime/kill-switch/` and mirrored under the control checkpoint root outside the workspace, so existing workspace files can neither block activation nor lift a kill by deletion. An unverifiable record counts as an active stop_all and raises an alert. Release needs a signed OWNER release naming the kill's incident; break-glass never overrides a kill.
- `scripts/drills/kill-switch-drill.mjs` writes a signed `amc.drill/1` receipt and passes only with zero effects after activation; the runbook `docs/runbooks/kill-switch.md` gives the manual fallback, whose kind-cluster rehearsal is still pending.
