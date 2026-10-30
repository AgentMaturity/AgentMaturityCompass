---
"agent-maturity-compass": patch
---

Every reader of an agent's latest diagnostic run now looks where the runner writes runs. Eight readers looked only in `.amc/agents/<agent>/runs`, so for the default agent (whose runs are written to `.amc/runs`) they found no run: the audit binder said "No agent diagnostic runs were found.", the passport, the mechanic targets and plan execution, the L5 delta report, the public leaderboard export, Studio's agent status and the temporal-decay readout all treated the agent as never assessed. They now share one helper (`agentRunFiles` in `src/diagnostic/runReportResolution.ts`, resolved through `getAgentPaths`), so these surfaces show the default agent's recorded runs.
